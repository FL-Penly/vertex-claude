# AI Setup Guide — openclaw-vertex-claude

> **For AI assistants**: Execute Phase 1 fully — it requires no human input. Then present Phase 2 to the user as a checklist of manual steps. Do NOT proceed to Phase 3 until the user confirms Phase 2 is done.

## What this plugin does

Adds Claude model support (Sonnet, Opus) to OpenClaw via Google Cloud Vertex AI. It runs a local proxy (`127.0.0.1:18832`) that translates Anthropic Messages API calls into Vertex AI rawPredict requests.

---

## Phase 1: Automated setup (AI executes this)

AI: run every step below. If any step fails, stop and report the error.

### 1.1 Check prerequisites

```bash
# ALL must pass
openclaw --version   # >= 2026.2.2
gcloud --version     # any version
node --version       # >= 20
```

If any command is missing, stop and tell the user what to install.

### 1.2 Install the plugin

Try npm first:

```bash
openclaw plugins install @fl-penly/vertex-claude
```

If that fails (not yet published), install from source:

```bash
# Clone only if not already present
if [ ! -d ~/.openclaw/extensions/vertex-claude ]; then
  git clone https://github.com/FL-Penly/vertex-claude.git ~/.openclaw/extensions/vertex-claude
fi
cd ~/.openclaw/extensions/vertex-claude && npm install --production
```

### 1.3 Enable plugin in openclaw.json

Read `~/.openclaw/openclaw.json`, merge the plugin entry, and write back. Do NOT overwrite existing config.

The final JSON must contain (at minimum) this structure merged with whatever already exists:

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

Use read-modify-write. Example with `jq`:

```bash
CONFIG=~/.openclaw/openclaw.json

# Create file if missing
[ -f "$CONFIG" ] || echo '{}' > "$CONFIG"

# Merge plugin entry
jq '.plugins.entries["vertex-claude"] = {"enabled": true}' "$CONFIG" > "$CONFIG.tmp" \
  && mv "$CONFIG.tmp" "$CONFIG"
```

### 1.4 Configure model aliases

Merge model aliases into the same `~/.openclaw/openclaw.json`. Again, read-modify-write — do NOT overwrite.

```bash
CONFIG=~/.openclaw/openclaw.json

jq '
  .agents.defaults.models["vertex-claude/claude-sonnet-4-5"] = {"alias": "vc-sonnet"} |
  .agents.defaults.models["vertex-claude/claude-opus-4-5"]   = {"alias": "vc-opus"}   |
  .agents.defaults.models["vertex-claude/claude-opus-4-6"]   = {"alias": "vc-opus46"}
' "$CONFIG" > "$CONFIG.tmp" && mv "$CONFIG.tmp" "$CONFIG"
```

### 1.5 Done — report to user

After completing all steps above, print this message to the user:

```
✅ Plugin installed and configured.

Before the plugin can work, you need to complete a few manual steps (see below).
```

Then present Phase 2.

---

## Phase 2: Manual steps (user must do these)

AI: present the following to the user as a checklist. Do NOT run these commands yourself — they require human interaction or secrets.

### 2.1 GCP authentication (browser required)

```bash
gcloud auth application-default login
```

This opens a browser for Google OAuth. You must click "Allow" to grant access.

To verify it worked:

```bash
gcloud auth application-default print-access-token > /dev/null 2>&1 && echo "OK" || echo "NEED LOGIN"
```

### 2.2 Enable Claude models in GCP

Go to [Vertex AI Model Garden — Anthropic](https://console.cloud.google.com/vertex-ai/publishers/anthropic) and enable the Claude models you want to use.

### 2.3 Set environment variables and start

Add these to your shell profile (`~/.zshrc` or `~/.bashrc`), then restart:

```bash
# Required — your GCP project ID
export GOOGLE_CLOUD_PROJECT="your-project-id"

# Optional — Vertex AI region (default: us-east5)
# export VERTEX_LOCATION="us-east5"

# Optional — proxy port (default: 18832)
# export VERTEX_CLAUDE_PORT=18832
```

After saving, apply and restart the gateway:

```bash
source ~/.zshrc   # or ~/.bashrc
openclaw gateway restart
```

### 2.4 Authenticate the plugin

```bash
openclaw auth login vertex-claude
```

### 2.5 Tell the AI you're done

Once all steps above are complete, tell the AI to continue to Phase 3.

---

## Phase 3: Verify (AI executes after user confirms Phase 2)

### 3.1 Check models are registered

```bash
openclaw models list | grep vertex-claude
```

Expected: 3+ lines with `yes yes configured`:

```
vertex-claude/claude-sonnet-4-5  text+image 195k  yes  yes  configured
vertex-claude/claude-opus-4-5    text+image 195k  yes  yes  configured
vertex-claude/claude-opus-4-6    text+image 195k  yes  yes  configured
```

If models show `auth: missing`, tell the user to run `openclaw auth login vertex-claude`.

### 3.2 Check proxy health

```bash
curl -s http://127.0.0.1:18832/health
```

Expected: `OK`

### 3.3 End-to-end test (optional)

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

Expected: JSON response with `"type": "message"` and a content block.

---

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
