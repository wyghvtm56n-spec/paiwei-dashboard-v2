import {
  getAuthState,
  handleLogin,
  handleLogout,
  renderLoginPage,
} from "./auth.js";
import { fetchDashboardData } from "./dashboard-data.js";
import { renderDashboard } from "./render.js";

const securityHeaders = {
  "content-security-policy":
    "default-src 'none'; " +
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
    "style-src 'unsafe-inline'; " +
    "connect-src 'self'; " +
    "img-src 'self' data:; " +
    "font-src 'self'; " +
    "base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

function htmlResponse(html, status = 200, extraHeaders = {}) {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      ...securityHeaders,
      ...extraHeaders,
    },
  });
}

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "private, max-age=60",
      ...securityHeaders,
      ...extraHeaders,
    },
  });
}

function redirect(location) {
  return new Response(null, { status: 303, headers: { location } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse({ ok: true, service: "martin-decision-center", version: "2.0.0" });
    }

    if (request.method === "GET" && url.pathname === "/login") {
      const auth = await getAuthState(request, env);
      if (auth.configured && auth.authorized) return redirect("/");
      return htmlResponse(renderLoginPage());
    }

    if (request.method === "POST" && url.pathname === "/login") {
      const response = await handleLogin(request, env);
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(securityHeaders)) {
        headers.set(key, value);
      }
      headers.set("cache-control", "no-store");
      return new Response(response.body, { status: response.status, headers });
    }

    if (request.method === "GET" && url.pathname === "/logout") {
      return handleLogout();
    }

    const auth = await getAuthState(request, env);
    if (!auth.authorized) return redirect("/login");

    if (request.method !== "GET") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { allow: "GET", ...securityHeaders },
      });
    }

    try {
      const forceRefresh =
        url.pathname === "/api/dashboard" && url.searchParams.get("refresh") === "1";
      const { data, cacheStatus } = await fetchDashboardData(env, { forceRefresh });
      const cacheHeader = { "x-dashboard-cache": cacheStatus };

      if (url.pathname === "/api/dashboard") {
        return jsonResponse({ ok: true, data }, 200, cacheHeader);
      }

      if (url.pathname === "/meta/ads") {
        return jsonResponse(
          {
            ok: data.meta.ok,
            period: data.meta.period,
            error: data.meta.error,
            data: data.meta.daily,
            summary: data.meta.summary,
            dataQuality: data.meta.dataQuality,
          },
          data.meta.ok ? 200 : 503,
          cacheHeader,
        );
      }

      if (url.pathname === "/meta/breakdowns") {
        const ok =
          data.breakdowns.regions?.ok ||
          data.breakdowns.demographics?.ok ||
          data.breakdowns.placements?.ok;
        return jsonResponse(
          { ok, ...data.breakdowns },
          ok ? 200 : 503,
          cacheHeader,
        );
      }

      if (url.pathname !== "/") {
        return new Response("Not found", { status: 404, headers: securityHeaders });
      }

      return htmlResponse(renderDashboard(data), 200, cacheHeader);
    } catch (error) {
      console.error("Dashboard request failed", error);
      const message =
        error instanceof Error ? error.message : "Unknown dashboard error";

      if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/meta/")) {
        return jsonResponse({ ok: false, error: message }, 500);
      }

      return htmlResponse(
        "讀取 Dashboard 資料失敗。請稍後再試，並檢查 D1 Binding、Meta 設定與 Worker Logs。",
        500,
      );
    }
  },
};
