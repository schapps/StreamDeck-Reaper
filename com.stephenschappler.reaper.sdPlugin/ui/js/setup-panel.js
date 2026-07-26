// Shared setup-panel + Test Connection behavior for every action's PI.
// Requires the host page to define the elements with these ids:
//   #setup-instructions, #connected-status, #show-setup-btn,
//   #test-connection-btn, #test-connection-result-item, #test-connection-result
// See docs on window.SDPIComponents.streamDeckClient in run-action.js.
(function () {
	const client = window.SDPIComponents.streamDeckClient;
	window.reaperSetupPanel = { client };

	const setupInstructions = document.getElementById("setup-instructions");
	const connectedStatus = document.getElementById("connected-status");
	const testBtn = document.getElementById("test-connection-btn");
	const resultItem = document.getElementById("test-connection-result-item");
	const resultEl = document.getElementById("test-connection-result");
	const showSetupBtn = document.getElementById("show-setup-btn");

	function applySetupVisibility(settings) {
		const collapsed = !!(settings && settings.hasConnectedOnce);
		setupInstructions.classList.toggle("hidden", collapsed);
		connectedStatus.classList.toggle("hidden", !collapsed);
	}

	client.getGlobalSettings().then(applySetupVisibility);
	client.didReceiveGlobalSettings.subscribe((msg) => applySetupVisibility(msg.payload.settings));

	if (showSetupBtn) {
		showSetupBtn.addEventListener("click", () => {
			setupInstructions.classList.remove("hidden");
			connectedStatus.classList.add("hidden");
		});
	}

	if (testBtn) {
		testBtn.addEventListener("click", () => {
			testBtn.disabled = true;
			resultItem.classList.remove("hidden");
			resultEl.textContent = "Testing…";
			resultEl.className = "";
			client.send("sendToPlugin", { event: "testConnection" });
		});
	}

	client.sendToPropertyInspector.subscribe((msg) => {
		const payload = msg && msg.payload;
		if (!payload || payload.event !== "testConnectionResult") return;
		testBtn.disabled = false;
		resultEl.textContent = payload.message;
		resultEl.className = payload.status === "success" ? "result-ok" : "result-error";
	});
})();
