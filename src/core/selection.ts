import { randomBytes } from "node:crypto";
import type { SelectionEvent } from "./inspector.js";

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
