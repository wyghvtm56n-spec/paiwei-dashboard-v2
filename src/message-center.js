const META_INBOX_URL = "https://business.facebook.com/latest/inbox";
const LINE_CONSOLE_URL = "https://manager.line.biz/";
const INSTAGRAM_URL = "https://www.instagram.com/martindetailing88/";

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

function formatTime(value) {
  if (!value) return "—";
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function platformLabel(platform) {
  return { facebook: "Facebook Messenger", instagram: "Instagram Direct", line: "LINE Official Account" }[platform] || platform || "未知通道";
}

function platformTone(platform) {
  return { facebook: "facebook", instagram: "instagram", line: "line" }[platform] || "neutral";
}

function statusLabel(status) {
  return { open: "待處理", pending: "待跟進", resolved: "已結案", closed: "已關閉" }[status] || status || "未標記";
}

function dealLabel(stage) {
  return {
    new_inquiry: "新詢問",
    qualified: "已確認需求",
    quoted: "已報價",
    booked: "已預約",
    won: "已成交",
    lost: "未成交",
  }[stage] || stage || "未標記";
}

function displayName(conversation) {
  return conversation.display_name || conversation.username || "未識別聯絡人";
}

function normalizedTimestamp(value) {
  const timestamp = Number(value || 0);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
  return timestamp < 1_000_000_000_000 ? timestamp * 1_000 : timestamp;
}

function replyWindowState(conversation) {
  if (!["facebook", "instagram"].includes(conversation.platform)) {
    return { supported: false, open: false, label: "LINE 請從 LINE 官方後台回覆" };
  }
  const lastInboundAt = normalizedTimestamp(conversation.last_inbound_at);
  const age = lastInboundAt ? Date.now() - lastInboundAt : Number.POSITIVE_INFINITY;
  if (!lastInboundAt || age >= 24 * 60 * 60 * 1000) {
    return { supported: true, open: false, label: "已超過 24 小時標準回覆視窗" };
  }
  const remainingHours = Math.max(0, (24 * 60 * 60 * 1000 - age) / (60 * 60 * 1000));
  return { supported: true, open: true, label: `標準回覆視窗剩餘約 ${remainingHours.toFixed(1)} 小時` };
}

function renderReplyComposer(conversation, index) {
  const state = replyWindowState(conversation);
  if (!state.supported) {
    return `<div class="reply-disabled"><strong>此通道不在本頁送出</strong><span>${escapeHtml(state.label)}；本頁保留 LINE 原始訊息與統計。</span><a class="message-action-link" href="${LINE_CONSOLE_URL}" target="_blank" rel="noreferrer">開啟 LINE 後台 ↗</a></div>`;
  }
  const formId = `reply-form-${index}`;
  const disabled = state.open ? "" : " disabled";
  return `<form class="message-reply-form${state.open ? "" : " is-disabled"}" id="${formId}" data-message-reply-form data-conversation-key="${escapeHtml(conversation.conversation_key)}" data-platform="${escapeHtml(conversation.platform)}" action="/messages/reply" method="post">
    <div class="reply-form-head"><div><strong>線上回覆</strong><span>${escapeHtml(state.label)}</span></div><span class="reply-channel">${escapeHtml(platformLabel(conversation.platform))}</span></div>
    <textarea name="message" maxlength="2000" rows="3" placeholder="輸入要傳送給客戶的文字…"${disabled}></textarea>
    <div class="reply-form-foot"><small>訊息會透過 Meta Send API 送出；送出前請確認內容與對話對象。</small><button type="submit"${disabled}>送出回覆</button></div>
    <output class="reply-form-status" data-reply-status aria-live="polite"></output>
  </form>`;
}

function metricCard(label, value, tone = "neutral") {
  return `<div class="message-metric ${escapeHtml(tone)}"><small>${escapeHtml(label)}</small><strong>${escapeHtml(formatNumber(value))}</strong></div>`;
}

function countByPlatform(conversations, platform) {
  return conversations.filter((row) => row.platform === platform).length;
}

function eventRowsForConversation(events, key) {
  return events
    .filter((event) => event.conversation_key === key)
    .sort((a, b) => Number(a.event_timestamp || 0) - Number(b.event_timestamp || 0));
}

function renderCustomerFields(conversation) {
  const fields = [
    ["客戶姓名", conversation.customer_name],
    ["車款", conversation.vehicle_model],
    ["年份", conversation.vehicle_year],
    ["服務需求", conversation.service_need],
    ["問題摘要", conversation.issue_summary],
    ["報價", conversation.quoted_price],
    ["偏好時間", conversation.preferred_time],
    ["分店偏好", conversation.branch_preference],
    ["成交階段", dealLabel(conversation.deal_stage)],
    ["未成交原因", conversation.loss_reason],
    ["內部備註", conversation.internal_note],
  ].filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "");

  if (!fields.length) return `<p class="empty-inline">尚未建立客服工作區欄位。</p>`;
  return `<dl class="customer-fields">${fields.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>`;
}

function renderEvents(events) {
  if (!events.length) return `<p class="empty-inline">此對話目前沒有可顯示的原始訊息。</p>`;
  return `<div class="message-thread">${events.map((event) => {
    const direction = event.direction === "outbound" ? "outbound" : "inbound";
    const text = event.message_text || `[${event.message_type || "非文字訊息"}]`;
    return `<article class="message-bubble ${direction}">
      <div class="message-bubble-meta"><span>${direction === "outbound" ? "我方／系統" : "客戶"}</span><time>${escapeHtml(formatTime(event.event_timestamp))}</time></div>
      <p>${escapeHtml(text)}</p>
      <small>${escapeHtml(event.message_type || "text")} · ${escapeHtml(event.intent || "other")} · ${escapeHtml(event.reply_origin || "none")}</small>
    </article>`;
  }).join("")}</div>`;
}

function renderConversation(conversation, events, index) {
  const thread = eventRowsForConversation(events, conversation.conversation_key);
  const latest = thread[thread.length - 1];
  const id = `conversation-${index}`;
  return `<details class="conversation-card" ${index === 0 ? "open" : ""}>
    <summary>
      <div class="conversation-summary-main">
        <span class="platform-dot ${escapeHtml(platformTone(conversation.platform))}"></span>
        <div><strong>${escapeHtml(displayName(conversation))}</strong><span>${escapeHtml(platformLabel(conversation.platform))} · ${escapeHtml(formatTime(conversation.last_message_at))}</span></div>
      </div>
      <div class="conversation-summary-meta"><span class="priority priority-${Number(conversation.priority || 1) >= 3 ? "high" : "normal"}">${Number(conversation.priority || 1) >= 3 ? "高優先" : "一般"}</span><span class="status-pill">${escapeHtml(statusLabel(conversation.status))}</span><span class="chevron">⌄</span></div>
    </summary>
    <div class="conversation-body" id="${id}">
      <div class="conversation-toolbar">
        <div><small>對話識別</small><strong>${escapeHtml(platformLabel(conversation.platform))}</strong><span class="privacy-hint">系統只顯示去識別化帳號，不顯示平台 User ID。</span></div>
        <div class="conversation-counts"><span>入站 ${formatNumber(conversation.inbound_count)}</span><span>出站 ${formatNumber(conversation.outbound_count)}</span><span>回覆 ${formatNumber(conversation.meaningful_reply_count)}</span></div>
      </div>
      <div class="conversation-columns">
        <section class="conversation-panel"><h3>原始聊天內容</h3><p class="panel-subtitle">資料來自既有 D1 message_events；成功送出的回覆也會同步寫回本對話紀錄。</p>${renderEvents(thread.length ? thread : latest ? [latest] : [])}${renderReplyComposer(conversation, index)}</section>
        <aside class="conversation-panel"><h3>客戶資料與處理狀態</h3><div class="customer-profile"><strong>${escapeHtml(displayName(conversation))}</strong><span>${escapeHtml(conversation.username || conversation.external_user_hash ? "已建立聯絡人紀錄" : "尚未建立聯絡人紀錄")}</span></div>${renderCustomerFields(conversation)}<div class="state-grid"><span><small>最後入站</small><b>${escapeHtml(formatTime(conversation.last_inbound_at))}</b></span><span><small>最後出站</small><b>${escapeHtml(formatTime(conversation.last_outbound_at))}</b></span><span><small>意圖</small><b>${escapeHtml(conversation.latest_intent || "other")}</b></span><span><small>情緒</small><b>${escapeHtml(conversation.latest_sentiment || "neutral")}</b></span></div></aside>
      </div>
    </div>
  </details>`;
}

function renderPlatformSummary(platforms = []) {
  return platforms.map((row) => `<div class="platform-stat"><span class="platform-dot ${escapeHtml(platformTone(row.platform))}"></span><div><strong>${escapeHtml(platformLabel(row.platform))}</strong><small>對話 ${formatNumber(row.conversations)} · 訊息 ${formatNumber(row.events)} · 入站 ${formatNumber(row.inbound)} · 出站 ${formatNumber(row.outbound)}</small></div><time>${escapeHtml(formatTime(row.latest_event))}</time></div>`).join("") || `<p class="empty-inline">尚無通道統計。</p>`;
}

export function renderMessageCenterSection(data = {}) {
  const line = data.line || {};
  const lineAvailable = line.ok !== false;
  return `<section class="section message-center-section" id="messages">
    <div class="message-center-cta">
      <div><span class="message-channel-kicker">PRIVATE MESSAGE CENTER</span><h2>客戶訊息集中處理</h2><p>Facebook Messenger、Instagram Direct 與 LINE 原始對話都在同一個受保護入口；Messenger 與 Instagram 可在 24 小時標準視窗內直接回覆。</p></div>
      <a class="message-primary-button" href="/messages"><strong>進入訊息中心</strong><span>查看對話並線上回覆 ↗</span></a>
    </div>
    <div class="message-channel-grid"><article class="message-channel-card"><span class="message-channel-kicker">MESSAGE CENTER</span><h3>Facebook／Instagram／LINE</h3><p>原始訊息與個資只在受保護的 /messages 顯示，不會公開出現在首頁。</p><div class="message-channel-metrics"><span><small>${lineAvailable ? "LINE 統計" : "LINE 資料異常"}</small><b>${escapeHtml(lineAvailable ? formatNumber(line.messages24h) : "N/A")}</b></span><span><small>Messenger</small><b>可線上回覆</b></span><span><small>Instagram DM</small><b>可線上回覆</b></span><span><small>保護</small><b>管理密碼</b></span></div><a class="message-action-link" href="/messages">查看三平台原始訊息 ↗</a></article><article class="message-channel-card"><span class="message-channel-kicker">OFFICIAL CONSOLE</span><h3>官方收件匣</h3><p>LINE 回覆、平台標記已讀或超過標準視窗的訊息，仍可直接前往官方後台處理。</p><a class="message-action-link" href="${META_INBOX_URL}" target="_blank" rel="noreferrer">開啟 Meta 收件匣 ↗</a><a class="message-action-link" href="${LINE_CONSOLE_URL}" target="_blank" rel="noreferrer">開啟 LINE 後台 ↗</a></article></div>
  </section>`;
}

export function renderMessagesPage(data = {}) {
  const conversations = data.conversations || [];
  const events = data.events || [];
  const summary = data.summary || {};
  const platforms = summary.platforms || [];
  const openCount = conversations.filter((row) => ["open", "pending"].includes(row.status)).length;
  const highPriority = conversations.filter((row) => Number(row.priority || 1) >= 3).length;
  const noName = conversations.filter((row) => !row.display_name && !row.username).length;
  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>原始訊息中心｜Martin AI</title><style>
:root{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans TC",sans-serif;color:#172033;background:#f4f7fb}*{box-sizing:border-box}body{margin:0;background:#f4f7fb}a{color:inherit}.message-page{width:min(1440px,100%);margin:0 auto;padding:24px}.message-topbar{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:18px}.message-brand{display:flex;gap:12px;align-items:center}.message-brand-mark{width:44px;height:44px;border-radius:13px;display:grid;place-items:center;background:#0f3d6e;color:#fff;font-weight:800}.message-brand strong,.message-brand span{display:block}.message-brand span,.message-updated{color:#6b778c;font-size:13px}.message-actions{display:flex;gap:8px;flex-wrap:wrap}.message-action-link{display:inline-flex;padding:8px 11px;border:1px solid #d4e3ee;border-radius:9px;color:#176fa3;font-size:12px;font-weight:800;text-decoration:none;background:#fff}.message-hero{padding:28px;border-radius:20px;color:#fff;background:linear-gradient(135deg,#07152f 0%,#0f4f7c 60%,#12766b 100%);box-shadow:0 16px 45px rgba(19,48,78,.16)}.message-hero h1{margin:6px 0 8px;font-size:clamp(28px,5vw,44px)}.message-hero p{max-width:900px;margin:0;color:#d8e7f4;line-height:1.7}.message-kicker{color:#93d5ff;font-size:11px;letter-spacing:.12em;font-weight:800}.message-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-top:18px}.message-metric{padding:15px;border-radius:13px;background:#fff;border:1px solid #e0e8f1;box-shadow:0 7px 25px rgba(29,45,73,.05)}.message-metric small,.message-metric strong{display:block}.message-metric small{color:#7b8798;font-size:11px}.message-metric strong{margin-top:6px;font-size:25px}.message-metric.facebook{border-top:3px solid #1877f2}.message-metric.instagram{border-top:3px solid #d946ef}.message-metric.line{border-top:3px solid #06c755}.message-layout{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(300px,.55fr);gap:18px;margin-top:18px;align-items:start}.message-card{padding:20px;border:1px solid #e3e9f2;border-radius:17px;background:#fff;box-shadow:0 8px 28px rgba(29,45,73,.06)}.message-card h2,.message-card h3{margin:0 0 7px}.panel-subtitle,.message-card p{color:#667389;font-size:13px;line-height:1.7}.conversation-list{display:grid;gap:10px;margin-top:15px}.conversation-card{border:1px solid #e1e8f0;border-radius:14px;background:#fff;overflow:hidden}.conversation-card summary{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:15px;cursor:pointer;list-style:none}.conversation-card summary::-webkit-details-marker{display:none}.conversation-summary-main,.conversation-summary-meta{display:flex;align-items:center;gap:10px;min-width:0}.conversation-summary-main strong,.conversation-summary-main span{display:block}.conversation-summary-main strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.conversation-summary-main div span{color:#78869a;font-size:12px;margin-top:4px}.conversation-summary-meta{font-size:11px;white-space:nowrap}.platform-dot{width:10px;height:10px;border-radius:50%;display:inline-block;flex:none}.platform-dot.facebook{background:#1877f2}.platform-dot.instagram{background:#d946ef}.platform-dot.line{background:#06c755}.platform-dot.neutral{background:#9aa7b8}.priority,.status-pill{padding:5px 8px;border-radius:999px;font-weight:800}.priority-high{background:#fee2e2;color:#991b1b}.priority-normal{background:#eef3f8;color:#526176}.status-pill{background:#e0f2fe;color:#075985}.chevron{font-size:20px;color:#7b8798}.conversation-body{padding:0 15px 15px;border-top:1px solid #eef2f6}.conversation-toolbar{display:flex;justify-content:space-between;gap:12px;padding:14px 0}.conversation-toolbar small,.conversation-toolbar strong,.conversation-toolbar span{display:block}.conversation-toolbar small,.privacy-hint{color:#8390a2;font-size:11px}.conversation-toolbar strong{margin-top:4px}.privacy-hint{margin-top:5px}.conversation-counts{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.conversation-counts span{padding:6px 8px;background:#f6f8fb;border-radius:8px;color:#64748b;font-size:11px}.conversation-columns{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(260px,.85fr);gap:14px}.conversation-panel{padding:15px;border:1px solid #e7edf4;border-radius:13px;background:#fbfdff}.conversation-panel h3{font-size:15px}.message-thread{display:grid;gap:9px;margin-top:12px;max-height:600px;overflow:auto;padding-right:4px}.message-bubble{max-width:85%;padding:11px 12px;border-radius:13px;background:#eaf4fb;color:#213047}.message-bubble.outbound{margin-left:auto;background:#def7e8}.message-bubble-meta{display:flex;justify-content:space-between;gap:12px;font-size:10px;color:#728197}.message-bubble p{margin:7px 0;white-space:pre-wrap;word-break:break-word;color:#213047;font-size:13px;line-height:1.6}.message-bubble small{color:#8290a2;font-size:10px}.customer-profile{display:flex;justify-content:space-between;gap:10px;padding:11px;border-radius:10px;background:#edf5ff;margin-top:12px}.customer-profile strong{font-size:13px}.customer-profile span{font-size:11px;color:#6b7b90}.customer-fields{display:grid;gap:8px;margin:13px 0}.customer-fields div{padding-bottom:8px;border-bottom:1px solid #e7edf4}.customer-fields dt{font-size:10px;color:#8793a4}.customer-fields dd{margin:3px 0 0;font-size:12px;color:#263852;white-space:pre-wrap;word-break:break-word}.state-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.state-grid span{padding:9px;background:#fff;border:1px solid #e8edf3;border-radius:9px}.state-grid small,.state-grid b{display:block}.state-grid small{font-size:10px;color:#8793a4}.state-grid b{font-size:11px;margin-top:4px}.message-reply-form{display:grid;gap:10px;margin-top:16px;padding:14px;border:1px solid #cfe5f4;border-radius:12px;background:#f5fbff}.message-reply-form.is-disabled{border-color:#eed8b2;background:#fffaf0}.reply-form-head,.reply-form-foot{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.reply-form-head strong,.reply-form-head span{display:block}.reply-form-head strong{font-size:13px}.reply-form-head span{margin-top:4px;color:#718096;font-size:11px}.reply-channel{padding:5px 8px;border-radius:999px;background:#e3f3ff;color:#176fa3;font-weight:800}.message-reply-form textarea{width:100%;resize:vertical;min-height:76px;padding:10px;border:1px solid #cbd9e6;border-radius:9px;background:#fff;color:#213047;font:inherit;font-size:13px;line-height:1.6}.message-reply-form textarea:disabled{cursor:not-allowed;background:#f2f3f5}.reply-form-foot small{max-width:70%;color:#7c8898;font-size:10px;line-height:1.5}.message-reply-form button{padding:8px 14px;border:0;border-radius:8px;background:#0f6f91;color:#fff;font:inherit;font-size:12px;font-weight:800;cursor:pointer}.message-reply-form button:disabled{cursor:not-allowed;background:#a6b0bb}.reply-form-status{min-height:18px;color:#0f6f91;font-size:11px;line-height:1.5}.reply-form-status.error{color:#a13b2d}.reply-disabled{display:grid;gap:7px;margin-top:16px;padding:13px;border:1px solid #eed8b2;border-radius:12px;background:#fffaf0;color:#725b2d;font-size:12px;line-height:1.5}.reply-disabled strong{color:#8b5c14}.reply-disabled .message-action-link{justify-self:start}.platform-list{display:grid;gap:10px;margin-top:14px}.platform-stat{display:flex;align-items:center;gap:9px;padding:11px;border-radius:10px;background:#f8fafc}.platform-stat div{min-width:0;flex:1}.platform-stat strong,.platform-stat small{display:block}.platform-stat strong{font-size:12px}.platform-stat small{color:#748197;font-size:11px;margin-top:4px;line-height:1.5}.platform-stat time{color:#8a96a7;font-size:10px;white-space:nowrap}.message-notice{margin-top:18px;padding:15px;border:1px solid #f0dfb5;border-radius:13px;background:#fff9e9;color:#6f5724;font-size:12px;line-height:1.7}.message-notice strong{display:block;color:#8a5d11;margin-bottom:4px}.empty-inline{color:#8a96a7;font-size:12px}.footer-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}@media(max-width:900px){.message-layout{grid-template-columns:1fr}.message-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:680px){.message-page{padding:12px}.message-topbar{display:block}.message-actions{margin-top:12px}.message-updated{margin-top:10px}.message-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.message-hero{padding:22px 18px}.message-layout,.conversation-columns{grid-template-columns:1fr}.conversation-summary-meta{gap:5px}.conversation-summary-meta .priority,.conversation-summary-meta .status-pill{display:none}.conversation-toolbar{display:block}.conversation-counts{margin-top:10px}.message-bubble{max-width:94%}}
</style></head>
<body><main class="message-page">
<header class="message-topbar"><div class="message-brand"><div class="message-brand-mark">M</div><div><strong>Martin AI Business OS</strong><span>PRIVATE MESSAGE OPERATIONS</span></div></div><div class="message-actions"><a class="message-action-link" href="/">返回主儀表板</a><a class="message-action-link" href="/messages/logout">登出</a></div></header>
<section class="message-hero"><span class="message-kicker">OFFICIAL MESSAGE CENTER</span><h1>三平台訊息，一個安全入口。</h1><p>統一檢視 LINE 官方帳號、Instagram 與 Facebook 私訊；保留原始訊息、客戶資料與客服工作區欄位，並以原始 D1 對話紀錄為準。</p><div class="footer-actions"><a class="message-action-link" href="${META_INBOX_URL}" target="_blank" rel="noreferrer">開啟 Meta Business Suite ↗</a><a class="message-action-link" href="${LINE_CONSOLE_URL}" target="_blank" rel="noreferrer">開啟 LINE 後台 ↗</a><a class="message-action-link" href="${INSTAGRAM_URL}" target="_blank" rel="noreferrer">開啟 Instagram ↗</a></div></section>
<section class="message-metrics"><div class="message-metric facebook"><small>Messenger 對話</small><strong>${escapeHtml(formatNumber(countByPlatform(conversations, "facebook")))}</strong></div><div class="message-metric instagram"><small>Instagram 對話</small><strong>${escapeHtml(formatNumber(countByPlatform(conversations, "instagram")))}</strong></div><div class="message-metric line"><small>LINE 對話</small><strong>${escapeHtml(formatNumber(countByPlatform(conversations, "line")))}</strong></div><div class="message-metric"><small>待處理對話</small><strong>${escapeHtml(formatNumber(openCount))}</strong></div><div class="message-metric"><small>高優先對話</small><strong>${escapeHtml(formatNumber(highPriority))}</strong></div></section>
<div class="message-layout"><section class="message-card"><h2>原始對話與個資</h2><p>顯示既有 message_conversations、message_events、message_contact_profiles 與客服工作區；Messenger 與 Instagram 可在 24 小時標準視窗內直接回覆，LINE 仍由官方後台送出。</p><div class="conversation-list">${conversations.map((conversation, index) => renderConversation(conversation, events, index)).join("") || `<p class="empty-inline">目前沒有對話資料。</p>`}</div></section><aside class="message-card"><h2>通道與同步狀態</h2><p>資料更新時間：${escapeHtml(formatTime(data.fetchedAt))}</p><div class="platform-list">${renderPlatformSummary(platforms)}</div><div class="message-notice"><strong>隱私與資料邊界</strong><span>本頁位於管理密碼保護的 /messages 路由。原始聊天內容、顯示名稱、帳號名稱與客服欄位只在登入後顯示；不在公開首頁、影片 API 或網址中輸出。系統仍遵守既有 D1 retention 與加密 target binding 設計。</span></div><div class="message-notice"><strong>資料完整性</strong><span>本頁顯示最近 ${escapeHtml(formatNumber(conversations.length))} 個對話與 ${escapeHtml(formatNumber(events.length))} 則訊息事件。為避免 Worker 超過 subrequest 限制，資料由同一個 D1 查詢批次讀取。</span></div><p class="panel-subtitle">未識別聯絡人：${escapeHtml(formatNumber(noName))}；未來可由既有 profile lookup 流程補齊名稱，不會在此頁猜測身份。</p></aside></div>
</main><script>
document.querySelectorAll('[data-message-reply-form]').forEach(function (form) {
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    var textarea = form.querySelector('textarea[name="message"]');
    var status = form.querySelector('[data-reply-status]');
    var button = form.querySelector('button[type="submit"]');
    var message = textarea ? textarea.value.trim() : '';
    if (!message) {
      status.className = 'reply-form-status error';
      status.textContent = '請先輸入回覆內容。';
      return;
    }
    var randomId = form.dataset.idempotencyKey || (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2));
    form.dataset.idempotencyKey = randomId;
    textarea.disabled = true;
    button.disabled = true;
    status.className = 'reply-form-status';
    status.textContent = '正在送出，請稍候…';
    try {
      var response = await fetch(form.action, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          conversation_key: form.dataset.conversationKey,
          platform: form.dataset.platform,
          message: message,
          idempotency_key: randomId
        })
      });
      var result = await response.json().catch(function () { return {}; });
      if (!response.ok || !result.ok) throw new Error(result.error || '回覆未送出，請稍後再試。');
      status.textContent = result.persisted === false ? '訊息已送出，對話紀錄同步稍有延遲。' : '訊息已送出，正在更新對話紀錄。';
      textarea.value = '';
      delete form.dataset.idempotencyKey;
      window.setTimeout(function () { window.location.reload(); }, 700);
    } catch (error) {
      textarea.disabled = false;
      button.disabled = false;
      status.className = 'reply-form-status error';
      status.textContent = error && error.message ? error.message : '回覆未送出，請稍後再試。';
    }
  });
});
</script></body></html>`;
}
