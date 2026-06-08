import { existsSync, readFileSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "electron";
import type { SoundSettings } from "../shared/events.js";

// app.getAppPath() returns the project root in dev and the asar root in
// production. In either case build/sounds/ sits directly under it.
const appRoot = app.getAppPath();
const devSoundDir = join(appRoot, "build", "sounds");
const prodSoundDir = join(process.resourcesPath, "build", "sounds");

export function builtInPath(name: "done" | "error" | "permission" | "session-start"): string {
  const file = `${name}.wav`;
  const devPath = join(devSoundDir, file);
  if (existsSync(devPath)) return devPath;
  const prodPath = join(prodSoundDir, file);
  if (existsSync(prodPath)) return prodPath;
  // Last resort: relative to this file
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "..", "build", "sounds", file);
}

function resolveFile(override: string | null, name: "done" | "error" | "permission" | "session-start"): string | null {
  if (override) {
    if (isAbsolute(override) && existsSync(override)) return override;
    console.warn(`[clawd-sound] override not found: ${override}`);
    return null;
  }
  const builtIn = builtInPath(name);
  if (existsSync(builtIn)) return builtIn;
  console.warn(`[clawd-sound] built-in not found: ${builtIn}`);
  return null;
}

// Simple LRU: path → data URL, evict oldest when exceeding MAX_CACHE
const dataUrlCache = new Map<string, string>();
const MAX_CACHE = 8;

function isAudioPath(path: string): boolean {
  return /\.(wav|mp3|ogg|flac)$/i.test(path);
}

export function fileToDataUrl(path: string): string | null {
  if (!isAudioPath(path)) return null;
  const cached = dataUrlCache.get(path);
  if (cached) {
    // Move to end (most recently used)
    dataUrlCache.delete(path);
    dataUrlCache.set(path, cached);
    return cached;
  }
  try {
    const buf = readFileSync(path);
    const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
    const mime = ext === ".mp3" ? "audio/mpeg" : ext === ".ogg" ? "audio/ogg" : ext === ".flac" ? "audio/flac" : "audio/wav";
    const url = `data:${mime};base64,${buf.toString("base64")}`;
    // Evict oldest entry if cache is full
    if (dataUrlCache.size >= MAX_CACHE) {
      const oldest = dataUrlCache.keys().next().value;
      if (oldest !== undefined) dataUrlCache.delete(oldest);
    }
    dataUrlCache.set(path, url);
    return url;
  } catch (err) {
    console.error(`[clawd-sound] readFileSync failed for ${path}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Resolve sound file for an event and return its data URL (for renderer Audio playback) */
export function getSoundDataUrl(event: string, settings: SoundSettings): string | null {
  if (!settings.enabled) return null;
  const eventOverride = settings.eventFiles?.[event as keyof NonNullable<SoundSettings["eventFiles"]>] ?? null;
  let file: string | null = null;
  if (eventOverride) {
    file = resolveFile(eventOverride, "done");
  } else if (event === "done") {
    file = resolveFile(settings.fileDone, "done");
  } else if (event === "error") {
    file = resolveFile(settings.fileError, "error");
  } else if (event === "permission_wait") {
    file = resolveFile(settings.filePermission, "permission");
  } else if (event === "session_start") {
    file = resolveFile(settings.fileSessionStart, "session-start");
  }
  if (!file) return null;
  return fileToDataUrl(file);
}

/** Get data URL for a built-in sound (for preview) */
export function previewSoundDataUrl(name: "done" | "error" | "permission" | "session-start"): { ok: boolean; dataUrl?: string; error?: string } {
  const file = resolveFile(null, name);
  if (!file) return { ok: false, error: "内置音效文件未找到" };
  const url = fileToDataUrl(file);
  if (!url) return { ok: false, error: "读取文件失败" };
  return { ok: true, dataUrl: url };
}
