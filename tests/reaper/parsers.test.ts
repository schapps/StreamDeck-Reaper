import { describe, expect, it } from "vitest";
import {
	parseCmdStateLine,
	parseExtStateLine,
	parseNTrackLine,
	parseResponseBody,
	parseTrackLine,
	parseTransportLine,
	serializeQuery,
	unescapeString,
} from "../../src/reaper/parsers.js";
import { TrackFlag } from "../../src/reaper/types.js";

// All literal response strings below are copied verbatim from
// tests/fixtures/ (captured live during Milestone 1 protocol verification).

describe("parseTransportLine", () => {
	it("parses a stopped transport line", () => {
		const t = parseTransportLine("TRANSPORT\t0\t1.045553\t1\t00:00:01:01\t1.3.09".split("\t"));
		expect(t).toEqual({
			playState: 0,
			positionSeconds: 1.045553,
			repeatOn: true,
			positionString: "00:00:01:01",
			positionStringBeats: "1.3.09",
		});
	});

	it("parses a playing transport line", () => {
		const t = parseTransportLine("TRANSPORT\t1\t1.341042\t1\t00:00:01:10\t1.3.68".split("\t"));
		expect(t?.playState).toBe(1);
	});

	it("returns undefined for a too-short line", () => {
		expect(parseTransportLine(["TRANSPORT"])).toBeUndefined();
	});
});

describe("parseNTrackLine", () => {
	it("parses the track count", () => {
		expect(parseNTrackLine("NTRACK\t4".split("\t"))).toBe(4);
	});
});

describe("parseTrackLine", () => {
	it("parses the master track", () => {
		const track = parseTrackLine(
			"TRACK\t0\tMASTER\t516\t1.000000\t0.000000\t-1500\t-1500\t1.000000\t0\t0\t0\t1\t31391780".split("\t"),
		);
		expect(track).toEqual({
			index: 0,
			name: "MASTER",
			flags: 516,
			volume: 1,
			pan: 0,
			lastMeterPeak: -1500,
			lastMeterPos: -1500,
			widthOrPan2: 1,
			panMode: 0,
			sendCount: 0,
			recvCount: 0,
			hwOutCount: 1,
			color: 31391780,
		});
	});

	it("decodes flags using only documented bits, ignoring the undocumented 512 bit", () => {
		const track = parseTrackLine(
			"TRACK\t1\tMIDI Signal\t708\t1.000000\t0.000000\t-1500\t-1500\t1.000000\t5\t0\t0\t0\t28677999".split(
				"\t",
			),
		)!;
		expect(track.flags & TrackFlag.HasFx).toBeTruthy();
		expect(track.flags & TrackFlag.RecordArmed).toBeTruthy();
		expect(track.flags & TrackFlag.RecordMonitoringOn).toBeTruthy();
		expect(track.flags & TrackFlag.Muted).toBeFalsy();
		// bit 512 is set here too (undocumented) - parser must not choke on it.
		expect(track.flags).toBe(708);
	});

	it("handles a track with an empty name", () => {
		const track = parseTrackLine("TRACK\t4\t\t2\t1.000000\t0.000000\t-1500\t-1500\t1.000000\t5\t0\t0\t0\t29080507".split("\t"));
		expect(track?.name).toBe("");
		expect((track?.flags ?? 0) & TrackFlag.Selected).toBeTruthy();
	});

	it("tolerates fewer fields than documented (future REAPER truncation)", () => {
		const track = parseTrackLine("TRACK\t2\tShort\t8".split("\t"));
		expect(track?.index).toBe(2);
		expect(track?.name).toBe("Short");
		expect(track?.flags).toBe(8);
		expect(track?.volume).toBe(1); // fallback default, not garbage
	});

	it("ignores extra undocumented trailing fields", () => {
		const track = parseTrackLine(
			"TRACK\t0\tMASTER\t516\t1.000000\t0.000000\t-1500\t-1500\t1.000000\t0\t0\t0\t1\t31391780\tSOME_FUTURE_FIELD\t42".split(
				"\t",
			),
		);
		expect(track?.color).toBe(31391780);
	});
});

describe("parseCmdStateLine", () => {
	it("parses a real toggle command", () => {
		expect(parseCmdStateLine("CMDSTATE\t40364\t0".split("\t"))).toEqual({ commandId: "40364", state: 0 });
	});

	it("parses -1 for a non-toggle command", () => {
		expect(parseCmdStateLine("CMDSTATE\t40044\t-1".split("\t"))).toEqual({ commandId: "40044", state: -1 });
	});

	it("parses a named command id", () => {
		expect(parseCmdStateLine("CMDSTATE\t_SWS_ABOUT\t0".split("\t"))).toEqual({
			commandId: "_SWS_ABOUT",
			state: 0,
		});
	});
});

describe("parseExtStateLine", () => {
	it("parses an unset key as an empty value", () => {
		expect(parseExtStateLine("EXTSTATE\tstreamdeck_test\tfoo".split("\t"))).toEqual({
			section: "streamdeck_test",
			key: "foo",
			value: "",
		});
	});

	it("parses a set value", () => {
		expect(parseExtStateLine("EXTSTATE\tstreamdeck_test\tfoo\tbar123".split("\t"))).toEqual({
			section: "streamdeck_test",
			key: "foo",
			value: "bar123",
		});
	});
});

describe("unescapeString", () => {
	it("reverses \\t \\n \\\\ escaping", () => {
		expect(unescapeString("a\\tb\\nc\\\\d")).toBe("a\tb\nc\\d");
	});
});

describe("serializeQuery", () => {
	it("serializes each query type to its wire command", () => {
		expect(serializeQuery({ type: "TRANSPORT" })).toBe("TRANSPORT");
		expect(serializeQuery({ type: "NTRACK" })).toBe("NTRACK");
		expect(serializeQuery({ type: "TRACK" })).toBe("TRACK");
		expect(serializeQuery({ type: "TRACK", index: 3 })).toBe("TRACK/3");
		expect(serializeQuery({ type: "CMDSTATE", commandId: "40364" })).toBe("GET/40364");
		expect(serializeQuery({ type: "CMDSTATE", commandId: "_SWS_ABOUT" })).toBe("GET/_SWS_ABOUT");
		expect(serializeQuery({ type: "EXTSTATE", section: "s", key: "k" })).toBe("GET/EXTSTATE/s/k");
	});
});

describe("parseResponseBody", () => {
	it("parses a batched NTRACK;TRACK reply into one state object", () => {
		const body = [
			"NTRACK\t4",
			"TRACK\t0\tMASTER\t516\t1.000000\t0.000000\t-1500\t-1500\t1.000000\t0\t0\t0\t1\t31391780",
			"TRACK\t1\tMIDI Signal\t708\t1.000000\t0.000000\t-1500\t-1500\t1.000000\t5\t0\t0\t0\t28677999",
			"TRACK\t2\tRoli Control\t708\t1.000000\t0.527559\t-1500\t-1500\t1.000000\t5\t0\t0\t0\t28677999",
			"TRACK\t3\tVIDEO\t0\t1.000000\t0.000000\t-1500\t-1500\t1.000000\t5\t0\t0\t0\t21382726",
			"TRACK\t4\t\t2\t1.000000\t0.000000\t-1500\t-1500\t1.000000\t5\t0\t0\t0\t29080507",
		].join("\n");

		const state = parseResponseBody(body);
		expect(state.ntrack).toBe(4);
		expect(state.tracks).toHaveLength(5);
		expect(state.tracks?.[2]?.name).toBe("Roli Control");
	});

	it("returns an empty state for an empty body (a fired action produces no reply)", () => {
		expect(parseResponseBody("")).toEqual({});
	});

	it("skips unrecognized leading tags without throwing", () => {
		const state = parseResponseBody("SEND\t0\t0\t8\t1.0\t0.0\t-1\nTRANSPORT\t1\t0\t0\t00:00:00:00\t1.1.00");
		expect(state.transport?.playState).toBe(1);
	});

	it("keys cmdState and extState by their query identity", () => {
		const body = "CMDSTATE\t40364\t0\nEXTSTATE\tstreamdeck_test\tfoo\tbar123";
		const state = parseResponseBody(body);
		expect(state.cmdState?.["40364"]?.state).toBe(0);
		expect(state.extState?.["streamdeck_test/foo"]?.value).toBe("bar123");
	});
});
