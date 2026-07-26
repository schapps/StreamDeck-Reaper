import type { JsonObject } from "@elgato/utils";
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
