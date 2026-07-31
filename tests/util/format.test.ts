import { describe, expect, it } from "vitest";
import { formatPan, formatVolumeDb } from "../../src/util/format.js";

describe("formatVolumeDb", () => {
	it("formats unity gain as 0.0 dB", () => {
		expect(formatVolumeDb(1)).toBe("0.0 dB");
	});

	it("formats a boost with a leading +", () => {
		expect(formatVolumeDb(1.412538)).toBe("+3.0 dB");
	});

	it("formats a cut without a leading +", () => {
		expect(formatVolumeDb(0.707946)).toBe("-3.0 dB");
	});

	it("formats silence (0 linear) as -inf, not a real number", () => {
		expect(formatVolumeDb(0)).toBe("-∞ dB");
	});

	it("treats negative linear values the same as silence", () => {
		expect(formatVolumeDb(-1)).toBe("-∞ dB");
	});
});

describe("formatPan", () => {
	it("formats center as C", () => {
		expect(formatPan(0)).toBe("C");
	});

	it("formats a small negative pan as center (rounds to 0)", () => {
		expect(formatPan(-0.001)).toBe("C");
	});

	it("formats left pans with an L suffix", () => {
		expect(formatPan(-0.5)).toBe("50L");
	});

	it("formats right pans with an R suffix", () => {
		expect(formatPan(0.63)).toBe("63R");
	});

	it("formats hard left/right", () => {
		expect(formatPan(-1)).toBe("100L");
		expect(formatPan(1)).toBe("100R");
	});
});
