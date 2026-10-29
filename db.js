'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('meal','workout','medication','plan','task','note')),
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
  status TEXT NOT NULL CHECK(status IN ('completed','planned','missed','cancelled','skipped','pending','in_progress','unknown')),
  occurred_at TEXT NOT NULL CHECK(occurred_at GLOB '????-??-??T??:??:??.???Z' AND strftime('%Y-%m-%dT%H:%M:%fZ', occurred_at) = occurred_at),
  occurred_at_ms INTEGER NOT NULL CHECK(typeof(occurred_at_ms) = 'integer'),
  timezone TEXT NOT NULL CHECK(length(trim(timezone)) BETWEEN 1 AND 100),
  historical_confirmed_at TEXT CHECK(historical_confirmed_at IS NULL OR (historical_confirmed_at GLOB '????-??-??T??:??:??.???Z' AND strftime('%Y-%m-%dT%H:%M:%fZ', historical_confirmed_at) = historical_confirmed_at)),
  completed_at TEXT CHECK(completed_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', completed_at) IS NOT NULL),
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  CHECK (status = 'completed' OR completed_at IS NULL),
  CHECK (json_valid(details_json))
);
CREATE INDEX IF NOT EXISTS events_user_time ON events(user_id, occurred_at_ms);
CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('created','corrected','deleted')),
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS events_validate_insert BEFORE INSERT ON events BEGIN
  SELECT CASE WHEN ABS(CAST((julianday(NEW.occurred_at) - 2440587.5) * 86400000 AS INTEGER) - NEW.occurred_at_ms) > 1
    THEN RAISE(ABORT, 'UTC timestamp and epoch value do not match') END;
  SELECT CASE WHEN NEW.occurred_at_ms > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    AND NEW.status NOT IN ('planned','cancelled') THEN RAISE(ABORT, 'future events must be planned or cancelled') END;
  SELECT CASE WHEN CAST(NEW.occurred_at_ms / 1000 AS INTEGER) < CAST(strftime('%s','now') AS INTEGER)
    AND NEW.historical_confirmed_at IS NULL THEN RAISE(ABORT, 'historical events require user confirmation') END;
  SELECT CASE WHEN NEW.completed_at IS NOT NULL AND CAST((julianday(NEW.completed_at) - 2440587.5) * 86400000 AS INTEGER) > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    THEN RAISE(ABORT, 'completion timestamp cannot be in the future') END;
  SELECT CASE WHEN NEW.completed_at IS NOT NULL AND julianday(NEW.completed_at) < julianday(NEW.occurred_at)
    THEN RAISE(ABORT, 'completion timestamp cannot precede the event') END;
END;
CREATE TRIGGER IF NOT EXISTS events_validate_update BEFORE UPDATE ON events BEGIN
  SELECT CASE WHEN ABS(CAST((julianday(NEW.occurred_at) - 2440587.5) * 86400000 AS INTEGER) - NEW.occurred_at_ms) > 1
    THEN RAISE(ABORT, 'UTC timestamp and epoch value do not match') END;
  SELECT CASE WHEN NEW.occurred_at_ms > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    AND NEW.status NOT IN ('planned','cancelled') THEN RAISE(ABORT, 'future events must be planned or cancelled') END;
  SELECT CASE WHEN CAST(NEW.occurred_at_ms / 1000 AS INTEGER) < CAST(strftime('%s','now') AS INTEGER)
    AND NEW.historical_confirmed_at IS NULL THEN RAISE(ABORT, 'historical events require user confirmation') END;
  SELECT CASE WHEN NEW.completed_at IS NOT NULL AND CAST((julianday(NEW.completed_at) - 2440587.5) * 86400000 AS INTEGER) > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    THEN RAISE(ABORT, 'completion timestamp cannot be in the future') END;
  SELECT CASE WHEN NEW.completed_at IS NOT NULL AND julianday(NEW.completed_at) < julianday(NEW.occurred_at)
    THEN RAISE(ABORT, 'completion timestamp cannot precede the event') END;
END;
CREATE TRIGGER IF NOT EXISTS events_audit_insert AFTER INSERT ON events BEGIN
  INSERT INTO audit_events(event_id,user_id,actor_id,action,before_json,after_json,created_at)
  VALUES(NEW.id,NEW.user_id,NEW.updated_by,'created',NULL,
    json_object('category',NEW.category,'title',NEW.title,'status',NEW.status,'occurredAt',NEW.occurred_at,'timezone',NEW.timezone,'historicalConfirmedAt',NEW.historical_confirmed_at,'completedAt',NEW.completed_at,'details',json(NEW.details_json)),NEW.created_at);
END;
CREATE TRIGGER IF NOT EXISTS events_audit_update AFTER UPDATE ON events BEGIN
  INSERT INTO audit_events(event_id,user_id,actor_id,action,before_json,after_json,created_at)
  VALUES(NEW.id,NEW.user_id,NEW.updated_by,'corrected',
    json_object('category',OLD.category,'title',OLD.title,'status',OLD.status,'occurredAt',OLD.occurred_at,'timezone',OLD.timezone,'historicalConfirmedAt',OLD.historical_confirmed_at,'completedAt',OLD.completed_at,'details',json(OLD.details_json)),
    json_object('category',NEW.category,'title',NEW.title,'status',NEW.status,'occurredAt',NEW.occurred_at,'timezone',NEW.timezone,'historicalConfirmedAt',NEW.historical_confirmed_at,'completedAt',NEW.completed_at,'details',json(NEW.details_json)),NEW.updated_at);
END;
CREATE TRIGGER IF NOT EXISTS audit_immutable_update BEFORE UPDATE ON audit_events BEGIN
  SELECT RAISE(ABORT, 'audit events are immutable');
END;
CREATE TRIGGER IF NOT EXISTS audit_immutable_delete BEFORE DELETE ON audit_events BEGIN
  SELECT RAISE(ABORT, 'audit events are immutable');
END;
`;

const DROP_TRIGGERS = `
DROP TRIGGER IF EXISTS events_validate_insert;
DROP TRIGGER IF EXISTS events_validate_update;
DROP TRIGGER IF EXISTS events_audit_insert;
DROP TRIGGER IF EXISTS events_audit_update;
DROP TRIGGER IF EXISTS audit_immutable_update;
DROP TRIGGER IF EXISTS audit_immutable_delete;
`;

function migrateEventStates(db) {
  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='events'").get();
  if (!table || table.sql.includes("'unknown'") && table.sql.includes("'in_progress'")) return;

  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(DROP_TRIGGERS);
    db.exec('ALTER TABLE events RENAME TO events_legacy_state_migration');
    db.exec('DROP INDEX IF EXISTS events_user_time');
    db.exec(SCHEMA);
    // Preserve the original audit history and avoid creating duplicate "created" audit rows.
    db.exec('DROP TRIGGER IF EXISTS events_audit_insert');
    db.exec('DROP TRIGGER IF EXISTS events_audit_update');
    db.exec(`INSERT INTO events(id,user_id,category,title,status,occurred_at,occurred_at_ms,timezone,
      historical_confirmed_at,completed_at,details_json,created_at,updated_at,updated_by)
      SELECT id,user_id,category,title,status,occurred_at,occurred_at_ms,timezone,
      historical_confirmed_at,completed_at,details_json,created_at,updated_at,updated_by
      FROM events_legacy_state_migration`);
    db.exec('DROP TABLE events_legacy_state_migration');
    db.exec(SCHEMA);
    db.exec('PRAGMA user_version = 2');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function openDatabase(filePath = process.env.LIFETRACK_DB_PATH || path.join(__dirname, 'data', 'lifetrack.sqlite')) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  const db = new DatabaseSync(filePath);
  db.exec(SCHEMA);
  migrateEventStates(db);
  // CREATE TRIGGER IF NOT EXISTS preserves stale trigger bodies across app upgrades.
  db.exec(DROP_TRIGGERS);
  db.exec(SCHEMA);
  return db;
}

module.exports = { openDatabase, SCHEMA };
