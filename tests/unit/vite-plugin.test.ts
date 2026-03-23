import { describe, it, expect, vi } from "vitest";
import { reactPlugin } from "../../src/core/plugins/react.js";
import { vuePlugin } from "../../src/core/plugins/vue.js";

function mockCDP(evaluateResult: unknown) {
  return {
    send: vi.fn().mockResolvedValue({
      result: { value: evaluateResult },
    }),
  } as any;
}

function failCDP() {
  return { send: vi.fn().mockRejectedValue(new Error("CDP error")) } as any;
}

const mockSelection = {
  type: "selection" as const,
  selector: "#test-btn",
  html: "<button>Test</button>",
  ancestry: "div > [this]",
  styles: {},
  tagName: "button",
  textContent: "Test",
};

describe("reactPlugin", () => {
  it("has name 'react'", () => {
    expect(reactPlugin.name).toBe("react");
  });

  describe("detect", () => {
    it("returns true when React is detected", async () => {
      const cdp = mockCDP(true);
      expect(await reactPlugin.detect(cdp)).toBe(true);
    });

    it("returns false when React is not detected", async () => {
      const cdp = mockCDP(false);
      expect(await reactPlugin.detect(cdp)).toBe(false);
    });

    it("returns false on CDP error", async () => {
      expect(await reactPlugin.detect(failCDP())).toBe(false);
    });
  });

  describe("enrich", () => {
    it("returns enrichment with file path", async () => {
      const cdp = mockCDP({
        componentName: "MyButton",
        filePath: "src/components/Button.tsx",
        line: 42,
        col: 7,
      });
      const result = await reactPlugin.enrich(cdp, mockSelection);
      expect(result).toEqual({
        componentName: "MyButton",
        filePath: "src/components/Button.tsx",
        line: 42,
        col: 7,
      });
    });

    it("returns null when no source found", async () => {
      expect(await reactPlugin.enrich(mockCDP(null), mockSelection)).toBeNull();
    });

    it("returns null when filePath is empty", async () => {
      expect(await reactPlugin.enrich(mockCDP({ filePath: null }), mockSelection)).toBeNull();
    });

    it("returns null on CDP error", async () => {
      expect(await reactPlugin.enrich(failCDP(), mockSelection)).toBeNull();
    });

    it("converts null line/col to undefined", async () => {
      const cdp = mockCDP({ componentName: "App", filePath: "src/App.tsx", line: null, col: null });
      const result = await reactPlugin.enrich(cdp, mockSelection);
      expect(result?.line).toBeUndefined();
      expect(result?.col).toBeUndefined();
    });
  });
});

describe("vuePlugin", () => {
  it("has name 'vue'", () => {
    expect(vuePlugin.name).toBe("vue");
  });

  describe("detect", () => {
    it("returns true when Vue is detected", async () => {
      const cdp = mockCDP(true);
      expect(await vuePlugin.detect(cdp)).toBe(true);
    });

    it("returns false when Vue is not detected", async () => {
      const cdp = mockCDP(false);
      expect(await vuePlugin.detect(cdp)).toBe(false);
    });

    it("returns false on CDP error", async () => {
      expect(await vuePlugin.detect(failCDP())).toBe(false);
    });
  });

  describe("enrich", () => {
    it("returns enrichment with file path", async () => {
      const cdp = mockCDP({
        componentName: "MyComponent",
        filePath: "/Users/dev/project/src/App.vue",
        line: null,
        col: null,
      });
      const result = await vuePlugin.enrich(cdp, mockSelection);
      expect(result).toEqual({
        componentName: "MyComponent",
        filePath: "/Users/dev/project/src/App.vue",
        line: undefined,
        col: undefined,
      });
    });

    it("returns null when no source found", async () => {
      expect(await vuePlugin.enrich(mockCDP(null), mockSelection)).toBeNull();
    });

    it("returns null on CDP error", async () => {
      expect(await vuePlugin.enrich(failCDP(), mockSelection)).toBeNull();
    });
  });
});
