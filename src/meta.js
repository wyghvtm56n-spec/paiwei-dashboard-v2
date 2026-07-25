export async function fetchMetaDaily(env) {
  const accountId = env.meta_ad_account_id;
  const accessToken = env.META_ACCESS_TOKEN;

  if (!accountId || !accessToken) {
    return {
      ok: false,
      error: "Meta environment variables are missing",
      daily: [],
      summary: emptySummary(),
    };
  }

  const url = new URL(
    `https://graph.facebook.com/v25.0/${accountId}/insights`,
  );

  url.searchParams.set(
    "fields",
    "date_start,date_stop,impressions,reach,clicks,spend,cpc,ctr",
  );
  url.searchParams.set("time_increment", "1");
  url.searchParams.set("date_preset", "last_7d");
  url.searchParams.set("access_token", accessToken);

  try {
    const response = await fetch(url.toString());
    const payload = await response.json();

    if (!response.ok || payload.error) {
      return {
        ok: false,
        error:
          payload?.error?.message ??
          `Meta API request failed (${response.status})`,
        daily: [],
        summary: emptySummary(),
      };
    }

    const daily = Array.isArray(payload.data) ? payload.data : [];

    return {
      ok: true,
      error: null,
      daily,
      summary: summarizeMeta(daily),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      daily: [],
      summary: emptySummary(),
    };
  }
}

export function summarizeMeta(daily) {
  const summary = daily.reduce(
    (total, day) => {
      total.spend += Number(day.spend || 0);
      total.impressions += Number(day.impressions || 0);
      total.reach += Number(day.reach || 0);
      total.clicks += Number(day.clicks || 0);
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

  return summary;
}

function emptySummary() {
  return {
    spend: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    ctr: 0,
    cpc: 0,
  };
}
export async function fetchMetaAdsByAd(env) {
  const accountId = env.meta_ad_account_id;
  const accessToken = env.META_ACCESS_TOKEN;

  const url = new URL(
    `https://graph.facebook.com/v25.0/${accountId}/insights`
  );

  url.searchParams.set(
    "fields",
    "ad_id,ad_name,campaign_name,adset_name,impressions,reach,clicks,spend,cpc,ctr"
  );

  url.searchParams.set("level", "ad");
  url.searchParams.set("date_preset", "last_7d");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url.toString());
  return await response.json();
}
