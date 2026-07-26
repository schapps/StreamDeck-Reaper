import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StateManager } from "../../src/reaper/state-manager.js";
import type { QuerySpec, ReaperState } from "../../src/reaper/types.js";

const TIMING = { fastIntervalMs: 200, idleIntervalMs: 1000, idleThresholdMs: 60_000 };

function fakeTransport(playState: number): ReaperState {
	return {
		transport: {
			playState,
			positionSeconds: 0,
			repeatOn: false,
			positionString: "00:00:00:00",
			positionStringBeats: "1.1.00",
		},
	};
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("subscription -> query set", () => {
	it("polls nothing with no subscribers", async () => {
		const query = vi.fn(async (_q: QuerySpec[]) => ({}) as ReaperState);
		new StateManager(query, TIMING);
		await vi.advanceTimersByTimeAsync(1000);
		expect(query).not.toHaveBeenCalled();
	});

	it("queries only TRANSPORT when a transport subscriber exists", async () => {
		const query = vi.fn(async (_q: QuerySpec[]) => ({}) as ReaperState);
		const manager = new StateManager(query, TIMING);
		manager.subscribe("t1", "transport", () => {});
		await vi.advanceTimersByTimeAsync(200);
		expect(query).toHaveBeenCalledWith([{ type: "TRANSPORT" }]);
	});

	it("queries only TRACK when a track subscriber exists", async () => {
		const query = vi.fn(async (_q: QuerySpec[]) => ({}) as ReaperState);
		const manager = new StateManager(query, TIMING);
		manager.subscribe("k1", "track", () => {});
		await vi.advanceTimersByTimeAsync(200);
		expect(query).toHaveBeenCalledWith([{ type: "TRACK" }]);
	});

	it("queries both in one call when both kinds are subscribed (minimal query set)", async () => {
		const query = vi.fn(async (_q: QuerySpec[]) => ({}) as ReaperState);
		const manager = new StateManager(query, TIMING);
		manager.subscribe("t1", "transport", () => {});
		manager.subscribe("k1", "track", () => {});
		await vi.advanceTimersByTimeAsync(200);
		expect(query).toHaveBeenCalledTimes(1);
		expect(query).toHaveBeenCalledWith([{ type: "TRANSPORT" }, { type: "TRACK" }]);
	});

	it("stops polling once every subscriber is gone (zero-poll when idle)", async () => {
		const query = vi.fn(async (_q: QuerySpec[]) => ({}) as ReaperState);
		const manager = new StateManager(query, TIMING);
		manager.subscribe("t1", "transport", () => {});
		await vi.advanceTimersByTimeAsync(200);
		expect(query).toHaveBeenCalledTimes(1);

		manager.unsubscribe("t1");
		await vi.advanceTimersByTimeAsync(2000);
		expect(query).toHaveBeenCalledTimes(1);
	});
});

describe("fan-out", () => {
	it("only invokes a subscriber's callback when its own slice changed", async () => {
		let call = 0;
		const query = vi.fn(async (_q: QuerySpec[]) => (call++ === 0 ? fakeTransport(0) : fakeTransport(0)));
		const manager = new StateManager(query, TIMING);
		const cb = vi.fn();
		manager.subscribe("t1", "transport", cb);

		await vi.advanceTimersByTimeAsync(200); // first poll: playState 0, delivered
		await vi.advanceTimersByTimeAsync(200); // second poll: still playState 0, unchanged

		expect(cb).toHaveBeenCalledTimes(1);
	});

	it("invokes the callback again once the slice actually changes", async () => {
		let call = 0;
		const query = vi.fn(async (_q: QuerySpec[]) => fakeTransport(call++ === 0 ? 0 : 1));
		const manager = new StateManager(query, TIMING);
		const cb = vi.fn();
		manager.subscribe("t1", "transport", cb);

		await vi.advanceTimersByTimeAsync(200);
		await vi.advanceTimersByTimeAsync(200);

		expect(cb).toHaveBeenCalledTimes(2);
		expect(cb).toHaveBeenLastCalledWith(fakeTransport(1));
	});

	it("does not call a track subscriber's callback when only transport changed", async () => {
		let n = 0;
		const query = vi.fn(async (_q: QuerySpec[]) => ({ ...fakeTransport(n++), tracks: [] }));
		const manager = new StateManager(query, TIMING);
		const trackCb = vi.fn();
		manager.subscribe("transport1", "transport", () => {});
		manager.subscribe("track1", "track", trackCb);

		await vi.advanceTimersByTimeAsync(200); // tracks: [] delivered once
		await vi.advanceTimersByTimeAsync(200); // transport changes (n 0->1), tracks still []

		// tracks slice ([] both times) never changes, so the track callback should
		// only have fired for the initial delivery, not the second poll.
		expect(trackCb).toHaveBeenCalledTimes(1);
	});

	it("delivers the last known state immediately to a late subscriber", async () => {
		const query = vi.fn(async (_q: QuerySpec[]) => fakeTransport(1));
		const manager = new StateManager(query, TIMING);
		manager.subscribe("t1", "transport", () => {});
		await vi.advanceTimersByTimeAsync(200);

		const lateCb = vi.fn();
		manager.subscribe("t2", "transport", lateCb);
		expect(lateCb).toHaveBeenCalledWith(fakeTransport(1));
	});
});

describe("idle backoff", () => {
	it("slows to the idle interval after the threshold with no activity or state change", async () => {
		const query = vi.fn(async (_q: QuerySpec[]) => fakeTransport(0)); // never changes
		const manager = new StateManager(query, TIMING);
		manager.subscribe("t1", "transport", () => {});

		await vi.advanceTimersByTimeAsync(TIMING.idleThresholdMs);
		const callsBeforeIdle = query.mock.calls.length;

		query.mockClear();
		await vi.advanceTimersByTimeAsync(3000);
		// At 1Hz over 3s that's ~3 calls; at the old 5Hz it would be ~15.
		expect(query.mock.calls.length).toBeLessThan(6);
		expect(query.mock.calls.length).toBeGreaterThan(0);
		expect(callsBeforeIdle).toBeGreaterThan(0);
	});

	it("returns to the fast interval immediately on notifyActivity()", async () => {
		const query = vi.fn(async (_q: QuerySpec[]) => fakeTransport(0));
		const manager = new StateManager(query, TIMING);
		manager.subscribe("t1", "transport", () => {});

		await vi.advanceTimersByTimeAsync(TIMING.idleThresholdMs + 1000); // now idling at 1Hz
		manager.notifyActivity(); // e.g. a key was pressed

		query.mockClear();
		await vi.advanceTimersByTimeAsync(1000);
		// Back at 5Hz: ~5 calls in 1s, not ~1.
		expect(query.mock.calls.length).toBeGreaterThan(2);
	});
});
