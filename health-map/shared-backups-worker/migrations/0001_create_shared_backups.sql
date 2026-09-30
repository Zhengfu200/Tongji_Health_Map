CREATE TABLE shared_backups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  creator TEXT NOT NULL,
  created_at TEXT NOT NULL,
  places INTEGER NOT NULL,
  routes INTEGER NOT NULL,
  byte_size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'deleted'))
);
CREATE INDEX shared_backups_page ON shared_backups (status, created_at DESC, id DESC);
