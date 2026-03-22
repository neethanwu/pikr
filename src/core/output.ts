import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { homedir } from "node:os";
import { join } from "node:path";
import clipboardy from "clipboardy";
import type { Selection } from "./selection.js";
import { toClipboardText, toLogLine } from "./selection.js";

export interface OutputOptions {
  clipboard: boolean;
  logPath: string;
}

export function defaultLogPath(): string {
  return join(homedir(), ".pikr", "selections.jsonl");
}

export async function writeSelection(
  selection: Selection,
  options: OutputOptions
): Promise<void> {
  const errors: string[] = [];

  // Write to clipboard
  if (options.clipboard) {
    try {
      const text = toClipboardText(selection);
      await clipboardy.write(text);
    } catch (err) {
      errors.push(
        `clipboard: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Append to log file
  try {
    await mkdir(dirname(options.logPath), { recursive: true });
    const line = toLogLine(selection) + "\n";
    await appendFile(options.logPath, line, "utf-8");
  } catch (err) {
    errors.push(
      `log file: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Surface non-fatal errors on stderr
  for (const e of errors) {
    console.error(`pikr warning: ${e}`);
  }
}
