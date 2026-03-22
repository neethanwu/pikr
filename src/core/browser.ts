import puppeteer, {
  type Browser,
  type Page,
  type CDPSession,
} from "puppeteer-core";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { ChromeNotFoundError, ConnectionError, ServerUnreachableError } from "./errors.js";

export interface BrowserSession {
  browser: Browser;
  page: Page;
  cdp: CDPSession;
  mode: "launch" | "connect";
}

export interface LaunchOptions {
  url: string;
  executablePath?: string;
}

export interface ConnectOptions {
  endpoint: string;
}

const CHROME_PATHS_MAC = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

const CHROME_PATHS_LINUX = [
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/snap/bin/chromium",
];

const CHROME_PATHS_WIN = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

export function findChrome(): string | null {
  // 1. Environment variable
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && existsSync(envPath)) return envPath;

  // 2. Platform-specific search
  const platform = process.platform;
  let candidates: string[];

  if (platform === "darwin") {
    candidates = CHROME_PATHS_MAC;
  } else if (platform === "linux") {
    candidates = CHROME_PATHS_LINUX;
  } else if (platform === "win32") {
    candidates = CHROME_PATHS_WIN;
  } else {
    candidates = [];
  }

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  // 3. Try `which` on Unix
  if (platform !== "win32") {
    try {
      const result = execSync("which google-chrome || which chromium", {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
      if (result && existsSync(result)) return result;
    } catch {
      // not found
    }
  }

  return null;
}

export async function launchBrowser(
  options: LaunchOptions
): Promise<BrowserSession> {
  const executablePath = options.executablePath ?? findChrome();
  if (!executablePath) {
    throw new ChromeNotFoundError();
  }

  let browser: Browser;
  try {
    browser = await puppeteer.launch({
    executablePath,
    headless: false,
    defaultViewport: null,
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-infobars",
      `--window-size=1280,900`,
    ],
    });
  } catch (err) {
    throw new ServerUnreachableError(options.url);
  }

  const pages = await browser.pages();
  const page = pages[0] ?? (await browser.newPage());

  // Bypass CSP so we can inject our overlay script
  await page.setBypassCSP(true);

  try {
    await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: 15000 });
  } catch {
    throw new ServerUnreachableError(options.url);
  }

  const cdp = await page.createCDPSession();

  return { browser, page, cdp, mode: "launch" };
}

export async function connectBrowser(
  options: ConnectOptions
): Promise<BrowserSession> {
  let wsEndpoint = options.endpoint;

  // If given an HTTP URL, discover the WebSocket endpoint
  if (wsEndpoint.startsWith("http://") || wsEndpoint.startsWith("https://")) {
    const versionUrl = wsEndpoint.replace(/\/$/, "") + "/json/version";
    try {
      const resp = await fetch(versionUrl);
      const data = (await resp.json()) as { webSocketDebuggerUrl: string };
      wsEndpoint = data.webSocketDebuggerUrl;
    } catch {
      throw new ConnectionError(options.endpoint, "Could not discover WebSocket endpoint.");
    }
  }

  try {
    const browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });

    const pages = await browser.pages();
    const page = pages[0];
    if (!page) {
      throw new ConnectionError(options.endpoint, "No pages found on the connected browser.");
    }

    const cdp = await page.createCDPSession();

    return { browser, page, cdp, mode: "connect" };
  } catch (err) {
    if (err instanceof ConnectionError) throw err;
    throw new ConnectionError(
      options.endpoint,
      err instanceof Error ? err.message : String(err)
    );
  }
}
