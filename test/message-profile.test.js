import test from "node:test";
import assert from "node:assert/strict";
import { refreshFacebookProfiles } from "../src/message-profile.js";

const SECRET = "profile-secret";
const PAGE_ID = "107391404964329";

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

function createDb(conversation, target) {
  const state = { upserts: [] };
  return {
    state,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async all() {
              if (sql.includes("FROM message_conversations")) return { results: [conversation] };
              return { results: [] };
            },
            async first() {
              if (sql.includes("FROM message_delivery_targets")) return target;
              return null;
            },
            async run() {
              if (sql.includes("INSERT INTO message_contact_profiles")) state.upserts.push(args);
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

function request(body = { limit: 1 }) {
  return new Request("https://dashboard.example/messages/profile-refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const conversation = {
  conversation_key: "facebook:conversation-1",
  platform: "facebook",
  account_id: PAGE_ID,
  external_user_hash: "hash-only",
  display_name: null,
  username: null,
  profile_status: "unavailable",
};

test("profile refresh 解密 Facebook target、呼叫 User Profile API 並寫回名稱", async () => {
  const target = await encryptTarget("psid-not-exposed");
  const db = createDb(conversation, { ...target, conversation_key: conversation.conversation_key, platform: "facebook", account_id: PAGE_ID });
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let authorization = "";
  globalThis.fetch = async (input, options) => {
    requestUrl = String(input);
    authorization = options?.headers?.authorization || "";
    return Response.json({ id: "returned-id", name: "測試聯絡人" }, { status: 200 });
  };

  try {
    const result = await refreshFacebookProfiles(request({ limit: 1 }), {
      DB: db,
      META_CONTENT_PAGE_ID: PAGE_ID,
      META_CONTENT_PAGE_ACCESS_TOKEN: "page-token-not-logged",
      MESSAGE_DELIVERY_TARGET_SECRET: SECRET,
    });
    assert.equal(result.ok, true);
    assert.equal(result.requested, 1);
    assert.equal(result.ready, 1);
    assert.equal(result.unavailable, 0);
    assert.equal(db.state.upserts.length, 1);
    assert.match(requestUrl, /graph\.facebook\.com\/v26\.0\//);
    assert.match(requestUrl, /fields=id%2Cname%2Cfirst_name%2Clast_name%2Cprofile_pic/);
    assert.equal(authorization, "Bearer page-token-not-logged");
    assert.equal(db.state.upserts[0][3], "測試聯絡人");
    assert.doesNotMatch(JSON.stringify(result), /psid-not-exposed/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("profile refresh 對 Meta OAuth 190 只回傳安全 guidance，不洩露原始錯誤或 target", async () => {
  const target = await encryptTarget("psid-not-exposed");
  const db = createDb(conversation, { ...target, conversation_key: conversation.conversation_key, platform: "facebook", account_id: PAGE_ID });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: { code: 190, message: "Session has expired; secret-value-not-for-output" } }, { status: 400 });

  try {
    const result = await refreshFacebookProfiles(request({ limit: 1 }), {
      DB: db,
      META_CONTENT_PAGE_ID: PAGE_ID,
      META_CONTENT_PAGE_ACCESS_TOKEN: "expired-token",
      MESSAGE_DELIVERY_TARGET_SECRET: SECRET,
    });
    assert.equal(result.ok, true);
    assert.equal(result.ready, 0);
    assert.equal(result.unavailable, 1);
    assert.match(result.guidance, /Page Token 已過期/);
    assert.doesNotMatch(JSON.stringify(result), /secret-value-not-for-output|psid-not-exposed/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
