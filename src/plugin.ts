import streamDeck from "@elgato/streamdeck";

import { RunAction } from "./actions/run-action.js";
import { Track } from "./actions/track.js";
import { Transport } from "./actions/transport.js";
import { connectionManager } from "./reaper/connection-manager.js";

streamDeck.logger.setLevel("info");

// Shared across every action's PI - the setup panel's Test Connection
// button is the same request regardless of which key type is open.
streamDeck.ui.onSendToPlugin(async (ev) => {
	if ((ev.payload as { event?: string })?.event !== "testConnection") return;
	const result = await connectionManager.current.testConnection();
	await streamDeck.ui.sendToPropertyInspector({ event: "testConnectionResult", ...result });
});

streamDeck.actions.registerAction(new RunAction());
streamDeck.actions.registerAction(new Transport());
streamDeck.actions.registerAction(new Track());

streamDeck.connect();
