# pikr

Universal element picker for terminal-based AI coding agents.

Point at a UI element in your running app. Structured context goes to clipboard. Paste into any terminal agent.

## Quickstart

```bash
npx pikr
```

pikr auto-detects your running dev server. Or specify a port:

```bash
npx pikr 3000
```

## How it works

1. pikr opens a Chromium window showing your app
2. Click the pikr pill to toggle inspect mode
3. Hover to highlight elements, click to capture
4. Structured context is copied to clipboard
5. Paste into any terminal agent (Claude Code, Codex, OpenCode, Amp, ...)
6. Press **ESC** to exit inspect mode

## What gets captured

```
pikr: form.order-form > button.submit
url: http://localhost:3000/orders
ancestry: form.order-form > div.actions > [this]

<button class="submit btn-primary">Submit Order</button>

styles: background-color: #2563eb; color: #fff; border-radius: 8px
```

Every capture is also logged to `~/.pikr/selections.jsonl`.

## Options

```
pikr                       Auto-detect dev server
pikr 3000                  Port shorthand
pikr localhost:3000        URL without http://
pikr http://localhost:3000 Full URL
pikr --connect <endpoint>  Connect to debug port (Tauri)
pikr --log <path>          Custom log file path
pikr --no-clipboard        Log only, skip clipboard
```

## Tauri support

```bash
WEBKIT_INSPECTOR_SERVER=0.0.0.0:9222 cargo tauri dev
pikr --connect http://localhost:9222
```

## Requirements

- Node.js 18+
- Chrome or Chromium installed

## License

MIT
