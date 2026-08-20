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


test("首頁 CTA 與對話卡片顯示線上回覆與 24 小時視窗", () => {
  const homeHtml = renderMessageCenterSection(sampleData);
  assert.match(homeHtml, /進入訊息中心/);
  assert.match(homeHtml, /查看對話並線上回覆/);

  const freshConversation = {
    conversation_key: "facebook:fresh",
    platform: "facebook",
    external_user_hash: "hash-only",
    last_inbound_at: Date.now() - 60 * 60 * 1000,
    last_message_at: Date.now(),
    status: "open",
    priority: 2,
  };
  const expiredConversation = {
    conversation_key: "instagram:expired",
    platform: "instagram",
    external_user_hash: "hash-only",
    last_inbound_at: Date.now() - 25 * 60 * 60 * 1000,
    last_message_at: Date.now(),
    status: "open",
    priority: 1,
  };
  const html = renderMessagesPage({
    ok: true,
    conversations: [freshConversation, expiredConversation],
    events: [],
    summary: { platforms: [] },
    fetchedAt: Date.now(),
  });
  assert.match(html, /data-message-reply-form/);
  assert.match(html, /標準回覆視窗剩餘約/);
  assert.match(html, /已超過 24 小時標準回覆視窗/);
});
