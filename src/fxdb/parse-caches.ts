/**
 * Parsers for REAPER's on-disk plugin caches in its resource folder. Formats
 * and the TrackFX_AddByName name forms each entry maps to were verified
 * against a real REAPER 7.80 install - see the FX insertion addendum in
 * docs/protocol-findings.md. Like the web-interface parsers, these read
 * positionally and skip anything they don't recognize rather than assume a
 * line shape is exhaustive.
 */

import type { FxEntry, FxKind } from "./types.js";

export type FxPlatform = "mac" | "win";

const VST_INSTRUMENT_SUFFIX = "!!!VSTi";

/**
 * reaper-vstplugins*.ini: `[vstcache]` lines of `file=stamp,uid,Name (Vendor)`,
 * with `!!!VSTi` appended for instruments. Shell bundles appear once as
 * `<SHELL>` plus one `file<subId=...` line per sub-plugin. A resource folder shared
 * between Mac and Windows mixes both platforms' files in one cache, so only
 * the running platform's extensions are kept.
 */
export function parseVstCache(text: string, platform: FxPlatform): FxEntry[] {
	const entries: FxEntry[] = [];
	for (const [key, value] of sectionLines(text, "vstcache")) {
		const parts = value.split(",");
		if (parts.length < 3) continue;
		let name = parts.slice(2).join(",").trim();
		if (!name || name === "<SHELL>") continue;

		const kind = vstKind(key, platform);
		if (!kind) continue;

		const instrument = name.endsWith(VST_INSTRUMENT_SUFFIX);
		if (instrument) name = name.slice(0, -VST_INSTRUMENT_SUFFIX.length).trim();

		// "VST:" resolves to the VST3 when both formats are installed, so VST2
		// entries are pinned with "VST2:" - verified live.
		const prefix = kind === "VST3" ? "VST3" : "VST2";
		entries.push({
			id: `${prefix}: ${name}`,
			name: `${kind}${instrument ? "i" : ""}: ${name}`,
			kind,
			instrument,
			tags: instrument ? ["instrument"] : [],
		});
	}
	return entries;
}

function vstKind(key: string, platform: FxPlatform): FxKind | undefined {
	// Shell sub-plugins are keyed "Bundle.vst3<subId".
	const lower = key.replace(/<.*$/, "").toLowerCase();
	if (lower.endsWith(".vst3")) return "VST3";
	if (platform === "mac" && (lower.endsWith(".vst") || lower.endsWith(".dylib"))) return "VST";
	if (platform === "win" && lower.endsWith(".dll")) return "VST";
	return undefined;
}

/** reaper-auplugins*.ini (not the *-bc.ini files): `[auplugins]` lines of `Vendor: Name=<inst>` or `=<!inst>`. */
export function parseAuCache(text: string): FxEntry[] {
	const entries: FxEntry[] = [];
	for (const [key, value] of sectionLines(text, "auplugins")) {
		if (value !== "<inst>" && value !== "<!inst>") continue;
		const instrument = value === "<inst>";
		const prefix = instrument ? "AUi" : "AU";

		// The cache key ("Vendor: Name") is the form TrackFX_AddByName resolves;
		// REAPER itself displays it as "Name (Vendor)".
		const sep = key.indexOf(": ");
		const display = sep === -1 ? key : `${key.slice(sep + 2)} (${key.slice(0, sep)})`;
		entries.push({
			id: `${prefix}: ${key}`,
			name: `${prefix}: ${display}`,
			kind: "AU",
			instrument,
			tags: instrument ? ["instrument"] : [],
		});
	}
	return entries;
}

/** reaper-clap-*.ini: one `[file.clap]` section per bundle, lines of `plugin.id=flags|Name (Vendor)` (flags bit 1 = instrument), plus a `_=` timestamp line. */
export function parseClapCache(text: string): FxEntry[] {
	const entries: FxEntry[] = [];
	for (const line of text.split(/\r?\n/)) {
		const eq = line.indexOf("=");
		if (eq <= 0 || line.startsWith("[") || line.startsWith("_=")) continue;
		const value = line.slice(eq + 1);
		const bar = value.indexOf("|");
		if (bar === -1) continue;
		const flags = Number(value.slice(0, bar));
		const name = value.slice(bar + 1).trim();
		if (!name || Number.isNaN(flags)) continue;

		const instrument = (flags & 1) === 1;
		entries.push({
			id: `CLAP: ${name}`,
			name: `CLAP${instrument ? "i" : ""}: ${name}`,
			kind: "CLAP",
			instrument,
			tags: instrument ? ["instrument"] : [],
		});
	}
	return entries;
}

/**
 * reaper-jsfx.ini: `NAME <path> "JS: description"` per effect, plus optional
 * `TAGS <path> "space separated tags"`. Paths are quoted only when they
 * contain spaces. Inserted by path ("JS: <path>"), which stays unambiguous
 * when two effects share a description.
 */
export function parseJsfxCache(text: string): FxEntry[] {
	const names = new Map<string, string>();
	const tags = new Map<string, string[]>();
	for (const line of text.split(/\r?\n/)) {
		const tokens = tokenize(line);
		const [verb, path, arg] = tokens;
		if (!path || arg === undefined) continue;
		if (verb === "NAME") names.set(path, arg);
		else if (verb === "TAGS") tags.set(path, arg.split(/\s+/).filter(Boolean));
	}

	const entries: FxEntry[] = [];
	for (const [path, description] of names) {
		entries.push({
			id: `JS: ${path}`,
			name: description.startsWith("JS:") ? description : `JS: ${description}`,
			kind: "JS",
			instrument: false,
			tags: tags.get(path) ?? [],
		});
	}
	return entries;
}

/** `relativePath` is relative to FXChains/, which is exactly the form TrackFX_AddByName accepts - verified live with a subfolder chain. */
export function chainEntry(relativePath: string): FxEntry {
	const display = relativePath.replace(/\\/g, "/").replace(/\.rfxchain$/i, "");
	return {
		id: relativePath,
		name: `Chain: ${display}`,
		kind: "Chain",
		instrument: false,
		tags: ["chain"],
	};
}

/** `key=value` pairs from one `[section]` of an ini file, in order, duplicate keys kept. */
function sectionLines(text: string, section: string): Array<[string, string]> {
	const out: Array<[string, string]> = [];
	let inSection = false;
	for (const line of text.split(/\r?\n/)) {
		if (line.startsWith("[")) {
			inSection = line.trim().toLowerCase() === `[${section}]`;
			continue;
		}
		if (!inSection) continue;
		const eq = line.indexOf("=");
		if (eq <= 0) continue;
		out.push([line.slice(0, eq), line.slice(eq + 1)]);
	}
	return out;
}

/** Whitespace-separated tokens, where a double-quoted token may contain spaces. */
function tokenize(line: string): string[] {
	const tokens: string[] = [];
	const re = /"([^"]*)"|(\S+)/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(line)) !== null) tokens.push(m[1] ?? m[2] ?? "");
	return tokens;
}
