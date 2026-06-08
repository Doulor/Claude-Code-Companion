import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { CompanionSettings } from "../shared/events.js";
import { defaultSettings } from "../shared/events.js";

const SETTINGS_VERSION = 1;

interface StoredSettings {
  version: number;
  data: Partial<CompanionSettings>;
  migratedAt?: string;
}

function getSettingsPath(appDataDir: string): string {
  return join(appDataDir, "settings.json");
}

export function loadSettings(appDataDir: string): CompanionSettings {
  const settingsPath = getSettingsPath(appDataDir);

  if (!existsSync(settingsPath)) {
    return { ...defaultSettings };
  }

  try {
    const raw = readFileSync(settingsPath, "utf8");
    const parsed = JSON.parse(raw);

    // Check for versioned format
    if (parsed && typeof parsed === "object" && "version" in parsed) {
      const stored = parsed as StoredSettings;
      return migrateSettings(stored, appDataDir);
    }

    // Legacy format — wrap and save with version
    const legacyData = parsed as Partial<CompanionSettings>;
    const merged = mergeWithDefaults(legacyData);
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

  writeFileSync(settingsPath, JSON.stringify(stored, null, 2));
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

  const result = mergeWithDefaults(data);

  if (migrated) {
    const stored: StoredSettings = {
      version,
      data: result,
      migratedAt: new Date().toISOString()
    };
    writeFileSync(getSettingsPath(appDataDir), JSON.stringify(stored, null, 2));
  }

  return result;
}

function mergeWithDefaults(data: Partial<CompanionSettings>): CompanionSettings {
  return {
    ...defaultSettings,
    ...data,
    positionOffsets: { ...defaultSettings.positionOffsets, ...(data.positionOffsets ?? {}) },
    zoneSizes: data.zoneSizes ?? defaultSettings.zoneSizes,
    sound: { ...defaultSettings.sound, ...(data.sound ?? {}) },
    idleAnim: data.idleAnim ? { ...defaultSettings.idleAnim, ...data.idleAnim } : defaultSettings.idleAnim,
    stateAnimations: { ...defaultSettings.stateAnimations, ...(data.stateAnimations ?? {}) }
  };
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
