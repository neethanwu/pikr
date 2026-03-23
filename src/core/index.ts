export { launchBrowser, connectBrowser, findChrome } from "./browser.js";
export type { BrowserSession, LaunchOptions, ConnectOptions } from "./browser.js";

export { injectOverlay, listenForSelections } from "./inspector.js";
export type { SelectionEvent, CloseEvent, PikrEvent, SelectionHandler, CloseHandler } from "./inspector.js";

export { generateSessionId, toSelection, toClipboardText, toLogLine } from "./selection.js";
export type { Selection } from "./selection.js";

export { writeSelection, defaultLogPath } from "./output.js";
export type { OutputOptions } from "./output.js";

export { installSkill } from "./install-skill.js";
export type { InstallSkillOptions } from "./install-skill.js";

export { detectDevServer, detectDevServers } from "./detect.js";

export { PluginManager } from "./plugins.js";
export type { PikrPlugin, PluginEnrichment } from "./plugins.js";

export { vitePlugin } from "./plugins/vite.js";

export {
  PikrError,
  ChromeNotFoundError,
  ConnectionError,
  ServerUnreachableError,
  TauriConnectionError,
} from "./errors.js";
