/**
 * Reads the plugin's own recent log output for the PI's "Copy diagnostics"
 * button (spec section 11). Stream Deck rotates log files
 * (`<uuid>.0.log`, `<uuid>.1.log`, ...) on each restart rather than
 * appending to one - the "current" file is whichever was written to most
 * recently, not necessarily the one numbered 0.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const DEFAULT_LINE_COUNT = 20;

function defaultLogsDir(): string {
	return path.join(process.cwd(), "logs");
}

function findLatestLogFile(logsDir: string): string | null {
	if (!existsDir(logsDir)) return null;
	const candidates = readdirSync(logsDir)
		.filter((f) => f.endsWith(".log"))
		.map((f) => {
			const full = path.join(logsDir, f);
			return { full, mtime: statSync(full).mtimeMs };
		});
	if (candidates.length === 0) return null;
	candidates.sort((a, b) => b.mtime - a.mtime);
	return candidates[0]?.full ?? null;
}

function existsDir(dir: string): boolean {
	try {
		return statSync(dir).isDirectory();
	} catch {
		return false;
	}
}

/** Last N non-empty lines of the most recently modified log file. Empty array if no logs directory or no log files exist yet. */
export function readLastLogLines(count: number = DEFAULT_LINE_COUNT, logsDir: string = defaultLogsDir()): string[] {
	const file = findLatestLogFile(logsDir);
	if (!file) return [];
	const lines = readFileSync(file, "utf-8")
		.split("\n")
		.filter((l) => l.trim() !== "");
	return lines.slice(-count);
}
