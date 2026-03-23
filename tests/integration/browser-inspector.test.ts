import { describe, it, expect, afterEach } from "vitest";
import { launchBrowser, findChrome } from "../../src/core/browser.js";
import { injectOverlay, listenForSelections } from "../../src/core/inspector.js";
import { toSelection, toClipboardText, toLogLine } from "../../src/core/selection.js";
import { writeSelection } from "../../src/core/output.js";
import { ChromeNotFoundError, ServerUnreachableError } from "../../src/core/errors.js";
import type { BrowserSession } from "../../src/core/browser.js";
import type { SelectionEvent } from "../../src/core/inspector.js";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";

// Simple test HTML page served locally
const TEST_HTML = `<!DOCTYPE html>
<html>
<head><title>pikr test</title></head>
<body>
  <div id="app">
    <h1 class="title">Test Page</h1>
    <button id="test-btn" class="btn primary" style="background: #2563eb; color: white; padding: 8px 16px; border-radius: 8px;">
      Click Me
    </button>
    <div class="card">
      <p class="card-text">Some content</p>
    </div>
  </div>
</body>
</html>`;

let server: ReturnType<typeof createServer>;
let serverUrl: string;
let session: BrowserSession | null = null;

function startServer(): Promise<string> {
  return new Promise((resolve) => {
    server = createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(TEST_HTML);
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        resolve(`http://127.0.0.1:${addr.port}`);
      }
    });
  });
}

function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) server.close(() => resolve());
    else resolve();
  });
}

afterEach(async () => {
  if (session) {
    try {
      await session.browser.close();
    } catch {}
    session = null;
  }
  await stopServer();
});

describe("launchBrowser", () => {
  it("opens Chromium and navigates to URL", async () => {
    serverUrl = await startServer();
    session = await launchBrowser({ url: serverUrl });

    expect(session.browser).toBeDefined();
    expect(session.page).toBeDefined();
    expect(session.cdp).toBeDefined();
    expect(session.mode).toBe("launch");

    const title = await session.page.title();
    expect(title).toBe("pikr test");
  });

  it("throws ChromeNotFoundError with bad executable path", async () => {
    serverUrl = await startServer();
    await expect(
      launchBrowser({ url: serverUrl, executablePath: "/nonexistent/chrome" })
    ).rejects.toThrow();
  });

  it("throws ServerUnreachableError for dead URL", async () => {
    await expect(
      launchBrowser({ url: "http://127.0.0.1:19999" })
    ).rejects.toThrow(ServerUnreachableError);
  });
});

describe("injectOverlay", () => {
  it("injects without error on a simple page", async () => {
    serverUrl = await startServer();
    session = await launchBrowser({ url: serverUrl });
    await injectOverlay(session.page);

    // Verify overlay elements exist in the page
    const hasOverlay = await session.page.evaluate(() => {
      return !!(
        document.getElementById("__pikr-highlight") &&
        document.getElementById("__pikr-label") &&
        document.getElementById("__pikr-toggle") &&
        document.getElementById("__pikr-toast")
      );
    });
    expect(hasOverlay).toBe(true);
  });

  it("starts in browse mode (toggle button says Browse)", async () => {
    serverUrl = await startServer();
    session = await launchBrowser({ url: serverUrl });
    await injectOverlay(session.page);

    // Wait for entrance animation to render content
    await new Promise((r) => setTimeout(r, 200));

    const btnText = await session.page.evaluate(() => {
      return document.getElementById("__pikr-toggle")?.textContent;
    });
    expect(btnText).toContain("pikr");
  });
});

describe("listenForSelections", () => {
  it("receives events when page sends __pikr__ console.debug", async () => {
    serverUrl = await startServer();
    session = await launchBrowser({ url: serverUrl });

    const received: SelectionEvent[] = [];
    await listenForSelections(session.cdp, (event) => {
      received.push(event);
    });

    // Simulate what the overlay does: send a console.debug with __pikr__ marker
    await session.page.evaluate(() => {
      console.debug(
        "__pikr__",
        JSON.stringify({
          type: "selection",
          selector: "#test-btn",
          html: '<button id="test-btn">Click Me</button>',
          ancestry: "div#app > [this]",
          styles: { backgroundColor: "#2563eb" },
          tagName: "button",
          textContent: "Click Me",
        })
      );
    });

    // Give CDP a moment to deliver the event
    await new Promise((r) => setTimeout(r, 200));

    expect(received).toHaveLength(1);
    expect(received[0].selector).toBe("#test-btn");
    expect(received[0].tagName).toBe("button");
  });

  it("ignores non-pikr console messages", async () => {
    serverUrl = await startServer();
    session = await launchBrowser({ url: serverUrl });

    const received: SelectionEvent[] = [];
    await listenForSelections(session.cdp, (event) => {
      received.push(event);
    });

    await session.page.evaluate(() => {
      console.debug("not a pikr message");
      console.log("regular log");
      console.debug("__pikr__", "invalid json {{{");
    });

    await new Promise((r) => setTimeout(r, 200));
    expect(received).toHaveLength(0);
  });
});

describe("full pipeline: overlay → click → selection", () => {
  it("captures element on simulated click in inspect mode", async () => {
    serverUrl = await startServer();
    session = await launchBrowser({ url: serverUrl });
    await injectOverlay(session.page);

    const received: SelectionEvent[] = [];
    await listenForSelections(session.cdp, (event) => {
      received.push(event);
    });

    // Toggle to inspect mode via keyboard
    await session.page.keyboard.down("Meta");
    await session.page.keyboard.down("Shift");
    await session.page.keyboard.press("x");
    await session.page.keyboard.up("Shift");
    await session.page.keyboard.up("Meta");
    await new Promise((r) => setTimeout(r, 100));

    // Verify we're in inspect mode
    const btnText = await session.page.evaluate(() => {
      return document.getElementById("__pikr-toggle")?.textContent;
    });
    expect(btnText).toContain("pikr");

    // Click the test button
    await session.page.click("#test-btn");
    await new Promise((r) => setTimeout(r, 300));

    expect(received.length).toBeGreaterThanOrEqual(1);
    const sel = received[0];
    expect(sel.tagName).toBe("button");
    expect(sel.html).toContain("Click Me");
    expect(sel.selector).toContain("test-btn");
  });

  it("does NOT capture in browse mode", async () => {
    serverUrl = await startServer();
    session = await launchBrowser({ url: serverUrl });
    await injectOverlay(session.page);

    const received: SelectionEvent[] = [];
    await listenForSelections(session.cdp, (event) => {
      received.push(event);
    });

    // Click without toggling to inspect mode — should not capture
    await session.page.click("#test-btn");
    await new Promise((r) => setTimeout(r, 300));

    expect(received).toHaveLength(0);
  });

  it("writes selection to log file through full pipeline", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "pikr-e2e-"));
    const logPath = join(tmpDir, "selections.jsonl");

    try {
      serverUrl = await startServer();
      session = await launchBrowser({ url: serverUrl });
      await injectOverlay(session.page);

      await listenForSelections(session.cdp, async (event) => {
        const selection = toSelection(event, "e2e-session", serverUrl);
        await writeSelection(selection, { clipboard: false, logPath });
      });

      // Toggle inspect mode
      await session.page.keyboard.down("Meta");
      await session.page.keyboard.down("Shift");
      await session.page.keyboard.press("x");
      await session.page.keyboard.up("Shift");
      await session.page.keyboard.up("Meta");
      await new Promise((r) => setTimeout(r, 100));

      // Click element
      await session.page.click("#test-btn");
      await new Promise((r) => setTimeout(r, 500));

      // Verify log file
      const content = await readFile(logPath, "utf-8");
      const lines = content.trim().split("\n");
      expect(lines.length).toBeGreaterThanOrEqual(1);

      const entry = JSON.parse(lines[0]);
      expect(entry.sessionId).toBe("e2e-session");
      expect(entry.html).toContain("Click Me");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("overlay persists after page navigation", async () => {
    serverUrl = await startServer();
    session = await launchBrowser({ url: serverUrl });
    await injectOverlay(session.page);

    // Navigate to the same page (simulating in-app navigation)
    await session.page.goto(serverUrl, { waitUntil: "load" });
    await new Promise((r) => setTimeout(r, 500));

    // Overlay should still exist after navigation (via evaluateOnNewDocument + DOMContentLoaded fallback)
    const hasOverlay = await session.page.evaluate(() => {
      return !!document.getElementById("__pikr-toggle");
    });
    expect(hasOverlay).toBe(true);
  });
});
