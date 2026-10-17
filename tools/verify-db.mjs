/* Abre um arquivo .db diretamente e informa se ele está completo e utilizável.
   Uso: node tools/verify-db.mjs data/eclesia.db senha-a-testar */
import path from 'node:path';
import { openDatabase, all, scalar } from '../server/db.js';
import { verifyPassword } from '../server/lib.js';
const file = process.argv[2] || 'data/eclesia.db';
const senha = process.argv[3];
openDatabase(path.resolve(file));
const users = all('SELECT id, name, email, role, church_id, active, is_demo, password_hash FROM users WHERE deleted_at IS NULL ORDER BY id');
const achado = senha ? users.find((u) => verifyPassword(senha, u.password_hash)) : null;
console.log(JSON.stringify({
  arquivo: file,
  igrejas: Number(scalar('SELECT COUNT(*) FROM churches WHERE deleted_at IS NULL')),
  usuarios: users.length,
  pessoas: Number(scalar('SELECT COUNT(*) FROM people WHERE deleted_at IS NULL')),
  registros_de_demonstracao: Number(scalar('SELECT COUNT(*) FROM people WHERE is_demo = 1 AND deleted_at IS NULL')),
  contas: users.map((u) => ({ email: u.email, papel: u.role, igreja_id: u.church_id, ativo: u.active, demo: u.is_demo })),
  senha_confere: achado ? achado.email : false,
}, null, 1));
