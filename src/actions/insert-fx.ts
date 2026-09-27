import streamDeck, {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { addFxRequest, callBridge, type FxTarget, type FxWindow } from "../reaper/bridge.js";
import { connectionManager } from "../reaper/connection-manager.js";
import { insertFxIcon, toImageParam, withDisconnectedBadge } from "../util/icons.js";

export interface InsertFxSettings extends JsonObject {
	/** The string handed to TrackFX_AddByName - an FxEntry id from the FX browser. */
	fxId?: string;
	/** Key label, prefilled from the picked FX's short name. */
	fxLabel?: string;
	trackTarget?: "selected" | "number" | "master";
	trackNumber?: number;
	fxWindow?: FxWindow;
}

type InsertFxKeyAction = WillAppearEvent<InsertFxSettings>["action"];

interface Instance {
	action: InsertFxKeyAction;
	configured: boolean;
}

/**
 * Inserts an FX or FX chain through the bridge ReaScript - REAPER's web
 * interface has no FX commands of its own (docs/protocol-findings.md).
 */
@action({ UUID: "com.schapps.reaper.insertfx" })
export class InsertFx extends SingletonAction<InsertFxSettings> {
	private instances = new Map<string, Instance>();
	private disconnected = connectionManager.current.status === "disconnected";
	private statusHandlerRegistered = false;

	override onWillAppear(ev: WillAppearEvent<InsertFxSettings>): void {
		this.ensureStatusHandler();
		this.instances.set(ev.action.id, { action: ev.action, configured: !!ev.payload.settings.fxId });
		this.render(ev.action, ev.payload.settings);
	}

	override onWillDisappear(ev: WillDisappearEvent<InsertFxSettings>): void {
		this.instances.delete(ev.action.id);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<InsertFxSettings>): void {
		this.render(ev.action, ev.payload.settings);
	}

	override async onKeyDown(ev: KeyDownEvent<InsertFxSettings>): Promise<void> {
		const settings = ev.payload.settings;
		if (!settings.fxId) {
			streamDeck.logger.warn(`Insert FX ${ev.action.id} pressed with no FX configured.`);
			await ev.action.showAlert();
			return;
		}

		const target = targetFor(settings);
		if (!target) {
			streamDeck.logger.warn(`Insert FX ${ev.action.id} has an invalid track number: ${settings.trackNumber}`);
			await ev.action.showAlert();
			return;
		}

		try {
			const result = await callBridge(
				connectionManager.current,
				addFxRequest(settings.fxId, target, settings.fxWindow ?? "none"),
			);
			switch (result.status) {
				case "ok":
					streamDeck.logger.info(`Inserted "${result.fields[1] ?? settings.fxId}" on ${result.fields[0]} track(s).`);
					return;
				case "error":
					streamDeck.logger.warn(`Insert FX "${settings.fxId}" failed: ${result.message}`);
					break;
				case "notSetUp":
					streamDeck.logger.warn("Insert FX pressed, but the REAPER bridge script hasn't been set up yet.");
					break;
				case "noResponse":
					streamDeck.logger.warn(
						"The REAPER bridge script didn't respond - it may have been removed, or this is a different REAPER install.",
					);
					break;
			}
		} catch (e) {
			streamDeck.logger.error(`Insert FX "${settings.fxId}" request failed: ${e instanceof Error ? e.message : String(e)}`);
		}
		await ev.action.showAlert();
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

	private render(keyAction: InsertFxKeyAction, settings: InsertFxSettings): void {
		const configured = !!settings.fxId;
		const inst = this.instances.get(keyAction.id);
		if (inst) inst.configured = configured;
		void keyAction.setImage(this.iconFor(configured));
		void keyAction.setTitle(settings.fxLabel || "");
	}

	private iconFor(configured: boolean): string {
		const icon = insertFxIcon(configured);
		return toImageParam(this.disconnected ? withDisconnectedBadge(icon) : icon);
	}
}

function targetFor(settings: InsertFxSettings): FxTarget | undefined {
	switch (settings.trackTarget ?? "selected") {
		case "selected":
			return { kind: "selected" };
		case "master":
			return { kind: "master" };
		case "number": {
			const n = Number(settings.trackNumber);
			return Number.isInteger(n) && n >= 1 ? { kind: "track", number: n } : undefined;
		}
	}
}
