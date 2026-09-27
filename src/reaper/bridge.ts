/**
 * Calls into the bridge ReaScript
 * (com.schapps.reaper.sdPlugin/scripts/REAPER Control - Stream Deck bridge.lua),
 * which does what the web interface itself can't - currently, inserting FX.
 * The round trip is one request: clear the result, write the request into
 * ExtState, run the script by its command ID, read the result back. REAPER
 * executes the tokens left to right and the script runs synchronously, so the
 * trailing GET sees the script's answer - verified live, see the FX insertion
 * addendum in docs/protocol-findings.md.
 */

import type { ReaperClient } from "./client.js";

export const BRIDGE_SECTION = "ReaperControl";

/** A request can block REAPER for seconds (a heavy FX chain), so this is far longer than a poll's timeout. */
export const BRIDGE_TIMEOUT_MS = 30_000;

const PENDING = "pending";

export type BridgeResult =
	| { status: "ok"; fields: string[] }
	| { status: "error"; message: string }
	/** The script has never been run by hand, so its command ID isn't known. */
	| { status: "notSetUp" }
	/** A command ID is registered but the script didn't run - removed from REAPER, or this is a different REAPER install. */
	| { status: "noResponse" };

/** The script's own `_RS…` ID, which it stores in persistent ExtState on its first manual run. */
export async function bridgeCommandId(client: ReaperClient): Promise<string | undefined> {
	const state = await client.query([{ type: "EXTSTATE", section: BRIDGE_SECTION, key: "commandId" }]);
	const id = state.extState?.[`${BRIDGE_SECTION}/commandId`]?.value ?? "";
	// It goes into the request path raw, so accept only a named command ID's shape.
	return /^_[A-Za-z0-9_]+$/.test(id) ? id : undefined;
}

export async function callBridge(client: ReaperClient, request: string): Promise<BridgeResult> {
	const commandId = await bridgeCommandId(client);
	if (!commandId) return { status: "notSetUp" };

	const state = await client.sendImmediate(
		[
			`SET/EXTSTATE/${BRIDGE_SECTION}/result/${PENDING}`,
			`SET/EXTSTATE/${BRIDGE_SECTION}/request/${encodeURIComponent(request)}`,
			commandId,
			`GET/EXTSTATE/${BRIDGE_SECTION}/result`,
		],
		BRIDGE_TIMEOUT_MS,
	);

	const raw = state.extState?.[`${BRIDGE_SECTION}/result`]?.value ?? PENDING;
	if (raw === PENDING) return { status: "noResponse" };
	const [status, ...fields] = raw.split("\t");
	if (status === "ok") return { status: "ok", fields };
	return { status: "error", message: fields.join(" ") || raw };
}

export type FxTarget = { kind: "selected" } | { kind: "master" } | { kind: "track"; number: number };
export type FxWindow = "none" | "floating" | "chain";

export function addFxRequest(fxId: string, target: FxTarget, window: FxWindow): string {
	const targetField = target.kind === "track" ? `track:${target.number}` : target.kind;
	const windowField = { none: "0", floating: "1", chain: "2" }[window];
	return ["addfx", targetField, windowField, fxId].join("\t");
}

/** REAPER's GetAppVersion() (e.g. "7.80/macOS-arm64") and GetResourcePath(), live from the running instance. */
export async function bridgeInfo(
	client: ReaperClient,
): Promise<{ status: "ok"; appVersion: string; resourcePath: string } | Exclude<BridgeResult, { status: "ok" }>> {
	const result = await callBridge(client, "info");
	if (result.status !== "ok") return result;
	const [appVersion = "", resourcePath = ""] = result.fields;
	return { status: "ok", appVersion, resourcePath };
}
