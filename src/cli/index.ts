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
  .option("--log <path>", "Custom log file path")
  .option("--no-clipboard", "Disable clipboard output")
  .action(
    async (
      url: string | undefined,
      opts: { connect?: string; log?: string; clipboard: boolean }
    ) => {
      // If no args and no --connect, show help
      if (!url && !opts.connect) {
        program.help();
        return;
      }

      try {
        let session: BrowserSession;
        let pageUrl: string;

        if (opts.connect) {
          console.error(`pikr: connecting to ${opts.connect}...`);
          session = await connectBrowser({ endpoint: opts.connect });
          pageUrl = await session.page.url();
          console.error(`pikr: connected to ${pageUrl}`);
        } else {
          console.error(`pikr: opening ${url}...`);
          session = await launchBrowser({ url: url! });
          pageUrl = url!;
        }

        const sessionId = generateSessionId();
        const logPath = opts.log ?? defaultLogPath();

        // Inject inspector overlay
        await injectOverlay(session.page);

        // Listen for element selections and close events
        let selectionCount = 0;
        await listenForSelections(
          session.cdp,
          async (event: SelectionEvent) => {
            selectionCount++;
            const currentUrl = await session.page.url();
            const selection = toSelection(event, sessionId, currentUrl);

            await writeSelection(selection, {
              clipboard: opts.clipboard,
              logPath,
            });

            console.error(
              `\npikr: [${selectionCount}] captured <${event.tagName}> — ${event.selector}`
            );
            if (opts.clipboard) {
              console.error(`  -> clipboard`);
            }
            console.error(`  -> ${logPath}`);
          },
          // ESC key closes pikr
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

        // Keep process alive until browser closes
        session.browser.on("disconnected", () => {
          console.error(
            `\npikr: browser closed. ${selectionCount} element(s) captured.`
          );
          process.exit(0);
        });

        // Graceful shutdown
        const shutdown = async () => {
          console.error(
            `\npikr: shutting down. ${selectionCount} element(s) captured.`
          );
          try {
            await session.browser.close();
          } catch {
            // browser may already be closed
          }
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
