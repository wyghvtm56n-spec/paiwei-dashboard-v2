import assert from "node:assert/strict";
import test from "node:test";

import { getAuthState, handleLogin, handleMessageLogin } from "../src/auth.js";
import worker from "../src/worker.js";

const env = {
  DASHBOARD_PASSWORD: "test-password",
  COOKIE_SIGNING_KEY: "test-signing-key-with-sufficient-length",
};

test("未設定登入 Secrets 時維持向下相容", async () => {
  const state = await getAuthState(new Request("https://example.com/"), {});
  assert.equal(state.configured, false);
  assert.equal(state.authorized, true);
});

test("正確密碼會簽發安全 Cookie", async () => {
  const body = new URLSearchParams({ password: "test-password" });
  const response = await handleLogin(
    new Request("https://example.com/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }),
    env,
  );

  assert.equal(response.status, 303);
  const cookie = response.headers.get("set-cookie") || "";
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
});

test("訊息中心專用密碼與前後空白相容", async () => {
  const messageEnv = {
    MESSAGE_ADMIN_PASSWORD: "message-password",
    MESSAGE_SESSION_SECRET: "message-session-secret",
  };
  const response = await handleMessageLogin(
    new Request("https://example.com/messages/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ password: "  message-password  " }),
    }),
    messageEnv,
  );
  assert.equal(response.status, 303);
  assert.match(response.headers.get("set-cookie") || "", /martin_message_session=/);
});

test("訊息中心可使用既有主儀表板密碼 fallback", async () => {
  const response = await handleMessageLogin(
    new Request("https://example.com/messages/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ password: "dashboard-password" }),
    }),
    { DASHBOARD_PASSWORD: "dashboard-password", COOKIE_SIGNING_KEY: "dashboard-signing-key" },
  );
  assert.equal(response.status, 303);
});

test("錯誤密碼會被拒絕", async () => {
  const body = new URLSearchParams({ password: "wrong" });
  const response = await handleLogin(
    new Request("https://example.com/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }),
    env,
  );

  assert.equal(response.status, 401);
});

test("健康端點包含安全標頭", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/health"),
    {},
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
});
