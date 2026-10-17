#!/usr/bin/env node
/**
 * Eclesia One - Bootstrap / primeiro acesso pela linha de comando.
 * Cria (ou redefine) o administrador geral e a primeira igreja, e garante os
 * perfis padrao de todas as igrejas existentes.
 *
 * Uso:
 *   npm run setup
 *   ADMIN_EMAIL=voce@igreja.org ADMIN_PASSWORD='SuaSenha#2026' CHURCH_NAME='Igreja Central' npm run setup
 * Se ADMIN_PASSWORD nao for informada, o sistema gera uma senha e a imprime.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, one, all, run, scalar } from './db.js';
import { isoNow, hashPassword } from './lib.js';
import { createChurch, createUser, emailTaken, generatePassword, ensureChurchRoles } from './tenancy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
openDatabase(process.env.DB_FILE || path.join(ROOT, 'data', 'eclesia.db'));

const email = (process.env.ADMIN_EMAIL || 'admin@eclesiaone.app').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || generatePassword(12);
const gerada = !process.env.ADMIN_PASSWORD;
const churchName = process.env.CHURCH_NAME || 'Minha Igreja';
const adminName = process.env.ADMIN_NAME || 'Administrador';

console.log('\n  Eclesia One — configuração de acesso\n  ' + '-'.repeat(56));

let churchId = scalar('SELECT id FROM churches WHERE deleted_at IS NULL ORDER BY id LIMIT 1');
if (!churchId) {
  churchId = createChurch({ name: churchName });
  console.log(`  Igreja criada: ${churchName} (id ${churchId})`);
} else {
  console.log(`  Igreja existente reutilizada: id ${churchId}`);
}

for (const c of all('SELECT id, name FROM churches WHERE deleted_at IS NULL')) {
  const n = ensureChurchRoles(c.id);
  if (n) console.log(`  Perfis padrão criados na igreja "${c.name}": ${n}`);
}

let userId = scalar('SELECT id FROM users WHERE lower(email) = lower(?) AND deleted_at IS NULL', [email]);
if (userId) {
  run('UPDATE users SET password_hash = ?, role = ?, active = 1, church_id = COALESCE(church_id, ?), updated_at = ? WHERE id = ?',
    [hashPassword(password), 'super_admin', churchId, isoNow(), userId]);
  console.log('  Usuário existente atualizado (senha redefinida).');
} else {
  userId = createUser({ churchId, name: adminName, email, password, role: 'super_admin' });
  console.log('  Administrador criado.');
}

console.log('\n  ACESSO DO ADMINISTRADOR GERAL (guarde estas informações)');
console.log('  ' + '-'.repeat(56));
console.log(`  Endereço : http://localhost:${process.env.PORT || 4173}`);
console.log(`  E-mail   : ${email}`);
console.log(`  Senha    : ${password}${gerada ? '   (gerada agora — troque no primeiro acesso)' : ''}`);
console.log('  ' + '-'.repeat(56));
console.log('  Trocar a senha: entre no sistema → Meu perfil → Alterar senha.');
console.log('  Criar igrejas e Pastor ADM: menu Rede → Igrejas da rede → Nova igreja + Pastor ADM.\n');
