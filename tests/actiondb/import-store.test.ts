import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearImportedActions, importActionList, importedActionsSummary } from "../../src/actiondb/import-store.js";

const SAMPLE = [
	"Section\tId\tAction",
	"Main\t40044\tTransport: Play/stop",
	"Main\t1007\tTransport: Play",
	"Main\t_RSabc123\tScript: some custom script",
	"Main\t_SWS_ABOUT\tSWS/S&M: About",
	"MIDI Editor\t99\tSomething not addressable over the web interface",
].join("\n");

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(path.join(tmpdir(), "reaper-import-test-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("importActionList", () => {
	it("persists only Main-section actions and reports script vs total counts", () => {
		const summary = importActionList(SAMPLE, dir);
		expect(summary.count).toBe(4); // MIDI Editor row excluded
		expect(summary.scriptCount).toBe(2); // the two _-prefixed IDs
	});

	it("makes the import visible via importedActionsSummary", () => {
		importActionList(SAMPLE, dir);
		expect(importedActionsSummary(dir)).toEqual({ count: 4, scriptCount: 2 });
	});

	it("propagates a parse error for an unrecognized format rather than writing a bad file", () => {
		expect(() => importActionList("not a real export", dir)).toThrow(/Unrecognized header/);
		expect(importedActionsSummary(dir)).toBeNull();
	});
});

describe("importedActionsSummary", () => {
	it("returns null when nothing has been imported", () => {
		expect(importedActionsSummary(dir)).toBeNull();
	});
});

describe("clearImportedActions", () => {
	it("removes a previous import", () => {
		importActionList(SAMPLE, dir);
		expect(importedActionsSummary(dir)).not.toBeNull();

		clearImportedActions(dir);
		expect(importedActionsSummary(dir)).toBeNull();
	});

	it("is a no-op when nothing was imported", () => {
		expect(() => clearImportedActions(dir)).not.toThrow();
	});
});
