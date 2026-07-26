import { describe, expect, it } from "vitest";
import { parse } from "../../tools/build-action-db.js";

const SAMPLE = [
	"Section\tId\tAction",
	"Main\t40044\tTransport: Play/stop",
	"Main\t1007\tTransport: Play",
	"MIDI Editor\t40214\tSome MIDI editor action",
	"Main\t_RSabc123\tScript: some custom script",
	"Media Explorer\t123\tSome media explorer action",
].join("\n");

describe("parse", () => {
	it("keeps only Main-section rows", () => {
		const actions = parse(SAMPLE, {});
		expect(actions).toHaveLength(3);
		expect(actions.every((a) => a.section === "main")).toBe(true);
	});

	it("preserves numeric and named IDs verbatim as strings", () => {
		const actions = parse(SAMPLE, {});
		expect(actions.map((a) => a.id)).toEqual(["40044", "1007", "_RSabc123"]);
	});

	it("applies curated tags by ID and defaults to an empty array otherwise", () => {
		const actions = parse(SAMPLE, { "40044": ["transport", "play"] });
		expect(actions.find((a) => a.id === "40044")?.tags).toEqual(["transport", "play"]);
		expect(actions.find((a) => a.id === "1007")?.tags).toEqual([]);
	});

	it("throws on an unrecognized header, rather than silently mis-parsing a changed export format", () => {
		const bad = "Foo\tBar\tBaz\nMain\t1\tSomething";
		expect(() => parse(bad, {})).toThrow(/Unexpected header/);
	});

	it("ignores blank trailing lines", () => {
		const withTrailingBlank = `${SAMPLE}\n\n`;
		expect(parse(withTrailingBlank, {})).toHaveLength(3);
	});
});
