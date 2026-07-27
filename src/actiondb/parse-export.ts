import type { ActionEntry } from "./types.js";

/**
 * Parses REAPER's action-list export format: tab-delimited
 * "Section\tId\tAction", one header row ("Section\tId\tAction") followed by
 * one row per action. Verified against a real export from REAPER 7.77 (SWS
 * action "SWS/S&M: Dump action list (all actions)", command ID
 * `_S&M_DUMP_ALL_ACTION_LIST`) - see tools/ActionList.txt and
 * docs/protocol-findings.md.
 *
 * Only Main-section rows are kept: the web interface's /_/ endpoint can
 * only address Main (see docs/protocol-findings.md on section targeting),
 * so anything else in the export could never actually be triggered by this
 * plugin - keeping them would just clutter the action browser with entries
 * that silently do nothing when pressed.
 *
 * Shared between tools/build-action-db.ts (the bundled native database,
 * built at dev time with curated tags) and the plugin's runtime action
 * import feature (spec section 7.2, user-supplied, no curated tags) so
 * both stay behind one tested parser rather than two copies that could
 * drift apart.
 */
export function parseActionListExport(raw: string, tagsById: Record<string, string[]> = {}): ActionEntry[] {
	const lines = raw.split("\n").filter((l) => l.trim() !== "");
	const [header, ...rows] = lines;
	if (header?.trim() !== "Section\tId\tAction") {
		throw new Error(
			`Unrecognized header "${header ?? ""}" - expected a REAPER action-list export ("Section\\tId\\tAction").`,
		);
	}

	const actions: ActionEntry[] = [];
	for (const line of rows) {
		const [section, id, name] = line.split("\t");
		if (section !== "Main" || !id || !name) continue;
		actions.push({
			id,
			name,
			section: "main",
			tags: tagsById[id] ?? [],
		});
	}
	return actions;
}
