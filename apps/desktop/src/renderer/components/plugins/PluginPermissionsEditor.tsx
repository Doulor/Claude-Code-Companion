import React from "react";
import type { CustomPlugin, PluginPermission } from "../../../shared/events";

const eventOptions = ["session_start", "prompt_submit", "tool_start", "tool_end", "permission_wait", "done", "error", "git_operation"];
const permissions: PluginPermission[] = ["event", "network", "filesystem", "shell"];

export function PluginPermissionsEditor({ plugin, onChange, zh = false }: { plugin: CustomPlugin; onChange: (patch: Partial<CustomPlugin>) => void; zh?: boolean }) {
  const hasEvents = (plugin.manifest?.events ?? plugin.events ?? []).length > 0;
  return (
    <div className="plugin-editor-stack">
      <div>
        <h4>{zh ? "事件" : "Events"}</h4>
        {hasEvents ? (
          <div className="plugin-chip-row">
            {eventOptions.map(event => {
              const active = plugin.events.includes(event);
              return <button key={event} className={`plugin-chip ${active ? "active" : ""}`} onClick={() => onChange({ events: toggle(plugin.events, event) })}>{eventLabel(event, zh)}</button>;
            })}
          </div>
        ) : <div className="empty compact">{zh ? "这个插件不监听 Clawd 事件。" : "This plugin does not listen to Clawd events."}</div>}
      </div>
      <div>
        <h4>{zh ? "权限" : "Permissions"}</h4>
        <div className="plugin-chip-row">
          {permissions.map(permission => {
            const current = plugin.permissions ?? [];
            const active = current.includes(permission);
            return <button key={permission} className={`plugin-chip permission ${active ? "active" : ""}`} onClick={() => onChange({ permissions: toggle(current, permission) })}>{permissionLabel(permission, zh)}</button>;
          })}
        </div>
        {(plugin.manifest?.permissions ?? []).length === 0 ? <p className="note">{zh ? "无需脚本权限。" : "No script permissions required."}</p> : null}
      </div>
    </div>
  );
}

function toggle<T extends string>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter(item => item !== value) : [...values, value];
}

function eventLabel(event: string, zh: boolean): string {
  if (!zh) return event;
  return ({ session_start: "会话开始", prompt_submit: "提交提示", tool_start: "工具开始", tool_end: "工具结束", permission_wait: "等待权限", done: "任务完成", error: "任务出错", git_operation: "Git 操作" } as Record<string, string>)[event] ?? event;
}

function permissionLabel(permission: PluginPermission, zh: boolean): string {
  if (!zh) return permission;
  return ({ event: "事件", network: "网络", filesystem: "文件系统", shell: "命令行" } as Record<PluginPermission, string>)[permission];
}
