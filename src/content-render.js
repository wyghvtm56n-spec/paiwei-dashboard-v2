function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  return new Intl.NumberFormat("zh-TW").format(Number(value || 0));
}

function formatSeconds(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return "N/A";
  if (seconds < 60) return `${seconds.toFixed(1)} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${Math.round(seconds % 60)} 秒`;
}

function formatPercent(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function formatDate(value) {
  if (!value) return "日期未知";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return String(value).slice(0, 10);
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function metric(item, name) {
  const publicName = {
    total_video_views: "views",
    total_video_views_unique: "unique_views",
    total_video_likes: "likes",
    total_video_comments: "comments",
  }[name] || name;
  return item?.insights?.[name]?.value ?? item?.publicMetrics?.[publicName] ?? null;
}

function hasFullInsights(item) {
  return Object.keys(item?.insights || {}).length > 0;
}

function sourceLabel(source) {
  return source === "facebook_page" ? "Facebook 粉專" : "Instagram";
}

function mediaLabel(item) {
  if (item.source === "facebook_page") return "影片";
  if (item.mediaType === "REELS") return "Reels";
  if (item.mediaType === "VIDEO") return "影片貼文";
  if (item.mediaType === "IMAGE") return "圖片貼文";
  return item.mediaType || "媒體";
}

function insightCell(label, value) {
  return `<span><small>${escapeHtml(label)}</small><b>${escapeHtml(formatNumber(value))}</b></span>`;
}

function renderItem(item) {
  const isPage = item.source === "facebook_page";
  const isReel = item.mediaType === "REELS";
  const primaryViews = isPage
    ? metric(item, "total_video_views")
    : metric(item, "views") ?? metric(item, "total_views");
  const reach = metric(item, "reach") ?? (isPage ? metric(item, "total_video_views_unique") : null);
  const fullInsights = hasFullInsights(item);
  const viewsLabel = isPage && !fullInsights ? "可見觀看次數" : isPage ? "3 秒／完成觀看" : "Views";

  return `
    <article class="content-card">
      <div class="content-card-head">
        <div>
          <div class="content-badges"><span class="content-source">${escapeHtml(sourceLabel(item.source))}</span><span class="content-type">${escapeHtml(mediaLabel(item))}</span></div>
          <strong>${escapeHtml(item.title || "未命名內容")}</strong>
          <small>${escapeHtml(formatDate(item.createdTime || item.updatedTime))}</small>
        </div>
        ${item.permalink ? `<a class="content-link" href="${escapeHtml(item.permalink)}" target="_blank" rel="noreferrer">開啟原文</a>` : ""}
      </div>
      <div class="content-metrics">
        ${insightCell(viewsLabel, primaryViews)}
        ${insightCell(isPage ? "Unique views" : "Reach", reach)}
        ${insightCell("Likes", metric(item, isPage ? "total_video_likes" : "likes"))}
        ${insightCell("Comments", metric(item, isPage ? "total_video_comments" : "comments"))}
        ${insightCell("Shares", metric(item, "shares"))}
        ${insightCell("Saved", metric(item, "saved"))}
      </div>
      ${
        isReel
          ? `<div class="content-extra"><span>平均觀看 ${escapeHtml(formatSeconds(metric(item, "ig_reels_avg_watch_time")))}</span><span>總觀看時間 ${escapeHtml(formatSeconds(metric(item, "ig_reels_video_view_total_time")))}</span><span>前三秒跳過率 ${escapeHtml(formatPercent(metric(item, "reels_skip_rate")))}</span></div>`
          : ""
      }
      ${item.insightsError ? `<p class="content-error">洞察讀取失敗：${escapeHtml(item.insightsError)}</p>` : ""}
    </article>
  `;
}

function renderSourcePanel(title, result, emptyMessage) {
  const items = Array.isArray(result?.data) ? result.data : [];
  if (!result?.ok && items.length === 0) {
    return `
      <section class="panel content-source-panel">
        <div class="content-panel-heading"><h3>${escapeHtml(title)}</h3>${status("尚未可用", "neutral")}</div>
        <p class="panel-subtitle">${escapeHtml(result?.error || emptyMessage)}</p>
      </section>
    `;
  }
  if (items.length === 0) {
    return `
      <section class="panel content-source-panel">
        <div class="content-panel-heading"><h3>${escapeHtml(title)}</h3>${status("無資料", "neutral")}</div>
        <p class="panel-subtitle">${escapeHtml(emptyMessage)}</p>
      </section>
    `;
  }
  const listMetricsAvailable = Boolean(result?.dataQuality?.listMetricsAvailable);
  const subtitle = listMetricsAvailable
    ? "已顯示 Meta 可回傳的影片欄位；完整洞察可能延遲最多 48 小時。"
    : "目前可顯示影片清單；完整觀看與互動洞察需要額外 Meta Insights 權限。";
  return `
    <section class="panel content-source-panel">
      <div class="content-panel-heading"><h3>${escapeHtml(title)}</h3>${status(`${items.length} 筆`, "info")}</div>
      <p class="panel-subtitle">${escapeHtml(subtitle)}</p>
      <div class="content-list">${items.map(renderItem).join("")}</div>
    </section>
  `;
}

function status(label, tone) {
  return `<span class="status ${tone}">${escapeHtml(label)}</span>`;
}

export function renderContentSection(content) {
  if (!content?.configured) {
    return `
      <section class="section" id="content-videos">
        <div class="section-head"><div><h2>粉專與 Instagram 影片</h2><p>內容洞察與廣告投放分開呈現。</p></div>${status("尚未設定", "neutral")}</div>
        <section class="panel content-setup-panel">
          <h3>尚未連接內容洞察</h3>
          <p class="panel-subtitle">此區需要額外的內容權限與 Token；現有 META_ACCESS_TOKEN 只用於 Ads Insights，不會混用。</p>
          <div class="setup-grid"><span><b>Facebook 粉專</b><small>Page ID＋Page access token＋pages_read_engagement</small></span><span><b>Instagram 專業帳號</b><small>Instagram User ID＋Facebook User access token＋instagram_manage_insights</small></span></div>
        </section>
      </section>
    `;
  }

  return `
    <section class="section" id="content-videos">
      <div class="section-head"><div><h2>粉專與 Instagram 影片</h2><p>自然內容洞察獨立於 Meta Ads；API 資料可能延遲最多 48 小時。</p></div>${status(content.dataQuality?.complete ? "資料完整" : "部分資料", content.dataQuality?.complete ? "good" : "warning")}</div>
      ${content.error ? `<div class="quality-warning"><strong>內容資料提醒</strong><p>${escapeHtml(content.error)}</p></div>` : ""}
      <div class="two-column">
        ${renderSourcePanel("Facebook 粉專影片", content.page, "請設定 Page ID 與 Page access token。")}
        ${renderSourcePanel("Instagram Reels／貼文", content.instagram, "請設定 Instagram Professional Account 與 User access token。")}
      </div>
      <p class="section-note">Instagram 的 views、likes、comments、shares 等一般欄位主要代表自然互動；不要直接與廣告報表的結果相加。若需要含 promoted／boosted 的 total metrics，必須使用 Facebook Login for Business 且該指標可用。</p>
    </section>
  `;
}
