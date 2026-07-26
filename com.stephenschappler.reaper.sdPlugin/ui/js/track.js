(function () {
	const targetSelect = document.getElementById("track-target-select");
	const trackNumberItem = document.getElementById("track-number-item");

	function updateTrackNumberVisibility() {
		trackNumberItem.classList.toggle("hidden", targetSelect.value !== "number");
	}
	targetSelect.addEventListener("change", updateTrackNumberVisibility);
	setTimeout(updateTrackNumberVisibility, 200);
})();
