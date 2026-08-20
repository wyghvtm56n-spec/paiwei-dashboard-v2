import test from "node:test";
import assert from "node:assert/strict";
import { fetchMessageCenterData } from "../src/message-data.js";
import { renderMessagesPage } from "../src/message-center.js";
import { renderMessageConfigurationPage } from "../src/auth.js";

function makeDb() {
  const rows = {
    conversations: [
      {
        conversation_key: "facebook:one",
        platform: "facebook",
        display_name: "陳先生",
        username: "customer_one",
        external_user_hash: "hash-not-rendered",
        inbound_count: 2,
        outbound_count: 1,
        meaningful_reply_count: 1,
        priority: 3,
        status: "open",
        last_message_at: 1700000000000,
        updated_at: 1700000000000,
        customer_name: "陳先生",
        vehicle_model: "Toyota",
        service_need: "內裝清潔",
        deal_stage: "qualified",
      },
    ],
    events: [
      {
        event_id: "event-1",
        platform: "facebook",
        conversation_key: "facebook:one",
        direction: "inbound",
        message_type: "text",
        message_text: "請問內裝清潔多少錢？",
        event_timestamp: 1699999990000,
        intent: "price",
      },
    ],
    platforms: [{ platform: "facebook", conversations: 1, events: 1, inbound: 1, outbound: 0, latest_event: 1699999990000 }],
  };
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            sql,
            async first() { return null; },
          };
        },
        sql,
      };
    },
    async batch(statements) {
      return statements.map((statement, index) => ({ results: index === 0 ? rows.conversations : index === 1 ? rows.events : rows.platforms }));
    },
  };
}

test("message data returns raw event and customer fields without exposing user hash in render", async () => {
  const data = await fetchMessageCenterData({ DB: makeDb() }, { conversationLimit: 10, eventLimit: 50 });
  assert.equal(data.ok, true);
  assert.equal(data.conversations[0].platform, "facebook");
  assert.equal(data.events[0].message_text, "請問內裝清潔多少錢？");
  const html = renderMessagesPage(data);
  assert.match(html, /原始對話與個資/);
  assert.match(html, /請問內裝清潔多少錢/);
  assert.match(html, /陳先生/);
  assert.doesNotMatch(html, /hash-not-rendered/);
});

test("message data fails closed when D1 binding is missing", async () => {
  const data = await fetchMessageCenterData({});
  assert.equal(data.ok, false);
  assert.match(data.error, /D1 binding/);
});

test("message route configuration page fails closed without secrets", () => {
  const html = renderMessageConfigurationPage();
  assert.match(html, /尚未設定管理密碼/);
  assert.match(html, /MESSAGE_ADMIN_PASSWORD/);
  assert.match(html, /MESSAGE_SESSION_SECRET/);
  assert.doesNotMatch(html, /message_text/);
});

test("message page preserves official console links and private route boundary", () => {
  const html = renderMessagesPage({ ok: true, conversations: [], events: [], summary: { platforms: [] }, fetchedAt: 1700000000000 });
  assert.match(html, /business\.facebook\.com\/latest\/inbox/);
  assert.match(html, /manager\.line\.biz/);
  assert.match(html, /原始聊天內容/);
  assert.match(html, /管理密碼/);
});
