const GRAPH_VERSION = "v25.0";
const PERIOD = "last_7d";

function emptySummary() {
  return {
    spend: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    ctr: 0,
    cpc: 0,
    frequency: 0,
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

async function fetchInsights(env, searchParams = {}) {
  const config = getMetaConfig(env);

  if (!config.ok) {
    return { ok: false, error: config.error, data: [] };
  }

  const url = new URL(
    `https://graph.facebook.com/${GRAPH_VERSION}/${config.accountId}/insights`,
  );

  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  url.searchParams.set("access_token", config.accessToken);
  url.searchParams.set("limit", "500");

  try {
    const rows = [];
    let nextUrl = url.toString();
    let pageCount = 0;

    while (nextUrl && pageCount < 10) {
      const response = await fetch(nextUrl);
      const payload = await response.json();

      if (!response.ok || payload.error) {
        return {
          ok: false,
          error:
            payload?.error?.message ??
            `Meta API request failed (${response.status})`,
          data: [],
        };
      }

      if (Array.isArray(payload.data)) {
        rows.push(...payload.data);
      }

      nextUrl = payload?.paging?.next || "";
      pageCount += 1;
    }

    return { ok: true, error: null, data: rows };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      data: [],
    };
  }
}

export function summarizeMeta(rows) {
  const summary = rows.reduce(
    (total, row) => {
      total.spend += Number(row.spend || 0);
      total.impressions += Number(row.impressions || 0);
      total.reach += Number(row.reach || 0);
      total.clicks += Number(row.clicks || 0);
      return total;
    },
    emptySummary(),
  );

  summary.ctr =
    summary.impressions > 0
      ? (summary.clicks / summary.impressions) * 100
      : 0;

  summary.cpc =
    summary.clicks > 0 ? summary.spend / summary.clicks : 0;

  summary.frequency =
    summary.reach > 0 ? summary.impressions / summary.reach : 0;

  return summary;
}

function withCalculatedMetrics(row) {
  const spend = Number(row.spend || 0);
  const impressions = Number(row.impressions || 0);
  const reach = Number(row.reach || 0);
  const clicks = Number(row.clicks || 0);

  return {
    ...row,
    spend,
    impressions,
    reach,
    clicks,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    frequency: reach > 0 ? impressions / reach : 0,
  };
}

export async function fetchMetaDaily(env) {
  const result = await fetchInsights(env, {
    fields:
      "date_start,date_stop,impressions,reach,clicks,spend,cpc,ctr,frequency",
    time_increment: "1",
    date_preset: PERIOD,
  });

  const daily = result.data.map(withCalculatedMetrics);

  return {
    ok: result.ok,
    error: result.error,
    daily,
    summary: summarizeMeta(daily),
  };
}

export async function fetchMetaAdsByAd(env) {
  const result = await fetchInsights(env, {
    fields:
      "ad_id,ad_name,campaign_name,adset_name,impressions,reach,clicks,spend,cpc,ctr,frequency",
    level: "ad",
    date_preset: PERIOD,
  });

  return {
    ok: result.ok,
    error: result.error,
    data: result.data.map(withCalculatedMetrics),
  };
}

async function fetchBreakdown(env, breakdowns) {
  const result = await fetchInsights(env, {
    fields: "impressions,reach,clicks,spend,cpc,ctr,frequency",
    level: "account",
    date_preset: PERIOD,
    breakdowns,
  });

  return {
    ok: result.ok,
    error: result.error,
    data: result.data.map(withCalculatedMetrics),
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
