import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { GoogleAuth } from "google-auth-library";

export interface ProxyLogger {
  info(msg: string): void;
  error(msg: string): void;
}

export interface ProxyHandle {
  server: Server;
  port: number;
  stop: () => Promise<void>;
}

const DEFAULT_PORT = 18832;
const DEFAULT_LOCATION = "us-east5";
const REQUEST_TIMEOUT_MS = 300_000; // 5 minutes — long for streaming responses
const MAX_REQUEST_BODY_BYTES = 10 * 1024 * 1024; // 10 MB

function resolveEnv() {
  const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || "";
  const location = process.env.VERTEX_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || DEFAULT_LOCATION;
  return { project, location };
}

function jsonError(res: ServerResponse, status: number, message: string) {
  const body = JSON.stringify({ type: "error", error: { type: "proxy_error", message } });
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body);
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += (chunk as Buffer).length;
    if (totalBytes > MAX_REQUEST_BODY_BYTES) {
      throw new Error(`Request body exceeds maximum size of ${MAX_REQUEST_BODY_BYTES} bytes`);
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export async function startProxy(opts: {
  port?: number;
  logger?: ProxyLogger;
}): Promise<ProxyHandle> {
  const port = opts.port || (Number(process.env.VERTEX_CLAUDE_PORT) || DEFAULT_PORT);
  const log = opts.logger || { info: console.log, error: console.error };

  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

  async function getAccessToken(retries: number = 1): Promise<string> {
    let lastErr: Error | undefined;
    for (let i = 0; i <= retries; i++) {
      try {
        const token = await auth.getAccessToken();
        if (token) return token;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        if (i < retries) {
          log.info(`[vertex-claude] Token fetch failed, retrying (${i + 1}/${retries})...`);
        }
      }
    }
    throw lastErr || new Error("Failed to get GCP access token. Run: gcloud auth application-default login");
  }

  const server = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("OK");
      return;
    }

    if (req.method !== "POST" || req.url !== "/v1/messages") {
      jsonError(res, 404, "Not found: " + req.method + " " + req.url);
      return;
    }

    try {
      const { project, location } = resolveEnv();
      if (!project) {
        jsonError(res, 500, "GOOGLE_CLOUD_PROJECT env var is required. Export it before starting OpenClaw.");
        return;
      }

      const rawBody = await readBody(req);
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(rawBody.toString("utf-8"));
      } catch (_parseErr) {
        jsonError(res, 400, "Invalid JSON body");
        return;
      }

      const modelId = body.model as string;
      if (!modelId) {
        jsonError(res, 400, "Missing 'model' field in request body");
        return;
      }

      const isStream = body.stream === true;

      // Vertex AI requires: model in URL path, anthropic_version in body (not header)
      const endpoint = isStream ? "streamRawPredict" : "rawPredict";
      const vertexUrl =
        "https://" + location + "-aiplatform.googleapis.com/v1/projects/" + project +
        "/locations/" + location + "/publishers/anthropic/models/" + modelId + ":" + endpoint;

      const vertexBody: Record<string, unknown> = {
        ...body,
        anthropic_version: "vertex-2023-10-16",
      };
      delete vertexBody.model;
      const vertexPayload = JSON.stringify(vertexBody);

      const accessToken = await getAccessToken(1);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      let vertexRes: Response;
      try {
        vertexRes = await fetch(vertexUrl, {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + accessToken,
            "Content-Type": "application/json",
          },
          body: vertexPayload,
          signal: controller.signal,
        });
      } catch (fetchErr) {
        clearTimeout(timeout);
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        if (msg.includes("aborted")) {
          jsonError(res, 504, "Upstream request to Vertex AI timed out after " + (REQUEST_TIMEOUT_MS / 1000) + "s");
        } else {
          jsonError(res, 502, "Failed to connect to Vertex AI: " + msg);
        }
        return;
      }

      if (!vertexRes.ok) {
        clearTimeout(timeout);
        const errBody = await vertexRes.text();
        log.error("[vertex-claude] Vertex returned " + vertexRes.status + ": " + errBody.slice(0, 500));
        const contentType = vertexRes.headers.get("content-type") || "application/json";
        res.writeHead(vertexRes.status, { "Content-Type": contentType });
        res.end(errBody);
        return;
      }

      const contentType = vertexRes.headers.get("content-type") || "application/json";
      res.writeHead(vertexRes.status, { "Content-Type": contentType });

      if (!vertexRes.body) {
        clearTimeout(timeout);
        const text = await vertexRes.text();
        res.end(text);
        return;
      }

      const reader = (vertexRes.body as ReadableStream<Uint8Array>).getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      } catch (streamErr) {
        const msg = streamErr instanceof Error ? streamErr.message : String(streamErr);
        log.error("[vertex-claude] Stream error: " + msg);
      } finally {
        clearTimeout(timeout);
        res.end();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("[vertex-claude] Proxy error: " + msg);
      if (!res.headersSent) {
        jsonError(res, 500, msg);
      } else {
        res.end();
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      server.off("error", onError);
      reject(err);
    };
    server.once("error", onError);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", onError);
      log.info("[vertex-claude] Proxy listening on http://127.0.0.1:" + port);
      resolve();
    });
  });

  const stop = () =>
    new Promise<void>((resolve) => {
      server.close(() => {
        log.info("[vertex-claude] Proxy stopped");
        resolve();
      });
    });

  return { server, port, stop };
}
