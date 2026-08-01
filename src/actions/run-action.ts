import streamDeck, {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	KeyUpEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import { connectionManager } from "../reaper/connection-manager.js";
import { runActionIcon, toImageParam, withDisconnectedBadge } from "../util/icons.js";
import type { JsonObject } from "@elgato/utils";

/** Milestone 2 scope: manual ID entry only - no action browser/import yet. */
export interface RunActionSettings extends JsonObject {
	actionId?: string;
	actionName?: string;
	repeatOnHold?: boolean;
	repeatIntervalMs?: number;
}

type RunActionKeyAction = WillAppearEvent<RunActionSettings>["action"];

interface Instance {
	action: RunActionKeyAction;
	configured: boolean;
}

const REPEAT_INITIAL_DELAY_MS = 400;
const REPEAT_HARD_STOP_COUNT = 100;

@action({ UUID: "com.schapps.reaper.runaction" })
export class RunAction extends SingletonAction<RunActionSettings> {
	private instances = new Map<string, Instance>();
	private repeatTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private repeatCounts = new Map<string, number>();
	private disconnected = connectionManager.current.status === "disconnected";
	private statusHandlerRegistered = false;

	override onWillAppear(ev: WillAppearEvent<RunActionSettings>): void | Promise<void> {
		this.ensureStatusHandler();
		this.instances.set(ev.action.id, { action: ev.action, configured: !!ev.payload.settings.actionId });
		this.render(ev.action, ev.payload.settings);
	}

	override onWillDisappear(ev: WillDisappearEvent<RunActionSettings>): void {
		this.stopRepeating(ev.action.id);
		this.instances.delete(ev.action.id);
	}

	/** Settings can change while the key stays visible (e.g. picked from the action browser, or edited in the PI) - not just on the next willAppear. */
	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<RunActionSettings>): void {
		this.render(ev.action, ev.payload.settings);
	}

	override async onKeyDown(ev: KeyDownEvent<RunActionSettings>): Promise<void> {
		const { actionId, repeatOnHold, repeatIntervalMs } = ev.payload.settings;

		if (!actionId) {
			streamDeck.logger.warn(`Run Action ${ev.action.id} pressed with no actionId configured.`);
			await ev.action.showAlert();
			return;
		}

		await this.fire(ev.action, actionId);

		if (repeatOnHold) {
			this.repeatCounts.set(ev.action.id, 0);
			const timer = setTimeout(
				() => this.repeatTick(ev.action, actionId, repeatIntervalMs || 100),
				REPEAT_INITIAL_DELAY_MS,
			);
			this.repeatTimers.set(ev.action.id, timer);
		}
	}

	override onKeyUp(ev: KeyUpEvent<RunActionSettings>): void {
		this.stopRepeating(ev.action.id);
	}

	private ensureStatusHandler(): void {
		if (this.statusHandlerRegistered) return;
		this.statusHandlerRegistered = true;
		connectionManager.onStatusChange((status) => {
			this.disconnected = status === "disconnected";
			for (const inst of this.instances.values()) {
				void inst.action.setImage(this.iconFor(inst.configured));
			}
		});
	}

	private render(keyAction: RunActionKeyAction, settings: RunActionSettings): void {
		const configured = !!settings.actionId;
		const inst = this.instances.get(keyAction.id);
		if (inst) inst.configured = configured;
		void keyAction.setImage(this.iconFor(configured));
		void keyAction.setTitle(settings.actionName || settings.actionId || "");
	}

	private iconFor(configured: boolean): string {
		const icon = runActionIcon(configured);
		return toImageParam(this.disconnected ? withDisconnectedBadge(icon) : icon);
	}

	private async fire(action: KeyDownEvent<RunActionSettings>["action"], actionId: string): Promise<void> {
		try {
			await connectionManager.current.runCommands([actionId]);
			await action.showOk();
		} catch (e) {
			streamDeck.logger.error(`Failed to run REAPER action "${actionId}": ${errorMessage(e)}`);
			await action.showAlert();
		}
	}

	private repeatTick(
		action: KeyDownEvent<RunActionSettings>["action"],
		actionId: string,
		intervalMs: number,
	): void {
		const count = (this.repeatCounts.get(action.id) ?? 0) + 1;
		this.repeatCounts.set(action.id, count);
		void this.fire(action, actionId);

		// Guard against a missed keyUp turning this into a runaway repeat.
		if (count >= REPEAT_HARD_STOP_COUNT) {
			this.stopRepeating(action.id);
			return;
		}

		const timer = setTimeout(() => this.repeatTick(action, actionId, intervalMs), intervalMs);
		this.repeatTimers.set(action.id, timer);
	}

	private stopRepeating(actionId: string): void {
		const timer = this.repeatTimers.get(actionId);
		if (timer) clearTimeout(timer);
		this.repeatTimers.delete(actionId);
		this.repeatCounts.delete(actionId);
	}
}

function errorMessage(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}
