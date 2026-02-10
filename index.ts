import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import type { ProxyHandle } from "./proxy.js";

const DEFAULT_PORT = 18832;

function resolvePort(): number {
  return Number(process.env.VERTEX_CLAUDE_PORT) || DEFAULT_PORT;
}

const CLAUDE_MODELS = [
  {
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5 (Vertex)",
    reasoning: false,
    input: ["text", "image"] as string[],
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    contextWindow: 200000,
    maxTokens: 8192,
  },
  {
    id: "claude-sonnet-4-5-thinking",
    name: "Claude Sonnet 4.5 Thinking (Vertex)",
    reasoning: true,
    input: ["text", "image"] as string[],
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    contextWindow: 200000,
    maxTokens: 16000,
  },
  {
    id: "claude-opus-4-5",
    name: "Claude Opus 4.5 (Vertex)",
    reasoning: false,
    input: ["text", "image"] as string[],
    cost: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
    contextWindow: 200000,
    maxTokens: 8192,
  },
  {
    id: "claude-opus-4-5-thinking",
    name: "Claude Opus 4.5 Thinking (Vertex)",
    reasoning: true,
    input: ["text", "image"] as string[],
    cost: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
    contextWindow: 200000,
    maxTokens: 32000,
  },
  {
    id: "claude-opus-4-6",
    name: "Claude Opus 4.6 (Vertex)",
    reasoning: true,
    input: ["text", "image"] as string[],
    cost: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
    contextWindow: 200000,
    maxTokens: 32000,
  },
];

let proxyHandle: ProxyHandle | null = null;

const plugin = {
  id: "vertex-claude",
  name: "Vertex Claude",
  description: "Claude models via Google Vertex AI",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    const port = resolvePort();
    const baseUrl = "http://127.0.0.1:" + port;

    api.registerProvider({
      id: "vertex-claude",
      label: "Vertex AI Claude",
      aliases: ["vc"],
      envVars: ["GOOGLE_CLOUD_PROJECT", "VERTEX_LOCATION"],
      models: {
        baseUrl,
        apiKey: "vertex-proxy-local",
        api: "anthropic-messages",
        models: CLAUDE_MODELS,
      },
      auth: [
        {
          id: "gcp-adc",
          label: "GCP Application Default Credentials",
          hint: "Uses gcloud ADC — run: gcloud auth application-default login",
          kind: "custom" as const,
          run: async () => {
            const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
            if (!project) {
              throw new Error(
                "GOOGLE_CLOUD_PROJECT is not set. Export it before starting OpenClaw:\n" +
                "  export GOOGLE_CLOUD_PROJECT=your-project-id",
              );
            }

            const { GoogleAuth } = await import("google-auth-library");
            const gauth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
            const token = await gauth.getAccessToken();
            if (!token) {
              throw new Error(
                "Failed to get GCP access token. Run:\n  gcloud auth application-default login",
              );
            }

            const location = process.env.VERTEX_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || "us-east5";

            return {
              profiles: [
                {
                  profileId: "vertex-claude:gcp-adc",
                  credential: {
                    type: "api_key" as const,
                    provider: "vertex-claude",
                    key: "vertex-proxy-local",
                  },
                },
              ],
              defaultModel: "vertex-claude/claude-sonnet-4-5",
              notes: [
                "Using GCP project: " + project,
                "Vertex location: " + location,
                "Auth: Application Default Credentials",
              ],
            };
          },
        },
      ],
    });

    api.registerService({
      id: "vertex-claude-proxy",
      start: async (ctx) => {
        const { startProxy } = await import("./proxy.js");
        proxyHandle = await startProxy({
          port,
          logger: {
            info: (msg: string) => ctx.logger.info(msg),
            error: (msg: string) => ctx.logger.error(msg),
          },
        });
      },
      stop: async () => {
        if (proxyHandle) {
          await proxyHandle.stop();
          proxyHandle = null;
        }
      },
    });
  },
};

export default plugin;
