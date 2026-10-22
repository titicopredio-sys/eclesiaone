#!/usr/bin/env node
/**
 * Eclesia One — Boot do superadmin mestre.
 * Idempotente. Sempre que o servidor sobe (banco novo ou existente), garante
 * que o administrador da rede esteja presente na igreja raiz "Administração
 * da Rede", com senha hash PBKDF2.
 *
 * Pode rodar isolado:  node server/seed-superadmin.js
 * Também é chamado em  server/index.js  no startup.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, scalar, run } from './db.js';
import { isoNow, hashPassword } from './lib.js';
import { createChurch, createUser, ensureChurchRoles } from './tenancy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

/** Credenciais fixas do administrador da rede (mestre da plataforma).
 *  Essas sao as mesmas informadas na documentacao (ACCESSO.md). Alteraveis
 *  via variaveis de ambiente antes do primeiro start, mas a partir do
 *  primeiro start o seed e idempotente e mantem sempre estas credenciais. */
export const SEED = {
  email: 'thiago@eclesiaapp.com',
  password: '290369@eclesia',
  name: 'Administrador da Rede (Master)',
  church: 'Administração da Rede',
};

export function seedSuperadmin({ quiet = false } = {}) {
  const dbFile = process.env.DB_FILE || path.join(ROOT, 'data', 'eclesia.db');
  openDatabase(dbFile);

  // Permite sobrescrever as credenciais via variavel de ambiente no primeiro
  // start apenas. Depois disso, o seed passa a ser idempotente e mantem
  // estes mesmos valores para garantir consistencia operacional.
  const email = (process.env.MASTER_OVERRIDE_EMAIL || SEED.email).trim().toLowerCase();
  const password = process.env.MASTER_OVERRIDE_PASSWORD || SEED.password;
  const name = process.env.MASTER_OVERRIDE_NAME || SEED.name;
  const churchName = process.env.MASTER_OVERRIDE_CHURCH || SEED.church;

  let churchId = scalar(
    'SELECT id FROM churches WHERE name = ? AND deleted_at IS NULL LIMIT 1',
    [churchName],
  );
  if (!churchId) {
    churchId = createChurch({ name: churchName });
    if (!quiet) console.log(`[seed-superadmin] Igreja raiz "${churchName}" criada (id=${churchId}).`);
  }
  ensureChurchRoles(churchId);
  run('UPDATE churches SET onboarded = 1, is_demo = 0, updated_at = ? WHERE id = ?', [isoNow(), churchId]);

  let userId = scalar(
    'SELECT id FROM users WHERE lower(email) = lower(?) AND deleted_at IS NULL',
    [email],
  );
  if (userId) {
    run(
      `UPDATE users
         SET password_hash = ?, name = ?, role = 'super_admin', active = 1,
             require_reset = 0, is_demo = 0, church_id = ?, updated_at = ?
       WHERE id = ?`,
      [hashPassword(password), name, churchId, isoNow(), userId],
    );
  } else {
    userId = createUser({
      churchId,
      name,
      email,
      password,
      role: 'super_admin',
      phone: null,
    });
  }

  if (!quiet) {
    console.log(`[seed-superadmin] Administrador da rede pronto:`);
    console.log(`  E-mail : ${email}`);
    console.log(`  Senha  : ${password}`);
    console.log(`  Igreja : ${churchName} (id=${churchId})`);
    console.log(`  user_id: ${userId}`);
    console.log(`  Hierarquia: Administrador da Rede (super_admin) > Pastor ADM > Equipe`);
  }
  return { churchId, userId, email, password, name, church: churchName };
}

// Quando executado diretamente via CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  seedSuperadmin({ quiet: false });
}
