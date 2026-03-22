import { describe, it, expect } from "vitest";
import {
  generateSessionId,
  toSelection,
  toClipboardText,
  toLogLine,
} from "../../src/core/selection.js";
import type { SelectionEvent } from "../../src/core/inspector.js";

const mockEvent: SelectionEvent = {
  type: "selection",
  selector: "div.hero > button.cta",
  html: '<button class="cta btn-primary">Get Started</button>',
  ancestry: "section.hero > div.hero-content > [this]",
  styles: {
    backgroundColor: "#2563eb",
    color: "#fff",
    borderRadius: "8px",
  },
  tagName: "button",
  textContent: "Get Started",
};

describe("generateSessionId", () => {
  it("returns pikr-<digits>-<hex> format", () => {
    const id = generateSessionId();
    expect(id).toMatch(/^pikr-\d+-[0-9a-f]{6}$/);
  });

  it("produces unique values on consecutive calls", () => {
    const ids = new Set(Array.from({ length: 10 }, () => generateSessionId()));
    expect(ids.size).toBe(10);
  });
});

describe("toSelection", () => {
  it("maps SelectionEvent fields correctly", () => {
    const sel = toSelection(mockEvent, "pikr-123-abc", "http://localhost:3000");
    expect(sel.selector).toBe("div.hero > button.cta");
    expect(sel.html).toBe('<button class="cta btn-primary">Get Started</button>');
    expect(sel.ancestry).toBe("section.hero > div.hero-content > [this]");
    expect(sel.styles).toEqual({
      backgroundColor: "#2563eb",
      color: "#fff",
      borderRadius: "8px",
    });
    expect(sel.sessionId).toBe("pikr-123-abc");
    expect(sel.url).toBe("http://localhost:3000");
  });

  it("sets component and filePath to null by default", () => {
    const sel = toSelection(mockEvent, "pikr-123-abc", "http://localhost:3000");
    expect(sel.component).toBeNull();
    expect(sel.filePath).toBeNull();
  });

  it("includes a valid ISO timestamp", () => {
    const sel = toSelection(mockEvent, "pikr-123-abc", "http://localhost:3000");
    expect(new Date(sel.timestamp).toISOString()).toBe(sel.timestamp);
  });
});

describe("toClipboardText", () => {
  it("produces valid <pikr> XML envelope", () => {
    const sel = toSelection(mockEvent, "pikr-123-abc", "http://localhost:3000");
    const text = toClipboardText(sel);
    expect(text).toContain('<pikr url="http://localhost:3000">');
    expect(text).toContain("</pikr>");
    expect(text).toContain('<element selector="div.hero > button.cta">');
    expect(text).toContain("</element>");
  });

  it("includes element HTML", () => {
    const sel = toSelection(mockEvent, "pikr-123-abc", "http://localhost:3000");
    const text = toClipboardText(sel);
    expect(text).toContain('<button class="cta btn-primary">Get Started</button>');
  });

  it("converts camelCase style keys to kebab-case", () => {
    const sel = toSelection(mockEvent, "pikr-123-abc", "http://localhost:3000");
    const text = toClipboardText(sel);
    expect(text).toContain("background-color: #2563eb");
    expect(text).toContain("border-radius: 8px");
    expect(text).not.toContain("backgroundColor");
  });

  it("includes ancestry", () => {
    const sel = toSelection(mockEvent, "pikr-123-abc", "http://localhost:3000");
    const text = toClipboardText(sel);
    expect(text).toContain("<ancestry>section.hero > div.hero-content > [this]</ancestry>");
  });

  it("omits <source> when component and filePath are null", () => {
    const sel = toSelection(mockEvent, "pikr-123-abc", "http://localhost:3000");
    const text = toClipboardText(sel);
    expect(text).not.toContain("<source");
  });

  it("includes <source> when component is set", () => {
    const sel = toSelection(mockEvent, "pikr-123-abc", "http://localhost:3000");
    sel.component = "HeroButton";
    sel.filePath = "src/components/Hero.tsx";
    const text = toClipboardText(sel);
    expect(text).toContain('<source component="HeroButton" file="src/components/Hero.tsx" />');
  });

  it("omits <styles> when styles object is empty", () => {
    const sel = toSelection(
      { ...mockEvent, styles: {} },
      "pikr-123-abc",
      "http://localhost:3000"
    );
    const text = toClipboardText(sel);
    expect(text).not.toContain("<styles>");
  });
});

describe("toLogLine", () => {
  it("produces valid JSON", () => {
    const sel = toSelection(mockEvent, "pikr-123-abc", "http://localhost:3000");
    const line = toLogLine(sel);
    const parsed = JSON.parse(line);
    expect(parsed.sessionId).toBe("pikr-123-abc");
    expect(parsed.url).toBe("http://localhost:3000");
  });

  it("round-trips back to a Selection object", () => {
    const sel = toSelection(mockEvent, "pikr-123-abc", "http://localhost:3000");
    const line = toLogLine(sel);
    const parsed = JSON.parse(line);
    expect(parsed.selector).toBe(sel.selector);
    expect(parsed.html).toBe(sel.html);
    expect(parsed.styles).toEqual(sel.styles);
    expect(parsed.component).toBeNull();
    expect(parsed.filePath).toBeNull();
  });

  it("produces a single line (no newlines)", () => {
    const sel = toSelection(mockEvent, "pikr-123-abc", "http://localhost:3000");
    const line = toLogLine(sel);
    expect(line).not.toContain("\n");
  });
});
