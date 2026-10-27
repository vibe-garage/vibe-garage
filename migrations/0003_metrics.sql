-- First-party page-view metrics. No raw IPs, emails or cookies are stored.
-- vh is a truncated SHA-256 of (daily random salt + IP + User-Agent); the salt is
-- replaced every UTC day and old salts are deleted, so hashes can't be linked across days.
CREATE TABLE pageviews(
  id INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  post_id TEXT,
  ref_host TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  country TEXT,
  device TEXT NOT NULL,
  vh TEXT NOT NULL,
  signed_in INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX pageviews_ts ON pageviews(ts);
CREATE TABLE metrics_salt(day TEXT PRIMARY KEY, salt TEXT NOT NULL);
