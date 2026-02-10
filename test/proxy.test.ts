import { createServer, type Server } from "node:http";
import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { startProxy, type ProxyHandle } from "../proxy.js";

const TEST_PORT = 19832;
const MOCK_VERTEX_PORT = 19833;

let proxy: ProxyHandle;
let mockVertex: Server;
let lastVertexRequest: { url: string; headers: Record<string, string>; body: Record<string, unknown> };

const silentLogger = { info: () => {}, error: () => {} };

beforeAll(async () => {
  process.env.GOOGLE_CLOUD_PROJECT = "test-project";
  process.env.VERTEX_LOCATION = "us-central1";

  mockVertex = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    lastVertexRequest = {
      url: req.url || "",
      headers: req.headers as Record<string, string>,
      body,
    };

    if (req.url?.includes("streamRawPredict")) {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write('event: message_start\ndata: {"type":"message_start"}\n\n');
      res.write('event: message_stop\ndata: {"type":"message_stop"}\n\n');
      res.end();
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        type: "message",
        content: [{ type: "text", text: "Hello from mock" }],
      }));
    }
  });

  await new Promise<void>((resolve) => {
    mockVertex.listen(MOCK_VERTEX_PORT, "127.0.0.1", resolve);
  });

  proxy = await startProxy({ port: TEST_PORT, logger: silentLogger });
});

afterAll(async () => {
  await proxy.stop();
  await new Promise<void>((resolve) => mockVertex.close(() => resolve()));
  delete process.env.GOOGLE_CLOUD_PROJECT;
  delete process.env.VERTEX_LOCATION;
});

describe("proxy health check", () => {
  it("returns OK on GET /health", async () => {
    const res = await fetch("http://127.0.0.1:" + TEST_PORT + "/health");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
  });
});

describe("proxy routing", () => {
  it("returns 404 for unknown routes", async () => {
    const res = await fetch("http://127.0.0.1:" + TEST_PORT + "/v1/chat", {
      method: "POST",
      body: "{}",
    });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error.type).toBe("proxy_error");
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await fetch("http://127.0.0.1:" + TEST_PORT + "/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when model field is missing", async () => {
    const res = await fetch("http://127.0.0.1:" + TEST_PORT + "/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.message).toContain("model");
  });
});

describe("proxy env resolution", () => {
  it("returns 500 when GOOGLE_CLOUD_PROJECT is unset", async () => {
    const saved = process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GOOGLE_CLOUD_PROJECT;

    const res = await fetch("http://127.0.0.1:" + TEST_PORT + "/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-5", messages: [] }),
    });
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error.message).toContain("GOOGLE_CLOUD_PROJECT");

    process.env.GOOGLE_CLOUD_PROJECT = saved;
  });
});
