/**
 * Shared PI-side helpers for talking to sdpi-components v4.0.1 - used by
 * both the action browser and the FX browser.
 */

/** Minimal shape of window.SDPIComponents.streamDeckClient actually used - verified against the real v4.0.1 bundle, see CLAUDE.md. */
export interface StreamDeckClient {
	getGlobalSettings<T>(): Promise<T>;
	setGlobalSettings<T>(settings: T): Promise<void>;
	getSettings<T>(): Promise<T>;
	setSettings<T>(settings: T): Promise<void>;
	send(event: "sendToPlugin", payload: unknown): Promise<void>;
	didReceiveSettings: { subscribe(handler: (msg: { payload: { settings: unknown } }) => void): void };
	sendToPropertyInspector: { subscribe(handler: (msg: { payload: unknown }) => void): void };
}

export function streamDeckClient(): StreamDeckClient {
	return (window as unknown as { SDPIComponents: { streamDeckClient: StreamDeckClient } }).SDPIComponents
		.streamDeckClient;
}

export function requireEl<T extends Element>(id: string): T {
	const el = document.getElementById(id);
	if (!el) throw new Error(`expected element #${id} to exist in the PI markup`);
	return el as unknown as T;
}

/**
 * sdpi-textfield renders `<input @input="${t => this.value = t.target.value}">`
 * inside an open shadow root (confirmed against the real sdpi-components
 * v4.0.1 bundle source) - that's the ONLY path that updates the
 * component's own displayed value. Setting the outer custom element's
 * `.value` property directly does not reliably reach it. So: find the
 * real inner <input>, set ITS value, and dispatch a genuine 'input'
 * event on it - the exact same path actual typing takes, not a
 * best-effort imitation of it.
 */
export function setFieldValue(elementId: string, value: string): void {
	const el = document.getElementById(elementId) as (HTMLElement & { value?: string }) | null;
	if (!el) return;
	const innerInput = el.shadowRoot?.querySelector("input");
	if (innerInput) {
		innerInput.value = value;
		innerInput.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
	} else {
		// Fallback for an unexpected shadow DOM shape - better than nothing.
		el.value = value;
	}
	el.dispatchEvent(new Event("change", { bubbles: true }));
}
