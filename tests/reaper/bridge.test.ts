import { afterEach, describe, expect, it } from "vitest";
import { addFxRequest, bridgeInfo, callBridge } from "../../src/reaper/bridge.js";
import { ReaperClient } from "../../src/reaper/client.js";
import { MockReaperServer, reaperOk } from "./mock-server.js";

const COMMAND_ID = "_RS1aa2c0fe752892503f87c166e4baea34953ffebe";

let server: MockReaperServer;

afterEach(async () => {
	await server?.stop();
});

/**
 * Plays the bridge script's part: answers the commandId lookup, and for the
 * combined request replies with whatever `result` the script would have set.
 * REAPER escapes tabs inside ExtState values as a literal "\t" - see
 * tests/fixtures/extstate.txt and the findings doc.
 */
async function startBridge(opts: { commandId?: string; result?: string }) {
	server = await MockReaperServer.start((req, res) => {
		if (req.url === "/_/GET/EXTSTATE/ReaperControl/commandId") {
			reaperOk(res, `EXTSTATE\tReaperControl\tcommandId\t${opts.commandId ?? ""}\n`);
		} else {
			reaperOk(res, `EXTSTATE\tReaperControl\tresult\t${opts.result ?? "pending"}\n`);
		}
	});
	return new ReaperClient({ host: "127.0.0.1", port: server.port, timeoutMs: 500 });
}

describe("callBridge", () => {
	it("sends clear, request, run and read-back as one ordered request", async () => {
		const client = await startBridge({ commandId: COMMAND_ID, result: "ok\\t1\\tVST3: Brusfri (Klevgrand)" });
		const result = await callBridge(client, addFxRequest("VST3: Brusfri (Klevgrand)", { kind: "selected" }, "none"));

		expect(result).toEqual({ status: "ok", fields: ["1", "VST3: Brusfri (Klevgrand)"] });
		expect(server.requests.map((r) => r.url)).toEqual([
			"/_/GET/EXTSTATE/ReaperControl/commandId",
			"/_/SET/EXTSTATE/ReaperControl/result/pending;" +
				"SET/EXTSTATE/ReaperControl/request/addfx%09selected%090%09VST3%3A%20Brusfri%20(Klevgrand);" +
				`${COMMAND_ID};` +
				"GET/EXTSTATE/ReaperControl/result",
		]);
	});

	it("URL-encodes slashes in the FX name so they don't split the path", async () => {
		const client = await startBridge({ commandId: COMMAND_ID, result: "ok\\t1\\tJS: -12dB Dim" });
		await callBridge(client, addFxRequest("JS: ReaTeam JSFX/Utility/Dim.jsfx", { kind: "track", number: 3 }, "floating"));
		expect(server.requests[1]?.url).toContain("addfx%09track%3A3%091%09JS%3A%20ReaTeam%20JSFX%2FUtility%2FDim.jsfx;");
	});

	it("reports the script's error message", async () => {
		const client = await startBridge({ commandId: COMMAND_ID, result: "error\\tFX not found: Nope" });
		expect(await callBridge(client, "addfx\tselected\t0\tNope")).toEqual({
			status: "error",
			message: "FX not found: Nope",
		});
	});

	it("is notSetUp, without running anything, when no command ID is registered", async () => {
		const client = await startBridge({});
		expect(await callBridge(client, "info")).toEqual({ status: "notSetUp" });
		expect(server.requests).toHaveLength(1);
	});

	it("rejects a command ID that isn't a named-command shape rather than putting it in the path", async () => {
		const client = await startBridge({ commandId: "_RSabc;40044" });
		expect(await callBridge(client, "info")).toEqual({ status: "notSetUp" });
	});

	it("is noResponse when the result is still pending - the script didn't run", async () => {
		const client = await startBridge({ commandId: COMMAND_ID, result: "pending" });
		expect(await callBridge(client, "info")).toEqual({ status: "noResponse" });
	});
});

describe("bridgeInfo", () => {
	it("returns REAPER's build string and resource path", async () => {
		const client = await startBridge({
			commandId: COMMAND_ID,
			result: "ok\\t7.80/macOS-arm64\\t/Applications/Reaper_Testing_Mac",
		});
		expect(await bridgeInfo(client)).toEqual({
			status: "ok",
			appVersion: "7.80/macOS-arm64",
			resourcePath: "/Applications/Reaper_Testing_Mac",
		});
	});
});
