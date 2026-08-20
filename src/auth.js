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

export const authConfig = {
  cookieName: COOKIE_NAME,
  sessionSeconds: SESSION_SECONDS,
};
