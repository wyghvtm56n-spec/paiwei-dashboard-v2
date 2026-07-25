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
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >
  <title>派威營運 Dashboard</title>

  <style>
    :root {
      font-family:
        -apple-system, BlinkMacSystemFont,
        "Segoe UI", "Noto Sans TC", sans-serif;
      color: #1f2937;
      background: #f3f4f6;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      padding: 24px;
    }

    main {
      width: min(1180px, 100%);
      margin: 0 auto;
    }

    header { margin-bottom: 24px; }

    h1 {
      margin: 0 0 8px;
      font-size: 28px;
    }

    h2 {
      margin: 0 0 16px;
      font-size: 19px;
    }

    .updated {
      color: #6b7280;
      font-size: 14px;
    }

    .section-title {
      margin-top: 32px;
    }

    .cards {
      display: grid;
      grid-template-columns:
        repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
      margin-bottom: 24px;
    }

    .card,
    .panel {
      background: white;
      border-radius: 14px;
      box-shadow: 0 1px 4px rgb(0 0 0 / 8%);
    }

    .card { padding: 18px; }

    .card-title {
      color: #6b7280;
      font-size: 14px;
    }

    .card-value {
      margin-top: 8px;
      font-size: 32px;
      font-weight: 700;
    }

    .card-note {
      margin-top: 4px;
      color: #9ca3af;
      font-size: 12px;
    }

    .panels {
      display: grid;
      grid-template-columns:
        repeat(auto-fit, minmax(320px, 1fr));
      gap: 18px;
    }

    .panel {
      padding: 20px;
      overflow-x: auto;
    }

    .chart-wrap {
      position: relative;
      height: 380px;
    }

    .notice {
      margin-bottom: 18px;
      padding: 14px 16px;
      border-radius: 12px;
      background: #fff7ed;
      color: #9a3412;
      font-size: 14px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th,
    td {
      padding: 10px 8px;
      border-bottom: 1px solid #e5e7eb;
      text-align: left;
      white-space: nowrap;
    }

    th {
      color: #6b7280;
      font-size: 13px;
    }

    footer {
      margin-top: 22px;
      color: #6b7280;
      font-size: 13px;
      line-height: 1.7;
    }

    @media (max-width: 640px) {
      body { padding: 14px; }
      h1 { font-size: 23px; }
      .chart-wrap { height: 320px; }
    }
  </style>

  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>

<body>
  <main>
    <header>
      <h1>派威營運 Dashboard</h1>
      <div class="updated">
        更新時間：${escapeHtml(updatedAt)}
      </div>
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

    ${
      data.meta.ok
        ? ""
        : `<div class="notice">Meta 資料讀取失敗：${escapeHtml(data.meta.error)}</div>`
    }

    <div class="cards">
      ${card("廣告花費", `NT$${formatNumber(data.meta.summary.spend, 0)}`, "Meta Ads")}
      ${card("曝光", formatNumber(data.meta.summary.impressions), "Impressions")}
      ${card("觸及", formatNumber(data.meta.summary.reach), "Reach")}
      ${card("點擊", formatNumber(data.meta.summary.clicks), "Clicks")}
      ${card("CTR", `${formatNumber(data.meta.summary.ctr, 2)}%`, "Click Through Rate")}
      ${card("CPC", `NT$${formatNumber(data.meta.summary.cpc, 2)}`, "Cost Per Click")}
    </div>
<section class="panel" style="margin-bottom:18px;">
  <h2>AI 廣告健康度</h2>

  ${
    (() => {
      const ctr = Number(data.meta.summary.ctr || 0);
      const cpc = Number(data.meta.summary.cpc || 0);

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
      } else if (cpc <= 5) {
        score += 10;
        notes.push("CPC 在可接受範圍");
      } else {
        score -= 10;
        notes.push("CPC 偏高，建議檢查素材與受眾");
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
        <div style="
          display:grid;
          grid-template-columns:160px 1fr;
          gap:20px;
          align-items:center;
        ">
          <div style="
            text-align:center;
            padding:24px;
            background:#f8fafc;
            border-radius:14px;
          ">
            <div style="font-size:54px;font-weight:700;">
              ${score}
            </div>
            <div style="color:#64748b;">健康分數／100</div>
          </div>

          <div>
            <div style="font-size:22px;font-weight:700;margin-bottom:10px;">
              ${status}
            </div>
            <ul style="margin:0;padding-left:20px;line-height:1.8;">
              ${notes.map((note) => `<li>${note}</li>`).join("")}
            </ul>
          </div>
        </div>
      `;
    })()
  }
</section>


    <section class="panel" style="margin-bottom:18px;">
      <h2>🎬 AI 素材類型分析（近 7 天）</h2>

      ${(() => {
        const ads = Array.isArray(data.ads?.data) ? data.ads.data : [];

        if (ads.length === 0) {
          return `<div class="notice">目前沒有足夠的個別廣告資料可分析素材類型。</div>`;
        }

        const classifyMaterial = (adName = "") => {
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
        };

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

            return {
              ...item,
              ctr,
              cpc,
              advice,
            };
          })
          .sort((a, b) => {
            if (b.ctr !== a.ctr) return b.ctr - a.ctr;
            return a.cpc - b.cpc;
          });

        const best = rows[0];

        return `
          <div style="margin-bottom:16px;padding:14px 16px;border-radius:12px;background:#f8fafc;">
            <strong>目前最佳素材類型：</strong>
            ${escapeHtml(best.category)}
            （CTR ${formatNumber(best.ctr, 2)}%、CPC NT$${formatNumber(best.cpc, 2)}）
          </div>

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

          <div style="margin-top:12px;color:#64748b;font-size:13px;line-height:1.7;">
            分類依廣告名稱中的關鍵字自動判斷。之後廣告名稱若使用
            V001_客戶見證、V002_施工過程等固定格式，分析會更準確。
          </div>
        `;
      })()}
    </section>

    <section class="panel" style="margin-bottom:18px;">
      <h2>Meta 廣告近 7 天趨勢</h2>
      <div class="chart-wrap">
        <canvas id="metaAdsChart"></canvas>
      </div>
    </section>
<section class="panel" style="margin-bottom:18px;">
  <h2>Meta 廣告排行榜（近 7 天）</h2>

  ${
    Array.isArray(data.ads?.data) && data.ads.data.length > 0
      ? `
        <table>
          <thead>
            <tr>
              <th>廣告名稱</th>
              <th>活動</th>
              <th>花費</th>
              <th>點擊</th>
              <th>CTR</th>
              <th>CPC</th>
              <th>建議</th>
            </tr>
          </thead>
          <tbody>
            ${data.ads.data
              .map((ad) => {
                const ctr = Number(ad.ctr || 0);
                const cpc = Number(ad.cpc || 0);
                const spend = Number(ad.spend || 0);

                let advice = "持續觀察";

                if (ctr >= 4 && cpc > 0 && cpc <= 3) {
                  advice = "表現佳，可考慮加碼";
                } else if (ctr < 2 && spend >= 300) {
                  advice = "表現偏弱，建議更換素材";
                } else if (cpc > 6 && spend >= 300) {
                  advice = "成本偏高，建議停投檢查";
                }

                return `
                  <tr>
                    <td>${escapeHtml(ad.ad_name || "未命名廣告")}</td>
                    <td>${escapeHtml(ad.campaign_name || "-")}</td>
                    <td>NT$${formatNumber(spend, 0)}</td>
                    <td>${formatNumber(ad.clicks, 0)}</td>
                    <td>${formatNumber(ctr, 2)}%</td>
                    <td>NT$${formatNumber(cpc, 2)}</td>
                    <td>${escapeHtml(advice)}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      `
      : `<div class="notice">目前沒有可顯示的個別廣告資料。</div>`
  }
</section>
    <div class="panels">
      <section class="panel">
        <h2>最近 14 天訊息趨勢</h2>
        <table>
          <thead>
            <tr>
              <th>日期</th>
              <th>訊息數</th>
              <th>詢問人數</th>
            </tr>
          </thead>
          <tbody>
            ${
              dailyRows ||
              `<tr><td colspan="3">尚無資料</td></tr>`
            }
          </tbody>
        </table>
      </section>

      <section class="panel">
        <h2>近 30 天常見需求</h2>
        <table>
          <thead>
            <tr>
              <th>需求類型</th>
              <th>相關訊息數</th>
            </tr>
          </thead>
          <tbody>${categoryRows}</tbody>
        </table>
      </section>
    </div>

    <footer>
      此頁只顯示統計數字，不直接顯示客人的姓名、
      電話或原始聊天內容。<br>
      LINE 後台的人工回覆與實際成交結果，
      仍需搭配聊天 CSV 與訂單資料分析。
    </footer>
  </main>

  <script>
    const metaAdsDaily = ${chartData};
    const canvas = document.getElementById("metaAdsChart");

    if (canvas && metaAdsDaily.length > 0) {
      const labels = metaAdsDaily.map((day) => {
        const date = String(day.date_start || "");
        return date.length >= 10
          ? date.slice(5).replace("-", "/")
          : date;
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
          interaction: {
            mode: "index",
            intersect: false,
          },
          plugins: {
            legend: { position: "bottom" },
          },
          scales: {
            ySpend: {
              type: "linear",
              position: "left",
              beginAtZero: true,
              title: {
                display: true,
                text: "花費（NT$）",
              },
            },
            yClicks: {
              type: "linear",
              position: "right",
              beginAtZero: true,
              grid: { drawOnChartArea: false },
              title: {
                display: true,
                text: "點擊",
              },
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
