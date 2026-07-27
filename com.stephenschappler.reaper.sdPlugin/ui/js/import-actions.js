// Action-list import UI (spec section 7.2). Talks to the plugin backend
// via sendToPlugin/sendToPropertyInspector, same transport as setup-panel.js
// and action-browser.js - see run-action.js for notes on the verified
// window.SDPIComponents.streamDeckClient API.
(function () {
	const client = window.SDPIComponents.streamDeckClient;

	const importBtn = document.getElementById("import-actions-btn");
	const fileInput = document.getElementById("import-actions-file");
	const statusEl = document.getElementById("import-status");
	const clearBtn = document.getElementById("clear-imported-btn");

	if (!importBtn || !fileInput || !statusEl || !clearBtn) return;

	function renderSummary(summary) {
		if (!summary) {
			statusEl.textContent = "No actions imported.";
			statusEl.className = "";
			clearBtn.classList.add("hidden");
			return;
		}
		statusEl.textContent = `Imported ${summary.count.toLocaleString()} actions, including ${summary.scriptCount.toLocaleString()} SWS and script actions.`;
		statusEl.className = "result-ok";
		clearBtn.classList.remove("hidden");
	}

	client.send("sendToPlugin", { event: "getImportedActionsSummary" });

	importBtn.addEventListener("click", () => fileInput.click());

	fileInput.addEventListener("change", () => {
		const file = fileInput.files && fileInput.files[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			statusEl.textContent = "Importing…";
			statusEl.className = "";
			client.send("sendToPlugin", { event: "importActions", raw: String(reader.result) });
		};
		reader.readAsText(file);
		fileInput.value = ""; // allow re-selecting the same file later
	});

	clearBtn.addEventListener("click", () => {
		client.send("sendToPlugin", { event: "clearImportedActions" });
	});

	client.sendToPropertyInspector.subscribe((msg) => {
		const payload = msg && msg.payload;
		if (!payload) return;
		if (payload.event === "importActionsResult") {
			if (payload.ok) {
				renderSummary({ count: payload.count, scriptCount: payload.scriptCount });
			} else {
				statusEl.textContent = `Import failed: ${payload.message}`;
				statusEl.className = "result-error";
			}
		} else if (payload.event === "importedActionsSummary") {
			renderSummary(payload.summary);
		}
	});
})();
