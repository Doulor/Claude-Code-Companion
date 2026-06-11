import React, { useCallback, useEffect, useState } from "react";
import type { CustomPlugin, PluginMarketItem, PluginRunRecord } from "../../../shared/events";
import { useI18n } from "../../useI18n";
import { Toggle } from "../ui/Toggle";
import { PluginInstallControls } from "./PluginInstallControls";
import { PluginPermissionsEditor } from "./PluginPermissionsEditor";
import { PluginRunList } from "./PluginRunList";
import { PluginSettingsFields } from "./PluginSettingsFields";
import { SafeMarkdown } from "./SafeMarkdown";

type DiagnosticFinding = {
  level: "error" | "warn" | "info";
  title: string;
  detail?: string;
  suggestion?: string;
  evidence?: string[];
};

type DiagnosticPayload = {
  sourceLog?: string;
  reportPath?: string | null;
  diagnosis: {
    summary: { total: number; errors: number; warnings: number; info: number; topFinding?: string | null };
    findings: DiagnosticFinding[];
  };
};

function parseDiagnosticPayload(stdout?: string): DiagnosticPayload | undefined {
  if (!stdout) return undefined;
  const marker = "CLAWD_DIAG_JSON:";
  const idx = stdout.lastIndexOf(marker);
  if (idx === -1) return undefined;
  const jsonPart = stdout.slice(idx + marker.length).trim();
  try {
    return JSON.parse(jsonPart) as DiagnosticPayload;
  } catch {
    return undefined;
  }
}

export function PluginDetailPage({ plugin, marketItem, runs, installing, onBack, onInstall, onRemove, onPatchPlugin, onRunNow }: {
  plugin?: CustomPlugin;
  marketItem?: PluginMarketItem;
  runs: PluginRunRecord[];
  installing?: boolean;
  onBack: () => void;
  onInstall?: () => void;
  onRemove?: () => void;
  onPatchPlugin: (patch: Partial<CustomPlugin>) => void;
  onRunNow?: (action?: string) => Promise<{ ok: boolean; runId?: string; record?: PluginRunRecord; error?: string }>;
}) {
  const { locale } = useI18n();
  const zh = locale === "zh";
  const [readmeExpanded, setReadmeExpanded] = useState(false);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [progressModal, setProgressModal] = useState<{ open: boolean; mode: "diagnose" | "collect"; progress: number; status: "idle" | "running" | "done" | "error"; result?: DiagnosticPayload; error?: string }>({ open: false, mode: "diagnose", progress: 0, status: "idle" });

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (progressModal.status !== "running") return;
    const timer = window.setInterval(() => {
      setProgressModal(current => current.status === "running" ? { ...current, progress: Math.min(92, current.progress + 7) } : current);
    }, 180);
    return () => window.clearInterval(timer);
  }, [progressModal.status]);

  const isDiagnosticPlugin = plugin?.marketId === "diagnostic-logger" || plugin?.id === "market-diagnostic-logger";

  const runPluginAction = useCallback(async (action?: string) => {
    if (!onRunNow || runningAction) return;
    const nextAction = action ?? "run";
    setRunningAction(nextAction);
    if (isDiagnosticPlugin && (action === "diagnose-ui" || action === "collect")) {
      setProgressModal({ open: true, mode: action === "collect" ? "collect" : "diagnose", progress: 6, status: "running" });
    }
    try {
      const result = await onRunNow(action);
      const payload = isDiagnosticPlugin && (action === "diagnose-ui" || action === "diagnose-save") ? parseDiagnosticPayload(result.record?.stdout) : undefined;
      if (result.ok || result.runId || payload) {
        if (isDiagnosticPlugin && action === "collect") {
          setProgressModal(current => ({ ...current, open: true, progress: 100, status: "done" }));
        } else if (isDiagnosticPlugin && (action === "diagnose-ui" || action === "diagnose-save")) {
          const parsedOk = !!payload;
          const receivedRecord = !!result.runId;
          setProgressModal(current => ({
            ...current,
            open: true,
            progress: 100,
            status: "done",
            result: payload,
            error: parsedOk ? undefined : receivedRecord
              ? (zh ? "诊断完成，但未能从运行记录中解析出结果。" : "Diagnosis finished, but the result could not be parsed from the run output.")
              : (zh ? "诊断完成，但未收到运行记录。" : "Diagnosis finished, but no run record was returned.")
          }));
        } else {
          setToast({ text: zh ? "操作已完成" : "Action finished", type: "success" });
        }
      } else {
        const errorText = result.error ?? (isDiagnosticPlugin
          ? action === "diagnose-ui" ? (zh ? "诊断失败" : "Diagnosis failed") : (zh ? "日志生成失败" : "Log generation failed")
          : (zh ? "生成失败" : "Generation failed"));
        if (isDiagnosticPlugin && (action === "diagnose-ui" || action === "collect")) {
          setProgressModal(current => ({ ...current, open: true, progress: 100, status: "error", error: errorText }));
        } else {
          setToast({ text: errorText, type: "error" });
        }
      }
    } catch (e) {
      const fallback = isDiagnosticPlugin
        ? action === "diagnose-ui" ? (zh ? "诊断出错，请重试" : "Diagnosis error, please retry") : (zh ? "日志生成出错，请重试" : "Log generation error, please retry")
        : (zh ? "生成出错，请重试" : "Error, please retry");
      if (isDiagnosticPlugin && (action === "diagnose-ui" || action === "collect")) {
        setProgressModal(current => ({ ...current, open: true, progress: 100, status: "error", error: fallback }));
      } else {
        setToast({ text: fallback, type: "error" });
      }
    } finally {
      setRunningAction(null);
    }
  }, [onRunNow, runningAction, zh, isDiagnosticPlugin]);
  const title = zh ? plugin?.manifest?.nameZh ?? plugin?.name ?? marketItem?.nameZh ?? marketItem?.name ?? "插件" : plugin?.manifest?.name ?? plugin?.name ?? marketItem?.name ?? "Plugin";
  const description = zh ? plugin?.manifest?.descriptionZh ?? plugin?.manifest?.description ?? marketItem?.descriptionZh ?? marketItem?.description ?? "" : plugin?.manifest?.description ?? marketItem?.description ?? "";
  const manifest = plugin?.manifest;
  const widgets = manifest?.widgets ?? [];
  const readme = zh
    ? plugin?.readmeZh ?? plugin?.manifest?.readmeZh ?? marketItem?.readmeZh ?? marketItem?.detailsZh ?? plugin?.readme ?? plugin?.manifest?.readme ?? marketItem?.readme ?? marketItem?.details ?? description
    : plugin?.readme ?? plugin?.manifest?.readme ?? marketItem?.readme ?? marketItem?.details ?? description;
  const scriptLike = !!plugin && plugin.events.length > 0;

  return (
    <div className="plugin-detail-page">
      <div className="plugin-detail-sticky-bar"><button className="ghost-btn plugin-back-btn" onClick={onBack}>← {zh ? "返回插件列表" : "Back to plugins"}</button></div>
      <header className="plugin-detail-hero">
        <div>
          <p className="eyebrow">{marketItem ? (zh ? "市场插件" : "Market plugin") : plugin?.scriptPath ? (zh ? "已安装插件" : "Installed plugin") : (zh ? "插件" : "Plugin")}</p>
          <h2>{title}{(plugin?.devBadge || plugin?.manifest?.devBadge || marketItem?.devBadge) ? <span className="dev-badge">Dev</span> : null}</h2>
          <p>{description}</p>
          <div className="plugin-status-badges">
            {plugin ? <span>{plugin.enabled ? (zh ? "已启用" : "Enabled") : (zh ? "已停用" : "Disabled")}</span> : <span>{zh ? "未安装" : "Not installed"}</span>}
            {plugin ? <span>{plugin.trusted ? (zh ? "已信任" : "Trusted") : (zh ? "未信任" : "Untrusted")}</span> : null}
            {widgets.length ? <span>{zh ? "组件" : "Widget"}</span> : null}
            {scriptLike ? <span>{zh ? "脚本" : "Script"}</span> : null}
            {(plugin?.version ?? marketItem?.version) ? <span>v{plugin?.version ?? marketItem?.version}</span> : null}
          </div>
        </div>
        <PluginInstallControls marketItem={marketItem} installed={plugin} installing={installing} onInstall={onInstall} onRemove={onRemove} zh={zh} />
      </header>

      <div className="plugin-detail-layout">
        <main className="plugin-detail-main">
          <section className={`plugin-detail-section readme-section ${readmeExpanded ? "expanded" : "collapsed"}`}>
            <div className="plugin-section-title-row">
              <h3>{zh ? "说明" : "README"}</h3>
              <button className="ghost-btn" onClick={() => setReadmeExpanded(value => !value)}>{readmeExpanded ? (zh ? "收起" : "Collapse") : (zh ? "展开完整说明" : "Expand")}</button>
            </div>
            <div className="readme-collapse-body">
              <SafeMarkdown text={readme || (zh ? "暂无插件说明。" : "No README provided.")} />
            </div>
          </section>

          {plugin ? (
            <section className="plugin-detail-section">
              <h3>{zh ? "设置" : "Settings"}</h3>
              <PluginSettingsFields fields={plugin.manifest?.settings ?? []} values={plugin.settings ?? {}} onChange={(key, value) => onPatchPlugin({ settings: { ...(plugin.settings ?? {}), [key]: value } })} zh={zh} />
            </section>
          ) : null}

          {plugin && scriptLike && onRunNow ? (
            <section className="plugin-detail-section">
              {isDiagnosticPlugin ? (
                <div className="plugin-action-row">
                  <button className="plugin-generate-btn" disabled={!!runningAction} onClick={() => void runPluginAction("collect")}>
                    {runningAction === "collect" ? (zh ? "生成日志中..." : "Generating logs...") : (zh ? "生成日志" : "Generate logs")}
                  </button>
                  <button className="plugin-generate-btn" disabled={!!runningAction} onClick={() => void runPluginAction("diagnose-ui")}>
                    {runningAction === "diagnose-ui" ? (zh ? "诊断中..." : "Diagnosing...") : (zh ? "一键诊断" : "Run diagnosis")}
                  </button>
                </div>
              ) : (
                <button className="plugin-generate-btn" disabled={!!runningAction} onClick={() => void runPluginAction()}>
                  {runningAction ? (zh ? "生成中..." : "Generating...") : (zh ? "立即生成" : "Generate now")}
                </button>
              )}
            </section>
          ) : null}

          {toast ? <div className={`plugin-toast ${toast.type}`}>{toast.text}</div> : null}

          {progressModal.open ? (
            <div className="plugin-modal-backdrop">
              <section className="plugin-modal">
                <header>
                  <h3>{progressModal.mode === "collect" ? (zh ? "生成日志" : "Generate logs") : (zh ? "一键诊断" : "Run diagnosis")}</h3>
                  <button className="ghost-btn" onClick={() => setProgressModal({ open: false, mode: "diagnose", progress: 0, status: "idle" })}>×</button>
                </header>
                <div className="plugin-modal-progress">
                  <div className="plugin-modal-progress-bar" style={{ width: `${progressModal.progress}%` }} />
                </div>
                <span className="plugin-modal-progress-text">{progressModal.progress}%</span>
                {progressModal.status === "running" ? (
                  <p className="note">{progressModal.mode === "collect" ? (zh ? "正在采集本地日志和运行状态..." : "Collecting local logs and runtime state...") : (zh ? "正在读取最新日志并匹配错误规则..." : "Reading latest logs and matching diagnosis rules...")}</p>
                ) : null}
                {progressModal.status === "error" ? (
                  <div className="plugin-modal-error">
                    <p>{progressModal.error ?? (progressModal.mode === "collect" ? (zh ? "日志生成失败" : "Log generation failed") : (zh ? "诊断失败" : "Diagnosis failed"))}</p>
                    {progressModal.mode === "diagnose" ? (
                      <p className="note">{zh ? "提示：诊断依赖最新日志，请先「生成日志」再重试。" : "Tip: Diagnosis depends on the newest logs. Click Generate logs first, then retry."}</p>
                    ) : null}
                  </div>
                ) : null}
                {progressModal.mode === "collect" && progressModal.status === "done" ? (
                  <div className="plugin-modal-done">
                    <p className="note">{zh ? "日志已生成，可在数据目录中查看最新文件。" : "Logs generated. You can view the newest files in the data directory."}</p>
                    <div className="plugin-action-row">
                      <button className="ghost-btn" onClick={() => plugin && void window.companion.openPluginDataDir(plugin.id)}>{zh ? "在文件资源管理器打开" : "Open in explorer"}</button>
                      <button className="ghost-btn" onClick={() => setProgressModal({ open: false, mode: "diagnose", progress: 0, status: "idle" })}>{zh ? "完成" : "Done"}</button>
                    </div>
                  </div>
                ) : null}
                {progressModal.mode === "diagnose" && progressModal.status === "done" ? (
                  <div className="diagnostic-result">
                    {!progressModal.result ? (
                      <div className="plugin-modal-hint">
                        <p>{progressModal.error ?? (zh ? "诊断完成，但未能从运行记录中解析出结果。" : "Diagnosis finished, but the result could not be parsed from the run output.")}</p>
                        <p className="note">{zh ? "这不是“没有问题”，而是结果未成功解析。请先点击「生成日志」，再重试一键诊断。" : "This does not mean there are no problems. The result was not parsed successfully. Click Generate logs first, then run diagnosis again."}</p>
                      </div>
                    ) : null}
                    <div className="diagnostic-summary">
                      <span>{zh ? "错误" : "Errors"}: {progressModal.result?.diagnosis.summary.errors ?? 0}</span>
                      <span>{zh ? "警告" : "Warnings"}: {progressModal.result?.diagnosis.summary.warnings ?? 0}</span>
                      <span>{zh ? "信息" : "Info"}: {progressModal.result?.diagnosis.summary.info ?? 0}</span>
                    </div>
                    {(progressModal.result?.diagnosis.findings.length ?? 0) === 0 ? (
                      <div className="empty">{zh ? "暂无" : "None"}</div>
                    ) : (
                      <div className="diagnostic-finding-list">
                        {progressModal.result!.diagnosis.findings.map((finding, index) => (
                          <article key={`${finding.title}-${index}`} className={`diagnostic-finding ${finding.level}`}>
                            <strong>{finding.level.toUpperCase()} · {finding.title}</strong>
                            {finding.detail ? <p>{finding.detail}</p> : null}
                            {finding.suggestion ? <small>{finding.suggestion}</small> : null}
                          </article>
                        ))}
                      </div>
                    )}
                    <div className="plugin-action-row">
                      <button className="ghost-btn" onClick={() => void runPluginAction("diagnose-save")}>{zh ? "保存诊断结果" : "Save diagnosis"}</button>
                      <button className="ghost-btn" onClick={() => plugin && void window.companion.openPluginDataDir(plugin.id)}>{zh ? "打开数据目录" : "Open data directory"}</button>
                    </div>
                  </div>
                ) : null}
              </section>
            </div>
          ) : null}

          {plugin ? (
            <section className="plugin-detail-section">
              <h3>{zh ? "事件与权限" : "Events & permissions"}</h3>
              <PluginPermissionsEditor plugin={plugin} onChange={onPatchPlugin} zh={zh} />
            </section>
          ) : null}

          {plugin ? (
            <section className="plugin-detail-section">
              <h3>{zh ? "最近运行" : "Recent runs"}</h3>
              {scriptLike ? <PluginRunList runs={runs} zh={zh} /> : <div className="empty">{zh ? "没有事件运行记录。这个插件由内置组件渲染。" : "No event runs. This plugin is rendered as a built-in widget."}</div>}
            </section>
          ) : null}
        </main>

        <aside className="plugin-detail-sidebar">
          {plugin ? (
            <section className="plugin-detail-section compact">
              <h3>{zh ? "启用状态" : "Activation"}</h3>
              <Toggle label={zh ? "启用" : "Enabled"} checked={plugin.enabled} onChange={enabled => onPatchPlugin({ enabled })} />
              <Toggle label={zh ? "信任脚本执行" : "Trusted for scripts"} checked={plugin.trusted === true} onChange={trusted => onPatchPlugin({ trusted })} />
              <p className="note">{zh ? "启用控制插件是否生效；信任只允许本地 Node.js 脚本执行。" : "Enabled controls plugin visibility/activity. Trusted only allows local Node.js script execution."}</p>
            </section>
          ) : null}

          {plugin?.resolvedDataDir ? (
            <section className="plugin-detail-section compact">
              <h3>{zh ? "数据目录" : "Data directory"}</h3>
              <p className="plugin-data-dir-path">{plugin.resolvedDataDir}</p>
              <button className="ghost-btn" onClick={() => void window.companion.openPluginDataDir(plugin.id)}>{zh ? "在文件管理器中打开" : "Open in explorer"}</button>
            </section>
          ) : null}

          {plugin && widgets.length ? (
            <section className="plugin-detail-section compact">
              <h3>{zh ? "组件" : "Widgets"}</h3>
              {widgets.map(widget => {
                const key = widget.positionKey ?? widget.type;
                const offset = plugin.widgetOffsets?.[key] ?? { x: 0, y: 0 };
                return (
                  <div key={key} className="plugin-widget-row">
                    <strong>{widget.label ?? widget.type}</strong>
                    <span>{widget.width ?? 172}×{widget.height ?? 78}</span>
                    <small>{zh ? "位置偏移" : "Offset"}: {offset.x}, {offset.y}</small>
                    <button className="ghost-btn" onClick={() => onPatchPlugin({ widgetOffsets: { ...(plugin.widgetOffsets ?? {}), [key]: { x: 735, y: -5 } } })}>{zh ? "重置位置" : "Reset position"}</button>
                  </div>
                );
              })}
              <p className="note">{zh ? "到「外观」打开位置编辑模式，可以在桌面上拖动组件。" : "Use Appearance → edit position mode to drag widgets on the desktop."}</p>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
