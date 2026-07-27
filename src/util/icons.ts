/**
 * Small hand-built SVG icons for state-bearing keys, passed directly to
 * Action.setImage() (which accepts an SVG string). Deliberately simple
 * geometric shapes rather than font glyphs - a shape always renders
 * identically everywhere, a Unicode glyph depends on font support we can't
 * verify. Real illustrated icon art is Milestone 7 (Polish); this is just
 * "off is the same shape at ~35% opacity" per spec section 9.
 */

const SIZE = 72;
const OFF_OPACITY = 0.35;
const BG = "#1e1e1e";

function svg(inner: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>${inner}</svg>`;
}

function opacityFor(lit: boolean): number {
	return lit ? 1 : OFF_OPACITY;
}

export type TransportFunction = "play" | "stop" | "pause" | "record" | "playStop" | "repeat" | "gotoStart" | "gotoEnd";

const TRANSPORT_COLOR: Record<TransportFunction, string> = {
	play: "#4CAF50",
	playStop: "#4CAF50",
	pause: "#4CAF50",
	repeat: "#4CAF50",
	stop: "#9CA4A4",
	gotoStart: "#9CA4A4",
	gotoEnd: "#9CA4A4",
	record: "#E04040",
};

/** `lit` is ignored for momentary functions (stop/gotoStart/gotoEnd) - they have no persistent state to reflect. */
export function transportIcon(fn: TransportFunction, lit: boolean): string {
	const color = TRANSPORT_COLOR[fn];
	const opacity = ["stop", "gotoStart", "gotoEnd"].includes(fn) ? 1 : opacityFor(lit);

	switch (fn) {
		case "play":
		case "playStop":
			return svg(`<polygon points="26,18 26,54 54,36" fill="${color}" opacity="${opacity}"/>`);
		case "pause":
			return svg(
				`<rect x="22" y="18" width="10" height="36" fill="${color}" opacity="${opacity}"/><rect x="40" y="18" width="10" height="36" fill="${color}" opacity="${opacity}"/>`,
			);
		case "record":
			return svg(`<circle cx="36" cy="36" r="17" fill="${color}" opacity="${opacity}"/>`);
		case "stop":
			return svg(`<rect x="21" y="21" width="30" height="30" fill="${color}" opacity="${opacity}"/>`);
		case "repeat":
			return svg(
				`<circle cx="36" cy="36" r="16" fill="none" stroke="${color}" stroke-width="6" opacity="${opacity}"/><polygon points="36,14 44,22 30,22" fill="${color}" opacity="${opacity}"/>`,
			);
		case "gotoStart":
			return svg(
				`<rect x="18" y="18" width="6" height="36" fill="${color}" opacity="${opacity}"/><polygon points="52,18 52,54 28,36" fill="${color}" opacity="${opacity}"/>`,
			);
		case "gotoEnd":
			return svg(
				`<rect x="48" y="18" width="6" height="36" fill="${color}" opacity="${opacity}"/><polygon points="20,18 20,54 44,36" fill="${color}" opacity="${opacity}"/>`,
			);
	}
}

export type TrackFunction = "recarm" | "mute" | "solo" | "select";

const TRACK_COLOR: Record<TrackFunction, string> = {
	recarm: "#E04040",
	mute: "#E0E040",
	solo: "#E0A030",
	select: "#5A9BD5",
};

export function trackIcon(fn: TrackFunction, lit: boolean): string {
	const color = TRACK_COLOR[fn];
	const opacity = opacityFor(lit);
	return svg(`<rect x="10" y="10" width="52" height="52" rx="10" fill="${color}" opacity="${opacity}"/>`);
}

/** Neutral "out of range" / "no target" icon for Track Control keys. */
export function trackInactiveIcon(): string {
	return svg(
		`<rect x="10" y="10" width="52" height="52" rx="10" fill="none" stroke="#666" stroke-width="4" opacity="0.5"/>`,
	);
}

const RUN_ACTION_COLOR = "#1C9E8E";

/** Matches design/icons/key-run-action.svg's mark - see tools/render-icons.ts for the static PNG fallback this mirrors. */
export function runActionIcon(configured: boolean): string {
	if (!configured) {
		// "Not configured" (spec section 11) - hollow ring only, dim, no center dot.
		return svg(`<circle cx="36" cy="36" r="18" fill="none" stroke="#666" stroke-width="5" opacity="0.5"/>`);
	}
	return svg(
		`<circle cx="36" cy="36" r="18" fill="none" stroke="${RUN_ACTION_COLOR}" stroke-width="5"/><circle cx="36" cy="36" r="6" fill="${RUN_ACTION_COLOR}"/>`,
	);
}

/**
 * Overlays a small corner badge on an already-rendered icon (spec section 9:
 * "a small badge in the corner, not a full icon replacement, so the key
 * remains recognizable"). Takes the icon as a finished SVG string and
 * splices the badge in just before the closing tag, rather than threading
 * a "disconnected" flag through every icon function.
 */
export function withDisconnectedBadge(iconSvg: string): string {
	const badge =
		'<circle cx="58" cy="58" r="12" fill="#E0A030"/>' +
		'<rect x="56.4" y="50.5" width="3.2" height="10" rx="1.6" fill="#1e1e1e"/>' +
		'<rect x="56.4" y="63" width="3.2" height="3.2" rx="1.6" fill="#1e1e1e"/>';
	return iconSvg.replace("</svg>", `${badge}</svg>`);
}
