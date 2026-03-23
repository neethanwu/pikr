# pikr

A CLI tool that lets you visually pick UI elements and get structured context for your AI agent. Click → clipboard → paste.

## Install

```bash
npm install -g pikr
```

Or run directly:

```bash
npx pikr
```

## Quickstart

```bash
pikr              # auto-detect running dev server
pikr 3000         # port shorthand
pikr localhost:3000
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

## Install

For one-off use:

```bash
npx pikr 3000
```

For regular use or agent access:

```bash
npm install -g pikr
pikr 3000
```

Global install lets AI agents launch pikr directly and read selections from the log file at `~/.pikr/selections.jsonl`.

## Agent integration

pikr works with any terminal agent out of the box — just paste the clipboard output.

For deeper integration, agents can:

1. Launch pikr as a background process: `pikr 3000 &`
2. Read selections from `~/.pikr/selections.jsonl` (NDJSON, one entry per line)
3. Each entry includes `selector`, `html`, `styles`, `ancestry`, and `sessionId`

**Coming soon:** agent skills that let your AI agent launch pikr and read selections automatically.

## Options

```
pikr                       Auto-detect dev server
pikr 3000                  Port shorthand
pikr localhost:3000        URL without http://
pikr http://localhost:3000 Full URL
pikr --connect <endpoint>  Connect to debug port (Tauri)
pikr --log <path>          Custom log file path
pikr --no-clipboard        Log only, skip clipboard
pikr --plugin <path>       Load a framework plugin
```

## Plugins

pikr captures raw DOM data by default. Framework plugins can enrich selections with component names and source file paths.

```bash
pikr --plugin ./my-plugin.js
```

Plugins are also auto-discovered from `node_modules` (`pikr-plugin-*` or `@pikr/plugin-*`).

**Coming soon:** built-in Vite and React source mapping.

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
