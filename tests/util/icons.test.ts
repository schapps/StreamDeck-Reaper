import { describe, expect, it } from "vitest";
import { runActionIcon, trackIcon, transportIcon, withDisconnectedBadge } from "../../src/util/icons.js";

describe("withDisconnectedBadge", () => {
	it("splices the badge in just before the closing </svg> tag", () => {
		const icon = transportIcon("play", true);
		const badged = withDisconnectedBadge(icon);
		expect(badged.startsWith(icon.replace("</svg>", ""))).toBe(true);
		expect(badged.endsWith("</svg>")).toBe(true);
		expect(badged).toContain("#E0A030"); // badge color
	});

	it("is a pure string operation - never mutates or drops the original icon content", () => {
		const icon = trackIcon("mute", false);
		const badged = withDisconnectedBadge(icon);
		expect(badged.length).toBeGreaterThan(icon.length);
		expect(badged).toContain(icon.slice(icon.indexOf("<rect"), icon.indexOf("</svg>")));
	});
});

describe("runActionIcon", () => {
	it("renders a distinctly different (hollow, no center dot) icon when not configured", () => {
		const configured = runActionIcon(true);
		const unconfigured = runActionIcon(false);
		expect(configured).not.toBe(unconfigured);
		expect(configured).toContain("<circle"); // has the center dot as a second circle
		// Not-configured variant should have exactly one circle (the ring), not two.
		expect((unconfigured.match(/<circle/g) ?? []).length).toBe(1);
		expect((configured.match(/<circle/g) ?? []).length).toBe(2);
	});
});
