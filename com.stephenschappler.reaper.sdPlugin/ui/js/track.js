(function () {
	const client = window.SDPIComponents.streamDeckClient;

	const targetSelect = document.getElementById("track-target-select");
	const trackNumberItem = document.getElementById("track-number-item");
	const trackNumberField = document.getElementById("track-number-field");
	const trackNumberWarning = document.getElementById("track-number-warning");

	function updateTrackNumberVisibility() {
		trackNumberItem.classList.toggle("hidden", targetSelect.value !== "number");
		if (targetSelect.value !== "number") trackNumberWarning.classList.add("hidden");
	}
	targetSelect.addEventListener("change", updateTrackNumberVisibility);
	setTimeout(updateTrackNumberVisibility, 200);

	// Track-number-out-of-range warning (spec section 11). NTRACK is only
	// known to the plugin backend (it comes from REAPER, not settings), so
	// this is a live round trip rather than a client-side check.
	let lastNtrack = null;
	let checkTimer = null;

	function evaluateWarning() {
		if (targetSelect.value !== "number" || lastNtrack === null) {
			trackNumberWarning.classList.add("hidden");
			return;
		}
		const n = Number(trackNumberField.value);
		trackNumberWarning.classList.toggle("hidden", !n || n < 1 || n > lastNtrack);
	}

	trackNumberField.addEventListener("change", () => {
		if (checkTimer) clearTimeout(checkTimer);
		checkTimer = setTimeout(() => {
			client.send("sendToPlugin", { event: "getTrackCount" });
		}, 150);
	});

	client.sendToPropertyInspector.subscribe((msg) => {
		const payload = msg && msg.payload;
		if (!payload || payload.event !== "trackCountResult") return;
		lastNtrack = payload.ntrack;
		evaluateWarning();
	});

	client.send("sendToPlugin", { event: "getTrackCount" });
})();
