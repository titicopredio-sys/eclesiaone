/**
 * Eclesia One - Instalador de dados (CLI).
 * Uso: npm run seed
 * Cria a igreja de demonstracao (claramente identificada) com dados completos.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, run, one, scalar, all } from './db.js';
import { isoNow, isoDate } from './lib.js';
import { seedCore, DEMO_CHURCH_NAME, ROLE_PRESETS, buildPermissions } from './seed-core.js';
import { seedFinance } from './seed-finance.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

openDatabase(process.env.DB_FILE || path.join(__dirname, '..', 'data', 'eclesia.db'));

const existing = one('SELECT id FROM churches WHERE name = ? AND deleted_at IS NULL', [DEMO_CHURCH_NAME]);
if (existing && process.env.FORCE_SEED !== 'true') {
  console.log(`Igreja de demonstração já existe (id ${existing.id}). Use FORCE_SEED=true para recriar.`);
  process.exit(0);
}

const churchId = run(
  `INSERT INTO churches (name, legal_name, cnpj, email, phone, whatsapp, address, district, city, state, zip, pastor_name, primary_color, secondary_color, onboarded, is_demo, created_at, updated_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  [
    DEMO_CHURCH_NAME, 'Comunidade Cristã Demonstração (dados fictícios)', '00.000.000/0001-00',
    'contato@demonstracao.org.br', '(19) 3333-4444', '(19) 99999-8888',
    'Av. Central, 2500', 'Centro', 'Campinas', 'SP', '13010-000', 'Pr. Josué Batista',
    '#4F46E5', '#D97706', 0, 1, isoNow(), isoNow(),
  ]
).lastInsertRowid;

console.log('Criando perfis de acesso...');
const core = seedCore(churchId, { people: 180 });
console.log('Criando financeiro, patrimônio e operação...');
const fin = seedFinance(churchId);

/* garante que todos os perfis existam mesmo se o nucleo mudar */
for (const [slug, preset] of Object.entries(ROLE_PRESETS)) {
  const has = one('SELECT id FROM roles WHERE church_id = ? AND slug = ?', [churchId, slug]);
  if (!has) {
    run(`INSERT INTO roles (church_id, name, slug, description, permissions, is_system, is_demo, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      [churchId, preset.label, slug, `Perfil padrão: ${preset.label}`, JSON.stringify(buildPermissions(preset)), 1, 1, isoNow(), isoNow()]);
  }
}

const counts = {
  pessoas: scalar('SELECT COUNT(*) FROM people WHERE church_id = ?', [churchId]),
  familias: scalar('SELECT COUNT(*) FROM families WHERE church_id = ?', [churchId]),
  celulas: scalar('SELECT COUNT(*) FROM cells WHERE church_id = ?', [churchId]),
  reunioes: scalar('SELECT COUNT(*) FROM cell_meetings WHERE church_id = ?', [churchId]),
  ministerios: scalar('SELECT COUNT(*) FROM ministries WHERE church_id = ?', [churchId]),
  eventos: scalar('SELECT COUNT(*) FROM events WHERE church_id = ?', [churchId]),
  lancamentos: scalar('SELECT COUNT(*) FROM transactions WHERE church_id = ?', [churchId]),
  contas_pagar: scalar('SELECT COUNT(*) FROM payables WHERE church_id = ?', [churchId]),
  contas_receber: scalar('SELECT COUNT(*) FROM receivables WHERE church_id = ?', [churchId]),
  patrimonio: scalar('SELECT COUNT(*) FROM assets WHERE church_id = ?', [churchId]),
  documentos: scalar('SELECT COUNT(*) FROM documents WHERE church_id = ?', [churchId]),
  usuarios: scalar('SELECT COUNT(*) FROM users WHERE church_id = ?', [churchId]),
};

console.log('\n  DADOS DE DEMONSTRAÇÃO CRIADOS (is_demo = 1)\n');
console.log(`  Igreja: ${DEMO_CHURCH_NAME} (id ${churchId})`);
for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(18)} ${v}`);
console.log('\n  Contas de acesso (senha única: Eclesia@2026)');
console.log('  ------------------------------------------------------------');
console.log('  admin@eclesiaone.app             → Super Admin (acesso total)');
console.log('  pastor@eclesiaone.app            → Pastor');
console.log('  pastor.auxiliar@eclesiaone.app   → Pastor Auxiliar');
console.log('  financeiro@eclesiaone.app        → Financeiro');
console.log('  secretaria@eclesiaone.app        → Secretaria');
console.log('  lider.celula@eclesiaone.app      → Líder de Célula (escopo: suas células)');
console.log('  lider.ministerio@eclesiaone.app  → Líder de Ministério (escopo: seu ministério)');
console.log('  professor@eclesiaone.app         → Professor EBD (escopo: sua classe)');
console.log('  recepcao@eclesiaone.app          → Recepção');
console.log('  membro@eclesiaone.app            → Membro (Portal do Membro)');
console.log('\n  Para remover os dados de demonstração: Configurações → Dados de demonstração → Remover.\n');
