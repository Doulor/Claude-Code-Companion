import { useEffect, useState } from "react";
import type { CustomPlugin } from "../../shared/events";

export function PluginSpriteLoader() {
  const [plugins, setPlugins] = useState<CustomPlugin[]>([]);

  useEffect(() => {
    void window.companion.getPlugins().then(setPlugins).catch(() => {});
    const interval = window.setInterval(() => {
      void window.companion.getPlugins().then(setPlugins).catch(() => {});
    }, 3000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const head = document.head;
    head.querySelectorAll('link[data-plugin-sprites="true"]').forEach(el => el.remove());
    for (const p of plugins) {
      if (p.enabled && p.trusted && p.resolvedAssets?.spritesCss) {
        const href = `file:///${p.resolvedAssets.spritesCss.replace(/\\/g, "/")}`;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        link.dataset.pluginSprites = "true";
        link.dataset.pluginId = p.id;
        head.appendChild(link);
      }
    }
  }, [plugins]);

  return null;
}
