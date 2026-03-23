import type { CDPSession } from "puppeteer-core";
import type { PikrPlugin, PluginEnrichment } from "../plugins.js";
import type { SelectionEvent } from "../inspector.js";

/**
 * Base class for built-in framework plugins.
 * Handles the common CDP evaluate pattern for detect and enrich.
 * Subclasses provide the detection expression and enrichment script.
 */
export abstract class BasePlugin implements PikrPlugin {
  abstract name: string;

  /** JS expression that returns true/false for framework detection */
  protected abstract detectExpression: string;

  /** JS IIFE that takes a CSS selector and returns PluginEnrichment | null */
  protected abstract enrichScript: string;

  async detect(cdp: CDPSession): Promise<boolean> {
    try {
      const result = await cdp.send("Runtime.evaluate", {
        expression: this.detectExpression,
        returnByValue: true,
      });
      return result.result.value === true;
    } catch {
      return false;
    }
  }

  async enrich(
    cdp: CDPSession,
    selection: SelectionEvent
  ): Promise<PluginEnrichment | null> {
    try {
      const escaped = selection.selector
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'");

      const result = await cdp.send("Runtime.evaluate", {
        expression: `${this.enrichScript}('${escaped}')`,
        returnByValue: true,
      });

      const value = result.result.value as PluginEnrichment | null;
      if (!value || !value.filePath) return null;

      return {
        componentName: value.componentName ?? undefined,
        filePath: value.filePath,
        line: value.line ?? undefined,
        col: value.col ?? undefined,
      };
    } catch {
      return null;
    }
  }
}
