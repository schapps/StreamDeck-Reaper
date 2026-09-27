/**
 * Builds the insertable-FX list from a REAPER resource folder. The folder
 * and REAPER's build string come from the bridge script (GetResourcePath() /
 * GetAppVersion()), so this works for portable installs without guessing
 * where REAPER lives.
 */

import fs from "node:fs";
import path from "node:path";
import { chainEntry, parseAuCache, parseClapCache, parseJsfxCache, parseVstCache, type FxPlatform } from "./parse-caches.js";
import type { FxEntry } from "./types.js";

interface CacheFiles {
	platform: FxPlatform;
	vst: string;
	au?: string;
	clap: string;
}

/**
 * Which cache files a REAPER build reads, from its GetAppVersion() string
 * (e.g. "7.80/macOS-arm64", "7.80/win64"). Only macOS-arm64 is verified
 * live; the others follow REAPER's file naming in the same folder.
 */
export function cacheFilesFor(appVersion: string): CacheFiles {
	const build = appVersion.toLowerCase();
	const arm = build.includes("arm64") || build.includes("aarch64");
	if (build.includes("win")) {
		return { platform: "win", vst: "reaper-vstplugins64.ini", clap: "reaper-clap-win64.ini" };
	}
	return arm
		? {
				platform: "mac",
				vst: "reaper-vstplugins_arm64.ini",
				au: "reaper-auplugins_arm64.ini",
				clap: "reaper-clap-macos-aarch64.ini",
			}
		: {
				platform: "mac",
				vst: "reaper-vstplugins64.ini",
				au: "reaper-auplugins64.ini",
				clap: "reaper-clap-macos-x86_64.ini",
			};
}

export function scanInstalledFx(resourcePath: string, appVersion: string): FxEntry[] {
	const files = cacheFilesFor(appVersion);
	const read = (name: string) => readIfExists(path.join(resourcePath, name));

	const entries = [
		...parseVstCache(read(files.vst), files.platform),
		...(files.au ? parseAuCache(read(files.au)) : []),
		...parseClapCache(read(files.clap)),
		...parseJsfxCache(read("reaper-jsfx.ini")),
		...listChains(path.join(resourcePath, "FXChains")).map(chainEntry),
	];

	const byId = new Map<string, FxEntry>();
	for (const e of entries) if (!byId.has(e.id)) byId.set(e.id, e);
	return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function readIfExists(file: string): string {
	try {
		return fs.readFileSync(file, "utf8");
	} catch {
		return "";
	}
}

/** Every .RfxChain under FXChains/, as paths relative to it. */
function listChains(dir: string): string[] {
	let names: string[];
	try {
		names = fs.readdirSync(dir, { recursive: true, encoding: "utf8" });
	} catch {
		return [];
	}
	return names.filter((n) => n.toLowerCase().endsWith(".rfxchain"));
}
