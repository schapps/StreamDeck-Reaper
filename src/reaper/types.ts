/**
 * Shared types for the REAPER web-interface client and parsers.
 * Field layouts are documented in docs/protocol-findings.md and verified
 * against tests/fixtures/.
 */

export interface TransportState {
	/** 0 stopped, 1 playing, 2 paused, 5 recording, 6 record-paused. */
	playState: number;
	positionSeconds: number;
	repeatOn: boolean;
	positionString: string;
	positionStringBeats: string;
}

export interface TrackState {
	/** 0 = master, 1+ = user tracks. */
	index: number;
	name: string;
	flags: number;
	volume: number;
	pan: number;
	lastMeterPeak: number;
	lastMeterPos: number;
	widthOrPan2: number;
	panMode: number;
	sendCount: number;
	recvCount: number;
	hwOutCount: number;
	/** Decimal 0xAARRGGBB. Not stable across record-arm cycles - do not use as an identity key. */
	color: number;
}

/** Bitmask values for TrackState.flags. Mask only known bits - REAPER adds undocumented ones (bit 512 observed). */
export const TrackFlag = {
	Folder: 1,
	Selected: 2,
	HasFx: 4,
	Muted: 8,
	Soloed: 16,
	SoloInPlace: 32,
	RecordArmed: 64,
	RecordMonitoringOn: 128,
	RecordMonitoringAuto: 256,
} as const;

/** CMDSTATE reply for GET/<command_id>. state: >0 on, 0 off, -1 no toggle state. */
export interface CommandState {
	commandId: string;
	state: number;
}

export interface ExtState {
	section: string;
	key: string;
	value: string;
}

export type QuerySpec =
	| { type: "TRANSPORT" }
	| { type: "NTRACK" }
	| { type: "TRACK"; index?: number }
	| { type: "CMDSTATE"; commandId: string }
	| { type: "EXTSTATE"; section: string; key: string };

export interface ReaperState {
	transport?: TransportState;
	ntrack?: number;
	tracks?: TrackState[];
	/** Keyed by the commandId that was queried. */
	cmdState?: Record<string, CommandState>;
	/** Keyed by "section/key". */
	extState?: Record<string, ExtState>;
}

export interface CommandResponse {
	ok: boolean;
	error?: string;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "degraded";

export type ConnectionResultStatus = "success" | "refused" | "timeout" | "auth" | "unexpected";

export interface ConnectionResult {
	status: ConnectionResultStatus;
	message: string;
}

export interface ReaperClientOptions {
	host: string;
	port: number;
	username?: string;
	password?: string;
	timeoutMs: number;
}
