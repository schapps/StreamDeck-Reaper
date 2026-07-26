import streamDeck, {
	action,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { connectionManager } from "../reaper/connection-manager.js";
import type { TransportState } from "../reaper/types.js";
import { stateManager } from "../state.js";
import { transportIcon, type TransportFunction } from "../util/icons.js";

export interface TransportSettings extends JsonObject {
	function?: TransportFunction;
	/** Default false (solid) - blinking keys irritate people in long sessions. */
	blinkRecord?: boolean;
}

type TransportKeyAction = WillAppearEvent<TransportSettings>["action"];

/** Verified against a real REAPER action-list export - see docs/protocol-findings.md Milestone 3/4 addenda. */
const FUNCTION_ACTION_ID: Record<TransportFunction, string> = {
	play: "1007", // Transport: Play
	stop: "40667", // Transport: Stop (save all recorded media) - deliberately not 1016 (plain Stop), which risks discarding an in-progress recording
	pause: "1008", // Transport: Pause (not 40073, which is Play/Pause - a toggle, not a dedicated pause)
	record: "1013", // Transport: Record (not 40046, which is edit-cursor-specific start/stop)
	playStop: "40044", // Transport: Play/stop
	repeat: "1068", // Transport: Toggle repeat
	gotoStart: "40042",
	gotoEnd: "40043",
};

const BLINK_INTERVAL_MS = 1000;

@action({ UUID: "com.stephenschappler.reaper.transport" })
export class Transport extends SingletonAction<TransportSettings> {
	private lastLit = new Map<string, boolean>();
	private blinkTimers = new Map<string, ReturnType<typeof setInterval>>();
	private blinkPhase = new Map<string, boolean>();

	override onWillAppear(ev: WillAppearEvent<TransportSettings>): void | Promise<void> {
		const fn = ev.payload.settings.function ?? "playStop";
		const blinkRecord = ev.payload.settings.blinkRecord;
		void ev.action.setImage(transportIcon(fn, false));
		stateManager.subscribe(ev.action.id, "transport", (state) => {
			if (state.transport) this.render(ev.action, fn, blinkRecord, state.transport);
		});
	}

	override onWillDisappear(ev: WillDisappearEvent<TransportSettings>): void {
		stateManager.unsubscribe(ev.action.id);
		this.stopBlink(ev.action.id);
		this.lastLit.delete(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent<TransportSettings>): Promise<void> {
		const fn = ev.payload.settings.function ?? "playStop";
		const actionId = FUNCTION_ACTION_ID[fn];
		try {
			await connectionManager.current.runCommands([actionId]);
			stateManager.notifyActivity();
			await ev.action.showOk();
		} catch (e) {
			streamDeck.logger.error(`Transport (${fn}) failed: ${e instanceof Error ? e.message : String(e)}`);
			await ev.action.showAlert();
		}
	}

	private render(
		keyAction: TransportKeyAction,
		fn: TransportFunction,
		blinkRecord: boolean | undefined,
		transport: TransportState,
	): void {
		const lit = this.isLit(fn, transport);
		const wasLit = this.lastLit.get(keyAction.id);
		if (lit === wasLit) return;
		this.lastLit.set(keyAction.id, lit);

		if (fn === "record" && blinkRecord) {
			if (lit) this.startBlink(keyAction);
			else this.stopBlink(keyAction.id);
		}

		void keyAction.setImage(transportIcon(fn, lit));
	}

	private isLit(fn: TransportFunction, transport: TransportState): boolean {
		switch (fn) {
			case "play":
			case "playStop":
				return transport.playState === 1;
			case "pause":
				return transport.playState === 2;
			case "record":
				return transport.playState === 5 || transport.playState === 6;
			case "repeat":
				return transport.repeatOn;
			case "stop":
			case "gotoStart":
			case "gotoEnd":
				return false; // momentary - no persistent visual state
		}
	}

	private startBlink(keyAction: TransportKeyAction): void {
		if (this.blinkTimers.has(keyAction.id)) return;
		this.blinkPhase.set(keyAction.id, true);
		const timer = setInterval(() => {
			const phase = !this.blinkPhase.get(keyAction.id);
			this.blinkPhase.set(keyAction.id, phase);
			void keyAction.setImage(transportIcon("record", phase));
		}, BLINK_INTERVAL_MS);
		this.blinkTimers.set(keyAction.id, timer);
	}

	private stopBlink(actionId: string): void {
		const timer = this.blinkTimers.get(actionId);
		if (timer) clearInterval(timer);
		this.blinkTimers.delete(actionId);
		this.blinkPhase.delete(actionId);
	}
}
