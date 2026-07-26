// Verified against the real sdpi-components v4.0.1 bundle - see
// docs/protocol-findings.md is the REAPER-protocol equivalent of this note.
// window.SDPIComponents.streamDeckClient exposes:
//   getGlobalSettings() -> Promise<settings>
//   setGlobalSettings(settings)
//   send(event, payload)                          - e.g. send("sendToPlugin", {...})
//   sendToPropertyInspector.subscribe(fn)          - fn receives the full {event, payload, ...} message
//   didReceiveGlobalSettings.subscribe(fn)         - same shape, fires on any global settings change
(function () {
	const client = window.SDPIComponents.streamDeckClient;

	const setupInstructions = document.getElementById("setup-instructions");
	const connectedStatus = document.getElementById("connected-status");
	const testBtn = document.getElementById("test-connection-btn");
	const resultItem = document.getElementById("test-connection-result-item");
	const resultEl = document.getElementById("test-connection-result");
	const showSetupBtn = document.getElementById("show-setup-btn");
	const repeatCheckbox = document.getElementById("repeat-checkbox");
	const repeatIntervalItem = document.getElementById("repeat-interval-item");

	function applySetupVisibility(settings) {
		const collapsed = !!(settings && settings.hasConnectedOnce);
		setupInstructions.classList.toggle("hidden", collapsed);
		connectedStatus.classList.toggle("hidden", !collapsed);
	}

	client.getGlobalSettings().then(applySetupVisibility);
	client.didReceiveGlobalSettings.subscribe((msg) => applySetupVisibility(msg.payload.settings));

	showSetupBtn.addEventListener("click", () => {
		setupInstructions.classList.remove("hidden");
		connectedStatus.classList.add("hidden");
	});

	testBtn.addEventListener("click", () => {
		testBtn.disabled = true;
		resultItem.classList.remove("hidden");
		resultEl.textContent = "Testing…";
		resultEl.className = "";
		client.send("sendToPlugin", { event: "testConnection" });
	});

	client.sendToPropertyInspector.subscribe((msg) => {
		const payload = msg && msg.payload;
		if (!payload || payload.event !== "testConnectionResult") return;
		testBtn.disabled = false;
		resultEl.textContent = payload.message;
		resultEl.className = payload.status === "success" ? "result-ok" : "result-error";
	});

	function updateRepeatIntervalVisibility() {
		repeatIntervalItem.classList.toggle("hidden", !repeatCheckbox.value);
	}
	repeatCheckbox.addEventListener("change", updateRepeatIntervalVisibility);
	// Settings load asynchronously into the component after connect - one deferred check covers it.
	setTimeout(updateRepeatIntervalVisibility, 200);
})();
