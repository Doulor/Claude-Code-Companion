/// <reference types="vite/client" />

import type { CompanionConnectionStatus, CompanionEvent, CompanionSettings } from "../shared/events";

interface HooksStatus {
  installed: boolean;
  configExists: boolean;
  hookCount: number;
  requiredCount: number;
  missingEvents: string[];
  commandMatches: boolean;
}

declare global {
  interface Window {
    companion: {
      getSettings: () => Promise<CompanionSettings>;
      saveSettings: (settings: Partial<CompanionSettings>) => Promise<CompanionSettings>;
      getConnectionStatus: () => Promise<CompanionConnectionStatus>;
      sendTestEvent: (event: CompanionEvent) => Promise<void>;
      checkHooks: () => Promise<HooksStatus>;
      installHooks: () => Promise<{ success: boolean; error?: string }>;
      repairHooks: () => Promise<{ success: boolean; fixed: string[]; error?: string }>;
      removeHooks: () => Promise<{ success: boolean; error?: string }>;
      openSettings: () => Promise<void>;
      minimizeSettings: () => Promise<void>;
      toggleMaximizeSettings: () => Promise<void>;
      closeSettings: () => Promise<void>;
      onEvent: (callback: (event: CompanionEvent) => void) => () => void;
      onSettings: (callback: (settings: CompanionSettings) => void) => () => void;
      onConnection: (callback: (status: CompanionConnectionStatus) => void) => () => void;
      setPetInteractive: (interactive: boolean) => Promise<void>;
      dragPetTo: (x: number, y: number) => Promise<void>;
      movePetBy: (dx: number, dy: number) => Promise<void>;
    };
  }
}

export {};
