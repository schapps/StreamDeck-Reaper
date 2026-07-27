import streamDeck from "@elgato/streamdeck";

import { RunAction } from "./actions/run-action.js";
import { Track } from "./actions/track.js";
import { Transport } from "./actions/transport.js";
import { clearImportedActions, importActionList, importedActionsSummary } from "./actiondb/import-store.js";
import { connectionManager } from "./reaper/connection-manager.js";

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
	}
});

streamDeck.actions.registerAction(new RunAction());
streamDeck.actions.registerAction(new Transport());
streamDeck.actions.registerAction(new Track());

streamDeck.connect();
