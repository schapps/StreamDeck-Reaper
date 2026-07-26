import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReaperClient } from "../../src/reaper/client.js";
import { MockReaperServer, reaperOk } from "./mock-server.js";

let server: MockReaperServer;
let client: ReaperClient;

function newClient(overrides: Partial<{ username: string; password: string; timeoutMs: number }> = {}) {
	return new ReaperClient({
		host: "127.0.0.1",
		port: server.port,
		timeoutMs: 500,
		...overrides,
	});
}

afterEach(async () => {
	await server?.stop();
});

describe("batching", () => {
	beforeEach(async () => {
		server = await MockReaperServer.start((req, res) => reaperOk(res, ""));
		client = newClient();
	});

	it("coalesces two runCommands() calls made in the same tick into one HTTP request", async () => {
		const p1 = client.runCommands(["40044"]);
		const p2 = client.runCommands(["1007"]);
		await Promise.all([p1, p2]);

		expect(server.requests).toHaveLength(1);
		expect(server.requests[0]?.url).toBe("/_/40044;1007");
	});

	it("preserves call order across multiple runCommands() calls (ordering guarantee)", async () => {
		await Promise.all([client.runCommands(["a", "b"]), client.runCommands(["c"]), client.runCommands(["d", "e"])]);
		expect(server.requests[0]?.url).toBe("/_/a;b;c;d;e");
	});

	it("dedups identical queries scheduled in the same window to a single wire token", async () => {
		const [s1, s2] = await Promise.all([
			client.query([{ type: "NTRACK" }]),
			client.query([{ type: "NTRACK" }]),
		]);
		expect(server.requests).toHaveLength(1);
		expect(server.requests[0]?.url).toBe("/_/NTRACK");
		expect(s1).toEqual(s2);
	});
});

describe("query filtering", () => {
	beforeEach(async () => {
		server = await MockReaperServer.start((req, res) => {
			reaperOk(
				res,
				[
					"NTRACK\t2",
					"TRACK\t1\tOne\t2\t1.0\t0.0\t-1500\t-1500\t1.0\t5\t0\t0\t0\t1",
					"TRACK\t2\tTwo\t2\t1.0\t0.0\t-1500\t-1500\t1.0\t5\t0\t0\t0\t2",
				].join("\n"),
			);
		});
		client = newClient();
	});

	it("filters a TRACK/<index> query down to the matching track only", async () => {
		const state = await client.query([{ type: "TRACK", index: 2 }]);
		expect(state.tracks).toHaveLength(1);
		expect(state.tracks?.[0]?.name).toBe("Two");
	});

	it("returns all tracks for an unindexed TRACK query in the same batch", async () => {
		const [all, one] = await Promise.all([
			client.query([{ type: "TRACK" }]),
			client.query([{ type: "TRACK", index: 1 }]),
		]);
		expect(all.tracks).toHaveLength(2);
		expect(one.tracks).toHaveLength(1);
		expect(one.tracks?.[0]?.name).toBe("One");
	});
});

describe("connection state machine", () => {
	it("goes connected -> degraded -> disconnected over consecutive failures, and back on success", async () => {
		let shouldFail = false;
		server = await MockReaperServer.start((_req, res) => {
			if (shouldFail) {
				res.destroy();
			} else {
				reaperOk(res, "TRANSPORT\t0\t0\t0\t00:00:00:00\t1.1.00");
			}
		});
		client = newClient();
		const events: string[] = [];
		client.on("statusChange", (s) => events.push(s));

		await client.query([{ type: "TRANSPORT" }]);
		expect(client.status).toBe("connected");

		shouldFail = true;
		await client.runCommands(["x"]).catch(() => undefined);
		expect(client.status).toBe("degraded");

		await client.runCommands(["y"]).catch(() => undefined);
		expect(client.status).toBe("disconnected");

		expect(events).toEqual(["connecting", "connected", "degraded", "disconnected"]);
	});

	it("gates retries while disconnected instead of hammering the port", async () => {
		server = await MockReaperServer.start((req, res) => res.destroy());
		client = newClient();

		await client.runCommands(["a"]).catch(() => undefined);
		expect(client.status).toBe("disconnected");
		expect(server.requests).toHaveLength(1);

		// Immediately retrying should be gated client-side, not dispatched.
		await client.runCommands(["b"]).catch(() => undefined);
		expect(server.requests).toHaveLength(1);
	});

	it("allows a retry once the backoff delay has elapsed", async () => {
		let shouldFail = true;
		server = await MockReaperServer.start((req, res) => {
			if (shouldFail) res.destroy();
			else reaperOk(res, "");
		});
		client = newClient();

		await client.runCommands(["a"]).catch(() => undefined);
		expect(server.requests).toHaveLength(1);

		shouldFail = false;
		await new Promise((r) => setTimeout(r, 1100)); // first backoff step is 1s
		await client.runCommands(["b"]);
		expect(server.requests).toHaveLength(2);
		expect(client.status).toBe("connected");
	}, 5000);
});

describe("authentication", () => {
	it("sends a Basic auth header when credentials are configured", async () => {
		server = await MockReaperServer.start((req, res) => reaperOk(res, ""));
		client = newClient({ username: "schapps", password: "fire" });

		await client.runCommands(["40044"]);
		const expected = `Basic ${Buffer.from("schapps:fire").toString("base64")}`;
		expect(server.requests[0]?.authorization).toBe(expected);
	});

	it("rejects pending calls on 401 without treating the body as valid state", async () => {
		server = await MockReaperServer.start((req, res) => {
			res.writeHead(401);
			res.end();
		});
		client = newClient();

		await expect(client.runCommands(["40044"])).rejects.toThrow();
	});
});

describe("testConnection", () => {
	it("classifies success", async () => {
		server = await MockReaperServer.start((req, res) => reaperOk(res, "TRANSPORT\t0\t0\t0\t00:00:00:00\t1.1.00"));
		client = newClient();
		expect(await client.testConnection()).toEqual({ status: "success", message: "Connected to REAPER." });
	});

	it("classifies refused when nothing is listening", async () => {
		client = new ReaperClient({ host: "127.0.0.1", port: 1, timeoutMs: 500 });
		const result = await client.testConnection();
		expect(result.status).toBe("refused");
	});

	it("classifies auth on 401", async () => {
		server = await MockReaperServer.start((req, res) => {
			res.writeHead(401);
			res.end();
		});
		client = newClient();
		expect((await client.testConnection()).status).toBe("auth");
	});

	it("classifies unexpected when something answers without REAPER's Server header", async () => {
		server = await MockReaperServer.start((req, res) => {
			res.writeHead(200, { "Content-Type": "text/html" });
			res.end("<html>not reaper</html>");
		});
		client = newClient();
		expect((await client.testConnection()).status).toBe("unexpected");
	});

	it("classifies timeout when the server never responds", async () => {
		server = await MockReaperServer.start(() => {
			/* never call res.end() */
		});
		client = newClient({ timeoutMs: 100 });
		expect((await client.testConnection()).status).toBe("timeout");
	}, 5000);
});
