(function () {
	const functionSelect = document.getElementById("function-select");
	const blinkRecordItem = document.getElementById("blink-record-item");

	function updateBlinkVisibility() {
		blinkRecordItem.classList.toggle("hidden", functionSelect.value !== "record");
	}
	functionSelect.addEventListener("change", updateBlinkVisibility);
	setTimeout(updateBlinkVisibility, 200);
})();
