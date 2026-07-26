import streamDeck from "@elgato/streamdeck";

import { RunAction } from "./actions/run-action.js";

streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new RunAction());

streamDeck.connect();
