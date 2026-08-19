const MIN_AD_AMOUNT_SPENT = 100;
const MIN_AD_CLICKS_ALL = 20;
const MIN_AD_IMPRESSIONS = 1_000;
const MIN_REGION_AMOUNT_SPENT = 100;
const MIN_REGION_CLICKS_ALL = 20;

function number(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function average(values) {
  const valid = values.map(number).filter((value) => Number.isFinite(value));
  return valid.length > 0
    ? valid.reduce((sum, value) => sum + value, 0) / valid.length
    : 0;
}

function percentChange(current, previous) {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function taipeiDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function completedDailyRows(rows, todayKey = taipeiDateKey()) {
  return [...rows]
    .filter((row) => row?.date_start && row.date_start !== todayKey)
    .sort((a, b) => String(a.date_start).localeCompare(String(b.date_start)));
}

function trendSnapshot(rows, todayKey) {
  const completed = completedDailyRows(rows, todayKey);
  const recent = completed.slice(-3);
  const previous = completed.slice(-6, -3);

  if (recent.length < 3 || previous.length < 3) {
    return {
      ready: false,
      recentPeriod: recent.map((row) => row.date_start),
      previousPeriod: previous.map((row) => row.date_start),
      ctrAllChange: null,
      cpcAllChange: null,
    };
  }

  const recentCtrAll = average(recent.map((row) => row.ctrAll));
  const previousCtrAll = average(previous.map((row) => row.ctrAll));
  const recentCpcAll = average(recent.map((row) => row.cpcAll));
  const previousCpcAll = average(previous.map((row) => row.cpcAll));

  return {
    ready: true,
    recentPeriod: recent.map((row) => row.date_start),
    previousPeriod: previous.map((row) => row.date_start),
    ctrAllChange: percentChange(recentCtrAll, previousCtrAll),
    cpcAllChange: percentChange(recentCpcAll, previousCpcAll),
  };
}

function qualifiedAdCandidates(ads, summary) {
  const accountCtrAll = number(summary.ctrAll);
  const accountCpcAll = number(summary.cpcAll);

  return ads
    .filter(
      (ad) =>
        number(ad.amountSpent) >= MIN_AD_AMOUNT_SPENT &&
        number(ad.clicksAll) >= MIN_AD_CLICKS_ALL &&
        number(ad.impressions) >= MIN_AD_IMPRESSIONS,
    )
    .map((ad) => {
      const ctrRatio = accountCtrAll > 0 ? number(ad.ctrAll) / accountCtrAll : 1;
      const cpcRatio =
        number(ad.cpcAll) > 0 && accountCpcAll > 0
          ? accountCpcAll / number(ad.cpcAll)
          : 1;
      return { ...ad, comparisonScore: ctrRatio + cpcRatio };
    })
    .sort((a, b) => b.comparisonScore - a.comparisonScore);
}

function qualifiedRegionCandidates(regions, summary) {
  const accountCtrAll = number(summary.ctrAll);
  const accountCpcAll = number(summary.cpcAll);

  return regions
    .filter(
      (row) =>
        number(row.amountSpent) >= MIN_REGION_AMOUNT_SPENT &&
        number(row.clicksAll) >= MIN_REGION_CLICKS_ALL,
    )
    .map((row) => {
      const ctrRatio = accountCtrAll > 0 ? number(row.ctrAll) / accountCtrAll : 1;
      const cpcRatio =
        number(row.cpcAll) > 0 && accountCpcAll > 0
          ? accountCpcAll / number(row.cpcAll)
          : 1;
      return { ...row, comparisonScore: ctrRatio + cpcRatio };
    })
    .sort((a, b) => b.comparisonScore - a.comparisonScore);
}

function evidence(metric, value, comparison = null) {
  return { metric, value, comparison };
}

export function buildDecisionSnapshot(data, options = {}) {
  const summary = data.meta?.summary ?? {};
  const ads = Array.isArray(data.ads?.data) ? data.ads.data : [];
  const regions = Array.isArray(data.breakdowns?.regions?.data)
    ? data.breakdowns.regions.data
    : [];
  const daily = Array.isArray(data.meta?.daily) ? data.meta.daily : [];
  const trend = trendSnapshot(daily, options.todayKey);

  const ctrAll = number(summary.ctrAll);
  const cpcAll = number(summary.cpcAll);
  const frequency = number(summary.frequency);
  const impressions = number(summary.impressions);
  const amountSpent = number(summary.amountSpent);
  const lineMessages24h = number(data.line?.messages24h);
  const lineUsers7d = number(data.line?.users7d);

  const dataReady = impressions >= 1_000 && amountSpent > 0;
  const anomalies = [];
  const opportunities = [];
  const actions = [];
  const missingData = [
    "尚未串接預約、成交與營收，因此不輸出加碼、停投或 ROAS 結論。",
  ];

  if (!dataReady) {
    anomalies.push({
      severity: "neutral",
      title: "Meta 樣本仍不足",
      detail: "先累積至少 1,000 Impressions 與有效 Amount spent，再判讀趨勢。",
      evidence: [
        evidence("Impressions", impressions),
        evidence("Amount spent", amountSpent),
      ],
    });
  }

  if (frequency >= 3.5) {
    anomalies.push({
      severity: "warning",
      title: "Frequency 偏高",
      detail: "同一批 Accounts Center accounts 可能重複看到素材，建議建立新素材測試。",
      evidence: [evidence("Frequency", frequency, "觀察門檻 3.5")],
    });
  }

  if (trend.ready && trend.ctrAllChange !== null && trend.ctrAllChange <= -10) {
    anomalies.push({
      severity: "warning",
      title: "CTR (all) 近三個完整日下滑",
      detail: "先檢查素材前段、訊息一致性與受眾重疊，不直接更動整體預算。",
      evidence: [
        evidence("CTR (all) 變化", trend.ctrAllChange, "最近 3 個完整日 vs 前 3 個完整日"),
      ],
    });
  }

  if (trend.ready && trend.cpcAllChange !== null && trend.cpcAllChange >= 15) {
    anomalies.push({
      severity: "warning",
      title: "CPC (all) 近三個完整日上升",
      detail: "先確認 CTR (all)、Frequency 與素材狀態，再建立小規模測試。",
      evidence: [
        evidence("CPC (all) 變化", trend.cpcAllChange, "最近 3 個完整日 vs 前 3 個完整日"),
      ],
    });
  }

  const adCandidate = qualifiedAdCandidates(ads, summary)[0] ?? null;
  if (adCandidate) {
    opportunities.push({
      type: "ad_test_candidate",
      title: "廣告測試候選",
      name: adCandidate.adName || "未命名廣告",
      detail: "相較帳戶基準，CTR (all) 較高且 CPC (all) 較低；僅建議建立對照測試。",
      evidence: [
        evidence("CTR (all)", number(adCandidate.ctrAll)),
        evidence("CPC (all)", number(adCandidate.cpcAll)),
        evidence("Clicks (all)", number(adCandidate.clicksAll)),
      ],
    });
  }

  const regionCandidate = qualifiedRegionCandidates(regions, summary)[0] ?? null;
  if (regionCandidate) {
    opportunities.push({
      type: "region_test_candidate",
      title: "區域測試候選",
      name: regionCandidate.region || "未知區域",
      detail: "點擊效率相較帳戶基準較佳，但尚未連結 LINE 詢問與成交。",
      evidence: [
        evidence("CTR (all)", number(regionCandidate.ctrAll)),
        evidence("CPC (all)", number(regionCandidate.cpcAll)),
        evidence("Clicks (all)", number(regionCandidate.clicksAll)),
      ],
    });
  }

  if (lineMessages24h > 0) {
    actions.push({
      priority: "high",
      title: "處理最新 LINE 詢問",
      detail: `近 24 小時共有 ${lineMessages24h} 則訊息，先確認是否有尚未預約的高意圖詢問。`,
      reviewWindow: "今天營業時間內",
    });
  } else {
    actions.push({
      priority: "medium",
      title: "檢查 LINE 互動下降原因",
      detail: "近 24 小時沒有訊息事件，確認 Webhook、活動導流與營業時段是否正常。",
      reviewWindow: "今天",
    });
  }

  if (anomalies.some((item) => item.title.includes("Frequency"))) {
    actions.push({
      priority: "high",
      title: "準備一組新素材測試",
      detail: "以既有優勢訴求製作不同前三秒與封面，保留原素材作為對照組。",
      reviewWindow: "48 小時內",
    });
  } else if (adCandidate) {
    actions.push({
      priority: "medium",
      title: "延伸廣告測試候選",
      detail: "複製相同核心訴求，只更換一個變因，避免同時更改素材與受眾。",
      reviewWindow: "下一輪素材排程",
    });
  }

  if (!trend.ready) {
    actions.push({
      priority: "medium",
      title: "等待完整比較期間",
      detail: "目前不足六個完整日，暫不做趨勢結論。",
      reviewWindow: "資料滿六個完整日後",
    });
  } else {
    actions.push({
      priority: "medium",
      title: "固定時間回顧完整日趨勢",
      detail: "只比較完整日期，避免當日未結束資料造成誤判。",
      reviewWindow: "明日上午",
    });
  }

  let status = "穩定觀察";
  let tone = "good";
  if (!dataReady || !trend.ready) {
    status = "資料不足";
    tone = "neutral";
  } else if (anomalies.some((item) => item.severity === "warning")) {
    status = "需要檢查";
    tone = "warning";
  }

  const summaryText =
    status === "需要檢查"
      ? "目前有需要優先檢查的投放訊號；先找出原因，再決定是否建立新測試。"
      : status === "資料不足"
        ? "目前資料不足以做強結論；先確保資料完整並等待可比較的完整日期。"
        : "主要投放訊號暫時穩定，今天以處理詢問與小規模測試規劃為主。";

  return {
    mode: "rules_v2",
    label: "規則式決策摘要",
    status,
    tone,
    summaryText,
    actions: actions.slice(0, 3),
    anomalies: anomalies.slice(0, 3),
    opportunities: opportunities.slice(0, 3),
    missingData,
    trend,
    context: {
      lineMessages24h,
      lineUsers7d,
      amountSpent,
      impressions,
      ctrAll,
      cpcAll,
      frequency,
    },
  };
}

export const decisionThresholds = {
  MIN_AD_AMOUNT_SPENT,
  MIN_AD_CLICKS_ALL,
  MIN_AD_IMPRESSIONS,
  MIN_REGION_AMOUNT_SPENT,
  MIN_REGION_CLICKS_ALL,
};
