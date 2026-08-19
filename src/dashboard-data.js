import { buildDecisionSnapshot } from "./decision.js";
import { fetchContentDashboard } from "./content.js";
import { fetchLineDashboard } from "./line.js";
import {
  fetchMetaAdsByAd,
  fetchMetaBreakdowns,
  fetchMetaDaily,
} from "./meta.js";

const CACHE_SECONDS = 300;
const CACHE_KEY = "https://dashboard-cache.internal/v2/dashboard-data";

function emptyLine(error = null) {
  return {
    ok: false,
    error,
    messages24h: 0,
    messages7d: 0,
    users7d: 0,
    follow30d: 0,
    unfollow30d: 0,
    images7d: 0,
    postbacks7d: 0,
    daily: [],
    categories: {},
  };
}

async function loadFresh(env) {
  const [lineResult, metaResult, adsResult, breakdownResult, contentResult] =
    await Promise.allSettled([
      fetchLineDashboard(env),
      fetchMetaDaily(env),
      fetchMetaAdsByAd(env),
      fetchMetaBreakdowns(env),
      fetchContentDashboard(env),
    ]);

  const line =
    lineResult.status === "fulfilled"
      ? { ok: true, error: null, ...lineResult.value }
      : emptyLine(
          lineResult.reason instanceof Error
            ? lineResult.reason.message
            : String(lineResult.reason || "LINE data failed"),
        );

  const meta =
    metaResult.status === "fulfilled"
      ? metaResult.value
      : {
          ok: false,
          error: String(metaResult.reason || "Meta summary failed"),
          daily: [],
          summary: {},
          dataQuality: {},
        };

  const ads =
    adsResult.status === "fulfilled"
      ? adsResult.value
      : {
          ok: false,
          error: String(adsResult.reason || "Meta ads failed"),
          data: [],
          dataQuality: {},
        };

  const breakdowns =
    breakdownResult.status === "fulfilled"
      ? breakdownResult.value
      : {
          period: "last_7d",
          regions: { ok: false, error: String(breakdownResult.reason || "Region data failed"), data: [] },
          demographics: { ok: false, error: String(breakdownResult.reason || "Demographic data failed"), data: [] },
          placements: { ok: false, error: String(breakdownResult.reason || "Placement data failed"), data: [] },
        };

  const content =
    contentResult.status === "fulfilled"
      ? contentResult.value
      : {
          ok: false,
          configured: false,
          error: String(contentResult.reason || "Content data failed"),
          page: { ok: false, error: "Content data failed", data: [], dataQuality: {} },
          instagram: { ok: false, error: "Content data failed", data: [], dataQuality: {} },
          dataQuality: { complete: false, partial: false },
        };

  const data = {
    line,
    meta,
    ads,
    breakdowns,
    content,
    generatedAt: new Date().toISOString(),
  };

  return { ...data, decision: buildDecisionSnapshot(data) };
}

function cacheAvailable() {
  return typeof caches !== "undefined" && caches.default;
}

export async function fetchDashboardData(env, options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);

  if (!forceRefresh && cacheAvailable()) {
    const cached = await caches.default.match(CACHE_KEY);
    if (cached) {
      return { data: await cached.json(), cacheStatus: "hit" };
    }
  }

  const data = await loadFresh(env);

  if (cacheAvailable()) {
    const response = Response.json(data, {
      headers: { "cache-control": `public, max-age=${CACHE_SECONDS}` },
    });
    await caches.default.put(CACHE_KEY, response);
  }

  return { data, cacheStatus: forceRefresh ? "refresh" : "miss" };
}

export const dashboardCacheConfig = {
  seconds: CACHE_SECONDS,
  key: CACHE_KEY,
};
