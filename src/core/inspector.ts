import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page, CDPSession } from "puppeteer-core";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface SelectionEvent {
  type: "selection";
  selector: string;
  html: string;
  ancestry: string;
  styles: Record<string, string>;
  tagName: string;
  textContent: string;
}

export interface BatchSelectionItem {
  index: number;
  selector: string;
  html: string;
  ancestry: string;
  styles: Record<string, string>;
  tagName: string;
  textContent: string;
  comment: string | null;
}

export interface BatchEvent {
  type: "batch";
  selections: BatchSelectionItem[];
}

export interface CloseEvent {
  type: "close";
}

export type PikrEvent = SelectionEvent | BatchEvent | CloseEvent;
export type SelectionHandler = (event: SelectionEvent) => void;
export type BatchHandler = (event: BatchEvent) => void;
export type CloseHandler = () => void;

function loadOverlayScript(): string {
  const candidates = [
    resolve(__dirname, "inspector-overlay.js"),
    resolve(__dirname, "../../src/core/inspector-overlay.js"),
  ];

  for (const path of candidates) {
    try {
      return readFileSync(path, "utf-8");
    } catch {
      continue;
    }
  }

  throw new Error("Could not find inspector-overlay.js");
}

export async function injectOverlay(page: Page): Promise<void> {
  const script = loadOverlayScript();
  await page.evaluate(script);
  await page.evaluateOnNewDocument(script);
}

export async function listenForSelections(
  cdp: CDPSession,
  handler: SelectionHandler,
  onClose?: CloseHandler,
  onBatch?: BatchHandler
): Promise<void> {
  await cdp.send("Runtime.enable");

  cdp.on("Runtime.consoleAPICalled", (event) => {
    if (event.type !== "debug") return;
    if (!event.args || event.args.length < 2) return;

    const marker = event.args[0];
    if (marker.type !== "string" || marker.value !== "__pikr__") return;

    const payload = event.args[1];
    if (payload.type !== "string" || !payload.value) return;

    try {
      const data = JSON.parse(payload.value) as PikrEvent;
      if (data.type === "selection") {
        handler(data as SelectionEvent);
      } else if (data.type === "batch" && onBatch) {
        onBatch(data as BatchEvent);
      } else if (data.type === "close" && onClose) {
        onClose();
      }
    } catch {
      // Invalid JSON, ignore
    }
  });
}
