/**
 * Reads/writes the user's imported action list (spec section 7.2) as a
 * JSON file in the plugin's own data directory, alongside the bundled
 * data/actions-native.json - not in Stream Deck global settings. A full
 * action-list export runs to several thousand rows (comparable in size to
 * the bundled native database, ~1.2MB as JSON); global settings round-trip
 * over the local WebSocket connection on every read/write, including ones
 * unrelated to the action list (e.g. any other setting changing), so
 * shipping that much data through there on every such round trip is a real
 * cost regardless of whether Stream Deck technically allows it. Spec
 * explicitly permits this fallback: "If it does [exceed practical limits],
 * store the database in the plugin's own data directory on disk and keep
 * only a path reference in settings" - here that "reference" is just
 * "does the file exist", not even a settings field.
 */

import type { JsonObject } from "@elgato/utils";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseActionListExport } from "./parse-export.js";
import type { ActionDatabase } from "./types.js";

export interface ImportSummary extends JsonObject {
	count: number;
	/** Named (underscore-prefixed) IDs - SWS actions and ReaPack/custom scripts. */
	scriptCount: number;
}

function defaultDataDir(): string {
	return path.join(process.cwd(), "data");
}

function filePath(dataDir: string): string {
	return path.join(dataDir, "actions-imported.json");
}

function summarize(actions: ActionDatabase["actions"]): ImportSummary {
	return {
		count: actions.length,
		scriptCount: actions.filter((a) => a.id.startsWith("_")).length,
	};
}

/** Parses and persists a raw action-list export. Throws if the format isn't recognized (see parseActionListExport). */
export function importActionList(raw: string, dataDir: string = defaultDataDir()): ImportSummary {
	const actions = parseActionListExport(raw);
	const db: ActionDatabase = {
		reaperVersion: "unknown", // not present in the export itself
		generated: new Date().toISOString().slice(0, 10),
		actions,
	};
	writeFileSync(filePath(dataDir), JSON.stringify(db));
	return summarize(actions);
}

export function clearImportedActions(dataDir: string = defaultDataDir()): void {
	const p = filePath(dataDir);
	if (existsSync(p)) unlinkSync(p);
}

/** Null if nothing has been imported (or it was cleared). */
export function importedActionsSummary(dataDir: string = defaultDataDir()): ImportSummary | null {
	const p = filePath(dataDir);
	if (!existsSync(p)) return null;
	const db = JSON.parse(readFileSync(p, "utf-8")) as ActionDatabase;
	return summarize(db.actions);
}
