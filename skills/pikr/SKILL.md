---
name: pikr
description: >
  Launch a visual element picker for a running web app. Opens a Chromium browser
  with an inspector overlay — click any element to capture its HTML, styles,
  selector, and source location. Use when the user describes a UI element by
  appearance rather than providing code or selector context, when asked to change
  something visual ("make this button bigger", "fix the hero section"), or when
  the user says "open pikr", "pick element", "show me the page", or "which
  element". Also suggest when you need visual context about a running web app
  to make accurate changes.
allowed-tools: Bash, Read
---

# pikr — Visual Element Picker

You have access to **pikr**, a CLI tool that opens a Chromium browser with an inspector overlay. The user clicks UI elements and structured context is captured for you to act on.

## When to Use

- User describes a UI element by appearance ("the blue submit button", "the card on the right")
- User asks to change something visual without providing code context
- You need to understand what an element looks like or where it is in the DOM
- User explicitly asks to open pikr or pick an element

## How to Use

### Step 1: Determine the URL

Check the conversation for mentions of a dev server URL or port. Common patterns:
- "localhost:3000", "localhost:5173", "localhost:8080"
- Check `package.json` scripts for `dev`, `start`, or `serve` commands to infer the port

If you can't determine the URL, ask the user:
> "What URL is your dev server running on? (e.g., http://localhost:3000)"

### Step 2: Launch pikr

```bash
pikr <url> &
```

Launch pikr in the background. It will open a Chromium window showing the app.

Tell the user:
> "I've opened pikr at <url>. Switch to the browser window, press **Cmd/Ctrl+Shift+X** to enter inspect mode, then click the element you want to work with."

### Step 3: Read Selections

Poll the log file for new selections:

```bash
tail -1 ~/.pikr/selections.jsonl
```

The log file contains NDJSON (one JSON object per line). Each entry has:
- `sessionId` — identifies this pikr session
- `timestamp` — when the element was selected
- `url` — the page URL
- `selector` — CSS selector for the element
- `html` — the element's outer HTML
- `ancestry` — parent chain (e.g., `form.order-form > div.actions > [this]`)
- `styles` — key computed styles (background, color, font-size, etc.)
- `component` — React component name (if React plugin active, otherwise null)
- `filePath` — source file path (if React plugin active, otherwise null)

### Step 4: Act on the Selection

Use the captured context to:
1. Find the element in the source code using the selector, HTML content, or component/file info
2. Make the requested changes
3. Ask if the user wants to pick more elements or if you should proceed

### Step 5: Clean Up

When done, the user closes the browser window or you can stop the background process:

```bash
kill %1 2>/dev/null
```

## Clipboard Format

If the user pastes pikr output directly (instead of using the log file), it looks like:

```
<pikr url="http://localhost:3000/page">
<element selector="div.hero > button.cta">
<button class="cta btn-primary">Get Started</button>
</element>
<styles>background: #2563eb; color: #fff; border-radius: 8px;</styles>
<ancestry>section.hero > div.hero-content > [this]</ancestry>
</pikr>
```

Recognize and parse this format when you see it pasted into the conversation.

## Troubleshooting

- **pikr not found**: The user needs to install it: `npm install -g pikr`
- **Chrome not found**: Set `PUPPETEER_EXECUTABLE_PATH` or install Chrome
- **No selections appearing**: Remind the user to press Cmd/Ctrl+Shift+X to enter inspect mode first
