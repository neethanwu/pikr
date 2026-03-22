# pikr

Universal element picker for terminal-based AI coding agents.

Point at a UI element in your running app. Structured context goes to clipboard. Paste into any terminal agent.

## Quickstart

```bash
npx pikr
```

That's it. pikr scans common ports (3000, 5173, 8080, ...) and opens your dev server automatically.

Or specify a URL:

```bash
npx pikr http://localhost:3000
```

## How it works

1. pikr opens a Chromium window showing your app
2. Press **⌘/Ctrl+Shift+X** to toggle inspect mode
3. Hover to highlight elements, click to capture
4. Structured context is copied to clipboard
5. Paste into any terminal agent (Claude Code, Codex, OpenCode, Amp, ...)
6. Press **ESC** to close

## What gets captured

```
pikr: form.order-form > button.submit
url: http://localhost:3000/orders
ancestry: form.order-form > div.actions > [this]

<button class="submit btn-primary">Submit Order</button>

styles: background-color: #2563eb; color: #fff; border-radius: 8px
```

Every capture is also logged to `~/.pikr/selections.jsonl` for agent access.

## Options

```
pikr [url]                  Open URL (or auto-detect dev server)
pikr --connect <endpoint>   Connect to a debug port (Tauri, remote)
pikr --log <path>           Custom log file path
pikr --no-clipboard         Log only, skip clipboard
pikr install-skill          Install Claude Code skill
pikr install-skill --local  Install to project .claude/skills/
```

## Tauri support

Connect to a Tauri app's webview debug port:

```bash
# macOS: launch Tauri with inspector enabled
WEBKIT_INSPECTOR_SERVER=0.0.0.0:9222 cargo tauri dev

# Connect pikr
pikr --connect http://localhost:9222
```

## Claude Code skill

Install the skill so the agent can launch pikr and read selections automatically:

```bash
pikr install-skill
```

Then say "open pikr" or let the agent suggest it when you describe a UI element.

## How it's built

- **puppeteer-core** — launches system Chrome via CDP, no bundled browser
- **JS-injected overlay** — works on any page, any framework, Tauri webviews
- **Clipboard-first** — universal interface, works with every agent
- **JSONL log** — structured selections for agent file access

## Requirements

- Node.js 18+
- Chrome or Chromium installed

## License

MIT
