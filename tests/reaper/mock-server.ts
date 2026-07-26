import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface MockRequest {
	url: string;
	authorization?: string;
}

/**
 * A minimal stand-in for REAPER's web interface, driven by a handler you
 * supply per test. Records every request it receives so tests can assert on
 * call counts (e.g. to prove the reconnection backoff gate short-circuits
 * before hitting the network).
 */
export class MockReaperServer {
	readonly requests: MockRequest[] = [];
	private server: http.Server;
	private handler: (req: MockRequest, res: ServerResponse) => void;

	private constructor(server: http.Server, handler: (req: MockRequest, res: ServerResponse) => void) {
		this.server = server;
		this.handler = handler;
	}

	static async start(handler: (req: MockRequest, res: ServerResponse) => void): Promise<MockReaperServer> {
		const server = http.createServer();
		const mock = new MockReaperServer(server, handler);
		server.on("request", (req: IncomingMessage, res: ServerResponse) => {
			const mockReq: MockRequest = {
				url: req.url ?? "",
				authorization: req.headers.authorization,
			};
			mock.requests.push(mockReq);
			mock.handler(mockReq, res);
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		return mock;
	}

	setHandler(handler: (req: MockRequest, res: ServerResponse) => void): void {
		this.handler = handler;
	}

	get port(): number {
		return (this.server.address() as AddressInfo).port;
	}

	async stop(): Promise<void> {
		if (!this.server.listening) return;
		await new Promise<void>((resolve, reject) => this.server.close((e) => (e ? reject(e) : resolve())));
	}
}

/** Standard REAPER-shaped 200 OK response for a given plain-text body. */
export function reaperOk(res: ServerResponse, body: string): void {
	res.writeHead(200, { "Content-Type": "text/plain", Server: "reaper_csurf_www/0.1" });
	res.end(body);
}
