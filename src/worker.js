import { fetchLineDashboard } from "./line.js";
import { fetchMetaDaily, fetchMetaAdsByAd  } from "./meta.js";
import { renderDashboard } from "./render.js";

const htmlHeaders = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "content-security-policy":
    "default-src 'none'; " +
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
    "style-src 'unsafe-inline'; " +
    "connect-src 'self'; " +
    "img-src 'self' data:",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/meta/ads") {
      const meta = await fetchMetaDaily(env);

      return Response.json(
        {
          ok: meta.ok,
          period: "last_7d",
          error: meta.error,
          data: meta.daily,
          summary: meta.summary,
        },
        { status: meta.ok ? 200 : 500 },
      );
    }

    if (request.method !== "GET" || url.pathname !== "/") {
      return new Response("Not found", { status: 404 });
    }

    try {
      const [line, meta, ads] = await Promise.all([
        fetchLineDashboard(env),
  fetchMetaDaily(env),
  fetchMetaAdsByAd(env),
      ]);

 return new Response(
  renderDashboard({
    line,
    meta,
    ads,
  }),
  {
    status: 200,
    headers: htmlHeaders,
  },
);
    } catch (error) {
      console.error(error);

      return new Response(
        "讀取 Dashboard 資料失敗，請檢查 D1 Binding 與環境變數。",
        {
          status: 500,
          headers: {
            "content-type": "text/plain; charset=utf-8",
          },
        },
      );
    }
  },
};
