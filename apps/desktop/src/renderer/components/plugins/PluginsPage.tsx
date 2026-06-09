import React, { useEffect, useMemo, useState } from "react";
import type { CompanionSettings, CustomPlugin, PluginMarketIndex, PluginRunRecord } from "../../../shared/events";
import { PluginDetailPage } from "./PluginDetailPage";
import { PluginListPage } from "./PluginListPage";

type PluginRoute =
  | { name: "list" }
  | { name: "detail"; source: "installed"; pluginId: string }
  | { name: "detail"; source: "market"; marketId: string };

export function PluginsPage({ settings, updateSettings }: { settings: CompanionSettings; updateSettings: (s: Partial<CompanionSettings>) => void }) {
  const [route, setRoute] = useState<PluginRoute>({ name: "list" });
  const [market, setMarket] = useState<PluginMarketIndex | null>(null);
  const [runs, setRuns] = useState<PluginRunRecord[]>([]);
  const [installing, setInstalling] = useState<string | null>(null);
  const plugins = settings.customPlugins ?? [];

  const refresh = async () => {
    const [marketIndex, pluginRuns] = await Promise.all([
      window.companion.getPluginMarket().catch(() => null),
      window.companion.getPluginRuns().catch(() => [])
    ]);
    if (marketIndex) setMarket(marketIndex);
    setRuns(pluginRuns);
  };

  useEffect(() => { void refresh(); }, [plugins.length]);

  const installedByMarketId = useMemo(() => new Map(plugins.filter(p => p.id.startsWith("market-")).map(p => [p.id.replace(/^market-/, ""), p])), [plugins]);

  const patchPlugin = (id: string, patch: Partial<CustomPlugin>) => {
    updateSettings({ customPlugins: plugins.map(plugin => plugin.id === id ? { ...plugin, ...patch } : plugin) });
  };

  const removePlugin = (id: string) => {
    updateSettings({ customPlugins: plugins.filter(plugin => plugin.id !== id) });
    setRoute({ name: "list" });
  };

  const addCustom = () => {
    const id = crypto.randomUUID();
    const plugin: CustomPlugin = { id, name: "New Plugin", scriptPath: "", enabled: false, trusted: false, events: [], permissions: ["event"] };
    updateSettings({ customPlugins: [...plugins, plugin] });
    setRoute({ name: "detail", source: "installed", pluginId: id });
  };

  const install = async (marketId: string) => {
    setInstalling(marketId);
    try {
      const result = await window.companion.installMarketPlugin(marketId);
      if (result.ok) {
        const next = await window.companion.getPlugins();
        updateSettings({ customPlugins: next });
        setRoute({ name: "detail", source: "installed", pluginId: `market-${marketId}` });
      }
    } finally {
      setInstalling(null);
      void refresh();
    }
  };

  if (route.name === "detail") {
    const plugin = route.source === "installed" ? plugins.find(p => p.id === route.pluginId) : installedByMarketId.get(route.marketId);
    const marketItem = route.source === "market" ? market?.plugins.find(item => item.id === route.marketId) : market?.plugins.find(item => item.id === plugin?.marketId || item.id === plugin?.id.replace(/^market-/, ""));
    return (
      <PluginDetailPage
        plugin={plugin}
        marketItem={marketItem}
        runs={plugin ? runs.filter(run => run.pluginId === plugin.id) : []}
        installing={installing === (marketItem?.id ?? "")}
        onBack={() => setRoute({ name: "list" })}
        onInstall={marketItem ? () => void install(marketItem.id) : undefined}
        onRemove={plugin ? () => removePlugin(plugin.id) : undefined}
        onPatchPlugin={patch => plugin ? patchPlugin(plugin.id, patch) : undefined}
        onRunNow={plugin ? async () => { const result = await window.companion.runPluginNow(plugin.id); void refresh(); return result; } : undefined}
      />
    );
  }

  return (
    <PluginListPage
      plugins={plugins}
      market={market?.plugins ?? []}
      runs={runs}
      onOpenInstalled={pluginId => setRoute({ name: "detail", source: "installed", pluginId })}
      onOpenMarket={marketId => setRoute({ name: "detail", source: "market", marketId })}
      onPatchPlugin={patchPlugin}
      onAddCustom={addCustom}
    />
  );
}
