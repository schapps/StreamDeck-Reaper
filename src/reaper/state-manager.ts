/**
 * Owns all polling of REAPER state (spec section 8). Individual keys never
 * poll directly - they subscribe here on willAppear and unsubscribe on
 * willDisappear, and the manager computes the minimal query set from what's
 * actually visible.
 */

import type { QuerySpec, ReaperState } from "./types.js";

export type StateKind = "transport" | "track";
export type QueryFn = (queries: QuerySpec[]) => Promise<ReaperState>;

export interface StateManagerTiming {
	fastIntervalMs: number;
	idleIntervalMs: number;
	idleThresholdMs: number;
}

const DEFAULT_TIMING: StateManagerTiming = {
	fastIntervalMs: 200, // 5Hz
	idleIntervalMs: 1000, // 1Hz
	idleThresholdMs: 60_000,
};

interface Subscriber {
	kind: StateKind;
	callback: (state: ReaperState) => void;
}

/**
 * Deliberately takes its query function as a dependency rather than
 * importing connection-manager.ts directly - that module pulls in
 * @elgato/streamdeck and talks to a live SDK connection at import time,
 * which would make this class untestable in isolation. See
 * src/state.ts for the actual wiring used at runtime.
 */
export class StateManager {
	private readonly query: QueryFn;
	private readonly timing: StateManagerTiming;
	private subscribers = new Map<string, Subscriber>();
	private timer: ReturnType<typeof setInterval> | null = null;
	private scheduledIntervalMs = 0;
	private lastActivityAt = Date.now();
	private lastDeliveredState: ReaperState = {};
	private polling = false;

	constructor(query: QueryFn, timing: Partial<StateManagerTiming> = {}) {
		this.query = query;
		this.timing = { ...DEFAULT_TIMING, ...timing };
	}

	/** Registers a key's interest in a kind of state. Delivers the last known value immediately, if any, so a newly-appeared key isn't blank until the next poll. */
	subscribe(id: string, kind: StateKind, callback: (state: ReaperState) => void): void {
		this.subscribers.set(id, { kind, callback });
		this.notifyActivity();
		this.reschedule();

		const cached = this.sliceFor(kind, this.lastDeliveredState);
		if (cached.transport || cached.tracks) callback(cached);
	}

	unsubscribe(id: string): void {
		this.subscribers.delete(id);
		this.reschedule();
	}

	/** Call when a key is pressed (or anything else that should force 5Hz responsiveness), per spec's "return to 5Hz on any interaction." */
	notifyActivity(): void {
		this.lastActivityAt = Date.now();
		if (this.subscribers.size > 0) this.setInterval(this.timing.fastIntervalMs);
	}

	private reschedule(): void {
		if (this.subscribers.size === 0) {
			this.setInterval(0);
			return;
		}
		this.setInterval(this.desiredIntervalMs());
	}

	private desiredIntervalMs(): number {
		const idle = Date.now() - this.lastActivityAt > this.timing.idleThresholdMs;
		return idle ? this.timing.idleIntervalMs : this.timing.fastIntervalMs;
	}

	private setInterval(ms: number): void {
		if (ms === this.scheduledIntervalMs) return;
		if (this.timer !== null) {
			clearInterval(this.timer);
			this.timer = null;
		}
		this.scheduledIntervalMs = ms;
		if (ms > 0) {
			this.timer = setInterval(() => void this.tick(), ms);
		}
	}

	private async tick(): Promise<void> {
		if (this.polling) return; // don't overlap a slow request with the next tick
		this.polling = true;
		try {
			// Desired rate can change between ticks (idle threshold crossed) -
			// re-evaluate and reschedule before/after each poll.
			const queries = this.buildQuerySet();
			if (queries.length > 0) {
				const state = await this.query(queries);
				const changed = this.fanOut(state);
				if (changed) this.notifyActivity();
			}
		} catch {
			// Connection issues surface via ReaperClient's own statusChange event;
			// just skip this tick rather than throwing out of a timer callback.
		} finally {
			this.polling = false;
			this.reschedule();
		}
	}

	private buildQuerySet(): QuerySpec[] {
		const kinds = new Set<StateKind>();
		for (const sub of this.subscribers.values()) kinds.add(sub.kind);
		const queries: QuerySpec[] = [];
		if (kinds.has("transport")) queries.push({ type: "TRANSPORT" });
		if (kinds.has("track")) queries.push({ type: "TRACK" });
		return queries;
	}

	/** Delivers to subscribers only the kinds whose slice actually changed. Returns whether anything changed at all. */
	private fanOut(state: ReaperState): boolean {
		const transportChanged =
			state.transport !== undefined && !deepEqual(state.transport, this.lastDeliveredState.transport);
		const tracksChanged =
			state.tracks !== undefined && !deepEqual(state.tracks, this.lastDeliveredState.tracks);

		this.lastDeliveredState = { ...this.lastDeliveredState, ...state };

		for (const sub of this.subscribers.values()) {
			if (sub.kind === "transport" && transportChanged) {
				sub.callback({ transport: state.transport });
			} else if (sub.kind === "track" && tracksChanged) {
				sub.callback({ tracks: state.tracks });
			}
		}

		return transportChanged || tracksChanged;
	}

	private sliceFor(kind: StateKind, state: ReaperState): ReaperState {
		if (kind === "transport") return state.transport ? { transport: state.transport } : {};
		return state.tracks ? { tracks: state.tracks } : {};
	}
}

function deepEqual(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}
