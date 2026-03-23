import { BasePlugin } from "./base.js";

/**
 * Built-in React source mapping plugin.
 *
 * Strategy (cascading, first match wins):
 *   1. data-inspector-* attributes (requires @react-dev-inspector/babel-plugin)
 *   2. __reactFiber$*._debugSource (React 18)
 *   3. __reactFiber$*._debugStack parsing (React 19+, best-effort)
 */
class ReactPlugin extends BasePlugin {
  name = "react";

  protected detectExpression =
    "typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__ !== 'undefined'";

  protected enrichScript = `
(function(selector) {
  var el = document.querySelector(selector);
  if (!el) return null;

  var cur = el;
  while (cur && cur !== document.body) {

    // 1. React dev inspector attributes
    if (cur.dataset && cur.dataset.inspectorRelativePath) {
      return {
        componentName: null,
        filePath: cur.dataset.inspectorRelativePath,
        line: parseInt(cur.dataset.inspectorLine) || null,
        col: parseInt(cur.dataset.inspectorColumn) || null,
      };
    }

    // 2 & 3. React fiber
    var keys = Object.keys(cur);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k.indexOf('__reactFiber$') === 0 || k.indexOf('__reactInternalInstance$') === 0) {
        var fiber = cur[k];
        while (fiber) {
          // React 18: _debugSource
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
          // React 19+: _debugStack
          if (fiber._debugStack && typeof fiber._debugStack === 'object') {
            var stack = fiber._debugStack.stack || String(fiber._debugStack);
            var m = stack.match(/at\\s+(\\w+)\\s+\\(https?:\\/\\/[^/]+\\/(src\\/[^?:]+)[^:]*:(\\d+):(\\d+)\\)/);
            if (!m) {
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
        break;
      }
    }

    cur = cur.parentElement;
  }
  return null;
})`;
}

export const reactPlugin = new ReactPlugin();
