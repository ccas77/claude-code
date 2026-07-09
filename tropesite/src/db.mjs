import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT } from './config.mjs';

let _db = null;

export function db() {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  _db = new DatabaseSync(config.dbPath);
  _db.exec('PRAGMA foreign_keys = ON;');
  return _db;
}

export function initSchema() {
  const sql = fs.readFileSync(path.join(ROOT, 'src', 'schema.sql'), 'utf8');
  db().exec(sql);
}

export function dbExists() {
  return fs.existsSync(config.dbPath);
}

// Convenience helpers -------------------------------------------------------

export function all(sql, ...params) {
  return db().prepare(sql).all(...params);
}
export function get(sql, ...params) {
  return db().prepare(sql).get(...params);
}
export function run(sql, ...params) {
  return db().prepare(sql).run(...params);
}

export function setMeta(key, value) {
  run(
    `INSERT INTO meta(key,value) VALUES(?,?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    key, String(value)
  );
}
export function getMeta(key) {
  const row = get('SELECT value FROM meta WHERE key=?', key);
  return row ? row.value : null;
}
