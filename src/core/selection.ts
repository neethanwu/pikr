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
  lines.push(`<pikr url="${sel.url}">`);
  lines.push(`<element selector="${sel.selector}">`);
  lines.push(sel.html);
  lines.push(`</element>`);

  if (sel.component || sel.filePath) {
    const attrs: string[] = [];
    if (sel.component) attrs.push(`component="${sel.component}"`);
    if (sel.filePath) attrs.push(`file="${sel.filePath}"`);
    lines.push(`<source ${attrs.join(" ")} />`);
  }

  const styleStr = Object.entries(sel.styles)
    .map(([k, v]) => {
      const cssProp = k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
      return `${cssProp}: ${v}`;
    })
    .join("; ");
  if (styleStr) {
    lines.push(`<styles>${styleStr}</styles>`);
  }

  lines.push(`<ancestry>${sel.ancestry}</ancestry>`);
  lines.push(`</pikr>`);

  return lines.join("\n");
}

export function toLogLine(sel: Selection): string {
  return JSON.stringify(sel);
}
