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
})();
