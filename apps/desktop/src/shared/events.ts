export type ToolName =
  | "Read"
  | "Edit"
  | "Write"
  | "Bash"
  | "Grep"
  | "Glob"
  | "WebFetch"
  | "Task"
  | "Unknown";

export type CompanionEventType =
  | "session_start"
  | "prompt_submit"
  | "tool_start"
  | "tool_end"
  | "notification"
  | "permission_wait"
  | "done"
  | "error"
  | "heartbeat";

export type PetState =
  | "idle"
  | "thinking"
  | "tool_read"
  | "tool_edit"
  | "tool_bash"
  | "tool_search"
  | "waiting_permission"
  | "done"
  | "error";

export type PrivacyMode = "safe" | "standard" | "detailed";

export interface CompanionEvent {
  id: string;
  source: "claude-code" | "cc-haha" | "manual";
  event: CompanionEventType;
  sessionId?: string;
  tool?: ToolName;
  title: string;
  message: string;
  detail?: string;
  timestamp: number;
}

export interface CompanionSettings {
  port: number;
  token: string;
  privacyMode: PrivacyMode;
  showBubbles: boolean;
  alwaysOnTop: boolean;
  clickThrough: boolean;
  petScale: number;
  doneSound: boolean;
  position?: { x: number; y: number };
}

export const defaultSettings: CompanionSettings = {
  port: 47634,
  token: "clawd-local",
  privacyMode: "safe",
  showBubbles: true,
  alwaysOnTop: true,
  clickThrough: false,
  petScale: 1,
  doneSound: false
};

export function stateFromEvent(event: CompanionEvent): PetState {
  if (event.event === "error") return "error";
  if (event.event === "permission_wait") return "waiting_permission";
  if (event.event === "done") return "done";
  if (event.event === "prompt_submit" || event.event === "session_start") return "thinking";
  if (event.event === "tool_start") {
    if (event.tool === "Read") return "tool_read";
    if (event.tool === "Edit" || event.tool === "Write") return "tool_edit";
    if (event.tool === "Bash") return "tool_bash";
    if (event.tool === "Grep" || event.tool === "Glob" || event.tool === "WebFetch") return "tool_search";
    return "thinking";
  }
  if (event.event === "notification") return "waiting_permission";
  return "idle";
}
