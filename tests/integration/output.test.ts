import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeSelection } from "../../src/core/output.js";
import { toSelection } from "../../src/core/selection.js";
import type { SelectionEvent } from "../../src/core/inspector.js";

const mockEvent: SelectionEvent = {
  type: "selection",
  selector: "button.submit",
  html: "<button>Submit</button>",
  ancestry: "form > [this]",
  styles: { color: "red" },
  tagName: "button",
  textContent: "Submit",
};

describe("writeSelection", () => {
  let tmpDir: string;
  let logPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "pikr-test-"));
    logPath = join(tmpDir, "subdir", "selections.jsonl");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("creates parent directory if missing", async () => {
    const sel = toSelection(mockEvent, "test-session", "http://localhost:3000");
    await writeSelection(sel, { clipboard: false, logPath });
    const content = await readFile(logPath, "utf-8");
    expect(content.length).toBeGreaterThan(0);
  });

  it("appends valid NDJSON line to log file", async () => {
    const sel = toSelection(mockEvent, "test-session", "http://localhost:3000");
    await writeSelection(sel, { clipboard: false, logPath });

    const content = await readFile(logPath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.sessionId).toBe("test-session");
    expect(parsed.selector).toBe("button.submit");
    expect(parsed.html).toBe("<button>Submit</button>");
  });

  it("appends multiple entries on multiple calls", async () => {
    const sel1 = toSelection(mockEvent, "test-session", "http://localhost:3000");
    const sel2 = toSelection(
      { ...mockEvent, selector: "div.hero" },
      "test-session",
      "http://localhost:3000"
    );

    await writeSelection(sel1, { clipboard: false, logPath });
    await writeSelection(sel2, { clipboard: false, logPath });

    const content = await readFile(logPath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);

    expect(JSON.parse(lines[0]).selector).toBe("button.submit");
    expect(JSON.parse(lines[1]).selector).toBe("div.hero");
  });

  it("skips clipboard when clipboard: false", async () => {
    const sel = toSelection(mockEvent, "test-session", "http://localhost:3000");
    // This should not throw even if clipboard is unavailable
    await writeSelection(sel, { clipboard: false, logPath });
    const content = await readFile(logPath, "utf-8");
    expect(content.length).toBeGreaterThan(0);
  });

  it("handles unwritable log path gracefully", async () => {
    const sel = toSelection(mockEvent, "test-session", "http://localhost:3000");
    const badPath = "/nonexistent-root-dir/impossible/selections.jsonl";

    // Should not throw — errors go to stderr
    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await writeSelection(sel, { clipboard: false, logPath: badPath });
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("pikr warning: log file:")
    );
    stderrSpy.mockRestore();
  });
});
