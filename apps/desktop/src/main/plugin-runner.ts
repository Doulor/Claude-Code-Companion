import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname } from "node:path";
import type { CompanionEvent, CustomPlugin, PluginManifest, PluginRunRecord } from "../shared/events.js";

const RUN_LIMIT = 50;
const TIMEOUT_MS = 3000;

export function readPluginManifest(scriptPath: string): PluginManifest | null {
  const manifestPath = scriptPath.replace(/\.[cm]?js$/i, ".manifest.json");
  if (!existsSync(manifestPath)) return null;
  const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as Partial<PluginManifest>;
  return {
    name: typeof parsed.name === "string" ? parsed.name : undefined,
    description: typeof parsed.description === "string" ? parsed.description : undefined,
    events: Array.isArray(parsed.events) ? parsed.events.filter((v): v is string => typeof v === "string") : [],
    permissions: Array.isArray(parsed.permissions) ? parsed.permissions.filter(isPluginPermission) : [],
    timeoutMs: typeof parsed.timeoutMs === "number" ? parsed.timeoutMs : undefined
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
  } catch {
    return withDefaults(plugin);
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

export function canRunPlugin(plugin: CustomPlugin, event: CompanionEvent): { ok: true } | { ok: false; reason: string } {
  if (!plugin.enabled) return { ok: false, reason: "disabled" };
  if (!plugin.trusted) return { ok: false, reason: "not trusted" };
  if (!plugin.scriptPath) return { ok: false, reason: "missing script path" };
  if (!existsSync(plugin.scriptPath)) return { ok: false, reason: "script not found" };
  if (!plugin.events.includes(event.event)) return { ok: false, reason: "event not selected" };
  return { ok: true };
}

export function runPlugin(plugin: CustomPlugin, event: CompanionEvent, onRecord: (record: PluginRunRecord) => void): void {
  const startedAt = Date.now();
  const permissionSet = new Set(plugin.permissions ?? []);
  const child = spawn(process.execPath, [plugin.scriptPath], {
    cwd: dirname(plugin.scriptPath),
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    env: {
      ...process.env,
      CLAWD_PLUGIN_PERMISSIONS: Array.from(permissionSet).join(","),
      CLAWD_PLUGIN_EVENT: event.event
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

  child.stdout.on("data", data => { stdout += String(data); });
  child.stderr.on("data", data => { stderr += String(data); });
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
    stdout: stdout.trim().slice(-4000),
    stderr: stderr.trim().slice(-4000)
  };
}

export function appendPluginRun(records: PluginRunRecord[], record: PluginRunRecord): PluginRunRecord[] {
  return [...records, record].slice(-RUN_LIMIT);
}
