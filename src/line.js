function numberValue(result) {
  return Number(result?.results?.[0]?.value ?? 0);
}

export async function fetchLineDashboard(env) {
  if (!env.DB) {
    throw new Error("D1 binding DB is missing");
  }

  const results = await env.DB.batch([
    env.DB.prepare(`
      SELECT COUNT(*) AS value
      FROM line_events
      WHERE event_type = 'message'
        AND event_timestamp >= unixepoch('now', '-1 day') * 1000
    `),

    env.DB.prepare(`
      SELECT COUNT(*) AS value
      FROM line_events
      WHERE event_type = 'message'
        AND event_timestamp >= unixepoch('now', '-7 days') * 1000
    `),

    env.DB.prepare(`
      SELECT COUNT(DISTINCT user_hash) AS value
      FROM line_events
      WHERE event_type = 'message'
        AND user_hash IS NOT NULL
        AND event_timestamp >= unixepoch('now', '-7 days') * 1000
    `),

    env.DB.prepare(`
      SELECT COUNT(*) AS value
      FROM line_events
      WHERE event_type = 'follow'
        AND event_timestamp >= unixepoch('now', '-30 days') * 1000
    `),

    env.DB.prepare(`
      SELECT COUNT(*) AS value
      FROM line_events
      WHERE event_type = 'unfollow'
        AND event_timestamp >= unixepoch('now', '-30 days') * 1000
    `),

    env.DB.prepare(`
      SELECT COUNT(*) AS value
      FROM line_events
      WHERE message_type = 'image'
        AND event_timestamp >= unixepoch('now', '-7 days') * 1000
    `),

    env.DB.prepare(`
      SELECT COUNT(*) AS value
      FROM line_events
      WHERE event_type = 'postback'
        AND event_timestamp >= unixepoch('now', '-7 days') * 1000
    `),

    env.DB.prepare(`
      SELECT
        date(
          event_timestamp / 1000,
          'unixepoch',
          '+8 hours'
        ) AS day,
        COUNT(*) AS messages,
        COUNT(DISTINCT user_hash) AS users
      FROM line_events
      WHERE event_type = 'message'
        AND event_timestamp >= unixepoch('now', '-13 days') * 1000
      GROUP BY day
      ORDER BY day ASC
    `),

    env.DB.prepare(`
      SELECT
        COALESCE(SUM(
          CASE
            WHEN message_text LIKE '%價%'
              OR message_text LIKE '%費用%'
              OR message_text LIKE '%多少%'
            THEN 1 ELSE 0
          END
        ), 0) AS price,

        COALESCE(SUM(
          CASE
            WHEN message_text LIKE '%預約%'
              OR message_text LIKE '%日期%'
              OR message_text LIKE '%時間%'
              OR message_text LIKE '%幾點%'
            THEN 1 ELSE 0
          END
        ), 0) AS booking,

        COALESCE(SUM(
          CASE
            WHEN message_text LIKE '%內裝%'
              OR message_text LIKE '%拆洗%'
              OR message_text LIKE '%座椅%'
              OR message_text LIKE '%地毯%'
            THEN 1 ELSE 0
          END
        ), 0) AS interior,

        COALESCE(SUM(
          CASE
            WHEN message_text LIKE '%異味%'
              OR message_text LIKE '%臭%'
              OR message_text LIKE '%菸%'
              OR message_text LIKE '%煙%'
              OR message_text LIKE '%霉%'
              OR message_text LIKE '%黴%'
            THEN 1 ELSE 0
          END
        ), 0) AS odor,

        COALESCE(SUM(
          CASE
            WHEN message_text LIKE '%鍍膜%'
              OR message_text LIKE '%烤漆%'
              OR message_text LIKE '%刮傷%'
              OR message_text LIKE '%外觀%'
            THEN 1 ELSE 0
          END
        ), 0) AS exterior,

        COALESCE(SUM(
          CASE
            WHEN message_text LIKE '%地址%'
              OR message_text LIKE '%在哪%'
              OR message_text LIKE '%電話%'
              OR message_text LIKE '%位置%'
            THEN 1 ELSE 0
          END
        ), 0) AS location
      FROM line_events
      WHERE message_type = 'text'
        AND event_timestamp >= unixepoch('now', '-30 days') * 1000
    `),
  ]);

  return {
    messages24h: numberValue(results[0]),
    messages7d: numberValue(results[1]),
    users7d: numberValue(results[2]),
    follow30d: numberValue(results[3]),
    unfollow30d: numberValue(results[4]),
    images7d: numberValue(results[5]),
    postbacks7d: numberValue(results[6]),
    daily: results[7]?.results ?? [],
    categories: results[8]?.results?.[0] ?? {},
  };
}
