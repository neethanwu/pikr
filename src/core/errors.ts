export class PikrError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "PikrError";
  }
}

export class ChromeNotFoundError extends PikrError {
  constructor() {
    super(
      "Chrome/Chromium not found. Install Chrome or set PUPPETEER_EXECUTABLE_PATH.\n" +
        "  macOS:  brew install --cask google-chrome\n" +
        "  Linux:  sudo apt install chromium-browser\n" +
        "  Or:     export PUPPETEER_EXECUTABLE_PATH=/path/to/chrome",
      "CHROME_NOT_FOUND"
    );
  }
}

export class ConnectionError extends PikrError {
  constructor(endpoint: string, cause?: string) {
    const msg = `Could not connect to ${endpoint}.${cause ? ` ${cause}` : ""}`;
    super(msg, "CONNECTION_ERROR");
  }
}

export class ServerUnreachableError extends PikrError {
  constructor(url: string) {
    super(
      `Could not connect to ${url}. Is your dev server running?`,
      "SERVER_UNREACHABLE"
    );
  }
}

export class TauriConnectionError extends PikrError {
  constructor(endpoint: string) {
    const platform = process.platform;
    let guide = "";
    if (platform === "darwin") {
      guide =
        "\n\nFor Tauri on macOS, launch your app with:\n" +
        "  WEBKIT_INSPECTOR_SERVER=0.0.0.0:9222 cargo tauri dev\n" +
        "Then connect with:\n" +
        "  pikr --connect http://localhost:9222";
    } else if (platform === "linux") {
      guide =
        "\n\nFor Tauri on Linux (webkit2gtk), enable the inspector in your Tauri config\n" +
        "and connect with:\n" +
        "  pikr --connect http://localhost:9222";
    } else if (platform === "win32") {
      guide =
        "\n\nFor Tauri on Windows (WebView2), CDP is supported natively.\n" +
        "Connect with:\n" +
        "  pikr --connect http://localhost:9222";
    }

    super(
      `Could not connect to Tauri webview at ${endpoint}.${guide}`,
      "TAURI_CONNECTION_ERROR"
    );
  }
}
