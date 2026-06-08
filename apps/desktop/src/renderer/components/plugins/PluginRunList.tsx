import React from "react";
import type { PluginRunRecord } from "../../../shared/events";

export function PluginRunList({ runs, zh = false }: { runs: PluginRunRecord[]; zh?: boolean }) {
  if (runs.length === 0) return <div className="empty">{zh ? "暂无运行记录。" : "No recent runs."}</div>;
  return (
    <div className="plugin-run-list">
      {runs.slice(-8).reverse().map(run => (
        <div key={run.id} className={`plugin-run-row ${run.exitCode === 0 && !run.timedOut ? "ok" : "bad"}`}>
          <div>
            <strong>{run.eventType}</strong>
            <span>{new Date(run.startedAt).toLocaleTimeString()} · {run.durationMs}ms</span>
          </div>
          <em>{run.timedOut ? (zh ? "已超时" : "Timed out") : `${zh ? "退出码" : "Exit"} ${run.exitCode ?? "?"}`}</em>
          {(run.stderr || run.stdout) ? <pre>{run.stderr || run.stdout}</pre> : null}
        </div>
      ))}
    </div>
  );
}
