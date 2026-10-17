/**
 * Eclesia One - Camada de dados (SQLite via node:sqlite, preparada para PostgreSQL).
 * Todas as operacoes sao escopadas por church_id (multi-tenant) e usam soft delete.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isoNow } from './lib.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export let db = null;

export function openDatabase(file = path.join(__dirname, '..', 'data', 'eclesia.db')) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  // Evita 'database is locked' quando o seed roda junto com o servidor.
  db.exec('PRAGMA busy_timeout = 8000');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  return db;
}

/* --------------------------------------------------------------- consultas */
export function all(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.all(...params.map(coerce));
}
export function one(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.get(...params.map(coerce)) ?? null;
}
export function run(sql, params = []) {
  const stmt = db.prepare(sql);
  const r = stmt.run(...params.map(coerce));
  return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
}
export function scalar(sql, params = []) {
  const row = one(sql, params);
  if (!row) return null;
  return Object.values(row)[0];
}

function coerce(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === null) return null;
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

/* ------------------------------------------------------------------ helpers */
export function insert(table, data) {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  const cols = keys.join(', ');
  const ph = keys.map(() => '?').join(', ');
  const { lastInsertRowid } = run(`INSERT INTO ${table} (${cols}) VALUES (${ph})`, keys.map((k) => data[k]));
  return lastInsertRowid;
}

export function update(table, id, churchId, data) {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined && k !== 'id' && k !== 'church_id');
  if (!keys.length) return 0;
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  const params = keys.map((k) => data[k]);
  const extra = [];
  if (hasColumn(table, 'updated_at')) { extra.push('updated_at = ?'); params.push(isoNow()); }
  params.push(id, churchId);
  const soft = hasColumn(table, 'deleted_at') ? ' AND deleted_at IS NULL' : '';
  const { changes } = run(`UPDATE ${table} SET ${sets}${extra.length ? ', ' + extra.join(', ') : ''} WHERE id = ? AND church_id = ?${soft}`, params);
  return changes;
}

/**
 * Exclusao logica (soft delete). Nunca apaga fisicamente: preserva historico.
 * Tabelas sem a coluna deleted_at sao ignoradas (retorno 0).
 */
export function softDelete(table, id, churchId) {
  if (!hasColumn(table, 'deleted_at')) return 0;
  const params = [isoNow()];
  const extra = hasColumn(table, 'updated_at') ? ', updated_at = ?' : '';
  if (extra) params.push(isoNow());
  params.push(id, churchId);
  const { changes } = run(`UPDATE ${table} SET deleted_at = ?${extra} WHERE id = ? AND church_id = ? AND deleted_at IS NULL`, params);
  return changes;
}

/* --------------------------------------------------- introspecao de schema */
const columnCache = new Map();

/** Informa se a tabela possui determinada coluna (multi-tenant / soft delete). */
export function hasColumn(table, column) {
  if (!columnCache.has(table)) {
    try { columnCache.set(table, new Set(all(`PRAGMA table_info(${table})`).map((c) => c.name))); }
    catch { columnCache.set(table, new Set()); }
  }
  return columnCache.get(table).has(column);
}

export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function tableColumns(table) {
  return all(`PRAGMA table_info(${table})`).map((r) => r.name);
}
