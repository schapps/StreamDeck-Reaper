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
import type { TransportState } from "../reaper/types.js";
import { stateManager } from "../state.js";
import { toImageParam, transportIcon, withDisconnectedBadge, type TransportFunction } from "../util/icons.js";

export interface TransportSettings extends JsonObject {
	function?: TransportFunction;
	/** Default false (solid) - blinking keys irritate people in long sessions. */
	blinkRecord?: boolean;
}

type TransportKeyAction = WillAppearEvent<TransportSettings>["action"];

interface Instance {
	action: TransportKeyAction;
	fn: TransportFunction;
	blinkRecord: boolean | undefined;
	lit: boolean;
	/** Last state a poll delivered, cached so a Function change can repaint immediately instead of waiting for the next poll tick - which may never come if the underlying transport state hasn't actually changed (see StateManager.fanOut). */
	lastTransport: TransportState | undefined;
}

/** Verified against a real REAPER action-list export - see docs/protocol-findings.md Milestone 3/4 addenda. */
const FUNCTION_ACTION_ID: Record<TransportFunction, string> = {
	play: "1007", // Transport: Play
	stop: "40667", // Transport: Stop (save all recorded media) - deliberately not 1016 (plain Stop), which risks discarding an in-progress recording
	pause: "1008", // Transport: Pause (not 40073, which is Play/Pause - a toggle, not a dedicated pause)
	record: "1013", // Transport: Record (not 40046, which is edit-cursor-specific start/stop)
	playStop: "40044", // Transport: Play/stop
	playPause: "40073", // Transport: Play/pause - toggle, deliberately distinct from the dedicated "pause" above
	repeat: "1068", // Transport: Toggle repeat
	gotoStart: "40042",
	gotoEnd: "40043",
};

const BLINK_INTERVAL_MS = 1000;

@action({ UUID: "com.stephenschappler.reaper.transport" })
export class Transport extends SingletonAction<TransportSettings> {
	private instances = new Map<string, Instance>();
	private blinkTimers = new Map<string, ReturnType<typeof setInterval>>();
	private blinkPhase = new Map<string, boolean>();
	private disconnected = connectionManager.current.status === "disconnected";
	private statusHandlerRegistered = false;

	override onWillAppear(ev: WillAppearEvent<TransportSettings>): void | Promise<void> {
		const fn = ev.payload.settings.function ?? "playStop";
		this.ensureStatusHandler();
		this.instances.set(ev.action.id, {
			action: ev.action,
			fn,
			blinkRecord: ev.payload.settings.blinkRecord,
			lit: false,
			lastTransport: undefined,
		});
		this.paint(ev.action.id);
		stateManager.subscribe(ev.action.id, "transport", (state) => {
			if (state.transport) this.onState(ev.action.id, state.transport);
		});
	}

	override onWillDisappear(ev: WillDisappearEvent<TransportSettings>): void {
		stateManager.unsubscribe(ev.action.id);
		this.stopBlink(ev.action.id);
		this.instances.delete(ev.action.id);
	}

	/** Settings can change while the key stays visible (Function dropdown, Blink Record checkbox) - not just on the next willAppear. Recomputes lit from the last cached poll so the icon updates immediately rather than waiting on (possibly never arriving, if transport state hasn't changed) the next poll tick. */
	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<TransportSettings>): void {
		const inst = this.instances.get(ev.action.id);
		if (!inst) return;
		const fn = ev.payload.settings.function ?? "playStop";
		const fnChanged = fn !== inst.fn;
		inst.fn = fn;
		inst.blinkRecord = ev.payload.settings.blinkRecord;
		if (fnChanged) inst.lit = inst.lastTransport ? this.isLit(fn, inst.lastTransport) : false;

		if (fn === "record" && inst.blinkRecord && inst.lit) this.startBlink(inst);
		else this.stopBlink(ev.action.id);

		this.paint(ev.action.id);
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

	private ensureStatusHandler(): void {
		if (this.statusHandlerRegistered) return;
		this.statusHandlerRegistered = true;
		connectionManager.onStatusChange((status) => {
			this.disconnected = status === "disconnected";
			for (const id of this.instances.keys()) this.paint(id);
		});
	}

	private onState(id: string, transport: TransportState): void {
		const inst = this.instances.get(id);
		if (!inst) return;
		inst.lastTransport = transport;
		const lit = this.isLit(inst.fn, transport);
		if (lit === inst.lit) return;
		inst.lit = lit;

		if (inst.fn === "record" && inst.blinkRecord) {
			if (lit) this.startBlink(inst);
			else this.stopBlink(id);
		}

		this.paint(id);
	}

	/** Repaints from current instance state - the only place setImage() is called, so lit/disconnected/blink can never race each other into an inconsistent icon. */
	private paint(id: string): void {
		const inst = this.instances.get(id);
		if (!inst) return;
		const icon = transportIcon(inst.fn, inst.lit);
		void inst.action.setImage(toImageParam(this.disconnected ? withDisconnectedBadge(icon) : icon));
	}

	private isLit(fn: TransportFunction, transport: TransportState): boolean {
		switch (fn) {
			case "play":
			case "playStop":
			case "playPause":
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

	private startBlink(inst: Instance): void {
		const id = inst.action.id;
		if (this.blinkTimers.has(id)) return;
		this.blinkPhase.set(id, true);
		const timer = setInterval(() => {
			const phase = !this.blinkPhase.get(id);
			this.blinkPhase.set(id, phase);
			const icon = transportIcon("record", phase);
			void inst.action.setImage(toImageParam(this.disconnected ? withDisconnectedBadge(icon) : icon));
		}, BLINK_INTERVAL_MS);
		this.blinkTimers.set(id, timer);
	}

	private stopBlink(actionId: string): void {
		const timer = this.blinkTimers.get(actionId);
		if (timer) clearInterval(timer);
		this.blinkTimers.delete(actionId);
		this.blinkPhase.delete(actionId);
	}
}
