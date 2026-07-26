import streamDeck, {
	action,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { connectionManager } from "../reaper/connection-manager.js";
import { TrackFlag, type TrackState } from "../reaper/types.js";
import { stateManager } from "../state.js";
import { trackIcon, trackInactiveIcon, type TrackFunction } from "../util/icons.js";

export interface TrackSettings extends JsonObject {
	trackTarget?: "number" | "selected" | "master";
	trackNumber?: number;
	function?: TrackFunction;
	/** Default true - put the track name (or "N Tracks" when multiple are targeted) on the key title. */
	showTrackName?: boolean;
}

type TrackKeyAction = WillAppearEvent<TrackSettings>["action"];

const FUNCTION_SET_TOKEN: Record<TrackFunction, string> = {
	recarm: "RECARM",
	mute: "MUTE",
	solo: "SOLO",
	select: "SEL",
};

const FLAG_FOR_FUNCTION: Record<TrackFunction, number> = {
	recarm: TrackFlag.RecordArmed,
	mute: TrackFlag.Muted,
	solo: TrackFlag.Soloed,
	select: TrackFlag.Selected,
};

const MAX_TITLE_LENGTH = 20;

@action({ UUID: "com.stephenschappler.reaper.track" })
export class Track extends SingletonAction<TrackSettings> {
	/** Last resolved target tracks per key instance, used on keyDown - the state manager only pushes updates on poll, not on demand. */
	private lastTracks = new Map<string, TrackState[]>();
	private lastLit = new Map<string, boolean | undefined>();

	override onWillAppear(ev: WillAppearEvent<TrackSettings>): void | Promise<void> {
		const settings = ev.payload.settings;
		void ev.action.setImage(trackInactiveIcon());
		stateManager.subscribe(ev.action.id, "track", (state) => {
			if (state.tracks) this.render(ev.action, settings, state.tracks);
		});
	}

	override onWillDisappear(ev: WillDisappearEvent<TrackSettings>): void {
		stateManager.unsubscribe(ev.action.id);
		this.lastTracks.delete(ev.action.id);
		this.lastLit.delete(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent<TrackSettings>): Promise<void> {
		const targets = this.lastTracks.get(ev.action.id) ?? [];
		if (targets.length === 0) {
			// Out of range, or "selected" with nothing selected - do nothing, per spec's edge-case handling.
			await ev.action.showAlert();
			return;
		}

		const fn = ev.payload.settings.function ?? "mute";
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

	private render(keyAction: TrackKeyAction, settings: TrackSettings, tracks: TrackState[]): void {
		const targets = resolveTracks(tracks, settings);
		this.lastTracks.set(keyAction.id, targets);

		if (targets.length === 0) {
			if (this.lastLit.get(keyAction.id) !== undefined) {
				this.lastLit.set(keyAction.id, undefined);
				void keyAction.setImage(trackInactiveIcon());
				if (settings.showTrackName ?? true) void keyAction.setTitle("");
			}
			return;
		}

		const fn = settings.function ?? "mute";
		const flag = FLAG_FOR_FUNCTION[fn];
		const lit = targets.every((t) => (t.flags & flag) !== 0);
		if (this.lastLit.get(keyAction.id) !== lit) {
			this.lastLit.set(keyAction.id, lit);
			void keyAction.setImage(trackIcon(fn, lit));
		}

		if (settings.showTrackName ?? true) {
			const title =
				targets.length > 1
					? `${targets.length} Tracks`
					: truncateTitle(targets[0]?.name || `Track ${targets[0]?.index}`);
			void keyAction.setTitle(title);
		}
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
	const numbered = tracks.find((t) => t.index === settings.trackNumber);
	return numbered ? [numbered] : [];
}

function truncateTitle(name: string): string {
	return name.length > MAX_TITLE_LENGTH ? `${name.slice(0, MAX_TITLE_LENGTH - 1)}…` : name;
}
