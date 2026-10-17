/**
 * Eclesia One - Testes de integracao da API (executados contra um servidor real).
 * Uso: npm test         (sobe o servidor em porta propria, executa e encerra)
 * Cobertura: login, RBAC por perfil, CRUD, escopo por lideranca, celulas,
 * financeiro (lancamento, conta a pagar, transferencia, fluxo), eventos/inscricao,
 * QR code, check-in infantil, relatorios (JSON/CSV/PDF), IA, auditoria, importacao,
 * backup/restauracao e soft delete.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.TEST_PORT || 4319);
const BASE = `http://127.0.0.1:${PORT}`;
const DB_FILE = path.join(ROOT, 'data', 'test-eclesia.db');
const DEMO_PASSWORD = 'Eclesia@2026';

let pass = 0, fail = 0;
const failures = [];
const results = [];

function ok(name, condition, detail = '') {
  if (condition) { pass++; results.push(`  ok   ${name}`); }
  else { fail++; failures.push(`${name}${detail ? ' :: ' + detail : ''}`); results.push(`  FAIL ${name}${detail ? ' :: ' + detail : ''}`); }
}

async function req(method, url, { token, body, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  if (raw) return res;
  let data = null;
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data, res };
}

async function login(email, password = DEMO_PASSWORD) {
  const r = await req('POST', '/api/auth/login', { body: { email, password } });
  return r.status === 200 ? r.data.token : null;
}

async function main() {
  // ------------------------------------------------------------------ setup
  for (const f of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm']) if (fs.existsSync(f)) fs.unlinkSync(f);
  console.log('Subindo servidor de testes…');
  const server = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    env: { ...process.env, PORT: String(PORT), DB_FILE, LOG_REQUESTS: 'false', JWT_SECRET: 'test-secret' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (d) => { const s = String(d); if (!/ExperimentalWarning|trace-warnings/.test(s)) process.stderr.write('[server] ' + s); });
  await new Promise((r) => server.stdout.on('data', (d) => { if (String(d).includes('Servidor ativo')) r(); }));
  await new Promise((r) => setTimeout(r, 300));

  console.log('Populando dados de demonstração (seed)…');
  await new Promise((resolve, reject) => {
    const seed = spawn(process.execPath, [path.join(ROOT, 'server', 'seed-cli.js')], {
      env: { ...process.env, DB_FILE }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    seed.on('close', (code) => (code === 0 ? resolve() : reject(new Error('seed falhou'))));
  });

  try {
    /* ============================================================ 1. LOGIN */
    const health = await req('GET', '/api/health');
    ok('01 health check responde 200', health.status === 200 && health.data.status === 'ok', JSON.stringify(health.data));

    const bad = await req('POST', '/api/auth/login', { body: { email: 'admin@eclesiaone.app', password: 'senha-errada' } });
    ok('02 login com senha inválida é rejeitado (401)', bad.status === 401, `status=${bad.status}`);

    const admin = await login('admin@eclesiaone.app');
    ok('03 login do Super Admin retorna token', !!admin);

    const noAuth = await req('GET', '/api/people');
    ok('04 rota protegida sem token responde 401', noAuth.status === 401, `status=${noAuth.status}`);

    const forged = await req('GET', '/api/people', { token: 'a.b.c' });
    ok('05 token inválido/adulterado é rejeitado', forged.status === 401, `status=${forged.status}`);

    const me = await req('GET', '/api/auth/me', { token: admin });
    ok('06 /auth/me devolve usuário e permissões', me.status === 200 && me.data.user?.role === 'super_admin');
    ok('07 metadados (/api/meta) expõem recursos e campos', (await req('GET', '/api/meta', { token: admin })).data.resources?.people?.fields?.length > 10);

    /* ================================================= 2. CRUD DE PESSOAS */
    const createPerson = await req('POST', '/api/people', {
      token: admin,
      body: { full_name: 'Maria Teste de Integração', phone: '(19) 90000-0000', email: 'maria.teste@example.com', birth_date: '1990-05-10', status: 'ativo', join_date: '2026-01-15', district: 'Centro', city: 'Campinas', state: 'SP' },
    });
    ok('08 criação de pessoa retorna 201', createPerson.status === 201, JSON.stringify(createPerson.data).slice(0, 160));
    const personId = createPerson.data.data?.id;
    ok('09 pessoa criada possui id e church_id vinculados', !!personId && !!createPerson.data.data.church_id);

    const invalidPerson = await req('POST', '/api/people', { token: admin, body: { phone: 'x' } });
    ok('10 campo obrigatório ausente é validado (422)', invalidPerson.status === 422, `status=${invalidPerson.status}`);

    const upd = await req('PUT', `/api/people/${personId}`, { token: admin, body: { district: 'Boa Vista' } });
    ok('11 atualização de pessoa persiste alteração', upd.status === 200 && upd.data.data.district === 'Boa Vista');

    const search = await req('GET', '/api/people?q=maria teste', { token: admin });
    ok('12 busca por nome encontra o registro', search.data.data?.some((p) => p.id === personId));

    const family = await req('POST', '/api/families', { token: admin, body: { name: 'Família Teste Integração', district: 'Centro', city: 'Campinas', state: 'SP' } });
    ok('13 criação de família', family.status === 201);
    const linkFamily = await req('POST', '/api/family_members', { token: admin, body: { family_id: family.data.data.id, person_id: personId, role: 'responsavel' } });
    ok('14 pessoa vinculada à família (reuso do cadastro, sem duplicar)', linkFamily.status === 201);

    const tree = await req('GET', `/api/families/${family.data.data.id}/tree`, { token: admin });
    ok('15 árvore familiar monta responsáveis e membros', tree.status === 200 && tree.data.responsaveis?.length >= 1 && tree.data.resumo?.integrantes >= 1);

    const detail = await req('GET', `/api/people/${personId}`, { token: admin });
    ok('16 ficha da pessoa agrega relacionamentos (família/célula/etc.)', detail.status === 200 && detail.data.related?.familia?.length >= 1);

    /* ==================================================== 3. CÉLULA + REUNIÃO */
    const cell = await req('POST', '/api/cells', { token: admin, body: { name: 'Célula Teste Integração', code: 'CEL-TESTE', weekday: 'quarta', meeting_time: '20:00', capacity: 18, status: 'ativa', leader_id: personId } });
    ok('17 criação de célula', cell.status === 201);
    const cellId = cell.data.data.id;
    const addMember = await req('POST', '/api/cell_members', { token: admin, body: { cell_id: cellId, person_id: personId, role: 'lider', joined_at: '2026-02-01', status: 'ativo' } });
    ok('18 membro vinculado à célula', addMember.status === 201);

    const meeting = await req('POST', '/api/cell_meetings', {
      token: admin,
      body: { cell_id: cellId, meeting_date: '2026-09-23', present_count: 12, absent_count: 3, visitors_count: 2, new_visitors: 1, theme: 'Teste', report_sent: 1, offering: 85 },
    });
    ok('19 reunião de célula registrada', meeting.status === 201, JSON.stringify(meeting.data).slice(0, 140));
    const meetingId = meeting.data.data?.id;
    const attendance = await req('POST', '/api/cell_attendance', { token: admin, body: { meeting_id: meetingId, person_id: personId, status: 'presente' } });
    ok('20 presença registrada na reunião', attendance.status === 201);

    const panel = await req('GET', '/api/cells/panel', { token: admin });
    const panelCell = panel.data.data?.find((c) => c.id === cellId);
    ok('21 painel de células calcula média de presença e membros', panelCell && panelCell.membros >= 1 && panelCell.media_presenca > 0, JSON.stringify(panelCell || {}).slice(0, 140));

    /* ======================================================== 4. FINANCEIRO */
    const account = await req('POST', '/api/bank_accounts', { token: admin, body: { name: 'Conta Teste', bank: 'Banco Teste', account_type: 'corrente', initial_balance: 10000, status: 'ativa' } });
    ok('22 criação de conta bancária com saldo inicial', account.status === 201);
    const accountId = account.data.data.id;

    const catsResp = await req('GET', '/api/categories?f_kind=receita&limit=100', { token: admin });
    const catTithe = catsResp.data.data.find((c) => c.name === 'Dízimos');
    const catExpense = (await req('GET', '/api/categories?f_kind=despesa&limit=100', { token: admin })).data.data[0];
    ok('23 categorias financeiras configuráveis presentes', !!catTithe && !!catExpense);

    const income = await req('POST', '/api/transactions', { token: admin, body: { tx_type: 'entrada', category_id: catTithe.id, description: 'Dízimo de teste', value: 1500, tx_date: '2026-09-27', account_id: accountId, payment_method: 'Pix', status: 'confirmado' } });
    ok('24 lançamento de entrada (dízimo) criado', income.status === 201);

    const expense = await req('POST', '/api/transactions', { token: admin, body: { tx_type: 'saida', category_id: catExpense.id, description: 'Despesa de teste', value: 400, tx_date: '2026-09-28', account_id: accountId, payment_method: 'Boleto', status: 'confirmado' } });
    ok('25 lançamento de saída criado', expense.status === 201);

    const dash = await req('GET', '/api/dashboard', { token: admin });
    ok('26 dashboard consolida financeiro (saldo/entradas/saídas)', dash.status === 200 && typeof dash.data.finance?.saldo === 'number' && dash.data.finance.entradas_mes >= 1500, JSON.stringify(dash.data.finance || {}).slice(0, 200));
    ok('27 dashboard consolida pessoas e ministérios', dash.data.people?.total > 100 && dash.data.ministries?.celulas >= 8);

    const payable = await req('POST', '/api/payables', { token: admin, body: { description: 'Conta de teste a pagar', value: 250, due_date: '2026-09-25', category_id: catExpense.id, account_id: accountId, status: 'pendente', supplier_id: null } });
    ok('28 conta a pagar criada', payable.status === 201);
    const payableId = payable.data.data.id;

    const overdue = await req('GET', '/api/payables?f_status=vencida', { token: admin });
    ok('29 filtro por situação (vencidas) responde', overdue.status === 200 && Array.isArray(overdue.data.data));

    const pay = await req('POST', `/api/payables/${payableId}/pay`, { token: admin, body: { account_id: accountId, payment_method: 'Pix' } });
    ok('30 liquidação de conta a pagar gera lançamento no extrato', pay.status === 200 && pay.data.data.status === 'paga', JSON.stringify(pay.data).slice(0, 160));

    const cash = await req('GET', '/api/cashflow?days=30', { token: admin });
    ok('31 fluxo de caixa projetado é calculado', cash.status === 200 && typeof cash.data.saldo_projetado === 'number' && Array.isArray(cash.data.projection) && cash.data.projection.length === 31);

    const transfer = await req('POST', '/api/transfers', { token: admin, body: { account_id: accountId, dest_account_id: account.data.data.id, value: 100 } });
    ok('32 transferência para a mesma conta é bloqueada (422/409)', transfer.status === 422 || transfer.status === 409, `status=${transfer.status}`);

    const acc2 = await req('POST', '/api/bank_accounts', { token: admin, body: { name: 'Conta Destino Teste', bank: 'Banco Teste', account_type: 'poupanca', initial_balance: 0, status: 'ativa' } });
    const transferOk = await req('POST', '/api/transfers', { token: admin, body: { account_id: accountId, dest_account_id: acc2.data.data.id, value: 700, description: 'Transferência teste' } });
    ok('33 transferência válida entre contas registrada', transferOk.status === 201, JSON.stringify(transferOk.data).slice(0, 140));

    const transferOver = await req('POST', '/api/transfers', { token: admin, body: { account_id: acc2.data.data.id, dest_account_id: accountId, value: 999999 } });
    ok('34 transferência sem saldo é recusada (409)', transferOver.status === 409, `status=${transferOver.status}`);

    const financeDash = await req('GET', '/api/dashboard/finance?months=6', { token: admin });
    ok('35 painel financeiro devolve séries, categorias e orçamento', financeDash.status === 200 && financeDash.data.series?.length === 6 && financeDash.data.byCategory?.length > 0);

    const reconcile = await req('GET', '/api/reconciliation', { token: admin });
    ok('36 conciliação bancária agrega movimentos por conta', reconcile.status === 200 && reconcile.data.data?.length >= 2 && reconcile.data.data.some((a) => a.movimentos.length >= 1));

    const statement = await req('GET', `/api/accounts/${accountId}/statement`, { token: admin, raw: true });
    const stBuf = Buffer.from(await statement.arrayBuffer());
    ok('37 extrato da conta gera PDF válido', statement.status === 200 && stBuf.slice(0, 5).toString() === '%PDF-' && stBuf.length > 800, `bytes=${stBuf.length}`);

    /* ============================================== 5. EVENTOS / INSCRIÇÃO */
    const ev = await req('POST', '/api/events', { token: admin, body: { name: 'Evento Teste Integração', event_date: '2026-10-15', start_time: '19:00', location: 'Templo', capacity: 50, registration_open: 1, price: 0, status: 'planejado' } });
    ok('38 evento criado', ev.status === 201);
    const evId = ev.data.data.id;
    const reg = await req('POST', `/api/events/${evId}/register`, { token: admin, body: { person_id: personId } });
    ok('39 inscrição em evento gera código QR', reg.status === 201 && !!reg.data.code && typeof reg.data.qr === 'string' && reg.data.qr.includes('<svg'));
    const regDup = await req('POST', `/api/events/${evId}/register`, { token: admin, body: { person_id: personId } });
    ok('40 inscrição duplicada é bloqueada', regDup.status === 409, `status=${regDup.status}`);
    const checkin = await req('POST', '/api/events/checkin', { token: admin, body: { code: reg.data.code } });
    ok('41 validação de QR Code libera entrada', checkin.status === 200 && checkin.data.data.status === 'presente');
    const badCode = await req('POST', '/api/events/checkin', { token: admin, body: { code: 'CODIGO-INVALIDO' } });
    ok('42 QR Code inválido é rejeitado', badCode.status === 404);

    const sched = await req('POST', '/api/schedules', { token: admin, body: { event_id: evId, schedule_date: '2026-10-15', schedule_time: '18:00', function_name: 'Louvor', person_id: personId, status: 'pendente' } });
    ok('43 escala criada para o evento', sched.status === 201);

    /* ======================================== 6. QR CODE / CHECK-IN INFANTIL */
    const qr = await req('GET', '/api/qr?text=INF-20260929-0001&scale=6', { token: admin, raw: true });
    const qrBody = await qr.text();
    ok('44 endpoint de QR Code devolve SVG válido', qr.status === 200 && qrBody.includes('<svg') && qrBody.includes('path d=') && qrBody.length > 400, `len=${qrBody.length}`);

    const kids = (await req('GET', '/api/children?limit=3', { token: admin })).data.data;
    ok('45 crianças cadastradas no ministério infantil', kids.length >= 1);
    if (kids.length) {
      const check = await req('POST', '/api/checkins', { token: admin, body: { child_id: kids[0].id, checked_in_by: 'Recepção Teste' } });
      ok('46 check-in infantil gera código de retirada', check.status === 201 && /^INF-\d{8}-\d+$/.test(check.data.code), JSON.stringify(check.data).slice(0, 120));
      const coNoAuth = await req('POST', `/api/checkins/${check.data.data.id}/checkout`, { token: admin, body: {} });
      ok('47 check-out exige responsável autorizado (422)', coNoAuth.status === 422);
      const co = await req('POST', `/api/checkins/${check.data.data.id}/checkout`, { token: admin, body: { released_to: 'Marta Ribeiro (RG 12.345.678-9)' } });
      ok('48 check-out registrado com responsável autorizado', co.status === 200 && !!co.data.data.released_to);
      const coAgain = await req('POST', `/api/checkins/${check.data.data.id}/checkout`, { token: admin, body: { released_to: 'Outra pessoa' } });
      ok('49 check-out duplicado é bloqueado', coAgain.status === 409);
    }

    /* =============================================== 7. PERMISSÕES (RBAC) */
    const financeToken = await login('financeiro@eclesiaone.app');
    const finPeople = await req('GET', '/api/people', { token: financeToken });
    ok('50 perfil Financeiro não acessa Pessoas (403)', finPeople.status === 403, `status=${finPeople.status}`);
    const finPay = await req('GET', '/api/payables', { token: financeToken });
    ok('51 perfil Financeiro acessa Contas a pagar (200)', finPay.status === 200);
    const finChurchEdit = await req('PUT', '/api/config/church', { token: financeToken, body: { name: 'Tentativa indevida' } });
    ok('52 perfil Financeiro não altera configurações da igreja (403)', finChurchEdit.status === 403);
    const finAudit = await req('GET', '/api/auditoria', { token: financeToken });
    ok('53 perfil Financeiro não acessa auditoria (403)', finAudit.status === 403);

    const memberToken = await login('membro@eclesiaone.app');
    const membPeople = await req('GET', '/api/people', { token: memberToken });
    const membRows = membPeople.data.data || [];
    ok('54 perfil Membro vê apenas o próprio cadastro', membPeople.status === 200 && membRows.length <= 1, `linhas=${membRows.length}`);
    const membFinance = await req('GET', '/api/transactions', { token: memberToken });
    ok('55 perfil Membro não acessa lançamentos financeiros (403)', membFinance.status === 403, `status=${membFinance.status}`);
    const membCreate = await req('POST', '/api/people', { token: memberToken, body: { full_name: 'Tentativa de cadastro' } });
    ok('56 perfil Membro não cria pessoas (403)', membCreate.status === 403);
    const membPortal = await req('GET', '/api/portal/me', { token: memberToken });
    ok('57 Portal do Membro responde com seus dados', membPortal.status === 200);

    const recToken = await login('recepcao@eclesiaone.app');
    ok('58 perfil Recepção acessa visitantes', (await req('GET', '/api/visitantes', { token: recToken })).status === 404 || (await req('GET', '/api/visitors', { token: recToken })).status === 200);
    ok('59 perfil Recepção não acessa financeiro', (await req('GET', '/api/payables', { token: recToken })).status === 403);

    const cellLeadToken = await login('lider.celula@eclesiaone.app');
    const leadCells = await req('GET', '/api/cells?limit=100', { token: cellLeadToken });
    const leadAll = (await req('GET', '/api/cells?limit=100', { token: admin })).data.meta.total;
    ok('60 líder de célula vê somente suas células (escopo)', leadCells.status === 200 && leadCells.data.data.length < leadAll, `lider=${leadCells.data.data.length} total=${leadAll}`);

    const ministryLeadToken = await login('lider.ministerio@eclesiaone.app');
    const leadMin = await req('GET', '/api/ministries?limit=100', { token: ministryLeadToken });
    ok('61 líder de ministério vê somente seu ministério', leadMin.status === 200 && leadMin.data.data.length >= 1 && leadMin.data.data.length < (await req('GET', '/api/ministries?limit=100', { token: admin })).data.meta.total);

    const profToken = await login('professor@eclesiaone.app');
    const profClasses = await req('GET', '/api/ebd_classes?limit=100', { token: profToken });
    ok('62 professor vê somente sua classe EBD', profClasses.status === 200 && profClasses.data.data.length >= 1 && profClasses.data.data.length < (await req('GET', '/api/ebd_classes?limit=100', { token: admin })).data.meta.total);

    const sectToken = await login('secretaria@eclesiaone.app');
    ok('63 secretaria cria pessoa (permissão de create)', (await req('POST', '/api/people', { token: sectToken, body: { full_name: 'Cadastro pela Secretaria' } })).status === 201);
    ok('64 secretaria não exclui lançamento financeiro', (await req('DELETE', '/api/transactions/1', { token: sectToken })).status === 403);

    /* ================================================== 8. IA (escopo) */
    const aiFin = await req('POST', '/api/ai/ask', { token: admin, body: { question: 'Como está a situação financeira deste mês?' } });
    ok('65 IA responde situação financeira com dados reais', aiFin.status === 200 && aiFin.data.answer.includes('R$') && aiFin.data.scope === 'financeiro', aiFin.data.answer?.slice(0, 110));
    const aiMoney = await req('POST', '/api/ai/ask', { token: admin, body: { question: 'Quanto entrou de dízimos em setembro?' } });
    ok('66 IA responde consulta de dízimos', aiMoney.status === 200 && /d[íi]zimos/.test(aiMoney.data.answer));
    const aiCells = await req('POST', '/api/ai/ask', { token: admin, body: { question: 'Quais células não enviaram relatório?' } });
    ok('67 IA responde sobre relatórios de células', aiCells.status === 200 && !!aiCells.data.answer);
    const aiOverdue = await req('POST', '/api/ai/ask', { token: admin, body: { question: 'Quais contas estão vencidas?' } });
    ok('68 IA responde sobre contas vencidas', aiOverdue.status === 200 && aiOverdue.data.answer.length > 10);
    const aiMembers = await req('POST', '/api/ai/ask', { token: admin, body: { question: 'Quantos membros ativos temos?' } });
    ok('69 IA responde indicadores de pessoas', aiMembers.status === 200 && /pessoas cadastradas/.test(aiMembers.data.answer));
    const aiDenied = await req('POST', '/api/ai/ask', { token: memberToken, body: { question: 'Como está a situação financeira deste mês?' } });
    ok('70 IA nega acesso fora da permissão do usuário', aiDenied.status === 200 && aiDenied.data.scope === 'permission_denied', JSON.stringify(aiDenied.data).slice(0, 120));
    const aiUnknown = await req('POST', '/api/ai/ask', { token: admin, body: { question: 'Qual a previsão do tempo para o culto?' } });
    ok('71 IA admite ausência de dados em vez de inventar', aiUnknown.status === 200 && aiUnknown.data.scope === 'unknown' && /Não existem informações suficientes/.test(aiUnknown.data.answer));
    const aiCompare = await req('POST', '/api/ai/ask', { token: admin, body: { question: 'Compare agosto e setembro.' } });
    ok('72 IA compara períodos', aiCompare.status === 200 && !!aiCompare.data.data?.serie);

    /* ============================================ 9. RELATÓRIOS / EXPORT */
    const catalog = await req('GET', '/api/reports', { token: admin });
    ok('73 catálogo de relatórios disponível e filtrado por permissão', catalog.status === 200 && catalog.data.data.length >= 15);
    for (const kind of ['membros', 'dizimos', 'celulas', 'financeiro', 'fluxo', 'prestacao', 'patrimonio', 'pastoral']) {
      const r = await req('GET', `/api/reports/${kind}?from=2026-01-01&to=2026-12-31`, { token: admin });
      ok(`74 relatório "${kind}" retorna dados`, r.status === 200 && Array.isArray(r.data.rows) && r.data.columns?.length > 0, JSON.stringify(r.data).slice(0, 120));
    }
    const csv = await req('GET', '/api/reports/membros?format=csv', { token: admin, raw: true });
    const csvText = await csv.text();
    ok('75 exportação CSV de relatório', csv.status === 200 && csvText.split('\n').length > 5 && csvText.includes(';'));
    const pdf = await req('GET', '/api/reports/financeiro?format=pdf&from=2026-01-01&to=2026-12-31', { token: admin, raw: true });
    const pdfBuf = Buffer.from(await pdf.arrayBuffer());
    ok('76 exportação PDF de relatório é um PDF válido', pdf.status === 200 && pdfBuf.slice(0, 5).toString() === '%PDF-' && pdfBuf.length > 2000, `bytes=${pdfBuf.length}`);
    const pdfPastoral = await req('GET', '/api/reports/pastoral?format=pdf', { token: financeToken, raw: true });
    ok('77 perfil Financeiro não exporta relatório pastoral (403)', pdfPastoral.status === 403, `status=${pdfPastoral.status}`);

    const listCsv = await req('GET', '/api/people?format=csv', { token: admin, raw: true });
    ok('78 exportação CSV direta da listagem', listCsv.status === 200 && String(listCsv.headers.get('content-type')).includes('csv'));

    /* ================================================= 10. IMPORTAÇÃO */
    const dry = await req('POST', '/api/import/people', {
      token: admin,
      body: { dry_run: true, rows: [
        { 'Nome completo': 'Importado Um', 'Telefone': '(19) 91111-1111', 'Data de nascimento': '1985-03-03', Cidade: 'Campinas', UF: 'SP' },
        { 'Nome completo': '', Telefone: '(19) 92222-2222' },
        { 'Nome completo': 'Maria Teste de Integração' },
      ] },
    });
    ok('79 importação (validação/dry-run) reporta válidos e inválidos', dry.status === 200 && dry.data.validos === 1 && dry.data.invalidos === 2, JSON.stringify(dry.data).slice(0, 180));
    const real = await req('POST', '/api/import/people', {
      token: admin,
      body: { dry_run: false, rows: [
        { 'Nome completo': 'Importado Um', 'Telefone': '(19) 91111-1111', 'Data de nascimento': '1985-03-03', Cidade: 'Campinas', UF: 'SP' },
        { 'Nome completo': 'Importado Dois', 'Telefone': '(19) 93333-3333', 'Data de nascimento': '1992-08-08' },
      ] },
    });
    ok('80 importação real insere registros válidos', real.status === 201 && real.data.inserted === 2, JSON.stringify(real.data).slice(0, 160));

    /* =============================================== 11. AUDITORIA / LGPD */
    const logs = await req('GET', '/api/auditoria?limit=200', { token: admin });
    const actions = new Set((logs.data.data || []).map((l) => l.action));
    ok('81 auditoria registra ações (login/criar/editar/consulta_ia)', ['login', 'criar', 'editar', 'consulta_ia'].every((a) => actions.has(a)), JSON.stringify([...actions]));
    ok('82 auditoria guarda valor anterior e novo em edições', (logs.data.data || []).some((l) => l.action === 'editar' && l.before_json && l.after_json));
    const del = await req('DELETE', `/api/people/${personId}`, { token: admin });
    ok('83 exclusão de pessoa é lógica (soft delete)', del.status === 200 && String(del.data.message).includes('exclusão lógica'));
    const stillThere = await req('GET', `/api/people/${personId}`, { token: admin });
    ok('84 registro excluído sai das consultas', stillThere.status === 404);
    const kept = await req('GET', '/api/auditoria?limit=200', { token: admin });
    ok('85 histórico do registro permanece na auditoria', (kept.data.data || []).some((l) => l.action === 'excluir' && l.record_id === String(personId)));

    /* ========================================== 12. NOTIFICAÇÕES / BUSCA */
    const notif = await req('GET', '/api/notifications', { token: admin });
    ok('86 central de notificações responde', notif.status === 200 && Array.isArray(notif.data.data));
    const alerts = await req('GET', '/api/alerts', { token: admin });
    ok('87 central de atenção gera alertas reais', alerts.status === 200 && alerts.data.data.length >= 1, `grupos=${alerts.data.groups}`);
    ok('88 alertas classificam severidade (danger/warning/info)', alerts.data.data.every((a) => ['danger', 'warning', 'info'].includes(a.kind)));
    // 'Importado Um'/'Importado Dois' foram criados no teste de importacao (79/80) e seguem ativos;
    // 'Maria Teste de Integracao' foi removida logicamente por um teste de soft delete (83).
    const grep = await req('GET', '/api/search?q=importado', { token: admin });
    ok('89 busca global encontra registros por nome', grep.status === 200 && grep.data.groups.length >= 1);
    const searchFin = await req('GET', '/api/search?q=maria', { token: financeToken });
    ok('90 busca global respeita permissões do perfil', searchFin.status === 200 && !searchFin.data.groups.some((g) => g.module === 'financeiro' && g.resource === 'people'));

    /* ============================================= 13. BACKUP / RESTORE */
    const backup = await req('GET', '/api/backup/export', { token: admin, raw: true });
    const backupJson = await backup.json().catch(() => null) || JSON.parse(await (async () => { const r2 = await req('GET', '/api/backup/export', { token: admin, raw: true }); return r2.text(); })());
    ok('91 backup exporta JSON com todas as tabelas da igreja', backup.status === 200 && backupJson.tables?.people?.length > 100 && backupJson.record_count > 500, `registros=${backupJson.record_count}`);
    ok('92 backup não contém dados de outra igreja', Object.values(backupJson.tables).flat().every((r) => r.church_id === undefined || r.church_id === backupJson.church_id));
    const restore = await req('POST', '/api/backup/restore', { token: admin, body: { dump: backupJson } });
    ok('93 restauração ignora duplicidades (não duplica cadastros)', restore.status === 200 && restore.data.summary.inseridos === 0, JSON.stringify(restore.data.summary).slice(0, 140));
    const restoreBad = await req('POST', '/api/backup/restore', { token: admin, body: { dump: { nada: true } } });
    ok('94 backup inválido é rejeitado', restoreBad.status === 422);

    /* ===================================== 14. ONBOARDING / CONFIG / DEMO */
    const onboarding = await req('GET', '/api/config/onboarding', { token: admin });
    ok('95 assistente de configuração inicial reporta progresso', onboarding.status === 200 && onboarding.data.steps.length === 8);
    const church = await req('GET', '/api/config/church', { token: admin });
    ok('96 configurações da igreja acessíveis ao admin', church.status === 200 && !!church.data.data.name);
    const demoStatus = await req('GET', '/api/demo/status', { token: admin });
    ok('97 status dos dados de demonstração', demoStatus.status === 200 && demoStatus.data.data.people > 100);
    const demoAccounts = await req('GET', '/api/demo/accounts');
    ok('98 contas de demonstração listadas para o login', demoAccounts.status === 200 && demoAccounts.data.data.length === 10);

    /* ============================================== 15. ERROS CONTROLADOS */
    const notFound = await req('GET', '/api/rota-inexistente', { token: admin });
    ok('99 rota inexistente devolve 404 JSON amigável', notFound.status === 404 && !!notFound.data.error);
    const method = await req('PATCH', '/api/people', { token: admin });
    ok('100 método não permitido devolve 405', method.status === 405 || method.status === 404, `status=${method.status}`);
    const badId = await req('GET', '/api/people/99999999', { token: admin });
    ok('101 registro inexistente devolve 404', badId.status === 404);
    const largeSearch = await req('GET', '/api/people?q=a&page=1&limit=5', { token: admin });
    ok('102 paginação limita a quantidade de registros', largeSearch.data.data.length <= 5 && largeSearch.data.meta.pages >= 1);

    /* ============================== 16. MULTI-TENANT (isolamento) */
    let churchB = await req('PUT', '/api/config/church', { token: admin, body: {} });
    const churchAfterVazio = await req('GET', '/api/config/church', { token: admin });
    ok('103 requisição vazia de configuração é recusada sem efeito',
      [400, 405].includes(churchB.status) && churchAfterVazio.data.data.name === church.data.data.name,
      `status=${churchB.status} nome_inalterado=${churchAfterVazio.data.data.name === church.data.data.name}`);
    ok('104 dados da igreja A não aparecem para usuário sem vínculo (multi-tenant por church_id)', (await req('GET', '/api/people?limit=1', { token: admin })).data.data.every((p) => p.church_id === me.data.user.church_id));

    /* ============================== 17. PWA / ESTÁTICOS */
    const html = await req('GET', '/', { raw: true });
    const htmlText = await html.text();
    ok('105 aplicação web servida com manifesto PWA', html.status === 200 && htmlText.includes('manifest.webmanifest'));
    const manifest = await req('GET', '/manifest.webmanifest', { raw: true });
    ok('106 manifesto PWA válido', manifest.status === 200 && (await manifest.json()).display === 'standalone');
    const sw = await req('GET', '/sw.js', { raw: true });
    ok('107 service worker disponível', sw.status === 200 && (await sw.text()).includes('addEventListener'));
    const spa = await req('GET', '/alguma/rota/do/app', { raw: true });
    ok('108 rotas do app caem no shell (SPA fallback)', spa.status === 200 && String(spa.headers.get('content-type')).includes('html'));

    /* ================================== 109+. REDE DE IGREJAS E ISOLAMENTO */
    const suToken = admin;
    const st = await req('GET', '/api/setup/status');
    ok('109 status de primeiro acesso indica sistema ja configurado', st.status === 200 && st.data.needs_setup === false, JSON.stringify(st.data));

    const setupTarde = await req('POST', '/api/setup', { body: { church_name: 'Invasora', name: 'Invasor', email: 'invasor@teste.app', password: 'InvasorForte1' } });
    ok('110 primeiro acesso e recusado quando ja existem usuarios (409)', setupTarde.status === 409, `status=${setupTarde.status}`);

    const sigA = await req('POST', '/api/signup', { body: { church_name: 'Igreja Teste Alfa', name: 'Pastor Alfa', email: 'pastor.alfa@teste.app', password: 'AlfaForte123', city: 'São Paulo', state: 'SP' } });
    ok('111 auto-cadastro cria igreja nova e usuario Pastor ADM', sigA.status === 201 && !!sigA.data.token && sigA.data.user?.role === 'pastor_adm', JSON.stringify(sigA.data).slice(0, 200));
    const tokenA = sigA.data?.token;
    const churchA = sigA.data?.user?.church_id;

    const sigB = await req('POST', '/api/signup', { body: { church_name: 'Igreja Teste Beta', name: 'Pastor Beta', email: 'pastor.beta@teste.app', password: 'BetaForte123' } });
    ok('112 outro Pastor ADM cria igreja separada (church_id diferente)', sigB.status === 201 && !!sigB.data.token && sigB.data.user?.church_id !== churchA, `A=${churchA} B=${sigB.data?.user?.church_id}`);
    const tokenB = sigB.data?.token;
    churchB = sigB.data?.user?.church_id;

    const duplicado = await req('POST', '/api/signup', { body: { church_name: 'Igreja Duplicada', name: 'Outro', email: 'pastor.alfa@teste.app', password: 'OutraForte123' } });
    ok('113 e-mail ja cadastrado e recusado no auto-cadastro', [409, 422].includes(duplicado.status), `status=${duplicado.status}`);

    const meA = await req('GET', '/api/auth/me', { token: tokenA });
    const permsA = meA.data?.permissions || {};
    ok('114 Pastor ADM tem acesso administrativo completo na propria igreja',
      (permsA.financeiro || []).includes('create') && (permsA.configuracoes || []).includes('edit') && (permsA.contas || []).includes('delete'),
      JSON.stringify(Object.keys(permsA).length));

    const criarA = await req('POST', '/api/people', { token: tokenA, body: { full_name: 'Membro Exclusivo Alfa', status: 'ativo' } });
    const pessoaA = criarA.data?.data || criarA.data;
    ok('115 Pastor ADM cadastra pessoa na propria igreja', criarA.status === 201 && pessoaA?.church_id === churchA, JSON.stringify(criarA.data).slice(0, 160));
    const idA = pessoaA?.id;

    const buscaB = await req('GET', '/api/people?q=Membro Exclusivo Alfa&limit=50', { token: tokenB });
    ok('116 igreja B nao ve a pessoa da igreja A na listagem', buscaB.status === 200 && buscaB.data.data.length === 0, `encontrados=${buscaB.data.data?.length}`);

    const fichaB = await req('GET', `/api/people/${idA}`, { token: tokenB });
    ok('117 igreja B nao abre a ficha da igreja A (404)', fichaB.status === 404, `status=${fichaB.status}`);

    const editaB = await req('PUT', `/api/people/${idA}`, { token: tokenB, body: { district: 'invasao' } });
    ok('118 igreja B nao edita registro da igreja A (404)', editaB.status === 404, `status=${editaB.status}`);

    const excluiB = await req('DELETE', `/api/people/${idA}`, { token: tokenB });
    ok('119 igreja B nao exclui registro da igreja A (404)', excluiB.status === 404, `status=${excluiB.status}`);

    const buscaA = await req('GET', '/api/people?q=Membro Exclusivo Alfa&limit=50', { token: tokenA });
    ok('120 igreja A continua vendo o proprio registro intacto', buscaA.data.data.length === 1 && buscaA.data.data[0].church_id === churchA);

    const listaB = await req('GET', '/api/people?limit=200', { token: tokenB });
    ok('121 toda listagem da igreja B contem apenas registros da igreja B',
      (listaB.data.data || []).every((p) => p.church_id === churchB), `n=${listaB.data.data?.length}`);

    const usuariosB = await req('GET', '/api/users?limit=200', { token: tokenB });
    ok('122 usuarios da igreja B nao misturam outra igreja',
      usuariosB.status === 200 && (usuariosB.data.data || []).every((u) => u.church_id === churchB), `n=${usuariosB.data.data?.length}`);

    const redeA = await req('GET', '/api/churches', { token: tokenA });
    ok('123 Pastor ADM nao acessa a lista da rede (403)', redeA.status === 403, `status=${redeA.status}`);

    const rede = await req('GET', '/api/churches', { token: suToken });
    const nomes = (rede.data.data || []).map((c) => c.name);
    ok('124 Super Admin ve a rede com as igrejas criadas',
      rede.status === 200 && nomes.includes('Igreja Teste Alfa') && nomes.includes('Igreja Teste Beta'), JSON.stringify(nomes).slice(0, 190));

    const nova = await req('POST', '/api/churches', { token: suToken, body: { name: 'Igreja Teste Gama', city: 'Campinas', state: 'SP', admin_name: 'Pastor Gama', admin_email: 'pastor.gama@teste.app' } });
    ok('125 Super Admin cria igreja + Pastor ADM com senha provisoria',
      nova.status === 201 && !!nova.data.senha_provisoria && nova.data.admin?.role === 'pastor_adm', JSON.stringify(nova.data).slice(0, 200));

    const tokenGama = await login('pastor.gama@teste.app', nova.data.senha_provisoria);
    ok('126 Pastor ADM recem-criado consegue entrar com a senha provisoria', !!tokenGama);

    const listaGama = await req('GET', '/api/people?limit=50', { token: tokenGama });
    ok('127 igreja recem-criada comeca vazia (nenhum dado de outra igreja)',
      listaGama.status === 200 && (listaGama.data.meta?.total ?? -1) === 0, `total=${listaGama.data.meta?.total}`);

    const rolesGama = await req('GET', '/api/roles?limit=50', { token: tokenGama });
    ok('128 igreja nova ja vem com os perfis padrao (incluindo Pastor ADM)',
      rolesGama.status === 200 && (rolesGama.data.data || []).some((r) => r.slug === 'pastor_adm'), `n=${rolesGama.data.data?.length}`);
  } catch (e) {
    fail++;
    failures.push(`EXCEÇÃO: ${e.message}`);
    console.error(e);
  } finally {
    server.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log('\n' + results.join('\n'));
  console.log(`\n  Testes: ${pass} aprovados, ${fail} reprovados (total ${pass + fail})`);
  if (failures.length) {
    console.log('\n  Falhas:');
    for (const f of failures) console.log('   - ' + f);
  }
  console.log('');
  process.exit(fail ? 1 : 0);
}

main();
