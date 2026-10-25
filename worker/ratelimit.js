export async function hit(env, key, limit, windowSec) {
  const now = Math.floor(Date.now() / 1000);
  const window = Math.max(1, Math.floor(windowSec));

  await env.DB.prepare(
    `INSERT INTO rate_limits (key, count, window_start)
     VALUES (?1, 1, ?2)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN ?2 - rate_limits.window_start >= ?3 THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN ?2 - rate_limits.window_start >= ?3 THEN ?2 ELSE rate_limits.window_start END`
  )
    .bind(key, now, window)
    .run();

  const row = await env.DB.prepare("SELECT count FROM rate_limits WHERE key = ?1")
    .bind(key)
    .first();

  return Boolean(row) && row.count <= limit;
}
