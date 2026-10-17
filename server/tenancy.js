/**
 * Eclesia One - Multi-tenant: criacao de igrejas (ambientes isolados),
 * perfis padrao de cada igreja e usuarios vinculados.
 * Toda entidade do sistema carrega church_id: o isolamento e feito no servidor.
 */
import { all, one, insert, scalar } from './db.js';
import { isoNow, hashPassword, randomToken } from './lib.js';
import { DEFAULT_ROLES } from './auth.js';

/** Garante os perfis padrao da igreja (idempotente). Retorna a lista de slugs presentes. */
export function ensureChurchRoles(churchId) {
  const existing = new Set(all('SELECT slug FROM roles WHERE church_id = ? AND deleted_at IS NULL', [churchId]).map((r) => r.slug));
  for (const role of DEFAULT_ROLES) {
    if (existing.has(role.slug)) continue;
    insert('roles', {
      church_id: churchId, name: role.name, slug: role.slug, description: role.description || null,
      permissions: JSON.stringify(role.permissions || {}), is_system: 1, is_demo: 0,
      created_at: isoNow(), updated_at: isoNow(),
    });
  }
  return all('SELECT slug FROM roles WHERE church_id = ? AND deleted_at IS NULL ORDER BY slug', [churchId]).map((r) => r.slug);
}

/** Generate a random memorable password. */
import crypto from 'node:crypto';
export const generatePassword = (len = 12) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$%&*';
  const buf = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
};

/** Cria uma igreja (tenant) nova, ja com os perfis padrao. */
export function createChurch({ name, city, state, email, phone, cnpj, isDemo = false }) {
  const id = insert('churches', {
    name: String(name || '').trim(), legal_name: null, cnpj: cnpj || null, email: email || null,
    phone: phone || null, city: city || null, state: state ? String(state).toUpperCase().slice(0, 2) : null,
    is_demo: isDemo ? 1 : 0, onboarded: 0, created_at: isoNow(), updated_at: isoNow(),
  });
  ensureChurchRoles(id);
  return id;
}

export function emailTaken(email) {
  return !!scalar('SELECT id FROM users WHERE lower(email) = lower(?) AND deleted_at IS NULL', [email]);
}

/** Cria usuario vinculado a uma igreja. */
export function createUser({ churchId, name, email, password, role = 'membro', personId = null, phone = null }) {
  return insert('users', {
    church_id: churchId, name: String(name || '').trim(), email: String(email || '').trim().toLowerCase(),
    password_hash: hashPassword(password), role, person_id: personId, phone, active: 1,
    is_demo: 0, created_at: isoNow(), updated_at: isoNow(),
  });
}

/** Senha provisoria aleatoria (usa gerador criptografico do lib.js). */
export function generatePassword(len = 12) {
  const raw = (randomToken(48) || '').replace(/[^A-Za-z0-9]/g, '');
  const base = (raw + 'EclesiaOne').slice(0, Math.max(4, len - 3));
  const digits = (randomToken(8) || '').replace(/\D/g, '').padEnd(2, '7').slice(0, 2);
  return base + '#' + digits;
}

/** Contadores por igreja (usado na visao de rede do administrador geral). */
export function tenantStats(churchId) {
  const c = (sql) => Number(scalar(sql, [churchId]) || 0);
  return {
    pessoas: c('SELECT COUNT(*) FROM people WHERE church_id = ? AND deleted_at IS NULL'),
    usuarios: c('SELECT COUNT(*) FROM users WHERE church_id = ? AND deleted_at IS NULL'),
    celulas: c('SELECT COUNT(*) FROM cells WHERE church_id = ? AND deleted_at IS NULL'),
    familias: c('SELECT COUNT(*) FROM families WHERE church_id = ? AND deleted_at IS NULL'),
  };
}

export function churchById(id) {
  return one('SELECT * FROM churches WHERE id = ? AND deleted_at IS NULL', [id]);
}
