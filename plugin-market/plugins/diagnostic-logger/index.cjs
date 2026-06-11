#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");
const childProcess = require("child_process");

let input = "";
let processed = false;
let idleTimer;

process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  input += chunk;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => finish(input), 500);
});
process.stdin.on("end", () => finish(input));

function finish(raw) {
  if (processed) return;
  processed = true;
  if (idleTimer) clearTimeout(idleTimer);
  try {
    run(raw);
  } catch (error) {
    console.error("Diagnostic logger failed: " + (error && error.stack ? error.stack : String(error)));
    process.exit(1);
  }
}

function run(raw) {
  const event = parseJson(raw, {});
  const settings = parseJson(process.env.CLAWD_PLUGIN_SETTINGS || "{}", {});
  const dataDir = process.env.CLAWD_PLUGIN_DATA_DIR || path.join(os.homedir(), ".clawd-companion", "plugin-data", "diagnostic-logger");
  const action = process.env.CLAWD_PLUGIN_ACTION || "collect";
  ensureDir(dataDir);

  if (action === "diagnose-ui") {
    runDiagnosis(dataDir, false);
    return;
  }
  if (action === "diagnose-save") {
    runDiagnosis(dataDir, true);
    return;
  }

  runCollection(event, settings, dataDir);
}

function runCollection(event, settings, dataDir) {
  const stamp = formatStamp(new Date());
  const reportPath = path.join(dataDir, "clawd-log-" + stamp + ".md");
  const jsonPath = path.join(dataDir, "clawd-log-" + stamp + ".json");
  const appDataDir = findAppDataDir();
  const context = collectContext(event, settings, appDataDir, dataDir);

  fs.writeFileSync(reportPath, renderLogMarkdown(context), "utf8");
  fs.writeFileSync(jsonPath, JSON.stringify(redact(context), null, 2), "utf8");

  console.log("Log report saved:");
  console.log(reportPath);
  console.log("Machine-readable log snapshot:");
  console.log(jsonPath);
  console.log("Next step: click Run diagnosis to analyze the newest log snapshot.");
}

function runDiagnosis(dataDir, saveReport) {
  const latest = latestFile(dataDir, /^clawd-log-.*\.json$/);
  if (!latest) {
    const fallbackPayload = { sourceLog: null, reportPath: null, jsonPath: null, diagnosis: { findings: [{ level: "error", title: "No generated log snapshot found", detail: "Click Generate logs first.", suggestion: "Generate logs before running diagnosis." }], summary: { total: 1, errors: 1, warnings: 0, info: 0, topFinding: "No generated log snapshot found" } } };
    console.log("CLAWD_DIAG_JSON:" + JSON.stringify(fallbackPayload));
    console.error("No generated log snapshot found. Click Generate logs first.");
    return;
  }

  const context = parseJson(fs.readFileSync(latest, "utf8"), null);
  if (!context) {
    const fallbackPayload = { sourceLog: latest, reportPath: null, jsonPath: null, diagnosis: { findings: [{ level: "error", title: "Could not parse latest log snapshot", detail: latest, suggestion: "Regenerate logs and try again." }], summary: { total: 1, errors: 1, warnings: 0, info: 0, topFinding: "Could not parse latest log snapshot" } } };
    console.log("CLAWD_DIAG_JSON:" + JSON.stringify(fallbackPayload));
    console.error("Could not parse latest log snapshot: " + latest);
    return;
  }

  const diagnosis = diagnose(context);
  let reportPath = null;
  let jsonPath = null;
  if (saveReport) {
    const stamp = formatStamp(new Date());
    reportPath = path.join(dataDir, "clawd-diagnosis-" + stamp + ".md");
    jsonPath = path.join(dataDir, "clawd-diagnosis-" + stamp + ".json");
    fs.writeFileSync(reportPath, renderDiagnosisMarkdown(context, diagnosis, latest), "utf8");
    fs.writeFileSync(jsonPath, JSON.stringify({ sourceLog: latest, diagnosis }, null, 2), "utf8");
  }

  const payload = { sourceLog: latest, reportPath, jsonPath, diagnosis };
  console.log("CLAWD_DIAG_JSON:" + JSON.stringify(payload));
  console.log("Diagnosis based on:");
  console.log(latest);
  if (saveReport) {
    console.log("Diagnosis report saved:");
    console.log(reportPath);
  }
  console.log("Findings: " + diagnosis.findings.length);
  diagnosis.findings.slice(0, 12).forEach(finding => {
    console.log("- [" + finding.level + "] " + finding.title + (finding.detail ? " | " + finding.detail : ""));
  });
}

function collectContext(event, settings, appDataDir, dataDir) {
  const files = {
    settings: appDataDir ? path.join(appDataDir, "settings.json") : null,
    runtimeLog: appDataDir ? path.join(appDataDir, "runtime.log") : null,
    eventHistory: appDataDir ? path.join(appDataDir, "event-history.json") : null,
    stats: appDataDir ? path.join(appDataDir, "stats.json") : null,
    tokenStats: appDataDir ? path.join(appDataDir, "token-stats-cache.json") : null,
    plugins: appDataDir ? path.join(appDataDir, "plugins") : null,
    pluginData: appDataDir ? path.join(appDataDir, "plugin-data") : null
  };
  const clawdSettings = readJsonFile(files.settings);
  const runtimeLog = readTextFile(files.runtimeLog, settings.includeFullRuntimeLog !== false ? Infinity : 120000);
  const eventHistory = settings.includeEventHistoryTail === false ? null : readEventHistory(files.eventHistory, numberSetting(settings.eventHistoryLimit, 120));
  const stats = readJsonFile(files.stats);
  const tokenStats = readJsonFile(files.tokenStats);
  const installHints = collectInstallHints();

  return {
    generatedAt: new Date().toISOString(),
    trigger: redact(event),
    plugin: {
      force: process.env.CLAWD_PLUGIN_FORCE === "1",
      dataDir,
      pluginDir: process.env.CLAWD_PLUGIN_DIR || "",
      event: process.env.CLAWD_PLUGIN_EVENT || "",
      permissions: process.env.CLAWD_PLUGIN_PERMISSIONS || ""
    },
    system: collectSystem(),
    paths: files,
    appDataDir,
    app: {
      settings: settings.includeSettings === false ? "disabled" : redact(clawdSettings),
      runtimeLog: summarizeRuntimeLog(runtimeLog),
      eventHistory,
      stats: summarizeStats(stats),
      tokenStats: summarizeTokenStats(tokenStats),
      installHints,
      fileListings: settings.includeDirectoryTree === false ? "disabled" : collectFileListings(files, installHints)
    },
    raw: {
      runtimeLogTail: tailString(runtimeLog.content || "", 50000)
    }
  };
}

function collectSystem() {
  const cpus = os.cpus() || [];
  return {
    platform: process.platform,
    arch: process.arch,
    osType: os.type(),
    osRelease: os.release(),
    osVersion: typeof os.version === "function" ? safeCall(() => os.version()) : "",
    hostname: os.hostname(),
    userInfo: safeCall(() => ({ username: os.userInfo().username, homedir: os.userInfo().homedir }), null),
    locale: Intl.DateTimeFormat().resolvedOptions(),
    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    node: process.version,
    electron: process.versions.electron || null,
    chrome: process.versions.chrome || null,
    v8: process.versions.v8,
    memory: {
      totalMem: os.totalmem(),
      freeMem: os.freemem(),
      process: process.memoryUsage()
    },
    cpuCount: cpus.length,
    cpuModel: cpus[0] ? cpus[0].model : null,
    envHints: redact(pickEnv([
      "APPDATA",
      "LOCALAPPDATA",
      "USERPROFILE",
      "HOME",
      "CODEX_HOME",
      "CLAUDE_CONFIG_DIR",
      "CLAWD_APP_VERSION",
      "VITE_DEV_SERVER_URL",
      "PROCESSOR_ARCHITECTURE",
      "NUMBER_OF_PROCESSORS"
    ])),
    processes: listRelevantProcesses()
  };
}

function collectInstallHints() {
  const dirs = uniqueTruthy([
    process.cwd(),
    process.env.CLAWD_PLUGIN_DIR,
    process.resourcesPath,
    process.resourcesPath && path.join(process.resourcesPath, "app.asar"),
    path.dirname(process.execPath || ""),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs", "Clawd Companion"),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "clawd-companion"),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Clawd Companion")
  ]);
  return dirs.map(describePath);
}

function collectFileListings(files, installHints) {
  const listing = {};
  const targets = {
    appData: path.dirname(files.settings || ""),
    plugins: files.plugins,
    pluginData: files.pluginData,
    currentPlugin: process.env.CLAWD_PLUGIN_DIR || "",
    currentPluginData: process.env.CLAWD_PLUGIN_DATA_DIR || ""
  };
  for (const [name, dir] of Object.entries(targets)) {
    if (dir) listing[name] = listDir(dir, 2, 120);
  }
  listing.installHints = installHints;
  return listing;
}

function summarizeRuntimeLog(file) {
  if (!file.exists) return file;
  const content = file.content || "";
  const lines = content.split(/\r?\n/).filter(Boolean);
  const important = lines.filter(line => /fail|error|warn|console\([23]\)|did-fail-load|not found|ENOENT|ERR_|Cannot|undefined|Plugin skipped|Plugin exited/i.test(line));
  return {
    ...omit(file, ["content"]),
    lineCount: lines.length,
    importantCount: important.length,
    importantTail: important.slice(-120),
    tail: lines.slice(-220)
  };
}

function readEventHistory(filePath, limit) {
  const loaded = readJsonFile(filePath);
  if (!loaded.exists || !loaded.data) return loaded;
  const store = loaded.data;
  const events = Array.isArray(store) ? store : Array.isArray(store.events) ? store.events : [];
  const sessions = Array.isArray(store.sessions) ? store.sessions : [];
  const eventCounts = {};
  const toolCounts = {};
  for (const item of events) {
    const ev = item && item.event ? item.event : item;
    if (!ev || typeof ev !== "object") continue;
    eventCounts[ev.event || "unknown"] = (eventCounts[ev.event || "unknown"] || 0) + 1;
    if (ev.tool) toolCounts[ev.tool] = (toolCounts[ev.tool] || 0) + 1;
  }
  return {
    ...omit(loaded, ["data"]),
    eventCount: events.length,
    sessionCount: sessions.length,
    eventCounts,
    toolCounts,
    sessionsTail: redact(sessions.slice(-40)),
    eventsTail: redact(events.slice(-limit))
  };
}

function summarizeStats(loaded) {
  if (!loaded.exists || !loaded.data) return loaded;
  const stats = loaded.data;
  return {
    ...omit(loaded, ["data"]),
    totalSessions: stats.totalSessions,
    totalRuntime: stats.totalRuntime,
    errorCount: stats.errorCount,
    permissionRequests: stats.permissionRequests,
    permissionApproved: stats.permissionApproved,
    permissionDenied: stats.permissionDenied,
    firstStartTime: stats.firstStartTime,
    lastEventTime: stats.lastEventTime,
    toolUsage: stats.toolUsage,
    eventTypeCounts: stats.eventTypeCounts,
    dailyStatsKeys: stats.dailyStats ? Object.keys(stats.dailyStats).slice(-30) : []
  };
}

function summarizeTokenStats(loaded) {
  if (!loaded.exists || !loaded.data) return loaded;
  const data = loaded.data;
  return {
    ...omit(loaded, ["data"]),
    totalTokens: data.totalTokens,
    totalSessions: data.totalSessions,
    lastScannedAt: data.lastScannedAt,
    scanning: data.scanning,
    modelTotals: Array.isArray(data.modelTotals) ? data.modelTotals.slice(0, 20) : [],
    dailyTotalsTail: Array.isArray(data.dailyTotals) ? data.dailyTotals.slice(-30) : []
  };
}

function diagnose(context) {
  const findings = [];
  const settingsFile = context.app.settings && context.app.settings !== "disabled" ? context.app.settings : null;
  const settings = unwrapSettings(settingsFile && settingsFile.data ? settingsFile.data : null);
  const log = context.app.runtimeLog || {};
  const history = context.app.eventHistory;
  const runtimeTailLines = String(context.raw && context.raw.runtimeLogTail || "").split(/\r?\n/).filter(Boolean);
  const logLines = uniqueTruthy([...(log.importantTail || []), ...(log.tail || []), ...runtimeTailLines]);

  addFindingIf(findings, !context.appDataDir, "error", "App data directory was not found", "settings.json/runtime.log/event-history.json could not be located in known Clawd data paths.", "Clawd may be looking in a different userData directory or the app did not finish startup.");
  addFindingIf(findings, log.exists === false, "error", "runtime.log was not found", "No runtime log file exists in the detected app data directory.", "Start Clawd once, then generate logs again.");
  addFindingIf(findings, log.exists && log.importantCount > 0, "warn", "runtime.log contains suspicious lines", String(log.importantCount) + " warning/error-like lines found.", "Open the log report and inspect Runtime log summary.");

  for (const rule of logRules()) {
    const matches = logLines.filter(line => rule.pattern.test(line));
    if (matches.length) {
      findings.push({
        level: rule.level,
        title: rule.title,
        detail: rule.detail(matches),
        evidence: matches.slice(-5),
        suggestion: rule.suggestion
      });
    }
  }

  if (settings) {
    addFindingIf(findings, settings.petEnabled === false, "error", "Desktop pet is disabled", "settings.petEnabled is false.", "Turn on Appearance -> Enable pet.");
    addFindingIf(findings, Number(settings.petOpacity) < 0.7, "warn", "Overall pet opacity is low", "petOpacity=" + settings.petOpacity, "Raise overall opacity in Appearance.");
    addFindingIf(findings, Number(settings.clawdOpacity) < 0.7, "error", "Clawd opacity is low", "clawdOpacity=" + settings.clawdOpacity, "Raise Clawd opacity in Appearance.");
    addFindingIf(findings, Number(settings.clawdScale) < 0.4, "warn", "Clawd scale is very small", "clawdScale=" + settings.clawdScale, "Raise Clawd size in Appearance.");
    addFindingIf(findings, settings.clickThrough === true, "info", "Click-through is enabled", "This should not hide Clawd, but it can make dragging/testing feel confusing.", "Disable click-through while debugging positioning.");

    const offsets = settings.positionOffsets || {};
    const clawd = offsets.clawd || { x: 0, y: 0 };
    const view = offsets.view || { x: 0, y: 0 };
    addFindingIf(findings, Math.abs(clawd.x) > 1500 || Math.abs(clawd.y) > 1500 || Math.abs(view.x) > 2500 || Math.abs(view.y) > 2500, "warn", "Large Clawd/view position offset", "clawd=" + JSON.stringify(clawd) + ", view=" + JSON.stringify(view), "Use Appearance -> Edit position -> reset all.");

    const invalidStateSprites = settings.stateAnimations ? findInvalidSprites(settings.stateAnimations) : [];
    addFindingIf(findings, invalidStateSprites.length > 0, "error", "Invalid action animation mapping", invalidStateSprites.join(", "), "Reset action animation mappings.");

    const idleSprites = settings.idleAnim && Array.isArray(settings.idleAnim.selectedSprites) ? settings.idleAnim.selectedSprites : [];
    const invalidIdleSprites = idleSprites.filter(sprite => !knownSprites().has(sprite));
    addFindingIf(findings, invalidIdleSprites.length > 0, "error", "Invalid idle animation sprite", invalidIdleSprites.join(", "), "Reset idle animation pool.");

    const enabledPlugins = Array.isArray(settings.customPlugins) ? settings.customPlugins.filter(plugin => plugin.enabled) : [];
    const spritePlugins = enabledPlugins.filter(plugin => plugin.resolvedAssets && plugin.resolvedAssets.spritesCss);
    addFindingIf(findings, spritePlugins.length > 0, "warn", "Enabled plugin sprite overrides detected", spritePlugins.map(plugin => plugin.name || plugin.id).join(", "), "Temporarily disable sprite-related plugins to rule out CSS overrides.");
  } else if (settingsFile !== "disabled") {
    findings.push({ level: "error", title: "Settings snapshot could not be read", detail: "settings.json missing or invalid.", suggestion: "Generate logs after restarting Clawd." });
  }

  if (history && history.exists) {
    addFindingIf(findings, history.eventCount === 0, "info", "No event history yet", "event-history.json exists but has no events.", "Check Sources/Hooks if Clawd is not reacting to CLI events.");
    const errors = history.eventCounts && history.eventCounts.error || 0;
    addFindingIf(findings, errors > 0, "warn", "Error events are present", String(errors) + " error events found in event history.", "Inspect Recent event history in the generated log.");
  }

  if (context.system && context.system.processes && context.system.processes.error) {
    findings.push({ level: "info", title: "Process listing unavailable", detail: context.system.processes.error, suggestion: "This only limits diagnosis detail; it is not necessarily a Clawd problem." });
  }

  if (findings.length === 0) {
    findings.push({ level: "info", title: "No obvious problem detected", detail: "No configured rule matched the latest generated log.", suggestion: "Reproduce the problem, click Generate logs again, then run diagnosis again." });
  }

  return { findings, summary: summarizeFindings(findings) };
}

function logRules() {
  return [
    {
      level: "error",
      title: "Renderer failed to load",
      pattern: /failed to load|did-fail-load|ERR_FILE_NOT_FOUND|ERR_FAILED|ERR_ABORTED/i,
      detail: matches => matches.length + " load failure lines matched.",
      suggestion: "Check whether renderer assets are missing from the installation or app.asar. Reinstalling may help if files are missing."
    },
    {
      level: "error",
      title: "Sprite or image resource may be missing",
      pattern: /(?:ERR_FILE_NOT_FOUND|failed to load|not found|ENOENT).*(?:clawd|sprite|png|assets|background-image)|(?:clawd|sprite|png|assets|background-image).*(?:ERR_FILE_NOT_FOUND|failed to load|not found|ENOENT)/i,
      detail: matches => matches.length + " resource-related lines matched.",
      suggestion: "If the pet frame/cards show but Clawd is invisible, verify sprite CSS/PNG assets and animation mappings."
    },
    {
      level: "error",
      title: "Renderer JavaScript error detected",
      pattern: /console\([23]\).*\b(TypeError|ReferenceError|SyntaxError|Cannot read|Cannot access|undefined is not|is not a function)\b/i,
      detail: matches => matches[matches.length - 1],
      suggestion: "Open the latest log report and inspect renderer console lines around this error."
    },
    {
      level: "warn",
      title: "Plugin execution problem detected",
      pattern: /Plugin skipped|Plugin exited:.*code=[^0]|timed-out|script not found|not trusted/i,
      detail: matches => matches.length + " plugin runtime lines matched.",
      suggestion: "Check plugin trust/enabled state and the Recent runs stderr output."
    },
    {
      level: "warn",
      title: "Hook or source connection problem detected",
      pattern: /hook|forwarder|command path|missing events|not listening|ECONNREFUSED|server.*error/i,
      detail: matches => matches.length + " hook/source lines matched.",
      suggestion: "Open Sources or Doctor and repair hooks for the affected provider."
    },
    {
      level: "warn",
      title: "Settings or JSON parse problem detected",
      pattern: /(?:settings|config|JSON).*(?:error|fail|failed|corrupt|Unexpected token|parse)|(?:Unexpected token|corrupt).*(?:settings|config|JSON)|backup.*(?:error|fail|failed)/i,
      detail: matches => matches.length + " settings/JSON error lines matched.",
      suggestion: "Export settings, then try reset/import only after keeping a backup."
    },
    {
      level: "warn",
      title: "Permission UI flow problem detected",
      pattern: /(?:permission|PermissionBroker|permission card|permission_wait).*(?:error|fail|failed|expired|missing|hidden|undefined|not found)/i,
      detail: matches => matches.length + " permission error lines matched.",
      suggestion: "Check whether permission dialog is enabled and whether a card is hidden behind another window."
    },
    {
      level: "info",
      title: "Update/download problem detected",
      pattern: /(?:update|download|latest\.yml|autoUpdater|installUpdate).*(?:error|fail|failed|timeout|missing|not found)/i,
      detail: matches => matches.length + " update error lines matched.",
      suggestion: "This is usually unrelated to pet rendering unless the app updated immediately before the problem."
    }
  ];
}

function renderLogMarkdown(context) {
  return [
    "# Clawd Companion Log Report",
    "",
    "Generated at: `" + context.generatedAt + "`",
    "",
    "## Support summary",
    "",
    fenced({
      appDataDir: context.appDataDir,
      platform: context.system.platform,
      osRelease: context.system.osRelease,
      node: context.system.node,
      electron: context.system.electron,
      triggerEvent: context.trigger.event,
      pluginForce: context.plugin.force
    }),
    "",
    "## Clawd settings snapshot",
    "",
    fenced(context.app.settings),
    "",
    "## Runtime log summary",
    "",
    fenced(context.app.runtimeLog),
    "",
    "## Recent event history",
    "",
    fenced(context.app.eventHistory),
    "",
    "## Stats summary",
    "",
    fenced(context.app.stats),
    "",
    "## Token stats summary",
    "",
    fenced(context.app.tokenStats),
    "",
    "## System",
    "",
    fenced(context.system),
    "",
    "## Paths and files",
    "",
    fenced({ paths: context.paths, installHints: context.app.installHints, fileListings: context.app.fileListings }),
    "",
    "## Trigger event",
    "",
    fenced(context.trigger),
    "",
    "## Runtime log tail",
    "",
    "```text",
    context.raw.runtimeLogTail || "(empty)",
    "```",
    ""
  ].join("\n");
}

function renderDiagnosisMarkdown(context, diagnosis, sourceLog) {
  return [
    "# Clawd Companion Diagnosis",
    "",
    "Generated at: `" + new Date().toISOString() + "`",
    "Source log: `" + sourceLog + "`",
    "",
    "## Summary",
    "",
    fenced(diagnosis.summary),
    "",
    "## Findings",
    "",
    renderFindings(diagnosis.findings),
    "",
    "## Evidence Snapshot",
    "",
    fenced({
      runtimeLog: context.app.runtimeLog,
      settings: context.app.settings,
      eventHistory: context.app.eventHistory,
      system: {
        platform: context.system.platform,
        osRelease: context.system.osRelease,
        electron: context.system.electron,
        node: context.system.node
      }
    }),
    ""
  ].join("\n");
}

function renderFindings(findings) {
  return findings.map(finding => {
    const lines = ["- **" + finding.level.toUpperCase() + "** " + finding.title];
    if (finding.detail) lines.push("  Detail: " + finding.detail);
    if (finding.suggestion) lines.push("  Suggested next step: " + finding.suggestion);
    if (finding.evidence && finding.evidence.length) lines.push("  Evidence: " + finding.evidence.map(line => "`" + truncate(String(line), 180).replace(/`/g, "'") + "`").join("; "));
    return lines.join("\n");
  }).join("\n");
}

function summarizeFindings(findings) {
  return {
    total: findings.length,
    errors: findings.filter(f => f.level === "error").length,
    warnings: findings.filter(f => f.level === "warn").length,
    info: findings.filter(f => f.level === "info").length,
    topFinding: findings[0] ? findings[0].title : null
  };
}

function addFindingIf(findings, condition, level, title, detail, suggestion) {
  if (condition) findings.push({ level, title, detail, suggestion });
}

function findAppDataDir() {
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const candidates = uniqueTruthy([
    path.join(appData, "clawd-companion", "clawd-companion"),
    path.join(appData, "Clawd Companion", "clawd-companion"),
    path.join(appData, "clawd-companion"),
    path.join(os.homedir(), "Library", "Application Support", "clawd-companion"),
    path.join(os.homedir(), ".config", "clawd-companion")
  ]);
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "settings.json")) || fs.existsSync(path.join(candidate, "runtime.log"))) return candidate;
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function readJsonFile(filePath) {
  const base = describePath(filePath);
  if (!base.exists || !base.isFile) return base;
  try {
    return { ...base, data: parseJson(fs.readFileSync(filePath, "utf8"), null) };
  } catch (error) {
    return { ...base, error: error.message };
  }
}

function readTextFile(filePath, maxChars) {
  const base = describePath(filePath);
  if (!base.exists || !base.isFile) return { ...base, content: "" };
  try {
    var effectiveMax = maxChars === Infinity ? 2 * 1024 * 1024 : maxChars;
    if (base.size > effectiveMax * 4) {
      var readSize = Math.min(effectiveMax * 4, base.size);
      var fd = fs.openSync(filePath, "r");
      var buf = Buffer.alloc(readSize);
      fs.readSync(fd, buf, 0, readSize, base.size - readSize);
      fs.closeSync(fd);
      var tail = buf.toString("utf8");
      return { ...base, truncated: true, content: tail.slice(-effectiveMax) };
    }
    var content = fs.readFileSync(filePath, "utf8");
    return { ...base, truncated: content.length > effectiveMax, content: content.slice(-effectiveMax) };
  } catch (error) {
    return { ...base, error: error.message, content: "" };
  }
}

function describePath(filePath) {
  if (!filePath) return { path: filePath, exists: false };
  try {
    const stat = fs.statSync(filePath);
    return {
      path: filePath,
      exists: true,
      isFile: stat.isFile(),
      isDirectory: stat.isDirectory(),
      size: stat.size,
      mtime: stat.mtime.toISOString()
    };
  } catch (error) {
    return { path: filePath, exists: false, error: error.code || error.message };
  }
}

function listDir(dir, depth, limit) {
  const root = describePath(dir);
  if (!root.exists || !root.isDirectory) return root;
  const results = [];
  walk(dir, depth, results, limit || 100);
  return { ...root, entries: results };
}

function walk(dir, depth, results, limit) {
  if (depth < 0 || results.length >= limit) return;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    results.push({ path: dir, error: error.message });
    return;
  }
  for (const entry of entries) {
    if (results.length >= limit) return;
    const full = path.join(dir, entry.name);
    const desc = describePath(full);
    results.push(desc);
    if (entry.isDirectory()) walk(full, depth - 1, results, limit);
  }
}

function listRelevantProcesses() {
  if (process.platform !== "win32") return { skipped: "process list currently implemented for Windows only" };
  try {
    const output = childProcess.execFileSync("tasklist", ["/FO", "CSV", "/NH"], { encoding: "utf8", timeout: 5000, windowsHide: true });
    return output.split(/\r?\n/)
      .map(parseCsvLine)
      .filter(row => row.length >= 2)
      .map(row => ({ image: row[0], pid: row[1], memory: row[4] }))
      .filter(row => /clawd|claude|codex|electron|node/i.test(row.image))
      .slice(0, 80);
  } catch (error) {
    return { error: error.message };
  }
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function latestFile(dir, pattern) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter(name => pattern.test(name))
    .map(name => path.join(dir, name))
    .map(file => ({ file, stat: fs.statSync(file) }))
    .filter(item => item.stat.isFile())
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  return files[0] ? files[0].file : null;
}

function findInvalidSprites(mapping) {
  const known = knownSprites();
  const invalid = [];
  for (const [state, sprite] of Object.entries(mapping || {})) {
    if (typeof sprite !== "string" || !known.has(sprite)) invalid.push(state + "=" + sprite);
  }
  return invalid;
}

function knownSprites() {
  return new Set(["idle", "thinking", "tool_read", "tool_edit", "tool_bash", "tool_search", "waiting_permission", "done", "error", "skill", "task", "agent"]);
}

function unwrapSettings(value) {
  if (!value || typeof value !== "object") return null;
  if (value.data && typeof value.data === "object") return value.data;
  return value;
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (/token|secret|password|authorization|cookie/i.test(key)) {
      output[key] = typeof item === "string" && item ? "[redacted length=" + item.length + "]" : "[redacted]";
    } else {
      output[key] = redact(item);
    }
  }
  return output;
}

function pickEnv(keys) {
  const output = {};
  for (const key of keys) {
    if (process.env[key] !== undefined) output[key] = process.env[key];
  }
  return output;
}

function parseJson(raw, fallback) {
  try { return JSON.parse(raw || ""); } catch { return fallback; }
}

function fenced(value) {
  return "```json\n" + JSON.stringify(redact(value), null, 2) + "\n```";
}

function tailString(text, max) {
  if (!text) return "";
  return text.length > max ? text.slice(-max) : text;
}

function numberSetting(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function formatStamp(date) {
  return date.getFullYear()
    + String(date.getMonth() + 1).padStart(2, "0")
    + String(date.getDate()).padStart(2, "0")
    + "-"
    + String(date.getHours()).padStart(2, "0")
    + String(date.getMinutes()).padStart(2, "0")
    + String(date.getSeconds()).padStart(2, "0");
}

function omit(object, keys) {
  const output = { ...object };
  for (const key of keys) delete output[key];
  return output;
}

function uniqueTruthy(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function safeCall(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

function truncate(text, max) {
  return text.length > max ? text.slice(0, max - 1) + "..." : text;
}
