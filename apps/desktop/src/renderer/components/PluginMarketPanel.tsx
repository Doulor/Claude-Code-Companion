import React, { useEffect, useMemo, useState } from "react";
import type { PluginMarketIndex, PluginMarketItem, PluginPermission } from "../../shared/events";
import { useI18n } from "../useI18n";

const permissionCopy: Record<PluginPermission, string> = {
  event: "读取当前 Clawd 事件 JSON",
  network: "访问外部网络",
  filesystem: "读写本地文件",
  shell: "执行命令或启动子进程"
};

const englishPermissionCopy: Record<PluginPermission, string> = {
  event: "Read the current Clawd event JSON",
  network: "Access external network resources",
  filesystem: "Read or write local files",
  shell: "Run commands or spawn child processes"
};

const eventCopy: Record<string, string> = {
  done: "任务完成",
  error: "任务出错",
  session_start: "会话开始",
  prompt_submit: "收到用户输入",
  tool_start: "工具开始",
  tool_end: "工具结束",
  permission_wait: "等待权限确认",
  git_operation: "Git 操作"
};

export function PluginMarketPanel({ installedPluginIds, onInstalled }: { installedPluginIds: string[]; onInstalled: () => void }) {
  const { locale } = useI18n();
  const zh = locale === "zh";
  const [market, setMarket] = useState<PluginMarketIndex | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [marketQuery, setMarketQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const installedMarketIds = useMemo(() => new Set(installedPluginIds.filter(id => id.startsWith("market-")).map(id => id.replace(/^market-/, ""))), [installedPluginIds]);

  const refreshMarket = () => window.companion.getPluginMarket().then(result => {
    setMarket(result);
    setMarketError(null);
  }).catch(error => setMarketError(error instanceof Error ? error.message : String(error)));

  useEffect(() => {
    void refreshMarket();
  }, []);

  const marketItems = useMemo(() => {
    const query = marketQuery.trim().toLowerCase();
    const items = market?.plugins ?? [];
    if (!query) return items;
    return items.filter(item => [title(item, zh), item.name, item.description, item.descriptionZh, item.author, ...item.tags].filter(Boolean).join(" ").toLowerCase().includes(query));
  }, [market, marketQuery, zh]);

  const selected = marketItems.find(item => item.id === selectedId) ?? null;

  const installFromMarket = async (id: string) => {
    setInstalling(id);
    try {
      const result = await window.companion.installMarketPlugin(id);
      if (!result.ok) setMarketError(result.error ?? (zh ? "安装失败" : "Install failed"));
      onInstalled();
    } catch (error) {
      setMarketError(error instanceof Error ? error.message : String(error));
    } finally {
      setInstalling(null);
    }
  };

  return (
    <div className="plugin-market-page">
      <section className="plugin-market-hero">
        <div>
          <p className="eyebrow">{zh ? "插件市场" : "Plugin Market"}</p>
          <h1>{zh ? "发现并安装 Clawd 插件" : "Discover and install Clawd plugins"}</h1>
          <p className="subtle">{zh ? "市场会优先联网拉取 GitHub 仓库内容；网络失败时使用应用内置市场。安装后默认不信任、不启用，需要你手动确认。" : "The market tries to fetch GitHub first and falls back to the bundled market. Installed plugins are not trusted or enabled by default."}</p>
        </div>
        <button className="ghost-btn" onClick={refreshMarket}>{zh ? "刷新市场" : "Refresh"}</button>
      </section>

      <div className="plugin-market-toolbar">
        <input className="text-input" value={marketQuery} onChange={e => setMarketQuery(e.target.value)} placeholder={zh ? "搜索插件、作者或标签" : "Search plugins, authors, or tags"} />
        <span>{market ? (zh ? `共 ${market.plugins.length} 个插件` : `${market.plugins.length} plugins`) : (zh ? "加载中" : "Loading")}</span>
      </div>

      {marketError && <div className="connection-error">{marketError}</div>}
      {!market && !marketError ? <div className="empty">{zh ? "正在加载插件市场..." : "Loading plugin market..."}</div> : (
        <div className={`plugin-market-layout ${selected ? "detail-open" : ""}`}>
          <div className="plugin-market-grid plugin-market-grid-large">
            {marketItems.map(item => {
              const installed = installedMarketIds.has(item.id);
              return (
                <button key={item.id} className={`plugin-market-item plugin-market-item-large ${selected?.id === item.id ? "active" : ""}`} onClick={() => setSelectedId(item.id)}>
                  <div className="plugin-market-head">
                    <strong>{title(item, zh)}</strong>
                    <span>v{item.version}</span>
                  </div>
                  <p>{summary(item, zh)}</p>
                  <small>{zh ? "作者" : "Author"}：{item.author}</small>
                  <div className="plugin-chip-row">
                    {item.tags.map(tag => <em key={tag}>#{tagLabel(tag, zh)}</em>)}
                  </div>
                  <div className="plugin-market-card-foot">
                    <span>{installed ? (zh ? "已安装" : "Installed") : (zh ? "未安装" : "Not installed")}</span>
                    <span>{zh ? "查看详情" : "Details"}</span>
                  </div>
                </button>
              );
            })}
            {marketItems.length === 0 && <div className="empty">{zh ? "没有匹配的插件" : "No matching plugins"}</div>}
          </div>

          {selected && (
            <aside className="plugin-detail-panel">
              <div className="plugin-detail-head">
                <div>
                  <p className="eyebrow">{zh ? "插件详情" : "Plugin details"}</p>
                  <h2>{title(selected, zh)}</h2>
                  <span>v{selected.version} · {zh ? "作者" : "Author"}：{selected.author}</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="ghost-btn" disabled={installing === selected.id} onClick={() => installFromMarket(selected.id)}>
                    {installing === selected.id ? (zh ? "安装中..." : "Installing...") : installedMarketIds.has(selected.id) ? (zh ? "重新安装" : "Reinstall") : (zh ? "安装插件" : "Install")}
                  </button>
                  <button className="ghost-btn" onClick={() => setSelectedId(null)}>{zh ? "关闭" : "Close"}</button>
                </div>
              </div>

              <p className="plugin-detail-desc">{details(selected, zh)}</p>

              <div className="plugin-detail-section">
                <strong>{zh ? "触发事件" : "Trigger events"}</strong>
                <div className="plugin-chip-row">
                  {selected.events.map(event => <em key={event}>{zh ? (eventCopy[event] ?? event) : event}</em>)}
                </div>
              </div>

              <div className="plugin-detail-section">
                <strong>{zh ? "权限说明" : "Permissions"}</strong>
                <div className="plugin-permission-list">
                  {selected.permissions.map(permission => (
                    <div key={permission}>
                      <span>{permission}</span>
                      <p>{zh ? permissionCopy[permission] : englishPermissionCopy[permission]}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="plugin-safety-box">
                <strong>{zh ? "安全提示" : "Safety note"}</strong>
                <p>{zh ? "市场插件会以本地 Node.js 脚本运行。安装后不会自动执行，你需要在插件管理中打开“Trusted”和“Enabled”。" : "Market plugins run as local Node.js scripts. They will not run after installation until you enable Trusted and Enabled in Plugin Manager."}</p>
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}

function title(item: PluginMarketItem, zh: boolean) {
  return zh ? (item.nameZh ?? item.name) : item.name;
}

function summary(item: PluginMarketItem, zh: boolean) {
  return zh ? (item.descriptionZh ?? item.description) : item.description;
}

function details(item: PluginMarketItem, zh: boolean) {
  return zh ? (item.detailsZh ?? item.descriptionZh ?? item.description) : item.description;
}

function tagLabel(tag: string, zh = true) {
  if (!zh) return tag;
  const map: Record<string, string> = { notification: "提醒", example: "示例", summary: "摘要", logging: "日志" };
  return map[tag] ?? tag;
}
