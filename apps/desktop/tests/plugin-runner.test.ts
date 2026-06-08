import { describe, expect, it } from "vitest";
import { appendPluginRun, canRunPlugin, normalizePlugin } from "../src/main/plugin-runner.js";
import type { CompanionEvent, CustomPlugin, PluginRunRecord } from "../src/shared/events.js";

const basePlugin: CustomPlugin = {
  id: "p1",
  name: "Plugin",
  scriptPath: __filename,
  enabled: true,
  trusted: true,
  events: ["done"],
  permissions: ["event"]
};

const doneEvent: CompanionEvent = {
  id: "e1",
  source: "manual",
  event: "done",
  title: "Done",
  message: "Done",
  timestamp: Date.now()
};

describe("plugin runner", () => {
  it("requires trust before running plugins", () => {
    expect(canRunPlugin({ ...basePlugin, trusted: false }, doneEvent)).toEqual({ ok: false, reason: "not trusted" });
    expect(canRunPlugin(basePlugin, doneEvent)).toEqual({ ok: true });
  });

  it("normalizes optional plugin fields", () => {
    const plugin = normalizePlugin({ ...basePlugin, permissions: undefined, trusted: undefined });
    expect(plugin.permissions).toEqual([]);
    expect(plugin.trusted).toBe(false);
  });

  it("keeps recent plugin records bounded", () => {
    let records: PluginRunRecord[] = [];
    for (let i = 0; i < 60; i++) {
      records = appendPluginRun(records, {
        id: String(i),
        pluginId: "p1",
        pluginName: "Plugin",
        eventType: "done",
        startedAt: i,
        durationMs: 1,
        exitCode: 0,
        timedOut: false,
        stdout: "",
        stderr: ""
      });
    }
    expect(records).toHaveLength(50);
    expect(records[0].id).toBe("10");
  });
});
