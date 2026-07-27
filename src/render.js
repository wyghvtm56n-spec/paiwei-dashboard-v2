function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value, digits = 0) {
  return Number(value || 0).toLocaleString("zh-TW", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function card(title, value, note = "") {
  return `
    <section class="card">
      <div class="card-title">${escapeHtml(title)}</div>
      <div class="card-value">${escapeHtml(value)}</div>
      <div class="card-note">${escapeHtml(note)}</div>
    </section>
  `;
}

function notice(message) {
  return `<div class="notice">${escapeHtml(message)}</div>`;
}

function translateRegion(value) {
  const map = {
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
    "Penghu County": "澎湖縣",
    "Kinmen County": "金門縣",
    "Lienchiang County": "連江縣",
  };

  return map[value] || value || "未標示地區";
}

function translateGender(value) {
  const map = {
    male: "男性",
    female: "女性",
    unknown: "未標示",
  };
  return map[value] || value || "未標示";
}

function translatePlatform(value) {
  const map = {
    facebook: "Facebook",
    instagram: "Instagram",
    messenger: "Messenger",
    audience_network: "Audience Network",
    unknown: "未標示平台",
  };
  return map[value] || value || "未標示平台";
}

function translatePosition(value) {
  const map = {
    feed: "動態消息",
    story: "限時動態",
    reels: "Reels",
    search: "搜尋",
    marketplace: "Marketplace",
    right_hand_column: "右側欄",
    video_feeds: "影片動態",
    instream_video: "插播影片",
    rewarded_video: "獎勵式影片",
    messenger_inbox: "Messenger 收件匣",
    messenger_story: "Messenger 限時動態",
    instagram_explore: "Instagram 探索",
    instagram_explore_home: "Instagram 探索首頁",
    profile_feed: "個人檔案動態",
    unknown: "未標示版位",
  };
  return map[value] || value || "未標示版位";
}

function performanceAdvice(row, accountSummary) {
  const spend = Number(row.spend || 0);
  const clicks = Number(row.clicks || 0);
  const ctr = Number(row.ctr || 0);
  const cpc = Number(row.cpc || 0);
  const averageCtr = Number(accountSummary?.ctr || 0);
  const averageCpc = Number(accountSummary?.cpc || 0);

  if (spend < 100 || clicks < 8) {
    return { label: "資料仍少", className: "neutral" };
  }

  if (
    averageCtr > 0 &&
    averageCpc > 0 &&
    ctr >= averageCtr * 1.15 &&
    cpc <= averageCpc * 0.9
  ) {
    return { label: "加碼候選", className: "good" };
  }

  if (
    averageCtr > 0 &&
    averageCpc > 0 &&
    ctr < averageCtr * 0.75 &&
    cpc > averageCpc * 1.25
  ) {
    return { label: "成本偏高", className: "bad" };
  }

  return { label: "持續觀察", className: "watch" };
}

function renderRegionAnalysis(breakdowns, accountSummary) {
  const result = breakdowns?.regions;

  if (!result?.ok) {
    return notice(`縣市資料讀取失敗：${result?.error || "未知錯誤"}`);
  }

  const rows = Array.isArray(result.data)
    ? [...result.data].sort(
        (a, b) => Number(b.spend || 0) - Number(a.spend || 0),
      )
    : [];

  if (rows.length === 0) {
    return notice("Meta 目前沒有回傳可顯示的縣市資料。");
  }

  const qualified = rows
    .filter((row) => Number(row.spend || 0) >= 100 && Number(row.clicks || 0) >= 8)
    .map((row) => {
      const ctrRatio =
        Number(accountSummary?.ctr || 0) > 0
          ? Number(row.ctr || 0) / Number(accountSummary.ctr)
          : 1;
      const cpcRatio =
        Number(row.cpc || 0) > 0 && Number(accountSummary?.cpc || 0) > 0
          ? Number(accountSummary.cpc) / Number(row.cpc)
          : 1;
      return { ...row, score: ctrRatio + cpcRatio };
    })
    .sort((a, b) => b.score - a.score);

  const best = qualified[0];

  return `
    ${
      best
        ? `<div class="insight-callout">
            <strong>目前較值得優先觀察：</strong>
            ${escapeHtml(translateRegion(best.region))}，CTR ${formatNumber(best.ctr, 2)}%、CPC NT$${formatNumber(best.cpc, 2)}。
            這是投放測試候選，不代表已經確認有較高成交率。
          </div>`
        : `<div class="insight-callout muted">目前各縣市樣本仍少，先累積資料再決定預算。</div>`
    }

    <div class="table-wrap mobile-cards">
      <table>
        <thead>
          <tr>
            <th>縣市</th>
            <th>花費</th>
            <th>觸及</th>
            <th>點擊</th>
            <th>CTR</th>
            <th>CPC</th>
            <th>頻率</th>
            <th>系統判斷</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => {
              const advice = performanceAdvice(row, accountSummary);
              return `
                <tr>
                  <td data-label="縣市"><strong>${escapeHtml(translateRegion(row.region))}</strong></td>
                  <td data-label="花費">NT$${formatNumber(row.spend, 0)}</td>
                  <td data-label="觸及">${formatNumber(row.reach, 0)}</td>
                  <td data-label="點擊">${formatNumber(row.clicks, 0)}</td>
                  <td data-label="CTR">${formatNumber(row.ctr, 2)}%</td>
                  <td data-label="CPC">NT$${formatNumber(row.cpc, 2)}</td>
                  <td data-label="頻率">${formatNumber(row.frequency, 2)}</td>
                  <td data-label="系統判斷"><span class="status ${advice.className}">${escapeHtml(advice.label)}</span></td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderDemographics(breakdowns) {
  const result = breakdowns?.demographics;

  if (!result?.ok) {
    return notice(`年齡／性別資料讀取失敗：${result?.error || "未知錯誤"}`);
  }

  const rows = Array.isArray(result.data)
    ? [...result.data].sort(
        (a, b) => Number(b.spend || 0) - Number(a.spend || 0),
      )
    : [];

  if (rows.length === 0) {
    return notice("Meta 目前沒有回傳年齡／性別資料。");
  }

  return `
    <div class="table-wrap compact-table mobile-cards">
      <table>
        <thead>
          <tr>
            <th>年齡</th>
            <th>性別</th>
            <th>花費</th>
            <th>觸及</th>
            <th>點擊</th>
            <th>CTR</th>
            <th>CPC</th>
            <th>頻率</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td data-label="年齡">${escapeHtml(row.age || "未標示")}</td>
                  <td data-label="性別">${escapeHtml(translateGender(row.gender))}</td>
                  <td data-label="花費">NT$${formatNumber(row.spend, 0)}</td>
                  <td data-label="觸及">${formatNumber(row.reach, 0)}</td>
                  <td data-label="點擊">${formatNumber(row.clicks, 0)}</td>
                  <td data-label="CTR">${formatNumber(row.ctr, 2)}%</td>
                  <td data-label="CPC">NT$${formatNumber(row.cpc, 2)}</td>
                  <td data-label="頻率">${formatNumber(row.frequency, 2)}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPlacements(breakdowns) {
  const result = breakdowns?.placements;

  if (!result?.ok) {
    return notice(`平台／版位資料讀取失敗：${result?.error || "未知錯誤"}`);
  }

  const rows = Array.isArray(result.data)
    ? [...result.data].sort(
        (a, b) => Number(b.spend || 0) - Number(a.spend || 0),
      )
    : [];

  if (rows.length === 0) {
    return notice("Meta 目前沒有回傳平台／版位資料。");
  }

  return `
    <div class="table-wrap compact-table mobile-cards">
      <table>
        <thead>
          <tr>
            <th>平台</th>
            <th>版位</th>
            <th>花費</th>
            <th>觸及</th>
            <th>點擊</th>
            <th>CTR</th>
            <th>CPC</th>
            <th>頻率</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td data-label="平台">${escapeHtml(translatePlatform(row.publisher_platform))}</td>
                  <td data-label="版位" class="wrap-text">${escapeHtml(translatePosition(row.platform_position))}</td>
                  <td data-label="花費">NT$${formatNumber(row.spend, 0)}</td>
                  <td data-label="觸及">${formatNumber(row.reach, 0)}</td>
                  <td data-label="點擊">${formatNumber(row.clicks, 0)}</td>
                  <td data-label="CTR">${formatNumber(row.ctr, 2)}%</td>
                  <td data-label="CPC">NT$${formatNumber(row.cpc, 2)}</td>
                  <td data-label="頻率">${formatNumber(row.frequency, 2)}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function adAdvice(ad) {
  const ctr = Number(ad.ctr || 0);
  const cpc = Number(ad.cpc || 0);
  const spend = Number(ad.spend || 0);

  if (ctr >= 4 && cpc > 0 && cpc <= 3) {
    return "🟢 表現佳，可考慮加碼";
  }
  if (ctr < 2 && spend >= 300) {
    return "🔴 表現偏弱，建議更換素材";
  }
  if (cpc > 6 && spend >= 300) {
    return "🔴 成本偏高，建議停投檢查";
  }
  return "🟡 持續觀察";
}

function renderAdTableRows(ads) {
  return ads
    .map(
      (ad) => `
        <tr>
          <td data-label="廣告名稱" class="wrap-text"><strong>${escapeHtml(ad.ad_name || "未命名廣告")}</strong></td>
          <td data-label="活動" class="wrap-text">${escapeHtml(ad.campaign_name || "-")}</td>
          <td data-label="花費">NT$${formatNumber(ad.spend, 0)}</td>
          <td data-label="點擊">${formatNumber(ad.clicks, 0)}</td>
          <td data-label="CTR">${formatNumber(ad.ctr, 2)}%</td>
          <td data-label="CPC">NT$${formatNumber(ad.cpc, 2)}</td>
          <td data-label="AI 建議" class="wrap-text">${escapeHtml(adAdvice(ad))}</td>
        </tr>
      `,
    )
    .join("");
}

function renderAdRanking(adsResult) {
  if (!adsResult?.ok) {
    return notice(`個別廣告資料讀取失敗：${adsResult?.error || "未知錯誤"}`);
  }

  const ads = Array.isArray(adsResult.data)
    ? [...adsResult.data].sort(
        (a, b) => Number(b.spend || 0) - Number(a.spend || 0),
      )
    : [];

  if (ads.length === 0) {
    return notice("目前沒有可顯示的個別廣告資料。");
  }

  const topAds = ads.slice(0, 10);
  const remainingAds = ads.slice(10);

  const tableHeader = `
    <thead>
      <tr>
        <th>廣告名稱</th>
        <th>活動</th>
        <th>花費</th>
        <th>點擊</th>
        <th>CTR</th>
        <th>CPC</th>
        <th>AI 建議</th>
      </tr>
    </thead>
  `;

  return `
    <div class="table-wrap mobile-cards">
      <table>
        ${tableHeader}
        <tbody>${renderAdTableRows(topAds)}</tbody>
      </table>
    </div>
    ${
      remainingAds.length > 0
        ? `<details class="more-ads">
            <summary>查看其餘 ${remainingAds.length} 支廣告</summary>
            <div class="table-wrap mobile-cards">
              <table>
                ${tableHeader}
                <tbody>${renderAdTableRows(remainingAds)}</tbody>
              </table>
            </div>
          </details>`
        : ""
    }
  `;
}

function renderHealthScore(meta) {
  const ctr = Number(meta.summary.ctr || 0);
  const cpc = Number(meta.summary.cpc || 0);
  const frequency = Number(meta.summary.frequency || 0);

  let score = 50;
  const notes = [];

  if (ctr >= 4) {
    score += 25;
    notes.push("CTR 高於 4%，素材吸引力良好");
  } else if (ctr >= 3) {
    score += 18;
    notes.push("CTR 表現穩定");
  } else if (ctr >= 2) {
    score += 8;
    notes.push("CTR 尚可，仍有優化空間");
  } else {
    score -= 15;
    notes.push("CTR 偏低，建議測試新素材");
  }

  if (cpc > 0 && cpc <= 3) {
    score += 20;
    notes.push("CPC 低於 NT$3，點擊成本漂亮");
  } else if (cpc > 0 && cpc <= 5) {
    score += 10;
    notes.push("CPC 在可接受範圍");
  } else if (cpc > 5) {
    score -= 10;
    notes.push("CPC 偏高，建議檢查素材與受眾");
  }

  if (frequency >= 3) {
    score -= 8;
    notes.push("平均頻率較高，需注意素材疲勞");
  } else if (frequency > 0) {
    notes.push(`平均頻率 ${formatNumber(frequency, 2)}，目前仍可觀察`);
  }

  score = Math.max(0, Math.min(100, score));

  const status =
    score >= 85
      ? "表現優秀，建議維持投放"
      : score >= 70
        ? "表現良好，可持續觀察"
        : score >= 55
          ? "表現普通，暫時不要加碼"
          : "需要調整，建議更新素材";

  return `
    <div class="health-layout">
      <div class="score-box">
        <div class="score-number">${score}</div>
        <div class="score-label">健康分數／100</div>
      </div>
      <div>
        <div class="health-status">${escapeHtml(status)}</div>
        <ul class="health-notes">
          ${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}
        </ul>
      </div>
    </div>
  `;
}

function classifyMaterial(adName = "") {
  const name = String(adName).toLowerCase();

  if (name.includes("見證") || name.includes("案例")) {
    return "客戶見證／案例";
  }
  if (
    name.includes("過程") ||
    name.includes("施工") ||
    name.includes("拆洗") ||
    name.includes("中洗")
  ) {
    return "施工／拆洗過程";
  }
  if (
    name.includes("前後") ||
    name.includes("對比") ||
    name.includes("成果")
  ) {
    return "前後對比／成果";
  }
  if (
    name.includes("品牌") ||
    name.includes("形象") ||
    name.includes("搜尋")
  ) {
    return "品牌形象／搜尋";
  }
  if (
    name.includes("美女") ||
    name.includes("老闆") ||
    name.includes("人物")
  ) {
    return "人物開場／講解";
  }

  return "其他素材";
}

function renderMaterialAnalysis(adsResult) {
  const ads = Array.isArray(adsResult?.data) ? adsResult.data : [];

  if (ads.length === 0) {
    return notice("目前沒有足夠的個別廣告資料可分析素材類型。");
  }

  const grouped = new Map();

  for (const ad of ads) {
    const category = classifyMaterial(ad.ad_name || "");
    const spend = Number(ad.spend || 0);
    const clicks = Number(ad.clicks || 0);
    const impressions = Number(ad.impressions || 0);

    if (!grouped.has(category)) {
      grouped.set(category, {
        category,
        ads: 0,
        spend: 0,
        clicks: 0,
        impressions: 0,
      });
    }

    const item = grouped.get(category);
    item.ads += 1;
    item.spend += spend;
    item.clicks += clicks;
    item.impressions += impressions;
  }

  const rows = Array.from(grouped.values())
    .map((item) => {
      const ctr =
        item.impressions > 0
          ? (item.clicks / item.impressions) * 100
          : 0;
      const cpc = item.clicks > 0 ? item.spend / item.clicks : 0;

      let advice = "持續累積資料";
      if (ctr >= 4 && cpc > 0 && cpc <= 3) {
        advice = "表現佳，建議延伸同類素材";
      } else if (ctr < 2 && item.spend >= 300) {
        advice = "吸引力偏弱，建議重做前三秒或封面";
      } else if (cpc > 5 && item.spend >= 300) {
        advice = "點擊成本偏高，建議檢查素材與受眾";
      } else if (ctr >= 3) {
        advice = "表現穩定，可持續測試";
      }

      return { ...item, ctr, cpc, advice };
    })
    .sort((a, b) => {
      if (b.ctr !== a.ctr) return b.ctr - a.ctr;
      return a.cpc - b.cpc;
    });

  const best = rows[0];

  return `
    <div class="insight-callout">
      <strong>目前最佳素材類型：</strong>
      ${escapeHtml(best.category)}
      （CTR ${formatNumber(best.ctr, 2)}%、CPC NT$${formatNumber(best.cpc, 2)}）
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>素材類型</th>
            <th>廣告數</th>
            <th>花費</th>
            <th>點擊</th>
            <th>CTR</th>
            <th>CPC</th>
            <th>AI 建議</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td>${escapeHtml(row.category)}</td>
                  <td>${formatNumber(row.ads, 0)}</td>
                  <td>NT$${formatNumber(row.spend, 0)}</td>
                  <td>${formatNumber(row.clicks, 0)}</td>
                  <td>${formatNumber(row.ctr, 2)}%</td>
                  <td>NT$${formatNumber(row.cpc, 2)}</td>
                  <td>${escapeHtml(row.advice)}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
    <div class="explain-note">
      分類依廣告名稱中的關鍵字自動判斷。之後廣告名稱若使用
      V001_客戶見證、V002_施工過程等固定格式，分析會更準確。
    </div>
  `;
}

export function renderDashboard(data) {
  const dailyRows = data.line.daily
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.day)}</td>
          <td>${escapeHtml(row.messages)}</td>
          <td>${escapeHtml(row.users)}</td>
        </tr>
      `,
    )
    .join("");

  const categoryRows = [
    ["價格／費用", data.line.categories.price],
    ["預約／日期", data.line.categories.booking],
    ["內裝／拆洗", data.line.categories.interior],
    ["異味／發霉", data.line.categories.odor],
    ["鍍膜／外觀", data.line.categories.exterior],
    ["地址／電話", data.line.categories.location],
  ]
    .map(
      ([name, count]) => `
        <tr>
          <td>${escapeHtml(name)}</td>
          <td>${escapeHtml(count)}</td>
        </tr>
      `,
    )
    .join("");

  const updatedAt = new Date().toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour12: false,
  });

  const chartData = JSON.stringify(data.meta.daily ?? []).replaceAll(
    "<",
    "\\u003c",
  );

  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>派威營運 Dashboard</title>

  <style>
    :root {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans TC", sans-serif;
      color: #1f2937;
      background: #f3f4f6;
    }

    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; }
    main { width: min(1180px, 100%); margin: 0 auto; }
    header { margin-bottom: 24px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    h2 { margin: 0 0 16px; font-size: 19px; }
    h3 { margin: 0 0 14px; font-size: 17px; }
    .updated { color: #6b7280; font-size: 14px; }
    .section-title { margin-top: 32px; }

    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
      margin-bottom: 24px;
    }

    .card, .panel {
      background: white;
      border-radius: 14px;
      box-shadow: 0 1px 4px rgb(0 0 0 / 8%);
    }

    .card { padding: 18px; }
    .card-title { color: #6b7280; font-size: 14px; }
    .card-value { margin-top: 8px; font-size: 32px; font-weight: 700; }
    .card-note { margin-top: 4px; color: #9ca3af; font-size: 12px; }

    .panel { padding: 20px; overflow: hidden; }
    .panel-gap { margin-bottom: 18px; }
    .panels {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 18px;
    }
    .breakdown-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
      gap: 18px;
    }

    .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    table { width: 100%; border-collapse: collapse; }
    th, td {
      padding: 10px 8px;
      border-bottom: 1px solid #e5e7eb;
      text-align: left;
      white-space: nowrap;
    }
    th { color: #6b7280; font-size: 13px; }
    .compact-table table { min-width: 760px; }
    .wrap-text { white-space: normal; overflow-wrap: anywhere; min-width: 150px; }

    .chart-wrap { position: relative; height: 380px; }
    .notice {
      margin-bottom: 18px;
      padding: 14px 16px;
      border-radius: 12px;
      background: #fff7ed;
      color: #9a3412;
      font-size: 14px;
      line-height: 1.6;
    }

    .insight-callout {
      margin-bottom: 16px;
      padding: 14px 16px;
      border-radius: 12px;
      background: #eff6ff;
      color: #1e3a8a;
      line-height: 1.7;
    }
    .insight-callout.muted { background: #f8fafc; color: #475569; }
    .explain-note { margin-top: 12px; color: #64748b; font-size: 13px; line-height: 1.7; }

    .status {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
    }
    .status.good { background: #dcfce7; color: #166534; }
    .status.bad { background: #fee2e2; color: #991b1b; }
    .status.watch { background: #fef3c7; color: #92400e; }
    .status.neutral { background: #e2e8f0; color: #475569; }

    .health-layout {
      display: grid;
      grid-template-columns: 160px 1fr;
      gap: 20px;
      align-items: center;
    }
    .score-box { text-align: center; padding: 24px; background: #f8fafc; border-radius: 14px; }
    .score-number { font-size: 54px; font-weight: 700; }
    .score-label { color: #64748b; }
    .health-status { font-size: 22px; font-weight: 700; margin-bottom: 10px; }
    .health-notes { margin: 0; padding-left: 20px; line-height: 1.8; }

    .more-ads { margin-top: 14px; }
    .more-ads summary {
      cursor: pointer;
      color: #2563eb;
      font-weight: 700;
      padding: 10px 0;
    }

    footer { margin-top: 22px; color: #6b7280; font-size: 13px; line-height: 1.7; }

    @media (max-width: 640px) {
      body { padding: 12px; }
      h1 { font-size: 23px; }
      h2 { font-size: 18px; }
      .panel { padding: 16px; }
      .chart-wrap { height: 320px; }
      .health-layout { grid-template-columns: 1fr; }
      .breakdown-grid { grid-template-columns: 1fr; }
      .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .card { padding: 14px; }
      .card-value { font-size: 25px; }

      .mobile-cards table,
      .mobile-cards thead,
      .mobile-cards tbody,
      .mobile-cards tr,
      .mobile-cards th,
      .mobile-cards td { display: block; width: 100%; }
      .mobile-cards thead { display: none; }
      .mobile-cards table { min-width: 0; }
      .mobile-cards tr {
        margin-bottom: 12px;
        padding: 12px 14px;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        background: #fff;
      }
      .mobile-cards td {
        display: grid;
        grid-template-columns: minmax(88px, 38%) 1fr;
        gap: 10px;
        padding: 7px 0;
        border-bottom: 1px dashed #e5e7eb;
        white-space: normal;
        text-align: right;
        overflow-wrap: anywhere;
      }
      .mobile-cards td:last-child { border-bottom: 0; }
      .mobile-cards td::before {
        content: attr(data-label);
        color: #6b7280;
        font-size: 13px;
        font-weight: 700;
        text-align: left;
      }
      .more-ads .table-wrap { margin-top: 8px; }
    }
  </style>

  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
  <main>
    <header>
      <h1>派威營運 Dashboard</h1>
      <div class="updated">更新時間：${escapeHtml(updatedAt)}｜版本 1.4.0</div>
    </header>

    <div class="cards">
      ${card("近24小時訊息", data.line.messages24h, "客人傳入的訊息事件")}
      ${card("近7天訊息", data.line.messages7d, "所有訊息類型")}
      ${card("近7天詢問人數", data.line.users7d, "依匿名客戶代碼計算")}
      ${card("近30天新增好友", data.line.follow30d, "Webhook follow 事件")}
      ${card("近30天封鎖", data.line.unfollow30d, "Webhook unfollow 事件")}
      ${card("近7天照片", data.line.images7d, "圖片訊息")}
      ${card("近7天按鈕點擊", data.line.postbacks7d, "Postback 按鈕")}
    </div>

    <h2 class="section-title">Meta 廣告（近 7 天）</h2>
    ${data.meta.ok ? "" : notice(`Meta 資料讀取失敗：${data.meta.error}`)}

    <div class="cards">
      ${card("廣告花費", `NT$${formatNumber(data.meta.summary.spend, 0)}`, "Meta Ads")}
      ${card("曝光", formatNumber(data.meta.summary.impressions), "Impressions")}
      ${card("觸及", formatNumber(data.meta.summary.reach), "Reach")}
      ${card("點擊", formatNumber(data.meta.summary.clicks), "Clicks")}
      ${card("CTR", `${formatNumber(data.meta.summary.ctr, 2)}%`, "Click Through Rate")}
      ${card("CPC", `NT$${formatNumber(data.meta.summary.cpc, 2)}`, "Cost Per Click")}
      ${card("平均頻率", formatNumber(data.meta.summary.frequency, 2), "曝光 ÷ 觸及")}
    </div>

    <section class="panel panel-gap">
      <h2>📍 區域分析中心（近 7 天）</h2>
      ${renderRegionAnalysis(data.breakdowns, data.meta.summary)}
      <div class="explain-note">
        本區顯示 Meta 實際回傳的投放地區。加碼候選只代表點擊效率較佳，尚未納入 LINE 詢問或成交資料。
      </div>
    </section>

    <div class="breakdown-grid panel-gap">
      <section class="panel">
        <h3>👥 年齡／性別</h3>
        ${renderDemographics(data.breakdowns)}
      </section>
      <section class="panel">
        <h3>📱 平台／版位</h3>
        ${renderPlacements(data.breakdowns)}
      </section>
    </div>

    <section class="panel panel-gap">
      <h2>🏆 Meta 廣告排行榜（近 7 天）</h2>
      ${renderAdRanking(data.ads)}
    </section>

    <section class="panel panel-gap">
      <h2>AI 廣告健康度</h2>
      ${renderHealthScore(data.meta)}
    </section>

    <section class="panel panel-gap">
      <h2>🎬 AI 素材類型分析（近 7 天）</h2>
      ${renderMaterialAnalysis(data.ads)}
    </section>

    <section class="panel panel-gap">
      <h2>Meta 廣告近 7 天趨勢</h2>
      <div class="chart-wrap"><canvas id="metaAdsChart"></canvas></div>
    </section>

    <div class="panels">
      <section class="panel">
        <h2>最近 14 天訊息趨勢</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>日期</th><th>訊息數</th><th>詢問人數</th></tr></thead>
            <tbody>${dailyRows || `<tr><td colspan="3">尚無資料</td></tr>`}</tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <h2>近 30 天常見需求</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>需求類型</th><th>相關訊息數</th></tr></thead>
            <tbody>${categoryRows}</tbody>
          </table>
        </div>
      </section>
    </div>

    <footer>
      此頁只顯示統計數字，不直接顯示客人的姓名、電話或原始聊天內容。<br>
      LINE 後台的人工回覆與實際成交結果，仍需搭配聊天與訂單資料分析。
    </footer>
  </main>

  <script>
    const metaAdsDaily = ${chartData};
    const canvas = document.getElementById("metaAdsChart");

    if (canvas && metaAdsDaily.length > 0) {
      const labels = metaAdsDaily.map((day) => {
        const date = String(day.date_start || "");
        return date.length >= 10 ? date.slice(5).replace("-", "/") : date;
      });

      new Chart(canvas, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "每日花費（NT$）",
              data: metaAdsDaily.map((day) => Number(day.spend || 0)),
              yAxisID: "ySpend",
              borderWidth: 3,
              tension: 0.3,
            },
            {
              label: "每日點擊",
              data: metaAdsDaily.map((day) => Number(day.clicks || 0)),
              yAxisID: "yClicks",
              borderWidth: 3,
              tension: 0.3,
            },
            {
              label: "每日 CTR（%）",
              data: metaAdsDaily.map((day) => Number(day.ctr || 0)),
              yAxisID: "yCtr",
              borderWidth: 3,
              tension: 0.3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: { legend: { position: "bottom" } },
          scales: {
            ySpend: {
              type: "linear",
              position: "left",
              beginAtZero: true,
              title: { display: true, text: "花費（NT$）" },
            },
            yClicks: {
              type: "linear",
              position: "right",
              beginAtZero: true,
              grid: { drawOnChartArea: false },
              title: { display: true, text: "點擊" },
            },
            yCtr: {
              type: "linear",
              position: "right",
              beginAtZero: true,
              display: false,
              grid: { drawOnChartArea: false },
            },
          },
        },
      });
    } else if (canvas) {
      canvas.parentElement.innerHTML =
        '<div style="padding:40px;text-align:center;color:#6b7280;">尚無 Meta 每日趨勢資料</div>';
    }
  </script>
</body>
</html>`;
}
