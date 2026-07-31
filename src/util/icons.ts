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

function svg(inner: string, bg: string = BG): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><rect width="${SIZE}" height="${SIZE}" fill="${bg}"/>${inner}</svg>`;
}

function opacityFor(lit: boolean): number {
	return lit ? 1 : OFF_OPACITY;
}

/**
 * setImage() docs (@elgato/streamdeck) list a bare SVG string as a legal
 * image format alongside a base64-encoded data URI, but only the latter has
 * been confirmed to actually render on Windows - a bare `<svg>` string sends
 * successfully (the setImage() promise resolves) yet is silently never
 * painted, leaving the manifest's static key art on screen forever. Encode
 * as a proper data URI at the last possible moment (call sites, not inside
 * icons.ts) so withDisconnectedBadge()'s `</svg>` string-splice still has
 * raw markup to work with.
 */
export function toImageParam(svgMarkup: string): string {
	return `data:image/svg+xml;base64,${Buffer.from(svgMarkup, "utf-8").toString("base64")}`;
}

export type TransportFunction =
	| "play"
	| "stop"
	| "pause"
	| "record"
	| "playStop"
	| "playPause"
	| "repeat"
	| "gotoStart"
	| "gotoEnd";

const TRANSPORT_COLOR: Record<TransportFunction, string> = {
	play: "#4CAF50",
	playStop: "#4CAF50",
	playPause: "#4CAF50",
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
		case "playPause":
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
				`<g transform="translate(18,18) scale(1.5)"><path fill="${color}" opacity="${opacity}" d="M17 5H6c-1.1 0-2 .9-2 2v5h2V7h11v3l5-4l-5-4zm1 12H7v-3l-5 4l5 4v-3h11c1.1 0 2-.9 2-2v-5h-2z"/></g>`,
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

export type TrackFunction = "recarm" | "mute" | "solo" | "select" | "displayName";

const TRACK_COLOR: Record<Exclude<TrackFunction, "displayName">, string> = {
	recarm: "#E04040",
	// Mute/solo are letter glyphs, not colored squares - white at full opacity
	// for active, dimmed (via opacityFor) to a grey-ish white for inactive.
	mute: "#FFFFFF",
	solo: "#FFFFFF",
	select: "#5A9BD5",
};

/** M glyph (256x256 source viewBox), scaled/translated to the same 10..62 footprint the rect icons use. */
function muteGlyph(color: string, opacity: number): string {
	return `<g transform="translate(10,10) scale(0.203125)" opacity="${opacity}"><path fill="${color}" fill-rule="evenodd" d="M208.552 206.834h-25v-92.492l-43.987 87.835q-1.622 3.357-4.532 5.09t-6.25 1.733q-3.245 0-6.06-1.733t-4.436-5.09l-44.179-87.835v92.492H49.3V63.548q0-4.874 2.528-8.665t6.632-5.09a11.7 11.7 0 0 1 4.007-.379a12 12 0 0 1 3.865.975q1.86.812 3.387 2.274t2.576 3.52l56.488 111.445L185.27 56.183q2.195-4.116 6.06-5.848t8.062-.542q4.008 1.3 6.584 5.09q2.577 3.792 2.576 8.665z"/></g>`;
}

/** S glyph (256x256 source viewBox), same footprint as muteGlyph. */
function soloGlyph(color: string, opacity: number): string {
	return `<g transform="translate(10,10) scale(0.203125)" opacity="${opacity}"><path fill="${color}" fill-rule="evenodd" d="M208.714 161.607q0 8.647-2.19 15.555q-2.19 6.906-5.784 12.185c-3.594 5.279-5.203 6.513-8.423 8.984q-4.828 3.705-9.995 6.065q-5.166 2.358-10.5 3.481Q166.487 209 161.771 209H49.129v-29.2H161.77q8.423 0 13.083-4.94q4.66-4.942 4.66-13.253q0-4.043-1.235-7.412q-1.234-3.369-3.537-5.84t-5.616-3.818t-7.355-1.348H94.612q-7.075 0-15.273-2.526q-8.199-2.528-15.217-8.142q-7.02-5.616-11.68-14.712t-4.66-22.237t4.66-22.18t11.68-14.712q7.018-5.67 15.217-8.198q8.198-2.527 15.273-2.527h99.39v29.2h-99.39q-8.31 0-12.97 5.053q-4.662 5.055-4.662 13.364q0 8.424 4.661 13.308q4.66 4.886 12.971 4.886h67.383q4.717.112 9.995 1.291q5.28 1.18 10.5 3.65q5.223 2.47 9.94 6.233t8.366 9.04q3.651 5.279 5.784 12.13q2.134 6.85 2.134 15.497"/></g>`;
}

/** `bgColor`, when given, replaces the key's default background (the "tint track color" option) - the function glyph/square is unaffected, it's drawn on top either way. */
export function trackIcon(fn: TrackFunction, lit: boolean, bgColor?: string): string {
	// Display Name is purely informational (no REAPER state to reflect) - no
	// glyph, just the (optionally tinted) background behind the key's title.
	if (fn === "displayName") return svg("", bgColor);

	const color = TRACK_COLOR[fn];
	const opacity = opacityFor(lit);
	if (fn === "mute") return svg(muteGlyph(color, opacity), bgColor);
	if (fn === "solo") return svg(soloGlyph(color, opacity), bgColor);
	return svg(`<rect x="10" y="10" width="52" height="52" rx="10" fill="${color}" opacity="${opacity}"/>`, bgColor);
}

/** Neutral "out of range" / "no target" icon for Track Control keys. */
export function trackInactiveIcon(): string {
	return svg(
		`<rect x="10" y="10" width="52" height="52" rx="10" fill="none" stroke="#666" stroke-width="4" opacity="0.5"/>`,
	);
}

/**
 * Converts REAPER's TRACK color field (decimal 0xaarrggbb per main.js -
 * confirmed via docs/protocol-findings.md item 6) to a CSS hex color, or
 * undefined for 0 ("nonzero if a custom color set" - 0 means the track has
 * no custom color and should keep the key's default background).
 */
export function reaperColorToHex(color: number): string | undefined {
	if (!color) return undefined;
	return `#${(color & 0xffffff).toString(16).padStart(6, "0")}`;
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
