// Run Action-specific PI behavior. Setup panel / Test Connection logic
// lives in js/setup-panel.js, shared across every action type's PI.
(function () {
	const repeatCheckbox = document.getElementById("repeat-checkbox");
	const repeatIntervalItem = document.getElementById("repeat-interval-item");

	function updateRepeatIntervalVisibility() {
		repeatIntervalItem.classList.toggle("hidden", !repeatCheckbox.value);
	}
	repeatCheckbox.addEventListener("change", updateRepeatIntervalVisibility);
	// Settings load asynchronously into the component after connect - one deferred check covers it.
	setTimeout(updateRepeatIntervalVisibility, 200);

	// Action ID field hint (spec section 11): empty -> neutral nudge,
	// non-empty but not found in the DB -> warning. Existence checked against
	// window.ReaperActionDB, set up by js/action-browser.js (loaded before
	// this script - see the <script> order in run-action.html).
	const actionIdField = document.getElementById("action-id-field");
	const hintItem = document.getElementById("action-id-hint-item");
	const hintEl = document.getElementById("action-id-hint");
	let checkTimer = null;

	function showHint(text, warning) {
		hintEl.textContent = text;
		hintEl.className = warning ? "hint hint-warning" : "hint";
		hintItem.classList.remove("hidden");
	}

	function checkActionId() {
		const id = actionIdField.value;
		if (!id) {
			showHint("Enter an action ID, or use Browse Actions below.", false);
			return;
		}
		if (!window.ReaperActionDB) {
			hintItem.classList.add("hidden");
			return;
		}
		window.ReaperActionDB.actionExists(id).then((exists) => {
			if (actionIdField.value !== id) return; // field changed again while we were checking
			if (exists) hintItem.classList.add("hidden");
			else showHint("This ID isn't in your action list. It may still work - import your action list to confirm.", true);
		});
	}

	actionIdField.addEventListener("change", () => {
		if (checkTimer) clearTimeout(checkTimer);
		checkTimer = setTimeout(checkActionId, 150);
	});
	setTimeout(checkActionId, 300); // settings load asynchronously - check once the field has a value
})();
