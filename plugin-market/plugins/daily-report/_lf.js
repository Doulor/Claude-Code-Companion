// Report HTML templates for the Daily Report plugin
// These are used by index.js to generate beautiful self-contained HTML reports

function formatDuration(ms) {
  if (ms <= 0) return "0m";
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function zh(zh, en) { return zh; }
function formatDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

function renderDailyReport(stats, day, maxTimeline) {
  const dateStr = formatDate(day);
  const duration = formatDuration(stats.durationMs);
  const successTotal = stats.success + stats.errors;
  const successRate = successTotal > 0 ? Math.round((stats.success / successTotal) * 100) : 100;
  const successDeg = Math.round(successRate * 3.6);
  const sortedTools = Object.entries(stats.toolCounts).sort((a, b) => b[1] - a[1]);
  const maxToolCount = sortedTools.length > 0 ? sortedTools[0][1] : 1;
  const timelineItems = stats.timeline.slice(-maxTimeline);
  const peakHour = stats.peakHour ?? null;
  const peakHourCount = stats.peakHourCount ?? 0;
  const avgEventsPerSession = stats.sessions > 0 ? Math.round((stats.totalToolCalls + stats.success + stats.errors) / stats.sessions) : 0;

  const toolBars = sortedTools.map(([name, count]) => {
    const pct = Math.round((count / maxToolCount) * 100);
    return `<div class="bar-row"><span class="bar-label">${esc(name)}</span><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div><span class="bar-value">${count}</span></div></div>`;
  }).join("");

  const timelineHtml = timelineItems.map((item, i) => {
    const time = item.time.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    const delay = Math.min(i * 0.05, 0.5);
    return `<div class="tl-item ${item.type}" style="animation-delay:${delay}s"><div class="tl-dot"></div><div class="tl-time">${time}</div><div class="tl-body"><span class="tl-text">${esc(item.text)}</span>${item.tool ? `<span class="tl-tool">${esc(item.tool)}</span>` : ""}</div></div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Clawd Report ${esc(dateStr)}</title>
<style>
  *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
  :root{
    --honey:#F5A623;--amber:#D4872C;--amber-dark:#B3681A;
    --paper:#F8F6F3;--card:#FFFFFF;--ink:#2D3436;--muted:#636E72;
    --green:#2ECC71;--red:#E74C3C;--border:rgba(213,135,44,0.18);
    --shadow-sm:0 2px 8px rgba(0,0,0,.04);
    --shadow-md:0 6px 20px rgba(0,0,0,.06);
    --shadow-lg:0 16px 40px rgba(0,0,0,.08);
    --radius-sm:8px;--radius-md:14px;--radius-lg:20px;
  }
  body{
    font-family:"Noto Sans SC",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    background:var(--paper);
    color:var(--ink);
    line-height:1.6;
    min-height:100vh;
    position:relative;
    overflow-x:hidden;
  }
  body::before{
    content:"";position:fixed;inset:0;pointer-events:none;z-index:0;
    background:radial-gradient(ellipse at 20% 10%,rgba(245,166,35,.06) 0%,transparent 60%),
               radial-gradient(ellipse at 80% 90%,rgba(212,135,44,.04) 0%,transparent 60%);
    opacity:.7;
  }
  .page{max-width:960px;margin:0 auto;padding:2.5rem 1.5rem 1.5rem;position:relative;z-index:1}

  /* Hero */
  .hero{
    position:relative;border-radius:var(--radius-lg) var(--radius-lg) 0 0;
    background:linear-gradient(160deg,#F5A623 0%,#D4872C 40%,#B3681A 100%);
    padding:3rem 2.5rem;color:#fff;overflow:hidden;
    box-shadow:var(--shadow-lg);
  }
  .hero::after{
    content:"";position:absolute;inset:0;
    background:url("data:image/svg+xml,%3Csvg width='80' height='80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23fff' fill-opacity='.06'%3E%3Ccircle cx='40' cy='40' r='1.5'/%3E%3Ccircle cx='20' cy='60' r='1'/%3E%3Ccircle cx='60' cy='20' r='1'/%3E%3Ccircle cx='10' cy='10' r='1.5'/%3E%3Ccircle cx='70' cy='70' r='1.5'/%3E%3C/g%3E%3C/svg%3E");
    pointer-events:none;
  }
  .hero-content{position:relative;z-index:1}
  .hero-eyebrow{font-size:.8rem;text-transform:uppercase;letter-spacing:.2em;opacity:.75;margin-bottom:.5rem;font-weight:500}
  .hero h1{font-size:2.6rem;font-weight:800;letter-spacing:-.03em;line-height:1.15;margin-bottom:.4rem}
  .hero .subtitle{font-size:1.05rem;opacity:.85;font-weight:400}
  .hero .date-badge{display:inline-block;margin-top:1rem;padding:.35rem 1rem;background:rgba(255,255,255,.18);border-radius:99px;font-size:.85rem;font-weight:500;backdrop-filter:blur(6px)}

  /* Stat Row */
  .stat-row{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--border);border-radius:0 0 var(--radius-lg) var(--radius-lg);overflow:hidden;box-shadow:var(--shadow-md)}
  .stat-card{
    background:var(--card);padding:1.5rem 1rem;text-align:center;
    transition:transform .2s,box-shadow .2s;
    animation:statIn .5s ease both;
  }
  .stat-card:nth-child(1){animation-delay:.05s}
  .stat-card:nth-child(2){animation-delay:.1s}
  .stat-card:nth-child(3){animation-delay:.15s}
  .stat-card:nth-child(4){animation-delay:.2s}
  .stat-card:nth-child(5){animation-delay:.25s}
  .stat-card:hover{transform:translateY(-2px);box-shadow:var(--shadow-md);position:relative;z-index:2}
  .stat-icon{font-size:1.4rem;margin-bottom:.3rem;opacity:.7}
  .stat-value{display:block;font-size:1.8rem;font-weight:700;color:var(--amber);line-height:1.2}
  .stat-label{font-size:.78rem;color:var(--muted);font-weight:500;margin-top:.2rem}
  @keyframes statIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}

  /* Sections */
  .section{margin-top:1.5rem}
  .card{
    background:var(--card);border-radius:var(--radius-md);padding:1.8rem;
    box-shadow:var(--shadow-sm);border:1px solid var(--border);
    transition:box-shadow .25s;
  }
  .card:hover{box-shadow:var(--shadow-md)}
  .card-header{display:flex;align-items:center;gap:.6rem;margin-bottom:1.2rem}
  .card-header .dot{width:5px;height:22px;border-radius:3px;background:linear-gradient(180deg,var(--honey),var(--amber));flex-shrink:0}
  .card-header h2{font-size:1.15rem;font-weight:700;letter-spacing:-.01em}

  /* Tool Bars */
  .bar-row{display:flex;align-items:center;margin-bottom:.65rem;gap:.6rem}
  .bar-label{width:110px;font-size:.82rem;color:var(--muted);text-align:right;flex-shrink:0;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bar-track{flex:1;background:#F0EDE8;border-radius:5px;height:26px;position:relative;overflow:hidden}
  .bar-fill{height:100%;border-radius:5px;background:linear-gradient(90deg,var(--honey),var(--amber));transition:width .8s cubic-bezier(.22,.61,.36,1);position:relative}
  .bar-fill::after{content:"";position:absolute;right:0;top:0;bottom:0;width:20px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.25))}
  .bar-value{position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:.8rem;font-weight:700;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.2)}

  /* Timeline */
  .timeline{position:relative;padding-left:2rem}
  .timeline::before{content:"";position:absolute;left:7px;top:4px;bottom:4px;width:2px;background:var(--border);border-radius:1px}
  .tl-item{position:relative;margin-bottom:.9rem;display:flex;gap:.8rem;align-items:flex-start;animation:tlIn .4s ease both}
  @keyframes tlIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
  .tl-dot{width:16px;height:16px;border-radius:50%;flex-shrink:0;margin-top:2px;position:relative;z-index:1;
    background:var(--honey);border:3px solid #fff;box-shadow:0 0 0 2px var(--honey)}
  .tl-item.error .tl-dot{background:var(--red);box-shadow:0 0 0 2px var(--red)}
  .tl-item.success .tl-dot{background:var(--green);box-shadow:0 0 0 2px var(--green)}
  .tl-time{font-size:.75rem;color:var(--muted);font-weight:600;white-space:nowrap;min-width:44px;padding-top:1px}
  .tl-body{flex:1;min-width:0}
  .tl-text{font-size:.9rem;line-height:1.4}
  .tl-tool{display:inline-block;margin-top:2px;font-size:.75rem;color:var(--amber);background:rgba(245,166,35,.1);padding:1px 8px;border-radius:4px;font-weight:600;margin-left:6px}

  /* Donut */
  .donut-row{display:flex;align-items:center;gap:2rem;flex-wrap:wrap}
  .donut-wrap{position:relative;width:130px;height:130px;flex-shrink:0}
  .donut{
    width:100%;height:100%;border-radius:50%;
    background:conic-gradient(var(--green) 0deg ${successDeg}deg,var(--red) ${successDeg}deg 360deg);
    box-shadow:inset 0 0 0 1px rgba(0,0,0,.04)
  }
  .donut-hole{
    position:absolute;inset:24px;background:#fff;border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    font-size:1.1rem;font-weight:700;flex-direction:column;line-height:1.2
  }
  .donut-hole small{font-size:.65rem;color:var(--muted);font-weight:500}
  .legend{display:flex;flex-direction:column;gap:.5rem}
  .legend-item{display:flex;align-items:center;gap:.5rem;font-size:.88rem}
  .legend-dot{width:12px;height:12px;border-radius:3px;flex-shrink:0}
  .legend-count{font-weight:700;margin-left:auto;min-width:30px;text-align:right}

  /* Peak Hour */
  .peak-badge{display:inline-flex;align-items:center;gap:.4rem;background:linear-gradient(135deg,rgba(245,166,35,.1),rgba(212,135,44,.06));border:1px solid var(--border);border-radius:99px;padding:.5rem 1rem;font-size:.88rem;font-weight:600}
  .peak-badge strong{color:var(--amber)}

  /* Footer */
  .footer{text-align:center;padding:2.5rem 1rem 1.5rem;color:var(--muted);font-size:.82rem;opacity:.7}
  .footer strong{color:var(--amber-dark);font-weight:600}

  /* Empty State */
  .empty-state{text-align:center;padding:3rem 1rem;color:var(--muted)}
  .empty-state .icon{font-size:2.5rem;margin-bottom:.5rem;opacity:.4}
  .empty-state p{font-size:.9rem}

  @media(max-width:700px){
    .page{padding:1rem .75rem .5rem}
    .hero{padding:2rem 1.5rem;border-radius:var(--radius-md) var(--radius-md) 0 0}
    .hero h1{font-size:1.8rem}
    .stat-row{grid-template-columns:repeat(2,1fr)}
    .stat-card:nth-child(5){grid-column:span 2}
    .bar-label{width:80px;font-size:.75rem}
    .donut-row{flex-direction:column;align-items:flex-start}
    .card{padding:1.2rem}
  }
  @media(max-width:400px){
    .hero h1{font-size:1.5rem}
    .hero{padding:1.5rem 1rem}
    .stat-row{grid-template-columns:1fr}
    .stat-card:nth-child(5){grid-column:span 1}
  }
</style>
</head>
<body>
<div class="page">
  <header class="hero">
    <div class="hero-content">
      <p class="hero-eyebrow">${zh("每日编码报告","Daily Coding Report")}</p>
      <h1>Clawd Report</h1>
      <p class="subtitle">${zh("Claude Code 会话统计摘要","Claude Code Session Summary")}</p>
      <span class="date-badge">${esc(dateStr)}</span>
    </div>
  </header>

  <div class="stat-row">
    <div class="stat-card">
      <div class="stat-icon">&#9702;</div>
      <span class="stat-value">${stats.sessions}</span>
      <span class="stat-label">${zh("会话","Sessions")}</span>
    </div>
    <div class="stat-card">
      <div class="stat-icon">&#9716;</div>
      <span class="stat-value">${duration}</span>
      <span class="stat-label">${zh("总时长","Duration")}</span>
    </div>
    <div class="stat-card">
      <div class="stat-icon">&#9881;</div>
      <span class="stat-value">${stats.totalToolCalls}</span>
      <span class="stat-label">${zh("工具调用","Tool Calls")}</span>
    </div>
    <div class="stat-card">
      <div class="stat-icon">&#10007;</div>
      <span class="stat-value">${stats.errors}</span>
      <span class="stat-label">${zh("错误","Errors")}</span>
    </div>
    <div class="stat-card">
      <div class="stat-icon">&#10003;</div>
      <span class="stat-value">${successRate}%</span>
      <span class="stat-label">${zh("成功率","Success Rate")}</span>
    </div>
  </div>

  ${peakHour != null ? `
  <div class="section">
    <div class="card">
      <div class="card-header"><div class="dot"></div><h2>${zh("活跃高峰","Peak Activity")}</h2></div>
      <div class="peak-badge">
        &#9716; ${zh("最活跃时段","Peak hour")} <strong>${String(peakHour).padStart(2,"0")}:00</strong> &middot; ${peakHourCount} ${zh("个事件","events")}
      </div>
      ${avgEventsPerSession > 0 ? `<span style="margin-left:.8rem;font-size:.85rem;color:var(--muted)">${zh("平均每会话","avg/session")} ${avgEventsPerSession} ${zh("个事件","events")}</span>` : ""}
    </div>
  </div>` : ""}

  ${sortedTools.length > 0 ? `
  <div class="section">
    <div class="card">
      <div class="card-header"><div class="dot"></div><h2>${zh("工具使用分布","Tool Usage Distribution")}</h2></div>
      <div class="bar-chart">${toolBars}</div>
    </div>
  </div>` : ""}

  <div class="section" style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem">
    ${timelineItems.length > 0 ? `
    <div class="card" style="${sortedTools.length === 0 ? 'grid-column:span 2' : ''}">
      <div class="card-header"><div class="dot"></div><h2>${zh("事件时间线","Event Timeline")}</h2></div>
      <div class="timeline">${timelineHtml}</div>
    </div>` : ""}

    <div class="card" style="${timelineItems.length === 0 ? 'grid-column:span 2' : ''}">
      <div class="card-header"><div class="dot"></div><h2>${zh("成功/错误比","Success / Error")}</h2></div>
      <div class="donut-row">
        <div class="donut-wrap">
          <div class="donut"></div>
          <div class="donut-hole">${successRate}%<small>${zh("成功率","rate")}</small></div>
        </div>
        <div class="legend">
          <div class="legend-item"><span class="legend-dot" style="background:var(--green)"></span>${zh("成功","Success")}<span class="legend-count">${stats.success}</span></div>
          <div class="legend-item"><span class="legend-dot" style="background:var(--red)"></span>${zh("错误","Errors")}<span class="legend-count">${stats.errors}</span></div>
          <div class="legend-item" style="font-size:.78rem;color:var(--muted);margin-top:.2rem">${zh("总计","Total")}: ${successTotal} ${zh("个事件","events")}</div>
        </div>
      </div>
    </div>
  </div>

  <footer class="footer"><p>${zh("由","Generated by")} <strong>Clawd Companion</strong> ${zh("生成","")}</p></footer>
</div>
</body>
</html>`;
}


function renderCumulativeReport(allTimeStats, dailySummaries, allToolCounts, firstDate, lastDate) {
  const totalDays = dailySummaries.length;
  const duration = formatDuration(allTimeStats.durationMs);
  const successTotal = allTimeStats.success + allTimeStats.errors;
  const successRate = successTotal > 0 ? Math.round((allTimeStats.success / successTotal) * 100) : 100;
  const successDeg = Math.round(successRate * 3.6);
  const sortedTools = Object.entries(allToolCounts).sort((a, b) => b[1] - a[1]);
  const maxToolCount = sortedTools.length > 0 ? sortedTools[0][1] : 1;
  const maxDayCalls = dailySummaries.length > 0 ? Math.max(...dailySummaries.map(d => d.toolCalls), 1) : 1;

  const toolBars = sortedTools.map(([name, count]) => {
    const pct = Math.round((count / maxToolCount) * 100);
    return `<div class="bar-row"><span class="bar-label">${esc(name)}</span><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div><span class="bar-value">${count}</span></div></div>`;
  }).join("");

  // Daily trend bars
  const trendBars = dailySummaries.map(d => {
    const h = Math.round((d.toolCalls / maxDayCalls) * 100);
    return `<div class="trend-col" title="${esc(d.date)}: ${d.toolCalls} ${zh ? "工具调用" : "tool calls"}"><div class="trend-bar" style="height:${Math.max(h, 2)}%"></div><span class="trend-label">${d.date.slice(5)}</span></div>`;
  }).join("");

  // Date pills
  const datePills = dailySummaries.map((d, i) => {
    const active = i === dailySummaries.length - 1 ? " active" : "";
    return `<button class="date-pill${active}" data-date="${esc(d.date)}">${d.date.slice(5)}<small>${d.sessions}s</small></button>`;
  }).join("");

  // Daily detail panels
  const detailPanels = dailySummaries.map(d => {
    const dd = allTimeStats.dailyDetails?.[d.date];
    if (!dd) return "";
    const ddDuration = formatDuration(dd.durationMs);
    const ddSuccessTotal = dd.success + dd.errors;
    const ddSuccessRate = ddSuccessTotal > 0 ? Math.round((dd.success / ddSuccessTotal) * 100) : 100;
    const ddSortedTools = Object.entries(dd.toolCounts || {}).sort((a, b) => b[1] - a[1]);
    const ddMaxTool = ddSortedTools.length > 0 ? ddSortedTools[0][1] : 1;
    const ddToolBars = ddSortedTools.map(([name, count]) => {
      const pct = Math.round((count / ddMaxTool) * 100);
      return `<div class="bar-row"><span class="bar-label">${esc(name)}</span><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div><span class="bar-value">${count}</span></div></div>`;
    }).join("");
    const ddTimeline = (dd.timeline || []).slice(-15).map((item, i) => {
      const time = new Date(item.time).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
      return `<div class="tl-item ${item.type}" style="animation-delay:${Math.min(i * 0.03, 0.3)}s"><div class="tl-dot"></div><div class="tl-time">${time}</div><div class="tl-body"><span class="tl-text">${esc(item.text)}</span>${item.tool ? `<span class="tl-tool">${esc(item.tool)}</span>` : ""}</div></div>`;
    }).join("");

    return `<div class="daily-detail" id="detail-${esc(d.date)}"${d.date === dailySummaries[dailySummaries.length - 1]?.date ? "" : ' style="display:none"'}>
      <div class="detail-inner">
        <div class="detail-stat-row">
          <div class="dstat"><strong>${dd.sessions}</strong><small>${zh ? "会话" : "Sessions"}</small></div>
          <div class="dstat"><strong>${ddDuration}</strong><small>${zh ? "时长" : "Duration"}</small></div>
          <div class="dstat"><strong>${dd.totalToolCalls}</strong><small>${zh ? "工具调用" : "Tools"}</small></div>
          <div class="dstat"><strong>${dd.errors}</strong><small>${zh ? "错误" : "Errors"}</small></div>
          <div class="dstat"><strong>${ddSuccessRate}%</strong><small>${zh ? "成功率" : "Success"}</small></div>
        </div>
        ${ddToolBars ? `<div class="detail-tools"><h4>${zh ? "工具使用" : "Tool Usage"}</h4>${ddToolBars}</div>` : ""}
        ${ddTimeline ? `<div class="detail-timeline"><h4>${zh ? "事件时间线" : "Timeline"}</h4><div class="timeline">${ddTimeline}</div></div>` : ""}
      </div>
    </div>`;
  }).join("");

  // Determine zh context for static labels in cumulative report
  // We'll pass it through from the caller via a simple marker
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Clawd Cumulative Report</title>
<style>
  *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
  :root{
    --honey:#F5A623;--amber:#D4872C;--amber-dark:#B3681A;
    --paper:#F8F6F3;--card:#FFFFFF;--ink:#2D3436;--muted:#636E72;
    --green:#2ECC71;--red:#E74C3C;--border:rgba(213,135,44,0.18);
    --shadow-sm:0 2px 8px rgba(0,0,0,.04);
    --shadow-md:0 6px 20px rgba(0,0,0,.06);
    --shadow-lg:0 16px 40px rgba(0,0,0,.08);
    --radius-sm:8px;--radius-md:14px;--radius-lg:20px;
  }
  body{
    font-family:"Noto Sans SC",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    background:var(--paper);color:var(--ink);line-height:1.6;min-height:100vh;overflow-x:hidden;
  }
  body::before{
    content:"";position:fixed;inset:0;pointer-events:none;z-index:0;
    background:radial-gradient(ellipse at 20% 10%,rgba(245,166,35,.06) 0%,transparent 60%),
               radial-gradient(ellipse at 80% 90%,rgba(212,135,44,.04) 0%,transparent 60%);
    opacity:.7;
  }
  .page{max-width:1000px;margin:0 auto;padding:2.5rem 1.5rem 1.5rem;position:relative;z-index:1}

  /* Hero */
  .hero{
    border-radius:var(--radius-lg) var(--radius-lg) 0 0;
    background:linear-gradient(160deg,#F5A623 0%,#D4872C 40%,#B3681A 100%);
    padding:3rem 2.5rem;color:#fff;overflow:hidden;position:relative;
    box-shadow:var(--shadow-lg);
  }
  .hero::after{
    content:"";position:absolute;inset:0;
    background:url("data:image/svg+xml,%3Csvg width='80' height='80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23fff' fill-opacity='.06'%3E%3Ccircle cx='40' cy='40' r='1.5'/%3E%3Ccircle cx='20' cy='60' r='1'/%3E%3Ccircle cx='60' cy='20' r='1'/%3E%3C/g%3E%3C/svg%3E");
    pointer-events:none;
  }
  .hero-content{position:relative;z-index:1}
  .hero-eyebrow{font-size:.8rem;text-transform:uppercase;letter-spacing:.2em;opacity:.75;margin-bottom:.5rem;font-weight:500}
  .hero h1{font-size:2.4rem;font-weight:800;letter-spacing:-.03em;line-height:1.15;margin-bottom:.4rem}
  .hero .subtitle{font-size:1rem;opacity:.85;font-weight:400}
  .hero .date-range{display:inline-block;margin-top:1rem;padding:.35rem 1rem;background:rgba(255,255,255,.18);border-radius:99px;font-size:.85rem;font-weight:500;backdrop-filter:blur(6px)}

  /* All-time stat row */
  .stat-row{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--border);border-radius:0 0 var(--radius-lg) var(--radius-lg);overflow:hidden;box-shadow:var(--shadow-md)}
  .stat-card{
    background:var(--card);padding:1.5rem 1rem;text-align:center;
    transition:transform .2s,box-shadow .2s;
    animation:statIn .5s ease both;
  }
  .stat-card:nth-child(1){animation-delay:.05s}
  .stat-card:nth-child(2){animation-delay:.1s}
  .stat-card:nth-child(3){animation-delay:.15s}
  .stat-card:nth-child(4){animation-delay:.2s}
  .stat-card:nth-child(5){animation-delay:.25s}
  .stat-card:hover{transform:translateY(-2px);box-shadow:var(--shadow-md);position:relative;z-index:2}
  .stat-icon{font-size:1.4rem;margin-bottom:.3rem;opacity:.7}
  .stat-value{display:block;font-size:1.8rem;font-weight:700;color:var(--amber);line-height:1.2}
  .stat-label{font-size:.78rem;color:var(--muted);font-weight:500;margin-top:.2rem}
  @keyframes statIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}

  /* Sections */
  .section{margin-top:1.5rem}
  .card{
    background:var(--card);border-radius:var(--radius-md);padding:1.8rem;
    box-shadow:var(--shadow-sm);border:1px solid var(--border);
  }
  .card-header{display:flex;align-items:center;gap:.6rem;margin-bottom:1.2rem}
  .card-header .dot{width:5px;height:22px;border-radius:3px;background:linear-gradient(180deg,var(--honey),var(--amber));flex-shrink:0}
  .card-header h2{font-size:1.15rem;font-weight:700;letter-spacing:-.01em}

  /* Trend chart */
  .trend-chart{display:flex;align-items:flex-end;gap:3px;height:140px;padding:0 4px}
  .trend-col{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;min-width:18px;cursor:pointer}
  .trend-bar{
    width:100%;max-width:28px;border-radius:4px 4px 0 0;
    background:linear-gradient(180deg,var(--honey),var(--amber));
    transition:height .5s cubic-bezier(.22,.61,.36,1),opacity .2s;
    opacity:.75;min-height:2px;
  }
  .trend-col:hover .trend-bar{opacity:1;filter:brightness(1.05)}
  .trend-label{font-size:.6rem;color:var(--muted);margin-top:4px;transform:rotate(-45deg);transform-origin:top left;white-space:nowrap;font-weight:500}

  /* Tool Bars */
  .bar-row{display:flex;align-items:center;margin-bottom:.55rem;gap:.6rem}
  .bar-label{width:110px;font-size:.8rem;color:var(--muted);text-align:right;flex-shrink:0;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bar-track{flex:1;background:#F0EDE8;border-radius:5px;height:24px;position:relative;overflow:hidden}
  .bar-fill{height:100%;border-radius:5px;background:linear-gradient(90deg,var(--honey),var(--amber));position:relative}
  .bar-fill::after{content:"";position:absolute;right:0;top:0;bottom:0;width:20px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.25))}
  .bar-value{position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:.78rem;font-weight:700;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.2)}

  /* Timeline */
  .timeline{position:relative;padding-left:1.8rem}
  .timeline::before{content:"";position:absolute;left:7px;top:4px;bottom:4px;width:2px;background:var(--border);border-radius:1px}
  .tl-item{position:relative;margin-bottom:.7rem;display:flex;gap:.6rem;align-items:flex-start;animation:tlIn .4s ease both}
  @keyframes tlIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
  .tl-dot{width:14px;height:14px;border-radius:50%;flex-shrink:0;margin-top:3px;position:relative;z-index:1;
    background:var(--honey);border:2.5px solid #fff;box-shadow:0 0 0 2px var(--honey)}
  .tl-item.error .tl-dot{background:var(--red);box-shadow:0 0 0 2px var(--red)}
  .tl-item.success .tl-dot{background:var(--green);box-shadow:0 0 0 2px var(--green)}
  .tl-time{font-size:.72rem;color:var(--muted);font-weight:600;white-space:nowrap;min-width:42px;padding-top:1px}
  .tl-body{flex:1;min-width:0}
  .tl-text{font-size:.85rem;line-height:1.35}
  .tl-tool{display:inline-block;margin-top:1px;font-size:.7rem;color:var(--amber);background:rgba(245,166,35,.1);padding:1px 6px;border-radius:3px;font-weight:600;margin-left:4px}

  /* Donut */
  .donut-row{display:flex;align-items:center;gap:2rem;flex-wrap:wrap}
  .donut-wrap{position:relative;width:120px;height:120px;flex-shrink:0}
  .donut{
    width:100%;height:100%;border-radius:50%;
    background:conic-gradient(var(--green) 0deg ${successDeg}deg,var(--red) ${successDeg}deg 360deg);
    box-shadow:inset 0 0 0 1px rgba(0,0,0,.04)
  }
  .donut-hole{
    position:absolute;inset:22px;background:#fff;border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    font-size:1rem;font-weight:700;flex-direction:column;line-height:1.2
  }
  .donut-hole small{font-size:.6rem;color:var(--muted);font-weight:500}
  .legend{display:flex;flex-direction:column;gap:.4rem}
  .legend-item{display:flex;align-items:center;gap:.5rem;font-size:.85rem}
  .legend-dot{width:11px;height:11px;border-radius:3px;flex-shrink:0}
  .legend-count{font-weight:700;margin-left:auto;min-width:28px;text-align:right}

  /* Date Pills */
  .date-pills-wrap{overflow-x:auto;padding-bottom:.5rem;-webkit-overflow-scrolling:touch;scrollbar-width:thin}
  .date-pills-wrap::-webkit-scrollbar{height:4px}
  .date-pills-wrap::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
  .date-pills{display:flex;gap:.4rem;flex-wrap:nowrap}
  .date-pill{
    flex-shrink:0;padding:.45rem .85rem;border:1px solid var(--border);border-radius:99px;
    background:var(--card);color:var(--ink);font-size:.82rem;font-weight:600;
    cursor:pointer;transition:all .2s;white-space:nowrap;
    display:flex;align-items:center;gap:.3rem;
  }
  .date-pill:hover{border-color:var(--honey);background:rgba(245,166,35,.06)}
  .date-pill.active{background:var(--amber);color:#fff;border-color:var(--amber);box-shadow:0 4px 12px rgba(212,135,44,.3)}
  .date-pill small{font-size:.68rem;opacity:.65;font-weight:400}
  .date-pill.active small{opacity:.85}

  /* Daily detail panel */
  .daily-detail{margin-top:1rem}
  .detail-inner{animation:fadeIn .3s ease}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  .detail-stat-row{display:grid;grid-template-columns:repeat(5,1fr);gap:.6rem;margin-bottom:1rem}
  .dstat{text-align:center;padding:.6rem;background:rgba(245,166,35,.05);border-radius:var(--radius-sm);border:1px solid var(--border)}
  .dstat strong{display:block;font-size:1.1rem;color:var(--amber);font-weight:700}
  .dstat small{font-size:.7rem;color:var(--muted)}
  .detail-tools h4,.detail-timeline h4{font-size:.88rem;font-weight:600;margin-bottom:.6rem;color:var(--muted)}

  /* Days Summary Grid */
  .days-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.6rem}
  .day-summary-card{
    background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm);
    padding:1rem;cursor:pointer;transition:all .2s;
  }
  .day-summary-card:hover{border-color:var(--honey);box-shadow:var(--shadow-md);transform:translateY(-1px)}
  .day-summary-card .ds-date{font-size:.82rem;font-weight:700;margin-bottom:.4rem;color:var(--ink)}
  .day-summary-card .ds-stats{display:flex;gap:.6rem;flex-wrap:wrap;font-size:.75rem;color:var(--muted)}
  .day-summary-card .ds-stats span{font-weight:600;color:var(--amber)}
  .day-summary-card .ds-top{font-size:.72rem;color:var(--muted);margin-top:.4rem;padding-top:.4rem;border-top:1px solid var(--border)}

  /* Footer */
  .footer{text-align:center;padding:2.5rem 1rem 1.5rem;color:var(--muted);font-size:.82rem;opacity:.7}
  .footer strong{color:var(--amber-dark);font-weight:600}

  /* Grid layouts */
  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem}
  .span-2{grid-column:span 2}

  @media(max-width:700px){
    .page{padding:1rem .5rem .5rem}
    .hero{padding:2rem 1.2rem;border-radius:var(--radius-md) var(--radius-md) 0 0}
    .hero h1{font-size:1.7rem}
    .stat-row{grid-template-columns:repeat(3,1fr)}
    .stat-card:nth-child(4),.stat-card:nth-child(5){grid-column:span 1}
    .grid-2{grid-template-columns:1fr}
    .span-2{grid-column:span 1}
    .detail-stat-row{grid-template-columns:repeat(3,1fr)}
    .bar-label{width:70px;font-size:.72rem}
    .days-grid{grid-template-columns:1fr}
    .date-pills-wrap{max-width:calc(100vw - 2rem)}
  }
</style>
</head>
<body>
<div class="page">
  <header class="hero">
    <div class="hero-content">
      <p class="hero-eyebrow">Cumulative Report</p>
      <h1>Clawd Report</h1>
      <p class="subtitle">All-Time Coding Activity Summary</p>
      <span class="date-range">${esc(firstDate)} — ${esc(lastDate)} &middot; ${totalDays} days</span>
    </div>
  </header>

  <div class="stat-row">
    <div class="stat-card">
      <div class="stat-icon">&#9702;</div>
      <span class="stat-value">${allTimeStats.sessions}</span>
      <span class="stat-label">Total Sessions</span>
    </div>
    <div class="stat-card">
      <div class="stat-icon">&#9716;</div>
      <span class="stat-value">${duration}</span>
      <span class="stat-label">Total Duration</span>
    </div>
    <div class="stat-card">
      <div class="stat-icon">&#9881;</div>
      <span class="stat-value">${allTimeStats.totalToolCalls}</span>
      <span class="stat-label">Tool Calls</span>
    </div>
    <div class="stat-card">
      <div class="stat-icon">&#10007;</div>
      <span class="stat-value">${allTimeStats.errors}</span>
      <span class="stat-label">Errors</span>
    </div>
    <div class="stat-card">
      <div class="stat-icon">&#10003;</div>
      <span class="stat-value">${successRate}%</span>
      <span class="stat-label">Success Rate</span>
    </div>
  </div>

  ${sortedTools.length > 0 ? `
  <div class="section">
    <div class="card">
      <div class="card-header"><div class="dot"></div><h2>All-Time Tool Distribution</h2></div>
      <div class="bar-chart">${toolBars}</div>
    </div>
  </div>` : ""}

  <div class="section grid-2">
    ${dailySummaries.length > 0 ? `
    <div class="card">
      <div class="card-header"><div class="dot"></div><h2>Daily Activity Trend</h2></div>
      <div class="trend-chart">${trendBars}</div>
      <div style="text-align:center;margin-top:.5rem;font-size:.7rem;color:var(--muted)">Tool calls per day (hover for details)</div>
    </div>` : ""}

    <div class="card">
      <div class="card-header"><div class="dot"></div><h2>All-Time Success / Error</h2></div>
      <div class="donut-row">
        <div class="donut-wrap">
          <div class="donut"></div>
          <div class="donut-hole">${successRate}%<small>success</small></div>
        </div>
        <div class="legend">
          <div class="legend-item"><span class="legend-dot" style="background:var(--green)"></span>Success<span class="legend-count">${allTimeStats.success}</span></div>
          <div class="legend-item"><span class="legend-dot" style="background:var(--red)"></span>Errors<span class="legend-count">${allTimeStats.errors}</span></div>
          <div class="legend-item" style="font-size:.75rem;color:var(--muted);margin-top:.2rem">Total: ${successTotal} events</div>
        </div>
      </div>
    </div>
  </div>

  ${dailySummaries.length > 0 ? `
  <div class="section">
    <div class="card">
      <div class="card-header"><div class="dot"></div><h2>Browse by Date</h2></div>
      <div class="date-pills-wrap">
        <div class="date-pills" id="date-pills">${datePills}</div>
      </div>
      <div id="daily-details">${detailPanels}</div>
    </div>
  </div>` : ""}

  ${dailySummaries.length > 0 ? `
  <div class="section">
    <div class="card">
      <div class="card-header"><div class="dot"></div><h2>All Days Overview</h2></div>
      <div class="days-grid">
        ${dailySummaries.slice().reverse().map(d => {
          const dd = allTimeStats.dailyDetails?.[d.date];
          const ddDur = dd ? formatDuration(dd.durationMs) : "0m";
          return `<div class="day-summary-card" onclick="selectDate('${esc(d.date)}')">
            <div class="ds-date">${esc(d.date)}</div>
            <div class="ds-stats">
              <span>${d.sessions}</span> sessions &middot;
              <span>${ddDur}</span> &middot;
              <span>${d.toolCalls}</span> tools
            </div>
            <div class="ds-top">Top: ${esc(d.topTool || "-")} (${d.topToolCount || 0})</div>
          </div>`;
        }).join("")}
      </div>
    </div>
  </div>` : ""}

  <footer class="footer"><p>Generated by <strong>Clawd Companion</strong></p></footer>
</div>

<script>
function selectDate(date) {
  document.querySelectorAll('.date-pill').forEach(p => p.classList.remove('active'));
  var pill = document.querySelector('.date-pill[data-date="' + date + '"]');
  if (pill) pill.classList.add('active');
  document.querySelectorAll('.daily-detail').forEach(d => d.style.display = 'none');
  var detail = document.getElementById('detail-' + date);
  if (detail) detail.style.display = 'block';
  document.querySelector('.date-pills').scrollTo({left: pill ? pill.offsetLeft - 40 : 0, behavior: 'smooth'});
}
document.querySelectorAll('.date-pill').forEach(function(pill) {
  pill.addEventListener('click', function() { selectDate(this.dataset.date); });
});
</script>
</body>
</html>`;
}

module.exports = { renderDailyReport, renderCumulativeReport };
