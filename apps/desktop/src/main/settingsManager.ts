import { existsSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import type { CompanionSettings, ProviderId } from "../shared/events.js";
import { defaultSettings, PROVIDER_IDS } from "../shared/events.js";
import { readJsonWithBackup, writeJsonAtomic } from "./atomic-json.js";

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

  const result = mergeWithDefaults(data);
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

function mergeWithDefaults(data: Partial<CompanionSettings>): CompanionSettings {
  return withGeneratedToken({
    ...defaultSettings,
    ...data,
    positionOffsets: { ...defaultSettings.positionOffsets, ...(data.positionOffsets ?? {}) },
    zoneSizes: data.zoneSizes ?? defaultSettings.zoneSizes,
    sound: { ...defaultSettings.sound, ...(data.sound ?? {}) },
    idleAnim: data.idleAnim ? { ...defaultSettings.idleAnim, ...data.idleAnim } : defaultSettings.idleAnim,
    stateAnimations: { ...defaultSettings.stateAnimations, ...(data.stateAnimations ?? {}) },
    enabledSources: normalizeEnabledSources(data.enabledSources)
  });
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
