CREATE TABLE users(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL COLLATE NOCASE, pw_hash TEXT NOT NULL, pw_salt TEXT NOT NULL, pw_iter INTEGER NOT NULL, display_name TEXT NOT NULL, avatar_key TEXT, bio TEXT, created_at INTEGER NOT NULL);
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE posts(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL CHECK(kind IN('project','guide')), title TEXT NOT NULL, slug TEXT NOT NULL, body_md TEXT NOT NULL, pitch TEXT, code TEXT, prompts TEXT, link TEXT, repo TEXT, image_key TEXT, tools TEXT, tags TEXT, feedback TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER);
CREATE INDEX posts_kind_created ON posts(kind, created_at DESC);
CREATE INDEX posts_user ON posts(user_id);
CREATE TABLE rate_limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start INTEGER NOT NULL);
