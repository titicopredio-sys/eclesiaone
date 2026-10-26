/* Gera dist/ com a interface + retrato real dos dados para hospedagem estática.
   Uso: npm run build:static
   - Se houver servidor rodando (padrão http://127.0.0.1:4173), o retrato inclui
     os dados reais de demonstração da igreja do usuário informado.
   - Se NÃO houver servidor, o build NÃO FALHA: gera dist/ com retrato vazio
     (interface completa, dados em branco) — suficiente para publicar a vitrine.
   Tudo multiplataforma (Windows/Linux/macOS): apenas caminhos Node nativos. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const EMAIL = process.env.ADMIN_EMAIL || 'thiago@eclesiaapp.com';
const PASSWORD = process.env.ADMIN_PASSWORD || '290369@eclesia';
const DIST = path.join(ROOT, 'dist');
const LIMIT = Number(process.env.SNAPSHOT_LIMIT || 150);

const api = async (p, opts = {}) => {
  try {
    const r = await fetch(BASE + p, opts);
    const t = await r.text();
    try { return { ok: r.ok, status: r.status, body: JSON.parse(t) }; }
    catch { return { ok: r.ok, status: r.status, body: null, text: t }; }
  } catch {
    return { ok: false, status: 0, body: null };
  }
};

/* Login tolerante: sem servidor ativo, segue com retrato vazio. */
let token = null, igreja = null, role = null;
const login = await api('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (login.body?.token) {
  token = login.body.token;
  igreja = login.body.user?.church_name || null;
  role = login.body.user?.role || null;
  console.log(`  autenticado: ${role} | igreja: ${igreja}`);
} else {
  console.warn('  AVISO: servidor não acessível em ' + BASE + '.');
  console.warn('  Gerando dist/ com retrato VAZIO (interface completa, dados em branco).');
  console.warn('  Para publicar com dados: suba o servidor (npm start) e rode o build novamente.');
}
const H = token ? { Authorization: 'Bearer ' + token } : {};

const ENDPOINTS = ['/api/meta', '/api/dashboard', '/api/dashboard/finance', '/api/dashboard/ministry', '/api/alerts',
  '/api/cashflow', '/api/cells/panel', '/api/indicators', '/api/reports', '/api/agenda', '/api/reconciliation'];
const RESOURCES = ['people', 'families', 'visitors', 'cells', 'cell_members', 'cell_meetings', 'ministries', 'ministry_members',
  'volunteers', 'schedules', 'events', 'transactions', 'bank_accounts', 'payables', 'receivables', 'cost_centers', 'funds',
  'assets', 'maintenance', 'suppliers', 'contracts', 'documents', 'tasks', 'users', 'roles', 'audit_logs', 'checkins'];
const REPORTS = ['membros', 'pessoas', 'visitantes', 'celulas', 'financeiro', 'fluxo', 'prestacao', 'patrimonio', 'pastoral', 'dizimos'];

const endpoints = {}, resources = {}, reports = {};
if (token) {
  for (const p of ENDPOINTS) {
    const r = await api(p, { headers: H });
    if (r.ok) endpoints[p] = r.body; else console.log('   (ignorado)', p, r.status);
  }
  for (const res of RESOURCES) {
    const r = await api(`/api/${res}?limit=${LIMIT}`, { headers: H });
    if (r.ok && r.body && Array.isArray(r.body.data)) {
      resources[res] = { rows: r.body.data, columns: r.body.meta?.columns || null, total: r.body.meta?.total ?? r.body.data.length };
    } else console.log('   (ignorado)', res, r.status);
  }
  for (const k of REPORTS) {
    const r = await api('/api/reports/' + k, { headers: H });
    if (r.ok && r.body) reports[k] = r.body; else console.log('   (ignorado) relatório', k, r.status);
  }
}

/* Contas de demonstração (somente quando existirem no servidor). */
let accounts = [];
if (token) {
  const da = await api('/api/demo/accounts', { headers: H });
  const lista = Array.isArray(da.body) ? da.body : (da.body?.data || []);
  for (const a of lista) {
    const em = a.email || a.usuario || a.user;
    if (!em) continue;
    const l = await api('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: em, password: PASSWORD }) });
    if (l.body?.token) accounts.push({ email: em, name: l.body.user?.name || em, role: l.body.user?.role, user: l.body.user, permissions: l.body.permissions });
  }
}

const snapshot = {
  generated_at: new Date().toISOString(),
  app_version: '3.2.3',
  igreja,
  demo_password: token ? PASSWORD : '',
  endpoints, resources, reports, accounts,
};

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
const copiar = (de, para) => {
  for (const e of fs.readdirSync(de, { withFileTypes: true })) {
    const o = path.join(de, e.name), d = path.join(para, e.name);
    if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copiar(o, d); }
    else fs.copyFileSync(o, d);
  }
};
copiar(path.join(ROOT, 'public'), DIST);
fs.writeFileSync(path.join(DIST, 'config.js'),
  '/* Build estático gerado por npm run build:static — hospedagem sem servidor (somente leitura). */\n' +
  "window.ECLESIA_API_BASE = '';\nwindow.ECLESIA_STATIC_DEMO = true;\n");
fs.writeFileSync(path.join(DIST, 'api-snapshot.json'), JSON.stringify(snapshot));
const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8')
  .replace('<script src="/config.js"></script>', '<script src="/config.js"></script>\n<script src="/js/static-demo.js"></script>');
fs.writeFileSync(path.join(DIST, 'index.html'), html);
fs.writeFileSync(path.join(DIST, '404.html'), html);
console.log(`  dist/ pronto | endpoints: ${Object.keys(endpoints).length} | recursos: ${Object.keys(resources).length} | relatórios: ${Object.keys(reports).length} | contas: ${accounts.length}${token ? '' : '  (retrato vazio)'}`);
console.log(`  api-snapshot.json: ${(fs.statSync(path.join(DIST, 'api-snapshot.json')).size / 1024).toFixed(0)} KB`);
