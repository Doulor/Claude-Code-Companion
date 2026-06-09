import React from "react";
import type { PluginSettingField } from "../../../shared/events";
import { Toggle } from "../ui/Toggle";
import { Slider } from "../ui/Slider";

export function PluginSettingsFields({ fields, values, onChange, zh = false }: { fields: PluginSettingField[]; values: Record<string, unknown>; onChange: (key: string, value: unknown) => void; zh?: boolean }) {
  if (fields.length === 0) return <div className="empty">{zh ? "这个插件没有可配置项。" : "No configurable settings."}</div>;
  return (
    <div className="plugin-settings-grid">
      {fields.map(field => {
        const val = values[field.key] ?? field.default;
        switch (field.type) {
          case "toggle":
            return <Toggle key={field.key} label={localFieldLabel(field, zh)} checked={!!val} onChange={v => onChange(field.key, v)} />;
          case "number":
            return <Slider key={field.key} label={localFieldLabel(field, zh)} min={field.min ?? 0} max={field.max ?? 100} step={field.step ?? 1} value={Number(val) || 0} onChange={v => onChange(field.key, v)} />;
          case "select":
            return (
              <label key={field.key} className="plugin-form-row">
                <span>{localFieldLabel(field, zh)}</span>
                <select className="text-input" value={String(val ?? "")} onChange={e => onChange(field.key, e.target.value)}>
                  {(field.options ?? []).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                {field.description ? <small>{field.description}</small> : null}
              </label>
            );
          case "color":
            return (
              <label key={field.key} className="plugin-form-row inline">
                <span>{localFieldLabel(field, zh)}</span>
                <input type="color" value={String(val ?? "#000000")} onChange={e => onChange(field.key, e.target.value)} />
                {field.description ? <small>{field.description}</small> : null}
              </label>
            );
          default:
            return (
              <label key={field.key} className="plugin-form-row">
                <span>{localFieldLabel(field, zh)}</span>
                <input type="text" className="text-input" value={String(val ?? "")} placeholder={field.placeholder} onChange={e => onChange(field.key, e.target.value)} />
                {field.description ? <small>{field.description}</small> : null}
              </label>
            );
        }
      })}
    </div>
  );
}

function localFieldLabel(field: PluginSettingField, zh: boolean): string {
  if (!zh) return field.label;
  if (field.labelZh) return field.labelZh;
  const labels: Record<string, string> = {
    workMinutes: "专注时长",
    breakMinutes: "休息时长",
    logPath: "日志文件路径",
    format: "输出格式",
    includeDetail: "包含事件详情",
    enableDragHandle: "显示拖动点",
    webhookUrl: "Webhook 地址",
    eventFilter: "触发事件",
    mentionOn: "错误时提醒"
  };
  return labels[field.key] ?? field.label;
}
