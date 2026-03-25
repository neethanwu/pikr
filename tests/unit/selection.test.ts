import { describe, it, expect } from "vitest";
import {
  generateSessionId,
  toSelection,
  toClipboardText,
  toLogLine,
  toBatchSelection,
  toBatchClipboardText,
  toBatchLogLine,
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
  it("starts with pikr: selector header", () => {
    const sel = toSelection(mockEvent, "pikr-123-abc", "http://localhost:3000");
    const text = toClipboardText(sel);
    expect(text).toMatch(/^pikr: div\.hero > button\.cta/);
  });

  it("includes url line", () => {
    const sel = toSelection(mockEvent, "pikr-123-abc", "http://localhost:3000");
    const text = toClipboardText(sel);
    expect(text).toContain("url: http://localhost:3000");
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
    expect(text).toContain("ancestry: section.hero > div.hero-content > [this]");
  });

  it("omits source when component and filePath are null", () => {
    const sel = toSelection(mockEvent, "pikr-123-abc", "http://localhost:3000");
    const text = toClipboardText(sel);
    expect(text).not.toContain("source:");
  });

  it("includes source when component is set", () => {
    const sel = toSelection(mockEvent, "pikr-123-abc", "http://localhost:3000");
    sel.component = "HeroButton";
    sel.filePath = "src/components/Hero.tsx";
    const text = toClipboardText(sel);
    expect(text).toContain("source: HeroButton in src/components/Hero.tsx");
  });

  it("omits styles when styles object is empty", () => {
    const sel = toSelection(
      { ...mockEvent, styles: {} },
      "pikr-123-abc",
      "http://localhost:3000"
    );
    const text = toClipboardText(sel);
    expect(text).not.toContain("styles:");
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

// --- Batch tests ---

const mockBatchItems = [
  {
    index: 1,
    selector: "button.submit",
    html: "<button>Submit</button>",
    ancestry: "form > [this]",
    styles: { "background-color": "#2563eb" },
    tagName: "button",
    textContent: "Submit",
    comment: "make this bigger",
  },
  {
    index: 2,
    selector: "nav.main",
    html: "<nav>Nav</nav>",
    ancestry: "header > [this]",
    styles: {},
    tagName: "nav",
    textContent: "Nav",
    comment: null,
  },
];

describe("toBatchSelection", () => {
  it("creates batch with correct structure", () => {
    const batch = toBatchSelection(mockBatchItems, "pikr-batch-test", "http://localhost:3000");
    expect(batch.sessionId).toBe("pikr-batch-test");
    expect(batch.url).toBe("http://localhost:3000");
    expect(batch.selections).toHaveLength(2);
    expect(batch.selections[0].comment).toBe("make this bigger");
    expect(batch.selections[1].comment).toBeNull();
  });

  it("merges enrichments when provided", () => {
    const enrichments = [
      { componentName: "SubmitBtn", filePath: "src/Button.tsx", line: 42 },
      null,
    ];
    const batch = toBatchSelection(mockBatchItems, "test", "http://localhost:3000", enrichments);
    expect(batch.selections[0].component).toBe("SubmitBtn");
    expect(batch.selections[0].filePath).toBe("src/Button.tsx:42");
    expect(batch.selections[1].component).toBeNull();
    expect(batch.selections[1].filePath).toBeNull();
  });
});

describe("toBatchClipboardText", () => {
  it("includes element count header", () => {
    const batch = toBatchSelection(mockBatchItems, "test", "http://localhost:3000");
    const text = toBatchClipboardText(batch);
    expect(text).toContain("pikr: 2 elements selected");
  });

  it("separates elements with ---", () => {
    const batch = toBatchSelection(mockBatchItems, "test", "http://localhost:3000");
    const text = toBatchClipboardText(batch);
    expect(text).toContain("---");
  });

  it("includes comments when present", () => {
    const batch = toBatchSelection(mockBatchItems, "test", "http://localhost:3000");
    const text = toBatchClipboardText(batch);
    expect(text).toContain("comment: make this bigger");
  });

  it("omits comment line when null", () => {
    const batch = toBatchSelection(mockBatchItems, "test", "http://localhost:3000");
    const text = toBatchClipboardText(batch);
    const sections = text.split("---");
    // Second element (nav) should not have "comment:" line
    expect(sections[2]).not.toContain("comment:");
  });

  it("includes numbered indices", () => {
    const batch = toBatchSelection(mockBatchItems, "test", "http://localhost:3000");
    const text = toBatchClipboardText(batch);
    expect(text).toContain("[1] button.submit");
    expect(text).toContain("[2] nav.main");
  });
});

describe("toBatchLogLine", () => {
  it("produces valid JSON with selections array", () => {
    const batch = toBatchSelection(mockBatchItems, "test", "http://localhost:3000");
    const line = toBatchLogLine(batch);
    const parsed = JSON.parse(line);
    expect(parsed.selections).toHaveLength(2);
    expect(parsed.sessionId).toBe("test");
  });

  it("produces a single line", () => {
    const batch = toBatchSelection(mockBatchItems, "test", "http://localhost:3000");
    const line = toBatchLogLine(batch);
    expect(line).not.toContain("\n");
  });
});
