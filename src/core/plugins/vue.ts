import { BasePlugin } from "./base.js";

/**
 * Built-in Vue 3 source mapping plugin.
 *
 * Maps clicked elements to source files via __vueParentComponent.type.__file.
 * Built into Vue dev mode — no extra setup needed.
 */
class VuePlugin extends BasePlugin {
  name = "vue";

  protected detectExpression = "typeof window.__VUE__ !== 'undefined'";

  protected enrichScript = `
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
})`;
}

export const vuePlugin = new VuePlugin();
