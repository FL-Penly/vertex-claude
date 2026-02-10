# openclaw-vertex-claude

[OpenClaw](https://github.com/openclaw/openclaw) plugin that adds Claude model support via [Google Cloud Vertex AI](https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/use-claude).

Use Claude Sonnet, Opus, and other Anthropic models through your own GCP project — no direct Anthropic API key required.

## How it works

OpenClaw's built-in `google-vertex` provider only supports Gemini models. This plugin bridges the gap by:

1. Registering a `vertex-claude` provider with `api: "anthropic-messages"`
2. Running a lightweight local proxy (`127.0.0.1:18832`) that translates Anthropic Messages API requests into Vertex AI `rawPredict`/`streamRawPredict` calls
3. Handling GCP authentication via Application Default Credentials (ADC)

```
OpenClaw → anthropic-messages runtime → local proxy → Vertex AI → Claude
```

## Prerequisites

- [OpenClaw](https://github.com/openclaw/openclaw) `>= 2026.2.2`
- A GCP project with the Vertex AI API enabled
- Claude model access enabled in your GCP project ([request access](https://console.cloud.google.com/vertex-ai/publishers/anthropic))
- `gcloud` CLI installed and authenticated

## Installation

```bash
openclaw plugins install @fl-penly/vertex-claude
```

## Setup

### 1. Authenticate with GCP

```bash
gcloud auth application-default login
```

### 2. Set environment variables

Add these to your shell profile (`.zshrc`, `.bashrc`, etc.):

```bash
export GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
export VERTEX_LOCATION="us-east5"  # optional, defaults to us-east5
```

### 3. Restart OpenClaw gateway

```bash
openclaw gateway restart
```

### 4. Authenticate the plugin

```bash
openclaw auth login vertex-claude
```

### 5. Verify

```bash
openclaw models list | grep vertex-claude
```

You should see:

```
vertex-claude/claude-sonnet-4-5            text+image 195k     yes   yes   configured
vertex-claude/claude-opus-4-5              text+image 195k     yes   yes   configured
vertex-claude/claude-opus-4-6              text+image 195k     yes   yes   configured
...
```

## Usage

Switch to a Vertex Claude model:

```
/model vertex-claude/claude-sonnet-4-5
```

Or set up aliases in `openclaw.json`:

```json
{
  "agents": {
    "defaults": {
      "models": {
        "vertex-claude/claude-sonnet-4-5": { "alias": "vc-sonnet" },
        "vertex-claude/claude-opus-4-5": { "alias": "vc-opus" },
        "vertex-claude/claude-opus-4-6": { "alias": "vc-opus46" }
      }
    }
  }
}
```

Then switch with `/model vc-sonnet`.

## Available models

| Model ID | Description | Reasoning |
|----------|-------------|-----------|
| `claude-sonnet-4-5` | Claude Sonnet 4.5 | No |
| `claude-sonnet-4-5-thinking` | Claude Sonnet 4.5 with extended thinking | Yes |
| `claude-opus-4-5` | Claude Opus 4.5 | No |
| `claude-opus-4-5-thinking` | Claude Opus 4.5 with extended thinking | Yes |
| `claude-opus-4-6` | Claude Opus 4.6 | Yes |

## Configuration

### Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_CLOUD_PROJECT` | Yes | — | GCP project ID |
| `VERTEX_LOCATION` | No | `us-east5` | Vertex AI region |
| `VERTEX_CLAUDE_PORT` | No | `18832` | Local proxy port |

### Vertex AI regions with Claude support

Not all GCP regions support Claude models. Check the [Anthropic on Vertex AI docs](https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/use-claude#regions) for the latest availability. Common regions:

- `us-east5`
- `us-central1`
- `europe-west1`

## Troubleshooting

### "GOOGLE_CLOUD_PROJECT is not set"

Export the environment variable before starting OpenClaw:

```bash
export GOOGLE_CLOUD_PROJECT="your-project-id"
openclaw gateway restart
```

### "Failed to get GCP access token"

Re-authenticate:

```bash
gcloud auth application-default login
```

### Models show `auth: missing`

Run `openclaw auth login vertex-claude` to set up credentials.

### Proxy not starting (port conflict)

Change the proxy port:

```bash
export VERTEX_CLAUDE_PORT=18833
openclaw gateway restart
```

### 403 from Vertex AI

Ensure Claude models are enabled in your GCP project. Visit [Vertex AI Model Garden](https://console.cloud.google.com/vertex-ai/publishers/anthropic) and enable the models you want to use.

## AI-assisted setup

Have an AI assistant set this up for you — just share the setup guide:

```
https://github.com/FL-Penly/vertex-claude/blob/main/SETUP.md
```

Paste the URL into Claude Code, OpenClaw, or any AI coding assistant. It will follow the steps automatically.

## Development

```bash
git clone https://github.com/FL-Penly/vertex-claude.git
cd vertex-claude
npm install

# Link for local development
ln -s "$(pwd)" ~/.openclaw/extensions/vertex-claude

# Enable the plugin
openclaw plugins enable vertex-claude
openclaw gateway restart
```

## License

MIT
