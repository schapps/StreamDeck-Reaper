/**
 * Insert FX property inspector: bridge-setup status plus the FX browser
 * modal. The FX list comes from the plugin backend ("getFxList"), which
 * asks the bridge script for the running REAPER's resource folder and scans
 * its plugin caches there (src/fxdb/). Search reuses the tested
 * searchActions() ranking.
 */

import { searchActions } from "../actiondb/search.js";
import type { FxEntry, FxKind } from "../fxdb/types.js";
import type { GlobalSettings } from "../reaper/global-settings.js";
import { requireEl, setFieldValue, streamDeckClient } from "./sdpi.js";

interface InsertFxSettingsShape {
	fxName?: string;
	[key: string]: unknown;
}

interface FxListResult {
	event: "fxListResult";
	status: "ok" | "notSetUp" | "noResponse" | "error" | "unreachable";
	entries?: FxEntry[];
	resourcePath?: string;
	scriptPath?: string;
}

type KindFilter = "all" | "effects" | "instruments" | "JS" | "Chain";

const DEBOUNCE_MS = 120;
const RECENTS_CAP = 20;
const RESULTS_LIMIT = 200;

const PLUGIN_KINDS: FxKind[] = ["VST", "VST3", "AU", "CLAP"];

function main(): void {
	const client = streamDeckClient();

	const setupSection = requireEl<HTMLElement>("bridge-setup");
	const setupStatus = requireEl<HTMLElement>("bridge-status");
	const revealBtn = requireEl<HTMLButtonElement>("reveal-script-btn");
	const checkAgainBtn = requireEl<HTMLButtonElement>("check-bridge-btn");
	const readyLine = requireEl<HTMLElement>("bridge-ready");
	const refreshBtn = requireEl<HTMLButtonElement>("refresh-fx-btn");

	const fxNameEl = requireEl<HTMLElement>("fx-name");
	const browseBtn = requireEl<HTMLButtonElement>("browse-fx-btn");
	const modal = requireEl<HTMLElement>("fx-browser-modal");
	const closeBtn = requireEl<HTMLButtonElement>("fx-browser-close");
	const searchInput = requireEl<HTMLInputElement>("fx-search-input");
	const kindSelect = requireEl<HTMLSelectElement>("fx-kind-select");
	const resultsEl = requireEl<HTMLElement>("fx-results");

	let entries: FxEntry[] = [];
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let selectedIndex = -1;

	void client.getSettings<InsertFxSettingsShape>().then((s) => showFxName(s.fxName));
	client.didReceiveSettings.subscribe((msg) => showFxName((msg.payload.settings as InsertFxSettingsShape).fxName));

	function showFxName(fxName: string | undefined): void {
		fxNameEl.textContent = fxName || "None - use Browse FX below.";
		fxNameEl.classList.toggle("hint", !fxName);
	}

	// --- Bridge status / FX list ---------------------------------------------

	function requestFxList(): void {
		setupStatus.textContent = "Checking REAPER…";
		client.send("sendToPlugin", { event: "getFxList" });
	}

	function applyFxList(result: FxListResult): void {
		const ready = result.status === "ok";
		setupSection.classList.toggle("hidden", ready);
		readyLine.classList.toggle("hidden", !ready);
		browseBtn.disabled = !ready;
		if (result.status === "ok") {
			entries = result.entries ?? [];
			readyLine.firstElementChild!.textContent = `${entries.length} FX found in ${result.resourcePath ?? "REAPER"}`;
			return;
		}
		setupStatus.className = "hint hint-warning";
		setupStatus.textContent = {
			notSetUp: "The bridge script isn't set up yet.",
			noResponse:
				"The bridge script didn't respond. Load it again (steps above) - it may have been removed, or this is a different REAPER install.",
			error: "The bridge script reported an error. Try loading it again.",
			unreachable: "Couldn't reach REAPER. Is it running with the web interface enabled?",
		}[result.status];
	}

	client.sendToPropertyInspector.subscribe((msg) => {
		const payload = msg.payload as { event?: string } | undefined;
		if (payload?.event === "fxListResult") applyFxList(payload as FxListResult);
	});

	revealBtn.addEventListener("click", () => void client.send("sendToPlugin", { event: "revealBridgeScript" }));
	checkAgainBtn.addEventListener("click", requestFxList);
	refreshBtn.addEventListener("click", requestFxList);
	requestFxList();

	// --- Browser modal -------------------------------------------------------

	function openModal(): void {
		modal.classList.remove("hidden");
		searchInput.value = "";
		searchInput.focus();
		void renderForQuery("");
	}

	function closeModal(): void {
		modal.classList.add("hidden");
	}

	function matchesKind(entry: FxEntry, filter: KindFilter): boolean {
		switch (filter) {
			case "all":
				return true;
			case "effects":
				return PLUGIN_KINDS.includes(entry.kind) && !entry.instrument;
			case "instruments":
				return entry.instrument;
			default:
				return entry.kind === filter;
		}
	}

	async function renderForQuery(query: string): Promise<void> {
		const filter = kindSelect.value as KindFilter;
		const pool = entries.filter((e) => matchesKind(e, filter));
		resultsEl.innerHTML = "";
		selectedIndex = -1;

		if (query.trim() === "") {
			const settings = await client.getGlobalSettings<GlobalSettings>();
			const byId = new Map(pool.map((e) => [e.id, e]));
			const recents = (settings.recentFx ?? []).map((id) => byId.get(id)).filter((e): e is FxEntry => !!e);
			appendGroup("Recently used", recents);
			appendGroup(recents.length ? "All" : undefined, pool.slice(0, RESULTS_LIMIT));
			return;
		}

		const results = searchActions(pool, query, { limit: RESULTS_LIMIT });
		appendGroup(undefined, results);
		if (results.length === 0) {
			const empty = document.createElement("div");
			empty.className = "action-empty";
			empty.textContent = "No matches. Rescanned plugins in REAPER? Use Refresh list.";
			resultsEl.appendChild(empty);
		}
	}

	function appendGroup(label: string | undefined, group: FxEntry[]): void {
		if (group.length === 0) return;
		if (label) {
			const heading = document.createElement("div");
			heading.className = "action-group-label";
			heading.textContent = label;
			resultsEl.appendChild(heading);
		}
		for (const entry of group) resultsEl.appendChild(buildRow(entry));
	}

	function buildRow(entry: FxEntry): HTMLElement {
		const row = document.createElement("div");
		row.className = "action-row";
		row.tabIndex = -1;
		row.dataset.id = entry.id;

		const name = document.createElement("span");
		name.className = "action-name";
		name.textContent = entry.name;
		name.title = entry.name;

		const badge = document.createElement("span");
		badge.className = "action-badge";
		badge.textContent = entry.kind === "Chain" ? "chain" : entry.instrument ? "instrument" : entry.kind;

		row.append(name, badge);
		row.addEventListener("click", () => void selectFx(entry));
		return row;
	}

	/**
	 * Every setting is written through a bound sdpi-textfield (fxId and fxName
	 * are hidden ones), never client.setSettings(). The bundle's settings store
	 * (class Yt in sdpi-components v4.0.1) keeps its own copy, refreshed only
	 * by didReceiveSettings, and saves that whole copy whenever any bound field
	 * changes - so a direct setSettings() of fxId was overwritten 250ms later
	 * by the Key Label field saving the stale copy, leaving the key labeled
	 * with the new FX but inserting the previous one. Confirmed live and by
	 * reading the bundle source.
	 */
	async function selectFx(entry: FxEntry): Promise<void> {
		setFieldValue("fx-id-field", entry.id);
		setFieldValue("fx-name-field", entry.name);
		setFieldValue("fx-label-field", shortName(entry));
		showFxName(entry.name);

		const settings = await client.getGlobalSettings<GlobalSettings>();
		const recents = (settings.recentFx ?? []).filter((id) => id !== entry.id);
		recents.unshift(entry.id);
		await client.setGlobalSettings<GlobalSettings>({ ...settings, recentFx: recents.slice(0, RECENTS_CAP) });
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
	kindSelect.addEventListener("change", () => void renderForQuery(searchInput.value));

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
			const id = (rows[selectedIndex] ?? rows[0])?.dataset.id;
			const entry = entries.find((x) => x.id === id);
			if (entry) void selectFx(entry);
		}
	});

	modal.addEventListener("click", (e: MouseEvent) => {
		if (e.target === modal) closeModal();
	});
}

/** Key label: "VST3: Brusfri (Klevgrand)" -> "Brusfri", "Chain: Vocals/Lead" -> "Lead". */
function shortName(entry: FxEntry): string {
	const withoutPrefix = entry.name.replace(/^[^:]+:\s*/, "");
	if (entry.kind === "Chain") return withoutPrefix.split("/").pop() ?? withoutPrefix;
	const paren = withoutPrefix.indexOf(" (");
	return paren > 0 ? withoutPrefix.slice(0, paren) : withoutPrefix;
}

main();
