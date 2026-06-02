import { contextBridge, ipcRenderer } from "electron";
import type { CompanionEvent, CompanionSettings } from "../shared/events";

contextBridge.exposeInMainWorld("companion", {
  getSettings: () => ipcRenderer.invoke("settings:get") as Promise<CompanionSettings>,
  saveSettings: (settings: Partial<CompanionSettings>) => ipcRenderer.invoke("settings:save", settings) as Promise<CompanionSettings>,
  sendTestEvent: (event: CompanionEvent) => ipcRenderer.invoke("event:test", event) as Promise<void>,
  openSettings: () => ipcRenderer.invoke("window:open-settings") as Promise<void>,
  onEvent: (callback: (event: CompanionEvent) => void) => {
    const handler = (_: Electron.IpcRendererEvent, event: CompanionEvent) => callback(event);
    ipcRenderer.on("companion:event", handler);
    return () => ipcRenderer.off("companion:event", handler);
  },
  onSettings: (callback: (settings: CompanionSettings) => void) => {
    const handler = (_: Electron.IpcRendererEvent, settings: CompanionSettings) => callback(settings);
    ipcRenderer.on("companion:settings", handler);
    return () => ipcRenderer.off("companion:settings", handler);
  },
  dragPetTo: (x: number, y: number) => ipcRenderer.invoke("window:drag-pet", { x, y }) as Promise<void>
});

declare global {
  interface Window {
    companion: {
      getSettings: () => Promise<CompanionSettings>;
      saveSettings: (settings: Partial<CompanionSettings>) => Promise<CompanionSettings>;
      sendTestEvent: (event: CompanionEvent) => Promise<void>;
      openSettings: () => Promise<void>;
      onEvent: (callback: (event: CompanionEvent) => void) => () => void;
      onSettings: (callback: (settings: CompanionSettings) => void) => () => void;
      dragPetTo: (x: number, y: number) => Promise<void>;
    };
  }
}
