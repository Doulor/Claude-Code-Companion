import { describe, expect, it } from "vitest";
import { appendEventHistory } from "../src/main/event-history.js";
import type { CompanionEvent } from "../src/shared/events.js";

function event(patch: Partial<CompanionEvent>): CompanionEvent {
  return {
    id: crypto.randomUUID(),
    source: "manual",
    event: "session_start",
    sessionId: "s1",
    title: "start",
    message: "started",
    timestamp: Date.now(),
    ...patch
  };
}

describe("event history", () => {
  it("groups events by session and marks completion", () => {
    let store = { events: [], sessions: [] };
    store = appendEventHistory(store, event({ event: "session_start", title: "Session" }));
    store = appendEventHistory(store, event({ event: "tool_start", tool: "Read", title: "Read" }));
    store = appendEventHistory(store, event({ event: "done", title: "Done" }));

    expect(store.sessions).toHaveLength(1);
    expect(store.sessions[0].eventCount).toBe(3);
    expect(store.sessions[0].status).toBe("done");
    expect(store.sessions[0].events.map(e => e.event.event)).toEqual(["session_start", "tool_start", "done"]);
  });

  it("respects event and session limits", () => {
    let store = { events: [], sessions: [] };
    for (let i = 0; i < 5; i++) {
      store = appendEventHistory(store, event({ sessionId: `s${i}`, title: `s${i}` }), 2, 3, 10);
    }
    expect(store.events).toHaveLength(2);
    expect(store.sessions).toHaveLength(3);
  });
});
