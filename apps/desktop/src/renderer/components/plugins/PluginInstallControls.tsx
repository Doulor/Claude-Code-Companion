import React from "react";
import type { CustomPlugin, PluginMarketItem } from "../../../shared/events";

export function PluginInstallControls({ marketItem, installed, installing, onInstall, onRemove, zh = false }: { marketItem?: PluginMarketItem; installed?: CustomPlugin; installing?: boolean; onInstall?: () => void; onRemove?: () => void; zh?: boolean }) {
  return (
    <div className="plugin-action-row">
      {marketItem && onInstall ? (
        <button className="plugin-install-btn" disabled={installing} onClick={onInstall}>
          <strong>{installing ? (zh ? "安装中..." : "Installing...") : installed ? (zh ? "重新安装" : "Reinstall") : (zh ? "安装插件" : "Install")}</strong>
          <span>{installed ? (zh ? "保留当前配置" : "Keep current settings") : (zh ? "添加到已安装插件" : "Add to installed plugins")}</span>
        </button>
      ) : null}
      {installed && onRemove ? <button className="ghost-btn danger plugin-remove-btn" onClick={onRemove}>{zh ? "移除" : "Remove"}</button> : null}
    </div>
  );
}
