import assert from "node:assert/strict";
import test from "node:test";

import { fetchContentDashboard } from "../src/content.js";

test("未設定內容 Token 時不會誤呼叫 Meta", async () => {
  const result = await fetchContentDashboard({});
  assert.equal(result.ok, false);
  assert.equal(result.configured, false);
  assert.match(result.error, /META_CONTENT/);
});

test("可正規化粉專影片與 Instagram Reels Insights", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const path = url.pathname;

    if (path.endsWith("/page-123/videos")) {
      return Response.json({
        data: [
          {
            id: "video-1",
            description: "粉專測試影片",
            updated_time: "2026-08-19T00:00:00+0000",
            permalink_url: "https://facebook.com/video-1",
          },
        ],
      });
    }

    if (path.endsWith("/video-1/video_insights")) {
      return Response.json({
        data: [
          {
            name: "total_video_views",
            period: "lifetime",
            values: [{ value: 100 }],
          },
          {
            name: "total_video_views_unique",
            period: "lifetime",
            values: [{ value: 75 }],
          },
        ],
      });
    }

    if (path.endsWith("/page-123")) {
      return Response.json({ instagram_business_account: { id: "ig-123" } });
    }

    if (path.endsWith("/ig-123/media")) {
      return Response.json({
        data: [
          {
            id: "media-1",
            caption: "Reels 測試內容",
            media_type: "VIDEO",
            media_product_type: "REELS",
            permalink: "https://instagram.com/reel/media-1",
            timestamp: "2026-08-18T00:00:00+0000",
          },
        ],
      });
    }

    if (path.endsWith("/media-1/insights")) {
      if (url.searchParams.get("metric")?.includes("ig_reels_avg_watch_time")) {
        return Response.json({
          data: [
            { name: "ig_reels_avg_watch_time", values: [{ value: 12.5 }] },
            { name: "reels_skip_rate", values: [{ value: 0.2 }] },
          ],
        });
      }
      return Response.json({
        data: [
          { name: "views", values: [{ value: 500 }] },
          { name: "reach", values: [{ value: 420 }] },
          { name: "likes", values: [{ value: 31 }] },
          { name: "comments", values: [{ value: 4 }] },
          { name: "shares", values: [{ value: 6 }] },
        ],
      });
    }

    return Response.json({ error: { message: `unexpected ${path}` } }, { status: 404 });
  };

  try {
    const result = await fetchContentDashboard({
      META_CONTENT_PAGE_ID: "page-123",
      META_CONTENT_PAGE_ACCESS_TOKEN: "page-token",
      META_CONTENT_USER_ACCESS_TOKEN: "user-token",
    });

    assert.equal(result.ok, true);
    assert.equal(result.page.data[0].insights.total_video_views.value, 100);
    assert.equal(result.instagram.data[0].insights.views.value, 500);
    assert.equal(result.instagram.data[0].insights.ig_reels_avg_watch_time.value, 12.5);
    assert.equal(result.instagram.data[0].insights.reels_skip_rate.value, 0.2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Insights 權限不足時保留粉專影片清單與可見欄位", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const path = url.pathname;

    if (path.endsWith("/page-456/videos")) {
      return Response.json({
        data: [
          {
            id: "video-2",
            description: "沒有完整洞察的粉專影片",
            views: 321,
            likes: { summary: { total_count: 12 } },
            comments: { summary: { total_count: 3 } },
            shares: { count: 4 },
          },
        ],
      });
    }

    if (path.endsWith("/video-2/video_insights")) {
      return Response.json(
        { error: { message: "read_insights permission missing" } },
        { status: 403 },
      );
    }

    return Response.json({ error: { message: `unexpected ${path}` } }, { status: 404 });
  };

  try {
    const result = await fetchContentDashboard({
      META_CONTENT_PAGE_ID: "page-456",
      META_CONTENT_PAGE_ACCESS_TOKEN: "page-token",
    });

    assert.equal(result.page.ok, true);
    assert.equal(result.page.dataQuality.listMetricsAvailable, true);
    assert.equal(result.page.data[0].publicMetrics.views, 321);
    assert.equal(result.page.data[0].publicMetrics.likes, 12);
    assert.match(result.page.data[0].insightsError, /尚未提供完整影片洞察權限/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
