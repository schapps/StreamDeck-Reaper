import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cacheFilesFor, scanInstalledFx } from "../../src/fxdb/scan.js";

const fixtures = path.join(__dirname, "../fixtures/fx");
let dir: string;

beforeEach(() => {
	dir = mkdtempSync(path.join(tmpdir(), "reaper-fx-scan-test-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("cacheFilesFor", () => {
	it("maps REAPER's build string to its cache files", () => {
		expect(cacheFilesFor("7.80/macOS-arm64")).toMatchObject({ platform: "mac", vst: "reaper-vstplugins_arm64.ini" });
		expect(cacheFilesFor("7.80/macOS-x86_64")).toMatchObject({ platform: "mac", au: "reaper-auplugins64.ini" });
		expect(cacheFilesFor("7.80/win64")).toMatchObject({ platform: "win", clap: "reaper-clap-win64.ini" });
	});
});

describe("scanInstalledFx", () => {
	it("combines every cache plus FXChains/ (recursively), sorted by name", () => {
		copyFileSync(path.join(fixtures, "vstplugins.ini"), path.join(dir, "reaper-vstplugins_arm64.ini"));
		copyFileSync(path.join(fixtures, "auplugins.ini"), path.join(dir, "reaper-auplugins_arm64.ini"));
		copyFileSync(path.join(fixtures, "clap.ini"), path.join(dir, "reaper-clap-macos-aarch64.ini"));
		copyFileSync(path.join(fixtures, "jsfx.ini"), path.join(dir, "reaper-jsfx.ini"));
		mkdirSync(path.join(dir, "FXChains", "Vocals"), { recursive: true });
		writeFileSync(path.join(dir, "FXChains", "Master.RfxChain"), "");
		writeFileSync(path.join(dir, "FXChains", "Vocals", "Lead.RfxChain"), "");
		writeFileSync(path.join(dir, "FXChains", "notes.txt"), "");

		const entries = scanInstalledFx(dir, "7.80/macOS-arm64");
		const kinds = new Set(entries.map((e) => e.kind));
		expect(kinds).toEqual(new Set(["VST", "VST3", "AU", "CLAP", "JS", "Chain"]));
		expect(entries.filter((e) => e.kind === "Chain").map((e) => e.id)).toEqual([
			"Master.RfxChain",
			path.join("Vocals", "Lead.RfxChain"),
		]);
		const names = entries.map((e) => e.name);
		expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
	});

	it("returns an empty list for a folder with no caches", () => {
		expect(scanInstalledFx(dir, "7.80/macOS-arm64")).toEqual([]);
	});
});
