import type { JsonObject } from "@elgato/utils";
import type { ReaperClientOptions } from "./types.js";

/**
 * Shape of the plugin's global settings (spec section 10). The user's
 * imported action list is NOT here - it lives on disk (see
 * src/actiondb/import-store.ts) rather than round-tripping several
 * thousand rows through Stream Deck settings on every read/write.
 */
export interface GlobalSettings extends JsonObject {
	host?: string;
	port?: number;
	username?: string;
	password?: string;
	timeoutMs?: number;
	/** Set true after the first successful connection, so the PI knows whether to show onboarding. */
	hasConnectedOnce?: boolean;
	/** Action IDs, most-recent first, capped at 20 (spec section 10). */
	recentActions?: string[];
	/** Action IDs starred in the action browser. */
	favorites?: string[];
}

export const GLOBAL_SETTINGS_DEFAULTS: Required<Pick<GlobalSettings, "host" | "port" | "timeoutMs">> = {
	host: "localhost",
	port: 8080,
	timeoutMs: 2000,
};

/** Fills in defaults for any settings the user hasn't configured yet (e.g. a fresh install). */
export function toClientOptions(settings: GlobalSettings): ReaperClientOptions {
	return {
		host: settings.host || GLOBAL_SETTINGS_DEFAULTS.host,
		port: settings.port || GLOBAL_SETTINGS_DEFAULTS.port,
		timeoutMs: settings.timeoutMs || GLOBAL_SETTINGS_DEFAULTS.timeoutMs,
		username: settings.username || undefined,
		password: settings.password || undefined,
	};
}
