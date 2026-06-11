import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, normalize, resolve, sep } from "node:path";
import type { CompanionEvent, CustomPlugin, PluginManifest, PluginRunRecord } from "../shared/events.js";

const RUN_LIMIT = 50;
const TIMEOUT_MS = 3000;
const OUTPUT_LIMIT = 4000;
const OUTPUT_BUFFER_LIMIT = 16_000;

export function readPluginManifest(scriptPath: string): PluginManifest | null {
  const manifestPath = scriptPath.replace(/\.[cm]?js$/i, ".manifest.json");
  if (!existsSync(manifestPath)) return null;
  const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as Partial<PluginManifest>;
  return {
    name: typeof parsed.name === "string" ? parsed.name : undefined,
    nameZh: typeof parsed.nameZh === "string" ? parsed.nameZh : undefined,
    description: typeof parsed.description === "string" ? parsed.description : undefined,
    descriptionZh: typeof parsed.descriptionZh === "string" ? parsed.descriptionZh : undefined,
    events: Array.isArray(parsed.events) ? parsed.events.filter((v): v is string => typeof v === "string") : [],
    permissions: Array.isArray(parsed.permissions) ? parsed.permissions.filter(isPluginPermission) : [],
    timeoutMs: typeof parsed.timeoutMs === "number" ? parsed.timeoutMs : undefined,
    settings: Array.isArray(parsed.settings) ? parsed.settings.filter(isValidSettingField) : undefined,
    assets: parsed.assets && typeof parsed.assets === "object" ? { sprites: typeof parsed.assets.sprites === "string" ? parsed.assets.sprites : undefined } : undefined,
    widgets: Array.isArray(parsed.widgets) ? parsed.widgets.filter(isValidWidgetDescriptor) : undefined,
    readme: typeof parsed.readme === "string" ? parsed.readme : undefined,
    readmeZh: typeof parsed.readmeZh === "string" ? parsed.readmeZh : undefined,
    devBadge: typeof parsed.devBadge === "boolean" ? parsed.devBadge : undefined
  };
}

export function normalizePlugin(plugin: CustomPlugin): CustomPlugin {
  if (!plugin.scriptPath || !existsSync(plugin.scriptPath)) return withDefaults(plugin);
  try {
    const manifest = readPluginManifest(plugin.scriptPath);
    if (!manifest) return withDefaults(plugin);
    return withDefaults({
      ...plugin,
      manifest,
      events: plugin.events.length > 0 ? plugin.events : manifest.events,
      permissions: plugin.permissions && plugin.permissions.length > 0 ? plugin.permissions : manifest.permissions,
      trusted: plugin.trusted === true
    });
  } catch (error) {
    return withDefaults({
      ...plugin,
      manifestError: error instanceof Error ? error.message : String(error)
    });
  }
}

function withDefaults(plugin: CustomPlugin): CustomPlugin {
  return {
    ...plugin,
    permissions: plugin.permissions ?? [],
    trusted: plugin.trusted === true,
    events: plugin.events ?? []
  };
}

function isPluginPermission(value: unknown): value is PluginManifest["permissions"][number] {
  return value === "event" || value === "network" || value === "filesystem" || value === "shell";
}

function isValidSettingField(value: unknown): value is NonNullable<PluginManifest["settings"]>[number] {
  if (!value || typeof value !== "object") return false;
  const raw = value as Record<string, unknown>;
  return typeof raw.key === "string" && typeof raw.label === "string" && typeof raw.type === "string"
    && ["text", "number", "toggle", "select", "color", "filepath"].includes(raw.type as string);
}

function isValidWidgetDescriptor(value: unknown): value is NonNullable<PluginManifest["widgets"]>[number] {
  if (!value || typeof value !== "object") return false;
  const raw = value as Record<string, unknown>;
  if (raw.type !== "pomodoro") return false;
  if (raw.positionKey !== undefined && (typeof raw.positionKey !== "string" || !/^[a-zA-Z0-9_-]{1,48}$/.test(raw.positionKey))) return false;
  for (const key of ["width", "height"] as const) {
    if (raw[key] !== undefined && (typeof raw[key] !== "number" || !Number.isFinite(raw[key]) || raw[key] < 40 || raw[key] > 600)) return false;
  }
  return true;
}

export function canRunPlugin(plugin: CustomPlugin, event: CompanionEvent): { ok: true } | { ok: false; reason: string } {
  if (!plugin.enabled) return { ok: false, reason: "disabled" };
  if (!plugin.trusted) return { ok: false, reason: "not trusted" };
  if (!plugin.scriptPath) return { ok: false, reason: "missing script path" };
  if (!existsSync(plugin.scriptPath)) return { ok: false, reason: "script not found" };
  if (!plugin.events.includes(event.event)) return { ok: false, reason: "event not selected" };
  return { ok: true };
}

export function runPlugin(plugin: CustomPlugin, event: CompanionEvent, onRecord: (record: PluginRunRecord) => void, dataDir?: string, force?: boolean, action?: string): void {
  const startedAt = Date.now();
  const permissionSet = new Set(plugin.permissions ?? []);
  const pluginDir = dirname(plugin.scriptPath);
  const pluginDataDir = dataDir ? join(dataDir, plugin.id) : join(pluginDir, "data");
  if (!existsSync(pluginDataDir)) mkdirSync(pluginDataDir, { recursive: true });
  const child = spawn(process.execPath, [plugin.scriptPath], {
    cwd: pluginDir,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    env: {
      ...process.env,
      CLAWD_PLUGIN_PERMISSIONS: Array.from(permissionSet).join(","),
      CLAWD_PLUGIN_EVENT: event.event,
      CLAWD_PLUGIN_SETTINGS: JSON.stringify(plugin.settings ?? {}),
      CLAWD_PLUGIN_DIR: pluginDir,
      CLAWD_PLUGIN_DATA_DIR: pluginDataDir,
      ...(force ? { CLAWD_PLUGIN_FORCE: "1" } : {}),
      ...(action ? { CLAWD_PLUGIN_ACTION: action } : {})
    }
  });

  let stdout = "";
  let stderr = "";
  let timedOut = false;
  const timeoutMs = plugin.manifest?.timeoutMs ?? TIMEOUT_MS;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, timeoutMs);

  child.stdout.on("data", data => { stdout = appendOutput(stdout, String(data)); });
  child.stderr.on("data", data => { stderr = appendOutput(stderr, String(data)); });
  child.on("error", err => {
    clearTimeout(timeout);
    onRecord(makeRecord(plugin, event, startedAt, null, false, stdout, stderr || err.message));
  });
  child.on("close", code => {
    clearTimeout(timeout);
    onRecord(makeRecord(plugin, event, startedAt, code, timedOut, stdout, stderr));
  });
  child.stdin.end(JSON.stringify(event));
}

function appendOutput(current: string, chunk: string): string {
  const next = current + chunk;
  return next.length > OUTPUT_BUFFER_LIMIT ? next.slice(-OUTPUT_BUFFER_LIMIT) : next;
}

function makeRecord(
  plugin: CustomPlugin,
  event: CompanionEvent,
  startedAt: number,
  exitCode: number | null,
  timedOut: boolean,
  stdout: string,
  stderr: string
): PluginRunRecord {
  return {
    id: `${plugin.id}-${startedAt}`,
    pluginId: plugin.id,
    pluginName: plugin.name,
    eventType: event.event,
    startedAt,
    durationMs: Date.now() - startedAt,
    exitCode,
    timedOut,
    stdout: stdout.trim().slice(-OUTPUT_LIMIT),
    stderr: stderr.trim().slice(-OUTPUT_LIMIT)
  };
}

export function appendPluginRun(records: PluginRunRecord[], record: PluginRunRecord): PluginRunRecord[] {
  return [...records, record].slice(-RUN_LIMIT);
}

export function resolvePluginAssets(plugin: CustomPlugin): { spritesCss?: string } {
  if (!plugin.trusted || !plugin.enabled || !plugin.scriptPath || !plugin.manifest?.assets?.sprites) return {};
  const dir = resolve(dirname(plugin.scriptPath));
  const cssPath = resolve(dir, plugin.manifest.assets.sprites);
  if (!existsSync(cssPath)) return {};
  if (!cssPath.startsWith(dir + sep) && cssPath !== dir) return {};
  return { spritesCss: cssPath };
}
