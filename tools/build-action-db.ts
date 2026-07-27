/**
 * Converts REAPER's own action-list export (ActionList.txt, tab-delimited
 * "Section\tId\tAction", dumped via an SWS action against a real REAPER
 * 7.77 instance) into the plugin's bundled data/actions-native.json.
 *
 * Run: npm run build:actions
 *
 * Only the Main section is included - the web interface's /_/ endpoint
 * can only address Main (see docs/protocol-findings.md), so anything else
 * in the raw export can't actually be triggered by this plugin anyway.
 *
 * Commit both the raw export (tools/ActionList.txt) and the generated JSON
 * so regeneration is reproducible against a future REAPER version: re-dump
 * ActionList.txt from the new version and rerun this script.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseActionListExport } from "../src/actiondb/parse-export.js";
import type { ActionDatabase } from "../src/actiondb/types.js";
import { CURATED_TAGS } from "./curated-tags.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REAPER_VERSION = "7.77";
const INPUT_PATH = path.join(__dirname, "ActionList.txt");
const OUTPUT_PATH = path.join(
	__dirname,
	"..",
	"com.stephenschappler.reaper.sdPlugin",
	"data",
	"actions-native.json",
);

function main(): void {
	const raw = readFileSync(INPUT_PATH, "utf-8");
	const actions = parseActionListExport(raw, CURATED_TAGS);

	const db: ActionDatabase = {
		reaperVersion: REAPER_VERSION,
		generated: new Date().toISOString().slice(0, 10),
		actions,
	};

	writeFileSync(OUTPUT_PATH, JSON.stringify(db, null, "\t") + "\n");

	const tagged = actions.filter((a) => a.tags.length > 0).length;
	console.log(`Wrote ${actions.length} Main-section actions (${tagged} tagged) to ${OUTPUT_PATH}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
