# AI Setup Guide — openclaw-vertex-claude

> This document is designed for AI coding assistants (Claude Code, OpenClaw, etc.) to follow automatically. If you are an AI assistant, execute the steps below in order. If any step fails, stop and report the error.

## What this plugin does

Adds Claude model support (Sonnet, Opus) to OpenClaw via Google Cloud Vertex AI. It runs a local proxy that translates Anthropic Messages API calls into Vertex AI rawPredict requests.

## Step 1: Check prerequisites

Run these checks. ALL must pass before proceeding:

```bash
# OpenClaw must be installed (>= 2026.2.2)
openclaw --version

# gcloud CLI must be installed
gcloud --version

# Node.js >= 20
node --version

# GCP project must be set
echo $GOOGLE_CLOUD_PROJECT
```

If `GOOGLE_CLOUD_PROJECT` is empty, ask the user for their GCP project ID, then:

```bash
# Add to shell profile (~/.zshrc or ~/.bashrc)
echo 'export GOOGLE_CLOUD_PROJECT="<project-id>"' >> ~/.zshrc
source ~/.zshrc
```

Optionally set `VERTEX_LOCATION` (defaults to `us-east5`):

```bash
echo 'export VERTEX_LOCATION="us-east5"' >> ~/.zshrc
source ~/.zshrc
```

## Step 2: Ensure GCP authentication

```bash
gcloud auth application-default login
```

If already authenticated, this can be skipped. Verify with:

```bash
gcloud auth application-default print-access-token > /dev/null 2>&1 && echo "OK" || echo "NEED LOGIN"
```

## Step 3: Install the plugin

```bash
openclaw plugins install @fl-penly/vertex-claude
```

If install fails (e.g. not yet published to npm), install from source:

```bash
git clone https://github.com/FL-Penly/vertex-claude.git ~/.openclaw/extensions/vertex-claude
cd ~/.openclaw/extensions/vertex-claude
npm install --production
```

Then enable manually by adding to `~/.openclaw/openclaw.json` under `plugins.entries`:

```json
{
  "plugins": {
    "entries": {
      "vertex-claude": {
        "enabled": true
      }
    }
  }
}
```

## Step 4: Configure model aliases (optional but recommended)

Add model aliases to `~/.openclaw/openclaw.json` under `agents.defaults.models`:

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

IMPORTANT: Merge these into the existing JSON structure. Do NOT overwrite the file. Use `jq` or read-modify-write.

## Step 5: Restart the gateway

```bash
openclaw gateway restart
```

## Step 6: Verify installation

```bash
# Check models are registered
openclaw models list | grep vertex-claude

# Expected output (3+ lines with "yes yes configured"):
# vertex-claude/claude-sonnet-4-5  text+image 195k  yes  yes  configured
# vertex-claude/claude-opus-4-5    text+image 195k  yes  yes  configured
# vertex-claude/claude-opus-4-6    text+image 195k  yes  yes  configured

# Check proxy is running
curl -s http://127.0.0.1:18832/health
# Expected: OK
```

If models show `auth: missing`, run:

```bash
openclaw auth login vertex-claude
```

## Step 7: Test end-to-end (optional)

```bash
curl -s http://127.0.0.1:18832/v1/messages \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: vertex-proxy-local" \
  -d '{
    "model": "claude-sonnet-4-5",
    "max_tokens": 64,
    "messages": [{"role": "user", "content": "Say hi in one word"}]
  }' | head -c 200
```

Expected: A JSON response with `"type": "message"` and a content block.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `GOOGLE_CLOUD_PROJECT is not set` | `export GOOGLE_CLOUD_PROJECT=your-project-id` then restart gateway |
| `Failed to get GCP access token` | `gcloud auth application-default login` |
| Models show `auth: missing` | `openclaw auth login vertex-claude` |
| Port 18832 in use | `export VERTEX_CLAUDE_PORT=18833` then restart gateway |
| 403 from Vertex AI | Enable Claude models at https://console.cloud.google.com/vertex-ai/publishers/anthropic |
| Plugin not loading | Check `~/.openclaw/logs/gateway.err.log` for errors |

## Available models after setup

| Alias | Full ID | Use for |
|-------|---------|---------|
| `vc-sonnet` | `vertex-claude/claude-sonnet-4-5` | General coding, fast |
| `vc-opus` | `vertex-claude/claude-opus-4-5` | Complex reasoning |
| `vc-opus46` | `vertex-claude/claude-opus-4-6` | Latest, extended thinking |

Switch model: `/model vc-sonnet`
