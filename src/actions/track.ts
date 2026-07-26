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
	/** Default true - put the track name on the key title. */
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
	/** Last resolved target track per key instance, used on keyDown - the state manager only pushes updates on poll, not on demand. */
	private lastTrack = new Map<string, TrackState | undefined>();
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
		this.lastTrack.delete(ev.action.id);
		this.lastLit.delete(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent<TrackSettings>): Promise<void> {
		const track = this.lastTrack.get(ev.action.id);
		if (!track) {
			// Out of range, or "selected" with nothing selected - do nothing, per spec's edge-case handling.
			await ev.action.showAlert();
			return;
		}

		const fn = ev.payload.settings.function ?? "mute";
		const token = FUNCTION_SET_TOKEN[fn];
		try {
			await connectionManager.current.runCommands([`SET/TRACK/${track.index}/${token}/-1`]);
			stateManager.notifyActivity();
			await ev.action.showOk();
		} catch (e) {
			streamDeck.logger.error(`Track ${fn} (track ${track.index}) failed: ${e instanceof Error ? e.message : String(e)}`);
			await ev.action.showAlert();
		}
	}

	private render(keyAction: TrackKeyAction, settings: TrackSettings, tracks: TrackState[]): void {
		const track = resolveTrack(tracks, settings);
		this.lastTrack.set(keyAction.id, track);

		if (!track) {
			if (this.lastLit.get(keyAction.id) !== undefined) {
				this.lastLit.set(keyAction.id, undefined);
				void keyAction.setImage(trackInactiveIcon());
				if (settings.showTrackName ?? true) void keyAction.setTitle("");
			}
			return;
		}

		const fn = settings.function ?? "mute";
		const lit = (track.flags & FLAG_FOR_FUNCTION[fn]) !== 0;
		if (this.lastLit.get(keyAction.id) !== lit) {
			this.lastLit.set(keyAction.id, lit);
			void keyAction.setImage(trackIcon(fn, lit));
		}

		if (settings.showTrackName ?? true) {
			void keyAction.setTitle(truncateTitle(track.name || `Track ${track.index}`));
		}
	}
}

function resolveTrack(tracks: TrackState[], settings: TrackSettings): TrackState | undefined {
	const target = settings.trackTarget ?? "number";
	if (target === "master") return tracks.find((t) => t.index === 0);
	if (target === "selected") return tracks.find((t) => t.index !== 0 && (t.flags & TrackFlag.Selected) !== 0);
	return tracks.find((t) => t.index === settings.trackNumber);
}

function truncateTitle(name: string): string {
	return name.length > MAX_TITLE_LENGTH ? `${name.slice(0, MAX_TITLE_LENGTH - 1)}…` : name;
}
