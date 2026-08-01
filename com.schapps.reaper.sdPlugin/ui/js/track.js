(function () {
	const client = window.SDPIComponents.streamDeckClient;

	const targetSelect = document.getElementById("track-target-select");
	const trackNumberItem = document.getElementById("track-number-item");
	const trackNumberField = document.getElementById("track-number-field");
	const trackNumberWarning = document.getElementById("track-number-warning");

	// sdpi-select/-textfield populate their own .value from a settings event
	// the sdpi-components v4 bundle fires exactly once, synchronously, the
	// moment the PI connects - confirmed by reading the actual bundle
	// source. Any field whose internal init hasn't subscribed to that event
	// yet at that exact instant misses it for good (no replay), leaving
	// .value stuck at undefined even though the field visibly shows its
	// default (a separate, render-only fallback to the `default=` attribute
	// that never touches the real .value). That race caused two bugs: the
	// Track Number field staying hidden on a freshly-added key (whose
	// dropdown reads as "number" from its default fallback but .value was
	// never actually set), and the out-of-range warning firing on a
	// perfectly valid number (Number(undefined) is NaN, and !NaN is true).
	// Track the real setting values ourselves via client.getSettings() /
	// didReceiveSettings instead of reading .value at load time.
	let trackTarget = "number";
	let trackNumber;
	let lastNtrack = null;
	let checkTimer = null;

	function updateTrackNumberVisibility() {
		trackNumberItem.classList.toggle("hidden", trackTarget !== "number");
		if (trackTarget !== "number") trackNumberWarning.classList.add("hidden");
	}

	// Track-number-out-of-range warning (spec section 11). NTRACK is only
	// known to the plugin backend (it comes from REAPER, not settings), so
	// this is a live round trip rather than a client-side check.
	function evaluateWarning() {
		if (trackTarget !== "number" || lastNtrack === null) {
			trackNumberWarning.classList.add("hidden");
			return;
		}
		const n = Number(trackNumber);
		trackNumberWarning.classList.toggle("hidden", !n || n < 1 || n > lastNtrack);
	}

	function applySettings(settings) {
		trackTarget = settings.trackTarget ?? "number";
		trackNumber = settings.trackNumber;
		updateTrackNumberVisibility();
		evaluateWarning();
	}

	client.getSettings().then(applySettings);
	client.didReceiveSettings.subscribe((ev) => applySettings(ev.payload.settings));

	// Once the user actually interacts, the native input's own change event
	// has already populated .value for real - safe to read directly here.
	targetSelect.addEventListener("change", () => {
		trackTarget = targetSelect.value;
		updateTrackNumberVisibility();
		evaluateWarning();
	});

	trackNumberField.addEventListener("change", () => {
		trackNumber = trackNumberField.value;
		evaluateWarning();
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

	// lastNtrack otherwise only refreshes on load or on a trackNumberField
	// edit - if the project's track count changes while the PI just sits
	// open (tracks added/removed in REAPER), the warning would silently go
	// stale until the user touches the field again. Keep it live instead.
	setInterval(() => {
		if (trackTarget === "number") client.send("sendToPlugin", { event: "getTrackCount" });
	}, 3000);
})();
