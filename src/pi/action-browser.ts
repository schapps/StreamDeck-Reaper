/**
 * Action browser modal for the Run Action PI (spec section 7.3). Runs in
 * the property inspector's browser context - built and bundled separately
 * from the plugin backend (see rollup.config.mjs's second output) so it can
 * import the same tested searchActions() ranking used in
 * tests/actiondb/search.test.ts, rather than a hand-duplicated copy that
 * could quietly drift from it.
 */

import { searchActions } from "../actiondb/search.js";
import type { ActionDatabase, ActionEntry } from "../actiondb/types.js";
import type { GlobalSettings } from "../reaper/global-settings.js";

interface ActionSettingsShape {
	actionId?: string;
	actionName?: string;
	[key: string]: unknown;
}

const DEBOUNCE_MS = 120;
const RECENTS_CAP = 20;
const RESULTS_LIMIT = 200; // render cap - the full DB can be thousands of rows

function requireEl<T extends Element>(id: string): T {
	const el = document.getElementById(id);
	if (!el) throw new Error(`action-browser.ts: expected element #${id} to exist in the PI markup`);
	return el as unknown as T;
}

function main(): void {
	// Only run on pages that actually have the action browser markup (run-action.html).
	if (!document.getElementById("action-browser-modal")) return;

	const client = (window as unknown as { SDPIComponents: { streamDeckClient: StreamDeckClient } }).SDPIComponents
		.streamDeckClient;

	const browseBtn = requireEl<HTMLButtonElement>("browse-actions-btn");
	const modal = requireEl<HTMLElement>("action-browser-modal");
	const closeBtn = requireEl<HTMLButtonElement>("action-browser-close");
	const searchInput = requireEl<HTMLInputElement>("action-search-input");
	const resultsEl = requireEl<HTMLElement>("action-results");
	const useIdInput = requireEl<HTMLInputElement>("use-id-directly-input");
	const useIdBtn = requireEl<HTMLButtonElement>("use-id-directly-btn");

	let allActions: ActionEntry[] | null = null;
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let selectedIndex = -1;

	async function loadActions(): Promise<ActionEntry[]> {
		if (allActions) return allActions;
		const [db, globalSettings] = await Promise.all([
			fetch("../data/actions-native.json").then((r) => r.json() as Promise<ActionDatabase>),
			client.getGlobalSettings<GlobalSettings>(),
		]);
		const imported = (globalSettings.importedActions ?? []).map((a) => ({ ...a, imported: true }));
		allActions = [...db.actions, ...imported];
		return allActions;
	}

	function openModal(): void {
		modal.classList.remove("hidden");
		searchInput.value = "";
		searchInput.focus();
		void loadActions().then(() => renderForQuery(""));
	}

	function closeModal(): void {
		modal.classList.add("hidden");
	}

	async function renderForQuery(query: string): Promise<void> {
		const actions = await loadActions();
		const settings = await client.getGlobalSettings<GlobalSettings>();
		const favorites = new Set(settings.favorites ?? []);
		const recents = settings.recentActions ?? [];

		resultsEl.innerHTML = "";
		selectedIndex = -1;

		if (query.trim() === "") {
			const byId = new Map(actions.map((a) => [a.id, a]));
			const recentEntries = recents.map((id) => byId.get(id)).filter((a): a is ActionEntry => !!a);
			const favoriteEntries = [...favorites].map((id) => byId.get(id)).filter((a): a is ActionEntry => !!a);

			appendGroup("Recently used", recentEntries, favorites);
			appendGroup(
				"Favorites",
				favoriteEntries.filter((a) => !recents.includes(a.id)),
				favorites,
			);
			return;
		}

		const results = searchActions(actions, query, { limit: RESULTS_LIMIT });
		appendGroup(undefined, results, favorites);
		if (results.length === 0) {
			const empty = document.createElement("div");
			empty.className = "action-empty";
			empty.textContent = "No matches - use “Use this ID directly” below.";
			resultsEl.appendChild(empty);
		}
	}

	function appendGroup(label: string | undefined, entries: ActionEntry[], favorites: Set<string>): void {
		if (entries.length === 0) return;
		if (label) {
			const heading = document.createElement("div");
			heading.className = "action-group-label";
			heading.textContent = label;
			resultsEl.appendChild(heading);
		}
		for (const entry of entries) {
			resultsEl.appendChild(buildRow(entry, favorites.has(entry.id)));
		}
	}

	function buildRow(entry: ActionEntry, isFavorite: boolean): HTMLElement {
		const row = document.createElement("div");
		row.className = "action-row";
		row.tabIndex = -1;
		row.dataset.id = entry.id;

		const star = document.createElement("span");
		star.className = "action-star";
		star.textContent = isFavorite ? "★" : "☆";
		star.addEventListener("click", (e: MouseEvent) => {
			e.stopPropagation();
			void toggleFavorite(entry.id);
		});

		const name = document.createElement("span");
		name.className = "action-name";
		name.textContent = entry.name;

		const id = document.createElement("span");
		id.className = "action-id";
		id.textContent = entry.id;

		const badge = document.createElement("span");
		badge.className = "action-badge";
		badge.textContent = entry.imported ? "imported" : "native";

		row.append(star, name, id, badge);
		row.addEventListener("click", () => void selectAction(entry));
		return row;
	}

	async function toggleFavorite(id: string): Promise<void> {
		const settings = await client.getGlobalSettings<GlobalSettings>();
		const favorites = new Set(settings.favorites ?? []);
		if (favorites.has(id)) favorites.delete(id);
		else favorites.add(id);
		await client.setGlobalSettings<GlobalSettings>({ ...settings, favorites: [...favorites] });
		void renderForQuery(searchInput.value);
	}

	async function pushRecent(id: string): Promise<void> {
		const settings = await client.getGlobalSettings<GlobalSettings>();
		const recents = (settings.recentActions ?? []).filter((r) => r !== id);
		recents.unshift(id);
		await client.setGlobalSettings<GlobalSettings>({
			...settings,
			recentActions: recents.slice(0, RECENTS_CAP),
		});
	}

	async function selectAction(entry: ActionEntry): Promise<void> {
		const current = await client.getSettings<ActionSettingsShape>();
		await client.setSettings<ActionSettingsShape>({ ...current, actionId: entry.id, actionName: entry.name });
		await pushRecent(entry.id);
		closeModal();
	}

	function getVisibleRows(): HTMLElement[] {
		return [...resultsEl.querySelectorAll<HTMLElement>(".action-row")];
	}

	function setSelected(index: number): void {
		const rows = getVisibleRows();
		if (rows.length === 0) return;
		selectedIndex = ((index % rows.length) + rows.length) % rows.length;
		for (const row of rows) row.classList.remove("selected");
		const row = rows[selectedIndex];
		row?.classList.add("selected");
		row?.scrollIntoView({ block: "nearest" });
	}

	browseBtn.addEventListener("click", openModal);
	closeBtn.addEventListener("click", closeModal);

	searchInput.addEventListener("input", () => {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => void renderForQuery(searchInput.value), DEBOUNCE_MS);
	});

	searchInput.addEventListener("keydown", (e: KeyboardEvent) => {
		if (e.key === "Escape") {
			closeModal();
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			setSelected(selectedIndex + 1);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setSelected(selectedIndex - 1);
		} else if (e.key === "Enter") {
			e.preventDefault();
			const rows = getVisibleRows();
			const target = rows[selectedIndex] ?? rows[0];
			const id = target?.dataset.id;
			if (id && allActions) {
				const entry = allActions.find((a) => a.id === id);
				if (entry) void selectAction(entry);
			}
		}
	});

	useIdBtn.addEventListener("click", () => {
		const id = useIdInput.value.trim();
		if (!id) return;
		void selectAction({ id, name: id, section: "main", tags: [] });
	});

	modal.addEventListener("click", (e: MouseEvent) => {
		if (e.target === modal) closeModal();
	});
}

/** Minimal shape of window.SDPIComponents.streamDeckClient actually used here - verified against the real v4.0.1 bundle, see CLAUDE.md. */
interface StreamDeckClient {
	getGlobalSettings<T>(): Promise<T>;
	setGlobalSettings<T>(settings: T): Promise<void>;
	getSettings<T>(): Promise<T>;
	setSettings<T>(settings: T): Promise<void>;
}

main();
