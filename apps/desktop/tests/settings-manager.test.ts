import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadSettings, saveSettings } from "../src/main/settingsManager.js";
import { defaultSettings } from "../src/shared/events.js";

let dirs: string[] = [];
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "clawd-settings-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

describe("settings manager", () => {
  it("returns defaults when no file exists", () => {
    expect(loadSettings(tempDir()).port).toBe(defaultSettings.port);
  });

  it("wraps legacy settings in versioned format", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "settings.json"), JSON.stringify({ port: 12345 }));
    const loaded = loadSettings(dir);
    const stored = JSON.parse(readFileSync(join(dir, "settings.json"), "utf8"));
    expect(loaded.port).toBe(12345);
    expect(stored.version).toBe(1);
    expect(stored.data.port).toBe(12345);
  });

  it("saves versioned settings", () => {
    const dir = tempDir();
    saveSettings(dir, { ...defaultSettings, port: 23456 });
    const stored = JSON.parse(readFileSync(join(dir, "settings.json"), "utf8"));
    expect(stored.version).toBe(1);
    expect(stored.data.port).toBe(23456);
  });
});
