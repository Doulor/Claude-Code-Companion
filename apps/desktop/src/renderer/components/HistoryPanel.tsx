import React, { useEffect, useMemo, useState } from "react";
import type { CompanionEventType, SessionHistory } from "../../shared/events";
import { useI18n } from "../useI18n";

const filters: Array<"all" | CompanionEventType | "tool"> = ["all", "tool", "permission_wait", "done", "error", "git_operation"];

export function HistoryPanel() {
  const { t } = useI18n();
  const localizedEvent = (event: { event: string; title: string; message: string }) => localizeHistoryEvent(event, t);
  const [sessions, setSessions] = useState<SessionHistory[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<typeof filters[number]>("all");

  const refresh = () => window.companion.getSessionHistory().then(next => {
    setSessions(next);
    setSelectedId(current => current ?? next[0]?.sessionId ?? null);
  }).catch(e => console.warn("[History] Get sessions:", e));

  useEffect(() => {
    void refresh();
    const unsub = window.companion.onEvent(() => void refresh());
    return unsub;
  }, []);

  const selected = sessions.find(s => s.sessionId === selectedId) ?? sessions[0];
  const events = useMemo(() => {
    if (!selected) return [];
    if (filter === "all") return selected.events;
    if (filter === "tool") return selected.events.filter(e => e.event.event === "tool_start" || e.event.event === "tool_end");
    return selected.events.filter(e => e.event.event === filter);
  }, [selected, filter]);

  const clearHistory = async () => {
    await window.companion.clearEventHistory();
    setSessions([]);
    setSelectedId(null);
  };

  return (
    <div className="panel-group-card">
      <div className="panel-header">
        <h3 className="panel-title">{t("history.title", "Session History")}</h3>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="ghost-btn" onClick={refresh}>{t("common.refresh", "刷新")}</button>
          <button className="ghost-btn danger" onClick={clearHistory}>{t("history.clear", "Clear")}</button>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="empty">{t("history.empty", "No sessions")}</div>
      ) : (
        <div className="session-history-layout">
          <div className="session-list">
            {sessions.map(session => (
              <button key={session.sessionId} className={`session-list-item ${selected?.sessionId === session.sessionId ? "active" : ""}`} onClick={() => setSelectedId(session.sessionId)}>
                <strong>{localizeSessionTitle(session.title, t)}</strong>
                <span>{session.clientLabel ?? "Claude Code"} · {session.eventCount} {t("history.events", "events")}</span>
                <small>{new Date(session.lastEventAt).toLocaleString()}</small>
              </button>
            ))}
          </div>

          <div className="session-timeline-panel">
            {selected && (
              <>
                <div className="session-detail-head">
                  <div>
                    <strong>{localizeSessionTitle(selected.title, t)}</strong>
                    <p>{selected.cwd ?? selected.sessionId}</p>
                  </div>
                  <span className={`session-status ${selected.status}`}>{selected.status}</span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                  {filters.map(f => (
                    <button key={f} className="ghost-btn" style={filter === f ? { background: "rgba(234,187,88,0.2)", color: "var(--honey)" } : {}} onClick={() => setFilter(f)}>{f}</button>
                  ))}
                </div>
                <div className="timeline-track">
                  {events.map((entry, index) => (
                    <div key={entry.id} className={`timeline-marker ${entry.event.event}`} style={{ left: events.length === 1 ? "50%" : `${(index / Math.max(1, events.length - 1)) * 100}%` }} title={tooltip(entry.event)}>
                      <span />
                    </div>
                  ))}
                </div>
                <div className="event-list" style={{ marginTop: 18 }}>
                  {events.slice().reverse().map(entry => {
                    const display = localizedEvent(entry.event);
                    return (
                      <div key={entry.id} className="event-row" title={tooltip({ ...entry.event, ...display })}>
                        <em>{entry.event.event}</em>
                        <strong>{display.title}</strong>
                        <p>{display.message}</p>
                        <span>{entry.event.tool ?? ""}</span>
                        <small>{new Date(entry.timestamp).toLocaleTimeString()}</small>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function localizeSessionTitle(title: string, t: (path: string, fallback?: string) => string) {
  if (title === "Claude Code 开始处理新的消息。") return t("data.eventPromptSubmitMessage", title);
  if (title === "会话开始") return t("data.eventSessionStartTitle", title);
  if (title === "处理完成") return t("data.eventDoneTitle", title);
  return title;
}

function localizeHistoryEvent(event: { event: string; title: string; message: string }, t: (path: string, fallback?: string) => string) {
  if (event.event === "prompt_submit") {
    return {
      title: t("data.eventPromptSubmitTitle", event.title),
      message: t("data.eventPromptSubmitMessage", event.message)
    };
  }
  if (event.event === "session_start") {
    return {
      title: t("data.eventSessionStartTitle", event.title),
      message: t("data.eventSessionStartMessage", event.message)
    };
  }
  if (event.event === "done") {
    return {
      title: t("data.eventDoneTitle", event.title),
      message: t("data.eventDoneMessage", event.message)
    };
  }
  return { title: event.title, message: event.message };
}

function tooltip(event: { event: string; tool?: string; title: string; message: string; detail?: string }) {
  return [event.event, event.tool, event.title, event.detail ?? event.message].filter(Boolean).join(" · ");
}
