import streamDeck from "@elgato/streamdeck";

import { RunAction } from "./actions/run-action.js";
import { Track } from "./actions/track.js";
import { Transport } from "./actions/transport.js";
import { clearImportedActions, importActionList, importedActionsSummary } from "./actiondb/import-store.js";
import { connectionManager } from "./reaper/connection-manager.js";
import { readLastLogLines } from "./util/diagnostics.js";

streamDeck.logger.setLevel("info");

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

streamDeck.connect();
