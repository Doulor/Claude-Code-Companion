import React, { useEffect, useState } from "react";
import type { DoctorReport } from "../../shared/events";
import { useI18n } from "../useI18n";

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return <span className={ok ? "doctor-pill ok" : "doctor-pill bad"}>{label}</span>;
}

export function DoctorPanel() {
  const { t } = useI18n();
  const [report, setReport] = useState<DoctorReport | null>(null);
  const refresh = () => window.companion.getDoctorReport().then(setReport).catch(() => setReport(null));

  useEffect(() => {
    void refresh();
  }, []);

  if (!report) {
    return <div className="panel-group-card"><h3 className="panel-title">{t("doctor.title", "诊断中心")}</h3><div className="empty">{t("doctor.empty", "暂无诊断数据")}</div></div>;
  }

  const rows = [
    [t("doctor.eventServer", "事件服务"), report.connection.serverListening ? `${t("doctor.listening", "监听")} ${report.connection.port}` : (report.connection.error ?? t("status.notListening", "未监听")), report.connection.serverListening],
    [t("doctor.recentConnection", "最近连接"), report.connection.connected ? t("doctor.eventWithin90s", "90 秒内收到事件") : t("doctor.waitingEvent", "等待 Claude Code 事件"), report.connection.connected],
    [t("doctor.hooks", "Hook 配置"), report.hooks.installed ? t("hooks.installed", "已安装") : `${t("doctor.missing", "缺少")} ${report.hooks.missingEvents.length} ${t("common.items", "项")}`, report.hooks.installed],
    [t("doctor.hookCommand", "Hook 命令"), report.hooks.commandMatches ? t("doctor.commandMatches", "匹配当前 forwarder") : t("doctor.needsRepair", "需要修复"), report.hooks.commandMatches],
    ["Forwarder", report.forwarder.exists ? report.forwarder.expectedPath : t("doctor.fileMissing", "文件不存在"), report.forwarder.exists],
    [t("doctor.autoStart", "自动启动"), report.forwarder.autoStartMarkerExists ? t("doctor.enabled", "已开启") : t("doctor.disabled", "未开启"), true]
  ] as const;

  return (
    <div className="panel-group-card">
      <div className="panel-header">
        <h3 className="panel-title">{t("doctor.title", "诊断中心")}</h3>
        <button className="ghost-btn" onClick={refresh}>{t("doctor.recheck", "重新检查")}</button>
      </div>
      <div className="doctor-grid">
        {rows.map(([name, value, ok]) => (
          <div key={name} className="doctor-row">
            <strong>{name}</strong>
            <p title={String(value)}>{value}</p>
            <StatusPill ok={ok} label={ok ? "OK" : "Check"} />
          </div>
        ))}
      </div>
      <div className="panel-divider" />
      <div className="doctor-summary">
        <div><strong>{t("doctor.version", "版本")}</strong><span>{report.appVersion}</span></div>
        <div><strong>{t("status.recentEvent", "最近事件")}</strong><span>{report.recent.lastEventTitle ?? t("common.none", "暂无")}</span></div>
        <div><strong>{t("doctor.generatedAt", "生成时间")}</strong><span>{new Date(report.generatedAt).toLocaleString()}</span></div>
      </div>
      {!report.hooks.installed && <p className="note">{t("doctor.hookHint", "可在上方 Hook 区域使用安装/修复按钮重新配置 Claude Code hooks。")}</p>}
    </div>
  );
}
