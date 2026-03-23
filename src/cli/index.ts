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
  detectDevServers,
  PluginManager,
  reactPlugin,
  vuePlugin,
  installSkill,
  PikrError,
} from "../core/index.js";
import type { BrowserSession, SelectionEvent } from "../core/index.js";

const version = "0.1.0";

// --- Branded terminal output ---
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const CORAL = "\x1b[38;2;255;107;86m";
const LIME = "\x1b[38;2;163;230;53m";
const STONE = "\x1b[38;2;168;162;158m";

const BRAND = `${CORAL}${BOLD}pikr${RESET}`;

function log(msg: string) {
  console.error(`${STONE}${msg}${RESET}`);
}

program
  .name("pikr")
  .description("Visual element picker for terminal AI agents")
  .version(version);

program
  .argument("[url]", "Port, URL, or auto-detect (e.g., 3000, localhost:3000)")
  .option("--connect <endpoint>", "Connect to an existing debug port")
  .option("--plugin <path...>", "Load framework plugin(s)")
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

        if (opts.connect) {
          log(`connecting to ${opts.connect}...`);
          session = await connectBrowser({ endpoint: opts.connect });
          const pageUrl = await session.page.url();
          log(`connected to ${pageUrl}`);
        } else {
          let targetUrl = url;

          // Shorthand: pikr 3000 → http://localhost:3000
          //           pikr localhost:3000 → http://localhost:3000
          if (targetUrl) {
            if (/^\d+$/.test(targetUrl)) {
              targetUrl = `http://localhost:${targetUrl}`;
            } else if (!targetUrl.startsWith("http")) {
              targetUrl = `http://${targetUrl}`;
            }
          }

          if (!targetUrl) {
            log("scanning for dev servers...");
            const servers = await detectDevServers();

            if (servers.length === 0) {
              console.error(`\n  ${BRAND} ${DIM}no dev server found${RESET}\n`);
              console.error(`  ${DIM}Usage:${RESET}  pikr              ${DIM}auto-detect${RESET}`);
              console.error(`          pikr 3000          ${DIM}port shorthand${RESET}`);
              console.error(`          pikr localhost:3000 ${DIM}full URL${RESET}\n`);
              process.exit(1);
              return;
            } else if (servers.length === 1) {
              targetUrl = servers[0].url;
              log(`found ${targetUrl}`);
            } else {
              // Multiple servers — let user pick
              console.error(`\n  ${BRAND} ${DIM}found ${servers.length} servers${RESET}\n`);
              servers.forEach((s, i) => {
                console.error(`  ${DIM}${i + 1}.${RESET} localhost:${s.port}`);
              });
              console.error(`\n  ${DIM}Run with a port:${RESET} pikr ${servers[0].port}\n`);
              process.exit(0);
              return;
            }
          }

          log(`opening ${targetUrl}...`);
          session = await launchBrowser({ url: targetUrl });
        }

        // --- Plugins ---
        const plugins = new PluginManager();
        plugins.register(reactPlugin);
        plugins.register(vuePlugin);
        await plugins.discover();     // external: pikr-plugin-* from node_modules
        if (opts.plugin) {
          for (const p of opts.plugin) await plugins.load(p);
        }

        const active = await plugins.detectAll(session.cdp);
        if (active.length > 0) {
          log(`source mapping: ${active.join(", ")}`);
        }

        const sessionId = generateSessionId();
        const logPath = opts.log ?? defaultLogPath();

        await injectOverlay(session.page);

        session.page.on("load", async () => {
          if (plugins.count > 0) await plugins.detectAll(session.cdp);
        });

        // --- Ready message ---
        console.error(
          `\n  ${BRAND} ${DIM}ready${RESET}\n\n` +
          `  ${DIM}Click the pikr pill to toggle inspect mode.${RESET}\n` +
          `  ${DIM}Close the browser window to exit.${RESET}\n`
        );

        // --- Listen ---
        let selectionCount = 0;
        await listenForSelections(
          session.cdp,
          async (event: SelectionEvent) => {
            selectionCount++;
            const currentUrl = await session.page.url();
            const selection = toSelection(event, sessionId, currentUrl);

            const enrichment = await plugins.enrich(session.cdp, event);
            if (enrichment) {
              selection.component = enrichment.componentName ?? null;
              selection.filePath = enrichment.filePath
                ? `${enrichment.filePath}${enrichment.line ? `:${enrichment.line}` : ""}${enrichment.col ? `:${enrichment.col}` : ""}`
                : null;
            }

            await writeSelection(selection, { clipboard: opts.clipboard, logPath });

            // Capture confirmation
            const tag = `<${event.tagName}>`;
            const source = enrichment?.componentName ? ` ${DIM}(${enrichment.componentName})${RESET}` : "";
            const dest = opts.clipboard ? `${LIME}clipboard${RESET}` : `${DIM}${logPath}${RESET}`;
            console.error(`  ${LIME}●${RESET} ${tag}${source} → ${dest}`);
          },
          async () => {
            console.error(`\n  ${BRAND} ${DIM}${selectionCount} element(s) captured${RESET}\n`);
            try { await session.browser.close(); } catch {}
            process.exit(0);
          }
        );

        // Exit when browser closes (window close, crash, etc.)
        session.browser.on("disconnected", () => {
          console.error(`\n  ${BRAND} ${DIM}${selectionCount} element(s) captured${RESET}\n`);
          process.exit(0);
        });

        // Also exit if the page/tab is closed
        session.page.on("close", () => {
          console.error(`\n  ${BRAND} ${DIM}${selectionCount} element(s) captured${RESET}\n`);
          try { session.browser.close(); } catch {}
          process.exit(0);
        });

        const shutdown = async () => {
          console.error(`\n  ${BRAND} ${DIM}${selectionCount} element(s) captured${RESET}\n`);
          try { await session.browser.close(); } catch {}
          process.exit(0);
        };

        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);
      } catch (err) {
        if (err instanceof PikrError) {
          console.error(`\n  ${BRAND} ${CORAL}${err.message}${RESET}\n`);
        } else {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`\n  ${BRAND} ${CORAL}${message}${RESET}\n`);
        }
        process.exit(1);
      }
    }
  );

program
  .command("install-skill")
  .description("Install the pikr agent skill")
  .option("--local", "Install to project .claude/skills/ instead of global")
  .action(async (opts: { local?: boolean }) => {
    try {
      const path = await installSkill({ local: opts.local ?? false });
      console.error(
        `\n  ${BRAND} ${DIM}skill installed${RESET}\n\n` +
        `  ${DIM}location${RESET}  ${path}\n` +
        `  ${DIM}usage${RESET}     type "/pikr" or let the agent suggest it\n`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\n  ${BRAND} ${CORAL}${message}${RESET}\n`);
      process.exit(1);
    }
  });

program.parse();
