import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readLastLogLines } from "../../src/util/diagnostics.js";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(path.join(tmpdir(), "reaper-diagnostics-test-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("readLastLogLines", () => {
	it("returns an empty array when the logs directory doesn't exist", () => {
		expect(readLastLogLines(20, path.join(dir, "nope"))).toEqual([]);
	});

	it("returns an empty array when the logs directory has no .log files", () => {
		expect(readLastLogLines(20, dir)).toEqual([]);
	});

	it("reads the most recently modified log file, not just the lowest-numbered one", () => {
		const older = path.join(dir, "plugin.0.log");
		const newer = path.join(dir, "plugin.1.log");
		writeFileSync(older, "old line 1\nold line 2\n");
		writeFileSync(newer, "new line 1\nnew line 2\n");

		// Force distinct, known mtimes regardless of write order/filesystem resolution.
		const past = new Date(Date.now() - 60_000);
		const now = new Date();
		utimesSync(older, past, past);
		utimesSync(newer, now, now);

		expect(readLastLogLines(20, dir)).toEqual(["new line 1", "new line 2"]);
	});

	it("returns only the last N lines and drops blank lines", () => {
		const file = path.join(dir, "plugin.0.log");
		writeFileSync(file, ["a", "b", "", "c", "d", "e"].join("\n"));
		expect(readLastLogLines(3, dir)).toEqual(["c", "d", "e"]);
	});
});
