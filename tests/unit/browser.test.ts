import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { findChrome } from "../../src/core/browser.js";

describe("findChrome", () => {
  const originalEnv = process.env.PUPPETEER_EXECUTABLE_PATH;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.PUPPETEER_EXECUTABLE_PATH = originalEnv;
    } else {
      delete process.env.PUPPETEER_EXECUTABLE_PATH;
    }
  });

  it("returns PUPPETEER_EXECUTABLE_PATH when set and file exists", () => {
    // Point to a file we know exists
    process.env.PUPPETEER_EXECUTABLE_PATH = "/bin/sh";
    expect(findChrome()).toBe("/bin/sh");
  });

  it("ignores PUPPETEER_EXECUTABLE_PATH when file does not exist", () => {
    process.env.PUPPETEER_EXECUTABLE_PATH = "/nonexistent/chrome";
    const result = findChrome();
    // Should fall through to platform search, not return the bad path
    expect(result).not.toBe("/nonexistent/chrome");
  });

  it("returns a string or null", () => {
    delete process.env.PUPPETEER_EXECUTABLE_PATH;
    const result = findChrome();
    expect(result === null || typeof result === "string").toBe(true);
  });

  it("finds Chrome on macOS (this machine)", () => {
    if (process.platform !== "darwin") return;
    delete process.env.PUPPETEER_EXECUTABLE_PATH;
    const result = findChrome();
    expect(result).not.toBeNull();
    expect(result).toContain("Chrome");
  });
});
