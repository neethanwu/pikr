# pikr

[![npm](https://img.shields.io/npm/v/@neethan/pikr)](https://www.npmjs.com/package/@neethan/pikr)
[![license](https://img.shields.io/npm/l/@neethan/pikr)](LICENSE)

A CLI tool that lets you visually pick UI elements and get structured context for your AI agent. Click → clipboard → paste.

https://github.com/user-attachments/assets/4f31a091-c307-4621-b492-80e383316176

## Quickstart

```bash
npm install -g @neethan/pikr
```

Then from any project folder:

```bash
pikr
```

That's it. pikr starts your dev server if needed, opens Chrome, and you're ready to pick elements.

Or specify a port directly:

```bash
pikr <port>                 # e.g. pikr 3000, pikr 5173
```

## How it works

1. pikr detects your project, starts the dev server if needed, and opens Chrome
2. Click the pikr pill to toggle inspect mode
3. Click elements to select — each gets a numbered badge
4. Optionally click a badge to add a comment (e.g., "make this bigger")
5. Press **Enter** or click the send icon to copy all selections to clipboard
6. Paste into any terminal agent (Claude Code, Codex, OpenCode, Amp, ...)
7. Press **ESC** to exit inspect mode

## What gets captured

```
pikr: form.order-form > button.submit
url: http://localhost:3000/orders
source: OrderForm in src/components/OrderForm.tsx:84
ancestry: form.order-form > div.actions > [this]

<button class="submit btn-primary">Submit Order</button>

styles: background-color: #2563eb; color: #fff; border-radius: 8px
```

Every capture is also logged to `~/.pikr/selections.jsonl`.

## Source mapping

pikr auto-detects Vue and React projects and maps elements back to source files:

- **Vue 3** — component name + file path (works in dev mode, no extra setup)
- **React 18** — component name + file:line:col (works in dev mode)
- **React 19+** — best-effort file:line from stack trace parsing
- **React (any)** — precise file:line:col if `@react-dev-inspector/babel-plugin` is installed

## Agent integration

pikr works with any terminal agent out of the box — just paste the clipboard output.

For deeper integration, agents can:

1. Launch pikr as a background process: `pikr &`
2. Read selections from `~/.pikr/selections.jsonl` (NDJSON, one entry per line)
3. Each entry includes `selector`, `html`, `styles`, `ancestry`, `component`, `filePath`, and `sessionId`

## Options

```
pikr                       Auto-start or auto-detect dev server
pikr <port>                Port shorthand (e.g. pikr 3000)
pikr <url>                 Full URL (e.g. pikr localhost:3000)
pikr --log <path>          Custom log file path
pikr --no-clipboard        Log only, skip clipboard
pikr --plugin <path>       Load a framework plugin
```

## Plugins

pikr includes built-in source mapping for Vue and React. For other frameworks, you can write or install plugins:

```bash
pikr --plugin ./my-plugin.js
```

Plugins are also auto-discovered from `node_modules` (`pikr-plugin-*` or `@pikr/plugin-*`).

## Requirements

- Node.js 18+
- Chrome or Chromium installed

## License

MIT
