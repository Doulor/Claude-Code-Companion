import { describe, expect, it } from "vitest";
import { isCompanionEvent, isPermissionRoute, parsePermissionRequestBody, streamToken } from "../src/main/event-server.js";

const validEvent = {
  id: "event-1",
  source: "claude-code",
  event: "tool_start",
  title: "正在读文件",
  message: "Read 工具已开始。",
  timestamp: Date.now(),
  tool: "Read"
};

describe("event server validation", () => {
  it("accepts valid companion events", () => {
    expect(isCompanionEvent(validEvent)).toBe(true);
  });

  it("rejects unknown event types", () => {
    expect(isCompanionEvent({ ...validEvent, event: "unknown_event" })).toBe(false);
  });

  it("rejects oversized string fields", () => {
    expect(isCompanionEvent({ ...validEvent, message: "x".repeat(2001) })).toBe(false);
  });

  it("normalizes permission request payloads", () => {
    const parsed = parsePermissionRequestBody({ toolName: "Bash", toolDetail: "npm test", sessionId: "s1", rawPayload: { ok: true } });

    expect(parsed).toEqual({ toolName: "Bash", toolDetail: "npm test", sessionId: "s1", rawPayload: { ok: true } });
  });

  it("falls back to Unknown for invalid tool names", () => {
    const parsed = parsePermissionRequestBody({ toolName: "NotARealTool", rawPayload: [] });

    expect(parsed?.toolName).toBe("Unknown");
    expect(parsed?.rawPayload).toEqual({});
  });

  it("accepts Codex tool names like Shell and UpdatePlan", () => {
    const shell = parsePermissionRequestBody({ toolName: "Shell", rawPayload: {} });
    expect(shell?.toolName).toBe("Shell");
    const plan = parsePermissionRequestBody({ toolName: "UpdatePlan", rawPayload: {} });
    expect(plan?.toolName).toBe("UpdatePlan");
  });

  it("parses stream tokens and permission routes", () => {
    expect(streamToken("/stream?token=abc")).toBe("abc");
    expect(streamToken("/events?token=abc")).toBe("");
    expect(isPermissionRoute("/permission/123")).toBe(true);
    expect(isPermissionRoute("/permissions")).toBe(false);
  });

  it("accepts codex source with new tool names", () => {
    expect(isCompanionEvent({ ...validEvent, source: "codex", tool: "Shell" })).toBe(true);
    expect(isCompanionEvent({ ...validEvent, source: "codex", tool: "UpdatePlan" })).toBe(true);
    expect(isCompanionEvent({ ...validEvent, source: "codex", tool: "ApplyPatch" })).toBe(true);
    expect(isCompanionEvent({ ...validEvent, source: "codex", tool: "ViewImage" })).toBe(true);
  });

  it("still rejects unknown tool names", () => {
    expect(isCompanionEvent({ ...validEvent, tool: "NotARealTool" })).toBe(false);
  });
});
