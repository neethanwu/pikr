export { launchBrowser, connectBrowser, findChrome } from "./browser.js";
export type { BrowserSession, LaunchOptions, ConnectOptions } from "./browser.js";

export { injectOverlay, listenForSelections } from "./inspector.js";
export type { SelectionEvent, BatchEvent, BatchSelectionItem, CloseEvent, PikrEvent, SelectionHandler, BatchHandler, CloseHandler } from "./inspector.js";

export { generateSessionId, toSelection, toClipboardText, toLogLine, toBatchSelection, toBatchClipboardText, toBatchLogLine } from "./selection.js";
export type { Selection, BatchSelection } from "./selection.js";

export { writeSelection, defaultLogPath } from "./output.js";
export type { OutputOptions } from "./output.js";

export { installSkill } from "./install-skill.js";
export type { InstallSkillOptions } from "./install-skill.js";

export { detectDevServer, detectDevServers } from "./detect.js";

export { findDevScript, detectPackageManager, startDevServer } from "./dev-server.js";
export type { DevServerResult } from "./dev-server.js";

export { PluginManager } from "./plugins.js";
export type { PikrPlugin, PluginEnrichment } from "./plugins.js";

export { reactPlugin } from "./plugins/react.js";
export { vuePlugin } from "./plugins/vue.js";

export {
  PikrError,
  ChromeNotFoundError,
  ConnectionError,
  ServerUnreachableError,
  TauriConnectionError,
} from "./errors.js";
