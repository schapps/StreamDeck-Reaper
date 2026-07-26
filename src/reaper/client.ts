/**
 * HTTP client for REAPER's built-in web interface. Fully decoupled from
 * Stream Deck - talks only fetch + the wire format documented in
 * docs/protocol-findings.md. See tests/reaper/client.test.ts for behavior
 * verified against a local mock server.
 */

import { EventEmitter } from "node:events";
import { parseResponseBody, serializeQuery } from "./parsers.js";
import type {
	CommandResponse,
	ConnectionResult,
	ConnectionStatus,
	QuerySpec,
	ReaperClientOptions,
	ReaperState,
} from "./types.js";

const BATCH_WINDOW_MS = 16;
const BACKOFF_SCHEDULE_MS = [1000, 2000, 5000, 10000, 15000];

interface PendingCommandCall {
	commands: string[];
	resolve: (r: CommandResponse) => void;
	reject: (e: Error) => void;
}

interface PendingQueryEntry {
	spec: QuerySpec;
	waiters: Array<{ resolve: (s: ReaperState) => void; reject: (e: Error) => void }>;
}

export class ReaperClient extends EventEmitter {
	private readonly options: ReaperClientOptions;

	private pendingCommandCalls: PendingCommandCall[] = [];
	/** Keyed by serialized query string - collapses identical queries scheduled in the same window. */
	private pendingQueries = new Map<string, PendingQueryEntry>();
	private flushTimer: ReturnType<typeof setTimeout> | null = null;

	private _status: ConnectionStatus = "disconnected";
	private backoffIndex = 0;
	private consecutiveFailures = 0;
	private lastAttemptAt = 0;

	constructor(options: ReaperClientOptions) {
		super();
		this.options = options;
	}

	get status(): ConnectionStatus {
		return this._status;
	}

	override on(event: "statusChange", handler: (status: ConnectionStatus) => void): this;
	override on(event: "state", handler: (state: ReaperState) => void): this;
	override on(event: string, handler: (...args: never[]) => void): this {
		return super.on(event, handler as (...args: unknown[]) => void);
	}

	/** Sends action IDs (numeric or named). No per-command acknowledgement exists in the protocol - resolves ok:true once the batch request itself succeeds. */
	runCommands(commands: string[]): Promise<CommandResponse> {
		if (commands.length === 0) return Promise.resolve({ ok: true });
		return new Promise<CommandResponse>((resolve, reject) => {
			this.pendingCommandCalls.push({ commands, resolve, reject });
			this.scheduleFlush();
		});
	}

	/** Requests state. Identical QuerySpecs scheduled in the same window share a single network round trip. */
	query(queries: QuerySpec[]): Promise<ReaperState> {
		if (queries.length === 0) return Promise.resolve({});
		return new Promise<ReaperState>((resolve, reject) => {
			const merged: ReaperState = {};
			let remaining = queries.length;
			let failed = false;

			const onPart = (spec: QuerySpec, part: ReaperState) => {
				mergeState(merged, spec, part);
				if (--remaining === 0 && !failed) resolve(merged);
			};
			const onError = (e: Error) => {
				if (!failed) {
					failed = true;
					reject(e);
				}
			};

			for (const spec of queries) {
				const key = serializeQuery(spec);
				let entry = this.pendingQueries.get(key);
				if (!entry) {
					entry = { spec, waiters: [] };
					this.pendingQueries.set(key, entry);
				}
				entry.waiters.push({
					resolve: (full) => onPart(spec, full),
					reject: onError,
				});
			}
			this.scheduleFlush();
		});
	}

	/**
	 * One-shot, immediate connectivity probe - bypasses the batch window and
	 * the reconnection backoff gate, since it's an explicit user action (the
	 * PI's "Test Connection" button), not automatic polling.
	 */
	async testConnection(): Promise<ConnectionResult> {
		try {
			const res = await this.doFetch("TRANSPORT");
			if (res.status === 401) {
				this.handleRequestResult(false);
				return {
					status: "auth",
					message: "REAPER's web interface requires a username and password.",
				};
			}
			const server = res.headers.get("Server") ?? "";
			if (!server.startsWith("reaper_csurf_www")) {
				this.handleRequestResult(false);
				return {
					status: "unexpected",
					message: "Something answered on this port, but it isn't REAPER.",
				};
			}
			this.handleRequestResult(true);
			return { status: "success", message: "Connected to REAPER." };
		} catch (e) {
			this.handleRequestResult(false);
			if (isAbortError(e)) {
				return {
					status: "timeout",
					message: "REAPER is reachable but not responding.",
				};
			}
			return {
				status: "refused",
				message: "Couldn't reach REAPER. Is REAPER running, and is the web interface enabled?",
			};
		}
	}

	private scheduleFlush(): void {
		if (this.flushTimer !== null) return;
		this.flushTimer = setTimeout(() => {
			this.flushTimer = null;
			void this.flush();
		}, BATCH_WINDOW_MS);
	}

	private async flush(): Promise<void> {
		const commandCalls = this.pendingCommandCalls;
		const queries = this.pendingQueries;
		this.pendingCommandCalls = [];
		this.pendingQueries = new Map();

		const commandTokens = commandCalls.flatMap((c) => c.commands);
		const queryTokens = [...queries.keys()];
		const allTokens = [...commandTokens, ...queryTokens];
		if (allTokens.length === 0) return;

		// Backoff gate: while disconnected, don't hammer the port faster than the schedule allows.
		if (this._status === "disconnected") {
			const delay = BACKOFF_SCHEDULE_MS[Math.min(this.backoffIndex, BACKOFF_SCHEDULE_MS.length - 1)];
			if (Date.now() - this.lastAttemptAt < delay) {
				const err = new Error("REAPER connection is backing off after repeated failures.");
				for (const call of commandCalls) call.reject(err);
				for (const entry of queries.values()) for (const w of entry.waiters) w.reject(err);
				return;
			}
			this.setStatus("connecting");
		}

		this.lastAttemptAt = Date.now();

		try {
			const res = await this.doFetch(allTokens.join(";"));
			if (res.status === 401) {
				const err = new Error("REAPER web interface authentication failed.");
				for (const call of commandCalls) call.reject(err);
				for (const entry of queries.values()) for (const w of entry.waiters) w.reject(err);
				this.handleRequestResult(false);
				return;
			}

			const body = await res.text();
			const full = parseResponseBody(body);

			for (const call of commandCalls) call.resolve({ ok: true });
			for (const entry of queries.values()) {
				for (const w of entry.waiters) w.resolve(full);
			}
			this.handleRequestResult(true);
			this.emit("state", full);
		} catch (e) {
			const err = e instanceof Error ? e : new Error(String(e));
			// Ordering guarantee: a failed batch is reported as a failure, never
			// silently retried - a double-fired action is worse than a missed one.
			for (const call of commandCalls) call.reject(err);
			for (const entry of queries.values()) for (const w of entry.waiters) w.reject(err);
			this.handleRequestResult(false);
		}
	}

	private async doFetch(commandString: string): Promise<Response> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
		try {
			const headers: Record<string, string> = {};
			if (this.options.username || this.options.password) {
				const cred = Buffer.from(`${this.options.username ?? ""}:${this.options.password ?? ""}`).toString(
					"base64",
				);
				headers.Authorization = `Basic ${cred}`;
			}
			return await fetch(`http://${this.options.host}:${this.options.port}/_/${commandString}`, {
				signal: controller.signal,
				headers,
			});
		} finally {
			clearTimeout(timer);
		}
	}

	private handleRequestResult(success: boolean): void {
		const previousStatus = this._status;
		if (success) {
			this.consecutiveFailures = 0;
			this.backoffIndex = 0;
			this.setStatus("connected");
			return;
		}

		this.consecutiveFailures += 1;
		if (previousStatus === "connected" && this.consecutiveFailures === 1) {
			// First failure after a healthy connection - degraded, not dropped yet.
			this.setStatus("degraded");
			return;
		}

		// Either the second consecutive failure (degraded -> disconnected) or a
		// failed retry while already disconnected. Either way, recompute the
		// backoff index from the total failure streak so the delay before the
		// *next* attempt follows 1s, 2s, 5s, 10s, then 15s repeating - not
		// "one step further than intended" from double-counting the failure
		// that caused this transition.
		this.setStatus("disconnected");
		this.backoffIndex = Math.max(
			0,
			Math.min(this.consecutiveFailures - 2, BACKOFF_SCHEDULE_MS.length - 1),
		);
	}

	private setStatus(status: ConnectionStatus): void {
		if (this._status === status) return;
		this._status = status;
		this.emit("statusChange", status);
	}
}

function mergeState(target: ReaperState, spec: QuerySpec, full: ReaperState): void {
	switch (spec.type) {
		case "TRANSPORT":
			target.transport = full.transport;
			break;
		case "NTRACK":
			target.ntrack = full.ntrack;
			break;
		case "TRACK":
			target.tracks =
				spec.index === undefined ? full.tracks : full.tracks?.filter((t) => t.index === spec.index);
			break;
		case "CMDSTATE": {
			const c = full.cmdState?.[spec.commandId];
			if (c) {
				target.cmdState ??= {};
				target.cmdState[spec.commandId] = c;
			}
			break;
		}
		case "EXTSTATE": {
			const key = `${spec.section}/${spec.key}`;
			const e = full.extState?.[key];
			if (e) {
				target.extState ??= {};
				target.extState[key] = e;
			}
			break;
		}
	}
}

function isAbortError(e: unknown): boolean {
	return e instanceof Error && e.name === "AbortError";
}
