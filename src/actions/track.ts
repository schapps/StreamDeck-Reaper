import streamDeck, {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { connectionManager } from "../reaper/connection-manager.js";
import { TrackFlag, type TrackState } from "../reaper/types.js";
import { stateManager } from "../state.js";
import {
	reaperColorToHex,
	toImageParam,
	trackIcon,
	trackInactiveIcon,
	withDisconnectedBadge,
	type TrackFunction,
} from "../util/icons.js";

export interface TrackSettings extends JsonObject {
	trackTarget?: "number" | "selected" | "master";
	trackNumber?: number;
	function?: TrackFunction;
	/** Default true - put the track name (or "N Tracks" when multiple are targeted) on the key title. */
	showTrackName?: boolean;
	/** Default false - tint the key's background with the target track's REAPER color (first target's, when multiple are targeted). No effect on tracks with no custom color set. */
	tintTrackColor?: boolean;
}

type TrackKeyAction = WillAppearEvent<TrackSettings>["action"];

interface Instance {
	action: TrackKeyAction;
	/** undefined = no target resolved yet / out of range / nothing selected. */
	lit: boolean | undefined;
	fn: TrackFunction;
	targets: TrackState[];
	settings: TrackSettings;
	/** Last state a poll delivered, cached so a settings change can be re-applied immediately instead of waiting for the next poll tick. */
	lastTracks: TrackState[] | undefined;
	/** Last-computed tint color (or undefined), tracked separately from `lit` so a track recoloring in REAPER repaints the key even when mute/solo/etc. state hasn't changed. */
	bgColor: string | undefined;
}

/** Display Name has no command token or flag - it's purely informational, handled separately wherever these are used. */
const FUNCTION_SET_TOKEN: Record<Exclude<TrackFunction, "displayName">, string> = {
	recarm: "RECARM",
	mute: "MUTE",
	solo: "SOLO",
	select: "SEL",
};

const FLAG_FOR_FUNCTION: Record<Exclude<TrackFunction, "displayName">, number> = {
	recarm: TrackFlag.RecordArmed,
	mute: TrackFlag.Muted,
	solo: TrackFlag.Soloed,
	select: TrackFlag.Selected,
};

const MAX_TITLE_LENGTH = 20;

@action({ UUID: "com.stephenschappler.reaper.track" })
export class Track extends SingletonAction<TrackSettings> {
	private instances = new Map<string, Instance>();
	private disconnected = connectionManager.current.status === "disconnected";
	private statusHandlerRegistered = false;

	override onWillAppear(ev: WillAppearEvent<TrackSettings>): void | Promise<void> {
		const settings = ev.payload.settings;
		this.ensureStatusHandler();
		this.instances.set(ev.action.id, {
			action: ev.action,
			lit: undefined,
			fn: settings.function ?? "mute",
			targets: [],
			settings,
			lastTracks: undefined,
			bgColor: undefined,
		});
		this.paint(ev.action.id);
		stateManager.subscribe(ev.action.id, "track", (state) => {
			if (state.tracks) this.onState(ev.action.id, state.tracks);
		});
	}

	override onWillDisappear(ev: WillDisappearEvent<TrackSettings>): void {
		stateManager.unsubscribe(ev.action.id);
		this.instances.delete(ev.action.id);
	}

	/** Settings (Function, track target, etc.) can change while the key stays visible, not just on the next willAppear - re-applies the last cached poll against the new settings so the icon/title update immediately. */
	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<TrackSettings>): void {
		const inst = this.instances.get(ev.action.id);
		if (!inst) return;
		inst.settings = ev.payload.settings;
		if (inst.lastTracks) this.onState(ev.action.id, inst.lastTracks);
		this.paint(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent<TrackSettings>): Promise<void> {
		const fn = ev.payload.settings.function ?? "mute";
		if (fn === "displayName") return; // purely informational - nothing to toggle on press

		const targets = this.instances.get(ev.action.id)?.targets ?? [];
		if (targets.length === 0) {
			// Out of range, or "selected" with nothing selected - do nothing, per spec's edge-case handling.
			await ev.action.showAlert();
			return;
		}

		const token = FUNCTION_SET_TOKEN[fn];
		const flag = FLAG_FOR_FUNCTION[fn];

		// Uniform toggle across the whole group, not each track toggling its own
		// state independently: if every targeted track already has this flag on,
		// turn them all off; otherwise turn them all on. REAPER's own native
		// "toggle <x> for selected tracks" actions turn out to toggle each
		// selected track independently (verified live), which produces a messy
		// mixed result for a multi-track press - not what a single key press
		// should do. Reduces to an ordinary single-track toggle when there's
		// only one target.
		const allOn = targets.every((t) => (t.flags & flag) !== 0);
		const newValue = allOn ? 0 : 1;
		const commands = targets.map((t) => `SET/TRACK/${t.index}/${token}/${newValue}`);

		try {
			await connectionManager.current.runCommands(commands);
			stateManager.notifyActivity();
			await ev.action.showOk();
		} catch (e) {
			const indices = targets.map((t) => t.index).join(",");
			streamDeck.logger.error(
				`Track ${fn} (tracks ${indices}) failed: ${e instanceof Error ? e.message : String(e)}`,
			);
			await ev.action.showAlert();
		}
	}

	private ensureStatusHandler(): void {
		if (this.statusHandlerRegistered) return;
		this.statusHandlerRegistered = true;
		connectionManager.onStatusChange((status) => {
			this.disconnected = status === "disconnected";
			for (const id of this.instances.keys()) this.paint(id);
		});
	}

	private onState(id: string, tracks: TrackState[]): void {
		const inst = this.instances.get(id);
		if (!inst) return;
		inst.lastTracks = tracks;
		const settings = inst.settings;

		const targets = resolveTracks(tracks, settings);
		inst.targets = targets;
		inst.fn = settings.function ?? "mute";

		const bgColor = settings.tintTrackColor ? reaperColorToHex(targets[0]?.color ?? 0) : undefined;
		const bgChanged = inst.bgColor !== bgColor;
		inst.bgColor = bgColor;

		if (targets.length === 0) {
			if (inst.lit !== undefined || bgChanged) {
				inst.lit = undefined;
				this.paint(id);
				if (settings.showTrackName ?? true) void inst.action.setTitle("");
			}
			return;
		}

		// Display Name has no flag to reflect - just treat "has a resolved
		// target" as lit, so paint() draws the plain (optionally tinted) tile
		// instead of the no-target dashed outline.
		let lit: boolean;
		if (inst.fn === "displayName") {
			lit = true;
		} else {
			const flag = FLAG_FOR_FUNCTION[inst.fn];
			lit = targets.every((t) => (t.flags & flag) !== 0);
		}
		if (inst.lit !== lit || bgChanged) {
			inst.lit = lit;
			this.paint(id);
		}

		if (settings.showTrackName ?? true) {
			const title =
				targets.length > 1
					? `${targets.length} Tracks`
					: truncateTitle(targets[0]?.name || `Track ${targets[0]?.index}`);
			void inst.action.setTitle(title);
		}
	}

	/** Repaints from current instance state - the only place setImage() is called. */
	private paint(id: string): void {
		const inst = this.instances.get(id);
		if (!inst) return;
		const icon = inst.lit === undefined ? trackInactiveIcon() : trackIcon(inst.fn, inst.lit, inst.bgColor);
		void inst.action.setImage(toImageParam(this.disconnected ? withDisconnectedBadge(icon) : icon));
	}
}

function resolveTracks(tracks: TrackState[], settings: TrackSettings): TrackState[] {
	const target = settings.trackTarget ?? "number";
	if (target === "master") {
		const master = tracks.find((t) => t.index === 0);
		return master ? [master] : [];
	}
	if (target === "selected") {
		return tracks.filter((t) => t.index !== 0 && (t.flags & TrackFlag.Selected) !== 0);
	}
	// Confirmed live: sdpi-components persists this field's value as a string
	// ("4") despite value-type="number" on the <sdpi-textfield>, so a strict
	// === against TrackState.index (a real number) never matches. Coerce
	// rather than trust the declared JsonObject type for what's actually on
	// the wire from the PI.
	const wanted = Number(settings.trackNumber);
	const numbered = tracks.find((t) => t.index === wanted);
	return numbered ? [numbered] : [];
}

function truncateTitle(name: string): string {
	return name.length > MAX_TITLE_LENGTH ? `${name.slice(0, MAX_TITLE_LENGTH - 1)}…` : name;
}
