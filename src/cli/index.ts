#!/usr/bin/env node

import { program } from "commander";
import {
  launchBrowser,
  connectBrowser,
  injectOverlay,
  listenForSelections,
  generateSessionId,
  toSelection,
  writeSelection,
  defaultLogPath,
  detectDevServer,
  PluginManager,
  installSkill,
  PikrError,
} from "../core/index.js";
import type { BrowserSession, SelectionEvent } from "../core/index.js";

const version = "0.1.0";

program
  .name("pikr")
  .description("Universal element picker for terminal-based AI coding agents")
  .version(version);

// Main command: pikr <url>
program
  .argument("[url]", "URL to open (e.g., http://localhost:3000)")
  .option(
    "--connect <endpoint>",
    "Connect to an existing debug port (Tauri/remote)"
  )
  .option("--plugin <path...>", "Load framework plugin(s) from file path or npm package")
  .option("--log <path>", "Custom log file path")
  .option("--no-clipboard", "Disable clipboard output")
  .action(
    async (
      url: string | undefined,
      opts: {
        connect?: string;
        plugin?: string[];
        log?: string;
        clipboard: boolean;
      }
    ) => {
      try {
        let session: BrowserSession;
        let pageUrl: string;

        if (opts.connect) {
          console.error(`pikr: connecting to ${opts.connect}...`);
          session = await connectBrowser({ endpoint: opts.connect });
          pageUrl = await session.page.url();
          console.error(`pikr: connected to ${pageUrl}`);
        } else {
          let targetUrl = url;

          if (!targetUrl) {
            console.error("pikr: no URL provided, scanning for dev server...");
            const detected = await detectDevServer();
            if (detected) {
              targetUrl = detected;
              console.error(`pikr: found ${detected}`);
            } else {
              console.error(
                "pikr: no dev server found on common ports (3000, 5173, 8080, ...)\n"
              );
              console.error("Usage: pikr <url>\n");
              console.error("  pikr http://localhost:3000");
              console.error("  pikr --connect ws://localhost:9222\n");
              process.exit(1);
              return;
            }
          }

          console.error(`pikr: opening ${targetUrl}...`);
          session = await launchBrowser({ url: targetUrl });
          pageUrl = targetUrl;
        }

        // --- Plugins ---
        const plugins = new PluginManager();

        // Auto-discover from node_modules
        await plugins.discover();

        // Load explicitly specified plugins
        if (opts.plugin) {
          for (const p of opts.plugin) {
            await plugins.load(p);
          }
        }

        // Detect active frameworks
        if (plugins.count > 0) {
          const active = await plugins.detectAll(session.cdp);
          if (active.length > 0) {
            console.error(`pikr: plugins active — ${active.join(", ")}`);
          } else {
            console.error(`pikr: no framework plugins matched (source file mapping unavailable)`);
          }
        } else {
          console.error(`pikr: no plugins loaded — selections won't include source file paths`);
          console.error(`pikr: (framework plugins with source mapping coming soon)`);
        }

        const sessionId = generateSessionId();
        const logPath = opts.log ?? defaultLogPath();

        // Inject inspector overlay
        await injectOverlay(session.page);

        // Re-detect plugins after navigation (HMR full reload)
        session.page.on("load", async () => {
          if (plugins.count > 0) {
            await plugins.detectAll(session.cdp);
          }
        });

        // Listen for element selections
        let selectionCount = 0;
        await listenForSelections(
          session.cdp,
          async (event: SelectionEvent) => {
            selectionCount++;
            const currentUrl = await session.page.url();
            const selection = toSelection(event, sessionId, currentUrl);

            // Enrich with plugin data if available
            const enrichment = await plugins.enrich(session.cdp, event);
            if (enrichment) {
              selection.component = enrichment.componentName ?? null;
              selection.filePath = enrichment.filePath
                ? `${enrichment.filePath}${enrichment.line ? `:${enrichment.line}` : ""}${enrichment.col ? `:${enrichment.col}` : ""}`
                : null;
            }

            await writeSelection(selection, {
              clipboard: opts.clipboard,
              logPath,
            });

            console.error(
              `\npikr: [${selectionCount}] captured <${event.tagName}> — ${event.selector}`
            );
            if (enrichment?.componentName) {
              console.error(`  component: ${enrichment.componentName}`);
            }
            if (opts.clipboard) {
              console.error(`  -> clipboard`);
            }
            console.error(`  -> ${logPath}`);
          },
          async () => {
            console.error(
              `\npikr: closed via ESC. ${selectionCount} element(s) captured.`
            );
            try {
              await session.browser.close();
            } catch {}
            process.exit(0);
          }
        );

        console.error(
          `\npikr: ready. Press Cmd/Ctrl+Shift+X to toggle inspect mode.`
        );
        console.error(`pikr: session ${sessionId}`);

        session.browser.on("disconnected", () => {
          console.error(
            `\npikr: browser closed. ${selectionCount} element(s) captured.`
          );
          process.exit(0);
        });

        const shutdown = async () => {
          console.error(
            `\npikr: shutting down. ${selectionCount} element(s) captured.`
          );
          try {
            await session.browser.close();
          } catch {}
          process.exit(0);
        };

        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);
      } catch (err) {
        if (err instanceof PikrError) {
          console.error(`pikr: ${err.message}`);
        } else {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`pikr: unexpected error — ${message}`);
        }
        process.exit(1);
      }
    }
  );

// Subcommand: pikr install-skill
program
  .command("install-skill")
  .description("Install the pikr Claude Code skill")
  .option("--local", "Install to project .claude/skills/ instead of global")
  .action(async (opts: { local?: boolean }) => {
    try {
      const path = await installSkill({ local: opts.local ?? false });
      console.error(`\nDone! The pikr skill is now available in Claude Code.`);
      console.error(`  Location: ${path}`);
      console.error(`  Usage: type "/pikr" or let the agent suggest it.\n`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`pikr: ${message}`);
      process.exit(1);
    }
  });

program.parse();
