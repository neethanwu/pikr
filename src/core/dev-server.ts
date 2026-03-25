import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface DevServerResult {
  url: string;
  process: ChildProcess | null; // null if server was already running
}

/**
 * Read package.json and find the dev script command.
 * Returns the script name ("dev" or "start") or null.
 */
export function findDevScript(cwd: string): string | null {
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) return null;

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const scripts = pkg.scripts ?? {};
    if (scripts.dev) return "dev";
    if (scripts.start) return "start";
    return null;
  } catch {
    return null;
  }
}

/**
 * Detect the package manager from lockfiles in the project folder.
 */
export function detectPackageManager(cwd: string): string {
  if (existsSync(join(cwd, "bun.lock")) || existsSync(join(cwd, "bun.lockb")))
    return "bun";
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  return "npm";
}

/**
 * Start the dev server and capture the URL from its stdout/stderr.
 * Most frameworks print something like:
 *   - Vite: "Local:   http://localhost:5173/"
 *   - Next.js: "Ready on http://localhost:3000"
 *   - CRA: "Local:            http://localhost:3000"
 */
export async function startDevServer(
  cwd: string,
  scriptName: string,
  onLog?: (line: string) => void
): Promise<DevServerResult> {
  const pm = detectPackageManager(cwd);
  const cmd = pm === "npm" ? "npm" : pm;
  const args = pm === "npm" ? ["run", scriptName] : ["run", scriptName];

  const child = spawn(cmd, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
    detached: false,
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Dev server did not start within 30 seconds"));
    }, 30000);

    const urlPattern = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)/;

    function checkLine(line: string) {
      if (onLog) onLog(line);
      const match = line.match(urlPattern);
      if (match) {
        clearTimeout(timeout);
        const port = match[1];
        const url = `http://localhost:${port}`;
        // Wait a moment for the server to be fully ready
        setTimeout(() => {
          resolve({ url, process: child });
        }, 500);
      }
    }

    child.stdout?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        if (line.trim()) checkLine(line.trim());
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        if (line.trim()) checkLine(line.trim());
      }
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to start dev server: ${err.message}`));
    });

    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (code !== null && code !== 0) {
        reject(new Error(`Dev server exited with code ${code}`));
      }
    });
  });
}
