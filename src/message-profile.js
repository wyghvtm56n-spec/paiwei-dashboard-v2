import { decryptTarget, fetchDeliveryTarget } from "./message-reply.js";

const GRAPH_VERSION = "v26.0";
const GRAPH_HOST = "https://graph.facebook.com";
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const PROFILE_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
const FAILURE_RETRY_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const PROFILE_FIELDS = "id,name,first_name,last_name,profile_pic";

function safeErrorCode(payload, status) {
  const code = payload?.error?.code;
  if (String(code) === "2018218") return "PROFILE_NOT_AVAILABLE";
  if (String(code) === "190") return "OAUTH_190";
  if (code !== undefined && code !== null && String(code).length <= 40) return `META_${String(code)}`;
  return `HTTP_${Number(status) || 0}`;
}

function safeErrorMessage(payload) {
  const message = String(payload?.error?.message || "");
  if (/expired|invalid oauth|access token/i.test(message)) return "PAGE_TOKEN_EXPIRED";
  if (/permission|business asset user profile|profile access/i.test(message)) return "PROFILE_PERMISSION_REQUIRED";
  return "PROFILE_LOOKUP_FAILED";
}

function normalizeName(profile) {
  const name = String(profile?.name || "").trim();
  if (name) return name.slice(0, 240);
  const first = String(profile?.first_name || "").trim();
  const last = String(profile?.last_name || "").trim();
  const combined = `${first} ${last}`.trim();
  return combined ? combined.slice(0, 240) : null;
}

function nowMs() {
  return Date.now();
}

async function fetchFacebookProfile(token, target) {
  const url = new URL(`${GRAPH_HOST}/${GRAPH_VERSION}/${encodeURIComponent(target)}`);
  url.searchParams.set("fields", PROFILE_FIELDS);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.error) {
      return {
        ok: false,
        status: response.status,
        errorCode: safeErrorCode(payload, response.status),
        reason: safeErrorMessage(payload),
      };
    }
    const displayName = normalizeName(payload);
    if (!displayName) {
      return {
        ok: false,
        status: response.status,
        errorCode: "PROFILE_EMPTY",
        reason: "PROFILE_NOT_AVAILABLE",
      };
    }
    return {
      ok: true,
      status: response.status,
      displayName,
      profileIdPresent: Boolean(payload.id),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      errorCode: error?.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR",
      reason: "PROFILE_LOOKUP_FAILED",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchCandidates(env, limit) {
  return env.DB.prepare(`
    SELECT
      c.conversation_key,
      c.platform,
      c.account_id,
      c.external_user_hash,
      p.display_name,
      p.username,
      p.profile_status,
      p.next_refresh_at
    FROM message_conversations c
    LEFT JOIN message_contact_profiles p
      ON p.conversation_key = c.conversation_key
    WHERE c.platform = 'facebook'
      AND (p.profile_status IS NULL OR p.profile_status <> 'ready' OR p.display_name IS NULL)
    ORDER BY c.updated_at DESC
    LIMIT ?
  `).bind(limit).all();
}

async function upsertProfile(env, conversation, values) {
  const timestamp = nowMs();
  await env.DB.prepare(`
    INSERT INTO message_contact_profiles (
      conversation_key, platform, account_id, external_user_hash,
      display_name, username, profile_source, profile_status,
      fetched_at, next_refresh_at, last_error_code,
      created_at, updated_at, context_name, identity_kind,
      name_confidence, last_verified_at
    ) VALUES (?, 'facebook', ?, ?, ?, ?, 'facebook_user_profile', ?, ?, ?, ?, ?, ?, 'Facebook Messenger', 'person', ?, ?)
    ON CONFLICT(conversation_key) DO UPDATE SET
      account_id = excluded.account_id,
      external_user_hash = excluded.external_user_hash,
      display_name = excluded.display_name,
      username = excluded.username,
      profile_source = excluded.profile_source,
      profile_status = excluded.profile_status,
      fetched_at = excluded.fetched_at,
      next_refresh_at = excluded.next_refresh_at,
      last_error_code = excluded.last_error_code,
      updated_at = excluded.updated_at,
      context_name = excluded.context_name,
      identity_kind = excluded.identity_kind,
      name_confidence = excluded.name_confidence,
      last_verified_at = excluded.last_verified_at
  `).bind(
    conversation.conversation_key,
    conversation.account_id || null,
    conversation.external_user_hash,
    values.displayName || null,
    null,
    values.status,
    timestamp,
    timestamp + (values.status === "ready" ? PROFILE_REFRESH_MS : FAILURE_RETRY_MS),
    values.errorCode || null,
    timestamp,
    timestamp,
    values.status === "ready" ? "high" : "unknown",
    values.status === "ready" ? timestamp : null,
  ).run();
}

async function refreshOne(env, conversation, token) {
  if (conversation.account_id && env.META_CONTENT_PAGE_ID && conversation.account_id !== env.META_CONTENT_PAGE_ID) {
    await upsertProfile(env, conversation, { status: "unavailable", errorCode: "ACCOUNT_MISMATCH" });
    return { status: "unavailable", code: "ACCOUNT_MISMATCH" };
  }

  const target = await fetchDeliveryTarget(env, conversation.conversation_key, "facebook");
  if (!target) {
    await upsertProfile(env, conversation, { status: "unavailable", errorCode: "DELIVERY_TARGET_MISSING" });
    return { status: "unavailable", code: "DELIVERY_TARGET_MISSING" };
  }

  let psid;
  try {
    psid = await decryptTarget(target, env.MESSAGE_DELIVERY_TARGET_SECRET);
  } catch {
    await upsertProfile(env, conversation, { status: "unavailable", errorCode: "TARGET_DECRYPT_FAILED" });
    return { status: "unavailable", code: "TARGET_DECRYPT_FAILED" };
  }

  const result = await fetchFacebookProfile(token, psid);
  if (!result.ok) {
    await upsertProfile(env, conversation, { status: "unavailable", errorCode: result.errorCode });
    return { status: "unavailable", code: result.errorCode, reason: result.reason };
  }

  await upsertProfile(env, conversation, {
    status: "ready",
    displayName: result.displayName,
    errorCode: null,
  });
  return { status: "ready" };
}

function aggregateErrors(results) {
  const counts = new Map();
  for (const result of results) {
    if (result.status !== "ready") counts.set(result.code, (counts.get(result.code) || 0) + 1);
  }
  return [...counts.entries()].map(([code, count]) => ({ code, count }));
}

export async function refreshFacebookProfiles(request, env) {
  if (!env.DB) return { ok: false, status: 503, code: "database_missing", error: "D1 binding DB is missing" };
  const token = String(env.META_CONTENT_PAGE_ACCESS_TOKEN || "").trim();
  if (!token) {
    return {
      ok: false,
      status: 503,
      code: "page_token_missing",
      error: "尚未設定 Facebook Page Token，無法更新聯絡人名稱。",
    };
  }
  if (!env.MESSAGE_DELIVERY_TARGET_SECRET) {
    return {
      ok: false,
      status: 503,
      code: "delivery_secret_missing",
      error: "訊息投遞加密設定尚未完成，無法安全更新聯絡人名稱。",
    };
  }

  const body = await request.json().catch(() => ({}));
  const requestedLimit = Number(body?.limit || DEFAULT_LIMIT);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(requestedLimit))) : DEFAULT_LIMIT;
  const candidateResult = await fetchCandidates(env, limit);
  const candidates = candidateResult?.results || [];
  const results = [];
  const concurrency = 3;

  for (let index = 0; index < candidates.length; index += concurrency) {
    const batch = candidates.slice(index, index + concurrency);
    results.push(...(await Promise.all(batch.map((conversation) => refreshOne(env, conversation, token)))));
  }

  const ready = results.filter((result) => result.status === "ready").length;
  const unavailable = results.length - ready;
  const errors = aggregateErrors(results);
  const tokenIssue = errors.some((item) => ["OAUTH_190", "PAGE_TOKEN_EXPIRED"].includes(item.code));
  const permissionIssue = errors.some((item) => item.code === "META_200" || item.code === "PROFILE_PERMISSION_REQUIRED");

  return {
    ok: true,
    status: 200,
    requested: candidates.length,
    ready,
    unavailable,
    errors,
    guidance: tokenIssue
      ? "Facebook Page Token 已過期或失效，請更新 META_CONTENT_PAGE_ACCESS_TOKEN。"
      : permissionIssue
        ? "請在 Meta App Review／Business Asset User Profile Access 取得進階存取，並確認 Page 的 Info About People 欄位權限。"
        : null,
  };
}

export const messageProfileLimits = { defaultLimit: DEFAULT_LIMIT, maxLimit: MAX_LIMIT };
