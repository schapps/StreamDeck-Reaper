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
 * Browser-targeted bundles for the property inspectors (src/pi/) - separate
 * from pluginConfig above because they run in the PI's browser context, not
 * Node, and are loaded via a plain <script> tag rather than as the plugin's
 * CodePath entry point. Exist so the PI can import src/actiondb/search.ts
 * (the tested fuzzy-search ranking) directly instead of a hand-duplicated
 * copy.
 * @returns {import('rollup').RollupOptions}
 */
function piConfig(name) {
	return {
		input: `src/pi/${name}.ts`,
		output: {
			file: `${sdPlugin}/ui/js/${name}.js`,
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
}

export default [pluginConfig, piConfig("action-browser"), piConfig("fx-browser")];
