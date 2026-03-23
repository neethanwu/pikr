import type { CDPSession } from "puppeteer-core";
import type { PikrPlugin, PluginEnrichment } from "../plugins.js";
import type { SelectionEvent } from "../inspector.js";

/**
 * Built-in Vue 3 source mapping plugin.
 *
 * Detects Vue 3 and maps clicked elements to source files
 * via __vueParentComponent.type.__file (built into Vue dev mode, no extra setup).
 */

const ENRICH_SCRIPT = `
(function(selector) {
  var el = document.querySelector(selector);
  if (!el) return null;

  var cur = el;
  while (cur && cur !== document.body) {
    if (cur.__vueParentComponent) {
      var comp = cur.__vueParentComponent;
      var name = (comp.type && (comp.type.__name || comp.type.name)) || null;
      var file = (comp.type && comp.type.__file) || null;
      if (file) {
        return { componentName: name, filePath: file, line: null, col: null };
      }
    }
    cur = cur.parentElement;
  }
  return null;
})
`;

function escapeSelector(selector: string): string {
  return selector.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

class VuePlugin implements PikrPlugin {
  name = "vue";

  async detect(cdp: CDPSession): Promise<boolean> {
    try {
      const result = await cdp.send("Runtime.evaluate", {
        expression: "typeof window.__VUE__ !== 'undefined'",
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
      const result = await cdp.send("Runtime.evaluate", {
        expression: `${ENRICH_SCRIPT}('${escapeSelector(selection.selector)}')`,
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

export const vuePlugin = new VuePlugin();
