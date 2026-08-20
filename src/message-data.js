const DEFAULT_CONVERSATION_LIMIT = 50;
const DEFAULT_EVENT_LIMIT = 1200;

function safeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function emptyMessageData(error = null) {
  return {
    ok: !error,
    error,
    conversations: [],
    events: [],
    summary: { platforms: [], totalConversations: 0, totalEvents: 0 },
    fetchedAt: Date.now(),
  };
}

export async function fetchMessageCenterData(env, options = {}) {
  if (!env.DB) return emptyMessageData("D1 binding DB is missing");

  const conversationLimit = Math.min(
    Math.max(Number(options.conversationLimit || DEFAULT_CONVERSATION_LIMIT), 1),
    100,
  );
  const eventLimit = Math.min(
    Math.max(Number(options.eventLimit || DEFAULT_EVENT_LIMIT), 50),
    2000,
  );

  try {
    const results = await env.DB.batch([
      env.DB.prepare(`
        SELECT
          c.conversation_key,
          c.platform,
          c.account_id,
          c.external_user_hash,
          c.first_message_at,
          c.last_message_at,
          c.last_inbound_at,
          c.last_outbound_at,
          c.inbound_count,
          c.outbound_count,
          c.meaningful_reply_count,
          c.first_response_ms,
          c.status,
          c.latest_intent,
          c.latest_sentiment,
          c.priority,
          c.last_message_preview,
          c.last_direction,
          c.follow_up_at,
          c.review_reason,
          c.updated_at,
          p.display_name,
          p.username,
          p.context_name,
          p.identity_kind,
          p.name_confidence,
          p.last_verified_at,
          w.customer_name,
          w.vehicle_model,
          w.vehicle_year,
          w.service_need,
          w.issue_summary,
          w.quoted_price,
          w.preferred_time,
          w.branch_preference,
          w.deal_stage,
          w.loss_reason,
          w.follow_up_note,
          w.internal_note
        FROM message_conversations c
        LEFT JOIN message_contact_profiles p
          ON p.conversation_key = c.conversation_key
        LEFT JOIN message_customer_workspaces w
          ON w.conversation_key = c.conversation_key
        ORDER BY c.updated_at DESC
        LIMIT ?
      `).bind(conversationLimit),
      env.DB.prepare(`
        SELECT
          event_id,
          platform,
          account_id,
          conversation_key,
          external_user_hash,
          direction,
          event_type,
          message_type,
          message_text,
          intent,
          sentiment,
          priority,
          is_meaningful,
          response_ms,
          event_timestamp,
          received_at,
          source_type,
          campaign_id,
          ad_id,
          media_id,
          referral_url,
          reply_origin
        FROM message_events
        ORDER BY event_timestamp DESC
        LIMIT ?
      `).bind(eventLimit),
      env.DB.prepare(`
        SELECT
          platform,
          COUNT(*) AS events,
          COUNT(DISTINCT conversation_key) AS conversations,
          SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) AS inbound,
          SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END) AS outbound,
          MAX(event_timestamp) AS latest_event
        FROM message_events
        GROUP BY platform
        ORDER BY platform
      `),
    ]);

    const conversations = results[0]?.results || [];
    const selectedKeys = new Set(conversations.map((row) => row.conversation_key));
    const events = (results[1]?.results || [])
      .filter((row) => selectedKeys.has(row.conversation_key))
      .sort((a, b) => Number(a.event_timestamp || 0) - Number(b.event_timestamp || 0));
    const platforms = results[2]?.results || [];

    return {
      ok: true,
      error: null,
      conversations,
      events,
      summary: {
        platforms,
        totalConversations: conversations.length,
        totalEvents: events.length,
      },
      fetchedAt: Date.now(),
    };
  } catch (error) {
    return emptyMessageData(safeError(error));
  }
}

export const messageDataLimits = {
  conversationLimit: DEFAULT_CONVERSATION_LIMIT,
  eventLimit: DEFAULT_EVENT_LIMIT,
};
