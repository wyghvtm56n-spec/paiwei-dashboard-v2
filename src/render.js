import { buildDecisionSnapshot } from "./decision.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat("zh-TW", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value || 0));
}

function currencyPrefix(currency) {
  if (currency === "TWD") return "NT$";
  return currency ? `${currency} ` : "NT$";
}

function formatMoney(value, currency, digits = 0) {
  return `${currencyPrefix(currency)}${formatNumber(value, digits)}`;
}

function notice(message, tone = "warning") {
  return `<div class="notice ${escapeHtml(tone)}">${escapeHtml(message)}</div>`;
}

function metricCard(label, value, note, tone = "default") {
  return `
    <article class="metric-card ${escapeHtml(tone)}">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value">${escapeHtml(value)}</div>
      <div class="metric-note">${escapeHtml(note)}</div>
    </article>
  `;
}

const REGION_NAMES = {
  "Taipei City": "台北市",
  "New Taipei City": "新北市",
  "Taoyuan City": "桃園市",
  "Taichung City": "台中市",
  "Tainan City": "台南市",
  "Kaohsiung City": "高雄市",
  "Keelung City": "基隆市",
  "Hsinchu City": "新竹市",
  "Hsinchu County": "新竹縣",
  "Miaoli County": "苗栗縣",
  "Changhua County": "彰化縣",
  "Nantou County": "南投縣",
  "Yunlin County": "雲林縣",
  "Chiayi City": "嘉義市",
  "Chiayi County": "嘉義縣",
  "Pingtung County": "屏東縣",
  "Yilan County": "宜蘭縣",
  "Hualien County": "花蓮縣",
  "Taitung County": "台東縣",
};

function translateRegion(value) {
  return REGION_NAMES[value] || value || "未知區域";
}

function translateGender(value) {
  if (value === "male") return "男性";
  if (value === "female") return "女性";
  return value || "未分類";
}

function translatePlatform(value) {
  const map = {
    facebook: "Facebook",
    instagram: "Instagram",
    messenger: "Messenger",
    audience_network: "Audience Network",
  };
  return map[value] || value || "未分類";
}

function translatePlacement(value) {
  const map = {
    feed: "動態消息",
    instagram_reels: "Instagram Reels",
    instagram_stories: "Instagram Stories",
    facebook_reels: "Facebook Reels",
    facebook_stories: "Facebook Stories",
    marketplace: "Marketplace",
    video_feeds: "影片動態",
  };
  return map[value] || String(value || "未分類").replaceAll("_", " ");
}

function statusBadge(label, tone = "neutral") {
  return `<span class="status ${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
}

function evidenceValue(item, currency) {
  const value = Number(item.value || 0);
  if (item.metric === "Amount spent" || item.metric === "CPC (all)") {
    return formatMoney(value, currency, 2);
  }
  if (item.metric.includes("變化")) return `${formatNumber(value, 1)}%`;
  if (item.metric === "CTR (all)" || item.metric === "Frequency") {
    return item.metric === "CTR (all)"
      ? `${formatNumber(value, 2)}%`
      : formatNumber(value, 2);
  }
  return formatNumber(value, 0);
}

function renderEvidence(items, currency) {
  if (!Array.isArray(items) || items.length === 0) return "";
  return `
    <div class="evidence-list">
      ${items
        .map(
          (item) => `
            <span>
              <b>${escapeHtml(item.metric)}</b>
              ${escapeHtml(evidenceValue(item, currency))}
              ${item.comparison ? `<small>${escapeHtml(item.comparison)}</small>` : ""}
            </span>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderDecisionPanel(decision, currency) {
  const anomalyItems = decision.anomalies.length
    ? decision.anomalies
        .map(
          (item) => `
            <article class="decision-item">
              <div class="decision-item-head">
                ${statusBadge(item.severity === "warning" ? "需檢查" : "資料提示", item.severity)}
                <strong>${escapeHtml(item.title)}</strong>
              </div>
              <p>${escapeHtml(item.detail)}</p>
              ${renderEvidence(item.evidence, currency)}
            </article>
          `,
        )
        .join("")
    : `<div class="empty-state">目前沒有需要優先處理的異常。</div>`;

  const opportunityItems = decision.opportunities.length
    ? decision.opportunities
        .map(
          (item) => `
            <article class="decision-item">
              <div class="decision-item-head">
                ${statusBadge("測試候選", "info")}
                <strong>${escapeHtml(item.name)}</strong>
              </div>
              <p>${escapeHtml(item.detail)}</p>
              ${renderEvidence(item.evidence, currency)}
            </article>
          `,
        )
        .join("")
    : `<div class="empty-state">目前沒有達到樣本門檻的測試候選。</div>`;

  return `
    <section class="decision-hero" id="overview">
      <div class="decision-heading">
        <div class="eyebrow">MARTIN DECISION CENTER</div>
        <div class="decision-title-row">
          <div>
            <h1>今日經營摘要</h1>
            <p>${escapeHtml(decision.summaryText)}</p>
          </div>
          ${statusBadge(decision.status, decision.tone)}
        </div>
        <div class="method-note">
          ${escapeHtml(decision.label)}｜只使用完整日期與樣本門檻，不會自動調整 Meta 預算或投放狀態。
        </div>
      </div>

      <div class="decision-columns">
        <section class="decision-column action-column">
          <div class="column-heading">
            <span class="column-index">01</span>
            <div><h2>今日三件事</h2><p>依時效與資料完整性排序</p></div>
          </div>
          <ol class="action-list">
            ${decision.actions
              .map(
                (item) => `
                  <li>
                    <div>
                      <strong>${escapeHtml(item.title)}</strong>
                      <p>${escapeHtml(item.detail)}</p>
                    </div>
                    <span>${escapeHtml(item.reviewWindow)}</span>
                  </li>
                `,
              )
              .join("")}
          </ol>
        </section>

        <section class="decision-column">
          <div class="column-heading">
            <span class="column-index">02</span>
            <div><h2>需要檢查</h2><p>最多顯示三個高優先訊號</p></div>
          </div>
          <div class="decision-stack">${anomalyItems}</div>
        </section>

        <section class="decision-column">
          <div class="column-heading">
            <span class="column-index">03</span>
            <div><h2>測試機會</h2><p>候選不是加碼或停投指令</p></div>
          </div>
          <div class="decision-stack">${opportunityItems}</div>
        </section>
      </div>

      <details class="limitations">
        <summary>查看目前資料限制</summary>
        <ul>${decision.missingData.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </details>
    </section>
  `;
}

function adAssessment(ad, summary) {
  const amountSpent = Number(ad.amountSpent || 0);
  const impressions = Number(ad.impressions || 0);
  const clicksAll = Number(ad.clicksAll || 0);
  const ctrAll = Number(ad.ctrAll || 0);
  const cpcAll = Number(ad.cpcAll || 0);
  const accountCtrAll = Number(summary.ctrAll || 0);
  const accountCpcAll = Number(summary.cpcAll || 0);

  if (amountSpent < 100 || impressions < 1_000 || clicksAll < 20) {
    return { label: "樣本不足", tone: "neutral", reason: "尚未達到比較門檻" };
  }
  if (
    accountCtrAll > 0 &&
    accountCpcAll > 0 &&
    ctrAll >= accountCtrAll * 1.15 &&
    cpcAll <= accountCpcAll * 0.9
  ) {
    return { label: "測試候選", tone: "good", reason: "相較帳戶基準較有效率" };
  }
  if (
    accountCtrAll > 0 &&
    accountCpcAll > 0 &&
    ctrAll < accountCtrAll * 0.75 &&
    cpcAll > accountCpcAll * 1.25
  ) {
    return { label: "需檢查", tone: "warning", reason: "先檢查素材與受眾" };
  }
  return { label: "觀察", tone: "info", reason: "目前接近帳戶基準" };
}

function renderAdTable(adsResult, summary, currency) {
  if (!adsResult?.ok && !adsResult?.data?.length) {
    return notice(`廣告資料讀取失敗：${adsResult?.error || "未知錯誤"}`);
  }

  const ads = Array.isArray(adsResult?.data)
    ? [...adsResult.data].sort(
        (a, b) => Number(b.amountSpent || 0) - Number(a.amountSpent || 0),
      )
    : [];

  if (ads.length === 0) return notice("目前沒有可顯示的廣告資料。", "neutral");

  const desktopRows = ads
    .map((ad) => {
      const assessment = adAssessment(ad, summary);
      return `
        <tr>
          <td class="wrap"><strong>${escapeHtml(ad.adName || "未命名廣告")}</strong><small>${escapeHtml(ad.campaignName || "-")}</small></td>
          <td>${formatMoney(ad.amountSpent, currency, 0)}</td>
          <td>${formatNumber(ad.impressions, 0)}</td>
          <td>${formatNumber(ad.clicksAll, 0)}</td>
          <td>${formatNumber(ad.ctrAll, 2)}%</td>
          <td>${formatMoney(ad.cpcAll, currency, 2)}</td>
          <td>${statusBadge(assessment.label, assessment.tone)}<small>${escapeHtml(assessment.reason)}</small></td>
        </tr>
      `;
    })
    .join("");

  const mobileCards = ads
    .slice(0, 3)
    .map((ad) => renderAdCard(ad, summary, currency))
    .join("");
  const remainingCards = ads
    .slice(3)
    .map((ad) => renderAdCard(ad, summary, currency))
    .join("");

  return `
    <div class="desktop-only table-wrap">
      <table>
        <thead>
          <tr>
            <th>廣告／活動</th><th>Amount spent</th><th>Impressions</th>
            <th>Clicks (all)</th><th>CTR (all)</th><th>CPC (all)</th><th>規則判斷</th>
          </tr>
        </thead>
        <tbody>${desktopRows}</tbody>
      </table>
    </div>
    <div class="mobile-only card-list">
      ${mobileCards}
      ${
        remainingCards
          ? `<details class="more-details"><summary>查看其餘 ${ads.length - 3} 支廣告</summary>${remainingCards}</details>`
          : ""
      }
    </div>
  `;
}

function renderAdCard(ad, summary, currency) {
  const assessment = adAssessment(ad, summary);
  return `
    <article class="data-card">
      <div class="data-card-head">
        <div><strong>${escapeHtml(ad.adName || "未命名廣告")}</strong><small>${escapeHtml(ad.campaignName || "-")}</small></div>
        ${statusBadge(assessment.label, assessment.tone)}
      </div>
      <div class="mini-metrics">
        <span><small>Amount spent</small><b>${formatMoney(ad.amountSpent, currency, 0)}</b></span>
        <span><small>Clicks (all)</small><b>${formatNumber(ad.clicksAll, 0)}</b></span>
        <span><small>CTR (all)</small><b>${formatNumber(ad.ctrAll, 2)}%</b></span>
        <span><small>CPC (all)</small><b>${formatMoney(ad.cpcAll, currency, 2)}</b></span>
      </div>
      <p>${escapeHtml(assessment.reason)}</p>
    </article>
  `;
}

function regionAssessment(row, summary) {
  const amountSpent = Number(row.amountSpent || 0);
  const clicksAll = Number(row.clicksAll || 0);
  const ctrAll = Number(row.ctrAll || 0);
  const cpcAll = Number(row.cpcAll || 0);
  const accountCtrAll = Number(summary.ctrAll || 0);
  const accountCpcAll = Number(summary.cpcAll || 0);

  if (amountSpent < 100 || clicksAll < 20) {
    return { label: "樣本不足", tone: "neutral" };
  }
  if (
    accountCtrAll > 0 &&
    accountCpcAll > 0 &&
    ctrAll >= accountCtrAll * 1.15 &&
    cpcAll <= accountCpcAll * 0.9
  ) {
    return { label: "測試候選", tone: "good" };
  }
  if (
    accountCtrAll > 0 &&
    accountCpcAll > 0 &&
    ctrAll < accountCtrAll * 0.75 &&
    cpcAll > accountCpcAll * 1.25
  ) {
    return { label: "需檢查", tone: "warning" };
  }
  return { label: "觀察", tone: "info" };
}

function renderRegionAnalysis(breakdowns, summary, currency) {
  const result = breakdowns?.regions;
  if (!result?.ok && !result?.data?.length) {
    return notice(`區域資料讀取失敗：${result?.error || "未知錯誤"}`);
  }

  const rows = Array.isArray(result?.data)
    ? [...result.data].sort(
        (a, b) => Number(b.amountSpent || 0) - Number(a.amountSpent || 0),
      )
    : [];
  if (rows.length === 0) return notice("目前沒有區域資料。", "neutral");

  const desktopRows = rows
    .map((row) => {
      const assessment = regionAssessment(row, summary);
      return `
        <tr>
          <td><strong>${escapeHtml(translateRegion(row.region))}</strong></td>
          <td>${formatMoney(row.amountSpent, currency, 0)}</td>
          <td>${formatNumber(row.reach, 0)}</td>
          <td>${formatNumber(row.clicksAll, 0)}</td>
          <td>${formatNumber(row.ctrAll, 2)}%</td>
          <td>${formatMoney(row.cpcAll, currency, 2)}</td>
          <td>${formatNumber(row.frequency, 2)}</td>
          <td>${statusBadge(assessment.label, assessment.tone)}</td>
        </tr>
      `;
    })
    .join("");

  const renderCard = (row) => {
    const assessment = regionAssessment(row, summary);
    return `
      <article class="data-card compact">
        <div class="data-card-head"><strong>${escapeHtml(translateRegion(row.region))}</strong>${statusBadge(assessment.label, assessment.tone)}</div>
        <div class="mini-metrics">
          <span><small>Amount spent</small><b>${formatMoney(row.amountSpent, currency, 0)}</b></span>
          <span><small>Clicks (all)</small><b>${formatNumber(row.clicksAll, 0)}</b></span>
          <span><small>CTR (all)</small><b>${formatNumber(row.ctrAll, 2)}%</b></span>
          <span><small>CPC (all)</small><b>${formatMoney(row.cpcAll, currency, 2)}</b></span>
        </div>
      </article>
    `;
  };

  return `
    <div class="desktop-only table-wrap">
      <table>
        <thead><tr><th>區域</th><th>Amount spent</th><th>Reach</th><th>Clicks (all)</th><th>CTR (all)</th><th>CPC (all)</th><th>Frequency</th><th>規則判斷</th></tr></thead>
        <tbody>${desktopRows}</tbody>
      </table>
    </div>
    <div class="mobile-only card-list">
      ${rows.slice(0, 3).map(renderCard).join("")}
      ${
        rows.length > 3
          ? `<details class="more-details"><summary>查看其餘 ${rows.length - 3} 個區域</summary>${rows.slice(3).map(renderCard).join("")}</details>`
          : ""
      }
    </div>
  `;
}

function renderSimpleBreakdown(result, kind, currency) {
  if (!result?.ok && !result?.data?.length) {
    return notice(`資料讀取失敗：${result?.error || "未知錯誤"}`);
  }
  const rows = Array.isArray(result?.data)
    ? [...result.data].sort(
        (a, b) => Number(b.amountSpent || 0) - Number(a.amountSpent || 0),
      )
    : [];
  if (rows.length === 0) return notice("目前沒有可顯示的資料。", "neutral");

  const name = (row) => {
    if (kind === "demographic") {
      return `${row.age || "未分類"}／${translateGender(row.gender)}`;
    }
    return `${translatePlatform(row.publisher_platform)}／${translatePlacement(row.platform_position)}`;
  };

  const cards = rows.slice(0, 6).map(
    (row) => `
      <article class="breakdown-item">
        <div><strong>${escapeHtml(name(row))}</strong><small>${formatMoney(row.amountSpent, currency, 0)} Amount spent</small></div>
        <div class="breakdown-values">
          <span><small>CTR (all)</small><b>${formatNumber(row.ctrAll, 2)}%</b></span>
          <span><small>CPC (all)</small><b>${formatMoney(row.cpcAll, currency, 2)}</b></span>
          <span><small>Reach</small><b>${formatNumber(row.reach, 0)}</b></span>
        </div>
      </article>
    `,
  );
  return `<div class="breakdown-list">${cards.join("")}</div>`;
}

function classifyMaterial(adName = "") {
  const name = String(adName).toLowerCase();
  if (name.includes("見證") || name.includes("案例")) return "客戶見證／案例";
  if (
    name.includes("過程") ||
    name.includes("施工") ||
    name.includes("拆洗") ||
    name.includes("中洗")
  ) {
    return "施工／拆洗過程";
  }
  if (name.includes("前後") || name.includes("對比") || name.includes("成果")) {
    return "前後對比／成果";
  }
  if (name.includes("品牌") || name.includes("形象") || name.includes("搜尋")) {
    return "品牌形象／搜尋";
  }
  if (name.includes("美女") || name.includes("老闆") || name.includes("人物")) {
    return "人物開場／講解";
  }
  return "其他素材";
}

function renderMaterialAnalysis(adsResult, currency) {
  const ads = Array.isArray(adsResult?.data) ? adsResult.data : [];
  if (ads.length === 0) return notice("目前沒有足夠的廣告資料可分類。", "neutral");

  const grouped = new Map();
  for (const ad of ads) {
    const category = classifyMaterial(ad.adName || "");
    if (!grouped.has(category)) {
      grouped.set(category, {
        category,
        ads: 0,
        amountSpent: 0,
        clicksAll: 0,
        impressions: 0,
      });
    }
    const item = grouped.get(category);
    item.ads += 1;
    item.amountSpent += Number(ad.amountSpent || 0);
    item.clicksAll += Number(ad.clicksAll || 0);
    item.impressions += Number(ad.impressions || 0);
  }

  const rows = Array.from(grouped.values())
    .map((item) => ({
      ...item,
      ctrAll:
        item.impressions > 0 ? (item.clicksAll / item.impressions) * 100 : 0,
      cpcAll: item.clicksAll > 0 ? item.amountSpent / item.clicksAll : 0,
      sampleReady: item.impressions >= 1_000 && item.clicksAll >= 20,
    }))
    .sort((a, b) => {
      if (a.sampleReady !== b.sampleReady) return a.sampleReady ? -1 : 1;
      return b.ctrAll - a.ctrAll;
    });

  return `
    <div class="material-grid">
      ${rows
        .map(
          (row) => `
            <article class="material-card">
              <div class="data-card-head"><strong>${escapeHtml(row.category)}</strong>${statusBadge(row.sampleReady ? "可比較" : "樣本不足", row.sampleReady ? "info" : "neutral")}</div>
              <div class="mini-metrics">
                <span><small>廣告數</small><b>${formatNumber(row.ads, 0)}</b></span>
                <span><small>Amount spent</small><b>${formatMoney(row.amountSpent, currency, 0)}</b></span>
                <span><small>CTR (all)</small><b>${formatNumber(row.ctrAll, 2)}%</b></span>
                <span><small>CPC (all)</small><b>${formatMoney(row.cpcAll, currency, 2)}</b></span>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
    <p class="section-note">分類只依廣告名稱中的關鍵字，屬於規則式整理，不代表已理解影片內容。</p>
  `;
}

function renderLineDemand(categories = {}) {
  const entries = [
    ["價格／費用", Number(categories.price || 0)],
    ["預約／日期", Number(categories.booking || 0)],
    ["內裝／拆洗", Number(categories.interior || 0)],
    ["異味／發霉", Number(categories.odor || 0)],
    ["鍍膜／外觀", Number(categories.exterior || 0)],
    ["地址／電話", Number(categories.location || 0)],
  ];
  const max = Math.max(...entries.map(([, value]) => value), 1);

  return `
    <div class="demand-bars">
      ${entries
        .map(
          ([label, value]) => `
            <div class="demand-row">
              <div><span>${escapeHtml(label)}</span><b>${formatNumber(value, 0)}</b></div>
              <div class="bar"><i style="width:${Math.max(4, (value / max) * 100)}%"></i></div>
            </div>
          `,
        )
        .join("")}
    </div>
    <p class="section-note">同一則訊息可能符合多個關鍵字類別；此區不等於有效名單或成交。</p>
  `;
}

function renderLineTrend(rows = []) {
  const tableRows = rows
    .map(
      (row) => `
        <tr><td>${escapeHtml(row.day)}</td><td>${formatNumber(row.messages, 0)}</td><td>${formatNumber(row.users, 0)}</td></tr>
      `,
    )
    .join("");
  return `
    <div class="table-wrap compact-table">
      <table>
        <thead><tr><th>日期</th><th>訊息事件</th><th>匿名詢問帳號</th></tr></thead>
        <tbody>${tableRows || `<tr><td colspan="3">尚無資料</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function renderDataQuality(data) {
  const warnings = [];
  if (!data.meta?.ok) warnings.push(`Meta 摘要：${data.meta?.error || "讀取失敗"}`);
  if (!data.ads?.ok) warnings.push(`廣告：${data.ads?.error || "讀取失敗"}`);
  if (data.meta?.dataQuality?.pageLimitReached) {
    warnings.push("Meta 每日或摘要資料達到分頁上限，請確認完整性。");
  }
  if (data.meta?.ok && !data.meta?.dataQuality?.usesAggregateReach) {
    warnings.push("Meta 區間摘要未回傳，Reach 與 Frequency 顯示 N/A，不以每日值相加推估。");
  }
  if (data.ads?.dataQuality?.pageLimitReached) {
    warnings.push("廣告資料達到分頁上限，排行榜可能不完整。");
  }
  for (const [label, result] of [
    ["區域", data.breakdowns?.regions],
    ["人口", data.breakdowns?.demographics],
    ["版位", data.breakdowns?.placements],
  ]) {
    if (result?.dataQuality?.pageLimitReached) {
      warnings.push(`${label}資料達到分頁上限，結果可能不完整。`);
    }
  }

  if (warnings.length === 0) {
    return `<div class="quality-ok">資料端點回應正常；頁面使用規則式判斷，不代表成交或營收結論。</div>`;
  }
  return `<div class="quality-warning"><strong>資料品質提醒</strong><ul>${warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`;
}

function taipeiToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function renderDashboard(data) {
  const decision = data.decision ?? buildDecisionSnapshot(data);
  const summary = data.meta?.summary ?? {};
  const currency = summary.currency || "TWD";
  const updatedAt = new Date().toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour12: false,
  });
  const includesPartialToday = (data.meta?.daily ?? []).some(
    (row) => row.date_start === taipeiToday(),
  );
  const chartData = JSON.stringify(data.meta?.daily ?? []).replaceAll("<", "\\u003c");

  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Martin Decision Center</title>
  <style>
    :root {
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans TC", sans-serif;
      color: #172033;
      background: #f4f7fb;
      font-synthesis: none;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin: 0; background: #f4f7fb; color: #172033; }
    a { color: inherit; }
    .app { width: min(1280px, 100%); margin: 0 auto; padding: 24px; }
    .topbar { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-bottom: 18px; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand-mark { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; background: #0f3d6e; color: #fff; font-weight: 800; letter-spacing: .04em; }
    .brand strong { display: block; font-size: 17px; }
    .brand span, .updated { color: #6b778c; font-size: 13px; }
    .section-nav { position: sticky; top: 0; z-index: 10; display: flex; gap: 8px; overflow-x: auto; padding: 10px; margin: 0 0 18px; background: rgba(244,247,251,.94); backdrop-filter: blur(12px); border: 1px solid #e3e9f2; border-radius: 14px; }
    .section-nav a { text-decoration: none; white-space: nowrap; padding: 8px 12px; border-radius: 9px; color: #516078; font-size: 13px; font-weight: 700; }
    .section-nav a:hover { background: #e8eef7; color: #0f3d6e; }
    .decision-hero, .panel, .metric-card { background: #fff; border: 1px solid #e3e9f2; box-shadow: 0 8px 28px rgba(29,45,73,.06); }
    .decision-hero { border-radius: 22px; overflow: hidden; margin-bottom: 18px; }
    .decision-heading { padding: 28px 30px 24px; color: #fff; background: linear-gradient(135deg, #0a2d52 0%, #0f4f7c 62%, #12766b 100%); }
    .eyebrow { color: #93d5ff; font-size: 11px; font-weight: 800; letter-spacing: .16em; }
    .decision-title-row { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; margin-top: 9px; }
    h1, h2, h3, p { margin-top: 0; }
    h1 { margin-bottom: 8px; font-size: clamp(28px, 4vw, 42px); line-height: 1.15; letter-spacing: -.03em; }
    .decision-title-row p { max-width: 780px; margin-bottom: 0; color: #d8e7f4; line-height: 1.75; font-size: 16px; }
    .method-note { margin-top: 18px; color: #b9cedf; font-size: 12px; }
    .decision-columns { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); }
    .decision-column { padding: 22px; border-right: 1px solid #edf1f6; }
    .decision-column:last-child { border-right: 0; }
    .column-heading { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 16px; }
    .column-index { color: #1473a7; font-size: 12px; font-weight: 800; }
    .column-heading h2 { margin-bottom: 3px; font-size: 18px; }
    .column-heading p { margin-bottom: 0; color: #7b879a; font-size: 12px; }
    .action-list { list-style: none; margin: 0; padding: 0; }
    .action-list li { display: grid; grid-template-columns: 1fr auto; gap: 10px; padding: 13px 0; border-top: 1px solid #edf1f6; }
    .action-list li:first-child { border-top: 0; padding-top: 0; }
    .action-list strong, .decision-item strong { font-size: 14px; }
    .action-list p, .decision-item p { margin: 5px 0 0; color: #5f6d82; font-size: 13px; line-height: 1.65; }
    .action-list li > span { align-self: start; padding: 4px 7px; border-radius: 7px; background: #eef4f9; color: #516078; font-size: 10px; white-space: nowrap; }
    .decision-stack { display: grid; gap: 10px; }
    .decision-item { padding: 13px; background: #f8fafc; border: 1px solid #edf1f6; border-radius: 13px; }
    .decision-item-head { display: flex; gap: 8px; align-items: center; }
    .evidence-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
    .evidence-list span { padding: 6px 8px; border-radius: 8px; background: #fff; border: 1px solid #e3e9f2; color: #415069; font-size: 11px; }
    .evidence-list b { margin-right: 4px; }
    .evidence-list small { display: block; color: #8b96a7; margin-top: 2px; }
    .empty-state { padding: 16px; border-radius: 12px; background: #f8fafc; color: #6b778c; font-size: 13px; line-height: 1.6; }
    .limitations { padding: 13px 22px; border-top: 1px solid #edf1f6; background: #fbfcfe; color: #657288; font-size: 12px; }
    .limitations summary, .more-details summary { cursor: pointer; font-weight: 800; color: #24587c; }
    .limitations ul { margin-bottom: 0; line-height: 1.7; }
    .status { display: inline-flex; align-items: center; justify-content: center; min-height: 24px; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 800; white-space: nowrap; }
    .status.good { background: #dcfce7; color: #166534; }
    .status.warning { background: #fff1cc; color: #8a4b05; }
    .status.neutral { background: #e9eef5; color: #526176; }
    .status.info { background: #dff3ff; color: #075985; }
    .decision-title-row > .status { background: rgba(255,255,255,.15); color: #fff; border: 1px solid rgba(255,255,255,.24); }
    .section { scroll-margin-top: 82px; margin-top: 18px; }
    .section-head { display: flex; justify-content: space-between; gap: 18px; align-items: flex-end; margin-bottom: 12px; }
    .section-head h2 { margin-bottom: 4px; font-size: 21px; letter-spacing: -.015em; }
    .section-head p { margin-bottom: 0; color: #728097; font-size: 13px; }
    .metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; }
    .metric-card { padding: 17px; border-radius: 15px; min-width: 0; }
    .metric-label { color: #6e7b90; font-size: 12px; font-weight: 700; }
    .metric-value { margin-top: 9px; font-size: clamp(24px, 3vw, 31px); font-weight: 800; letter-spacing: -.03em; overflow-wrap: anywhere; }
    .metric-note { margin-top: 5px; color: #97a1b0; font-size: 11px; line-height: 1.45; }
    .panel { padding: 22px; border-radius: 18px; }
    .panel + .panel { margin-top: 14px; }
    .panel h3 { margin-bottom: 4px; font-size: 17px; }
    .panel-subtitle { margin-bottom: 16px; color: #77849a; font-size: 12px; }
    .two-column { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 14px; }
    .three-column { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 14px; }
    .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 11px 9px; border-bottom: 1px solid #edf1f6; text-align: left; white-space: nowrap; font-size: 12px; }
    th { color: #7b8798; font-size: 11px; letter-spacing: .02em; }
    td { color: #35435a; }
    td.wrap { white-space: normal; min-width: 210px; }
    td small, td.wrap small { display: block; margin-top: 4px; color: #8d98a8; font-size: 10px; line-height: 1.4; white-space: normal; }
    .compact-table table { min-width: 420px; }
    .breakdown-list { display: grid; gap: 9px; }
    .breakdown-item { display: grid; grid-template-columns: minmax(150px,1fr) 1.8fr; gap: 14px; align-items: center; padding: 12px 0; border-bottom: 1px solid #edf1f6; }
    .breakdown-item:last-child { border-bottom: 0; }
    .breakdown-item strong, .breakdown-item small { display: block; }
    .breakdown-item small { margin-top: 4px; color: #8b96a7; font-size: 10px; }
    .breakdown-values, .mini-metrics { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; }
    .breakdown-values span, .mini-metrics span { min-width: 0; }
    .breakdown-values small, .mini-metrics small { display: block; color: #8b96a7; font-size: 9px; }
    .breakdown-values b, .mini-metrics b { display: block; margin-top: 3px; font-size: 12px; overflow-wrap: anywhere; }
    .material-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 10px; }
    .material-card, .data-card { padding: 14px; border: 1px solid #e4eaf2; border-radius: 14px; background: #fbfcfe; }
    .data-card-head { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
    .data-card-head strong, .data-card-head small { display: block; }
    .data-card-head small { margin-top: 4px; color: #8894a5; font-size: 10px; }
    .data-card .mini-metrics, .material-card .mini-metrics { grid-template-columns: repeat(2,minmax(0,1fr)); margin-top: 13px; }
    .data-card p { margin: 10px 0 0; color: #667389; font-size: 11px; }
    .section-note { margin: 12px 0 0; color: #7b8798; font-size: 11px; line-height: 1.65; }
    .chart { position: relative; height: 300px; }
    .demand-bars { display: grid; gap: 14px; }
    .demand-row > div:first-child { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 6px; font-size: 12px; }
    .bar { height: 8px; border-radius: 999px; background: #e9eef5; overflow: hidden; }
    .bar i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg,#1678aa,#16a085); }
    .quality-ok, .quality-warning { margin-top: 18px; padding: 13px 15px; border-radius: 12px; font-size: 12px; line-height: 1.65; }
    .quality-ok { background: #eef8f5; color: #25634f; border: 1px solid #d4eee6; }
    .quality-warning { background: #fff8e8; color: #7c5318; border: 1px solid #f3e1ae; }
    .quality-warning ul { margin-bottom: 0; }
    .notice { padding: 14px 15px; border-radius: 12px; font-size: 12px; line-height: 1.65; }
    .notice.warning { background: #fff8e8; color: #7c5318; }
    .notice.neutral { background: #f1f4f8; color: #5f6d82; }
    .mobile-only { display: none; }
    .more-details { margin-top: 10px; }
    .more-details summary { padding: 11px; border-radius: 10px; background: #eef4f9; }
    .more-details .data-card { margin-top: 9px; }
    footer { padding: 24px 4px 8px; color: #7b8798; font-size: 11px; line-height: 1.75; }

    @media (max-width: 900px) {
      .decision-columns { grid-template-columns: 1fr; }
      .decision-column { border-right: 0; border-bottom: 1px solid #edf1f6; }
      .decision-column:last-child { border-bottom: 0; }
      .metric-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
      .two-column, .three-column { grid-template-columns: 1fr; }
      .material-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
    }

    @media (max-width: 640px) {
      .app { padding: 12px; }
      .topbar { align-items: flex-start; }
      .updated { max-width: 150px; text-align: right; }
      .section-nav { margin-left: -2px; margin-right: -2px; }
      .decision-heading { padding: 23px 18px 20px; }
      .decision-title-row { display: block; }
      .decision-title-row > .status { margin-top: 14px; }
      .decision-title-row p { font-size: 14px; }
      .decision-column { padding: 18px; }
      .action-list li { grid-template-columns: 1fr; }
      .action-list li > span { justify-self: start; }
      .section-head { display: block; }
      .metric-grid { gap: 9px; }
      .metric-card { padding: 14px; }
      .metric-value { font-size: 22px; }
      .panel { padding: 16px; }
      .desktop-only { display: none !important; }
      .mobile-only { display: block; }
      .card-list { display: grid; gap: 9px; }
      .more-details { display: block; }
      .mini-metrics { grid-template-columns: repeat(2,minmax(0,1fr)); }
      .material-grid { grid-template-columns: 1fr; }
      .chart { height: 250px; }
      .breakdown-item { grid-template-columns: 1fr; }
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
  <main class="app">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">MD</div>
        <div><strong>Martin Decision Center</strong><span>派威營運決策中心</span></div>
      </div>
      <div class="updated">更新時間：${escapeHtml(updatedAt)}<br>版本 2.0.0</div>
    </header>

    <nav class="section-nav" aria-label="儀表板區段">
      <a href="#overview">今日摘要</a><a href="#metrics">核心指標</a><a href="#ads">廣告</a>
      <a href="#audience">受眾</a><a href="#line">LINE</a><a href="#data-quality">資料品質</a>
    </nav>

    ${renderDecisionPanel(decision, currency)}

    <section class="section" id="metrics">
      <div class="section-head"><div><h2>核心指標</h2><p>先看營運與投放狀態；所有金額使用 ${escapeHtml(currency)}。</p></div></div>
      <div class="metric-grid">
        ${metricCard("近 24 小時 LINE 訊息", formatNumber(data.line?.messages24h), "訊息事件，不等於有效名單")}
        ${metricCard("近 7 天匿名詢問帳號", formatNumber(data.line?.users7d), "依匿名代碼計算")}
        ${metricCard("Amount spent", formatMoney(summary.amountSpent, currency, 0), "Meta｜近 7 天")}
        ${metricCard("Impressions", formatNumber(summary.impressions), "Meta｜區間彙總")}
        ${metricCard("Reach", data.meta?.dataQuality?.usesAggregateReach ? formatNumber(summary.reach) : "N/A", data.meta?.dataQuality?.usesAggregateReach ? "Meta｜區間彙總" : "區間摘要目前不可用")}
        ${metricCard("Clicks (all)", formatNumber(summary.clicksAll), "包含所有互動型點擊")}
        ${metricCard("CTR (all)", `${formatNumber(summary.ctrAll, 2)}%`, "Clicks (all) ÷ Impressions")}
        ${metricCard("CPC (all)", formatMoney(summary.cpcAll, currency, 2), "Amount spent ÷ Clicks (all)")}
      </div>
    </section>

    <section class="section" id="ads">
      <div class="section-head"><div><h2>廣告與素材</h2><p>候選只代表適合建立對照測試，不代表應加碼或停投。</p></div></div>
      <section class="panel">
        <h3>廣告比較</h3><p class="panel-subtitle">桌面顯示完整表格；手機預設只顯示三支廣告。</p>
        ${renderAdTable(data.ads, summary, currency)}
      </section>
      <section class="panel">
        <h3>規則式素材分類</h3><p class="panel-subtitle">依廣告名稱分類，並明確標示樣本門檻。</p>
        ${renderMaterialAnalysis(data.ads, currency)}
      </section>
      <div class="two-column">
        <section class="panel"><h3>Amount spent 趨勢</h3><p class="panel-subtitle">近 7 天，若包含今天則今天資料尚未完整。</p><div class="chart"><canvas id="spendChart"></canvas></div></section>
        <section class="panel"><h3>效率趨勢</h3><p class="panel-subtitle">CTR (all) 與 CPC (all) 使用不同座標軸。</p><div class="chart"><canvas id="efficiencyChart"></canvas></div></section>
      </div>
    </section>

    <section class="section" id="audience">
      <div class="section-head"><div><h2>受眾與版位</h2><p>Breakdown 只用於建立測試假設，不能單獨判斷 Meta 配置是否錯誤。</p></div></div>
      <section class="panel"><h3>區域</h3><p class="panel-subtitle">手機預設只顯示 Amount spent 最高的三個區域。</p>${renderRegionAnalysis(data.breakdowns, summary, currency)}</section>
      <div class="two-column">
        <section class="panel"><h3>年齡／性別</h3><p class="panel-subtitle">最多顯示六個主要組合。</p>${renderSimpleBreakdown(data.breakdowns?.demographics, "demographic", currency)}</section>
        <section class="panel"><h3>平台／版位</h3><p class="panel-subtitle">最多顯示六個主要組合。</p>${renderSimpleBreakdown(data.breakdowns?.placements, "placement", currency)}</section>
      </div>
    </section>

    <section class="section" id="line">
      <div class="section-head"><div><h2>LINE 互動</h2><p>目前仍缺少預約、成交與營收資料。</p></div></div>
      <div class="two-column">
        <section class="panel"><h3>近 14 天訊息趨勢</h3><p class="panel-subtitle">訊息事件與匿名詢問帳號。</p>${renderLineTrend(data.line?.daily)}</section>
        <section class="panel"><h3>近 30 天常見需求</h3><p class="panel-subtitle">依關鍵字規則整理。</p>${renderLineDemand(data.line?.categories)}</section>
      </div>
    </section>

    <section class="section" id="data-quality">
      <div class="section-head"><div><h2>資料品質</h2><p>明確顯示資料限制，避免把流量效率誤解為成交結果。</p></div></div>
      ${renderDataQuality(data)}
    </section>

    <footer>
      ${includesPartialToday ? "Meta 日期範圍包含今天；今天資料尚未完整並可能持續變動。<br>" : ""}
      此頁不顯示客戶姓名、電話或原始聊天內容。LINE 與 Meta 的現有資料尚未完成預約、成交與營收歸因。<br>
      規則式判斷只提供可驗證的測試假設，不會自動修改 Meta 廣告。
    </footer>
  </main>

  <script>
    const rows = ${chartData};
    const labels = rows.map((row) => String(row.date_start || '').slice(5).replace('-', '/'));
    const common = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } } },
      scales: { x: { grid: { display: false } } }
    };

    const spendCanvas = document.getElementById('spendChart');
    if (spendCanvas && rows.length) {
      new Chart(spendCanvas, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Amount spent', data: rows.map((row) => Number(row.amountSpent || 0)), borderColor: '#176fa3', backgroundColor: 'rgba(23,111,163,.12)', fill: true, borderWidth: 2.5, tension: .32, pointRadius: 2 }] },
        options: { ...common, scales: { ...common.scales, y: { beginAtZero: true, title: { display: true, text: '${escapeHtml(currency)}' } } } }
      });
    }

    const efficiencyCanvas = document.getElementById('efficiencyChart');
    if (efficiencyCanvas && rows.length) {
      new Chart(efficiencyCanvas, {
        type: 'line',
        data: { labels, datasets: [
          { label: 'CTR (all)', data: rows.map((row) => Number(row.ctrAll || 0)), yAxisID: 'yCtr', borderColor: '#168275', borderWidth: 2.5, tension: .32, pointRadius: 2 },
          { label: 'CPC (all)', data: rows.map((row) => Number(row.cpcAll || 0)), yAxisID: 'yCpc', borderColor: '#c07b18', borderWidth: 2.5, tension: .32, pointRadius: 2 }
        ] },
        options: { ...common, scales: {
          ...common.scales,
          yCtr: { beginAtZero: true, position: 'left', title: { display: true, text: 'CTR (all) %' } },
          yCpc: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'CPC (all) ${escapeHtml(currency)}' } }
        } }
      });
    }
  </script>
</body>
</html>`;
}
