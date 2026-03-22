import type { CDPSession } from "puppeteer-core";
import type { SelectionEvent } from "./inspector.js";

/**
 * Framework enrichment plugin interface.
 *
 * Plugins add framework-specific context to selections — component names,
 * source file paths, props, etc. pikr captures raw DOM data; plugins enrich it.
 *
 * To create a plugin, publish an npm package named `pikr-plugin-<name>` that
 * default-exports an object implementing this interface, or pass a local file
 * via `pikr --plugin ./my-plugin.js`.
 *
 * Example:
 * ```ts
 * import type { PikrPlugin } from "pikr";
 *
 * const plugin: PikrPlugin = {
 *   name: "react",
 *   async detect(cdp) {
 *     const result = await cdp.send("Runtime.evaluate", {
 *       expression: "typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__ !== 'undefined'",
 *       returnByValue: true,
 *     });
 *     return result.result.value === true;
 *   },
 *   async enrich(cdp, selection) {
 *     // Use CDP to query React Fiber tree for component info
 *     return { componentName: "MyComponent", filePath: "src/App.tsx", line: 42 };
 *   },
 * };
 * export default plugin;
 * ```
 */
export interface PikrPlugin {
  /** Plugin name (e.g., "react", "vue", "svelte") */
  name: string;

  /** Detect if this framework is present on the current page */
  detect(cdp: CDPSession): Promise<boolean>;

  /** Enrich a selection with framework-specific context. Return null to skip. */
  enrich(
    cdp: CDPSession,
    selection: SelectionEvent
  ): Promise<PluginEnrichment | null>;
}

export interface PluginEnrichment {
  componentName?: string;
  filePath?: string;
  line?: number;
  col?: number;
  props?: Record<string, unknown>;
}

/**
 * Plugin manager — discovers, loads, and runs plugins.
 */
export class PluginManager {
  private plugins: PikrPlugin[] = [];
  private active: PikrPlugin[] = [];

  /** Register a plugin instance */
  register(plugin: PikrPlugin): void {
    this.plugins.push(plugin);
  }

  /** Load a plugin from an npm package name or file path */
  async load(nameOrPath: string): Promise<void> {
    try {
      const mod = await import(nameOrPath);
      const plugin: PikrPlugin = mod.default ?? mod;
      if (!plugin.name || !plugin.detect || !plugin.enrich) {
        throw new Error(
          `Invalid plugin: must export { name, detect, enrich }`
        );
      }
      this.register(plugin);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`pikr: failed to load plugin "${nameOrPath}" — ${msg}`);
    }
  }

  /** Auto-discover plugins from node_modules (pikr-plugin-*) */
  async discover(): Promise<void> {
    // Look for pikr-plugin-* packages in node_modules
    const { readdirSync, existsSync } = await import("node:fs");
    const { join } = await import("node:path");

    const nodeModules = join(process.cwd(), "node_modules");
    if (!existsSync(nodeModules)) return;

    try {
      const entries = readdirSync(nodeModules);
      for (const entry of entries) {
        if (entry.startsWith("pikr-plugin-")) {
          await this.load(join(nodeModules, entry));
        }
      }

      // Also check @pikr/ scoped packages
      const scopedDir = join(nodeModules, "@pikr");
      if (existsSync(scopedDir)) {
        const scoped = readdirSync(scopedDir);
        for (const entry of scoped) {
          if (entry.startsWith("plugin-")) {
            await this.load(join(scopedDir, entry));
          }
        }
      }
    } catch {
      // node_modules read failed, skip discovery
    }
  }

  /** Detect which plugins are active on the current page */
  async detectAll(cdp: CDPSession): Promise<string[]> {
    this.active = [];
    const names: string[] = [];

    for (const plugin of this.plugins) {
      try {
        if (await plugin.detect(cdp)) {
          this.active.push(plugin);
          names.push(plugin.name);
        }
      } catch {
        // detection failed, skip this plugin
      }
    }

    return names;
  }

  /** Enrich a selection with all active plugins. Returns merged enrichment. */
  async enrich(
    cdp: CDPSession,
    selection: SelectionEvent
  ): Promise<PluginEnrichment | null> {
    for (const plugin of this.active) {
      try {
        const result = await plugin.enrich(cdp, selection);
        if (result) return result; // first plugin that returns data wins
      } catch {
        // enrichment failed, try next
      }
    }
    return null;
  }

  /** Number of registered plugins */
  get count(): number {
    return this.plugins.length;
  }

  /** Names of active (detected) plugins */
  get activeNames(): string[] {
    return this.active.map((p) => p.name);
  }
}
