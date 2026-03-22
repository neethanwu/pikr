import { describe, it, expect } from "vitest";
import {
  PikrError,
  ChromeNotFoundError,
  ConnectionError,
  ServerUnreachableError,
  TauriConnectionError,
} from "../../src/core/errors.js";

describe("PikrError", () => {
  it("sets name to PikrError", () => {
    const err = new PikrError("test", "TEST");
    expect(err.name).toBe("PikrError");
  });

  it("is instanceof Error", () => {
    const err = new PikrError("test", "TEST");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("ChromeNotFoundError", () => {
  it("has code CHROME_NOT_FOUND", () => {
    const err = new ChromeNotFoundError();
    expect(err.code).toBe("CHROME_NOT_FOUND");
  });

  it("includes install instructions in message", () => {
    const err = new ChromeNotFoundError();
    expect(err.message).toContain("PUPPETEER_EXECUTABLE_PATH");
    expect(err.message).toContain("brew install");
  });

  it("is instanceof PikrError", () => {
    const err = new ChromeNotFoundError();
    expect(err).toBeInstanceOf(PikrError);
  });
});

describe("ServerUnreachableError", () => {
  it("includes the URL in message", () => {
    const err = new ServerUnreachableError("http://localhost:3000");
    expect(err.message).toContain("http://localhost:3000");
    expect(err.message).toContain("dev server running");
  });

  it("has code SERVER_UNREACHABLE", () => {
    const err = new ServerUnreachableError("http://localhost:3000");
    expect(err.code).toBe("SERVER_UNREACHABLE");
  });
});

describe("ConnectionError", () => {
  it("includes endpoint in message", () => {
    const err = new ConnectionError("ws://localhost:9222");
    expect(err.message).toContain("ws://localhost:9222");
  });

  it("includes cause when provided", () => {
    const err = new ConnectionError("ws://localhost:9222", "timeout");
    expect(err.message).toContain("timeout");
  });

  it("has code CONNECTION_ERROR", () => {
    const err = new ConnectionError("ws://localhost:9222");
    expect(err.code).toBe("CONNECTION_ERROR");
  });
});

describe("TauriConnectionError", () => {
  it("has code TAURI_CONNECTION_ERROR", () => {
    const err = new TauriConnectionError("http://localhost:9222");
    expect(err.code).toBe("TAURI_CONNECTION_ERROR");
  });

  it("includes platform-specific guide", () => {
    const err = new TauriConnectionError("http://localhost:9222");
    // On macOS (dev machine), should include WEBKIT_INSPECTOR_SERVER
    if (process.platform === "darwin") {
      expect(err.message).toContain("WEBKIT_INSPECTOR_SERVER");
    }
    expect(err.message).toContain("http://localhost:9222");
  });
});
