import streamDeck, {
	action,
	KeyDownEvent,
	KeyUpEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import { connectionManager } from "../reaper/connection-manager.js";
import type { JsonObject } from "@elgato/utils";

/** Milestone 2 scope: manual ID entry only - no action browser/import yet. */
export interface RunActionSettings extends JsonObject {
	actionId?: string;
	actionName?: string;
	/** Only "main" is usable today - see docs/protocol-findings.md on section targeting. */
	section?: "main" | "midi_editor" | "media_explorer";
	repeatOnHold?: boolean;
	repeatIntervalMs?: number;
}

const REPEAT_INITIAL_DELAY_MS = 400;
const REPEAT_HARD_STOP_COUNT = 100;

@action({ UUID: "com.stephenschappler.reaper.runaction" })
export class RunAction extends SingletonAction<RunActionSettings> {
	private repeatTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private repeatCounts = new Map<string, number>();

	override onWillAppear(ev: WillAppearEvent<RunActionSettings>): void | Promise<void> {
		const title = ev.payload.settings.actionName || ev.payload.settings.actionId;
		if (title) return ev.action.setTitle(title);
	}

	override onWillDisappear(ev: WillDisappearEvent<RunActionSettings>): void {
		this.stopRepeating(ev.action.id);
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
