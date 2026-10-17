#!/usr/bin/env node
/**
 * Eclesia One — provisionamento do administrador master da rede.
 * Idempotente: cria (ou atualiza) o ambiente de administração, os perfis padrão
 * de todas as igrejas e o usuário Super Admin. NÃO cria dado fictício algum.
 *
 * Uso:
 *   MASTER_EMAIL=voce@dominio MASTER_PASSWORD='SuaSenha' npm run master
 * Variáveis: MASTER_EMAIL, MASTER_PASSWORD, MASTER_NAME, MASTER_CHURCH, DB_FILE
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, one, all, run, scalar } from './db.js';
import { isoNow, hashPassword } from './lib.js';
import { createChurch, createUser, ensureChurchRoles, generatePassword } from './tenancy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const dbFile = process.env.DB_FILE || path.join(ROOT, 'data', 'eclesia.db');
openDatabase(dbFile);

const email = String(process.env.MASTER_EMAIL || 'master@eclesiaone.app').trim().toLowerCase();
const password = process.env.MASTER_PASSWORD || generatePassword(12);
const gerada = !process.env.MASTER_PASSWORD;
const name = process.env.MASTER_NAME || 'Administrador Master';
const churchName = process.env.MASTER_CHURCH || 'Administração da Rede';

let churchId = scalar('SELECT id FROM churches WHERE name = ? AND deleted_at IS NULL LIMIT 1', [churchName]);
if (!churchId) churchId = createChurch({ name: churchName });
run('UPDATE churches SET onboarded = 1, is_demo = 0, updated_at = ? WHERE id = ?', [isoNow(), churchId]);
for (const c of all('SELECT id FROM churches WHERE deleted_at IS NULL')) ensureChurchRoles(c.id);

let userId = scalar('SELECT id FROM users WHERE lower(email) = lower(?) AND deleted_at IS NULL', [email]);
if (userId) {
  run('UPDATE users SET password_hash = ?, name = ?, role = ?, active = 1, church_id = ?, require_reset = 0, is_demo = 0, updated_at = ? WHERE id = ?',
    [hashPassword(password), name, 'super_admin', churchId, isoNow(), userId]);
} else {
  userId = createUser({ churchId, name, email, password, role: 'super_admin' });
}

const resumo = {
  banco: dbFile,
  igrejas: Number(scalar('SELECT COUNT(*) FROM churches WHERE deleted_at IS NULL')),
  usuarios: Number(scalar('SELECT COUNT(*) FROM users WHERE deleted_at IS NULL')),
  perfis_no_ambiente: Number(scalar('SELECT COUNT(*) FROM roles WHERE church_id = ? AND deleted_at IS NULL', [churchId])),
  pessoas_de_demonstracao: Number(scalar('SELECT COUNT(*) FROM people WHERE is_demo = 1 AND deleted_at IS NULL')),
};
console.log('\n  Eclesia One — administrador master provisionado');
console.log('  ' + '-'.repeat(58));
console.log(`  E-mail   : ${email}`);
console.log(`  Senha    : ${password}${gerada ? '   (gerada agora — troque no primeiro acesso)' : ''}`);
console.log('  Papel    : Super Admin (administra a rede inteira)');
console.log(`  Ambiente : ${churchName} (id ${churchId})`);
console.log('  ' + '-'.repeat(58));
console.log('  Banco:', JSON.stringify(resumo));
console.log('  Trocar a senha: entrar no sistema → Meu perfil → Alterar senha.');
console.log('  Cadastrar igreja cliente: Rede → Igrejas da rede → Nova igreja + Pastor ADM.\n');
