import { describe, it, expect, vi } from "vitest";
import { vitePlugin } from "../../src/core/plugins/vite.js";

// Mock CDPSession
function mockCDP(evaluateResult: unknown) {
  return {
    send: vi.fn().mockResolvedValue({
      result: { value: evaluateResult },
    }),
  } as any;
}

describe("vitePlugin", () => {
  describe("detect", () => {
    it("returns true when Vue is detected", async () => {
      const cdp = mockCDP("vue");
      expect(await vitePlugin.detect(cdp)).toBe(true);
    });

    it("returns true when React is detected", async () => {
      const cdp = mockCDP("react");
      expect(await vitePlugin.detect(cdp)).toBe(true);
    });

    it("returns false when no framework is detected", async () => {
      const cdp = mockCDP(null);
      expect(await vitePlugin.detect(cdp)).toBe(false);
    });

    it("returns false on CDP error", async () => {
      const cdp = { send: vi.fn().mockRejectedValue(new Error("CDP error")) } as any;
      expect(await vitePlugin.detect(cdp)).toBe(false);
    });
  });

  describe("enrich", () => {
    const mockSelection = {
      type: "selection" as const,
      selector: "#test-btn",
      html: "<button>Test</button>",
      ancestry: "div > [this]",
      styles: {},
      tagName: "button",
      textContent: "Test",
    };

    it("returns enrichment when source is found", async () => {
      const cdp = mockCDP({
        componentName: "MyButton",
        filePath: "src/components/Button.tsx",
        line: 42,
        col: 7,
      });

      const result = await vitePlugin.enrich(cdp, mockSelection);
      expect(result).toEqual({
        componentName: "MyButton",
        filePath: "src/components/Button.tsx",
        line: 42,
        col: 7,
      });
    });

    it("returns null when no source is found", async () => {
      const cdp = mockCDP(null);
      const result = await vitePlugin.enrich(cdp, mockSelection);
      expect(result).toBeNull();
    });

    it("returns null when filePath is empty", async () => {
      const cdp = mockCDP({ componentName: "Foo", filePath: null });
      const result = await vitePlugin.enrich(cdp, mockSelection);
      expect(result).toBeNull();
    });

    it("returns null on CDP error", async () => {
      const cdp = { send: vi.fn().mockRejectedValue(new Error("CDP error")) } as any;
      const result = await vitePlugin.enrich(cdp, mockSelection);
      expect(result).toBeNull();
    });

    it("handles selector with special characters", async () => {
      const cdp = mockCDP({
        componentName: "Card",
        filePath: "src/Card.vue",
        line: 10,
        col: null,
      });

      const result = await vitePlugin.enrich(cdp, {
        ...mockSelection,
        selector: "div.hero > button.btn-primary:nth-of-type(2)",
      });

      expect(result).toEqual({
        componentName: "Card",
        filePath: "src/Card.vue",
        line: 10,
        col: undefined,
      });

      // Verify selector was properly escaped in the expression
      const call = cdp.send.mock.calls[0];
      expect(call[1].expression).toContain("div.hero > button.btn-primary:nth-of-type(2)");
    });

    it("converts null line/col to undefined", async () => {
      const cdp = mockCDP({
        componentName: "App",
        filePath: "src/App.vue",
        line: null,
        col: null,
      });

      const result = await vitePlugin.enrich(cdp, mockSelection);
      expect(result?.line).toBeUndefined();
      expect(result?.col).toBeUndefined();
    });
  });

  it("has name 'vite'", () => {
    expect(vitePlugin.name).toBe("vite");
  });
});
