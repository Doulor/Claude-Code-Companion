import type { IncomingMessage, ServerResponse } from "node:http";
import type { CompanionEvent, CompanionEventType, ToolName } from "../shared/events.js";

const MAX_JSON_BODY_BYTES = 256 * 1024;

const eventTypes = new Set<CompanionEventType>([
  "session_start",
  "prompt_submit",
  "tool_start",
  "tool_end",
  "notification",
  "permission_wait",
  "done",
  "error",
  "heartbeat",
  "git_operation"
]);

const sources = new Set(["claude-code", "cc-haha", "manual", "codex"]);
const clientTypes = new Set(["cli", "desktop", "vscode", "unknown"]);
const toolNames = new Set<ToolName>([
  "Read",
  "Edit",
  "Write",
  "Bash",
  "Grep",
  "Glob",
  "WebFetch",
  "WebSearch",
  "Notebook",
  "Agent",
  "Skill",
  "Task",
  "TaskCreate",
  "TaskUpdate",
  "AskUserQuestion",
  "MCP",
  "Shell",
  "UpdatePlan",
  "ApplyPatch",
  "ViewImage",
  "Unknown"
]);

export class JsonBodyTooLargeError extends Error {
  constructor() {
    super("json_body_too_large");
  }
}

export function parseJsonBody(req: IncomingMessage, maxBytes = MAX_JSON_BODY_BYTES): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;

    req.on("data", chunk => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.byteLength;
      if (size > maxBytes) {
        tooLarge = true;
        reject(new JsonBodyTooLargeError());
        req.destroy();
        return;
      }
      chunks.push(buffer);
    });

    req.on("end", () => {
      if (tooLarge) return;
      try {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", error => {
      if (!tooLarge) reject(error);
    });
  });
}

export function writeJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

export function isCompanionEvent(value: unknown): value is CompanionEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  if (typeof event.id !== "string" || event.id.length > 128) return false;
  if (!sources.has(String(event.source))) return false;
  if (!eventTypes.has(event.event as CompanionEventType)) return false;
  if (typeof event.title !== "string" || event.title.length > 500) return false;
  if (typeof event.message !== "string" || event.message.length > 2000) return false;
  if (typeof event.timestamp !== "number" || !Number.isFinite(event.timestamp)) return false;
  if (event.sessionId !== undefined && (typeof event.sessionId !== "string" || event.sessionId.length > 256)) return false;
  if (event.clientType !== undefined && !clientTypes.has(String(event.clientType))) return false;
  if (event.clientLabel !== undefined && (typeof event.clientLabel !== "string" || event.clientLabel.length > 120)) return false;
  if (event.tool !== undefined && !toolNames.has(event.tool as ToolName)) return false;
  if (event.cwd !== undefined && (typeof event.cwd !== "string" || event.cwd.length > 1000)) return false;
  if (event.detail !== undefined && (typeof event.detail !== "string" || event.detail.length > 2000)) return false;
  return true;
}

export interface PermissionRequestBody {
  toolName: ToolName;
  toolDetail?: string;
  sessionId?: string;
  rawPayload: Record<string, unknown>;
}

export function parsePermissionRequestBody(value: unknown): PermissionRequestBody | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const toolName = typeof body.toolName === "string" && toolNames.has(body.toolName as ToolName) ? body.toolName as ToolName : "Unknown";
  const toolDetail = typeof body.toolDetail === "string" && body.toolDetail.length <= 2000 ? body.toolDetail : undefined;
  const sessionId = typeof body.sessionId === "string" && body.sessionId.length <= 256 ? body.sessionId : undefined;
  const rawPayload = body.rawPayload && typeof body.rawPayload === "object" && !Array.isArray(body.rawPayload) ? body.rawPayload as Record<string, unknown> : {};
  return { toolName, toolDetail, sessionId, rawPayload };
}

export function jsonBodyErrorStatus(error: unknown): { status: number; error: string } {
  if (error instanceof JsonBodyTooLargeError) return { status: 413, error: "body_too_large" };
  return { status: 400, error: "bad_json" };
}

export function bearerToken(req: IncomingMessage): string {
  return req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
}

export function streamToken(url: string | undefined): string {
  if (!url?.startsWith("/stream")) return "";
  return new URL(url, "http://localhost").searchParams.get("token") ?? "";
}

export function isRoute(req: IncomingMessage, method: string, path: string): boolean {
  return req.method === method && req.url === path;
}

export function isPermissionRoute(url: string | undefined): boolean {
  return url === "/permission" || Boolean(url?.startsWith("/permission/"));
}
