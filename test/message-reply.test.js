import test from "node:test";
import assert from "node:assert/strict";
import { handleMessageReply } from "../src/message-reply.js";

const SECRET = "test-message-delivery-secret";
const CONVERSATION_KEY = "facebook:test-conversation";

function base64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

async function encryptTarget(value) {
  const keyBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(SECRET)));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return { target_ciphertext: base64(new Uint8Array(ciphertext)), target_iv: base64(iv), key_version: "v1" };
}

function createDb({ conversation, target, manual = null }) {
  const state = { manual, outboundEvents: 0, sentConversationUpdates: 0 };
  return {
    state,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes("FROM message_conversations")) return conversation;
              if (sql.includes("FROM message_delivery_targets")) return target;
              if (sql.includes("FROM message_manual_sends")) return state.manual;
              return null;
            },
            async run() {
              if (sql.includes("INSERT OR IGNORE INTO message_manual_sends")) {
                if (state.manual) return { meta: { changes: 0 } };
                state.manual = {
                  send_id: args[0],
                  status: "pending",
                  platform_message_id: null,
                  http_status: null,
                  error_code: null,
                };
                return { meta: { changes: 1 } };
              }
              if (sql.includes("UPDATE message_manual_sends")) {
                state.manual.status = args[0];
                state.manual.platform_message_id = args[1];
                state.manual.http_status = args[2];
                state.manual.error_code = args[3];
                return { meta: { changes: 1 } };
              }
              if (sql.includes("INSERT INTO message_events")) {
                state.outboundEvents += 1;
                return { meta: { changes: 1 } };
              }
              if (sql.includes("UPDATE message_conversations")) {
                state.sentConversationUpdates += 1;
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 0 } };
            },
          };
        },
      };
    },
  };
}

function request(body) {
  return new Request("https://dashboard.example/messages/reply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function environment(db) {
  return {
    DB: db,
    MESSAGE_DELIVERY_TARGET_SECRET: SECRET,
    MESSAGE_HASH_SALT: "test-hash-salt",
    META_CONTENT_PAGE_ID: "107391404964329",
    META_ACCESS_TOKEN: "test-token",
    META_CONTENT_GRAPH_VERSION: "v26.0",
  };
}

test("回覆服務能解密 target、送出 Meta 訊息並寫回 outbound event", async () => {
  const target = await encryptTarget("recipient-123");
  const lastInboundAt = Date.now() - 60 * 60 * 1000;
  const conversation = {
    conversation_key: CONVERSATION_KEY,
    platform: "facebook",
    account_id: "107391404964329",
    external_user_hash: "hash-only",
    last_inbound_at: lastInboundAt,
  };
  const db = createDb({ conversation, target: { ...target, conversation_key: CONVERSATION_KEY, platform: "facebook", account_id: "107391404964329", last_inbound_at: lastInboundAt } });
  const originalFetch = globalThis.fetch;
  let sentBody = null;
  globalThis.fetch = async (url, options) => {
    sentBody = { url, options };
    return new Response(JSON.stringify({ recipient_id: "recipient-123", message_id: "mid-123" }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const result = await handleMessageReply(request({ conversation_key: CONVERSATION_KEY, message: "您好，請問需要哪一項服務？", idempotency_key: "once-1" }), environment(db));
    assert.equal(result.ok, true);
    assert.equal(result.persisted, true);
    assert.equal(db.state.outboundEvents, 1);
    assert.equal(db.state.sentConversationUpdates, 1);
    assert.equal(new URL(sentBody.url).pathname, "/v26.0/107391404964329/messages");
    const form = new URLSearchParams(sentBody.options.body);
    assert.equal(JSON.parse(form.get("recipient")).id, "recipient-123");
    assert.equal(JSON.parse(form.get("message")).text, "您好，請問需要哪一項服務？");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("相同 idempotency key 不會第二次呼叫 Meta", async () => {
  const target = await encryptTarget("recipient-123");
  const lastInboundAt = Date.now() - 30 * 60 * 1000;
  const conversation = { conversation_key: CONVERSATION_KEY, platform: "facebook", account_id: "107391404964329", external_user_hash: "hash-only", last_inbound_at: lastInboundAt };
  const db = createDb({ conversation, target: { ...target, conversation_key: CONVERSATION_KEY, platform: "facebook", account_id: "107391404964329", last_inbound_at: lastInboundAt } });
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ message_id: "mid-duplicate" }), { status: 200 });
  };

  try {
    const body = { conversation_key: CONVERSATION_KEY, message: "重複測試", idempotency_key: "same-key" };
    const first = await handleMessageReply(request(body), environment(db));
    const second = await handleMessageReply(request(body), environment(db));
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(second.duplicate, true);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("超過 24 小時的對話在解密與送出前被封鎖", async () => {
  const oldInboundAt = Date.now() - 25 * 60 * 60 * 1000;
  const conversation = { conversation_key: CONVERSATION_KEY, platform: "facebook", account_id: "107391404964329", external_user_hash: "hash-only", last_inbound_at: oldInboundAt };
  const db = createDb({ conversation, target: { conversation_key: CONVERSATION_KEY, platform: "facebook", account_id: "107391404964329", last_inbound_at: oldInboundAt, target_ciphertext: "not-used", target_iv: "not-used", key_version: "v1" } });
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("should not send");
  };

  try {
    const result = await handleMessageReply(request({ conversation_key: CONVERSATION_KEY, message: "逾時測試", idempotency_key: "expired-1" }), environment(db));
    assert.equal(result.ok, false);
    assert.equal(result.code, "reply_window_expired");
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
