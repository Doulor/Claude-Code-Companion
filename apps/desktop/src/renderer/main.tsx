import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bell, Bot, Check, Code2, Eye, EyeOff, Gauge, MousePointer2, Play, Power, Radio, RotateCcw, Save, Search, Settings, Shield, Terminal, Wrench } from "lucide-react";
import type { CompanionEvent, CompanionSettings, PetState, PrivacyMode } from "../shared/events";
import { defaultSettings, stateFromEvent } from "../shared/events";
import "./styles.css";

const stateCopy: Record<PetState, { label: string; line: string }> = {
  idle: { label: "待机", line: "Clawd 在桌面边缘小憩" },
  thinking: { label: "思考中", line: "正在整理上下文" },
  tool_read: { label: "读取", line: "正在看文件" },
  tool_edit: { label: "编辑", line: "正在改代码" },
  tool_bash: { label: "终端", line: "正在执行命令" },
  tool_search: { label: "搜索", line: "正在检索线索" },
  waiting_permission: { label: "等待确认", line: "需要你处理一个确认" },
  done: { label: "完成", line: "这一轮已经处理完" },
  error: { label: "出错", line: "刚才有一步失败了" }
};

const sampleEvents: CompanionEvent[] = [
  makeEvent("prompt_submit", "manual", "收到新任务", "Clawd 开始陪你盯这一轮处理。"),
  makeEvent("tool_start", "manual", "正在编辑文件", "Edit 工具已开始。", "Edit"),
  makeEvent("tool_start", "manual", "正在跑命令", "Bash 工具已开始。", "Bash"),
  makeEvent("permission_wait", "manual", "需要确认", "Claude Code 正在等待你的许可。"),
  makeEvent("done", "manual", "处理完成", "Claude Code 这一轮已经结束。"),
  makeEvent("error", "manual", "执行失败", "有一个工具调用没有成功。")
];

function makeEvent(event: CompanionEvent["event"], source: CompanionEvent["source"], title: string, message: string, tool?: CompanionEvent["tool"]): CompanionEvent {
  return {
    id: crypto.randomUUID(),
    source,
    event,
    tool,
    title,
    message,
    timestamp: Date.now()
  };
}

function useCompanion() {
  const [settings, setSettings] = useState<CompanionSettings>(defaultSettings);
  const [events, setEvents] = useState<CompanionEvent[]>([]);
  const [currentEvent, setCurrentEvent] = useState<CompanionEvent | null>(null);
  const [petState, setPetState] = useState<PetState>("idle");

  useEffect(() => {
    window.companion.getSettings().then(setSettings);
    const offSettings = window.companion.onSettings(setSettings);
    const offEvent = window.companion.onEvent(event => {
      setEvents(previous => [event, ...previous].slice(0, 24));
      setCurrentEvent(event);
      setPetState(stateFromEvent(event));
      const timeout = event.event === "done" || event.event === "error" ? 5200 : 8000;
      window.setTimeout(() => {
        setPetState(current => current === stateFromEvent(event) ? "idle" : current);
        setCurrentEvent(current => current?.id === event.id ? null : current);
      }, timeout);
    });
    return () => {
      offSettings();
      offEvent();
    };
  }, []);

  async function updateSettings(next: Partial<CompanionSettings>) {
    const saved = await window.companion.saveSettings(next);
    setSettings(saved);
  }

  return { settings, updateSettings, events, currentEvent, petState };
}

function PetApp() {
  const { settings, currentEvent, petState } = useCompanion();
  const [dragOrigin, setDragOrigin] = useState<{ pointerX: number; pointerY: number; windowX: number; windowY: number } | null>(null);

  function beginDrag(event: React.PointerEvent) {
    if (settings.clickThrough) return;
    setDragOrigin({ pointerX: event.screenX, pointerY: event.screenY, windowX: window.screenX, windowY: window.screenY });
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function drag(event: React.PointerEvent) {
    if (!dragOrigin) return;
    void window.companion.dragPetTo(dragOrigin.windowX + event.screenX - dragOrigin.pointerX, dragOrigin.windowY + event.screenY - dragOrigin.pointerY);
  }

  return (
    <main className="pet-stage" onPointerDown={beginDrag} onPointerMove={drag} onPointerUp={() => setDragOrigin(null)}>
      {settings.showBubbles && currentEvent ? <Bubble event={currentEvent} state={petState} /> : null}
      <Clawd state={petState} scale={settings.petScale} />
      <button className="pet-gear" title="打开配置" onClick={() => window.companion.openSettings()}><Settings size={17} /></button>
    </main>
  );
}

function Bubble({ event, state }: { event: CompanionEvent; state: PetState }) {
  return (
    <section className={`bubble bubble-${state}`}>
      <div className="bubble-kicker">{stateCopy[state].label}</div>
      <strong>{event.title}</strong>
      <span>{event.message}</span>
    </section>
  );
}

function Clawd({ state, scale }: { state: PetState; scale: number }) {
  return (
    <section className={`clawd clawd-${state}`} style={{ transform: `scale(${scale})` }} aria-label={`Clawd ${stateCopy[state].label}`}>
      <div className="aura" />
      <div className="antenna antenna-left" />
      <div className="antenna antenna-right" />
      <div className="head">
        <div className="tuft" />
        <div className="eye eye-left" />
        <div className="eye eye-right" />
        <div className="cheek cheek-left" />
        <div className="cheek cheek-right" />
        <div className="mouth" />
        <StateProp state={state} />
      </div>
      <div className="body">
        <div className="badge"><Bot size={22} /></div>
        <div className="arm arm-left" />
        <div className="arm arm-right" />
      </div>
      <div className="foot foot-left" />
      <div className="foot foot-right" />
      <div className="shadow" />
    </section>
  );
}

function StateProp({ state }: { state: PetState }) {
  if (state === "tool_bash") return <Terminal className="state-prop terminal-prop" size={30} />;
  if (state === "tool_edit") return <Code2 className="state-prop edit-prop" size={30} />;
  if (state === "tool_read" || state === "tool_search") return <Search className="state-prop search-prop" size={30} />;
  if (state === "waiting_permission") return <Bell className="state-prop bell-prop" size={30} />;
  if (state === "done") return <Check className="state-prop check-prop" size={30} />;
  if (state === "error") return <Wrench className="state-prop error-prop" size={30} />;
  return null;
}

function SettingsApp() {
  const { settings, updateSettings, events, petState } = useCompanion();
  const hookCommand = useMemo(() => `node ${process.cwd().replaceAll("\\", "/")}/dist/hook-forwarder/index.js`, []);

  async function test(event: CompanionEvent) {
    await window.companion.sendTestEvent({ ...event, id: crypto.randomUUID(), timestamp: Date.now() });
  }

  return (
    <main className="settings-shell">
      <aside className="rail">
        <div className="mark"><Bot size={28} /></div>
        <button className="rail-button active" title="配置"><Gauge size={20} /></button>
        <button className="rail-button" title="隐私"><Shield size={20} /></button>
        <button className="rail-button" title="事件"><Radio size={20} /></button>
      </aside>

      <section className="hero-panel">
        <div>
          <p className="eyebrow">Claude Code Companion</p>
          <h1>Clawd 正在监听本地 Claude Code 事件</h1>
          <p className="subtle">透明桌宠、工具状态、完成提醒和可控隐私，都在这一个本地应用里。</p>
        </div>
        <div className="mini-stage"><Clawd state={petState} scale={0.72} /></div>
      </section>

      <section className="content-grid">
        <Panel title="连接" icon={<Radio size={18} />}>
          <Field label="事件端口">
            <input value={settings.port} onChange={event => updateSettings({ port: Number(event.target.value) || defaultSettings.port })} />
          </Field>
          <Field label="本地 token">
            <input value={settings.token} onChange={event => updateSettings({ token: event.target.value })} />
          </Field>
          <div className="command-box">
            <span>Hook forwarder</span>
            <code>{hookCommand}</code>
          </div>
        </Panel>

        <Panel title="桌宠行为" icon={<MousePointer2 size={18} />}>
          <Toggle label="始终置顶" checked={settings.alwaysOnTop} onChange={alwaysOnTop => updateSettings({ alwaysOnTop })} />
          <Toggle label="点击穿透" checked={settings.clickThrough} onChange={clickThrough => updateSettings({ clickThrough })} />
          <Toggle label="显示气泡" checked={settings.showBubbles} onChange={showBubbles => updateSettings({ showBubbles })} />
          <label className="slider-row">
            <span>尺寸</span>
            <input type="range" min="0.75" max="1.25" step="0.05" value={settings.petScale} onChange={event => updateSettings({ petScale: Number(event.target.value) })} />
            <b>{Math.round(settings.petScale * 100)}%</b>
          </label>
        </Panel>

        <Panel title="隐私模式" icon={<Shield size={18} />}>
          <Segmented value={settings.privacyMode} onChange={privacyMode => updateSettings({ privacyMode })} />
          <p className="note">安全模式只显示工具类型和状态；标准模式可显示文件名；详细模式预留给后续摘要，不会默认展示完整 prompt 或命令输出。</p>
        </Panel>

        <Panel title="测试事件" icon={<Play size={18} />}>
          <div className="test-grid">
            {sampleEvents.map(event => <button key={`${event.event}-${event.tool ?? "x"}`} onClick={() => test(event)}>{event.title}</button>)}
          </div>
        </Panel>

        <Panel title="最近事件" icon={<Bell size={18} />} wide>
          <div className="event-list">
            {events.length === 0 ? <div className="empty">还没有收到事件。可以先点测试事件，或配置 Claude Code hooks。</div> : events.map(event => (
              <article key={event.id} className="event-row">
                <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                <strong>{event.title}</strong>
                <p>{event.message}</p>
              </article>
            ))}
          </div>
        </Panel>
      </section>
    </main>
  );
}

function Panel({ title, icon, wide, children }: { title: string; icon: React.ReactNode; wide?: boolean; children: React.ReactNode }) {
  return <section className={`panel ${wide ? "wide" : ""}`}><header>{icon}<h2>{title}</h2></header>{children}</section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button className={`toggle ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}>
      {checked ? <Eye size={17} /> : <EyeOff size={17} />}
      <span>{label}</span>
      <i />
    </button>
  );
}

function Segmented({ value, onChange }: { value: PrivacyMode; onChange: (value: PrivacyMode) => void }) {
  const items: Array<{ value: PrivacyMode; label: string }> = [
    { value: "safe", label: "安全" },
    { value: "standard", label: "标准" },
    { value: "detailed", label: "详细" }
  ];
  return <div className="segmented">{items.map(item => <button key={item.value} className={value === item.value ? "active" : ""} onClick={() => onChange(item.value)}>{item.label}</button>)}</div>;
}

function App() {
  const route = window.location.hash.replace("#/", "") || "settings";
  return route === "pet" ? <PetApp /> : <SettingsApp />;
}

createRoot(document.getElementById("root")!).render(<App />);
