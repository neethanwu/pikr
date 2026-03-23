import type { CDPSession } from "puppeteer-core";
import type { PikrPlugin, PluginEnrichment } from "../plugins.js";
import type { SelectionEvent } from "../inspector.js";

/**
 * Built-in source mapping plugin for Vite projects.
 *
 * Auto-detects Vue 3 and React (any bundler, not just Vite).
 * Maps clicked DOM elements to their source file + line number.
 *
 * Strategy (cascading, first match wins):
 *   1. data-inspector-* attributes (React, requires @react-dev-inspector/babel-plugin)
 *   2. __vueParentComponent.type.__file (Vue 3, built-in to dev mode)
 *   3. __reactFiber$*._debugSource (React 18, built-in to dev JSX transform)
 *   4. __reactFiber$*._debugStack parsing (React 19+, best-effort)
 */

type DetectedFramework = "vue" | "react" | null;

// The enrichment script runs in the browser via CDP Runtime.evaluate.
// It walks up the DOM from the selected element, trying each strategy.
const ENRICH_SCRIPT = `
(function(selector) {
  var el = document.querySelector(selector);
  if (!el) return null;

  var cur = el;
  while (cur && cur !== document.body) {

    // 1. React dev inspector attributes (most reliable, any React version)
    if (cur.dataset && cur.dataset.inspectorRelativePath) {
      return {
        componentName: null,
        filePath: cur.dataset.inspectorRelativePath,
        line: parseInt(cur.dataset.inspectorLine) || null,
        col: parseInt(cur.dataset.inspectorColumn) || null,
      };
    }

    // 2. Vue: __vueParentComponent
    if (cur.__vueParentComponent) {
      var comp = cur.__vueParentComponent;
      var name = (comp.type && (comp.type.__name || comp.type.name)) || null;
      var file = (comp.type && comp.type.__file) || null;
      if (file) {
        return { componentName: name, filePath: file, line: null, col: null };
      }
    }

    // 3 & 4. React: find fiber via __reactFiber$* or __reactInternalInstance$*
    var keys = Object.keys(cur);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k.indexOf('__reactFiber$') === 0 || k.indexOf('__reactInternalInstance$') === 0) {
        var fiber = cur[k];
        // Walk up fiber tree to find component with source info
        while (fiber) {
          // React 18: _debugSource (structured object)
          if (fiber._debugSource) {
            var src = fiber._debugSource;
            var fname = (fiber.type && (fiber.type.displayName || fiber.type.name)) || null;
            return {
              componentName: fname,
              filePath: src.fileName,
              line: src.lineNumber || null,
              col: src.columnNumber || null,
            };
          }
          // React 19+: _debugStack (Error object, parse V8 stack trace)
          if (fiber._debugStack && typeof fiber._debugStack === 'object') {
            var stack = fiber._debugStack.stack || String(fiber._debugStack);
            // Match: "at ComponentName (http://localhost:5173/src/App.tsx?t=...:42:7)"
            var m = stack.match(/at\\s+(\\w+)\\s+\\(https?:\\/\\/[^/]+\\/(src\\/[^?:]+)[^:]*:(\\d+):(\\d+)\\)/);
            if (!m) {
              // Also try: "at http://localhost:5173/src/App.tsx:42:7"
              m = stack.match(/at\\s+https?:\\/\\/[^/]+\\/(src\\/[^?:]+)[^:]*:(\\d+):(\\d+)/);
              if (m) m = [m[0], null, m[1], m[2], m[3]];
            }
            if (m) {
              var cname = (fiber.type && (fiber.type.displayName || fiber.type.name)) || m[1] || null;
              return {
                componentName: cname,
                filePath: m[2],
                line: parseInt(m[3]) || null,
                col: parseInt(m[4]) || null,
              };
            }
          }
          fiber = fiber.return;
        }
        break; // found a fiber key, don't check other keys
      }
    }

    cur = cur.parentElement;
  }
  return null;
})
`;

class VitePlugin implements PikrPlugin {
  name = "vite";
  private framework: DetectedFramework = null;

  async detect(cdp: CDPSession): Promise<boolean> {
    try {
      const result = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
          if (typeof window.__VUE__ !== 'undefined') return 'vue';
          if (typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__ !== 'undefined') return 'react';
          return null;
        })()`,
        returnByValue: true,
      });

      this.framework = (result.result.value as DetectedFramework) ?? null;
      return this.framework !== null;
    } catch {
      return false;
    }
  }

  async enrich(
    cdp: CDPSession,
    selection: SelectionEvent
  ): Promise<PluginEnrichment | null> {
    try {
      // Escape selector for use in JS string
      const escapedSelector = selection.selector
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'");

      const result = await cdp.send("Runtime.evaluate", {
        expression: `${ENRICH_SCRIPT}('${escapedSelector}')`,
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

export const vitePlugin = new VitePlugin();
