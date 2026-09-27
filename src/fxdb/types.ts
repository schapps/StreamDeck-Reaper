import type { JsonObject } from "@elgato/utils";

export type FxKind = "VST" | "VST3" | "AU" | "CLAP" | "JS" | "Chain";

/**
 * One insertable FX, as read from REAPER's own plugin caches (see
 * src/fxdb/parse-caches.ts). Shaped to work with searchActions() directly:
 * `id` is what's searched for an exact match, `name` and `tags` for words.
 */
export interface FxEntry extends JsonObject {
	/** The exact string handed to TrackFX_AddByName by the bridge script - verified forms in docs/protocol-findings.md. */
	id: string;
	/** REAPER-style display name, e.g. "VST3: Brusfri (Klevgrand)", "AUi: AUSampler (Apple)", "Chain: UESC/Vocal". */
	name: string;
	kind: FxKind;
	instrument: boolean;
	tags: string[];
}
