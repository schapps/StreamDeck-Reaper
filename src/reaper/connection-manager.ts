/**
 * Owns the single shared ReaperClient instance used by every action.
 * Rebuilds the client whenever global connection settings change (host,
 * port, credentials, timeout) so an in-flight PI edit takes effect
 * immediately without a plugin restart.
 */

import streamDeck from "@elgato/streamdeck";
import { ReaperClient } from "./client.js";
import { GLOBAL_SETTINGS_DEFAULTS, toClientOptions, type GlobalSettings } from "./global-settings.js";
import type { ConnectionStatus } from "./types.js";

class ConnectionManager {
	private client: ReaperClient = new ReaperClient({ ...GLOBAL_SETTINGS_DEFAULTS });
	private statusHandlers = new Set<(status: ConnectionStatus) => void>();

	constructor() {
		this.wireStatusForwarding();
		streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => this.rebuild(ev.settings));
		void streamDeck.settings.getGlobalSettings<GlobalSettings>().then((settings) => this.rebuild(settings));
	}

	get current(): ReaperClient {
		return this.client;
	}

	onStatusChange(handler: (status: ConnectionStatus) => void): void {
		this.statusHandlers.add(handler);
	}

	offStatusChange(handler: (status: ConnectionStatus) => void): void {
		this.statusHandlers.delete(handler);
	}

	private rebuild(settings: GlobalSettings): void {
		this.client = new ReaperClient(toClientOptions(settings));
		this.wireStatusForwarding();
	}

	private wireStatusForwarding(): void {
		this.client.on("statusChange", (status) => {
			if (status === "connected") {
				void streamDeck.settings.getGlobalSettings<GlobalSettings>().then((settings) => {
					if (!settings.hasConnectedOnce) {
						void streamDeck.settings.setGlobalSettings<GlobalSettings>({
							...settings,
							hasConnectedOnce: true,
						});
					}
				});
			}
			for (const handler of this.statusHandlers) handler(status);
		});
	}
}

export const connectionManager = new ConnectionManager();
