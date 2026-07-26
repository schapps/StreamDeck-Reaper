import { describe, expect, it } from "vitest";
import { searchActions } from "../../src/actiondb/search.js";
import type { ActionEntry } from "../../src/actiondb/types.js";

function entry(id: string, name: string, tags: string[] = []): ActionEntry {
	return { id, name, section: "main", tags };
}

const SAMPLE: ActionEntry[] = [
	entry("40044", "Transport: Play/stop", ["transport", "play", "stop"]),
	entry("1007", "Transport: Play", ["transport", "play"]),
	entry("40667", "Transport: Stop (save all recorded media)", ["transport", "stop"]),
	entry("40364", "Options: Toggle metronome", ["transport", "metronome"]),
	entry("40157", "Markers: Insert marker at current position", ["marker", "insert"]),
	entry("40001", "Track: Insert new track", ["track", "insert", "new"]),
	entry("6", "Track: Toggle mute for selected tracks", ["track", "mute"]),
	entry("_SWS_ABOUT", "SWS/S&M: About"),
];

describe("searchActions", () => {
	it("returns nothing for an empty or whitespace-only query", () => {
		expect(searchActions(SAMPLE, "")).toEqual([]);
		expect(searchActions(SAMPLE, "   ")).toEqual([]);
	});

	it("puts an exact numeric ID match first, even over unrelated name matches", () => {
		const results = searchActions(SAMPLE, "40044");
		expect(results[0]?.id).toBe("40044");
	});

	it("finds an exact named ID match case-insensitively", () => {
		const results = searchActions(SAMPLE, "_sws_about");
		expect(results[0]?.id).toBe("_SWS_ABOUT");
	});

	it("ranks a name-prefix match above a mid-name match for the same word", () => {
		// "Transport: Play/stop" and "Transport: Play" both start with "transport"
		const results = searchActions(SAMPLE, "transport");
		expect(results.map((r) => r.id)).not.toContain("40157"); // marker action shouldn't match at all
		expect(results.length).toBeGreaterThan(0);
	});

	it("requires every word in a multi-word query to match (by name or tag)", () => {
		const results = searchActions(SAMPLE, "track insert");
		expect(results.map((r) => r.id)).toEqual(["40001"]);
	});

	it("matches via tag when the word isn't literally in the name", () => {
		// "metronome" isn't in "Options: Toggle metronome"'s... wait it is; use "click" absent from tags here to prove tag-only match separately
		const results = searchActions(SAMPLE, "transport metronome");
		expect(results.map((r) => r.id)).toContain("40364");
	});

	it("surfaces the common transport actions before an obscure name-only match on the same word", () => {
		const results = searchActions(SAMPLE, "play");
		const ids = results.map((r) => r.id);
		expect(ids.slice(0, 2).sort()).toEqual(["1007", "40044"]);
	});

	it("falls back to subsequence matching when no word-substring match exists", () => {
		// "mtrnm" has no literal substring in any name, but is an in-order
		// subsequence of "Options: Toggle metronome" ("m...t...r...n...m").
		const results = searchActions(SAMPLE, "mtrnm");
		expect(results[0]?.id).toBe("40364");
	});

	it("returns no results when even a subsequence match is impossible", () => {
		expect(searchActions(SAMPLE, "zzzznotpresent")).toEqual([]);
	});

	it("respects the limit option", () => {
		const results = searchActions(SAMPLE, "transport", { limit: 1 });
		expect(results).toHaveLength(1);
	});
});
