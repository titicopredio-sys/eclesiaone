/**
 * Smoke test Eclesia One v3.2.1 — prova:
 *  1) MASTER eh seedado automaticamente na subida do servidor (idem de logouts).
 *  2) Login do MASTER funciona e cria Igrejas + Pastor ADM numa so acao.
 *  3) Dados persistem apos logout (continuam no SQLite).
 *  4) Isolamento multi-tenant: Pastor A nao enxerga dados da Igreja B.
 *  5) Tela de login NAO oferece mais criar igreja/usuario (hierarquia fechada).
 *  6) POST /api/users com senha inicial funciona para criar usuarios da equipe.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.SMOKE_PORT || 4321);
const BASE = `http://127.0.0.1:${PORT}`;
const DB_FILE = path.join(ROOT, 'data', 'smoke-eclesia.db');

let pass = 0, fail = 0;
const log = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' :: ' + detail : ''}`); }
};

async function req(method, url, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + url, {
    method, headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

async function main() {
  // Apaga banco para garantir estado limpo (teste de persistencia e idempotencia do seed)
  for (const f of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm']) if (fs.existsSync(f)) fs.unlinkSync(f);

  console.log('Subindo servidor (DB fresh)...');
  const server = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    env: { ...process.env, PORT: String(PORT), DB_FILE, LOG_REQUESTS: 'false', JWT_SECRET: 'smoke-secret' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  server.stdout.on('data', (d) => { serverOutput += String(d); });
  server.stderr.on('data', (d) => { serverOutput += String(d); });
  await new Promise((r) => setTimeout(r, 800));
  await new Promise((r) => setTimeout(r, 400));

  try {
    /* 1. MASTER auto-provisionado ------------------------------------------------------ */
    log('Master aparece no log do servidor',
      /MASTER \(ja provisioned, pronto para login\)/.test(serverOutput),
      'Seed idempotente deveria imprimir credenciais no startup');
    log('Banco detecta master provisionado',
      (await req('GET', '/api/setup/status')).data.has_super === true);
    log('Campo needs_setup = false',
      (await req('GET', '/api/setup/status')).data.needs_setup === false);

    /* 2. LOGIN do MASTER com credenciais fixas --------------------------------------- */
    const login = await req('POST', '/api/auth/login', {
      body: { email: 'thiago@eclesiaapp.com', password: '290369@eclesia' },
    });
    log('Login do MASTER retorna 200 + token', login.status === 200 && !!login.data.token,
      `status=${login.status} err=${login.data.error || ''}`);
    const masterToken = login.data.token;
    const masterMe = await req('GET', '/api/auth/me', { token: masterToken });
    log('MASTER tem role=super_admin e igreja propria',
      masterMe.data.user?.role === 'super_admin' && !!masterMe.data.user.church_id);

    /* 3. Hierarquia fechada: /api/setup esta BLOQUEADO -------------------------------- */
    const setup = await req('POST', '/api/setup', {
      body: { name: 'Igreja Visitante', email: 'visitante@example.com', password: 'abc12345' },
    });
    log('POST /api/setup esta BLOQUEADO (hierarquia fechada)',
      setup.status === 403 || setup.status === 422,
      `status=${setup.status}`);

    /* 4. MASTER cria duas igrejas + Pastor ADM ---------------------------------------- */
    const churchA = await req('POST', '/api/churches', {
      token: masterToken,
      body: { name: 'Igreja Assembleia A', city: 'Sao Paulo', state: 'SP', admin_email: 'pastor.a@igrejaa.org', admin_password: 'PstA@2026', admin_name: 'Pastor A' },
    });
    log('Master cria Igreja A + Pastor ADM', churchA.status === 201 && !!churchA.data.admin,
      `status=${churchA.status} err=${churchA.data.error || ''}`);
    const churchB = await req('POST', '/api/churches', {
      token: masterToken,
      body: { name: 'Igreja Batista B', city: 'Rio de Janeiro', state: 'RJ', admin_email: 'pastor.b@igrejab.org', admin_password: 'PstB@2026', admin_name: 'Pastor B' },
    });
    log('Master cria Igreja B + Pastor ADM', churchB.status === 201 && !!churchB.data.admin);
    log('Lista da rede mostra o Pastor ADM de cada igreja',
      ((await req('GET', '/api/churches', { token: masterToken })).data.data?.find((c) => c.id === churchA.data.church_id)?.admin_email === 'pastor.a@igrejaa.org'));

    /* 5. Cada Pastor ADM entra e so ve a SUA igreja ---------------------------------- */
    const loginA = await req('POST', '/api/auth/login', { body: { email: 'pastor.a@igrejaa.org', password: 'PstA@2026' } });
    const loginB = await req('POST', '/api/auth/login', { body: { email: 'pastor.b@igrejab.org', password: 'PstB@2026' } });
    log('Pastor A entra com suas credenciais', loginA.status === 200 && !!loginA.data.token);
    log('Pastor B entra com suas credenciais', loginB.status === 200 && !!loginB.data.token);
    log('Pastor A esta ligado a Igreja A',
      (await req('GET', '/api/auth/me', { token: loginA.data.token })).data.user?.church_id === churchA.data.church_id);
    log('Pastor B esta ligado a Igreja B',
      (await req('GET', '/api/auth/me', { token: loginB.data.token })).data.user?.church_id === churchB.data.church_id);

    /* 6. Isolamento: Pastor A cadastra pessoa; Pastor B nao ve ------------------------ */
    const peopleA = await req('POST', '/api/people', {
      token: loginA.data.token,
      body: { full_name: 'Maria da Silva A', email: 'maria.a@igrejaa.org', status: 'ativo', join_date: '2026-02-01' },
    });
    log('Pastor A cadastra pessoa na sua igreja', peopleA.status === 201 && peopleA.data.data?.church_id === churchA.data.church_id);
    const peopleA_PastorB = await req('GET', '/api/people', { token: loginB.data.token });
    log('Pastor B nao ve a pessoa cadastrada por Pastor A',
      !peopleA_PastorB.data.data?.some((p) => p.id === peopleA.data.data.id),
      `total visivel para B: ${peopleA_PastorB.data.meta?.total}`);

    /* 7. Ambos cadastram um usuario na equipe --------------------------------------- */
    // (Pastor ADM nao eh cadastrado pela equipe, apenas pelo master via /api/churches -
    //  Pastor ADM cadastra sua equipe via /api/team. Apenas super_admin atribui pastor_adm.)
    const userA = await req('POST', '/api/team', {
      token: loginA.data.token,
      body: { name: 'Secretaria A', email: 'sec.a@igrejaa.org', password: 'SecA@2026', role: 'secretaria', phone: '(11) 90000-0001' },
    });
    log('Pastor A cria Secretaria via /api/team com senha inicial', userA.status === 201 && userA.data.id);
    log('Senha inicial gravada (login com a senha funciona)', (await req('POST', '/api/auth/login', { body: { email: 'sec.a@igrejaa.org', password: 'SecA@2026' } })).status === 200);

    /* 7b. Pagina Usuarios: pastor lista perfis, edita, reseta e desativa ------- */
    const rolesList = await req('GET', '/api/team/roles', { token: loginA.data.token });
    log('Pastor lista perfis disponiveis (pagina Usuarios)', rolesList.status === 200 && rolesList.data.data?.length >= 5, `n=${rolesList.data.data?.length}`);
    const secB = await req('POST', '/api/team', { token: loginA.data.token, body: { name: 'Recepcao B', email: 'rec.b@igrejaa.org', password: 'RecB@2026', role: 'recepcao' } });
    log('Pastor cria segundo usuario (recepcao)', secB.status === 201 && !!secB.data.id, `status=${secB.status}`);
    const editB = await req('POST', `/api/team/${secB.data.id}`, { token: loginA.data.token, body: { name: 'Recepcao B Editada', phone: '(11) 98888-0002' } });
    log('Pastor edita usuario da propria igreja', editB.status === 200, `status=${editB.status}`);
    const otherEdit = await req('POST', `/api/team/${secB.data.id}`, { token: loginB.data.token, body: { name: 'Hackeado' } });
    log('Pastor B NAO consegue editar usuario da igreja A', otherEdit.status === 403 || otherEdit.status === 404, `status=${otherEdit.status}`);
    const resetB = await req('POST', `/api/team/${secB.data.id}/reset-password`, { token: loginA.data.token });
    log('Pastor gera senha provisoria', resetB.status === 200 && !!resetB.data.senha_provisoria, `status=${resetB.status}`);
    log('Login com a senha provisoria funciona', (await req('POST', '/api/auth/login', { body: { email: 'rec.b@igrejaa.org', password: resetB.data.senha_provisoria } })).status === 200);
    const offB = await req('DELETE', `/api/team/${secB.data.id}`, { token: loginA.data.token });
    log('Pastor desativa usuario', offB.status === 200, `status=${offB.status}`);
    log('Usuario desativado nao consegue mais logar', (await req('POST', '/api/auth/login', { body: { email: 'rec.b@igrejaa.org', password: resetB.data.senha_provisoria } })).status === 401);

    /* 8. Pastor B tenta atribuir pastor_adm (deve ser bloqueado) -------------------- */
    const illegal = await req('POST', '/api/team', {
      token: loginB.data.token,
      body: { name: 'Eu Mesmo ADM', email: 'adm.b@igrejab.org', password: 'AdmB@2026', role: 'pastor_adm' },
    });
    log('Atribuir pastor_adm via /api/team eh bloqueado',
      illegal.status === 403, `status=${illegal.status}`);

    /* 9. Persistencia: Pastor B tenta ver a equipe da Igreja A ---------------------- */
    const teamB = await req('GET', '/api/team', { token: loginB.data.token });
    log('Pastor B ve apenas usuarios da Igreja B',
      !teamB.data.data?.some((u) => u.email === 'sec.a@igrejaa.org'));

    /* 10. Persistencia apos restart do servidor (logout = restart) ----------------- */
    console.log('Reiniciando servidor para comprovar persistencia apos logout...');
    server.kill();
    await new Promise((r) => setTimeout(r, 600));
    const server2 = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
      env: { ...process.env, PORT: String(PORT), DB_FILE, LOG_REQUESTS: 'false', JWT_SECRET: 'smoke-secret' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise((r) => setTimeout(r, 1500));

    const stillThere = await req('GET', '/api/team', { token: loginA.data.token });
    // Token do loginA foi assinado com mesmo JWT_SECRET, deveria ser aceito.
    log('Pastor A continua enxergando sua equipe apos restart',
      stillThere.status === 200 && stillThere.data.data?.some((u) => u.email === 'sec.a@igrejaa.org'),
      `status=${stillThere.status} err=${stillThere.data.error || ''}`);
    log('Maria cadastrada por Pastor A segue visivel apos restart',
      ((await req('GET', '/api/people', { token: loginA.data.token })).data.data?.some((p) => p.email === 'maria.a@igrejaa.org')));

    /* 11. Tela de login NAO mostra mais formulario de "primeiro acesso" ------------- */
    const fsCheck = await import('node:fs');
    const appJs = fsCheck.readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8');
    log('Codigo da UI NAO expoe mais formulario de "Primeiro acesso" para criar igreja',
      !appJs.includes("Primeiro acesso") || !appJs.match(/data-setup/i));
    log('Codigo da UI chama APENAS /api/auth/login (sem /api/setup)',
      /\/api\/auth\/login/.test(appJs) && !appJs.includes("'/api/setup'"));
    log('Pagina dedicada "Usuarios" existe (rota + menu + criar/editar/reset/desativar)',
      appJs.includes('function usersPage') && appJs.includes('usuarios:') && appJs.includes('data-new-user') && appJs.includes('reset-password'));
    log('Menu lateral preserva posicao de rolagem (scrollTop + item ativo visivel)',
      appJs.includes('body.scrollTop = prevScroll') && appJs.includes('active.offsetTop'));

    server2.kill();
  } catch (e) {
    fail++;
    console.error('ERRO inesperado:', e.message);
  } finally {
    setTimeout(() => process.exit(fail > 0 ? 1 : 0), 600);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
