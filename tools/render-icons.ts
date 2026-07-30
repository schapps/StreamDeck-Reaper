/**
 * Rasterizes the hand-authored SVG sources in design/icons/ into the PNG
 * assets Stream Deck's manifest actually requires (spec section 9;
 * dimensions/monochrome requirements confirmed against Elgato's manifest
 * schema at https://schemas.elgato.com/streamdeck/plugins/manifest.json).
 *
 * Run: npm run build:icons
 *
 * Category icon and per-action list icons must be monochrome white on a
 * transparent background; the marketplace icon and key (State) art are
 * full color. The @2x files are just the same source rendered at 2x the
 * pixel size, not distinct artwork.
 */

import { Resvg } from "@resvg/resvg-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "design", "icons");
const OUT = path.join(__dirname, "..", "com.stephenschappler.reaper.sdPlugin", "imgs");

interface Target {
	source: string;
	outFile: string;
	size: number;
}

const TARGETS: Target[] = [
	// Plugin-level
	{ source: "plugin-icon.svg", outFile: "plugin/marketplace.png", size: 256 },
	{ source: "plugin-icon.svg", outFile: "plugin/marketplace@2x.png", size: 512 },
	{ source: "mark-run-action.svg", outFile: "plugin/category-icon.png", size: 28 },
	{ source: "mark-run-action.svg", outFile: "plugin/category-icon@2x.png", size: 56 },

	// Run Action
	{ source: "mark-run-action.svg", outFile: "actions/runaction/icon.png", size: 20 },
	{ source: "mark-run-action.svg", outFile: "actions/runaction/icon@2x.png", size: 40 },
	{ source: "key-run-action.svg", outFile: "actions/runaction/key.png", size: 72 },
	{ source: "key-run-action.svg", outFile: "actions/runaction/key@2x.png", size: 144 },

	// Transport
	{ source: "mark-transport.svg", outFile: "actions/transport/icon.png", size: 20 },
	{ source: "mark-transport.svg", outFile: "actions/transport/icon@2x.png", size: 40 },
	{ source: "key-transport.svg", outFile: "actions/transport/key.png", size: 72 },
	{ source: "key-transport.svg", outFile: "actions/transport/key@2x.png", size: 144 },

	// Track Control
	{ source: "mark-track.svg", outFile: "actions/track/icon.png", size: 20 },
	{ source: "mark-track.svg", outFile: "actions/track/icon@2x.png", size: 40 },
	{ source: "key-track.svg", outFile: "actions/track/key.png", size: 72 },
	{ source: "key-track.svg", outFile: "actions/track/key@2x.png", size: 144 },
];

function main(): void {
	for (const target of TARGETS) {
		const svg = readFileSync(path.join(SRC, target.source), "utf-8");
		const resvg = new Resvg(svg, { fitTo: { mode: "width", value: target.size } });
		const png = resvg.render().asPng();

		const outPath = path.join(OUT, target.outFile);
		mkdirSync(path.dirname(outPath), { recursive: true });
		writeFileSync(outPath, png);
		console.log(`${target.source} @ ${target.size}px -> ${path.relative(process.cwd(), outPath)}`);
	}
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	if (!existsSync(SRC)) throw new Error(`Missing SVG source directory: ${SRC}`);
	main();
}
