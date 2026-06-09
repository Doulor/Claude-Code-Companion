#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const os = require("os");

let input = "";
let processed = false;
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => { input += chunk; });

let idleTimer;
process.stdin.on("data", () => {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (!processed) { processed = true; processInput(input); } }, 500);
});
process.stdin.on("end", () => {
  if (idleTimer) clearTimeout(idleTimer);
  if (!processed) { processed = true; processInput(input); }
});

function processInput(raw) {
  try {
    const settings = JSON.parse(process.env.CLAWD_PLUGIN_SETTINGS || "{}");
    const force = process.env.CLAWD_PLUGIN_FORCE === "1";
    const reportHour = parseInt(settings.reportHour || "22", 10);
    const generateCumulative = settings.generateCumulative !== false;
    const now = new Date();

    if (!force && now.getHours() !== reportHour) {
      console.log("Daily report skipped: current hour " + now.getHours() + " != report hour " + reportHour);
      return;
    }

    const outputDir = process.env.CLAWD_PLUGIN_DATA_DIR || resolveOutputDir("");
    const targetDay = force ? now : new Date(now.getTime() - 86400000);
    const today = formatDate(targetDay);
    const reportPath = path.join(outputDir, "clawd-report-" + today + ".html");

    if (!force && fs.existsSync(reportPath)) {
      console.log("Daily report skipped: report already exists at " + reportPath);
      return;
    }

    const historyPath = findEventHistoryPath();
    if (!historyPath) {
      console.log("Daily report skipped: event history file not found");
      return;
    }
    if (!fs.existsSync(historyPath)) {
      console.log("Daily report skipped: event history file missing at " + historyPath);
      return;
    }
    const history = JSON.parse(fs.readFileSync(historyPath, "utf8"));
    const allEntries = Array.isArray(history) ? history : (history.events ?? []);

    const tStart = startOfDay(targetDay);
    const tEnd = endOfDay(targetDay);
    const targetEntries = allEntries.filter(function(e) { return e.timestamp >= tStart && e.timestamp <= tEnd; });

    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const maxTimeline = parseInt(settings.maxTimeline || "20", 10);

    var stats = null;
    if (targetEntries.length > 0) {
      stats = computeStats(targetEntries, targetDay);
      var html = renderDailyReport(stats, targetDay, maxTimeline);
      fs.writeFileSync(reportPath, html, "utf8");
      console.log("Daily report saved to " + reportPath);
    } else {
      console.log("Daily report skipped: no events for " + formatDate(targetDay) + " (total entries: " + allEntries.length + ")");
    }

    // Persist today's stats to cumulative data (even if from event-history only)
    if (stats && generateCumulative) {
      persistDayStats(outputDir, today, stats);
    }

    if (generateCumulative) {
      var persistedData = loadCumulativeData(outputDir);
      var statsData = loadStatsData();
      var tokenData = loadTokenData();
      generateCumulativeReport(allEntries, outputDir, persistedData, statsData, tokenData);
    }
  } catch (err) {
    console.error("Daily report error: " + err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

function findEventHistoryPath() {
  var appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  var winPath = path.join(appData, "clawd-companion", "clawd-companion", "event-history.json");
  if (fs.existsSync(winPath)) return winPath;
  var macPath = path.join(os.homedir(), "Library", "Application Support", "clawd-companion", "event-history.json");
  if (fs.existsSync(macPath)) return macPath;
  var linuxPath = path.join(os.homedir(), ".config", "clawd-companion", "event-history.json");
  if (fs.existsSync(linuxPath)) return linuxPath;
  return null;
}

function findDataDir() {
  var appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, "clawd-companion", "clawd-companion");
}

function loadStatsData() {
  var p = path.join(findDataDir(), "stats.json");
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch(e) { console.log("Warning: could not read stats.json"); return null; }
}

function loadTokenData() {
  var p = path.join(findDataDir(), "token-stats-cache.json");
  if (!fs.existsSync(p)) return null;
  try {
    var raw = JSON.parse(fs.readFileSync(p, "utf8"));
    if (raw.modelTotals && raw.modelTotals.length > 0) return raw;
    return null;
  }
  catch(e) { console.log("Warning: could not read token-stats-cache.json"); return null; }
}

function resolveOutputDir(configured) {
  if (configured && configured.trim()) {
    return configured.replace(/^~/, os.homedir());
  }
  return path.join(os.homedir(), "Desktop", "clawd-reports");
}

function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
function endOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime(); }
function formatDate(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

function computeStats(entries, day) {
  var toolCounts = {};
  var errors = 0;
  var success = 0;
  var timeline = [];
  var sessions = new Set();
  var firstEvent = Infinity, lastEvent = 0;
  var hourCounts = new Array(24).fill(0);

  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    var ev = e.event;
    if (!ev) continue;
    if (ev.sessionId) sessions.add(ev.sessionId);
    if (e.timestamp < firstEvent) firstEvent = e.timestamp;
    if (e.timestamp > lastEvent) lastEvent = e.timestamp;

    var hour = new Date(e.timestamp).getHours();
    hourCounts[hour]++;

    if (ev.event === "tool_start" && ev.tool) {
      toolCounts[ev.tool] = (toolCounts[ev.tool] || 0) + 1;
    }
    if (ev.event === "done") success++;
    if (ev.event === "error") errors++;

    if (ev.event === "session_start" || ev.event === "done" || ev.event === "error" || ev.event === "prompt_submit") {
      timeline.push({
        time: new Date(e.timestamp),
        type: ev.event === "error" ? "error" : ev.event === "done" ? "success" : "info",
        text: ev.title || ev.message || ev.event,
        tool: ev.tool
      });
    }
  }

  var durationMs = lastEvent - firstEvent;
  var totalToolCalls = Object.values(toolCounts).reduce(function(a, b) { return a + b; }, 0);

  var peakHour = null;
  var peakHourCount = 0;
  for (var h = 0; h < 24; h++) {
    if (hourCounts[h] > peakHourCount) {
      peakHourCount = hourCounts[h];
      peakHour = h;
    }
  }

  return {
    date: formatDate(day),
    sessions: sessions.size,
    durationMs: durationMs,
    totalToolCalls: totalToolCalls,
    errors: errors,
    success: success,
    toolCounts: toolCounts,
    timeline: timeline,
    peakHour: peakHour,
    peakHourCount: peakHourCount
  };
}

function loadCumulativeData(outputDir) {
  var p = path.join(outputDir, "cumulative-data.json");
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, "utf8")) || {}; }
  catch(e) { console.log("Warning: could not read cumulative-data.json, starting fresh"); return {}; }
}

function saveCumulativeData(outputDir, data) {
  fs.writeFileSync(path.join(outputDir, "cumulative-data.json"), JSON.stringify(data, null, 2), "utf8");
}

function persistDayStats(outputDir, dateKey, stats) {
  var data = loadCumulativeData(outputDir);
  if (!data.days) data.days = {};
  // Merge: keep existing timeline if present, otherwise store stats without heavy timeline
  var compact = {
    sessions: stats.sessions,
    durationMs: stats.durationMs,
    totalToolCalls: stats.totalToolCalls,
    errors: stats.errors,
    success: stats.success,
    toolCounts: stats.toolCounts,
    peakHour: stats.peakHour,
    peakHourCount: stats.peakHourCount
  };
  // If we have a fresh timeline from computeStats, keep a shortened version
  if (stats.timeline && stats.timeline.length > 0) {
    compact.timeline = stats.timeline.slice(-20);
  } else if (data.days[dateKey] && data.days[dateKey].timeline) {
    compact.timeline = data.days[dateKey].timeline;
  }
  data.days[dateKey] = compact;
  saveCumulativeData(outputDir, data);
  return data;
}

function generateCumulativeReport(allEntries, outputDir, persistedData, statsData, tokenData) {
  // Build daily stats from stats.json (primary source for history)
  var dailyDetails = {};
  var dailySummaries = [];
  var allToolCounts = {};
  var allDurationMs = 0;
  var allErrors = 0;
  var allSuccess = 0;
  var allToolCalls = 0;
  var allSessions = 0;
  var allHourly = new Array(24).fill(0);

  // First, populate from stats.json dailyStats (up to 90 days of history)
  var statsDates = [];
  if (statsData && statsData.dailyStats) {
    statsDates = Object.keys(statsData.dailyStats).sort();
    for (var si = 0; si < statsDates.length; si++) {
      var sDate = statsDates[si];
      var sd = statsData.dailyStats[sDate];
      dailySummaries.push({
        date: sDate,
        sessions: sd.sessions || 0,
        durationMs: 0,
        toolCalls: sd.toolCalls || 0,
        errors: 0,
        success: 0,
        topTool: "",
        topToolCount: 0
      });
      dailyDetails[sDate] = {
        date: sDate, sessions: sd.sessions || 0, durationMs: 0,
        totalToolCalls: sd.toolCalls || 0, errors: 0, success: 0,
        toolCounts: {}, timeline: []
      };
      allSessions += (sd.sessions || 0);
      allToolCalls += (sd.toolCalls || 0);
    }
  }

  // Use stats.json toolUsage for cumulative tool counts
  if (statsData && statsData.toolUsage) {
    var tuKeys = Object.keys(statsData.toolUsage);
    for (var tui = 0; tui < tuKeys.length; tui++) {
      allToolCounts[tuKeys[tui]] = statsData.toolUsage[tuKeys[tui]];
    }
  }

  // Use stats.json for aggregate counts
  if (statsData) {
    allErrors = statsData.errorCount || 0;
    allSuccess = (statsData.eventTypeCounts && statsData.eventTypeCounts["done"]) || 0;
    allDurationMs = statsData.totalRuntime || 0;
    if (statsData.hourlyActivity) {
      for (var hi = 0; hi < 24; hi++) { allHourly[hi] = statsData.hourlyActivity[hi] || 0; }
    }
  }

  // Merge in event-history data for timeline detail and today's fresh stats
  var byDate = new Map();
  for (var i = 0; i < allEntries.length; i++) {
    var e = allEntries[i];
    var d = new Date(e.timestamp);
    var dateKey = formatDate(d);
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey).push(e);
  }
  var eventDates = Array.from(byDate.keys()).sort();

  for (var edi = 0; edi < eventDates.length; edi++) {
    var eDate = eventDates[edi];
    var dayEntries = byDate.get(eDate);
    var dayStats = computeStats(dayEntries, new Date(eDate + "T00:00:00"));

    // If this date exists in dailyDetails, enrich it; otherwise add it
    if (dailyDetails[eDate]) {
      dailyDetails[eDate].timeline = dayStats.timeline;
      dailyDetails[eDate].toolCounts = dayStats.toolCounts;
      dailyDetails[eDate].durationMs = dayStats.durationMs;
      dailyDetails[eDate].success = dayStats.success;
      dailyDetails[eDate].errors = dayStats.errors;
      // Update daily summary
      for (var dsi = 0; dsi < dailySummaries.length; dsi++) {
        if (dailySummaries[dsi].date === eDate) {
          dailySummaries[dsi].durationMs = dayStats.durationMs;
          dailySummaries[dsi].success = dayStats.success;
          dailySummaries[dsi].errors = dayStats.errors;
          var topT = Object.entries(dayStats.toolCounts).sort(function(a, b) { return b[1] - a[1]; });
          if (topT.length > 0) {
            dailySummaries[dsi].topTool = topT[0][0];
            dailySummaries[dsi].topToolCount = topT[0][1];
          }
          // Adjust toolCalls if event-history has more
          if (dayStats.totalToolCalls > dailySummaries[dsi].toolCalls) {
            allToolCalls += (dayStats.totalToolCalls - dailySummaries[dsi].toolCalls);
            dailySummaries[dsi].toolCalls = dayStats.totalToolCalls;
          }
          break;
        }
      }
    } else {
      dailyDetails[eDate] = dayStats;
      var topTools = Object.entries(dayStats.toolCounts).sort(function(a, b) { return b[1] - a[1]; });
      dailySummaries.push({
        date: eDate, sessions: dayStats.sessions, durationMs: dayStats.durationMs,
        toolCalls: dayStats.totalToolCalls, errors: dayStats.errors, success: dayStats.success,
        topTool: topTools.length > 0 ? topTools[0][0] : "",
        topToolCount: topTools.length > 0 ? topTools[0][1] : 0
      });
      allSessions += dayStats.sessions;
      allToolCalls += dayStats.totalToolCalls;
    }
  }

  // Re-sort dailySummaries by date
  dailySummaries.sort(function(a, b) { return a.date.localeCompare(b.date); });

  // Determine date range
  var allDates = dailySummaries.map(function(d) { return d.date; }).sort();
  var firstDate = allDates.length > 0 ? allDates[0] : formatDate(new Date());
  var lastDate = allDates.length > 0 ? allDates[allDates.length - 1] : firstDate;

  // Merge persisted days not covered
  if (persistedData && persistedData.days) {
    var persistedDates = Object.keys(persistedData.days).sort();
    for (var pi = 0; pi < persistedDates.length; pi++) {
      var pDate = persistedDates[pi];
      if (byDate.has(pDate)) continue; // already from fresh events
      var pStats = persistedData.days[pDate];
      dailyDetails[pDate] = {
        date: pDate,
        sessions: pStats.sessions || 0,
        durationMs: pStats.durationMs || 0,
        totalToolCalls: pStats.totalToolCalls || 0,
        errors: pStats.errors || 0,
        success: pStats.success || 0,
        toolCounts: pStats.toolCounts || {},
        timeline: pStats.timeline || [],
        peakHour: pStats.peakHour,
        peakHourCount: pStats.peakHourCount
      };
      var pTopTools = Object.entries(pStats.toolCounts || {}).sort(function(a, b) { return b[1] - a[1]; });
      dailySummaries.push({
        date: pDate,
        sessions: pStats.sessions || 0,
        durationMs: pStats.durationMs || 0,
        toolCalls: pStats.totalToolCalls || 0,
        errors: pStats.errors || 0,
        success: pStats.success || 0,
        topTool: pTopTools.length > 0 ? pTopTools[0][0] : "",
        topToolCount: pTopTools.length > 0 ? pTopTools[0][1] : 0
      });
      var ptk = Object.keys(pStats.toolCounts || {});
      for (var pti = 0; pti < ptk.length; pti++) {
        allToolCounts[ptk[pti]] = (allToolCounts[ptk[pti]] || 0) + (pStats.toolCounts[ptk[pti]] || 0);
      }
      allDurationMs += (pStats.durationMs || 0);
      allErrors += (pStats.errors || 0);
      allSuccess += (pStats.success || 0);
      allToolCalls += (pStats.totalToolCalls || 0);
      allSessions += (pStats.sessions || 0);
    }
    // Rebuild sorted dates including persisted ones
    allDates = Array.from(new Set(allDates.concat(persistedDates))).sort();
    firstDate = allDates[0];
    lastDate = allDates[allDates.length - 1];
    // Re-sort dailySummaries by date
    dailySummaries.sort(function(a, b) { return a.date.localeCompare(b.date); });
  }

  var allTimeStats = {
    sessions: allSessions,
    durationMs: allDurationMs,
    totalToolCalls: allToolCalls,
    errors: allErrors,
    success: allSuccess,
    dailyDetails: dailyDetails
  };

  // Extract model data for display
  var modelData = null;
  if (tokenData && tokenData.modelTotals) {
    modelData = {
      modelTotals: tokenData.modelTotals,
      totalTokens: tokenData.totalTokens || 0,
      totalSessions: tokenData.totalSessions || 0
    };
  }

  var cumulativePath = path.join(outputDir, "clawd-report-cumulative.html");
  var html = renderCumulativeReport(allTimeStats, dailySummaries, allToolCounts, firstDate, lastDate, modelData);
  fs.writeFileSync(cumulativePath, html, "utf8");
  console.log("Cumulative report saved to " + cumulativePath + " (" + allDates.length + " days)");
  return html;
}

function formatDuration(ms) {
  if (ms <= 0) return "0m";
  var h = Math.floor(ms / 3600000);
  var m = Math.round((ms % 3600000) / 60000);
  return h > 0 ? h + "h " + m + "m" : m + "m";
}

function formatTokens(n) {
  if (!n || n === 0) return "0";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return String(n);
}
function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function zh(zhStr, en) { return zhStr; }

// ─── Report HTML Templates ───────────────────────────────────────────

function renderDailyReport(stats, day, maxTimeline) {
  var dateStr = formatDate(day);
  var duration = formatDuration(stats.durationMs);
  var successTotal = stats.success + stats.errors;
  var successRate = successTotal > 0 ? Math.round((stats.success / successTotal) * 100) : 100;
  var successDeg = Math.round(successRate * 3.6);
  var sortedTools = Object.entries(stats.toolCounts).sort(function(a, b) { return b[1] - a[1]; });
  var maxToolCount = sortedTools.length > 0 ? sortedTools[0][1] : 1;
  var timelineItems = stats.timeline.slice(-maxTimeline);
  var peakHour = stats.peakHour;
  var peakHourCount = stats.peakHourCount || 0;
  var avgEventsPerSession = stats.sessions > 0 ? Math.round((stats.totalToolCalls + stats.success + stats.errors) / stats.sessions) : 0;

  var toolBars = sortedTools.map(function(pair) {
    var name = pair[0], count = pair[1];
    var pct = Math.round((count / maxToolCount) * 100);
    return '<div class="bar-row"><span class="bar-label">' + esc(name) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div><span class="bar-value">' + count + '</span></div></div>';
  }).join("");

  var timelineHtml = timelineItems.map(function(item, i) {
    var time = item.time.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    var delay = Math.min(i * 0.05, 0.5);
    return '<div class="tl-item ' + item.type + '" style="animation-delay:' + delay + 's"><div class="tl-dot"></div><div class="tl-time">' + time + '</div><div class="tl-body"><span class="tl-text">' + esc(item.text) + '</span>' + (item.tool ? '<span class="tl-tool">' + esc(item.tool) + '</span>' : '') + '</div></div>';
  }).join("");

  var peakSection = peakHour != null ? '\n  <div class="section">\n    <div class="card">\n      <div class="card-header"><div class="dot"></div><h2>' + zh("活跃高峰","Peak Activity") + '</h2></div>\n      <div class="peak-badge">&#9716; ' + zh("最活跃时段","Peak hour") + ' <strong>' + String(peakHour).padStart(2,"0") + ':00</strong> &middot; ' + peakHourCount + ' ' + zh("个事件","events") + '</div>\n      ' + (avgEventsPerSession > 0 ? '<span style="margin-left:.8rem;font-size:.85rem;color:var(--muted)">' + zh("平均每会话","avg/session") + ' ' + avgEventsPerSession + ' ' + zh("个事件","events") + '</span>' : '') + '\n    </div>\n  </div>' : '';

  return '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width,initial-scale=1.0">\n<title>Clawd Report ' + esc(dateStr) + '</title>\n' +
'<style>\n' +
'*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}\n' +
':root{--honey:#F5A623;--amber:#D4872C;--amber-dark:#B3681A;--paper:#F8F6F3;--card:#FFFFFF;--ink:#2D3436;--muted:#636E72;--green:#2ECC71;--red:#E74C3C;--border:rgba(213,135,44,0.18);--shadow-sm:0 2px 8px rgba(0,0,0,.04);--shadow-md:0 6px 20px rgba(0,0,0,.06);--shadow-lg:0 16px 40px rgba(0,0,0,.08)}\n' +
'body{font-family:"Noto Sans SC",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--paper);color:var(--ink);line-height:1.6;min-height:100vh;overflow-x:hidden;position:relative}\n' +
'body::before{content:"";position:fixed;inset:0;pointer-events:none;z-index:0;background:radial-gradient(ellipse at 20% 10%,rgba(245,166,35,.06) 0%,transparent 60%),radial-gradient(ellipse at 80% 90%,rgba(212,135,44,.04) 0%,transparent 60%);opacity:.7}\n' +
'.page{max-width:960px;margin:0 auto;padding:2.5rem 1.5rem 1.5rem;position:relative;z-index:1}\n' +
'.hero{position:relative;border-radius:20px 20px 0 0;background:linear-gradient(160deg,#F5A623 0%,#D4872C 40%,#B3681A 100%);padding:3rem 2.5rem;color:#fff;overflow:hidden;box-shadow:var(--shadow-lg)}\n' +
'.hero::after{content:"";position:absolute;inset:0;background:url("data:image/svg+xml,%3Csvg width=\'80\' height=\'80\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23fff\' fill-opacity=\'.06\'%3E%3Ccircle cx=\'40\' cy=\'40\' r=\'1.5\'/%3E%3Ccircle cx=\'20\' cy=\'60\' r=\'1\'/%3E%3Ccircle cx=\'60\' cy=\'20\' r=\'1\'/%3E%3Ccircle cx=\'10\' cy=\'10\' r=\'1.5\'/%3E%3Ccircle cx=\'70\' cy=\'70\' r=\'1.5\'/%3E%3C/g%3E%3C/svg%3E");pointer-events:none}\n' +
'.hero-content{position:relative;z-index:1}\n' +
'.hero-eyebrow{font-size:.8rem;text-transform:uppercase;letter-spacing:.2em;opacity:.75;margin-bottom:.5rem;font-weight:500}\n' +
'.hero h1{font-size:2.6rem;font-weight:800;letter-spacing:-.03em;line-height:1.15;margin-bottom:.4rem}\n' +
'.hero .subtitle{font-size:1.05rem;opacity:.85;font-weight:400}\n' +
'.hero .date-badge{display:inline-block;margin-top:1rem;padding:.35rem 1rem;background:rgba(255,255,255,.18);border-radius:99px;font-size:.85rem;font-weight:500;backdrop-filter:blur(6px)}\n' +
'.stat-row{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--border);border-radius:0 0 20px 20px;overflow:hidden;box-shadow:var(--shadow-md)}\n' +
'.stat-card{background:var(--card);padding:1.5rem 1rem;text-align:center;transition:transform .2s,box-shadow .2s;animation:statIn .5s ease both}\n' +
'.stat-card:nth-child(1){animation-delay:.05s}.stat-card:nth-child(2){animation-delay:.1s}.stat-card:nth-child(3){animation-delay:.15s}.stat-card:nth-child(4){animation-delay:.2s}.stat-card:nth-child(5){animation-delay:.25s}\n' +
'.stat-card:hover{transform:translateY(-2px);box-shadow:var(--shadow-md);position:relative;z-index:2}\n' +
'.stat-icon{font-size:1.4rem;margin-bottom:.3rem;opacity:.7}\n' +
'.stat-value{display:block;font-size:1.8rem;font-weight:700;color:var(--amber);line-height:1.2}\n' +
'.stat-label{font-size:.78rem;color:var(--muted);font-weight:500;margin-top:.2rem}\n' +
'@keyframes statIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}\n' +
'.section{margin-top:1.5rem}\n' +
'.card{background:var(--card);border-radius:14px;padding:1.8rem;box-shadow:var(--shadow-sm);border:1px solid var(--border);transition:box-shadow .25s}\n' +
'.card:hover{box-shadow:var(--shadow-md)}\n' +
'.card-header{display:flex;align-items:center;gap:.6rem;margin-bottom:1.2rem}\n' +
'.card-header .dot{width:5px;height:22px;border-radius:3px;background:linear-gradient(180deg,var(--honey),var(--amber));flex-shrink:0}\n' +
'.card-header h2{font-size:1.15rem;font-weight:700;letter-spacing:-.01em}\n' +
'.bar-row{display:flex;align-items:center;margin-bottom:.65rem;gap:.6rem}\n' +
'.bar-label{width:110px;font-size:.82rem;color:var(--muted);text-align:right;flex-shrink:0;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n' +
'.bar-track{flex:1;background:#F0EDE8;border-radius:5px;height:26px;position:relative;overflow:hidden}\n' +
'.bar-fill{height:100%;border-radius:5px;background:linear-gradient(90deg,var(--honey),var(--amber));transition:width .8s cubic-bezier(.22,.61,.36,1)}\n' +
'.bar-fill::after{content:"";position:absolute;right:0;top:0;bottom:0;width:20px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.25))}\n' +
'.bar-value{position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:.8rem;font-weight:700;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.2)}\n' +
'.timeline{position:relative;padding-left:2rem}\n' +
'.timeline::before{content:"";position:absolute;left:7px;top:4px;bottom:4px;width:2px;background:var(--border);border-radius:1px}\n' +
'.tl-item{position:relative;margin-bottom:.9rem;display:flex;gap:.8rem;align-items:flex-start;animation:tlIn .4s ease both}\n' +
'@keyframes tlIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}\n' +
'.tl-dot{width:16px;height:16px;border-radius:50%;flex-shrink:0;margin-top:2px;position:relative;z-index:1;background:var(--honey);border:3px solid #fff;box-shadow:0 0 0 2px var(--honey)}\n' +
'.tl-item.error .tl-dot{background:var(--red);box-shadow:0 0 0 2px var(--red)}\n' +
'.tl-item.success .tl-dot{background:var(--green);box-shadow:0 0 0 2px var(--green)}\n' +
'.tl-time{font-size:.75rem;color:var(--muted);font-weight:600;white-space:nowrap;min-width:44px;padding-top:1px}\n' +
'.tl-body{flex:1;min-width:0}\n' +
'.tl-text{font-size:.9rem;line-height:1.4}\n' +
'.tl-tool{display:inline-block;margin-top:2px;font-size:.75rem;color:var(--amber);background:rgba(245,166,35,.1);padding:1px 8px;border-radius:4px;font-weight:600;margin-left:6px}\n' +
'.donut-row{display:flex;align-items:center;gap:2rem;flex-wrap:wrap}\n' +
'.donut-wrap{position:relative;width:130px;height:130px;flex-shrink:0}\n' +
'.donut{width:100%;height:100%;border-radius:50%;background:conic-gradient(var(--green) 0deg ' + successDeg + 'deg,var(--red) ' + successDeg + 'deg 360deg);box-shadow:inset 0 0 0 1px rgba(0,0,0,.04)}\n' +
'.donut-hole{position:absolute;inset:24px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.1rem;font-weight:700;flex-direction:column;line-height:1.2}\n' +
'.donut-hole small{font-size:.65rem;color:var(--muted);font-weight:500}\n' +
'.legend{display:flex;flex-direction:column;gap:.5rem}\n' +
'.legend-item{display:flex;align-items:center;gap:.5rem;font-size:.88rem}\n' +
'.legend-dot{width:12px;height:12px;border-radius:3px;flex-shrink:0}\n' +
'.legend-count{font-weight:700;margin-left:auto;min-width:30px;text-align:right}\n' +
'.peak-badge{display:inline-flex;align-items:center;gap:.4rem;background:linear-gradient(135deg,rgba(245,166,35,.1),rgba(212,135,44,.06));border:1px solid var(--border);border-radius:99px;padding:.5rem 1rem;font-size:.88rem;font-weight:600}\n' +
'.peak-badge strong{color:var(--amber)}\n' +
'.footer{text-align:center;padding:2.5rem 1rem 1.5rem;color:var(--muted);font-size:.82rem;opacity:.7}\n' +
'.footer strong{color:var(--amber-dark);font-weight:600}\n' +
'@media(max-width:700px){.page{padding:1rem .75rem .5rem}.hero{padding:2rem 1.5rem;border-radius:14px 14px 0 0}.hero h1{font-size:1.8rem}.stat-row{grid-template-columns:repeat(2,1fr)}.stat-card:nth-child(5){grid-column:span 2}.bar-label{width:80px;font-size:.75rem}.donut-row{flex-direction:column;align-items:flex-start}.card{padding:1.2rem}}\n' +
'@media(max-width:400px){.hero h1{font-size:1.5rem}.hero{padding:1.5rem 1rem}.stat-row{grid-template-columns:1fr}.stat-card:nth-child(5){grid-column:span 1}}\n' +
'</style>\n</head>\n<body>\n<div class="page">\n' +
'<header class="hero"><div class="hero-content"><p class="hero-eyebrow">' + zh("每日编码报告","Daily Coding Report") + '</p><h1>Clawd Report</h1><p class="subtitle">' + zh("Claude Code 会话统计摘要","Claude Code Session Summary") + '</p><span class="date-badge">' + esc(dateStr) + '</span></div></header>\n' +
'<div class="stat-row">\n' +
'<div class="stat-card"><div class="stat-icon">&#9702;</div><span class="stat-value">' + stats.sessions + '</span><span class="stat-label">' + zh("会话","Sessions") + '</span></div>\n' +
'<div class="stat-card"><div class="stat-icon">&#9716;</div><span class="stat-value">' + duration + '</span><span class="stat-label">' + zh("总时长","Duration") + '</span></div>\n' +
'<div class="stat-card"><div class="stat-icon">&#9881;</div><span class="stat-value">' + stats.totalToolCalls + '</span><span class="stat-label">' + zh("工具调用","Tool Calls") + '</span></div>\n' +
'<div class="stat-card"><div class="stat-icon">&#10007;</div><span class="stat-value">' + stats.errors + '</span><span class="stat-label">' + zh("错误","Errors") + '</span></div>\n' +
'<div class="stat-card"><div class="stat-icon">&#10003;</div><span class="stat-value">' + successRate + '%</span><span class="stat-label">' + zh("成功率","Success Rate") + '</span></div>\n' +
'</div>\n' + peakSection + '\n' +
(sortedTools.length > 0 ? '<div class="section"><div class="card"><div class="card-header"><div class="dot"></div><h2>' + zh("工具使用分布","Tool Usage Distribution") + '</h2></div><div class="bar-chart">' + toolBars + '</div></div></div>\n' : '') +
'<div class="section" style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem">\n' +
(timelineItems.length > 0 ? '<div class="card" style="' + (sortedTools.length === 0 ? 'grid-column:span 2' : '') + '"><div class="card-header"><div class="dot"></div><h2>' + zh("事件时间线","Event Timeline") + '</h2></div><div class="timeline">' + timelineHtml + '</div></div>\n' : '') +
'<div class="card" style="' + (timelineItems.length === 0 ? 'grid-column:span 2' : '') + '"><div class="card-header"><div class="dot"></div><h2>' + zh("成功/错误比","Success / Error") + '</h2></div><div class="donut-row"><div class="donut-wrap"><div class="donut"></div><div class="donut-hole">' + successRate + '%<small>' + zh("成功率","rate") + '</small></div></div><div class="legend"><div class="legend-item"><span class="legend-dot" style="background:var(--green)"></span>' + zh("成功","Success") + '<span class="legend-count">' + stats.success + '</span></div><div class="legend-item"><span class="legend-dot" style="background:var(--red)"></span>' + zh("错误","Errors") + '<span class="legend-count">' + stats.errors + '</span></div><div class="legend-item" style="font-size:.78rem;color:var(--muted);margin-top:.2rem">' + zh("总计","Total") + ': ' + successTotal + ' ' + zh("个事件","events") + '</div></div></div></div>\n</div>\n' +
'<footer class="footer"><p>' + zh("由","Generated by") + ' <strong>Clawd Companion</strong> ' + zh("生成","") + '</p></footer>\n</div>\n</body>\n</html>';
}

function renderCumulativeReport(allTimeStats, dailySummaries, allToolCounts, firstDate, lastDate, modelData) {
  var totalDays = dailySummaries.length;
  if (totalDays === 0) return '<!DOCTYPE html><html><body><p>No data</p></body></html>';
  var duration = formatDuration(allTimeStats.durationMs);
  var successTotal = allTimeStats.success + allTimeStats.errors;
  var successRate = successTotal > 0 ? Math.round((allTimeStats.success / successTotal) * 100) : 100;
  var successDeg = Math.round(successRate * 3.6);
  var sortedTools = Object.entries(allToolCounts).sort(function(a, b) { return b[1] - a[1]; });
  var maxToolCount = sortedTools.length > 0 ? sortedTools[0][1] : 1;
  var maxDayCalls = dailySummaries.length > 0 ? Math.max.apply(null, dailySummaries.map(function(d) { return d.toolCalls; })) : 1;
  var avgDailyTools = totalDays > 0 ? Math.round(allTimeStats.totalToolCalls / totalDays) : 0;
  var avgDailySessions = totalDays > 0 ? (allTimeStats.sessions / totalDays).toFixed(1) : "0";
  var avgSessionDurationMs = allTimeStats.sessions > 0 ? Math.round(allTimeStats.durationMs / allTimeStats.sessions) : 0;
  var avgSessionDuration = formatDuration(avgSessionDurationMs);
  var busiestDay = dailySummaries.length > 0 ? dailySummaries.reduce(function(a, b) { return b.toolCalls > a.toolCalls ? b : a; }, dailySummaries[0]) : null;
  var bestDay = dailySummaries.length > 0 ? dailySummaries.reduce(function(a, b) { var ra = (a.success + a.errors) > 0 ? a.success / (a.success + a.errors) : 1; var rb = (b.success + b.errors) > 0 ? b.success / (b.success + b.errors) : 1; return rb > ra ? b : a; }, dailySummaries[0]) : null;

  // ── SVG Line Chart ──
  var chartW = 760, chartH = 210, padL = 50, padR = 20, padT = 16, padB = 30;
  var plotW = chartW - padL - padR, plotH = chartH - padT - padB;
  var yMax = Math.max(maxDayCalls, 1) * 1.15;
  var points = dailySummaries.map(function(d, i) {
    return {
      x: padL + (totalDays > 1 ? (i / (totalDays - 1)) * plotW : plotW / 2),
      y: padT + plotH - (d.toolCalls / yMax) * plotH
    };
  });
  var linePathD = points.map(function(p, i) { return (i === 0 ? "M" : "L") + p.x.toFixed(1) + " " + p.y.toFixed(1); }).join(" ");
  var areaPathD = linePathD + " L" + points[points.length - 1].x.toFixed(1) + " " + (padT + plotH) + " L" + points[0].x.toFixed(1) + " " + (padT + plotH) + " Z";
  var dotCircles = points.map(function(p, i) {
    return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="4" class="lc-dot" style="animation-delay:' + (1.2 + i * 0.08).toFixed(2) + 's" data-val="' + dailySummaries[i].toolCalls + '"><title>' + esc(dailySummaries[i].date) + ': ' + dailySummaries[i].toolCalls + '</title></circle>';
  }).join("\n");
  var yTicks = [0, Math.round(yMax / 4), Math.round(yMax / 2), Math.round(3 * yMax / 4), Math.round(yMax)];
  var yGrid = yTicks.map(function(v) {
    var y = padT + plotH - (v / yMax) * plotH;
    return '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (padL + plotW) + '" y2="' + y.toFixed(1) + '" class="lc-grid"/><text x="' + (padL - 8) + '" y="' + (y + 4).toFixed(1) + '" class="lc-ylbl">' + v + '</text>';
  }).join("\n");
  var xLabels = dailySummaries.map(function(d, i) {
    var x = totalDays > 1 ? padL + (i / (totalDays - 1)) * plotW : padL + plotW / 2;
    return '<text x="' + x.toFixed(1) + '" y="' + (chartH - 6) + '" class="lc-xlbl">' + d.date.slice(5) + '</text>';
  }).join("\n");

  // ── HTML components ──
  var toolBars = sortedTools.map(function(pair) {
    var name = pair[0], count = pair[1];
    return '<div class="bar-row"><span class="bar-label">' + esc(name) + '</span><div class="bar-track"><div class="bar-fill anim-bar" data-pct="' + Math.round((count / maxToolCount) * 100) + '"></div><span class="bar-value anim-num" data-target="' + count + '">0</span></div></div>';
  }).join("");

  var datePills = dailySummaries.map(function(d, i) {
    return '<button class="date-pill" data-date="' + esc(d.date) + '">' + d.date.slice(5) + '<small>' + d.sessions + 's</small></button>';
  }).join("");

  var detailPanels = dailySummaries.map(function(d) {
    var dd = allTimeStats.dailyDetails ? allTimeStats.dailyDetails[d.date] : null;
    if (!dd) return "";
    var ddDuration = formatDuration(dd.durationMs);
    var ddSuccessTotal = dd.success + dd.errors;
    var ddSuccessRate = ddSuccessTotal > 0 ? Math.round((dd.success / ddSuccessTotal) * 100) : 100;
    var ddSortedTools = Object.entries(dd.toolCounts || {}).sort(function(a, b) { return b[1] - a[1]; });
    var ddMaxTool = ddSortedTools.length > 0 ? ddSortedTools[0][1] : 1;
    var ddToolBars = ddSortedTools.map(function(pair) {
      var name = pair[0], count = pair[1];
      return '<div class="bar-row"><span class="bar-label">' + esc(name) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + Math.round((count / ddMaxTool) * 100) + '%"></div><span class="bar-value">' + count + '</span></div></div>';
    }).join("");
    var ddTimeline = (dd.timeline || []).slice(-12).map(function(item, i) {
      var time = new Date(item.time).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
      return '<div class="tl-item ' + item.type + '" style="animation-delay:' + (0.6 + i * 0.04).toFixed(2) + 's"><div class="tl-dot"></div><div class="tl-time">' + time + '</div><div class="tl-body"><span class="tl-text">' + esc(item.text) + '</span>' + (item.tool ? '<span class="tl-tool">' + esc(item.tool) + '</span>' : '') + '</div></div>';
    }).join("");
    return '<div class="daily-detail" id="detail-' + esc(d.date) + '"><div class="detail-inner"><div class="detail-stat-row"><div class="dstat"><strong>' + dd.sessions + '</strong><small>' + zh("会话","Sess") + '</small></div><div class="dstat"><strong>' + ddDuration + '</strong><small>' + zh("时长","Dur") + '</small></div><div class="dstat"><strong>' + dd.totalToolCalls + '</strong><small>' + zh("工具","Tools") + '</small></div><div class="dstat"><strong>' + dd.errors + '</strong><small>' + zh("错误","Err") + '</small></div><div class="dstat"><strong>' + ddSuccessRate + '%</strong><small>' + zh("成功率","Rate") + '</small></div></div>' + (ddToolBars ? '<div class="detail-tools"><h4>' + zh("工具使用","Tool Usage") + '</h4>' + ddToolBars + '</div>' : '') + (ddTimeline ? '<div class="detail-timeline"><h4>' + zh("事件时间线","Timeline") + '</h4><div class="timeline">' + ddTimeline + '</div></div>' : '') + '</div></div>';
  }).join("");

  var daysGridHtml = dailySummaries.slice().reverse().map(function(d) {
    var dd = allTimeStats.dailyDetails ? allTimeStats.dailyDetails[d.date] : null;
    var ddDur = dd ? formatDuration(dd.durationMs) : "0m";
    var ddSuccessTotal = dd ? (dd.success + dd.errors) : 1;
    var ddSR = dd ? Math.round((dd.success / Math.max(ddSuccessTotal, 1)) * 100) : 0;
    return '<div class="day-summary-card" onclick="selectDate(\'' + esc(d.date) + '\')"><div class="ds-date">' + esc(d.date) + '</div><div class="ds-stats"><span>' + d.sessions + '</span>s &middot; <span>' + ddDur + '</span> &middot; <span>' + d.toolCalls + '</span>t &middot; <span>' + ddSR + '%</span></div><div class="ds-top">Top: ' + esc(d.topTool || "-") + ' (' + (d.topToolCount || 0) + ')</div></div>';
  }).join("");

  return '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width,initial-scale=1.0">\n<title>Clawd Cumulative Report</title>\n' +
'<style>\n' +
'*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}\n' +
':root{--honey:#F5A623;--amber:#D4872C;--amber-dark:#B3681A;--paper:#F8F6F3;--card:#FFF;--ink:#2D3436;--muted:#636E72;--green:#2ECC71;--red:#E74C3C;--border:rgba(213,135,44,.18);--shadow-sm:0 2px 8px rgba(0,0,0,.04);--shadow-md:0 6px 20px rgba(0,0,0,.06);--shadow-lg:0 16px 40px rgba(0,0,0,.08);--radius-sm:8px;--radius-md:14px;--radius-lg:20px}\n' +
'body{font-family:"Noto Sans SC",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--paper);color:var(--ink);line-height:1.6;min-height:100vh;overflow-x:hidden}\n' +
'body::before{content:"";position:fixed;inset:0;pointer-events:none;z-index:0;background:radial-gradient(ellipse at 20% 10%,rgba(245,166,35,.06) 0%,transparent 60%),radial-gradient(ellipse at 80% 90%,rgba(212,135,44,.04) 0%,transparent 60%);opacity:.7}\n' +
'.page{max-width:1040px;margin:0 auto;padding:2.5rem 1.5rem 1.5rem;position:relative;z-index:1}\n' +
'.hero{position:relative;display:flex;align-items:center;justify-content:space-between;gap:2rem;border-radius:var(--radius-lg) var(--radius-lg) 0 0;background:linear-gradient(160deg,#F5A623 0%,#D4872C 40%,#B3681A 100%);padding:3.2rem 2.8rem;color:#fff;overflow:hidden;box-shadow:var(--shadow-lg);animation:heroIn .6s ease}\n' +
'.hero::after{content:"";position:absolute;inset:0;background:url("data:image/svg+xml,%3Csvg width=\'80\' height=\'80\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23fff\' fill-opacity=\'.06\'%3E%3Ccircle cx=\'40\' cy=\'40\' r=\'1.5\'/%3E%3Ccircle cx=\'20\' cy=\'60\' r=\'1\'/%3E%3Ccircle cx=\'60\' cy=\'20\' r=\'1\'/%3E%3Ccircle cx=\'10\' cy=\'10\' r=\'1.5\'/%3E%3Ccircle cx=\'70\' cy=\'70\' r=\'1.5\'/%3E%3C/g%3E%3C/svg%3E");pointer-events:none}\n' +
'.hero-content{position:relative;z-index:1;flex:1;min-width:0}\n' +
'.hero-eyebrow{font-size:.8rem;text-transform:uppercase;letter-spacing:.22em;opacity:.7;margin-bottom:.5rem;font-weight:500}\n' +
'.hero h1{font-size:2.6rem;font-weight:800;letter-spacing:-.03em;line-height:1.12;margin-bottom:.5rem}\n' +
'.hero .subtitle{font-size:1.05rem;opacity:.82;font-weight:400}\n' +
'.hero .date-range{display:inline-block;margin-top:1rem;padding:.4rem 1.1rem;background:rgba(255,255,255,.16);border-radius:99px;font-size:.85rem;font-weight:500;backdrop-filter:blur(6px)}\n' +
'@keyframes heroIn{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:translateY(0)}}\n' +
'.stat-row{display:grid;grid-template-columns:repeat(6,1fr);gap:1px;background:var(--border);border-radius:0 0 var(--radius-lg) var(--radius-lg);overflow:hidden;box-shadow:var(--shadow-md)}\n' +
'.stat-card{background:var(--card);padding:1.4rem .8rem;text-align:center;transition:transform .2s,box-shadow .2s;animation:statIn .5s ease both}\n' +
'.stat-card:nth-child(1){animation-delay:.08s}.stat-card:nth-child(2){animation-delay:.14s}.stat-card:nth-child(3){animation-delay:.2s}.stat-card:nth-child(4){animation-delay:.26s}.stat-card:nth-child(5){animation-delay:.32s}.stat-card:nth-child(6){animation-delay:.38s}\n' +
'.stat-card:hover{transform:translateY(-2px);box-shadow:var(--shadow-md);position:relative;z-index:2}\n' +
'.stat-icon{font-size:1.3rem;margin-bottom:.2rem;opacity:.65}\n' +
'.stat-value{display:block;font-size:1.7rem;font-weight:700;color:var(--amber);line-height:1.15}\n' +
'.stat-label{font-size:.74rem;color:var(--muted);font-weight:500;margin-top:.15rem}\n' +
'@keyframes statIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}\n' +
'.section{margin-top:1.5rem}\n' +
'.card{background:var(--card);border-radius:var(--radius-md);padding:1.8rem;box-shadow:var(--shadow-sm);border:1px solid var(--border);animation:cardIn .5s ease both}\n' +
'.card:nth-child(1){animation-delay:.15s}.card:nth-child(2){animation-delay:.25s}.card:nth-child(3){animation-delay:.35s}\n' +
'@keyframes cardIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}\n' +
'.card-header{display:flex;align-items:center;gap:.6rem;margin-bottom:1.2rem}\n' +
'.card-header .dot{width:5px;height:22px;border-radius:3px;background:linear-gradient(180deg,var(--honey),var(--amber));flex-shrink:0}\n' +
'.card-header h2{font-size:1.15rem;font-weight:700;letter-spacing:-.01em}\n' +
'.bar-row{display:flex;align-items:center;margin-bottom:.5rem;gap:.6rem}\n' +
'.bar-label{width:105px;font-size:.8rem;color:var(--muted);text-align:right;flex-shrink:0;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n' +
'.bar-track{flex:1;background:#F0EDE8;border-radius:5px;height:22px;position:relative;overflow:hidden}\n' +
'.bar-fill{height:100%;border-radius:5px;background:linear-gradient(90deg,var(--honey),var(--amber));transition:width 1.4s cubic-bezier(.22,.61,.36,1);width:0}\n' +
'.bar-fill.anim-bar{width:0}\n' +
'.bar-fill::after{content:"";position:absolute;right:0;top:0;bottom:0;width:16px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.22))}\n' +
'.bar-value{position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:.76rem;font-weight:700;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.18)}\n' +
'.timeline{position:relative;padding-left:1.6rem}\n' +
'.timeline::before{content:"";position:absolute;left:6px;top:4px;bottom:4px;width:2px;background:var(--border);border-radius:1px}\n' +
'.tl-item{position:relative;margin-bottom:.6rem;display:flex;gap:.6rem;align-items:flex-start;animation:tlIn .4s ease both}\n' +
'@keyframes tlIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}\n' +
'.tl-dot{width:13px;height:13px;border-radius:50%;flex-shrink:0;margin-top:3px;position:relative;z-index:1;background:var(--honey);border:2.5px solid #fff;box-shadow:0 0 0 2px var(--honey)}\n' +
'.tl-item.error .tl-dot{background:var(--red);box-shadow:0 0 0 2px var(--red)}\n' +
'.tl-item.success .tl-dot{background:var(--green);box-shadow:0 0 0 2px var(--green)}\n' +
'.tl-time{font-size:.7rem;color:var(--muted);font-weight:600;white-space:nowrap;min-width:40px;padding-top:1px}\n' +
'.tl-text{font-size:.84rem;line-height:1.3}\n' +
'.tl-tool{display:inline-block;margin-top:1px;font-size:.68rem;color:var(--amber);background:rgba(245,166,35,.1);padding:1px 6px;border-radius:3px;font-weight:600;margin-left:4px}\n' +
'.donut-row{display:flex;align-items:center;gap:2.2rem;flex-wrap:wrap}\n' +
'.donut-wrap{position:relative;width:140px;height:140px;flex-shrink:0}\n' +
'.donut{width:100%;height:100%;border-radius:50%;background:conic-gradient(var(--green) 0deg 0deg,var(--red) 0deg 360deg);box-shadow:inset 0 0 0 1px rgba(0,0,0,.04);transition:background .3s}\n' +
'.donut-hole{position:absolute;inset:26px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.15rem;font-weight:700;flex-direction:column;line-height:1.15}\n' +
'.donut-hole small{font-size:.62rem;color:var(--muted);font-weight:500}\n' +
'.legend{display:flex;flex-direction:column;gap:.4rem}\n' +
'.legend-item{display:flex;align-items:center;gap:.5rem;font-size:.85rem}\n' +
'.legend-dot{width:11px;height:11px;border-radius:3px;flex-shrink:0}\n' +
'.legend-count{font-weight:700;margin-left:auto;min-width:28px;text-align:right}\n' +
'.date-pills-wrap{overflow-x:auto;padding-bottom:.4rem;-webkit-overflow-scrolling:touch;scrollbar-width:thin}\n' +
'.date-pills-wrap::-webkit-scrollbar{height:4px}\n' +
'.date-pills-wrap::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}\n' +
'.date-pills{display:flex;gap:.35rem;flex-wrap:nowrap}\n' +
'.date-pill{flex-shrink:0;padding:.4rem .8rem;border:1px solid var(--border);border-radius:99px;background:var(--card);color:var(--ink);font-size:.8rem;font-weight:600;cursor:pointer;transition:all .2s;white-space:nowrap;display:flex;align-items:center;gap:.25rem}\n' +
'.date-pill:hover{border-color:var(--honey);background:rgba(245,166,35,.06)}\n' +
'.date-pill.active{background:var(--amber);color:#fff;border-color:var(--amber);box-shadow:0 4px 12px rgba(212,135,44,.3)}\n' +
'.date-pill small{font-size:.65rem;opacity:.6;font-weight:400}\n' +
'.date-pill.active small{opacity:.85}\n' +
'.daily-detail{margin-top:.8rem;animation-fill-mode:both}\n' +
'.detail-inner{animation:fadeIn .35s ease}\n' +
'@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}\n' +
'.detail-stat-row{display:grid;grid-template-columns:repeat(5,1fr);gap:.5rem;margin-bottom:.8rem}\n' +
'.dstat{text-align:center;padding:.55rem;background:rgba(245,166,35,.05);border-radius:var(--radius-sm);border:1px solid var(--border)}\n' +
'.dstat strong{display:block;font-size:1.05rem;color:var(--amber);font-weight:700}\n' +
'.dstat small{font-size:.68rem;color:var(--muted)}\n' +
'.detail-tools h4,.detail-timeline h4{font-size:.85rem;font-weight:600;margin-bottom:.5rem;color:var(--muted)}\n' +
'.days-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:.5rem}\n' +
'.day-summary-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.9rem;cursor:pointer;transition:all .2s}\n' +
'.day-summary-card:hover{border-color:var(--honey);box-shadow:var(--shadow-md);transform:translateY(-2px)}\n' +
'.day-summary-card .ds-date{font-size:.82rem;font-weight:700;margin-bottom:.35rem;color:var(--ink)}\n' +
'.day-summary-card .ds-stats{display:flex;gap:.5rem;flex-wrap:wrap;font-size:.73rem;color:var(--muted)}\n' +
'.day-summary-card .ds-stats span{font-weight:600;color:var(--amber)}\n' +
'.day-summary-card .ds-top{font-size:.7rem;color:var(--muted);margin-top:.35rem;padding-top:.35rem;border-top:1px solid var(--border)}\n' +
'.insight-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:.8rem}\n' +
'.insight-item{text-align:center;padding:.6rem;border-radius:var(--radius-sm);background:rgba(245,166,35,.04)}\n' +
'.insight-item .val{font-size:1.2rem;font-weight:700;color:var(--amber);display:block}\n' +
'.insight-item .lbl{font-size:.72rem;color:var(--muted);margin-top:.1rem}\n' +
'.lc-chart{width:100%;overflow-x:auto}\n' +
'.lc-chart svg{display:block}\n' +
'.lc-grid{stroke:var(--border);stroke-width:1;stroke-dasharray:4 4}\n' +
'.lc-ylbl{font-size:10px;fill:var(--muted);text-anchor:end}\n' +
'.lc-xlbl{font-size:9px;fill:var(--muted);text-anchor:middle}\n' +
'.lc-line{fill:none;stroke:var(--amber);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1200;stroke-dashoffset:1200;animation:drawLine 1.6s .5s ease forwards}\n' +
'.lc-area{fill:url(#lcGrad);animation:fadeIn .8s 1.1s ease both}\n' +
'@keyframes drawLine{to{stroke-dashoffset:0}}\n' +
'.lc-dot{fill:#fff;stroke:var(--amber);stroke-width:2;opacity:0;animation:dotIn .4s ease forwards}\n' +
'@keyframes dotIn{to{opacity:1}}\n' +
'.model-table-wrap{overflow-x:auto}\n' +
'.model-table{width:100%;border-collapse:collapse;font-size:.88rem}\n' +
'.model-table th{text-align:left;font-weight:600;color:var(--muted);font-size:.76rem;text-transform:uppercase;letter-spacing:.04em;padding:0 12px 8px;border-bottom:2px solid var(--border)}\n' +
'.model-table th.num{text-align:right}\n' +
'.model-table td{padding:8px 12px;border-bottom:1px solid var(--border)}\n' +
'.model-table td.num{text-align:right;font-variant-numeric:tabular-nums;font-weight:500}\n' +
'.model-table tbody tr{transition:background .15s}\n' +
'.model-table tbody tr:hover{background:rgba(245,166,35,.05)}\n' +
'.model-name{font-weight:600;color:var(--ink)}\n' +
'.footer{text-align:center;padding:2.5rem 1rem 1.5rem;color:var(--muted);font-size:.82rem;opacity:.65}\n' +
'.footer strong{color:var(--amber-dark);font-weight:600}\n' +
'.footer-links{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:8px;font-size:.78rem}\n' +
'.footer-links a{color:var(--amber-dark);text-decoration:none;font-weight:600;transition:opacity .15s}\n' +
'.footer-links a:hover{opacity:.7}\n' +
'.footer-sep{color:var(--muted);opacity:.4}\n' +
'.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem}\n' +
'.span-2{grid-column:span 2}\n' +
'@media(max-width:750px){.page{padding:1rem .5rem .5rem}.hero{padding:2rem 1.2rem;border-radius:var(--radius-md) var(--radius-md) 0 0}.hero h1{font-size:1.8rem}.hero-mascot{display:none}.stat-row{grid-template-columns:repeat(3,1fr)}.grid-2{grid-template-columns:1fr}.span-2{grid-column:span 1}.insight-grid{grid-template-columns:repeat(2,1fr)}.detail-stat-row{grid-template-columns:repeat(3,1fr)}.bar-label{width:70px;font-size:.7rem}.days-grid{grid-template-columns:1fr}.donut-row{flex-direction:column;align-items:flex-start}}\n' +
'</style>\n</head>\n<body>\n<div class="page">\n' +
'<header class="hero"><div class="hero-content"><p class="hero-eyebrow">' + zh('累计编码报告','Cumulative Report') + '</p><h1>Clawd Report</h1><p class="subtitle">' + zh('全部编码活动统计','All-Time Coding Activity Summary') + '</p><span class="date-range">' + esc(firstDate) + ' — ' + esc(lastDate) + ' &middot; ' + totalDays + ' ' + zh('天','days') + '</span></div></header>\n' +
'<div class="stat-row">\n' +
'<div class="stat-card"><div class="stat-icon">&#9702;</div><span class="stat-value anim-num" data-target="' + allTimeStats.sessions + '">0</span><span class="stat-label">' + zh('总会话','Sessions') + '</span></div>\n' +
'<div class="stat-card"><div class="stat-icon">&#9716;</div><span class="stat-value anim-num" data-target="' + totalDays + '">0</span><span class="stat-label">' + zh('总天数','Days') + '</span></div>\n' +
'<div class="stat-card"><div class="stat-icon">&#9881;</div><span class="stat-value anim-num" data-target="' + allTimeStats.totalToolCalls + '">0</span><span class="stat-label">' + zh('工具调用','Tool Calls') + '</span></div>\n' +
'<div class="stat-card"><div class="stat-icon">&#10007;</div><span class="stat-value anim-num" data-target="' + allTimeStats.errors + '">0</span><span class="stat-label">' + zh('错误','Errors') + '</span></div>\n' +
'<div class="stat-card"><div class="stat-icon">&#9716;</div><span class="stat-value">' + duration + '</span><span class="stat-label">' + zh('总时长','Duration') + '</span></div>\n' +
'<div class="stat-card"><div class="stat-icon">&#10003;</div><span class="stat-value anim-pct" data-target="' + successRate + '">0%</span><span class="stat-label">' + zh('成功率','Success') + '</span></div>\n' +
'</div>\n' +

'<div class="section"><div class="card"><div class="card-header"><div class="dot"></div><h2>' + zh('数据洞察','Insights') + '</h2></div><div class="insight-grid">\n' +
'<div class="insight-item"><span class="val anim-num" data-target="' + avgDailyTools + '">0</span><span class="lbl">' + zh('日均工具调用','Avg tools/day') + '</span></div>\n' +
'<div class="insight-item"><span class="val">' + avgDailySessions + '</span><span class="lbl">' + zh('日均会话','Avg sessions/day') + '</span></div>\n' +
'<div class="insight-item"><span class="val">' + avgSessionDuration + '</span><span class="lbl">' + zh('平均会话时长','Avg session dur.') + '</span></div>\n' +
(busiestDay ? '<div class="insight-item"><span class="val" style="font-size:1rem">' + esc(busiestDay.date) + '</span><span class="lbl">' + zh('最高产日','Busiest day') + ' (' + busiestDay.toolCalls + ' ' + zh('次','t') + ')</span></div>\n' : '') +
(bestDay && bestDay.date !== (busiestDay ? busiestDay.date : "") ? '<div class="insight-item"><span class="val" style="font-size:.95rem">' + esc(bestDay.date) + '</span><span class="lbl">' + zh('最佳日','Best day') + ' (' + Math.round((bestDay.success / Math.max(bestDay.success + bestDay.errors, 1)) * 100) + '%)</span></div>\n' : '') +
'</div></div></div>\n' +

// Model usage section
(modelData && modelData.modelTotals && modelData.modelTotals.length > 0 ? '<div class="section"><div class="card"><div class="card-header"><div class="dot"></div><h2>' + zh('模型用量统计','Model Usage') + ' &middot; ' + modelData.modelTotals.length + ' ' + zh('个模型','models') + '</h2></div><div class="model-table-wrap"><table class="model-table"><thead><tr><th>' + zh('模型','Model') + '</th><th class="num">Tokens</th><th class="num">' + zh('会话','Sessions') + '</th><th class="num">' + zh('消息','Messages') + '</th></tr></thead><tbody>' + modelData.modelTotals.map(function(m, mi) { return '<tr style="animation:fadeIn .3s ' + (mi * 0.04).toFixed(2) + 's ease both"><td><span class="model-name">' + esc(m.model) + '</span></td><td class="num">' + formatTokens(m.totalTokens) + '</td><td class="num">' + (m.sessionCount || 0) + '</td><td class="num">' + (m.messageCount || 0) + '</td></tr>'; }).join("") + '</tbody></table></div></div></div>\n' : '') +

(dailySummaries.length > 1 ? '<div class="section"><div class="card"><div class="card-header"><div class="dot"></div><h2>' + zh('每日工具调用趋势','Daily Tool Calls Trend') + '</h2></div><div class="lc-chart">\n<svg viewBox="0 0 ' + chartW + ' ' + chartH + '" width="100%" height="auto" preserveAspectRatio="xMidYMid meet">\n<defs><linearGradient id="lcGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#F5A623" stop-opacity=".25"/><stop offset="100%" stop-color="#F5A623" stop-opacity=".02"/></linearGradient></defs>\n' + yGrid + '\n' + xLabels + '\n<path d="' + areaPathD + '" class="lc-area"/>\n<path d="' + linePathD + '" class="lc-line"/>\n' + dotCircles + '\n</svg></div></div></div>\n' : '') +

'<div class="section grid-2">\n' +
(sortedTools.length > 0 ? '<div class="card"><div class="card-header"><div class="dot"></div><h2>' + zh('工具使用分布','Tool Distribution') + '</h2></div><div class="bar-chart">' + toolBars + '</div></div>\n' : '') +
'<div class="card"><div class="card-header"><div class="dot"></div><h2>' + zh('成功/错误比','Success / Error') + '</h2></div><div class="donut-row"><div class="donut-wrap"><div class="donut" id="donut"></div><div class="donut-hole"><span id="donut-pct">0%</span><small>' + zh('成功率','success') + '</small></div></div><div class="legend"><div class="legend-item"><span class="legend-dot" style="background:var(--green)"></span>' + zh('成功','Success') + '<span class="legend-count anim-num" data-target="' + allTimeStats.success + '">0</span></div><div class="legend-item"><span class="legend-dot" style="background:var(--red)"></span>' + zh('错误','Errors') + '<span class="legend-count anim-num" data-target="' + allTimeStats.errors + '">0</span></div><div class="legend-item" style="font-size:.72rem;color:var(--muted);margin-top:.2rem">' + zh('总计','Total') + ': <span class="anim-num" data-target="' + successTotal + '">0</span> ' + zh('个事件','events') + '</div></div></div></div>\n</div>\n' +

(dailySummaries.length > 0 ? '<div class="section"><div class="card"><div class="card-header"><div class="dot"></div><h2>' + zh('按日期浏览','Browse by Date') + '</h2></div><div class="date-pills-wrap"><div class="date-pills" id="date-pills">' + datePills + '</div></div><div id="daily-details">' + detailPanels + '</div></div></div>\n' : '') +

(dailySummaries.length > 0 ? '<div class="section"><div class="card"><div class="card-header"><div class="dot"></div><h2>' + zh('每日总览','All Days') + '</h2></div><div class="days-grid">' + daysGridHtml + '</div></div></div>\n' : '') +

'<footer class="footer"><p>' + zh('由','Generated by') + ' <strong>Clawd Companion</strong> ' + zh('生成','') + '</p>' + (function(){var v=process.env.CLAWD_APP_VERSION;return v?'<div class="footer-links"><span>v'+esc(v)+'</span><span class="footer-sep">&middot;</span><a href="https://github.com/Doulor/Clawd-Companion" target="_blank" rel="noopener"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style="vertical-align:-2px;margin-right:3px"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>GitHub</a></div>':''})()+'</footer>\n</div>\n' +

'<script>\n' +
'(function(){var T=' + successDeg + ',SR=' + successRate + ',t0=performance.now();\n' +
'function ease(t){return t<.5?2*t*t:-1+(4-2*t)*t}\n' +
'function anim(ms,cb){var d=performance.now()-t0,l=Math.min(d/ms,1),p=ease(l);cb(p,l>=1);if(l<1)requestAnimationFrame(function(){anim(ms,cb)})}\n' +
'var donut=document.getElementById("donut"),dp=document.getElementById("donut-pct");\n' +
'if(donut)anim(1500,function(p){var d=Math.round(p*T);donut.style.background="conic-gradient(var(--green) 0deg "+d+"deg,var(--red) "+d+"deg 360deg)";dp.textContent=Math.round(p*SR)+"%"});\n' +
'document.querySelectorAll(".anim-num").forEach(function(el){var t=parseFloat(el.dataset.target)||0;if(t%1!==0)return;anim(1400,function(p,done){el.textContent=done?t:Math.max(0,Math.round(p*t))})});\n' +
'document.querySelectorAll(".anim-pct").forEach(function(el){var t=parseFloat(el.dataset.target)||0;anim(1400,function(p,done){el.textContent=(done?Math.round(t):Math.max(0,Math.round(p*t)))+"%"})});\n' +
'setTimeout(function(){document.querySelectorAll(".anim-bar").forEach(function(el){el.style.width=(el.dataset.pct||0)+"%"})},400);\n' +
'var datePills=document.querySelectorAll(".date-pill");\n' +
'function selectDate(date){datePills.forEach(function(p){p.classList.remove("active")});var pill=document.querySelector(".date-pill[data-date=\\""+date+"\\"]");if(pill)pill.classList.add("active");document.querySelectorAll(".daily-detail").forEach(function(d){d.style.display="none"});var detail=document.getElementById("detail-"+date);if(detail){detail.style.display="block";detail.scrollIntoView({behavior:"smooth",block:"nearest"})}document.querySelector(".date-pills").scrollTo({left:pill?pill.offsetLeft-40:0,behavior:"smooth"})}\n' +
'datePills.forEach(function(pill){pill.addEventListener("click",function(){selectDate(this.dataset.date)})});\n' +
'})();\n' +
'</script>\n</body>\n</html>';
}
