const GRAPH_VERSION = "v26.0";
const PAGE_LIMIT = 50;
const MAX_PAGES = 4;
const MAX_PAGE_VIDEOS = 30;
const MAX_IG_MEDIA = 30;
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 8_000;
const INSIGHTS_BATCH_SIZE = 4;

function config(env) {
  return {
    graphVersion: env.META_CONTENT_GRAPH_VERSION || GRAPH_VERSION,
    pageId: env.META_CONTENT_PAGE_ID || null,
    pageToken: env.META_CONTENT_PAGE_ACCESS_TOKEN || null,
    userToken: env.META_CONTENT_USER_ACCESS_TOKEN || null,
    igUserId: env.META_CONTENT_IG_USER_ID || null,
  };
}

function missing(error) {
  return {
    ok: false,
    error,
    data: [],
    dataQuality: { complete: false, missingConfiguration: true },
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function graphRequest(url, token) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      const payload = await response.json();

      if (response.ok && !payload.error) {
        return { ok: true, payload };
      }

      lastError = payload?.error?.message || `Meta content API failed (${response.status})`;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === MAX_RETRIES) {
        return { ok: false, error: lastError, status: response.status };
      }
    } catch (error) {
      lastError =
        error?.name === "AbortError"
          ? "Meta content API request timed out"
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

  return { ok: false, error: lastError || "Meta content API failed", status: 0 };
}

function graphUrl(version, path, params = {}) {
  const url = new URL(`https://graph.facebook.com/${version}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function fetchPages(version, path, token, params = {}, maxItems = 50) {
  const rows = [];
  let nextUrl = graphUrl(version, path, {
    ...params,
    limit: PAGE_LIMIT,
  }).toString();
  let pageCount = 0;

  while (nextUrl && pageCount < MAX_PAGES && rows.length < maxItems) {
    const requestUrl = new URL(nextUrl);
    requestUrl.searchParams.delete("access_token");
    const result = await graphRequest(requestUrl.toString(), token);
    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        data: rows,
        pageCount,
        truncated: Boolean(nextUrl),
      };
    }

    if (Array.isArray(result.payload.data)) rows.push(...result.payload.data);
    nextUrl = result.payload?.paging?.next || "";
    pageCount += 1;
  }

  return {
    ok: true,
    error: null,
    data: rows.slice(0, maxItems),
    pageCount,
    truncated: Boolean(nextUrl),
  };
}

function insightValue(item) {
  if (item?.total_value?.value !== undefined) return item.total_value.value;
  if (Array.isArray(item?.values) && item.values[0]?.value !== undefined) {
    return item.values[0].value;
  }
  return null;
}

function normalizeInsights(payload) {
  return Object.fromEntries(
    (Array.isArray(payload?.data) ? payload.data : []).map((item) => [
      item.name,
      {
        value: insightValue(item),
        period: item.period || "lifetime",
        title: item.title || item.name,
      },
    ]),
  );
}

function contentType(media) {
  return String(media.media_product_type || media.media_type || "FEED").toUpperCase();
}

async function fetchPageVideoInsights(version, video, token) {
  const url = graphUrl(version, `${video.id}/video_insights`, {
    metric: "total_video_views,total_video_views_unique",
  });
  const result = await graphRequest(url.toString(), token);
  if (!result.ok) {
    return {
      ...video,
      source: "facebook_page",
      insights: {},
      insightsError: result.error,
    };
  }

  return {
    id: video.id,
    source: "facebook_page",
    title: video.description || "Facebook 粉專影片",
    description: video.description || null,
    createdTime: video.created_time || null,
    updatedTime: video.updated_time || null,
    permalink: video.permalink_url || null,
    mediaType: "VIDEO",
    insights: normalizeInsights(result.payload),
    insightsError: null,
  };
}

async function fetchPageVideos(env) {
  const cfg = config(env);
  if (!cfg.pageId || !cfg.pageToken) {
    return missing("缺少 META_CONTENT_PAGE_ID 或 META_CONTENT_PAGE_ACCESS_TOKEN");
  }

  const result = await fetchPages(
    cfg.graphVersion,
    `${cfg.pageId}/videos`,
    cfg.pageToken,
    { fields: "id,description,created_time,updated_time,permalink_url" },
    MAX_PAGE_VIDEOS,
  );

  if (!result.ok && result.data.length === 0) {
    return {
      ok: false,
      error: result.error,
      data: [],
      dataQuality: { complete: false, pageCount: result.pageCount },
    };
  }

  const data = [];
  for (let index = 0; index < result.data.length; index += INSIGHTS_BATCH_SIZE) {
    const batch = result.data.slice(index, index + INSIGHTS_BATCH_SIZE);
    data.push(...(await Promise.all(batch.map((video) => fetchPageVideoInsights(cfg.graphVersion, video, cfg.pageToken)))));
  }

  const insightErrors = data.filter((item) => item.insightsError).length;
  return {
    ok: true,
    error: insightErrors ? `${insightErrors} 支粉專影片洞察讀取失敗` : null,
    data,
    dataQuality: {
      complete: !result.truncated && insightErrors === 0,
      listComplete: !result.truncated,
      pageCount: result.pageCount,
      insightErrors,
    },
  };
}

async function resolveInstagramUserId(cfg) {
  if (cfg.igUserId) return { ok: true, id: cfg.igUserId };
  if (!cfg.pageId || !cfg.userToken) {
    return { ok: false, error: "缺少 META_CONTENT_IG_USER_ID，且無法用 Page ID 與 User Token 查詢" };
  }

  const url = graphUrl(cfg.graphVersion, cfg.pageId, {
    fields: "instagram_business_account",
  });
  const result = await graphRequest(url.toString(), cfg.userToken);
  const id = result.payload?.instagram_business_account?.id;
  if (!result.ok || !id) {
    return {
      ok: false,
      error: result.error || "找不到與 Facebook Page 連結的 Instagram Professional Account",
    };
  }
  return { ok: true, id };
}

async function fetchInstagramMediaInsights(version, media, token) {
  const baseMetrics = "views,reach,likes,comments,saved,shares,total_interactions";
  const baseUrl = graphUrl(version, `${media.id}/insights`, {
    metric: baseMetrics,
  });
  const baseResult = await graphRequest(baseUrl.toString(), token);
  let insights = baseResult.ok ? normalizeInsights(baseResult.payload) : {};
  let insightsError = baseResult.ok ? null : baseResult.error;

  const isReel = contentType(media) === "REELS";
  if (isReel) {
    const reelUrl = graphUrl(version, `${media.id}/insights`, {
      metric:
        "ig_reels_avg_watch_time,ig_reels_video_view_total_time,reels_skip_rate,crossposted_views,facebook_views,total_views",
    });
    const reelResult = await graphRequest(reelUrl.toString(), token);
    if (reelResult.ok) {
      insights = { ...insights, ...normalizeInsights(reelResult.payload) };
    } else if (!insightsError) {
      insightsError = reelResult.error;
    }
  }

  return {
    ...media,
    source: "instagram",
    mediaType: contentType(media),
    insights,
    insightsError,
  };
}

async function fetchInstagramMedia(env) {
  const cfg = config(env);
  if (!cfg.userToken) {
    return missing("缺少 META_CONTENT_USER_ACCESS_TOKEN");
  }

  const user = await resolveInstagramUserId(cfg);
  if (!user.ok) {
    return missing(user.error);
  }

  const result = await fetchPages(
    cfg.graphVersion,
    `${user.id}/media`,
    cfg.userToken,
    {
      fields:
        "id,caption,media_type,media_product_type,media_url,permalink,thumbnail_url,timestamp",
    },
    MAX_IG_MEDIA,
  );

  if (!result.ok && result.data.length === 0) {
    return {
      ok: false,
      error: result.error,
      data: [],
      instagramUserId: user.id,
      dataQuality: { complete: false, pageCount: result.pageCount },
    };
  }

  const data = [];
  for (let index = 0; index < result.data.length; index += INSIGHTS_BATCH_SIZE) {
    const batch = result.data.slice(index, index + INSIGHTS_BATCH_SIZE);
    data.push(...(await Promise.all(batch.map((media) => fetchInstagramMediaInsights(cfg.graphVersion, media, cfg.userToken)))));
  }

  const insightErrors = data.filter((item) => item.insightsError).length;
  return {
    ok: true,
    error: insightErrors ? `${insightErrors} 筆 Instagram Media 洞察讀取失敗` : null,
    data: data.map((media) => ({
      id: media.id,
      source: "instagram",
      title: media.caption || "Instagram 媒體",
      description: media.caption || null,
      createdTime: media.timestamp || null,
      updatedTime: media.timestamp || null,
      permalink: media.permalink || null,
      mediaUrl: media.media_url || null,
      thumbnailUrl: media.thumbnail_url || null,
      mediaType: media.mediaType,
      insights: media.insights,
      insightsError: media.insightsError,
    })),
    instagramUserId: user.id,
    dataQuality: {
      complete: !result.truncated && insightErrors === 0,
      listComplete: !result.truncated,
      pageCount: result.pageCount,
      insightErrors,
      delayedUpToHours: 48,
    },
  };
}

export async function fetchContentDashboard(env) {
  const [pageResult, instagramResult] = await Promise.all([
    fetchPageVideos(env),
    fetchInstagramMedia(env),
  ]);

  const configured = Boolean(
    env.META_CONTENT_PAGE_ID ||
      env.META_CONTENT_PAGE_ACCESS_TOKEN ||
      env.META_CONTENT_USER_ACCESS_TOKEN ||
      env.META_CONTENT_IG_USER_ID,
  );

  return {
    ok: pageResult.ok || instagramResult.ok,
    configured,
    error: [pageResult.error, instagramResult.error].filter(Boolean).join("；") || null,
    page: pageResult,
    instagram: instagramResult,
    dataQuality: {
      complete: pageResult.dataQuality.complete && instagramResult.dataQuality.complete,
      partial: pageResult.ok !== instagramResult.ok,
      instagramInsightsDelayHours: 48,
    },
  };
}

export const contentConfig = {
  graphVersion: GRAPH_VERSION,
  maxPageVideos: MAX_PAGE_VIDEOS,
  maxInstagramMedia: MAX_IG_MEDIA,
};
