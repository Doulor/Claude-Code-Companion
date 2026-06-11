import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join, normalize, sep } from "node:path";
import type { CustomPlugin, PluginMarketIndex, PluginMarketItem } from "../shared/events.js";

export function parseMarketIndex(value: unknown): PluginMarketIndex {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid market index");
  const raw = value as Partial<PluginMarketIndex>;
  const plugins = Array.isArray(raw.plugins) ? raw.plugins.map(parseMarketItem) : [];
  return {
    version: typeof raw.version === "number" ? raw.version : 1,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
    plugins
  };
}

function parseMarketItem(value: unknown): PluginMarketItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid market item");
  const raw = value as Partial<PluginMarketItem>;
  const id = requiredString(raw.id, "id");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`Invalid plugin id: ${id}`);
  const entry = safeMarketPath(requiredString(raw.entry, "entry"));
  const manifest = safeMarketPath(requiredString(raw.manifest, "manifest"));
  return {
    id,
    name: requiredString(raw.name, "name"),
    nameZh: typeof raw.nameZh === "string" ? raw.nameZh : undefined,
    description: requiredString(raw.description, "description"),
    descriptionZh: typeof raw.descriptionZh === "string" ? raw.descriptionZh : undefined,
    details: typeof raw.details === "string" ? raw.details : undefined,
    detailsZh: typeof raw.detailsZh === "string" ? raw.detailsZh : undefined,
    readme: typeof raw.readme === "string" ? raw.readme : undefined,
    readmeZh: typeof raw.readmeZh === "string" ? raw.readmeZh : undefined,
    author: requiredString(raw.author, "author"),
    version: requiredString(raw.version, "version"),
    entry,
    manifest,
    events: Array.isArray(raw.events) ? raw.events.filter((v): v is string => typeof v === "string") : [],
    permissions: Array.isArray(raw.permissions) ? raw.permissions.filter((v): v is PluginMarketItem["permissions"][number] => v === "event" || v === "network" || v === "filesystem" || v === "shell") : [],
    tags: Array.isArray(raw.tags) ? raw.tags.filter((v): v is string => typeof v === "string") : [],
    devBadge: typeof raw.devBadge === "boolean" ? raw.devBadge : undefined
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing market field: ${field}`);
  return value.trim();
}

export function safeMarketPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.includes("..") || !normalized.startsWith("plugins/")) {
    throw new Error(`Unsafe market path: ${path}`);
  }
  return normalized;
}

export function rawUrl(baseUrl: string, path: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  return `${cleanBase}/${safeMarketPath(path).split("/").map(encodeURIComponent).join("/")}`;
}

export function installMarketPlugin(pluginRoot: string, item: PluginMarketItem, files: { entry: string; manifest: string; assets?: Record<string, string> }, previous?: CustomPlugin): CustomPlugin {
  const targetDir = join(pluginRoot, item.id);
  ensureInside(pluginRoot, targetDir);
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
  const entryPath = join(targetDir, basename(item.entry));
  const manifestPath = entryPath.replace(/\.[cm]?js$/i, ".manifest.json");
  ensureInside(pluginRoot, entryPath);
  ensureInside(pluginRoot, manifestPath);
  writeFileSync(entryPath, files.entry);
  writeFileSync(manifestPath, files.manifest);
  if (files.assets) {
    for (const [name, content] of Object.entries(files.assets)) {
      const assetPath = join(targetDir, name);
      ensureInside(pluginRoot, assetPath);
      writeFileSync(assetPath, content);
    }
  }
  const manifest = JSON.parse(files.manifest);
  return {
    id: `market-${item.id}`,
    marketId: item.id,
    name: item.name,
    scriptPath: entryPath,
    enabled: previous?.enabled ?? false,
    trusted: previous?.trusted ?? false,
    events: previous?.events ?? item.events,
    permissions: previous?.permissions ?? item.permissions,
    settings: previous?.settings,
    widgetOffsets: previous?.widgetOffsets,
    manifest,
    version: item.version,
    author: item.author,
    readme: item.readme ?? manifest.readme,
    readmeZh: item.readmeZh ?? manifest.readmeZh,
    devBadge: item.devBadge || manifest.devBadge || undefined
  };
}

function ensureInside(root: string, target: string): void {
  const normalizedRoot = normalize(root);
  const normalizedTarget = normalize(target);
  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(normalizedRoot + sep)) {
    throw new Error("Install path escaped plugin directory");
  }
}
