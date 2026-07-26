/**
 * Parsers for REAPER's web-interface wire format.
 *
 * Field layouts are taken from REAPER's own reaper_www_root/main.js
 * (a copy lives at tests/fixtures/reaper-main.js.reference) and verified
 * live - see docs/protocol-findings.md. Responses are lines separated by
 * "\n", each line tab-separated tokens. REAPER may append undocumented
 * trailing fields/bits in future versions, so every parser here reads
 * positionally from the left and ignores anything past what it knows
 * about - never assume a field count or bitmask is exhaustive.
 */

import type { CommandState, ExtState, QuerySpec, ReaperState, TrackState, TransportState } from "./types.js";

/** Converts a QuerySpec into the literal command token sent to REAPER. */
export function serializeQuery(query: QuerySpec): string {
	switch (query.type) {
		case "TRANSPORT":
			return "TRANSPORT";
		case "NTRACK":
			return "NTRACK";
		case "TRACK":
			return query.index === undefined ? "TRACK" : `TRACK/${query.index}`;
		case "CMDSTATE":
			return `GET/${query.commandId}`;
		case "EXTSTATE":
			return `GET/EXTSTATE/${query.section}/${query.key}`;
	}
}

/** Reverses the \t \n \\ escaping REAPER applies to free-text string fields (EXTSTATE, PROJEXTSTATE, LYRICS, ...). */
export function unescapeString(value: string): string {
	return value.replace(/\\t/g, "\t").replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
}

function toNumber(value: string | undefined, fallback = 0): number {
	if (value === undefined || value === "") return fallback;
	const n = Number(value);
	return Number.isNaN(n) ? fallback : n;
}

export function parseTransportLine(tokens: string[]): TransportState | undefined {
	// TRANSPORT \t playstate \t position_seconds \t isRepeatOn \t position_string \t position_string_beats
	if (tokens.length < 2) return undefined;
	return {
		playState: toNumber(tokens[1]),
		positionSeconds: toNumber(tokens[2]),
		repeatOn: toNumber(tokens[3]) > 0,
		positionString: tokens[4] ?? "",
		positionStringBeats: tokens[5] ?? "",
	};
}

export function parseNTrackLine(tokens: string[]): number | undefined {
	// NTRACK \t count
	if (tokens.length < 2) return undefined;
	return toNumber(tokens[1]);
}

export function parseTrackLine(tokens: string[]): TrackState | undefined {
	// TRACK \t idx \t name \t flags \t vol \t pan \t last_meter_peak \t last_meter_pos \t width/pan2 \t panmode \t sendcnt \t recvcnt \t hwoutcnt \t color
	if (tokens.length < 2) return undefined;
	return {
		index: toNumber(tokens[1]),
		name: tokens[2] ?? "",
		flags: toNumber(tokens[3]),
		volume: toNumber(tokens[4], 1),
		pan: toNumber(tokens[5]),
		lastMeterPeak: toNumber(tokens[6]),
		lastMeterPos: toNumber(tokens[7]),
		widthOrPan2: toNumber(tokens[8], 1),
		panMode: toNumber(tokens[9]),
		sendCount: toNumber(tokens[10]),
		recvCount: toNumber(tokens[11]),
		hwOutCount: toNumber(tokens[12]),
		color: toNumber(tokens[13]),
	};
}

export function parseCmdStateLine(tokens: string[]): CommandState | undefined {
	// CMDSTATE \t command_id \t state
	if (tokens.length < 3) return undefined;
	return {
		commandId: tokens[1] ?? "",
		state: toNumber(tokens[2], -1),
	};
}

export function parseExtStateLine(tokens: string[]): ExtState | undefined {
	// EXTSTATE \t section \t key \t value
	if (tokens.length < 3) return undefined;
	return {
		section: tokens[1] ?? "",
		key: tokens[2] ?? "",
		value: unescapeString(tokens[3] ?? ""),
	};
}

/**
 * Parses a raw batched response body into a ReaperState, accumulating
 * repeated lines (e.g. multiple TRACK lines) as appropriate. Unrecognized
 * leading tags are silently skipped rather than throwing, since a batch
 * may contain commands (bare action IDs) that produce no reply line at all.
 */
export function parseResponseBody(body: string): ReaperState {
	const state: ReaperState = {};
	if (body === "") return state;

	for (const line of body.split("\n")) {
		if (line === "") continue;
		const tokens = line.split("\t");
		switch (tokens[0]) {
			case "TRANSPORT": {
				const t = parseTransportLine(tokens);
				if (t) state.transport = t;
				break;
			}
			case "NTRACK": {
				const n = parseNTrackLine(tokens);
				if (n !== undefined) state.ntrack = n;
				break;
			}
			case "TRACK": {
				const track = parseTrackLine(tokens);
				if (track) {
					state.tracks ??= [];
					state.tracks.push(track);
				}
				break;
			}
			case "CMDSTATE": {
				const c = parseCmdStateLine(tokens);
				if (c) {
					state.cmdState ??= {};
					state.cmdState[c.commandId] = c;
				}
				break;
			}
			case "EXTSTATE": {
				const e = parseExtStateLine(tokens);
				if (e) {
					state.extState ??= {};
					state.extState[`${e.section}/${e.key}`] = e;
				}
				break;
			}
			default:
				// Unrecognized tag (e.g. SEND, MARKER, REGION, LYRICS - not yet
				// consumed by this plugin) or a blank reply for a fired action.
				break;
		}
	}

	return state;
}
