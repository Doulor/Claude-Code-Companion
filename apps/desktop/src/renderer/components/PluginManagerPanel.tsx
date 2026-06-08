import React, { useEffect, useState } from "react";
import type { CustomPlugin, PluginPermission, PluginRunRecord } from "../../shared/events";
import { useI18n } from "../useI18n";
import { Toggle } from "./ui/Toggle";

const permissions: PluginPermission[] = ["event", "network", "filesystem", "shell"];
const eventOptions = ["session_start", "prompt_submit", "tool_start", "tool_end", "permission_wait", "done", "error", "git_operation"];

export function PluginManagerPanel({ settings, updateSettings }: { settings: any; updateSettings: (s: any) => void }) {
  const { t } = useI18n();
  const plugins: CustomPlugin[] = settings.customPlugins ?? [];
  const [runs, setRuns] = useState<PluginRunRecord[]>([]);

  useEffect(() => {
    void window.companion.getPluginRuns().then(setRuns).catch(() => setRuns([]));
  }, [plugins.length]);

  const addPlugin = () => {
    const id = crypto.randomUUID();
    const next: CustomPlugin[] = [...plugins, { id, name: "New Plugin", scriptPath: "", enabled: false, trusted: false, events: [], permissions: ["event"] }];
    updateSettings({ customPlugins: next } as any);
  };

  const updatePlugin = (id: string, patch: Partial<CustomPlugin>) => {
    const next = plugins.map(p => p.id === id ? { ...p, ...patch } : p);
    updateSettings({ customPlugins: next } as any);
  };

  const removePlugin = (id: string) => {
    updateSettings({ customPlugins: plugins.filter(p => p.id !== id) } as any);
  };

  const toggleInList = <T extends string,>(values: T[], value: T) => values.includes(value) ? values.filter(v => v !== value) : [...values, value];

  return (
    <div className="panel-group-card">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">{t("plugins.title", "Plugin Manager")}</h3>
          <p className="note">{t("plugins.hint", "Plugins execute local Node.js scripts. Only enable plugins you trust; manifest permissions describe intended access, not a sandbox.")}</p>
        </div>
        <button className="ghost-btn" onClick={addPlugin}>{t("plugins.add", "Add Plugin")}</button>
      </div>

      {plugins.length === 0 ? (
        <div className="empty">{t("plugins.noPlugins", "No plugins")}</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {plugins.map(p => {
            const pluginRuns = runs.filter(r => r.pluginId === p.id).slice(-3).reverse();
            return (
              <div key={p.id} className="panel-group-card" style={{ padding: 12 }}>
                <div className="mapping-row" style={{ gridTemplateColumns: "1fr 1.5fr auto", alignItems: "center" }}>
                  <input type="text" value={p.name} onChange={e => updatePlugin(p.id, { name: e.target.value })}
                    placeholder={t("plugins.name", "Plugin Name")} className="text-input" />
                  <input type="text" value={p.scriptPath} onChange={e => updatePlugin(p.id, { scriptPath: e.target.value })}
                    placeholder={t("plugins.path", "Script Path")} className="text-input" />
                  <button className="ghost-btn danger" onClick={() => removePlugin(p.id)}>{t("plugins.remove", "Remove")}</button>
                </div>

                {p.manifest && (
                  <div className="note" style={{ marginTop: 8 }}>
                    Manifest: {p.manifest.name ?? p.name}{p.manifest.description ? ` — ${p.manifest.description}` : ""}
                  </div>
                )}

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
                  <Toggle label={t("plugins.trusted", "Trusted")} checked={p.trusted === true} onChange={trusted => updatePlugin(p.id, { trusted })} />
                  <Toggle label={t("plugins.enabled", "Enabled")} checked={p.enabled && p.trusted === true} onChange={enabled => updatePlugin(p.id, { enabled })} />
                  {!p.trusted && <span className="permission-risk high">{t("plugins.requiresTrust", "Requires trust before execution")}</span>}
                </div>

                <div className="panel-divider" />
                <div className="note">{t("plugins.events", "Events")}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  {eventOptions.map(event => (
                    <button key={event} className="ghost-btn" onClick={() => updatePlugin(p.id, { events: toggleInList(p.events, event) })}
                      style={p.events.includes(event) ? { background: "rgba(234,187,88,0.2)", color: "var(--honey)" } : {}}>
                      {event}
                    </button>
                  ))}
                </div>

                <div className="note" style={{ marginTop: 10 }}>{t("plugins.permissions", "Permissions")}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  {permissions.map(permission => {
                    const values = p.permissions ?? [];
                    return (
                      <button key={permission} className="ghost-btn" onClick={() => updatePlugin(p.id, { permissions: toggleInList(values, permission) })}
                        style={values.includes(permission) ? { background: "rgba(86,166,123,0.18)", color: "var(--green)" } : {}}>
                        {permission}
                      </button>
                    );
                  })}
                </div>

                {pluginRuns.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div className="note">{t("plugins.recentRuns", "Recent runs")}</div>
                    <div className="event-list" style={{ marginTop: 6 }}>
                      {pluginRuns.map(run => (
                        <div key={run.id} className="event-row">
                          <em>{run.eventType}</em>
                          <strong>{run.timedOut ? t("plugins.timedOut", "Timed out") : `Exit ${run.exitCode ?? "?"}`}</strong>
                          <p>{run.stderr || run.stdout || t("plugins.noOutput", "No output")}</p>
                          <span>{run.durationMs}ms</span>
                          <small>{new Date(run.startedAt).toLocaleTimeString()}</small>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
