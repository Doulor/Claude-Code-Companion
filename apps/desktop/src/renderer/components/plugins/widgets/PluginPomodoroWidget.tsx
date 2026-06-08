import React, { useEffect, useState } from "react";
import type { CustomPlugin } from "../../../../shared/events";
import { useI18n } from "../../../useI18n";

export function PluginPomodoroWidget({ plugin, offset, preview = false, onBeginDrag }: { plugin: CustomPlugin; offset: { x: number; y: number }; preview?: boolean; onBeginDrag?: (event: React.PointerEvent | React.MouseEvent) => void }) {
  const { t, locale } = useI18n();
  const zh = locale === "zh";
  const workMinutes = readNumber(plugin.settings?.workMinutes, 25);
  const breakMinutes = readNumber(plugin.settings?.breakMinutes, 5);
  const showDragHandle = plugin.settings?.enableDragHandle !== false;
  const workSeconds = Math.max(1, Math.round(workMinutes * 60));
  const breakSeconds = Math.max(1, Math.round(breakMinutes * 60));
  const [mode, setMode] = useState<"work" | "break">("work");
  const [remaining, setRemaining] = useState(workSeconds);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (mode === "work") setRemaining(workSeconds);
    else setRemaining(breakSeconds);
    setRunning(false);
    setStarted(false);
  }, [workSeconds, breakSeconds, mode]);

  useEffect(() => {
    if (!running || preview) return;
    const timer = window.setInterval(() => {
      setRemaining(value => {
        if (value > 1) return value - 1;
        const nextMode = mode === "work" ? "break" : "work";
        setMode(nextMode);
        setStarted(false);
        return nextMode === "work" ? workSeconds : breakSeconds;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running, preview, mode, workSeconds, breakSeconds]);

  const total = mode === "work" ? workSeconds : breakSeconds;
  const progress = started ? Math.max(0, Math.min(1, 1 - remaining / total)) : 0;
  const minutes = Math.floor(remaining / 60).toString().padStart(2, "0");
  const seconds = Math.floor(remaining % 60).toString().padStart(2, "0");
  const stateLabel = !started ? (zh ? "待开始" : "Ready") : mode === "work" ? t("pomodoro.focus", "专注中") : t("pomodoro.break", "休息中");

  return (
    <section className={`plugin-widget pomodoro-widget ${mode} ${!started ? "ready" : ""} ${preview ? "preview" : ""}`} style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }} onPointerDownCapture={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
      {!preview && showDragHandle && onBeginDrag ? (
        <button
          className="pomodoro-drag-handle"
          title={zh ? "拖动番茄钟" : "Drag Pomodoro"}
          onPointerDown={e => { e.stopPropagation(); onBeginDrag(e); }}
          onMouseDown={e => { e.stopPropagation(); onBeginDrag(e); }}
        />
      ) : null}
      <div className="pomodoro-ring" style={{ background: `conic-gradient(var(--pomodoro-accent, var(--coral)) ${progress * 360}deg, rgba(36,29,23,.14) 0deg)` }}>
        <span>{mode === "work" ? workMinutes : breakMinutes}</span>
      </div>
      <div className="pomodoro-main">
        <strong>{minutes}:{seconds}</strong>
        <small>{stateLabel}</small>
      </div>
      {!preview ? (
        <div className="pomodoro-actions">
          <button className="pomodoro-start-btn" onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); setStarted(true); setRunning(value => !value); }}>{running ? t("common.pause", "暂停") : started ? t("common.start", "继续") : t("common.start", "开始")}</button>
          <button onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); setRunning(false); setStarted(false); setMode("work"); setRemaining(workSeconds); }}>{t("common.reset", "重置")}</button>
        </div>
      ) : null}
    </section>
  );
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
