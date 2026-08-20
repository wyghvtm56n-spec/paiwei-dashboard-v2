const GRAPH_VERSION = "v26.0";
const PERIOD = "last_7d";
const PAGE_LIMIT = 500;
const MAX_PAGES = 10;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_RETRIES = 2;

function emptySummary() {
  return {
    amountSpent: 0,
    impressions: 0,
    reach: 0,
    clicksAll: 0,
    ctrAll: 0,
    cpcAll: 0,
    frequency: 0,
    currency: null,
  };
}

function getMetaConfig(env) {
  const accountId = env.meta_ad_account_id;
  const accessToken = env.META_ACCESS_TOKEN;

  if (!accountId || !accessToken) {
    return {
      ok: false,
      error: "Meta environment variables are missing",
    };
  }

  return { ok: true, accountId, accessToken };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url, accessToken) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
      const payload = await response.json();

      if (response.ok && !payload.error) {
        return { ok: true, response, payload };
      }

      const retryable = response.status === 429 || response.status >= 500;
      lastError =
        payload?.error?.message ?? `Meta API request failed (${response.status})`;

      if (!retryable || attempt === MAX_RETRIES) {
        return { ok: false, error: lastError, status: response.status };
      }
    } catch (error) {
      lastError =
        error?.name === "AbortError"
          ? "Meta API request timed out"
          : error instanceof Error
            ? error.message
            : String(error);

      if (attempt === MAX_RETRIES) {
        return { ok: false, error: lastError, status: 0 };
      }
    } finally {
      clearTimeout(timeoutId);
    }

    await sleep(250 * 2 ** attempt);
  }

  return { ok: false, error: lastError || "Meta API request failed", status: 0 };
}

async function fetchInsights(env, searchParams = {}) {
  const config = getMetaConfig(env);

  if (!config.ok) {
    return {
      ok: false,
      error: config.error,
      data: [],
      pageCount: 0,
      truncated: false,
    };
  }

  const url = new URL(
    `https://graph.facebook.com/${GRAPH_VERSION}/${config.accountId}/insights`,
  );

  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  url.searchParams.set("limit", String(PAGE_LIMIT));

  const rows = [];
  let nextUrl = url.toString();
  let pageCount = 0;

  while (nextUrl && pageCount < MAX_PAGES) {
    const requestUrl = new URL(nextUrl);
    requestUrl.searchParams.delete("access_token");
    const result = await fetchJsonWithRetry(requestUrl.toString(), config.accessToken);

    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        data: rows,
        pageCount,
        truncated: Boolean(nextUrl),
      };
    }

    if (Array.isArray(result.payload.data)) {
      rows.push(...result.payload.data);
    }

    nextUrl = result.payload?.paging?.next || "";
    pageCount += 1;
  }

  return {
    ok: true,
    error: null,
    data: rows,
    pageCount,
    truncated: Boolean(nextUrl),
  };
}

function withCalculatedMetrics(row = {}) {
  const amountSpent = Number(row.spend || 0);
  const impressions = Number(row.impressions || 0);
  const reach = Number(row.reach || 0);
  const clicksAll = Number(row.clicks || 0);

  return {
    ...row,
    adId: row.ad_id ?? null,
    adName: row.ad_name ?? null,
    campaignName: row.campaign_name ?? null,
    adSetName: row.adset_name ?? null,
    amountSpent,
    impressions,
    reach,
    clicksAll,
    ctrAll: impressions > 0 ? (clicksAll / impressions) * 100 : 0,
    cpcAll: clicksAll > 0 ? amountSpent / clicksAll : 0,
    frequency: reach > 0 ? impressions / reach : Number(row.frequency || 0),
    currency: row.account_currency ?? null,
  };
}

function fallbackSummaryFromDaily(rows) {
  const totals = rows.reduce(
    (summary, row) => {
      summary.amountSpent += Number(row.amountSpent || 0);
      summary.impressions += Number(row.impressions || 0);
      summary.clicksAll += Number(row.clicksAll || 0);
      summary.currency ||= row.currency ?? null;
      return summary;
    },
    emptySummary(),
  );

  totals.ctrAll =
    totals.impressions > 0
      ? (totals.clicksAll / totals.impressions) * 100
      : 0;
  totals.cpcAll =
    totals.clicksAll > 0 ? totals.amountSpent / totals.clicksAll : 0;
  totals.reach = null;
  totals.frequency = null;

  return totals;
}

function combinedError(results) {
  const errors = results.map((result) => result.error).filter(Boolean);
  return errors.length > 0 ? errors.join("；") : null;
}

export async function fetchMetaDaily(env) {
  const fields =
    "account_currency,date_start,date_stop,impressions,reach,clicks,spend,frequency";

  const [dailyResult, summaryResult] = await Promise.all([
    fetchInsights(env, {
      fields,
      time_increment: "1",
      date_preset: PERIOD,
    }),
    fetchInsights(env, {
      fields,
      date_preset: PERIOD,
    }),
  ]);

  const daily = dailyResult.data.map(withCalculatedMetrics);
  const summary = summaryResult.data[0]
    ? withCalculatedMetrics(summaryResult.data[0])
    : fallbackSummaryFromDaily(daily);

  return {
    ok: dailyResult.ok || summaryResult.ok,
    error: combinedError([dailyResult, summaryResult]),
    period: PERIOD,
    daily,
    summary,
    dataQuality: {
      dailyComplete: dailyResult.ok && !dailyResult.truncated,
      summaryComplete: summaryResult.ok && !summaryResult.truncated,
      pageLimitReached: dailyResult.truncated || summaryResult.truncated,
      usesAggregateReach: Boolean(summaryResult.data[0]),
    },
  };
}

export async function fetchMetaAdsByAd(env) {
  const result = await fetchInsights(env, {
    fields:
      "account_currency,ad_id,ad_name,campaign_name,adset_name,impressions,reach,clicks,spend,frequency",
    level: "ad",
    date_preset: PERIOD,
  });

  return {
    ok: result.ok,
    error: result.error,
    data: result.data.map(withCalculatedMetrics),
    dataQuality: {
      complete: result.ok && !result.truncated,
      pageCount: result.pageCount,
      pageLimitReached: result.truncated,
    },
  };
}

async function fetchBreakdown(env, breakdowns) {
  const result = await fetchInsights(env, {
    fields: "account_currency,impressions,reach,clicks,spend,frequency",
    level: "account",
    date_preset: PERIOD,
    breakdowns,
  });

  return {
    ok: result.ok,
    error: result.error,
    data: result.data.map(withCalculatedMetrics),
    dataQuality: {
      complete: result.ok && !result.truncated,
      pageCount: result.pageCount,
      pageLimitReached: result.truncated,
    },
  };
}

export async function fetchMetaBreakdowns(env) {
  const [regions, demographics, placements] = await Promise.all([
    fetchBreakdown(env, "region"),
    fetchBreakdown(env, "age,gender"),
    fetchBreakdown(env, "publisher_platform,platform_position"),
  ]);

  return {
    period: PERIOD,
    regions,
    demographics,
    placements,
  };
}
