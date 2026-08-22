const COOKIE_NAME = "martin_dashboard_session";
const SESSION_SECONDS = 60 * 60 * 8;
const encoder = new TextEncoder();

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const index = item.indexOf("=");
        return index >= 0
          ? [item.slice(0, index), item.slice(index + 1)]
          : [item, ""];
      }),
  );
}

function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(
    await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
  );
}

function constantTimeEqual(left = "", right = "") {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a[index] ^ b[index];
  }
  return mismatch === 0;
}

function authConfigured(env) {
  return Boolean(env.DASHBOARD_PASSWORD && env.COOKIE_SIGNING_KEY);
}

async function createSession(env) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const signature = await hmacHex(env.COOKIE_SIGNING_KEY, String(expiresAt));
  return `${expiresAt}.${signature}`;
}

async function verifySession(token, env) {
  if (!token || !authConfigured(env)) return false;
  const [expiresAt, signature] = token.split(".");
  if (!expiresAt || !signature || Number(expiresAt) <= Math.floor(Date.now() / 1000)) {
    return false;
  }
  const expected = await hmacHex(env.COOKIE_SIGNING_KEY, expiresAt);
  return constantTimeEqual(signature, expected);
}

export async function getAuthState(request, env) {
  if (!authConfigured(env)) {
    return { configured: false, authorized: true };
  }
  const cookies = parseCookies(request.headers.get("cookie") || "");
  return {
    configured: true,
    authorized: await verifySession(cookies[COOKIE_NAME], env),
  };
}

export function renderLoginPage(error = null) {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Martin Decision Center｜登入</title>
  <style>
    :root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans TC", sans-serif; color: #172033; background: #eef3f8; }
    * { box-sizing: border-box; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 20px; }
    main { width: min(420px,100%); padding: 30px; border: 1px solid #dde5ef; border-radius: 20px; background: #fff; box-shadow: 0 20px 60px rgba(27,45,72,.12); }
    .mark { width: 46px; height: 46px; display: grid; place-items: center; border-radius: 13px; background: #0f3d6e; color: #fff; font-weight: 800; }
    h1 { margin: 20px 0 8px; font-size: 26px; }
    p { margin: 0 0 22px; color: #69778c; line-height: 1.6; }
    label { display: block; margin-bottom: 7px; font-size: 13px; font-weight: 700; }
    input { width: 100%; padding: 13px 14px; border: 1px solid #cfd9e6; border-radius: 11px; font: inherit; }
    input:focus { outline: 3px solid #d9edfb; border-color: #1678aa; }
    button { width: 100%; margin-top: 12px; padding: 13px; border: 0; border-radius: 11px; background: #0f4f7c; color: #fff; font: inherit; font-weight: 800; cursor: pointer; }
    .error { margin-bottom: 15px; padding: 11px; border-radius: 9px; background: #fff2dc; color: #8a4b05; font-size: 13px; }
    small { display: block; margin-top: 16px; color: #8c98a8; line-height: 1.5; }
  </style>
</head>
<body>
  <main>
    <div class="mark">MD</div>
    <h1>登入決策中心</h1>
    <p>此頁包含商業成效與投放資料，請輸入儀表板密碼。</p>
    ${error ? `<div class="error">${String(error).replaceAll("<", "&lt;")}</div>` : ""}
    <form method="post" action="/login">
      <label for="password">儀表板密碼</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
      <button type="submit">登入</button>
    </form>
    <small>登入狀態有效 8 小時。密碼與簽章金鑰只設定在 Cloudflare Secrets，不會寫入 GitHub。</small>
  </main>
</body>
</html>`;
}

export async function handleLogin(request, env) {
  if (!authConfigured(env)) {
    return new Response(null, { status: 303, headers: { location: "/" } });
  }

  const form = await request.formData();
  const password = String(form.get("password") || "");
  if (!constantTimeEqual(password, env.DASHBOARD_PASSWORD)) {
    return new Response(renderLoginPage("密碼不正確，請再試一次。"), {
      status: 401,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const token = await createSession(env);
  return new Response(null, {
    status: 303,
    headers: {
      location: "/",
      "set-cookie": `${COOKIE_NAME}=${token}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

export function handleLogout() {
  return new Response(null, {
    status: 303,
    headers: {
      location: "/login",
      "set-cookie": `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

const MESSAGE_COOKIE_NAME = "martin_message_session";
const MESSAGE_SESSION_SECONDS = 60 * 60 * 8;

function messagePasswords(env) {
  return [env.MESSAGE_ADMIN_PASSWORD, env.DASHBOARD_PASSWORD]
    .flatMap((value) => {
      const raw = String(value ?? "");
      const trimmed = raw.trim();
      return [raw, trimmed];
    })
    .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
}

function messagePassword(env) {
  return messagePasswords(env)[0] || "";
}

function messageSessionSecret(env) {
  return env.MESSAGE_SESSION_SECRET || env.COOKIE_SIGNING_KEY || "";
}

function messageAuthConfigured(env) {
  return Boolean(messagePassword(env) && messageSessionSecret(env));
}

async function createMessageSession(env) {
  const expiresAt = Math.floor(Date.now() / 1000) + MESSAGE_SESSION_SECONDS;
  const signature = await hmacHex(messageSessionSecret(env), String(expiresAt));
  return `${expiresAt}.${signature}`;
}

async function verifyMessageSession(token, env) {
  if (!token || !messageAuthConfigured(env)) return false;
  const [expiresAt, signature] = token.split(".");
  if (!expiresAt || !signature || Number(expiresAt) <= Math.floor(Date.now() / 1000)) return false;
  const expected = await hmacHex(messageSessionSecret(env), expiresAt);
  return constantTimeEqual(signature, expected);
}

export async function getMessageAuthState(request, env) {
  if (!messageAuthConfigured(env)) return { configured: false, authorized: false };
  const cookies = parseCookies(request.headers.get("cookie") || "");
  return {
    configured: true,
    authorized: await verifyMessageSession(cookies[MESSAGE_COOKIE_NAME], env),
  };
}

export function renderMessageLoginPage(error = null) {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>登入訊息中心｜Martin AI</title>
  <style>
    :root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans TC", sans-serif; color: #172033; background: #eef3f8; }
    * { box-sizing: border-box; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 20px; }
    main { width: min(430px,100%); padding: 30px; border: 1px solid #dde5ef; border-radius: 20px; background: #fff; box-shadow: 0 20px 60px rgba(27,45,72,.12); }
    .mark { width: 46px; height: 46px; display: grid; place-items: center; border-radius: 13px; background: #0f3d6e; color: #fff; font-weight: 800; }
    h1 { margin: 20px 0 8px; font-size: 26px; }
    p { margin: 0 0 22px; color: #69778c; line-height: 1.6; }
    label { display: block; margin-bottom: 7px; font-size: 13px; font-weight: 700; }
    input { width: 100%; padding: 13px 14px; border: 1px solid #cfd9e6; border-radius: 11px; font: inherit; }
    button { width: 100%; margin-top: 12px; padding: 13px; border: 0; border-radius: 11px; background: #0f4f7c; color: #fff; font: inherit; font-weight: 800; cursor: pointer; }
    .error { margin-bottom: 15px; padding: 11px; border-radius: 9px; background: #fff2dc; color: #8a4b05; font-size: 13px; }
    small { display: block; margin-top: 16px; color: #8c98a8; line-height: 1.5; }
  </style>
</head>
<body>
  <main>
    <div class="mark">M</div>
    <h1>登入客服營運中心</h1>
    <p>此頁包含 Facebook Messenger、Instagram Direct 與 LINE 的私人訊息資料，請輸入訊息中心管理密碼。</p>
    ${error ? `<div class="error">${String(error).replaceAll("<", "&lt;")}</div>` : ""}
    <form method="post" action="/messages/login">
      <label for="message-password">管理密碼</label>
      <input id="message-password" name="password" type="password" autocomplete="current-password" minlength="8" required autofocus>
      <button type="submit">安全登入</button>
    </form>
    <small>登入工作階段有效 8 小時。密碼與簽章金鑰只設定在 Cloudflare Secrets，不會寫入 GitHub。</small>
  </main>
</body>
</html>`;
}

export function renderMessageConfigurationPage() {
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>訊息中心尚未設定｜Martin AI</title><style>body{min-height:100vh;margin:0;display:grid;place-items:center;padding:20px;background:#eef3f8;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans TC",sans-serif;color:#172033}main{width:min(520px,100%);padding:30px;border:1px solid #dde5ef;border-radius:20px;background:#fff;box-shadow:0 20px 60px rgba(27,45,72,.12)}h1{margin:0 0 10px;font-size:24px}p{color:#69778c;line-height:1.7}code{padding:2px 5px;border-radius:5px;background:#eef3f8;color:#0f4f7c}</style></head><body><main><h1>訊息中心尚未設定管理密碼</h1><p>為保護原始聊天內容、聯絡人資料與客服工作區，系統在 <code>MESSAGE_ADMIN_PASSWORD</code> 與 <code>MESSAGE_SESSION_SECRET</code> 尚未設定時，不會顯示任何訊息資料。</p><p>請由管理員在 Cloudflare Worker production Secrets 完成設定後重新開啟此頁。</p></main></body></html>`;
}

export async function handleMessageLogin(request, env) {
  if (!messageAuthConfigured(env)) return new Response(null, { status: 303, headers: { location: "/messages" } });
  const form = await request.formData();
  const password = String(form.get("password") || "").trim();
  if (!messagePasswords(env).some((candidate) => constantTimeEqual(password, candidate))) {
    return new Response(renderMessageLoginPage("密碼不正確，請確認使用的是訊息中心管理密碼，且沒有複製到前後空白。"), {
      status: 401,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  const token = await createMessageSession(env);
  return new Response(null, {
    status: 303,
    headers: {
      location: "/messages",
      "set-cookie": `${MESSAGE_COOKIE_NAME}=${token}; Path=/messages; Max-Age=${MESSAGE_SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

export function handleMessageLogout() {
  return new Response(null, {
    status: 303,
    headers: {
      location: "/messages",
      "set-cookie": `${MESSAGE_COOKIE_NAME}=; Path=/messages; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

export const authConfig = {
  cookieName: COOKIE_NAME,
  sessionSeconds: SESSION_SECONDS,
};
