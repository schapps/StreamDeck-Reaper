import type { JsonObject } from "@elgato/utils";
import type { ActionEntry } from "../actiondb/types.js";
import type { ReaperClientOptions } from "./types.js";

/** Shape of the plugin's global settings (spec section 10). */
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
	/** User-imported action list, merged into the bundled native database at browse time (spec section 7.2). */
	importedActions?: ActionEntry[];
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
