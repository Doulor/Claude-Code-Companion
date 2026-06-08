import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installMarketPlugin, parseMarketIndex, rawUrl, safeMarketPath } from "../src/main/plugin-market.js";

let dirs: string[] = [];
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "clawd-market-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

describe("plugin market", () => {
  it("parses valid market index", () => {
    const index = parseMarketIndex({
      version: 1,
      plugins: [{
        id: "demo-plugin",
        name: "Demo",
        description: "Demo plugin",
        author: "Tester",
        version: "1.0.0",
        entry: "plugins/demo-plugin/index.js",
        manifest: "plugins/demo-plugin/index.manifest.json",
        events: ["done"],
        permissions: ["event"],
        tags: ["demo"]
      }]
    });
    expect(index.plugins[0].id).toBe("demo-plugin");
  });

  it("rejects unsafe market paths", () => {
    expect(() => safeMarketPath("../secret.js")).toThrow();
    expect(() => safeMarketPath("/plugins/demo/index.js")).toThrow();
    expect(() => safeMarketPath("plugins/demo/index.js")).not.toThrow();
  });

  it("builds encoded raw urls", () => {
    expect(rawUrl("https://example.com/root/", "plugins/demo/index.js")).toBe("https://example.com/root/plugins/demo/index.js");
  });

  it("installs market plugin into local plugin directory", () => {
    const root = tempDir();
    const plugin = installMarketPlugin(root, {
      id: "demo-plugin",
      name: "Demo",
      description: "Demo plugin",
      author: "Tester",
      version: "1.0.0",
      entry: "plugins/demo-plugin/index.js",
      manifest: "plugins/demo-plugin/index.manifest.json",
      events: ["done"],
      permissions: ["event"],
      tags: []
    }, {
      entry: "console.log('ok')",
      manifest: JSON.stringify({ name: "Demo", events: ["done"], permissions: ["event"] })
    });

    expect(plugin.enabled).toBe(false);
    expect(plugin.trusted).toBe(false);
    expect(readFileSync(plugin.scriptPath, "utf8")).toContain("ok");
  });
});
