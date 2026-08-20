const GRAPH_VERSION = "v26.0";
const GRAPH_HOST = "https://graph.facebook.com";
const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 2_000;
const REQUEST_TIMEOUT_MS = 12_000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function makeId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;
  const random = Math.random().toString(36).slice(2);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function normalizeTimestamp(value) {
  const timestamp = Number(value || 0);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
  return timestamp < 1_000_000_000_000 ? timestamp * 1_000 : timestamp;
}

function asBase64Bytes(value) {
  if (value instanceof Uint8Array) return value;
  const text = String(value || "").trim();
  if (!text) return new Uint8Array();

  const normalized = text.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    if (/^(?:[0-9a-fA-F]{2})+$/.test(text)) {
      return Uint8Array.from(text.match(/.{2}/g).map((pair) => Number.parseInt(pair, 16)));
    }
    throw new Error("訊息投遞資料編碼格式無效");
  }
}

async function digestBytes(algorithm, value) {
  return new Uint8Array(await crypto.subtle.digest(algorithm, value));
}

function hex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stringBytes(value) {
  return encoder.encode(String(value || ""));
}

async function deriveKeyCandidates(secret, keyVersion) {
  const raw = String(secret || "").trim();
  if (!raw) return [];

  const candidates = [];
  const add = (value) => {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    if ([16, 24, 32].includes(bytes.byteLength) && !candidates.some((item) => hex(item) === hex(bytes))) {
      candidates.push(bytes);
    }
  };

  add(stringBytes(raw));
  try {
    add(asBase64Bytes(raw));
  } catch {
    // Try the UTF-8 and SHA-256 derivations below.
  }
  add(await digestBytes("SHA-256", stringBytes(raw)));

  const versioned = `${raw}:${keyVersion || "v1"}`;
  add(await digestBytes("SHA-256", stringBytes(versioned)));
  return candidates;
}

export async function decryptTarget(row, secret) {
  if (!row?.target_ciphertext || !row?.target_iv) {
    throw new Error("找不到訊息投遞目標");
  }

  const ciphertext = asBase64Bytes(row.target_ciphertext);
  const iv = asBase64Bytes(row.target_iv);
  if (iv.byteLength !== 12 && iv.byteLength !== 16) {
    throw new Error("訊息投遞資料 IV 格式無效");
  }

  const candidates = await deriveKeyCandidates(secret, row.key_version);
  for (const keyBytes of candidates) {
    try {
      const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
      const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
      const value = decoder.decode(plaintext).trim();
      if (value && value.length <= 512 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
        return value;
      }
    } catch {
      // Try the next compatible derivation without exposing target data in logs.
    }
  }
  throw new Error("訊息投遞目標解密失敗");
}

async function digestHex(value) {
  return hex(await digestBytes("SHA-256", stringBytes(value)));
}

function jsonBody(request) {
  return request.json().catch(() => null);
}

function replyConfig(env, platform) {
  const pageId = env.META_CONTENT_PAGE_ID || env.meta_page_id || "";
  const accessToken = env.META_ACCESS_TOKEN || env.META_CONTENT_PAGE_ACCESS_TOKEN || "";
  const graphVersion = env.META_CONTENT_GRAPH_VERSION || GRAPH_VERSION;
  if (!pageId || !accessToken) {
    return { ok: false, error: "Meta 回覆尚未完成設定，請確認 Page ID 與 Page Access Token。" };
  }
  if (!platform || !["facebook", "instagram"].includes(platform)) {
    return { ok: false, error: "目前線上回覆只支援 Facebook Messenger 與 Instagram Direct。" };
  }
  return { ok: true, pageId, accessToken, graphVersion };
}

async function fetchConversation(env, conversationKey) {
  const result = await env.DB.prepare(`
    SELECT conversation_key, platform, account_id, external_user_hash, last_inbound_at,
           last_message_at, last_outbound_at
    FROM message_conversations
    WHERE conversation_key = ?
    LIMIT 1
  `).bind(conversationKey).first();
  return result || null;
}

export async function fetchDeliveryTarget(env, conversationKey, platform) {
  return env.DB.prepare(`
    SELECT conversation_key, platform, account_id, target_kind, target_ciphertext,
           target_iv, key_version, last_inbound_at, updated_at
    FROM message_delivery_targets
    WHERE conversation_key = ? AND platform = ?
    ORDER BY updated_at DESC
    LIMIT 1
  `).bind(conversationKey, platform).first();
}

function extractRunMeta(result) {
  return result?.meta || result || {};
}

function changedRows(result) {
  return Number(extractRunMeta(result).changes || 0);
}

async function findManualSend(env, idempotencyKeyHash) {
  return env.DB.prepare(`
    SELECT send_id, status, platform_message_id, http_status, error_code
    FROM message_manual_sends
    WHERE idempotency_key_hash = ?
    LIMIT 1
  `).bind(idempotencyKeyHash).first();
}

async function createManualSend(env, row) {
  const result = await env.DB.prepare(`
    INSERT OR IGNORE INTO message_manual_sends (
      send_id, idempotency_key_hash, conversation_key, platform, message_hash,
      text_hash, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).bind(
    row.sendId,
    row.idempotencyKeyHash,
    row.conversationKey,
    row.platform,
    row.messageHash,
    row.textHash,
    row.now,
    row.now,
  ).run();
  return changedRows(result) > 0;
}

async function updateManualSend(env, sendId, values) {
  await env.DB.prepare(`
    UPDATE message_manual_sends
    SET status = ?, platform_message_id = ?, http_status = ?, error_code = ?, updated_at = ?
    WHERE send_id = ?
  `).bind(
    values.status,
    values.platformMessageId || null,
    values.httpStatus ?? null,
    values.errorCode || null,
    values.now,
    sendId,
  ).run();
}

async function sendMetaMessage(config, platform, target, text) {
  const url = `${GRAPH_HOST}/${config.graphVersion}/${config.pageId}/messages`;
  const body = new URLSearchParams({
    recipient: JSON.stringify({ id: target }),
    message: JSON.stringify({ text }),
    messaging_type: "RESPONSE",
  });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Bearer ${config.accessToken}`,
      },
      body,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    const apiError = payload?.error;
    if (!response.ok || apiError) {
      return {
        ok: false,
        httpStatus: response.status,
        errorCode: apiError?.code ? String(apiError.code) : `HTTP_${response.status}`,
        error: platform === "instagram"
          ? "Instagram Direct 回覆失敗，請檢查 instagram_manage_messages 權限與 24 小時視窗。"
          : "Messenger 回覆失敗，請檢查 pages_messaging 權限與 24 小時視窗。",
      };
    }
    return {
      ok: true,
      httpStatus: response.status,
      platformMessageId: payload?.message_id || null,
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: 0,
      errorCode: error?.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR",
      error: "Meta 回覆服務暫時無法連線，請稍後重試。",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function recordOutboundEvent(env, conversation, text, sendId, now) {
  await env.DB.prepare(`
    INSERT INTO message_events (
      event_id, platform, account_id, conversation_key, external_user_hash,
      direction, event_type, message_type, message_text, intent, sentiment,
      priority, is_meaningful, event_timestamp, received_at, source_type,
      reply_origin
    ) VALUES (?, ?, ?, ?, ?, 'outbound', 'message', 'text', ?, 'other',
              'neutral', 1, 1, ?, ?, 'manual', 'manual')
  `).bind(
    sendId,
    conversation.platform,
    conversation.account_id || null,
    conversation.conversation_key,
    conversation.external_user_hash,
    text,
    now,
    now,
  ).run();

  await env.DB.prepare(`
    UPDATE message_conversations
    SET last_message_at = ?, last_outbound_at = ?, outbound_count = COALESCE(outbound_count, 0) + 1,
        meaningful_reply_count = COALESCE(meaningful_reply_count, 0) + 1,
        last_message_preview = ?, last_direction = 'outbound', updated_at = ?, last_reply_origin = 'manual'
    WHERE conversation_key = ?
  `).bind(
    now,
    now,
    text.slice(0, 240),
    now,
    conversation.conversation_key,
  ).run();
}

function windowError() {
  return {
    ok: false,
    status: 422,
    code: "reply_window_expired",
    error: "此對話最後入站訊息已超過 24 小時，Meta 暫不允許標準回覆。請改從官方平台處理可用的訊息類型。",
  };
}

export async function handleMessageReply(request, env) {
  if (!env.DB) return { ok: false, status: 503, code: "database_missing", error: "D1 binding DB is missing" };

  const body = await jsonBody(request);
  const conversationKey = String(body?.conversation_key || "").trim();
  const text = String(body?.message || "").trim();
  const idempotencyKey = String(body?.idempotency_key || "").trim();
  if (!conversationKey || !text || text.length > MAX_MESSAGE_LENGTH || !idempotencyKey) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      error: `請提供 conversation_key、message 與 idempotency_key；訊息長度需為 1-${MAX_MESSAGE_LENGTH} 字。`,
    };
  }

  const conversation = await fetchConversation(env, conversationKey);
  if (!conversation) return { ok: false, status: 404, code: "conversation_not_found", error: "找不到此對話。" };

  const config = replyConfig(env, conversation.platform);
  if (!config.ok) return { ...config, status: 503, code: "reply_not_configured" };

  const target = await fetchDeliveryTarget(env, conversationKey, conversation.platform);
  if (!target) return { ok: false, status: 409, code: "delivery_target_missing", error: "此對話沒有可用的安全投遞目標，請從官方平台回覆。" };
  if (target.account_id && conversation.account_id && target.account_id !== conversation.account_id) {
    return { ok: false, status: 409, code: "delivery_target_mismatch", error: "訊息投遞目標與對話通道不一致，已停止送出。" };
  }

  const inboundAt = normalizeTimestamp(target.last_inbound_at || conversation.last_inbound_at);
  if (!inboundAt || Date.now() - inboundAt >= REPLY_WINDOW_MS) return windowError();

  const hashSalt = env.MESSAGE_HASH_SALT || env.MESSAGE_DELIVERY_TARGET_SECRET || "";
  if (!hashSalt) return { ok: false, status: 503, code: "hash_secret_missing", error: "訊息安全設定尚未完成，暫時無法回覆。" };

  const idempotencyKeyHash = await digestHex(`${hashSalt}:idempotency:${idempotencyKey}`);
  const existing = await findManualSend(env, idempotencyKeyHash);
  if (existing) {
    if (existing.status === "sent") {
      return { ok: true, status: 200, duplicate: true, send_id: existing.send_id };
    }
    return { ok: false, status: 409, code: "duplicate_send", error: "這筆回覆已在處理或曾經失敗，請重新輸入後再試。" };
  }

  const now = Date.now();
  const sendId = makeId("manual");
  const messageHash = await digestHex(`${hashSalt}:message:${conversationKey}:${text}`);
  const textHash = await digestHex(`${hashSalt}:text:${text}`);
  const inserted = await createManualSend(env, {
    sendId,
    idempotencyKeyHash,
    conversationKey,
    platform: conversation.platform,
    messageHash,
    textHash,
    now,
  });
  if (!inserted) {
    const raced = await findManualSend(env, idempotencyKeyHash);
    if (raced?.status === "sent") return { ok: true, status: 200, duplicate: true, send_id: raced.send_id };
    return { ok: false, status: 409, code: "duplicate_send", error: "這筆回覆已在處理，請稍候查看對話紀錄。" };
  }

  let recipient;
  try {
    recipient = await decryptTarget(target, env.MESSAGE_DELIVERY_TARGET_SECRET);
  } catch (error) {
    await updateManualSend(env, sendId, {
      status: "failed",
      errorCode: "TARGET_DECRYPT_FAILED",
      httpStatus: 0,
      now: Date.now(),
    });
    console.error("Message target decryption failed", errorMessage(error));
    return { ok: false, status: 503, code: "delivery_target_unavailable", error: "安全投遞目標目前無法解密，未送出訊息。" };
  }

  const result = await sendMetaMessage(config, conversation.platform, recipient, text);
  if (!result.ok) {
    await updateManualSend(env, sendId, {
      status: "failed",
      errorCode: result.errorCode,
      httpStatus: result.httpStatus,
      now: Date.now(),
    });
    return { ok: false, status: result.httpStatus >= 500 ? 502 : 422, code: "meta_send_failed", error: result.error };
  }

  const sentAt = Date.now();
  await updateManualSend(env, sendId, {
    status: "sent",
    platformMessageId: result.platformMessageId,
    httpStatus: result.httpStatus,
    now: sentAt,
  });

  try {
    await recordOutboundEvent(env, conversation, text, sendId, sentAt);
  } catch (error) {
    console.error("Outbound message persistence failed", errorMessage(error));
    return {
      ok: true,
      status: 200,
      send_id: sendId,
      persisted: false,
      warning: "訊息已送出，但同步至對話紀錄延遲；重新整理頁面即可查看 Meta 回傳結果。",
    };
  }

  return { ok: true, status: 200, send_id: sendId, persisted: true };
}

export const messageReplyLimits = {
  replyWindowMs: REPLY_WINDOW_MS,
  maxMessageLength: MAX_MESSAGE_LENGTH,
};
