/**
 * Display formatting for REAPER's raw TRACK numeric fields (see
 * docs/protocol-findings.md item 6) - not wire parsing, just turning already-
 * parsed values into the strings a Stream Deck key title shows.
 */

/** REAPER's linear track volume multiplier (1.0 = 0dB, 0 = -inf) as a signed dB string: "+3.5 dB", "-6.0 dB", "0.0 dB". */
export function formatVolumeDb(linear: number): string {
	if (linear <= 0) return "-∞ dB";
	const db = 20 * Math.log10(linear);
	const sign = db > 0 ? "+" : "";
	return `${sign}${db.toFixed(1)} dB`;
}

/** REAPER's track pan (-1..1) in REAPER's own mixer convention: "C" at center, otherwise "<n>L" / "<n>R". */
export function formatPan(pan: number): string {
	const pct = Math.round(pan * 100);
	if (pct === 0) return "C";
	return pct < 0 ? `${-pct}L` : `${pct}R`;
}
