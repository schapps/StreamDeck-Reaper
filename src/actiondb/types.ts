import type { JsonObject } from "@elgato/utils";

export interface ActionEntry extends JsonObject {
	/** Numeric (e.g. "40044") or named (e.g. "_SWS_ABOUT") REAPER command ID. */
	id: string;
	name: string;
	section: "main";
	tags: string[];
	/** Present only on entries merged in from a user's imported action list (spec section 7.2). */
	imported?: boolean;
}

export interface ActionDatabase {
	reaperVersion: string;
	generated: string;
	actions: ActionEntry[];
}
