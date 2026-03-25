import { randomBytes } from "node:crypto";
import type { SelectionEvent, BatchSelectionItem } from "./inspector.js";

export interface Selection {
  sessionId: string;
  timestamp: string;
  url: string;
  selector: string;
  html: string;
  ancestry: string;
  styles: Record<string, string>;
  component: string | null;
  filePath: string | null;
}

export function generateSessionId(): string {
  const ts = Math.floor(Date.now() / 1000);
  const rand = randomBytes(3).toString("hex");
  return `pikr-${ts}-${rand}`;
}

export function toSelection(
  event: SelectionEvent,
  sessionId: string,
  url: string
): Selection {
  return {
    sessionId,
    timestamp: new Date().toISOString(),
    url,
    selector: event.selector,
    html: event.html,
    ancestry: event.ancestry,
    styles: event.styles,
    component: null,
    filePath: null,
  };
}

export function toClipboardText(sel: Selection): string {
  const lines: string[] = [];

  // Header
  lines.push(`pikr: ${sel.selector}`);
  lines.push(`url: ${sel.url}`);

  // Source (from framework plugins)
  if (sel.component || sel.filePath) {
    const parts: string[] = [];
    if (sel.component) parts.push(sel.component);
    if (sel.filePath) parts.push(`in ${sel.filePath}`);
    lines.push(`source: ${parts.join(" ")}`);
  }

  lines.push(`ancestry: ${sel.ancestry}`);

  // HTML — the main content
  lines.push("");
  lines.push(sel.html);

  // Styles — only if there are any
  const styleStr = Object.entries(sel.styles)
    .map(([k, v]) => {
      const cssProp = k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
      return `${cssProp}: ${v}`;
    })
    .join("; ");
  if (styleStr) {
    lines.push("");
    lines.push(`styles: ${styleStr}`);
  }

  return lines.join("\n");
}

export function toLogLine(sel: Selection): string {
  return JSON.stringify(sel);
}

// --- Batch output ---

export interface BatchSelection {
  sessionId: string;
  timestamp: string;
  url: string;
  selections: Array<{
    index: number;
    selector: string;
    html: string;
    ancestry: string;
    styles: Record<string, string>;
    tagName: string;
    comment: string | null;
    component: string | null;
    filePath: string | null;
  }>;
}

export function toBatchSelection(
  items: BatchSelectionItem[],
  sessionId: string,
  url: string,
  enrichments?: Array<{ componentName?: string; filePath?: string; line?: number; col?: number } | null>
): BatchSelection {
  return {
    sessionId,
    timestamp: new Date().toISOString(),
    url,
    selections: items.map((item, i) => {
      const enrichment = enrichments?.[i];
      return {
        index: item.index,
        selector: item.selector,
        html: item.html,
        ancestry: item.ancestry,
        styles: item.styles,
        tagName: item.tagName,
        comment: item.comment,
        component: enrichment?.componentName ?? null,
        filePath: enrichment?.filePath
          ? `${enrichment.filePath}${enrichment.line ? `:${enrichment.line}` : ""}${enrichment.col ? `:${enrichment.col}` : ""}`
          : null,
      };
    }),
  };
}

export function toBatchClipboardText(batch: BatchSelection): string {
  const lines: string[] = [];
  lines.push(`pikr: ${batch.selections.length} elements selected`);
  lines.push(`url: ${batch.url}`);

  for (const sel of batch.selections) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(`[${sel.index}] ${sel.selector}`);
    if (sel.comment) {
      lines.push(`comment: ${sel.comment}`);
    }
    if (sel.component || sel.filePath) {
      const parts: string[] = [];
      if (sel.component) parts.push(sel.component);
      if (sel.filePath) parts.push(`in ${sel.filePath}`);
      lines.push(`source: ${parts.join(" ")}`);
    }
    lines.push(sel.html);

    const styleStr = Object.entries(sel.styles)
      .map(([k, v]) => {
        const cssProp = k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
        return `${cssProp}: ${v}`;
      })
      .join("; ");
    if (styleStr) {
      lines.push(`styles: ${styleStr}`);
    }
  }

  return lines.join("\n");
}

export function toBatchLogLine(batch: BatchSelection): string {
  return JSON.stringify(batch);
}
