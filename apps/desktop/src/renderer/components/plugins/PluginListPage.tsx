import React, { useMemo, useState } from "react";
import type { CustomPlugin, PluginMarketItem, PluginRunRecord } from "../../../shared/events";
import { useI18n } from "../../useI18n";
import { Toggle } from "../ui/Toggle";

export function PluginListPage({ plugins, market, runs, onOpenInstalled, onOpenMarket, onPatchPlugin, onAddCustom }: {
  plugins: CustomPlugin[];
  market: PluginMarketItem[];
  runs: PluginRunRecord[];
  onOpenInstalled: (id: string) => void;
  onOpenMarket: (id: string) => void;
  onPatchPlugin: (id: string, patch: Partial<CustomPlugin>) => void;
  onAddCustom: () => void;
}) {
  const { locale } = useI18n();
  const zh = locale === "zh";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const installedMarketIds = new Set(plugins.filter(p => p.id.startsWith("market-")).map(p => p.id.replace(/^market-/, "")));
  const visibleInstalled = useMemo(() => filterPlugins(plugins, query, filter, zh), [plugins, query, filter, zh]);
  const visibleMarket = useMemo(() => market.filter(item => [item.name, item.nameZh, item.description, item.descriptionZh, item.author, ...item.tags].filter(Boolean).join(" ").toLowerCase().includes(query.toLowerCase())), [market, query]);
  const failedRuns = runs.filter(run => run.timedOut || (run.exitCode !== null && run.exitCode !== 0)).length;

  return (
    <div className="plugins-page">
      <header className="plugins-workbench-header">
        <div>
          <p className="eyebrow">{zh ? "插件工作台" : "Plugin workbench"}</p>
          <h2>{zh ? "插件" : "Plugins"}</h2>
          <p className="subtle">{zh ? "集中管理脚本、组件、权限、设置和插件说明。" : "Manage scripts, widgets, permissions, settings, and plugin documentation in one place."}</p>
        </div>
        <div className="plugin-metrics">
          <Metric label={zh ? "已安装" : "Installed"} value={plugins.length} />
          <Metric label={zh ? "已启用" : "Enabled"} value={plugins.filter(p => p.enabled).length} />
          <Metric label={zh ? "需信任" : "Need trust"} value={plugins.filter(p => p.enabled && !p.trusted && (p.events?.length ?? 0) > 0).length} />
          <Metric label={zh ? "失败" : "Failures"} value={failedRuns} />
        </div>
      </header>

      <div className="plugins-toolbar">
        <input className="text-input plugin-search" value={query} placeholder={zh ? "搜索插件..." : "Search plugins..."} onChange={e => setQuery(e.target.value)} />
        <div className="plugin-filter-rail">
          {["all", "installed", "enabled", "needsTrust", "widget", "script"].map(key => <button key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{filterLabel(key, zh)}</button>)}
        </div>
        <button className="ghost-btn plugin-add-btn" onClick={onAddCustom}>{zh ? "添加本地插件" : "Add custom plugin"}</button>
      </div>

      <section className="plugin-section installed-section">
        <div className="plugin-section-head"><h3>{zh ? "已安装" : "Installed"}</h3><span>{visibleInstalled.length}</span></div>
        {visibleInstalled.length === 0 ? <div className="empty">{zh ? "没有匹配的已安装插件。" : "No installed plugins match this filter."}</div> : (
          <div className="plugin-card-grid">
            {visibleInstalled.map(plugin => {
              const pluginRuns = runs.filter(r => r.pluginId === plugin.id);
              return <InstalledCard key={plugin.id} plugin={plugin} run={pluginRuns[pluginRuns.length - 1]} zh={zh} onOpen={() => onOpenInstalled(plugin.id)} onPatch={patch => onPatchPlugin(plugin.id, patch)} />;
            })}
          </div>
        )}
      </section>

      <div className="plugin-section-divider"><span>{zh ? "插件市场" : "Marketplace"}</span></div>

      <section className="plugin-section market-section">
        <div className="plugin-section-head"><span>{visibleMarket.length} {zh ? "个可用" : "available"}</span></div>
        <div className="plugin-card-grid compact-market">
          {visibleMarket.map(item => <MarketCard key={item.id} item={item} installed={installedMarketIds.has(item.id)} zh={zh} onOpen={() => onOpenMarket(item.id)} />)}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div><strong>{value}</strong><span>{label}</span></div>;
}

function InstalledCard({ plugin, run, zh, onOpen, onPatch }: { plugin: CustomPlugin; run?: PluginRunRecord; zh: boolean; onOpen: () => void; onPatch: (patch: Partial<CustomPlugin>) => void }) {
  const widget = (plugin.manifest?.widgets ?? []).length > 0;
  const script = plugin.events.length > 0;
  const title = zh ? plugin.manifest?.nameZh ?? plugin.name : plugin.manifest?.name ?? plugin.name;
  const desc = zh ? plugin.manifest?.descriptionZh ?? plugin.manifest?.description : plugin.manifest?.description;
  return (
    <article className={`plugin-card ${plugin.enabled ? "enabled" : ""} ${plugin.enabled && !plugin.trusted && script ? "needs-trust" : ""}`} onClick={onOpen}>
      <div className="plugin-card-top">
        <div><h4>{title}</h4><p>{desc ?? (zh ? "本地自定义插件" : "Custom local plugin")}</p></div>
        <div onClick={e => e.stopPropagation()}><Toggle label="" checked={plugin.enabled} onChange={enabled => onPatch({ enabled })} /></div>
      </div>
      <div className="plugin-status-badges">
        <span>{plugin.enabled ? (zh ? "已启用" : "Enabled") : (zh ? "已停用" : "Disabled")}</span>
        <span>{plugin.trusted ? (zh ? "已信任" : "Trusted") : (zh ? "未信任" : "Untrusted")}</span>
        {widget ? <span>{zh ? "组件" : "Widget"}</span> : null}
        {script ? <span>{zh ? "脚本" : "Script"}</span> : null}
      </div>
      {run ? <small className={run.exitCode === 0 && !run.timedOut ? "run-ok" : "run-bad"}>{zh ? "最近运行" : "Last run"}: {run.timedOut ? (zh ? "超时" : "timeout") : `${zh ? "退出码" : "exit"} ${run.exitCode}`}</small> : <small>{zh ? "暂无运行记录" : "No recent runs"}</small>}
    </article>
  );
}

function MarketCard({ item, installed, zh, onOpen }: { item: PluginMarketItem; installed: boolean; zh: boolean; onOpen: () => void }) {
  return (
    <article className={`plugin-card market ${installed ? "installed" : ""}`} onClick={onOpen}>
      <div className="plugin-card-top"><div><h4>{zh ? item.nameZh ?? item.name : item.name}</h4><p>{zh ? item.descriptionZh ?? item.description : item.description}</p></div></div>
      <div className="plugin-status-badges"><span>{installed ? (zh ? "已安装" : "Installed") : (zh ? "市场" : "Market")}</span>{item.tags.slice(0, 3).map(tag => <span key={tag}>{tag}</span>)}</div>
    </article>
  );
}

function filterPlugins(plugins: CustomPlugin[], query: string, filter: string, zh: boolean): CustomPlugin[] {
  const q = query.toLowerCase();
  return plugins.filter(plugin => {
    const haystack = [plugin.name, plugin.manifest?.name, plugin.manifest?.nameZh, plugin.manifest?.description, plugin.manifest?.descriptionZh, plugin.author, plugin.version].filter(Boolean).join(" ").toLowerCase();
    if (q && !haystack.includes(q)) return false;
    if (filter === "enabled") return plugin.enabled;
    if (filter === "needsTrust") return plugin.enabled && !plugin.trusted && plugin.events.length > 0;
    if (filter === "widget") return (plugin.manifest?.widgets ?? []).length > 0;
    if (filter === "script") return plugin.events.length > 0;
    return true;
  });
}

function filterLabel(key: string, zh: boolean): string {
  const labels = zh
    ? { all: "全部", installed: "已安装", enabled: "已启用", needsTrust: "需信任", widget: "组件", script: "脚本" }
    : { all: "All", installed: "Installed", enabled: "Enabled", needsTrust: "Needs trust", widget: "Widgets", script: "Scripts" };
  return (labels as Record<string, string>)[key] ?? key;
}
