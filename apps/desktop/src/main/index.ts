import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, Notification, screen } from "electron";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { WebSocketServer } from "ws";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CompanionEvent, CompanionSettings } from "../shared/events";
import { defaultSettings } from "../shared/events";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const appDataDir = join(app.getPath("userData"), "clawd-companion");
const settingsPath = join(appDataDir, "settings.json");

let petWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let settings: CompanionSettings = defaultSettings;
let eventServer: ReturnType<typeof createServer> | null = null;
let wsServer: WebSocketServer | null = null;

function ensureDataDir() {
  if (!existsSync(appDataDir)) mkdirSync(appDataDir, { recursive: true });
}

function loadSettings(): CompanionSettings {
  ensureDataDir();
  if (!existsSync(settingsPath)) {
    writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2));
    return defaultSettings;
  }
  const stored = JSON.parse(readFileSync(settingsPath, "utf8")) as Partial<CompanionSettings>;
  return { ...defaultSettings, ...stored };
}

function saveSettings(next: Partial<CompanionSettings>) {
  settings = { ...settings, ...next };
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  petWindow?.setAlwaysOnTop(settings.alwaysOnTop, "floating");
  petWindow?.setIgnoreMouseEvents(settings.clickThrough, { forward: true });
  broadcastSettings();
  if (next.port && next.port !== settings.port) restartEventServer();
  return settings;
}

function rendererUrl(route: "pet" | "settings") {
  if (isDev) return `${process.env.VITE_DEV_SERVER_URL}/#/${route}`;
  return `file://${join(__dirname, "../renderer/index.html")}#/${route}`;
}

function createPetWindow() {
  const display = screen.getPrimaryDisplay().workArea;
  const size = Math.round(260 * settings.petScale);
  const x = settings.position?.x ?? display.x + display.width - size - 72;
  const y = settings.position?.y ?? display.y + display.height - size - 64;

  petWindow = new BrowserWindow({
    width: size,
    height: size + 92,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: settings.alwaysOnTop,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  petWindow.setIgnoreMouseEvents(settings.clickThrough, { forward: true });
  petWindow.loadURL(rendererUrl("pet"));
  petWindow.on("moved", () => {
    const [xNow, yNow] = petWindow?.getPosition() ?? [x, y];
    settings = { ...settings, position: { x: xNow, y: yNow } };
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  });
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 860,
    minHeight: 620,
    title: "Clawd Companion",
    backgroundColor: "#f5efe3",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.loadURL(rendererUrl("settings"));
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

function makeTrayIcon() {
  const image = nativeImage.createFromDataURL(
    "data:image/svg+xml;utf8," +
      encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#2b2118"/><circle cx="16" cy="16" r="10" fill="#f0c66f"/><circle cx="12" cy="14" r="2" fill="#2b2118"/><circle cx="20" cy="14" r="2" fill="#2b2118"/><path d="M11 20c3 3 7 3 10 0" stroke="#2b2118" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`)
  );
  tray = new Tray(image);
  tray.setToolTip("Clawd Companion");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "打开配置", click: createSettingsWindow },
    { label: "显示/隐藏桌宠", click: () => petWindow?.isVisible() ? petWindow.hide() : petWindow?.show() },
    { type: "separator" },
    { label: "退出", click: () => app.quit() }
  ]));
}

function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function writeJson(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function isCompanionEvent(value: unknown): value is CompanionEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  return typeof event.id === "string" && typeof event.event === "string" && typeof event.title === "string" && typeof event.message === "string";
}

function startEventServer() {
  eventServer = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      writeJson(res, 200, { ok: true, port: settings.port });
      return;
    }

    if (req.method !== "POST" || req.url !== "/events") {
      writeJson(res, 404, { ok: false, error: "not_found" });
      return;
    }

    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
    if (token !== settings.token) {
      writeJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }

    try {
      const body = await parseJsonBody(req);
      if (!isCompanionEvent(body)) {
        writeJson(res, 400, { ok: false, error: "invalid_event" });
        return;
      }
      emitEvent(body);
      writeJson(res, 200, { ok: true });
    } catch {
      writeJson(res, 400, { ok: false, error: "bad_json" });
    }
  });

  wsServer = new WebSocketServer({ noServer: true });
  eventServer.on("upgrade", (req, socket, head) => {
    if (!req.url?.startsWith("/stream")) {
      socket.destroy();
      return;
    }
    wsServer?.handleUpgrade(req, socket, head, ws => {
      ws.send(JSON.stringify({ type: "settings", payload: settings }));
    });
  });

  eventServer.listen(settings.port, "127.0.0.1");
}

function restartEventServer() {
  wsServer?.close();
  eventServer?.close(() => startEventServer());
}

function emitEvent(event: CompanionEvent) {
  petWindow?.webContents.send("companion:event", event);
  settingsWindow?.webContents.send("companion:event", event);
  wsServer?.clients.forEach(client => client.send(JSON.stringify({ type: "event", payload: event })));

  if (event.event === "done" && Notification.isSupported()) {
    new Notification({ title: event.title, body: event.message }).show();
  }
}

function broadcastSettings() {
  petWindow?.webContents.send("companion:settings", settings);
  settingsWindow?.webContents.send("companion:settings", settings);
  wsServer?.clients.forEach(client => client.send(JSON.stringify({ type: "settings", payload: settings })));
}

ipcMain.handle("settings:get", () => settings);
ipcMain.handle("settings:save", (_, next: Partial<CompanionSettings>) => saveSettings(next));
ipcMain.handle("event:test", (_, event: CompanionEvent) => emitEvent(event));
ipcMain.handle("window:open-settings", () => createSettingsWindow());
ipcMain.handle("window:drag-pet", (_, position: { x: number; y: number }) => {
  petWindow?.setPosition(Math.round(position.x), Math.round(position.y));
});

app.whenReady().then(() => {
  settings = loadSettings();
  createPetWindow();
  createSettingsWindow();
  makeTrayIcon();
  startEventServer();
});

app.on("window-all-closed", event => {
  event.preventDefault();
});

app.on("before-quit", () => {
  wsServer?.close();
  eventServer?.close();
});
