import test from "node:test";
import assert from "node:assert/strict";
import { renderMessageCenterSection, renderMessagesPage } from "../src/message-center.js";

const sampleData = {
  line: {
    ok: true,
    messages24h: 7,
    users7d: 5,
  },
};

test("首頁訊息區保留 LINE 統計並提供三平台原始訊息入口", () => {
  const html = renderMessageCenterSection(sampleData);
  assert.match(html, /訊息中心/);
  assert.match(html, /LINE 統計/);
  assert.match(html, /Messenger/);
  assert.match(html, /Instagram DM/);
  assert.match(html, /https:\/\/business\.facebook\.com\/latest\/inbox/);
  assert.match(html, /受保護的 \/messages/);
});

test("獨立訊息頁面渲染原始對話與官方平台入口", () => {
  const html = renderMessagesPage({ ok: true, conversations: [], events: [], summary: { platforms: [] }, fetchedAt: 1700000000000 });
  assert.match(html, /<title>原始訊息中心/);
  assert.match(html, /href="\/"/);
  assert.match(html, /原始對話與個資/);
  assert.match(html, /business\.facebook\.com\/latest\/inbox/);
  assert.match(html, /manager\.line\.biz/);
});

test("資料端點失敗時明確標示 LINE 異常", () => {
  const html = renderMessageCenterSection({ line: { ok: false, error: "D1 unavailable" } });
  assert.match(html, /資料異常/);
  assert.match(html, /N\/A/);
});
