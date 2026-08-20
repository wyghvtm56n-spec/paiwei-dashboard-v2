const META_INBOX_URL = "https://business.facebook.com/latest/inbox";
const LINE_CONSOLE_URL = "https://manager.line.biz/";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-TW").format(Number(value || 0));
}

function displayMetric(value, available) {
  return available ? formatNumber(value) : "N/A";
}

function status(label, tone = "neutral") {
  return `<span class="message-status ${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
}

function demandRows(categories = {}) {
  return [
    ["價格／費用", Number(categories.price || 0)],
    ["預約／日期", Number(categories.booking || 0)],
    ["內裝／拆洗", Number(categories.interior || 0)],
    ["異味／發霉", Number(categories.odor || 0)],
    ["鍍膜／外觀", Number(categories.exterior || 0)],
    ["地址／電話", Number(categories.location || 0)],
  ];
}

function renderDemandBars(categories) {
  const rows = demandRows(categories);
  const max = Math.max(...rows.map(([, value]) => value), 1);
  return rows
    .map(
      ([label, value]) => `
        <div class="message-demand-row">
          <div><span>${escapeHtml(label)}</span><b>${formatNumber(value)}</b></div>
          <div class="message-bar"><i style="width:${Math.max(4, (value / max) * 100)}%"></i></div>
        </div>
      `,
    )
    .join("");
}

function renderTrend(rows = []) {
  const tableRows = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.day)}</td>
          <td>${formatNumber(row.messages)}</td>
          <td>${formatNumber(row.users)}</td>
        </tr>
      `,
    )
    .join("");
  return `
    <div class="message-table-wrap">
      <table class="message-table">
        <thead><tr><th>日期</th><th>訊息事件</th><th>匿名詢問帳號</th></tr></thead>
        <tbody>${tableRows || `<tr><td colspan="3">尚無資料</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function renderChannelCard({ title, description, label, tone, metrics, href, linkLabel }) {
  return `
    <article class="message-channel-card">
      <div class="message-channel-head">
        <div><span class="message-channel-kicker">MESSAGE CHANNEL</span><h3>${escapeHtml(title)}</h3></div>
        ${status(label, tone)}
      </div>
      <p>${escapeHtml(description)}</p>
      <div class="message-channel-metrics">
        ${metrics
          .map(
            ([name, value]) => `<span><small>${escapeHtml(name)}</small><b>${escapeHtml(value)}</b></span>`,
          )
          .join("")}
      </div>
      <a class="message-action-link" href="${href}" target="_blank" rel="noreferrer">${escapeHtml(linkLabel)} ↗</a>
    </article>
  `;
}

export function renderMessageCenterSection(data = {}) {
  const line = data.line || {};
  const lineAvailable = line.ok !== false;
  const lineMetrics = [
    ["近 24 小時訊息", displayMetric(line.messages24h, lineAvailable)],
    ["近 7 天詢問帳號", displayMetric(line.users7d, lineAvailable)],
    ["近 7 天圖片", displayMetric(line.images7d, lineAvailable)],
    ["近 7 天按鈕點擊", displayMetric(line.postbacks7d, lineAvailable)],
  ];
  const lineDescription = lineAvailable
    ? "顯示 LINE Webhook／D1 的事件彙總；數字不是未讀數，也不代表已完成回覆。"
    : `LINE 資料目前無法讀取：${line.error || "未知錯誤"}`;

  return `
    <section class="section message-center-section" id="messages">
      <div class="section-head">
        <div><h2>訊息中心</h2><p>集中查看 LINE 需求訊號，並保留官方收件匣入口；不在儀表板展示原始聊天內容。</p></div>
        <a class="message-action-link" href="/messages">開啟完整訊息中心</a>
      </div>
      <div class="message-channel-grid">
        ${renderChannelCard({
          title: "LINE 詢問",
          description: lineDescription,
          label: lineAvailable ? "已接入統計" : "資料異常",
          tone: lineAvailable ? "good" : "warning",
          metrics: lineMetrics,
          href: LINE_CONSOLE_URL,
          linkLabel: "開啟 LINE 管理後台",
        })}
        ${renderChannelCard({
          title: "Meta／Messenger",
          description: "目前未把 Messenger 原始對話同步到 Worker；請從 Meta Business Suite 收件匣查看與回覆。",
          label: "官方收件匣",
          tone: "info",
          metrics: [
            ["原始對話", "不在此顯示"],
            ["未讀數", "未串接"],
            ["回覆狀態", "以官方後台為準"],
          ],
          href: META_INBOX_URL,
          linkLabel: "開啟 Meta 收件匣",
        })}
      </div>
      <div class="message-center-grid">
        <section class="panel message-panel">
          <h3>近 14 天訊息趨勢</h3>
          <p class="panel-subtitle">近 14 天訊息事件與匿名詢問帳號；同一個人可能在多天產生多筆事件。</p>
          ${renderTrend(line.daily)}
        </section>
        <section class="panel message-panel">
          <h3>常見需求訊號</h3>
          <p class="panel-subtitle">近 30 天關鍵字規則分類；同一則訊息可能落入多個類別。</p>
          <div class="message-demand-list">${renderDemandBars(line.categories)}</div>
          <p class="message-note">此區只代表訊息內容中的需求訊號，不等於有效名單、預約、成交或營收。</p>
        </section>
      </div>
      <div class="message-notice">
        <strong>資料邊界</strong>
        <span>目前訊息中心不顯示姓名、電話、原始聊天內容或「未讀／已讀」狀態。這些狀態仍以 LINE／Meta 官方後台為準；若要同步原始對話，需另行建立 Webhook、權限與資料保存政策。</span>
      </div>
    </section>
  `;
}

export function renderMessagesPage(data = {}) {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>訊息中心｜Martin Decision Center</title>
  <style>
    :root { font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans TC", sans-serif; color: #172033; background: #f4f7fb; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f7fb; }
    a { color: inherit; }
    .message-page { width: min(1180px, 100%); margin: 0 auto; padding: 24px; }
    .message-topbar { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; margin-bottom: 18px; }
    .message-brand { display: flex; gap: 12px; align-items: center; }
    .message-brand-mark { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; background: #0f3d6e; color: #fff; font-weight: 800; }
    .message-brand strong, .message-brand span { display: block; }
    .message-brand span, .message-updated { color: #6b778c; font-size: 13px; }
    .message-hero { padding: 28px; border-radius: 20px; color: #fff; background: linear-gradient(135deg, #0a2d52 0%, #0f4f7c 60%, #12766b 100%); }
    .message-hero h1 { margin: 6px 0 8px; font-size: clamp(28px, 5vw, 42px); }
    .message-hero p { max-width: 760px; margin: 0; color: #d8e7f4; line-height: 1.7; }
    .message-hero .message-action-link { display: inline-flex; margin-top: 18px; color: #fff; border-color: rgba(255,255,255,.35); }
    .message-section { margin-top: 18px; }
    .message-channel-grid, .message-center-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .message-channel-card, .message-panel, .message-notice { padding: 20px; border: 1px solid #e3e9f2; border-radius: 17px; background: #fff; box-shadow: 0 8px 28px rgba(29,45,73,.06); }
    .message-channel-card { margin-top: 18px; }
    .message-channel-head { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
    .message-channel-kicker { color: #1473a7; font-size: 10px; font-weight: 800; letter-spacing: .12em; }
    .message-channel-card h3, .message-panel h2, .message-panel h3 { margin: 6px 0 0; }
    .message-channel-card p, .message-note { color: #667389; font-size: 13px; line-height: 1.7; }
    .message-channel-metrics { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 8px; margin: 16px 0; }
    .message-channel-metrics span { min-width: 0; padding: 10px; border-radius: 10px; background: #f7fafc; }
    .message-channel-metrics small, .message-channel-metrics b { display: block; }
    .message-channel-metrics small { color: #8793a4; font-size: 10px; }
    .message-channel-metrics b { margin-top: 4px; font-size: 13px; overflow-wrap: anywhere; }
    .message-action-link { display: inline-flex; padding: 8px 11px; border: 1px solid #d4e3ee; border-radius: 9px; color: #176fa3; font-size: 12px; font-weight: 800; text-decoration: none; }
    .message-status { display: inline-flex; padding: 5px 9px; border-radius: 999px; font-size: 11px; font-weight: 800; white-space: nowrap; }
    .message-status.good { background: #dcfce7; color: #166534; }
    .message-status.warning { background: #fff1cc; color: #8a4b05; }
    .message-status.info { background: #dff3ff; color: #075985; }
    .message-status.neutral { background: #e9eef5; color: #526176; }
    .message-table-wrap { overflow-x: auto; }
    .message-table { width: 100%; border-collapse: collapse; min-width: 390px; }
    .message-table th, .message-table td { padding: 10px 8px; border-bottom: 1px solid #edf1f6; text-align: left; font-size: 12px; white-space: nowrap; }
    .message-table th { color: #7b8798; font-size: 11px; }
    .message-demand-list { display: grid; gap: 14px; margin-top: 16px; }
    .message-demand-row > div:first-child { display: flex; justify-content: space-between; margin-bottom: 6px; color: #46556d; font-size: 12px; }
    .message-bar { height: 8px; overflow: hidden; border-radius: 999px; background: #e9eef5; }
    .message-bar i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg,#1678aa,#16a085); }
    .message-notice { display: flex; gap: 12px; margin-top: 18px; color: #5d6b80; font-size: 12px; line-height: 1.7; }
    .message-notice strong { color: #0f3d6e; white-space: nowrap; }
    @media (max-width: 720px) { .message-page { padding: 12px; } .message-topbar { display: block; } .message-updated { margin-top: 10px; } .message-channel-grid, .message-center-grid { grid-template-columns: 1fr; } .message-channel-metrics { grid-template-columns: repeat(2,minmax(0,1fr)); } .message-hero { padding: 22px 18px; } .message-notice { display: block; } .message-notice strong { display: block; margin-bottom: 5px; } }
  </style>
</head>
<body>
  <main class="message-page">
    <header class="message-topbar">
      <div class="message-brand"><div class="message-brand-mark">MD</div><div><strong>Martin Decision Center</strong><span>訊息中心</span></div></div>
      <div class="message-updated">資料更新：${escapeHtml(new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }))}<br><a href="/">返回主儀表板</a></div>
    </header>
    <section class="message-hero"><span class="message-channel-kicker" style="color:#93d5ff">MESSAGE CENTER</span><h1>訊息中心</h1><p>把 LINE 的營運訊號與 Meta／Messenger 官方收件匣入口放在同一頁；不把未接通的原始對話誤裝成已同步資料。</p><a class="message-action-link" href="${META_INBOX_URL}" target="_blank" rel="noreferrer">開啟 Meta Business Suite 收件匣 ↗</a></section>
    ${renderMessageCenterSection(data).replace('<section class="section message-center-section" id="messages">', '<section class="message-section" id="message-details">')}
  </main>
</body>
</html>`;
}
