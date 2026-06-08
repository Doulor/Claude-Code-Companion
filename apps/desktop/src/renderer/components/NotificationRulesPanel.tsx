import React, { useEffect, useMemo, useState } from "react";
import type { CompanionEventType, CompanionSettings, NotificationRule } from "../../shared/events";
import { useI18n } from "../useI18n";
import { Slider } from "./ui/Slider";
import { Toggle } from "./ui/Toggle";

type BuiltInSound = "done" | "error" | "permission" | "session-start";

const eventTypes: CompanionEventType[] = ["session_start", "tool_start", "tool_end", "done", "error", "permission_wait", "notification", "git_operation"];
const builtInByEvent: Partial<Record<CompanionEventType, BuiltInSound>> = {
  session_start: "session-start",
  done: "done",
  error: "error",
  permission_wait: "permission"
};

export function NotificationRulesPanel({ settings, updateSettings }: { settings: CompanionSettings; updateSettings: (s: Partial<CompanionSettings>) => void }) {
  const { t } = useI18n();
  const rules: NotificationRule[] = settings.notificationRules ?? [];
  const sound = settings.sound;
  const enabled = settings.notificationsEnabled || settings.doneSound;
  const [status, setStatus] = useState<Record<string, { ok: boolean; error?: string } | null>>({});
  const [defaultPaths, setDefaultPaths] = useState<Record<BuiltInSound, string> | null>(null);

  useEffect(() => {
    void window.companion.getDefaultSoundPaths().then(setDefaultPaths).catch(() => setDefaultPaths(null));
  }, []);

  const eventLabels: Record<CompanionEventType, string> = {
    session_start: t("notifRules.sessionStart", "Session start"),
    tool_start: t("notifRules.toolStart", "Tool start"),
    tool_end: t("notifRules.toolEnd", "Tool end"),
    done: t("notifRules.done", "Done"),
    error: t("notifRules.error", "Error"),
    permission_wait: t("notifRules.permission", "Permission request"),
    notification: t("notifRules.notification", "Notification"),
    git_operation: t("notifRules.gitOperation", "Git operation"),
    prompt_submit: t("notifRules.promptSubmit", "Prompt submit"),
    heartbeat: t("notifRules.heartbeat", "Heartbeat")
  };

  const defaultRule = (eventType: CompanionEventType): NotificationRule => ({
    eventType,
    enabled: true,
    systemNotification: eventType === "done" ? settings.doneSound : false,
    playSound: false,
    showBubble: true
  });

  const rulesByEvent = useMemo(() => new Map(rules.map(rule => [rule.eventType, rule])), [rules]);
  const updateRule = (eventType: CompanionEventType, patch: Partial<NotificationRule>) => {
    const existing = rulesByEvent.get(eventType) ?? defaultRule(eventType);
    updateSettings({
      notificationRules: [
        ...rules.filter(rule => rule.eventType !== eventType),
        { ...existing, ...patch, eventType, enabled: true }
      ]
    });
  };

  const updateSound = (patch: Partial<typeof sound>) => updateSettings({ sound: { ...sound, ...patch } });

  const setDefaultSound = (eventType: CompanionEventType) => {
    const next = { ...(sound.eventFiles ?? {}) };
    delete next[eventType];
    updateSound({ eventFiles: next });
    updateRule(eventType, { playSound: true });
  };

  const pickEventSound = async (eventType: CompanionEventType) => {
    const file = await window.companion.pickSoundFile();
    if (file !== null) {
      updateSound({ eventFiles: { ...(sound.eventFiles ?? {}), [eventType]: file } });
      updateRule(eventType, { playSound: true });
    }
  };

  const clearEventSound = (eventType: CompanionEventType) => {
    const next = { ...(sound.eventFiles ?? {}) };
    delete next[eventType];
    updateSound({ eventFiles: next });
    if (!builtInByEvent[eventType]) updateRule(eventType, { playSound: false });
  };

  const previewEventSound = async (eventType: CompanionEventType) => {
    const builtIn = builtInByEvent[eventType];
    const customFile = sound.eventFiles?.[eventType];
    if (!builtIn && !customFile) return;
    setStatus(prev => ({ ...prev, [eventType]: null }));
    const result = customFile ? await window.companion.previewSoundFile(customFile) : builtIn ? await window.companion.previewSound(builtIn) : { ok: false, error: t("sound.noAudio", "没有可用音频") };
    if (result.ok && result.dataUrl) {
      try {
        const audio = new Audio(result.dataUrl);
        audio.volume = sound.volume;
        await audio.play();
        setStatus(prev => ({ ...prev, [eventType]: { ok: true } }));
      } catch {
        setStatus(prev => ({ ...prev, [eventType]: { ok: false, error: t("sound.failed", "播放失败") } }));
      }
    } else {
      setStatus(prev => ({ ...prev, [eventType]: result }));
    }
    setTimeout(() => setStatus(prev => ({ ...prev, [eventType]: null })), 3000);
  };

  const pathLines = eventTypes
    .filter(eventType => rulesByEvent.get(eventType)?.playSound || sound.eventFiles?.[eventType])
    .map(eventType => {
      const customFile = sound.eventFiles?.[eventType];
      const builtIn = builtInByEvent[eventType];
      const path = customFile ?? (builtIn && defaultPaths ? defaultPaths[builtIn] : null);
      return path ? { eventType, path, custom: Boolean(customFile) } : null;
    })
    .filter((item): item is { eventType: CompanionEventType; path: string; custom: boolean } => Boolean(item));

  return (
    <div className="notification-sound-panel">
      <div className="notification-master-row">
        <Toggle label={t("notifications.masterSwitch", "通知和音效")} checked={enabled} onChange={notificationsEnabled => updateSettings({ notificationsEnabled, doneSound: notificationsEnabled ? settings.doneSound : false })} />
        <p className="note">{t("notifications.masterHint", "开启后可按事件分别控制系统通知、播放音效和自定义音频。")}</p>
      </div>

      {enabled ? (
        <>
          <div className="notification-global-grid">
            <Toggle label={t("sound.enable", "启用音效")} checked={sound.enabled} onChange={soundEnabled => updateSound({ enabled: soundEnabled })} />
            <Slider label={t("sound.volume", "音量")} min={0} max={1} step={0.05} value={sound.volume} format={v => `${Math.round(v * 100)}%`} onChange={volume => updateSound({ volume })} />
          </div>

          <div className="notification-rules-table">
            <div className="notification-rules-head">
              <span>{t("notifications.eventType", "事件类型")}</span>
              <span>{t("notifications.systemNotification", "系统通知")}</span>
              <span>{t("notifications.playSound", "播放音效")}</span>
              <span>{t("sound.audioSource", "音频来源")}</span>
            </div>
            {eventTypes.map(eventType => {
              const rule = rulesByEvent.get(eventType) ?? defaultRule(eventType);
              const builtIn = builtInByEvent[eventType];
              const customFile = sound.eventFiles?.[eventType];
              const hasAudio = Boolean(customFile || builtIn);
              return (
                <div key={eventType} className="notification-rule-row">
                  <strong>{eventLabels[eventType]}</strong>
                  <Toggle label="" checked={rule.systemNotification} onChange={systemNotification => updateRule(eventType, { systemNotification })} />
                  <Toggle label="" checked={rule.playSound && hasAudio} onChange={playSound => {
                    if (playSound && !hasAudio) void pickEventSound(eventType);
                    else updateRule(eventType, { playSound });
                  }} />
                  <div className="notification-sound-actions">
                    <span className={`sound-file-pill ${customFile ? "custom" : builtIn ? "default" : "empty"}`}>
                      {customFile ? t("sound.custom", "自定义") : builtIn ? t("sound.default", "默认") : t("sound.noDefault", "无默认")}
                    </span>
                    {builtIn && customFile ? <button className="ghost-btn" onClick={() => setDefaultSound(eventType)}>{t("sound.useDefault", "使用默认")}</button> : null}
                    <button className="ghost-btn" onClick={() => pickEventSound(eventType)}>{customFile ? t("sound.changeFile", "更换") : t("sound.chooseFile", "选择文件")}</button>
                    {hasAudio ? <button className="ghost-btn" onClick={() => previewEventSound(eventType)}>{t("sound.preview", "试听")}</button> : null}
                    {customFile ? <button className="ghost-btn danger" onClick={() => clearEventSound(eventType)}>{t("sound.clear", "清除")}</button> : null}
                    {status[eventType] ? <span className={`sound-status ${status[eventType]!.ok ? "ok" : "err"}`}>{status[eventType]!.ok ? t("sound.played", "已播放") : status[eventType]!.error ?? t("common.failed", "失败")}</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="note">{t("sound.hint", "完成、错误、权限请求、会话开始有内置音效；其他事件需要选择自定义音频才会播放。")}</p>
          {pathLines.length > 0 ? (
            <div className="sound-path-tips">
              <span>{t("sound.pathTips", "当前音频路径")}</span>
              {pathLines.map(item => (
                <small key={item.eventType}>{eventLabels[item.eventType]} · {item.custom ? t("sound.custom", "自定义") : t("sound.default", "默认")}：{item.path}</small>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
