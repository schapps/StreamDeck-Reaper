import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import path from "node:path";
import url from "node:url";

const isWatching = !!process.env.ROLLUP_WATCH;
const sdPlugin = "com.schapps.reaper.sdPlugin";

/**
 * @type {import('rollup').RollupOptions}
 */
const pluginConfig = {
	input: "src/plugin.ts",
	output: {
		file: `${sdPlugin}/bin/plugin.js`,
		sourcemap: isWatching,
		sourcemapPathTransform: (relativeSourcePath, sourcemapPath) => {
			return url.pathToFileURL(path.resolve(path.dirname(sourcemapPath), relativeSourcePath)).href;
		}
	},
	plugins: [
		{
			name: "watch-externals",
			buildStart: function () {
				this.addWatchFile(`${sdPlugin}/manifest.json`);
			},
		},
		typescript({
			mapRoot: isWatching ? "./" : undefined
		}),
		nodeResolve({
			browser: false,
			exportConditions: ["node"],
			preferBuiltins: true
		}),
		commonjs(),
		!isWatching && terser(),
		{
			name: "emit-module-package-file",
			generateBundle() {
				this.emitFile({ fileName: "package.json", source: `{ "type": "module" }`, type: "asset" });
			}
		}
	]
};

/**
 * Browser-targeted bundle for the property inspector's action browser
 * (src/pi/) - separate from pluginConfig above because it runs in the PI's
 * browser context, not Node, and is loaded via a plain <script> tag rather
 * than as the plugin's CodePath entry point. Exists so the PI can import
 * src/actiondb/search.ts (the tested fuzzy-search ranking) directly instead
 * of a hand-duplicated copy.
 * @type {import('rollup').RollupOptions}
 */
const actionBrowserConfig = {
	input: "src/pi/action-browser.ts",
	output: {
		file: `${sdPlugin}/ui/js/action-browser.js`,
		format: "iife",
		sourcemap: isWatching
	},
	plugins: [
		typescript({
			tsconfig: "src/pi/tsconfig.json",
			mapRoot: isWatching ? "./" : undefined
		}),
		nodeResolve({ browser: true }),
		commonjs(),
		!isWatching && terser()
	]
};

export default [pluginConfig, actionBrowserConfig];
