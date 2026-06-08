import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import type { CompanionSettings, PluginManifest, ProviderId } from "../shared/events.js";
import { defaultSettings, PROVIDER_IDS } from "../shared/events.js";
import { readJsonWithBackup, writeJsonAtomic } from "./atomic-json.js";

const SETTINGS_VERSION = 1;

interface StoredSettings {
  version: number;
  data: Partial<CompanionSettings>;
  migratedAt?: string;
}

const POMODORO_PLUGIN_MANIFEST: PluginManifest = {
  name: "Pomodoro",
  nameZh: "番茄钟",
  description: "A desktop Pomodoro timer widget rendered by Clawd Companion.",
  descriptionZh: "显示在桌面 Clawd 旁边的专注计时器组件。",
  events: [],
  permissions: [],
  widgets: [{ type: "pomodoro", label: "Pomodoro", positionKey: "pomodoro", width: 172, height: 78 }],
  settings: [
    { key: "workMinutes", label: "Focus duration", type: "number", default: 25, min: 5, max: 60, step: 5, description: "Minutes per focus session" },
    { key: "breakMinutes", label: "Break duration", type: "number", default: 5, min: 1, max: 20, step: 1, description: "Minutes per break session" },
    { key: "enableDragHandle", label: "Show drag handle", type: "toggle", default: true, description: "Show a small handle at the top of the timer for quick dragging" }
  ],
  readme: "# Pomodoro\n\nA lightweight focus timer shown directly on your desktop next to Clawd.\n\n## How to use\n\n- Enable the plugin to show the widget.\n- Configure **Focus duration** and **Break duration** in this plugin page.\n- Use the widget buttons to start, pause, or reset the current round.\n- Turn on edit-position mode in Appearance to drag the widget to your preferred location.\n\n## Safety\n\nThis is a widget-only plugin. It does not listen to Claude Code events and does not require script permissions.",
  readmeZh: "# 番茄钟\n\n一个显示在桌面 Clawd 旁边的轻量专注计时器。\n\n## 如何使用\n\n- 启用插件即可显示番茄钟组件。\n- 在本插件详情页配置 **专注时长** 和 **休息时长**。\n- 在桌面组件上点击开始、暂停或重置当前轮次。\n- 到「外观」中打开位置编辑模式，可以拖动番茄钟到你喜欢的位置。\n\n## 安全说明\n\n这是一个纯组件插件。它不监听 Claude Code 事件，也不需要脚本权限。"
};

const POMODORO_PLUGIN_SCRIPT = "#!/usr/bin/env node\nprocess.exit(0);\n";

function getSettingsPath(appDataDir: string): string {
  return join(appDataDir, "settings.json");
}

export function loadSettings(appDataDir: string): CompanionSettings {
  const settingsPath = getSettingsPath(appDataDir);

  if (!existsSync(settingsPath)) {
    const created = withGeneratedToken({ ...defaultSettings });
    saveSettings(appDataDir, created);
    return created;
  }

  try {
    const parsed = readJsonWithBackup<unknown>(settingsPath);
    if (!parsed) throw new Error("settings_json_unreadable");

    // Check for versioned format
    if (parsed && typeof parsed === "object" && "version" in parsed) {
      const stored = parsed as StoredSettings;
      return migrateSettings(stored, appDataDir);
    }

    // Legacy format — wrap and save with version
    const legacyData = parsed as Partial<CompanionSettings>;
    const merged = mergeWithDefaults(legacyData, appDataDir);
    saveSettings(appDataDir, merged);
    return merged;
  } catch (err) {
    console.error("[SettingsManager] Failed to load settings, using defaults:", err);
    return { ...defaultSettings };
  }
}

export function saveSettings(appDataDir: string, settings: CompanionSettings): void {
  const settingsPath = getSettingsPath(appDataDir);
  ensureDir(appDataDir);

  const stored: StoredSettings = {
    version: SETTINGS_VERSION,
    data: settings,
    migratedAt: new Date().toISOString()
  };

  writeJsonAtomic(settingsPath, stored, 2);
}

function migrateSettings(stored: StoredSettings, appDataDir: string): CompanionSettings {
  let version = stored.version ?? 0;
  let data = { ...stored.data } as Partial<CompanionSettings>;
  let migrated = false;

  // Migration v0 → v1: ensure all default fields exist
  if (version < 1) {
    data = { ...defaultSettings, ...data };
    version = 1;
    migrated = true;
  }

  const result = mergeWithDefaults(data, appDataDir);
  if (result.token !== data.token) migrated = true;

  if (migrated) {
    const stored: StoredSettings = {
      version,
      data: result,
      migratedAt: new Date().toISOString()
    };
    writeJsonAtomic(getSettingsPath(appDataDir), stored, 2);
  }

  return result;
}

function mergeWithDefaults(data: Partial<CompanionSettings>, appDataDir?: string): CompanionSettings {
  const merged = withGeneratedToken({
    ...defaultSettings,
    ...data,
    positionOffsets: { ...defaultSettings.positionOffsets, ...(data.positionOffsets ?? {}) },
    zoneSizes: data.zoneSizes ?? defaultSettings.zoneSizes,
    sound: { ...defaultSettings.sound, ...(data.sound ?? {}) },
    idleAnim: data.idleAnim ? { ...defaultSettings.idleAnim, ...data.idleAnim } : defaultSettings.idleAnim,
    stateAnimations: { ...defaultSettings.stateAnimations, ...(data.stateAnimations ?? {}) },
    enabledSources: normalizeEnabledSources(data.enabledSources)
  });
  return migratePomodoroPlugin(merged, appDataDir);
}

function migratePomodoroPlugin(settings: CompanionSettings, appDataDir?: string): CompanionSettings {
  const plugins = settings.customPlugins ?? [];
  if (!settings.pomodoroEnabled || plugins.some(plugin => plugin.id === "market-pomodoro")) return settings;

  const pluginDir = appDataDir ? join(appDataDir, "plugins", "pomodoro") : "";
  const scriptPath = pluginDir ? join(pluginDir, "index.js") : "";
  if (pluginDir) {
    ensureDir(pluginDir);
    if (!existsSync(scriptPath)) writeFileSync(scriptPath, POMODORO_PLUGIN_SCRIPT);
    const manifestPath = scriptPath.replace(/\.[cm]?js$/i, ".manifest.json");
    if (!existsSync(manifestPath)) writeFileSync(manifestPath, JSON.stringify(POMODORO_PLUGIN_MANIFEST, null, 2));
  }

  return {
    ...settings,
    customPlugins: [
      ...plugins,
      {
        id: "market-pomodoro",
        marketId: "pomodoro",
        name: "Pomodoro",
        scriptPath,
        enabled: true,
        trusted: false,
        events: [],
        permissions: [],
        settings: {
          workMinutes: settings.pomodoroWorkMinutes ?? 25,
          breakMinutes: settings.pomodoroBreakMinutes ?? 5,
          enableDragHandle: true
        },
        widgetOffsets: {
          pomodoro: settings.positionOffsets?.pomodoro ?? defaultSettings.positionOffsets?.pomodoro ?? { x: 735, y: -5 }
        },
        manifest: POMODORO_PLUGIN_MANIFEST,
        version: "1.0.0",
        author: "Clawd",
        readme: POMODORO_PLUGIN_MANIFEST.readme,
        readmeZh: POMODORO_PLUGIN_MANIFEST.readmeZh
      }
    ]
  };
}

function normalizeEnabledSources(value: unknown): ProviderId[] {
  if (!Array.isArray(value)) return [...defaultSettings.enabledSources];
  const filtered = value.filter((entry): entry is ProviderId => typeof entry === "string" && (PROVIDER_IDS as readonly string[]).includes(entry));
  if (filtered.length === 0) return [...defaultSettings.enabledSources];
  // Preserve the default order so the UI is stable.
  return PROVIDER_IDS.filter((id) => filtered.includes(id));
}

function withGeneratedToken(settings: CompanionSettings): CompanionSettings {
  if (settings.token && settings.token !== defaultSettings.token) return settings;
  return { ...settings, token: randomBytes(24).toString("base64url") };
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
