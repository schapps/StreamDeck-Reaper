import streamDeck from "@elgato/streamdeck";
import { execFile } from "node:child_process";
import path from "node:path";

import { InsertFx } from "./actions/insert-fx.js";
import { RunAction } from "./actions/run-action.js";
import { Track } from "./actions/track.js";
import { Transport } from "./actions/transport.js";
import { clearImportedActions, importActionList, importedActionsSummary } from "./actiondb/import-store.js";
import { scanInstalledFx } from "./fxdb/scan.js";
import { bridgeInfo } from "./reaper/bridge.js";
import { connectionManager } from "./reaper/connection-manager.js";
import { readLastLogLines } from "./util/diagnostics.js";

streamDeck.logger.setLevel("info");

// Shipped in the bundle; the user loads it into REAPER once (guided setup in the Insert FX PI).
const BRIDGE_SCRIPT_PATH = path.join(process.cwd(), "scripts", "REAPER Control - Stream Deck bridge.lua");

// Shared across every action's PI - these requests are the same regardless
// of which key type's property inspector is open.
streamDeck.ui.onSendToPlugin(async (ev) => {
	const payload = ev.payload as { event?: string; raw?: string };
	switch (payload.event) {
		case "testConnection": {
			const result = await connectionManager.current.testConnection();
			await streamDeck.ui.sendToPropertyInspector({ event: "testConnectionResult", ...result });
			break;
		}
		case "importActions": {
			try {
				const summary = importActionList(payload.raw ?? "");
				await streamDeck.ui.sendToPropertyInspector({ event: "importActionsResult", ok: true, ...summary });
			} catch (e) {
				const message = e instanceof Error ? e.message : String(e);
				streamDeck.logger.warn(`Action list import failed: ${message}`);
				await streamDeck.ui.sendToPropertyInspector({ event: "importActionsResult", ok: false, message });
			}
			break;
		}
		case "clearImportedActions": {
			clearImportedActions();
			await streamDeck.ui.sendToPropertyInspector({ event: "importedActionsSummary", summary: null });
			break;
		}
		case "getImportedActionsSummary": {
			await streamDeck.ui.sendToPropertyInspector({
				event: "importedActionsSummary",
				summary: importedActionsSummary(),
			});
			break;
		}
		case "getDiagnosticLog": {
			await streamDeck.ui.sendToPropertyInspector({
				event: "diagnosticLogResult",
				lines: readLastLogLines(20),
			});
			break;
		}
		case "getConnectionStatus": {
			await streamDeck.ui.sendToPropertyInspector({
				event: "connectionStatusChanged",
				status: connectionManager.current.status,
			});
			break;
		}
		case "getFxList": {
			// Resource folder and build come live from the bridge, so the list
			// matches whichever REAPER is actually running (portable or not).
			try {
				const info = await bridgeInfo(connectionManager.current);
				if (info.status !== "ok") {
					await streamDeck.ui.sendToPropertyInspector({
						event: "fxListResult",
						status: info.status,
						scriptPath: BRIDGE_SCRIPT_PATH,
					});
					break;
				}
				await streamDeck.ui.sendToPropertyInspector({
					event: "fxListResult",
					status: "ok",
					resourcePath: info.resourcePath,
					entries: scanInstalledFx(info.resourcePath, info.appVersion),
				});
			} catch (e) {
				streamDeck.logger.warn(`FX list request failed: ${e instanceof Error ? e.message : String(e)}`);
				await streamDeck.ui.sendToPropertyInspector({ event: "fxListResult", status: "unreachable" });
			}
			break;
		}
		case "revealBridgeScript": {
			if (process.platform === "win32") execFile("explorer.exe", [`/select,${BRIDGE_SCRIPT_PATH}`]);
			else execFile("open", ["-R", BRIDGE_SCRIPT_PATH]);
			break;
		}
		case "getTrackCount": {
			try {
				const state = await connectionManager.current.query([{ type: "NTRACK" }]);
				await streamDeck.ui.sendToPropertyInspector({ event: "trackCountResult", ntrack: state.ntrack ?? null });
			} catch {
				await streamDeck.ui.sendToPropertyInspector({ event: "trackCountResult", ntrack: null });
			}
			break;
		}
	}
});

// Pushes to whichever PI is currently open (spec sections 4 and 11): "on
// successful connection, the setup panel collapses... and stays collapsed
// unless the connection is lost." The panel's own default collapsed/expanded
// state is otherwise driven by the sticky `hasConnectedOnce` global setting,
// which alone can't represent "was connected, then dropped."
connectionManager.onStatusChange((status) => {
	void streamDeck.ui.sendToPropertyInspector({ event: "connectionStatusChanged", status });
});

streamDeck.actions.registerAction(new RunAction());
streamDeck.actions.registerAction(new Transport());
streamDeck.actions.registerAction(new Track());
streamDeck.actions.registerAction(new InsertFx());

streamDeck.connect();
