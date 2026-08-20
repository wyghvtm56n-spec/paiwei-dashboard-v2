import {
  getAuthState,
  handleLogin,
  handleLogout,
  renderLoginPage,
  getMessageAuthState,
  handleMessageLogin,
  handleMessageLogout,
  renderMessageLoginPage,
  renderMessageConfigurationPage,
} from "./auth.js";
import { fetchDashboardData } from "./dashboard-data.js";
import { renderDashboard } from "./render.js";
import { renderMessagesPage } from "./message-center.js";
import { fetchMessageCenterData } from "./message-data.js";
import { handleMessageReply } from "./message-reply.js";
import { refreshFacebookProfiles } from "./message-profile.js";

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
      return jsonResponse({ ok: true, service: "martin-decision-center", version: "2.6.0" });
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

    if (request.method === "POST" && url.pathname === "/messages/login") {
      const response = await handleMessageLogin(request, env);
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(securityHeaders)) headers.set(key, value);
      headers.set("cache-control", "no-store");
      return new Response(response.body, { status: response.status, headers });
    }

    if (request.method === "GET" && url.pathname === "/messages/logout") {
      const response = handleMessageLogout();
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(securityHeaders)) headers.set(key, value);
      headers.set("cache-control", "no-store");
      return new Response(response.body, { status: response.status, headers });
    }

    if (request.method === "POST" && (url.pathname === "/messages/profile-refresh" || url.pathname === "/api/messages/profile-refresh")) {
      const messageAuth = await getMessageAuthState(request, env);
      if (!messageAuth.configured) {
        return jsonResponse({ ok: false, code: "message_auth_not_configured", error: "訊息中心尚未完成安全設定。" }, 503, { "cache-control": "no-store" });
      }
      if (!messageAuth.authorized) {
        return jsonResponse({ ok: false, code: "message_auth_required", error: "請先登入訊息中心。" }, 401, { "cache-control": "no-store" });
      }
      try {
        const result = await refreshFacebookProfiles(request, env);
        const { status = result.ok ? 200 : 500, ...payload } = result;
        return jsonResponse(payload, status, { "cache-control": "no-store" });
      } catch (error) {
        console.error("Facebook profile refresh failed", error instanceof Error ? error.message : String(error));
        return jsonResponse({ ok: false, code: "profile_refresh_failed", error: "Facebook 聯絡人同步暫時無法完成。" }, 500, { "cache-control": "no-store" });
      }
    }

    if (request.method === "POST" && (url.pathname === "/messages/reply" || url.pathname === "/api/messages/reply")) {
      const messageAuth = await getMessageAuthState(request, env);
      if (!messageAuth.configured) {
        return jsonResponse({ ok: false, code: "message_auth_not_configured", error: "訊息中心尚未完成安全設定。" }, 503, { "cache-control": "no-store" });
      }
      if (!messageAuth.authorized) {
        return jsonResponse({ ok: false, code: "message_auth_required", error: "請先登入訊息中心。" }, 401, { "cache-control": "no-store" });
      }
      try {
        const result = await handleMessageReply(request, env);
        const { status = result.ok ? 200 : 500, ...payload } = result;
        return jsonResponse(payload, status, { "cache-control": "no-store" });
      } catch (error) {
        console.error("Message reply request failed", error instanceof Error ? error.message : String(error));
        return jsonResponse({ ok: false, code: "reply_failed", error: "回覆服務暫時無法完成，訊息未確認送出。" }, 500, { "cache-control": "no-store" });
      }
    }

    if (request.method === "GET" && (url.pathname === "/messages" || url.pathname === "/api/messages")) {
      const messageAuth = await getMessageAuthState(request, env);
      if (!messageAuth.configured) {
        return htmlResponse(renderMessageConfigurationPage(), 503);
      }
      if (!messageAuth.authorized) {
        return htmlResponse(renderMessageLoginPage(), 401);
      }
      const messageData = await fetchMessageCenterData(env, {
        conversationLimit: url.searchParams.get("limit"),
        eventLimit: url.searchParams.get("event_limit"),
      });
      if (url.pathname === "/api/messages") {
        return jsonResponse(messageData, messageData.ok ? 200 : 503);
      }
      return htmlResponse(renderMessagesPage(messageData), messageData.ok ? 200 : 503);
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

      if (url.pathname === "/content/videos") {
        return jsonResponse(
          { ok: data.content.ok, ...data.content },
          data.content.ok ? 200 : 503,
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
