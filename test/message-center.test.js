import test from "node:test";
import assert from "node:assert/strict";
import { renderMessageCenterSection, renderMessagesPage } from "../src/message-center.js";

const sampleData = {
  line: {
    ok: true,
    messages24h: 7,
    users7d: 5,
    images7d: 2,
    postbacks7d: 3,
    daily: [{ day: "2026-08-19", messages: 7, users: 5 }],
    categories: { price: 4, booking: 3, odor: 2, location: 1 },
  },
};

test("訊息中心保留 LINE 統計並提供官方收件匣入口", () => {
  const html = renderMessageCenterSection(sampleData);
  assert.match(html, /訊息中心/);
  assert.match(html, /近 24 小時訊息/);
  assert.match(html, /近 14 天訊息趨勢/);
  assert.match(html, /https:\/\/business\.facebook\.com\/latest\/inbox/);
  assert.match(html, /不顯示姓名、電話、原始聊天內容/);
});

test("獨立訊息頁面可回到主儀表板且不渲染原始聊天內容", () => {
  const html = renderMessagesPage(sampleData);
  assert.match(html, /<title>訊息中心/);
  assert.match(html, /href="\/"/);
  assert.match(html, /LINE 詢問/);
  assert.doesNotMatch(html, /message_text/);
});

test("資料端點失敗時明確標示 LINE 異常", () => {
  const html = renderMessageCenterSection({ line: { ok: false, error: "D1 unavailable" } });
  assert.match(html, /資料異常/);
  assert.match(html, /D1 unavailable/);
});
