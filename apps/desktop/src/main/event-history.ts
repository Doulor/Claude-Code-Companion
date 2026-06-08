import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { CompanionEvent, EventHistoryEntry, SessionHistory } from "../shared/events.js";

export interface EventHistoryStore {
  events: EventHistoryEntry[];
  sessions: SessionHistory[];
}

const DEFAULT_EVENT_LIMIT = 40;
const DEFAULT_SESSION_LIMIT = 30;
const DEFAULT_SESSION_EVENT_LIMIT = 250;

export function loadEventHistory(path: string): EventHistoryStore {
  if (!existsSync(path)) return { events: [], sessions: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<EventHistoryStore>;
    return {
      events: Array.isArray(parsed.events) ? parsed.events : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : []
    };
  } catch {
    return { events: [], sessions: [] };
  }
}

export function saveEventHistory(path: string, store: EventHistoryStore): void {
  writeFileSync(path, JSON.stringify(store, null, 2));
}

export function appendEventHistory(
  store: EventHistoryStore,
  event: CompanionEvent,
  eventLimit = DEFAULT_EVENT_LIMIT,
  sessionLimit = DEFAULT_SESSION_LIMIT,
  sessionEventLimit = DEFAULT_SESSION_EVENT_LIMIT
): EventHistoryStore {
  const entry: EventHistoryEntry = { id: event.id, event, timestamp: Date.now() };
  const events = [...store.events, entry].slice(-Math.max(1, eventLimit));
  const sessions = appendSessionEvent(store.sessions, entry, sessionLimit, sessionEventLimit);
  return { events, sessions };
}

function appendSessionEvent(
  sessions: SessionHistory[],
  entry: EventHistoryEntry,
  sessionLimit: number,
  sessionEventLimit: number
): SessionHistory[] {
  const event = entry.event;
  const sessionId = event.sessionId ?? inferSyntheticSessionId(event, sessions);
  const previous = sessions.find(s => s.sessionId === sessionId);
  const rest = sessions.filter(s => s.sessionId !== sessionId);
  const title = titleForSession(previous?.title, event);
  const nextEvents = [...(previous?.events ?? []), entry].slice(-Math.max(1, sessionEventLimit));
  const startedAt = previous?.startedAt ?? event.timestamp;
  const endedAt = event.event === "done" || event.event === "error" ? event.timestamp : previous?.endedAt;
  const next: SessionHistory = {
    sessionId,
    title,
    cwd: event.cwd ?? previous?.cwd,
    clientLabel: event.clientLabel ?? previous?.clientLabel,
    startedAt,
    endedAt,
    lastEventAt: event.timestamp,
    eventCount: (previous?.eventCount ?? 0) + 1,
    status: event.event === "error" ? "error" : event.event === "done" ? "done" : "active",
    events: nextEvents
  };
  return [...rest, next].sort((a, b) => b.lastEventAt - a.lastEventAt).slice(0, Math.max(1, sessionLimit));
}

function inferSyntheticSessionId(event: CompanionEvent, sessions: SessionHistory[]): string {
  const latestActive = sessions.find(s => s.status === "active");
  if (latestActive && event.event !== "session_start") return latestActive.sessionId;
  const date = new Date(event.timestamp).toISOString().slice(0, 10);
  return `local-${date}`;
}

function titleForSession(previousTitle: string | undefined, event: CompanionEvent): string {
  if (event.event === "prompt_submit") {
    const raw = event.detail || event.message || event.title;
    return raw.length > 36 ? raw.slice(0, 33) + "..." : raw;
  }
  if (previousTitle) return previousTitle;
  return event.title || event.sessionId?.slice(0, 8) || "Claude Code 会话";
}
