import { text, readStdin, parseCliOptions, readConnectionConfig, forwarderLog } from "./io.js";
import { postEvent, requestPermission } from "./client.js";
import { wakeupCompanion } from "./wakeup.js";
import type { Provider } from "./providers.js";

export interface RunOptions {
  provider: Provider;
  /** Provider-specific event name to use as the auto-start trigger. Defaults to "SessionStart". */
  autoStartHookEvent?: string;
}

function detectHookName(payload: Record<string, unknown>): string {
  return text(payload.hook_event_name)
    ?? text(payload.hookEventName)
    ?? text(payload.event)
    ?? "Unknown";
}

export async function runForwarder(options: RunOptions): Promise<void> {
  const { provider, autoStartHookEvent = "SessionStart" } = options;

  const cliOptions = parseCliOptions(process.argv.slice(2));
  const fileConfig = readConnectionConfig();
  const port = Number(cliOptions.port ?? process.env.CLAWD_COMPANION_PORT ?? fileConfig.port ?? "47634");
  const token = cliOptions.token ?? process.env.CLAWD_COMPANION_TOKEN ?? fileConfig.token ?? "clawd-local";
  const privacyMode = (process.env.CLAWD_PRIVACY_MODE as "safe" | "standard" | "detailed" | undefined) ?? "safe";
  const clientType = process.env.CLAWD_CLIENT_TYPE;
  const clientLabel = process.env.CLAWD_CLIENT_LABEL?.trim() || undefined;

  const raw = readStdin();
  if (!raw.trim()) return;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    process.stderr.write(`[clawd][${provider.id}] forward error: invalid JSON from stdin\n`);
    return;
  }

  const hookName = detectHookName(payload);

  if (provider.isPermissionEvent(payload)) {
    try {
      const { tool, detail } = provider.permissionDetail(payload, { privacyMode, clientType, clientLabel });
      const sessionId = text(payload.session_id) ?? text(payload.sessionId);
      const result = await requestPermission(tool, detail, sessionId, payload, port, token, 120000);
      if (result.decision === "allow" || result.decision === "deny") {
        process.stdout.write(provider.formatPermissionDecision(result.decision, result.reason));
      }
    } catch {
      // 出错时不写 stdout，CLI 会使用原生权限流程
    }
    return;
  }

  if (hookName === autoStartHookEvent) {
    forwarderLog(`${autoStartHookEvent} received, attempting auto-start (${provider.id})`);
    await wakeupCompanion(port, (msg) => {
      process.stderr.write(msg + "\n");
      forwarderLog(msg);
    });
  }

  const event = provider.normalize(payload, { privacyMode, clientType, clientLabel });
  await postEvent(event, port, token);
}
