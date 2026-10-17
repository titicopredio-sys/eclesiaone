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

/** Credenciais fixas do administrador da rede (mestre da plataforma). */
export const SEED = {
  email: 'eclesia@eclesia-adm',
  password: '290369',
  name: 'Administrador da Rede',
  church: 'Administração da Rede',
};

export function seedSuperadmin({ quiet = false } = {}) {
  const dbFile = process.env.DB_FILE || path.join(ROOT, 'data', 'eclesia.db');
  openDatabase(dbFile);

  let churchId = scalar(
    'SELECT id FROM churches WHERE name = ? AND deleted_at IS NULL LIMIT 1',
    [SEED.church],
  );
  if (!churchId) {
    churchId = createChurch({ name: SEED.church });
    if (!quiet) console.log(`[seed-superadmin] Igreja raiz "${SEED.church}" criada (id=${churchId}).`);
  }
  ensureChurchRoles(churchId);
  run('UPDATE churches SET onboarded = 1, is_demo = 0, updated_at = ? WHERE id = ?', [isoNow(), churchId]);

  let userId = scalar(
    'SELECT id FROM users WHERE lower(email) = lower(?) AND deleted_at IS NULL',
    [SEED.email],
  );
  if (userId) {
    run(
      `UPDATE users
         SET password_hash = ?, name = ?, role = 'super_admin', active = 1,
             require_reset = 0, is_demo = 0, church_id = ?, updated_at = ?
       WHERE id = ?`,
      [hashPassword(SEED.password), SEED.name, churchId, isoNow(), userId],
    );
  } else {
    userId = createUser({
      churchId,
      name: SEED.name,
      email: SEED.email,
      password: SEED.password,
      role: 'super_admin',
      phone: null,
    });
  }

  if (!quiet) {
    console.log(`[seed-superadmin] Administrador da rede pronto:`);
    console.log(`  E-mail : ${SEED.email}`);
    console.log(`  Senha  : ${SEED.password}`);
    console.log(`  Igreja : ${SEED.church} (id=${churchId})`);
    console.log(`  user_id: ${userId}`);
    console.log(`  Hierarquia: Administrador da Rede > Pastor ADM > Equipe`);
  }
  return { churchId, userId, ...SEED };
}

// Quando executado diretamente via CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  seedSuperadmin({ quiet: false });
}
