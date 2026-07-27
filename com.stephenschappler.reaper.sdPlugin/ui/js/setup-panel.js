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
	const copyDiagnosticsBtn = document.getElementById("copy-diagnostics-btn");

	// Visibility depends on both the sticky "has this plugin ever connected"
	// setting AND the live connection status pushed from the plugin backend
	// (src/plugin.ts's connectionManager.onStatusChange forwarding) - settings
	// alone can't represent "was connected before, but the connection just
	// dropped," which spec sections 4 and 11 both call out explicitly.
	let hasConnectedOnce = false;
	let liveStatus = null;

	function applySetupVisibility() {
		const collapsed = liveStatus === "disconnected" ? false : hasConnectedOnce;
		setupInstructions.classList.toggle("hidden", collapsed);
		connectedStatus.classList.toggle("hidden", !collapsed);
	}

	client.getGlobalSettings().then((settings) => {
		hasConnectedOnce = !!(settings && settings.hasConnectedOnce);
		applySetupVisibility();
	});
	client.didReceiveGlobalSettings.subscribe((msg) => {
		hasConnectedOnce = !!(msg.payload.settings && msg.payload.settings.hasConnectedOnce);
		applySetupVisibility();
	});
	client.send("sendToPlugin", { event: "getConnectionStatus" }); // current status on PI open, not just future changes

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
		if (!payload) return;
		if (payload.event === "testConnectionResult") {
			testBtn.disabled = false;
			resultEl.textContent = payload.message;
			resultEl.className = payload.status === "success" ? "result-ok" : "result-error";
		} else if (payload.event === "diagnosticLogResult" && pendingDiagnosticsResolve) {
			pendingDiagnosticsResolve(payload.lines);
			pendingDiagnosticsResolve = null;
		} else if (payload.event === "connectionStatusChanged") {
			liveStatus = payload.status;
			applySetupVisibility();
		}
	});

	// "Copy diagnostics" (spec section 11) - plugin version, OS, Stream Deck
	// version, connection settings (password redacted), and the last 20 log
	// lines, all in one clipboard paste for support requests. REAPER's own
	// version isn't included - there's no protocol command to query it (see
	// docs/protocol-findings.md).
	let pendingDiagnosticsResolve = null;

	function requestLogLines() {
		return new Promise((resolve) => {
			pendingDiagnosticsResolve = resolve;
			client.send("sendToPlugin", { event: "getDiagnosticLog" });
		});
	}

	function buildDiagnosticsReport(connectionInfo, settings, lines) {
		const app = (connectionInfo.info && connectionInfo.info.application) || {};
		const plugin = (connectionInfo.info && connectionInfo.info.plugin) || {};
		const auth = settings.username ? " (username/password configured)" : "";
		return [
			"REAPER Control diagnostics",
			`Plugin version: ${plugin.version || "unknown"}`,
			`OS: ${[app.platform, app.platformVersion].filter(Boolean).join(" ") || "unknown"}`,
			`Stream Deck version: ${app.version || "unknown"}`,
			"REAPER version: unknown (not exposed by REAPER's web interface)",
			`Connection: ${settings.host || "localhost"}:${settings.port || 8080}${auth}`,
			"",
			`Last ${lines.length} log lines:`,
			...(lines.length ? lines : ["(none)"]),
		].join("\n");
	}

	if (copyDiagnosticsBtn) {
		copyDiagnosticsBtn.addEventListener("click", async () => {
			const originalLabel = copyDiagnosticsBtn.textContent;
			copyDiagnosticsBtn.disabled = true;
			copyDiagnosticsBtn.textContent = "Copying…";
			try {
				const [connectionInfo, settings, lines] = await Promise.all([
					client.getConnectionInfo(),
					client.getGlobalSettings(),
					requestLogLines(),
				]);
				await navigator.clipboard.writeText(buildDiagnosticsReport(connectionInfo, settings, lines));
				copyDiagnosticsBtn.textContent = "Copied!";
			} catch (e) {
				copyDiagnosticsBtn.textContent = "Copy failed";
			} finally {
				setTimeout(() => {
					copyDiagnosticsBtn.disabled = false;
					copyDiagnosticsBtn.textContent = originalLabel;
				}, 2000);
			}
		});
	}
})();
