import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	chainEntry,
	parseAuCache,
	parseClapCache,
	parseJsfxCache,
	parseVstCache,
} from "../../src/fxdb/parse-caches.js";

// Excerpts copied verbatim from a real REAPER 7.80/macOS-arm64 resource
// folder. Every `id` asserted below was confirmed live to resolve through
// TrackFX_AddByName - see the FX insertion addendum in docs/protocol-findings.md.
const fixture = (name: string) => readFileSync(path.join(__dirname, "../fixtures/fx", name), "utf8");

describe("parseVstCache", () => {
	const mac = parseVstCache(fixture("vstplugins.ini"), "mac");
	const byName = (name: string) => mac.find((e) => e.name === name);

	it("pins VST2 with the VST2: prefix, since VST: resolves to the VST3 when both exist", () => {
		expect(byName("VST: Brusfri (Klevgrand)")?.id).toBe("VST2: Brusfri (Klevgrand)");
		expect(byName("VST3: Brusfri (Klevgrand)")?.id).toBe("VST3: Brusfri (Klevgrand)");
	});

	it("strips the !!!VSTi marker and flags instruments", () => {
		const drums = byName("VSTi: ReaSynDr (Cockos) (4 out)");
		expect(drums).toMatchObject({ id: "VST2: ReaSynDr (Cockos) (4 out)", kind: "VST", instrument: true });
	});

	it("lists shell sub-plugins but not the <SHELL> placeholder itself", () => {
		expect(byName("VST3: Serum 2 FX (Xfer Records)")?.id).toBe("VST3: Serum 2 FX (Xfer Records)");
		expect(byName("VST3i: Serum 2 (Xfer Records)")?.instrument).toBe(true);
		expect(mac.some((e) => e.name.includes("<SHELL>"))).toBe(false);
	});

	it("skips unscanned entries and other sections", () => {
		expect(mac.some((e) => e.name.includes("Invigorate"))).toBe(false);
		expect(mac.some((e) => e.name.includes("Timeless"))).toBe(false);
	});

	it("keeps only the running platform's files from a Mac/Windows shared cache", () => {
		expect(mac.some((e) => e.name.includes("ReaComp"))).toBe(false); // reacomp.dll
		const win = parseVstCache(fixture("vstplugins.ini"), "win");
		expect(win.map((e) => e.name).sort()).toEqual([
			"VST3: Brusfri (Klevgrand)",
			"VST3: Serum 2 FX (Xfer Records)",
			"VST3i: Serum 2 (Xfer Records)",
			"VST: FabFilter Pro-C 2 (FabFilter)",
			"VST: ReaComp (Cockos)",
		]);
	});
});

describe("parseAuCache", () => {
	it("inserts by the Vendor: Name cache key but displays REAPER-style", () => {
		expect(parseAuCache(fixture("auplugins.ini"))).toEqual([
			{ id: "AU: Apple: AUDelay", name: "AU: AUDelay (Apple)", kind: "AU", instrument: false, tags: [] },
			{ id: "AUi: Apple: AUSampler", name: "AUi: AUSampler (Apple)", kind: "AU", instrument: true, tags: ["instrument"] },
			{ id: "AU: Klevgrand: Brusfri", name: "AU: Brusfri (Klevgrand)", kind: "AU", instrument: false, tags: [] },
		]);
	});
});

describe("parseClapCache", () => {
	it("reads flags bit 1 as instrument and skips timestamp lines", () => {
		expect(parseClapCache(fixture("clap.ini"))).toEqual([
			{ id: "CLAP: One (FabFilter)", name: "CLAPi: One (FabFilter)", kind: "CLAP", instrument: true, tags: ["instrument"] },
			{ id: "CLAP: Filterjam (AudioThing)", name: "CLAP: Filterjam (AudioThing)", kind: "CLAP", instrument: false, tags: [] },
		]);
	});
});

describe("parseJsfxCache", () => {
	const js = parseJsfxCache(fixture("jsfx.ini"));

	it("inserts by path, displays the description, and attaches TAGS", () => {
		expect(js.find((e) => e.name === "JS: 1175 D")).toEqual({
			id: "JS: 1175 D.jsfx",
			name: "JS: 1175 D",
			kind: "JS",
			instrument: false,
			tags: ["dynamics", "compressor"],
		});
		expect(js.find((e) => e.name === "JS: -12dB Dim")?.id).toBe("JS: ReaTeam JSFX/Utility/ReaperBlog_-12dB Dim.jsfx");
	});

	it("handles unquoted paths and ignores REV lines", () => {
		expect(js.map((e) => e.id).sort()).toEqual([
			"JS: 1175 D.jsfx",
			"JS: ReaTeam JSFX/Utility/ReaperBlog_-12dB Dim.jsfx",
			"JS: analysis/compscope_src",
		]);
	});
});

describe("chainEntry", () => {
	it("inserts by the path relative to FXChains/", () => {
		expect(chainEntry("UESC/Vocal Chain.RfxChain")).toEqual({
			id: "UESC/Vocal Chain.RfxChain",
			name: "Chain: UESC/Vocal Chain",
			kind: "Chain",
			instrument: false,
			tags: ["chain"],
		});
	});
});
