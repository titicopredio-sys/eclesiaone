/* ============================================================================
   Eclesia One — núcleo do aplicativo (v1.1.0)
   Responsabilidades: autenticação, shell (menu lateral + barra superior),
   roteador por hash, paleta de busca global, central de notificações e
   registro do service worker.
   Nenhum dado é fictício: toda tela consome a API real e o servidor revalida
   todas as permissões (RBAC) em cada requisição.
   ========================================================================== */
import {
  state, api, apiUrl, setToken, icon, esc, toast, modal, confirmDialog, can, initials, num, dt, dtTime,
  metricCard, loadingBlock, RES_KEY_ALIAS,
} from './ui.js';
import {
  resourcePage, dashboardPage, alertsPage, financeDashboard, ministryDashboard,
  reportsPage, cashflowPage, transfersPage, reconciliationPage, agendaPage, aiPage,
  portalPage, checkinPage, assetsPage, settingsPage, permissionsPage, cellsPanelPage,
  finConfigPage, analyticsPage, keysPage, renderSoon, renderError, renderForbidden,
} from './modules.js';

const APP_VERSION = '3.2.3';

/* Oculta qualquer referencia residual ao wizard de primeiro acesso. */
Object.assign(window, { ECLESIA_FORCE_LOGIN_FIRST: true });
const $ = (id) => document.getElementById(id);
const slugify = (s) => String(s || '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/* ------------------------------- rotas canônicas e páginas especiais */
const ROUTE_OF_RESOURCE = {
  payables: 'contas-a-pagar', receivables: 'contas-a-receber', transactions: 'lancamentos',
  cost_centers: 'centros-de-custo', assets: 'patrimonio', maintenance: 'manutencoes',
  cell_meetings: 'reunioes-de-celula', cell_members: 'membros-de-celula',
  child_checkins: 'check-ins', documents: 'docs', audit_logs: 'log-de-auditoria',
};
const routeOf = (key) => ROUTE_OF_RESOURCE[key] || RES_KEY_ALIAS[key] || slugify(key);

const PAGES = {
  igrejas: { page: churchesPage, module: 'configuracoes', superOnly: true, title: 'Igrejas da rede', icon: 'building' },
  usuarios: { page: usersPage, module: 'configuracoes', title: 'Usuários', icon: 'shield' },
  dashboard: { page: dashboardPage, module: 'relatorios', title: 'Visão da Igreja', icon: 'dashboard' },
  alertas: { page: alertsPage, module: 'relatorios', title: 'Central de Atenção', icon: 'alert' },
  'painel-financeiro': { page: financeDashboard, module: 'financeiro', title: 'Painel Financeiro', icon: 'chart' },
  'painel-ministerial': { page: ministryDashboard, module: 'celulas', title: 'Painel Ministerial', icon: 'layers' },
  'painel-de-celulas': { page: cellsPanelPage, module: 'celulas', title: 'Painel de Células', icon: 'heart' },
  relatorios: { page: reportsPage, module: 'relatorios', title: 'Relatórios', icon: 'file' },
  'fluxo-de-caixa': { page: cashflowPage, module: 'financeiro', title: 'Fluxo de Caixa', icon: 'wallet' },
  transferencias: { page: transfersPage, module: 'financeiro', title: 'Transferências', icon: 'route' },
  conciliacao: { page: reconciliationPage, module: 'financeiro', title: 'Conciliação Bancária', icon: 'scale' },
  agenda: { page: agendaPage, module: 'agenda', title: 'Agenda', icon: 'calendar' },
  'assistente-ia': { page: aiPage, module: null, title: 'Assistente IA', icon: 'sparkles' },
  portal: { page: portalPage, module: null, title: 'Portal do Membro', icon: 'user' },
  'check-in-infantil': { page: checkinPage, module: 'infantil', title: 'Check-in Infantil', icon: 'baby' },
  'patrimonio-etiquetas': { page: assetsPage, module: 'patrimonio', title: 'Etiquetas e QR do Patrimônio', icon: 'qr' },
  'financeiro-config': { page: finConfigPage, module: 'financeiro', title: 'Configuração Financeira', icon: 'settings' },
  analises: { page: analyticsPage, module: 'relatorios', title: 'Análises', icon: 'chart' },
  configuracoes: { page: settingsPage, module: 'configuracoes', title: 'Configurações', icon: 'settings' },
  permissoes: { page: permissionsPage, module: 'configuracoes', title: 'Perfis e Permissões', icon: 'shield' },
};

const MODULE_LABELS = {
  pessoas: 'Pessoas', familias: 'Famílias', visitantes: 'Visitantes', funcionarios: 'Equipe',
  celulas: 'Células e Grupos', ministerios: 'Ministérios', voluntarios: 'Voluntários',
  escalas: 'Escalas', ebd: 'Escola Bíblica', infantil: 'Ministério Infantil', pastoral: 'Pastoral',
  eventos: 'Eventos', agenda: 'Agenda', comunicacao: 'Comunicação', financeiro: 'Financeiro',
  contas: 'Financeiro', patrimonio: 'Patrimônio', operacao: 'Operação', documentos: 'Documentos',
  relatorios: 'Relatórios', inteligencia: 'Inteligência', auditoria: 'Auditoria',
  configuracao: 'Configuração', configuracoes: 'Configuração', usuarios: 'Acessos e Perfis', sistema: 'Sistema',
};
const MODULE_ORDER = ['pessoas', 'familias', 'visitantes', 'celulas', 'ministerios', 'voluntarios', 'escalas',
  'ebd', 'infantil', 'pastoral', 'eventos', 'agenda', 'comunicacao', 'financeiro', 'contas', 'patrimonio',
  'operacao', 'documentos', 'inteligencia', 'relatorios', 'auditoria', 'usuarios', 'configuracao', 'sistema'];

/* -------------------------------------------------------------- permissões */
/** Visível se o perfil permite; módulo não mapeado no RBAC não esconde o item
 *  (o servidor revalida e devolve 403 — a proteção real é sempre no backend). */
function itemVisible(mod) {
  if (!state.user) return false;
  if (state.user.role === 'super_admin') return true;
  if (state.permissionsUnknown) return true;
  if (!mod) return true;
  const list = state.permissions?.[mod];
  if (!Array.isArray(list)) return true;
  return list.includes('view');
}

/* -------------------------------------------------------------- autenticação */
let authShown = false;

/* ================================================== acesso: login, primeiro uso, cadastro */
authShown = false;
let setupRequired = false;

function authRoot() {
  let root = $('auth-root');
  if (!root) { root = document.createElement('div'); root.id = 'auth-root'; document.body.appendChild(root); }
  return root;
}

/** Requisicao tolerante: devolve se a resposta era HTML (API ausente) em vez de JSON. */
async function fetchJson(url, options) {
  const res = await fetch(apiUrl(url), options);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  return { ok: res.ok, status: res.status, data, notJson: data === null };
}

const API_MISSING_MSG = 'O servidor da aplicação não respondeu neste endereço. '
  + 'Este site está publicado apenas como arquivos estáticos (ex.: Firebase Hosting), onde não existe API. '
  + 'Duas saídas: (1) publique/rode o servidor Node ("npm start") e abra o sistema pelo endereço dele; '
  + 'ou (2) abra o arquivo public/config.js e informe em window.ECLESIA_API_BASE o endereço do servidor '
  + '(ex.: "https://api.suaigreja.org") para que esta página fale com a API em outro endereço.';

function authHero() {
  return `<div class="auth-hero">
    <header class="brandline">
      <span class="brand-mark">E1</span>
      <div><b style="font-size:19px">Eclesia One</b><div class="small">Centro de Comando Digital da Igreja</div></div>
    </header>
    <main>
      <div class="eyebrow">Plataforma de gestão eclesiástica</div>
      <h1>Cada igreja, um ambiente único.<br/>Cada pastor, a sua rede.</h1>
      <p class="lead">Pessoas, famílias, células, ministérios, pastoral, financeiro e operação reunidos em um só lugar, com o princípio do <i>isolamento por igreja</i>: tudo o que você registra aqui permanece na sua igreja.</p>
      <ul class="auth-perks">
        <li>${icon('check')}<span>Visão executiva na primeira tela</span></li>
        <li>${icon('check')}<span>Permissões verificadas no servidor (RBAC em 26 módulos)</span></li>
        <li>${icon('check')}<span>Financeiro com fluxo de caixa projetado</span></li>
        <li>${icon('check')}<span>Cada Pastor ADM cria a própria equipe — secretários, líderes, professores, membros</span></li>
        <li>${icon('check')}<span>Auditoria registrando autor, data e operação de cada movimento</span></li>
      </ul>
    </main>
    <footer class="verse">
      <span class="verse-mark">“</span>
      <div>
        <p>Porque dele, e por ele, e para ele são todas as coisas. A ele, pois, a glória eternamente. Amém.</p>
        <b>Romanos 11:36</b>
      </div>
    </footer>
  </div>`;
}

async function showAuth(message) {
  authShown = true;
  $('app').hidden = true;
  $('boot').hidden = true;
  const root = authRoot();
  let status = { api: true, needs_setup: false, signup_enabled: false, usuarios: 0 };
  const probe = await fetchJson('/api/setup/status').catch(() => null);
  if (!probe) status.api = false;
  else if (probe.notJson) status.api = false;
  else if (probe.data) status = { ...status, ...probe.data, api: true };
  setupRequired = !!status.needs_setup;
  root.innerHTML = `<div class="auth">${authHero()}<div class="auth-panel"><div class="auth-card" data-panel></div></div></div>`;
  renderAuthPanel(root, status, message);
}

function apiMissingPanel(panel) {
  panel.innerHTML = `
    <div class="alert warning"><span class="ico">${icon('alert')}</span><div>
      <b>Servidor da aplicação não encontrado neste endereço</b>
      <p class="small">${esc(API_MISSING_MSG)}</p></div></div>
    <div class="field mt-2"><label>Caminho da API usado por esta página</label>
      <input class="input" value="${esc(apiUrl('/api'))}" readonly /></div>
    <div class="row mt-2">
      <button class="btn btn-primary" data-retry>${icon('refresh')} Tentar novamente</button>
      <button class="btn btn-ghost" data-doc>${icon('file')} Como publicar</button>
    </div>`;
  panel.querySelector('[data-retry]').addEventListener('click', () => showAuth());
  panel.querySelector('[data-doc]').addEventListener('click', () => {
    panel.querySelector('[data-help]') ? panel.querySelector('[data-help]').remove() : null;
    const box = document.createElement('div');
    box.className = 'note mt-2'; box.dataset.help = '1';
    box.innerHTML = '<b>Publicação em dois endereços</b><ol class="small" style="margin:8px 0 0 18px">'
      + '<li>Hospede o servidor Node (VPS, Render, Railway, Cloud Run) — ele contém a API e o banco.</li>'
      + '<li>No arquivo <span class="mono">public/config.js</span> do site estático, informe <span class="mono">window.ECLESIA_API_BASE = "https://endereco-da-api"</span>.</li>'
      + '<li>Publique o site novamente. O login passará a usar a API remota.</li></ol>';
    panel.appendChild(box);
  });
}

function loginForm() {
  return `<form class="auth-form" data-login novalidate>
    <header class="auth-brand">
      <span class="brand-mark">E1</span>
      <div><b>Eclesia One</b><small>Entrar na sua igreja</small></div>
    </header>
    <p class="sub">Acesse com o e-mail e a senha entregues pela administração da sua igreja. O cadastro de novas igrejas é controlado pelo administrador da rede.</p>
    <div class="field"><label for="login-email">E-mail</label><input class="input" id="login-email" name="email" type="email" autocomplete="username" placeholder="seu.nome@igreja.org" required /></div>
    <div class="field"><label for="login-pass">Senha</label><input class="input" id="login-pass" name="password" type="password" autocomplete="current-password" placeholder="••••••••" required /></div>
    <div class="field-err" data-err hidden></div>
    <button class="btn btn-primary btn-block" type="submit" data-submit>${icon('logout')} Entrar</button>
    <div class="divider">hierarquia fechada</div>
    <p class="hint">Cada igreja possui ambiente isolado no servidor. Apenas o administrador da rede cadastra novas igrejas; o Pastor ADM de cada igreja cadastra sua própria equipe.</p>
  </form>`;
}

// signupForm removido: auto-cadastro público está desativado (hierarquia fechada).

async function submitAccess(root, form, endpoint, labels) {
  const err = form.querySelector('[data-err]');
  const btn = form.querySelector('[data-submit]');
  const original = btn.innerHTML;
  const body = Object.fromEntries(new FormData(form).entries());
  err.hidden = true;
  btn.disabled = true;
  btn.textContent = labels.busy;
  const r = await fetchJson(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r.notJson) {
    err.hidden = false; err.textContent = API_MISSING_MSG;
    btn.disabled = false; btn.innerHTML = original; return;
  }
  if (!r.ok || !r.data?.token) {
    err.hidden = false;
    err.textContent = r.data?.error || `Não foi possível concluir (HTTP ${r.status}).`;
    btn.disabled = false; btn.innerHTML = original; return;
  }
  setToken(r.data.token);
  applySession(r.data);
  root.remove();
  authShown = false;
  await startApp();
  toast(labels.ok, r.data.user?.church_name || 'Sessão iniciada', 'ok');
}

function wireLogin(root, panel, status) {
  const form = panel.querySelector('[data-login]');
  form.addEventListener('submit', (ev) => { ev.preventDefault(); submitAccess(root, form, '/api/auth/login', { busy: 'Entrando…', ok: 'Bem-vindo' }); });
  setTimeout(() => panel.querySelector('#login-email')?.focus(), 60);
}

async function renderAuthPanel(root, status, message) {
  const panel = root.querySelector('[data-panel]');
  // Se por algum motivo o banco estiver vazio, mostrara apenas uma mensagem
  // orientando entrar em contato com o administrador da rede. O cadastro
  // publico foi REMOVIDO: hierarquia fechada. Somente o superadmin master pode
  // criar igrejas e usuarios.
  if (status.needs_setup) {
    panel.innerHTML = `<div class="alert danger"><span class="ico">${icon('alert')}</span><div>
      <b>Banco vazio: nenhum administrador provisionado.</b>
      <p class="small">Suba o servidor com <span class="mono">npm start</span> (ou executando <span class="mono">node server/index.js</span>) &mdash; o seed automatico cria o usuario master na primeira inicializacao.</p>
      <p class="small">Apos o provisionamento, entre com as credenciais exibidas no log do servidor.</p>
      <p class="small">O cadastro publico na tela de login foi removido por segunraca. Cada igreja e administrada por seu Pastor ADM, cadastrado exclusivamente pelo superadmin.</p>
      <button class="btn btn-ghost" data-retry>${icon('refresh')} Verificar novamente</button>
      </div></div>`;
    panel.querySelector('[data-retry]')?.addEventListener('click', () => showAuth());
    return;
  }
  const notice = message ? `<div class="alert danger mt-2"><span class="ico">${icon('alert')}</span><div><b>Não foi possível continuar</b><p>${esc(message)}</p></div></div>` : '';
  if (!status.api) { apiMissingPanel(panel); return; }
  panel.innerHTML = loginForm() + notice;
  wireLogin(root, panel, status);
}



function applySession(payload = {}) {
  if (payload.user) state.user = payload.user;
  if (payload.permissions) { state.permissions = payload.permissions; state.permissionsUnknown = false; }
  else if (Array.isArray(payload.modules) && payload.user) {
    state.permissions = Object.fromEntries(payload.modules.map((mo) => [mo, ['view', 'create', 'edit', 'delete', 'export', 'print', 'approve']]));
    state.permissionsUnknown = false;
  } else if (!state.permissions || !Object.keys(state.permissions || {}).length) {
    state.permissionsUnknown = true;
  }
}

/** Recupera a sessão de um token já existente (após recarregar a página). */
async function loadSession() {
  const candidates = ['/api/auth/me', '/api/me', '/api/session', '/api/auth/session'];
  for (const url of candidates) {
    try {
      const data = await api(url);
      const payload = data?.data && typeof data.data === 'object' ? data.data : data;
      if (payload && (payload.user || payload.id || payload.email)) {
        applySession(payload.user ? payload : { user: payload });
        return true;
      }
    } catch (e) {
      if (e.status === 401 || e.status === 403) throw e;
    }
  }
  return false;
}

function logout() {
  setToken(null);
  state.user = null;
  state.permissions = {};
  state.permissionsUnknown = false;
  state.meta = {};
  state.alerts = [];
  location.hash = '';
  showAuth();
}

/* ------------------------------------------------------------------ roteador */
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, searchPart] = raw.split('?');
  const route = pathPart || 'dashboard';
  const query = Object.fromEntries(new URLSearchParams(searchPart || ''));
  return { route: decodeURIComponent(route), query };
}

function resolveRoute(route) {
  const aliasKey = RES_KEY_ALIAS[route];
  if (aliasKey && state.meta[aliasKey]) {
    const def = state.meta[aliasKey];
    return { kind: 'resource', key: aliasKey, def, module: def.module, title: def.plural, icon: def.icon || 'grid' };
  }
  if (PAGES[route]) return { kind: 'page', route, ...PAGES[route] };
  if (state.meta[route]) {
    const def = state.meta[route];
    return { kind: 'resource', key: route, def, module: def.module, title: def.plural, icon: def.icon || 'grid' };
  }
  const underscored = route.replace(/-/g, '_');
  if (state.meta[underscored]) {
    const def = state.meta[underscored];
    return { kind: 'resource', key: underscored, def, module: def.module, title: def.plural, icon: def.icon || 'grid' };
  }
  return null;
}

async function renderRoute() {
  const view = $('view');
  const { route, query } = parseHash();
  const target = resolveRoute(route);
  renderTopbar(target);
  renderSidebar(route);

  if (!target) {
    renderSoon(view, 'Página não encontrada', `A rota "${route}" não existe neste sistema. Use o menu lateral ou a busca global para navegar.`);
    return;
  }
  if (target.superOnly && state.user?.role !== 'super_admin') { renderForbidden(view, 'a visão da rede de igrejas'); return; }
  if (!itemVisible(target.module)) { renderForbidden(view, target.title); return; }

  try {
    if (target.kind === 'resource') {
      await resourcePage(view, { resource: target.key, route, query, params: query });
    } else {
      await target.page(view, { route, query, params: query, resource: null });
    }
    view.querySelector('[data-go]') && null;
  } catch (e) {
    if (e.status === 401) { logout(); return; }
    if (e.status === 403) { renderForbidden(view, target.title); return; }
    renderError(view, e);
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* --------------------------------------------------------------------- shell */
function brandBlock() {
  return `<div class="sidebar-head">
    <span style="width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,#6366F1,#4F46E5);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700">E1</span>
    <div style="min-width:0"><b class="trunc" style="display:block">Eclesia One</b>
    <span class="xsmall muted trunc" style="display:block">${esc(state.user?.church_name || 'Centro de Comando')}</span></div>
  </div>`;
}

function navGroups() {
  const groups = [{
    title: 'Visão geral',
    items: ['dashboard', 'alertas', 'painel-financeiro', 'painel-ministerial', 'painel-de-celulas']
      .map((r) => ({ route: r, ...PAGES[r] })).filter((i) => itemVisible(i.module)),
  }];

  const byModule = new Map();
  for (const [key, def] of Object.entries(state.meta || {})) {
    const route = routeOf(key);
    if (PAGES[route]) continue;
    const mod = def.module || 'sistema';
    if (!byModule.has(mod)) byModule.set(mod, []);
    byModule.get(mod).push({ route, label: def.plural, icon: def.icon || 'grid', module: mod, sensitive: def.sensitive });
  }
  const mods = [...byModule.keys()].sort((a, b) => {
    const ia = MODULE_ORDER.indexOf(a), ib = MODULE_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
  for (const mod of mods) {
    if (!itemVisible(mod)) continue;
    const items = byModule.get(mod).sort((a, b) => a.label.localeCompare(b.label));
    groups.push({ title: MODULE_LABELS[mod] || mod, items });
  }

  groups.push({
    title: 'Análise',
    items: ['relatorios', 'analises', 'fluxo-de-caixa', 'transferencias', 'conciliacao', 'agenda']
      .map((r) => ({ route: r, ...PAGES[r] })).filter((i) => itemVisible(i.module)),
  });
  if (state.user?.role === 'super_admin') {
    groups.push({ title: 'Rede', items: [{ route: 'igrejas', label: 'Igrejas da rede', icon: 'building', module: 'configuracoes', superOnly: true }] });
  }
  const staffItems = ['usuarios'].map((r) => ({ route: r, ...PAGES[r] }))
    .filter(() => ['super_admin', 'pastor_adm'].includes(state.user?.role));
  if (staffItems.length) groups.push({ title: 'Equipe', items: staffItems });
  groups.push({
    title: 'Sistema',
    items: ['assistente-ia', 'portal', 'check-in-infantil', 'patrimonio-etiquetas', 'financeiro-config', 'configuracoes', 'permissoes']
      .map((r) => ({ route: r, ...PAGES[r] })).filter((i) => itemVisible(i.module)),
  });
  return groups.filter((g) => g.items.length);
}

function renderSidebar(activeRoute) {
  const sidebar = $('sidebar');
  // Preserva a posição de rolagem do menu: o innerHTML re-renderiza a cada rota,
  // mas o scrollTop volta ao valor anterior e o item ativo é trazido à vista.
  const prevBody = sidebar.querySelector('.sidebar-body');
  const prevScroll = prevBody ? prevBody.scrollTop : 0;
  const nav = navGroups().map((g) => `<div class="nav-group">
      <div class="nav-group-title">${esc(g.title)}</div>
      ${g.items.map((i) => `<a class="nav-item ${i.route === activeRoute ? 'active' : ''}" href="#/${i.route}">${icon(i.icon || 'grid')} <span class="trunc">${esc(i.label || i.title)}</span></a>`).join('')}
    </div>`).join('');
  sidebar.innerHTML = `${brandBlock()}
    <div class="sidebar-body">${nav}</div>
    <div class="sidebar-foot">
      <div class="user-chip">${icon('user')} <div style="min-width:0"><b class="trunc" style="display:block">${esc(state.user?.name || '')}</b>
        <span class="xsmall muted trunc" style="display:block">${esc(state.user?.role_name || state.user?.role || '')}</span></div></div>
      <button class="btn btn-sm btn-ghost btn-block mt-1" data-logout>${icon('logout')} Sair</button>
    </div>`;
  const body = sidebar.querySelector('.sidebar-body');
  if (body) {
    body.scrollTop = prevScroll;
    const active = body.querySelector('.nav-item.active');
    if (active) {
      const at = active.offsetTop;
      if (at < body.scrollTop + 60 || at > body.scrollTop + body.clientHeight - 60) {
        body.scrollTop = Math.max(0, at - body.clientHeight / 2);
      }
    }
  }
  sidebar.querySelector('[data-logout]').addEventListener('click', logout);
  $('footinfo').textContent = `${state.user?.church_name || ''} · Eclesia One ${APP_VERSION} · ${new Date().toLocaleDateString('pt-BR')}`;
}

function renderTopbar(target) {
  const unread = (state.alerts || []).filter((a) => !a.read_at).length || 0;
  $('topbar').innerHTML = `
    <button class="icon-btn burger" data-burger aria-label="Menu">${icon('menu')}</button>
    <div class="crumb"><b class="crumb-title">${esc(target?.title || 'Eclesia One')}</b>
      <span class="crumb-sub small muted">${esc(state.user?.church_name || '')}</span></div>
    <div class="topbar-spacer"></div>
    <span id="install-slot" class="row tight"></span>
    <button class="searchbox" data-search>${icon('search')} <span>Buscar pessoas, células, contas…</span> <span class="xsmall muted">Ctrl K</span></button>
    <button class="icon-btn" data-bell aria-label="Alertas">${icon('bell')}${unread ? `<span class="badge danger" style="position:absolute;transform:translate(9px,-9px)">${unread}</span>` : ''}</button>
    <div class="user-chip"><span class="avatar">${esc(initials(state.user?.name || '?'))}</span>
      <div style="min-width:0"><b class="trunc" style="display:block">${esc(state.user?.name || '')}</b>
      <span class="xsmall muted trunc" style="display:block">${esc(state.user?.role_name || state.user?.role || '')}</span></div></div>`;

  $('topbar').querySelector('[data-burger]').addEventListener('click', (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    toggleNav();
  });
  $('topbar').querySelector('[data-search]').addEventListener('click', openCommandPalette);
  $('topbar').querySelector('[data-bell]').addEventListener('click', openAlertsPanel);
  renderInstallSlot();
}

/* -------------------------------------------------- central de atenção / alertas */
async function openAlertsPanel() {
  const m = modal({ title: 'Central de Atenção', subtitle: 'Pendências detectadas a partir dos dados registrados', size: 'wide', body: '<div class="row"><div class="spin dark"></div><span class="small muted">Carregando alertas…</span></div>' });
  try {
    const payload = await api('/api/alerts');
    state.alerts = payload.data || [];
    m.body.innerHTML = state.alerts.length
      ? state.alerts.map((a) => `<div class="alert ${esc(a.kind || 'info')}" style="align-items:flex-start">
          <span class="ico">${icon(a.kind === 'danger' ? 'alert' : a.kind === 'warning' ? 'clock' : 'bell')}</span>
          <div style="min-width:0"><b>${esc(a.title)}</b><div class="small">${esc(a.detail || '')}</div>
          ${a.link ? `<a class="small" href="${esc(a.link.replace(/^#\/*/, '#/'))}" data-close>${icon('chevronRight')} Abrir módulo</a>` : ''}</div></div>`).join('')
      : `<div class="empty">${icon('check')}<h4>Nenhuma pendência no momento</h4><p>Contas em dia, células com relatório enviado e escalas confirmadas.</p></div>`;
  } catch (e) {
    m.body.innerHTML = `<div class="alert danger"><div><b>Não foi possível carregar os alertas</b><p>${esc(e.message || '')}</p></div></div>`;
  }
}

/* ------------------------------------------------------- busca global (Ctrl+K) */
let cmdOpen = false;

function openCommandPalette() {
  if (cmdOpen) return;
  cmdOpen = true;
  const root = $('cmd-root');
  root.innerHTML = `<div class="cmd-back"><div class="cmd">
      <div class="row" style="padding:12px 14px;border-bottom:1px solid var(--border)">
        ${icon('search')}<input class="input" data-cmdq placeholder="Buscar em todo o sistema…" autocomplete="off" />
        <span class="xsmall muted nowrap">Esc para fechar</span>
      </div>
      <div class="cmd-results" data-cmdres><div class="small muted" style="padding:14px">Digite ao menos 2 caracteres. A busca respeita as permissões do seu perfil.</div></div>
    </div></div>`;
  const input = root.querySelector('[data-cmdq]');
  const res = root.querySelector('[data-cmdres]');
  const close = () => { root.innerHTML = ''; cmdOpen = false; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  root.querySelector('.cmd-back').addEventListener('mousedown', (e) => { if (e.target.classList.contains('cmd-back')) close(); });

  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const term = input.value.trim();
    if (term.length < 2) { res.innerHTML = '<div class="small muted" style="padding:14px">Digite ao menos 2 caracteres.</div>'; return; }
    res.innerHTML = '<div class="row" style="padding:14px"><div class="spin dark"></div><span class="small muted">Buscando…</span></div>';
    timer = setTimeout(async () => {
      try {
        const payload = await api(`/api/search?q=${encodeURIComponent(term)}`);
        const groups = normalizeSearch(payload);
        res.innerHTML = groups.length ? groups.map((g) => `<div class="cmd-group">${esc(g.label)}</div>
            ${g.items.map((it) => `<button class="cmd-item" data-go="${esc(it.href)}">${icon(it.icon || 'grid')}
              <div style="min-width:0"><b class="trunc" style="display:block">${esc(it.label)}</b>
              <span class="xsmall muted trunc" style="display:block">${esc(it.detail || '')}</span></div></button>`).join('')}`).join('')
          : '<div class="small muted" style="padding:14px">Nenhum registro encontrado para este termo.</div>';
        res.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.go; close(); }));
      } catch (e) {
        res.innerHTML = `<div class="small" style="padding:14px;color:var(--danger)">${esc(e.message || 'Falha na busca.')}</div>`;
      }
    }, 260);
  });
  input.focus();
}

function normalizeSearch(payload) {
  const data = payload?.data ?? payload;
  const out = [];
  const add = (label, items) => { if (items?.length) out.push({ label, items }); };
  const toItem = (r, fallbackLabel) => {
    const key = r.resource || r.key || r.table;
    const href = r.hash || r.link || (key ? `#/${routeOf(key)}?q=${encodeURIComponent(r.label || r.full_name || r.name || '')}` : '#/dashboard');
    return { label: r.label || r.full_name || r.name || r.title || `#${r.id}`, detail: r.detail || r.subtitle || fallbackLabel || '', href, icon: 'grid' };
  };
  if (Array.isArray(data)) { add('Resultados', data.map((r) => toItem(r))); return out; }
  if (data && typeof data === 'object') {
    for (const [group, value] of Object.entries(data)) {
      if (Array.isArray(value)) add(MODULE_LABELS[group] || group, value.map((r) => toItem(r, group)));
    }
  }
  return out;
}

/* ------------------------------------------------- rede: igrejas (multi-tenant) */
async function churchesPage(container) {
  if (state.user?.role !== 'super_admin') return renderForbidden(container, 'a lista de igrejas da rede');
  container.innerHTML = loadingBlock('Carregando igrejas da rede…');
  let payload;
  try { payload = await api('/api/churches'); } catch (e) { return renderError(container, e); }
  const rows = payload.data || [];
  const soma = (k) => rows.reduce((s, r) => s + Number(r[k] || 0), 0);
  container.innerHTML = `
    <div class="page-head">
      <div><h2>Igrejas da rede</h2>
        <p>Cada igreja é um ambiente isolado: pessoas, famílias, células, financeiro e usuários de uma igreja nunca aparecem em outra. O Pastor ADM administra a própria igreja.</p></div>
      <div class="page-actions"><button class="btn btn-primary" data-new-church>${icon('plus')} Nova igreja + Pastor ADM</button></div>
    </div>
    <div class="grid g-4">
      ${metricCard({ label: 'Igrejas', value: num(rows.length), detail: 'ambientes isolados', icon: 'building', tone: 'brand' })}
      ${metricCard({ label: 'Pessoas na rede', value: num(soma('pessoas')), icon: 'users' })}
      ${metricCard({ label: 'Usuários', value: num(soma('usuarios')), icon: 'shield' })}
      ${metricCard({ label: 'Células', value: num(soma('celulas')), icon: 'heart' })}
    </div>
    <div class="card mt-2">
      <div class="card-head"><h3>Igrejas cadastradas</h3></div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Igreja</th><th>Cidade</th><th>Pastor ADM</th><th>Pessoas</th><th>Usuários</th><th>Células</th><th>Criada em</th><th>Situação</th></tr></thead>
        <tbody>${rows.map((c) => `<tr>
          <td class="cell-main">${esc(c.name)}</td><td>${esc(c.city || '—')}</td>
          <td>${esc(c.admin_email || '—')}</td>
          <td class="num">${num(c.pessoas)}</td><td class="num">${num(c.usuarios)}</td><td class="num">${num(c.celulas)}</td>
          <td>${dt(c.created_at)}</td>
          <td><span class="badge ${c.is_demo ? 'warn' : 'ok'}">${c.is_demo ? 'Demonstração' : 'Produção'}</span></td></tr>`).join('')}</tbody>
      </table></div>
    </div>`;
  container.querySelector('[data-new-church]').addEventListener('click', () => newChurchDialog(() => renderRoute()));
}

function newChurchDialog(after) {
  const m = modal({
    title: 'Nova igreja + Pastor ADM',
    subtitle: 'Cria um ambiente isolado e o administrador dessa igreja',
    size: 'wide',
    body: `<form class="form-grid" data-church>
      <div class="field span-2"><label>Nome da igreja</label><input class="input" name="name" required /></div>
      <div class="field"><label>Cidade</label><input class="input" name="city" /></div>
      <div class="field"><label>UF</label><input class="input" name="state" maxlength="2" /></div>
      <div class="field"><label>Nome do Pastor ADM</label><input class="input" name="admin_name" /></div>
      <div class="field"><label>E-mail do Pastor ADM</label><input class="input" name="admin_email" type="email" /></div>
      <div class="field span-2"><label>Senha provisória (vazio = o sistema gera e mostra)</label><input class="input" name="admin_password" /></div>
      <div class="field-err span-2" data-err hidden></div>
      <div class="span-2 row" style="justify-content:flex-end">
        <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
        <button type="button" class="btn btn-primary" data-create>${icon('check')} Criar igreja</button>
      </div>
      <div class="span-2" data-out></div>
    </form>`,
  });
  const form = m.body.querySelector('[data-church]');
  const err = m.body.querySelector('[data-err]');
  const out = m.body.querySelector('[data-out]');
  const btn = m.body.querySelector('[data-create]');
  m.body.querySelector('[data-cancel]').addEventListener('click', () => m.close?.());
  btn.addEventListener('click', async () => {
    err.hidden = true;
    const body = Object.fromEntries(new FormData(form).entries());
    btn.disabled = true; btn.textContent = 'Criando…';
    try {
      const r = await api('/api/churches', { method: 'POST', body });
      const d = r.data || r;
      out.innerHTML = `<div class="alert ok"><span class="ico">${icon('check')}</span><div>
        <b>Igreja criada: ${esc(d.name || body.name)}</b>
        <p class="small">Pastor ADM: ${esc(d.admin?.email || '—')}<br/>
        Senha provisória: <b class="mono">${esc(d.senha_provisoria || body.admin_password || '(a definida por você)')}</b></p>
        <p class="small muted">Anote e entregue ao Pastor ADM. No primeiro acesso ele deve alterar a senha em Meu perfil → Alterar senha.</p></div></div>`;
      toast('Igreja criada', d.name || '', 'ok');
      after?.();
    } catch (e) {
      err.hidden = false; err.textContent = e.message || 'Não foi possível criar a igreja.';
    } finally {
      btn.disabled = false; btn.innerHTML = `${icon('check')} Criar igreja`;
    }
  });
}

/* ==================================================== USUÁRIOS DA EQUIPE */
/* Página dedicada: o MASTER gerencia a equipe de qualquer igreja (seletor de
   linhagem); o Pastor ADM gerencia SOMENTE a equipe da própria igreja. Toda
   regra de escopo é revalidada no servidor — a UI apenas esconde o que não
   compete ao papel. */
async function usersPage(container) {
  if (!['super_admin', 'pastor_adm'].includes(state.user?.role)) return renderForbidden(container, 'a gestão de usuários');
  const isMaster = state.user?.role === 'super_admin';
  container.innerHTML = loadingBlock('Carregando equipe…');

  let churches = [];
  if (isMaster) {
    try { churches = (await api('/api/churches/options')).data || []; } catch { churches = []; }
  }
  const { query } = parseHash();
  const churchId = String(query.church || state.user.church_id);
  let payload;
  try { payload = await api('/api/team' + (isMaster ? `?church_id=${encodeURIComponent(churchId)}` : '')); }
  catch (e) { return renderError(container, e); }
  const roles = (payload.available_roles || []).filter((r) => !(payload.blocked_roles || []).includes(r.slug));
  const rows = payload.data || [];
  const activeChurchId = payload.church_id;
  const churchName = payload.church_name || state.user?.church_name || '';
  const ativos = rows.filter((u) => u.active).length;

  container.innerHTML = `
    <div class="page-head">
      <div><h2>Usuários</h2>
        <p>Equipe de <b>${esc(churchName)}</b>. Cada usuário entra com e-mail e senha e só enxerga os dados desta igreja — o isolamento é garantido no servidor.</p></div>
      <div class="page-actions"><button class="btn btn-primary" data-new-user>${icon('plus')} Novo usuário</button></div>
    </div>
    ${isMaster && churches.length ? `
    <div class="card card-soft mb-2"><div class="card-body row" style="gap:12px;align-items:center;flex-wrap:wrap">
      ${icon('building')} <b>Igreja (linhagem):</b>
      <select class="input" data-church-sel style="max-width:340px">
        ${churches.map((c) => `<option value="${c.id}" ${String(c.id) === String(activeChurchId) ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
      </select>
      <span class="small muted">Só o Administrador da Rede escolhe a igreja. O Pastor ADM gerencia apenas a equipe da própria igreja.</span>
    </div></div>` : ''}
    <div class="grid g-4">
      ${metricCard({ label: 'Usuários', value: num(rows.length), detail: `${num(ativos)} ativos · ${num(rows.length - ativos)} inativos`, tone: 'brand', icon: 'users' })}
      ${metricCard({ label: 'Perfis disponíveis', value: num(roles.length), detail: roles.slice(0, 3).map((r) => r.name).join(', '), icon: 'shield' })}
    </div>
    <div class="card mt-2">
      <div class="card-head"><h3>${icon('users')} Equipe cadastrada</h3></div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Nome</th><th>E-mail</th><th>Função</th><th>Telefone</th><th>Situação</th><th>Último acesso</th><th>Ações</th></tr></thead>
        <tbody>${rows.length ? rows.map((u) => `<tr>
          <td class="cell-main">${esc(u.name)}${Number(u.id) === Number(payload.self_id) ? ' <span class="badge brand">você</span>' : ''}</td>
          <td>${esc(u.email)}</td>
          <td>${esc(u.role_name || u.role)}</td>
          <td>${esc(u.phone || '—')}</td>
          <td><span class="badge ${u.active ? 'ok' : 'warn'}">${u.active ? 'Ativo' : 'Inativo'}</span></td>
          <td>${u.last_login ? dtTime(u.last_login) : '—'}</td>
          <td class="actions">
            <button class="btn btn-xs btn-ghost" data-edit="${u.id}">${icon('edit')} Editar</button>
            <button class="btn btn-xs btn-ghost" data-reset="${u.id}">${icon('key')} Nova senha</button>
            ${Number(u.id) !== Number(payload.self_id) && u.role !== 'super_admin' ? `<button class="btn btn-xs btn-soft" data-off="${u.id}">Desativar</button>` : ''}
          </td></tr>`).join('') : '<tr><td colspan="7"><div class="empty"><p>Nenhum usuário ainda. Clique em <b>Novo usuário</b> para criar o primeiro acesso da equipe.</p></div></td></tr>'}</tbody>
      </table></div>
    </div>`;

  const refresh = () => usersPage(container);
  container.querySelector('[data-church-sel]')?.addEventListener('change', (ev) => { location.hash = `#/usuarios?church=${ev.target.value}`; });
  container.querySelector('[data-new-user]')?.addEventListener('click', () => userDialog({ roles, churchId: activeChurchId }, refresh));
  container.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
    const u = rows.find((x) => String(x.id) === b.dataset.edit);
    userDialog({ roles, churchId: activeChurchId, row: u }, refresh);
  }));
  container.querySelectorAll('[data-reset]').forEach((b) => b.addEventListener('click', () => resetPasswordDialog(b.dataset.reset, refresh)));
  container.querySelectorAll('[data-off]').forEach((b) => b.addEventListener('click', async () => {
    const u = rows.find((x) => String(x.id) === b.dataset.off);
    if (!u) return;
    const okGo = await confirmDialog({
      title: `Desativar ${u.name}?`,
      message: 'O usuário perde o acesso imediatamente. O histórico e a auditoria permanecem preservados (exclusão lógica).',
      confirmLabel: 'Desativar', danger: true,
    });
    if (!okGo) return;
    try { await api(`/api/team/${u.id}`, { method: 'DELETE' }); toast('Usuário desativado', 'Acesso revogado; histórico preservado.', 'ok'); refresh(); }
    catch (e) { toast('Não foi possível desativar', e.message, 'err'); }
  }));
}

function userDialog({ roles, churchId, row }, after) {
  const isNew = !row;
  const m = modal({
    title: isNew ? 'Novo usuário' : `Editar ${row.name}`,
    subtitle: isNew ? 'Cria o acesso de um membro da equipe desta igreja.' : 'As alterações ficam registradas na auditoria.',
    size: 'wide',
    body: `<form class="form-grid" data-user novalidate>
      <div class="field"><label>Nome *</label><input class="input" name="name" required value="${esc(row?.name || '')}" /></div>
      <div class="field"><label>E-mail *</label><input class="input" name="email" type="email" ${isNew ? 'required' : 'disabled'} value="${esc(row?.email || '')}" /></div>
      <div class="field"><label>Telefone</label><input class="input" name="phone" value="${esc(row?.phone || '')}" /></div>
      <div class="field"><label>Função *</label>
        <select class="input" name="role" required>
          <option value="">— Selecione —</option>
          ${roles.map((r) => `<option value="${esc(r.slug)}" ${row && row.role === r.slug ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}
        </select></div>
      <div class="field"><label>${isNew ? 'Senha inicial *' : 'Nova senha (opcional)'}</label>
        <input class="input" name="password" type="password" autocomplete="new-password" placeholder="Mínimo 8 caracteres" /></div>
      ${isNew ? `<div class="field" style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="require_reset" id="f-reqreset" checked style="width:auto" /> <label for="f-reqreset" style="margin:0">Exigir troca de senha no primeiro acesso</label></div>`
      : `<div class="field" style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="active" id="f-active" ${row.active ? 'checked' : ''} style="width:auto" /> <label for="f-active" style="margin:0">Usuário ativo (pode entrar no sistema)</label></div>`}
      ${isNew ? `<div class="field span-2 small muted">O usuário nasce na igreja selecionada no topo da página — ele jamais verá dados de outra igreja.</div>` : ''}
      <div class="field-err span-2" data-err hidden></div>
      <div class="span-2 row" style="justify-content:flex-end">
        <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
        <button type="button" class="btn btn-primary" data-save>${icon('check')} ${isNew ? 'Criar usuário' : 'Salvar'}</button>
      </div>
    </form>`,
  });
  const form = m.body.querySelector('[data-user]');
  const err = m.body.querySelector('[data-err]');
  const btn = m.body.querySelector('[data-save]');
  m.body.querySelector('[data-cancel]').addEventListener('click', () => m.close?.());
  btn.addEventListener('click', async () => {
    err.hidden = true;
    const fd = new FormData(form);
    const body = Object.fromEntries(fd.entries());
    body.church_id = churchId;
    if (isNew) body.require_reset = fd.get('require_reset') ? 1 : 0;
    else body.active = fd.get('active') ? 1 : 0;
    if (!body.password) delete body.password;
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Salvando…';
    try {
      if (isNew) await api('/api/team', { method: 'POST', body });
      else await api(`/api/team/${row.id}`, { method: 'POST', body });
      toast(isNew ? 'Usuário criado' : 'Usuário atualizado', isNew ? 'Entregue o e-mail e a senha inicial ao usuário — ele deve trocá-la no primeiro acesso.' : 'Alteração registrada na auditoria.', 'ok');
      m.close?.();
      after?.();
    } catch (e) {
      err.hidden = false; err.textContent = e.message || 'Não foi possível salvar.';
      btn.disabled = false; btn.innerHTML = `${icon('check')} ${isNew ? 'Criar usuário' : 'Salvar'}`;
    }
  });
}

async function resetPasswordDialog(id, after) {
  const okGo = await confirmDialog({
    title: 'Gerar nova senha provisória?',
    message: 'A senha atual será substituída por uma senha provisória aleatória. O usuário deverá trocá-la no próximo acesso.',
    confirmLabel: 'Gerar senha',
  });
  if (!okGo) return;
  try {
    const r = await api(`/api/team/${id}/reset-password`, { method: 'POST' });
    const m2 = modal({
      title: 'Senha provisória gerada',
      size: 'wide',
      body: `<div class="alert warn"><span class="ico">${icon('alert')}</span><div>
        <b>Entregue em canal seguro</b>
        <p class="small">Senha provisória: <b class="mono" style="font-size:16px">${esc(r.senha_provisoria)}</b></p>
        <p class="small muted">A troca será exigida no próximo login. Anote agora — esta senha não será exibida novamente.</p>
        <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn btn-primary" data-ok>Entendi</button></div>
      </div></div>`,
    });
    m2.body.querySelector('[data-ok]').addEventListener('click', () => m2.close?.());
    after?.();
  } catch (e) { toast('Não foi possível gerar a senha', e.message, 'err'); }
}

/* ---------------------------------------------------------------------- boot */
async function startApp() {
  if (!state.user && !(await loadSession().catch((e) => { if (e.status === 401) logout(); return false; }))) return;
  const meta = await api('/api/meta');
  state.meta = meta.resources || {};
  state.enums = meta.enums || {};
  $('auth-root')?.remove();
  $('boot').hidden = true;
  $('app').hidden = false;
  await renderRoute();
  api('/api/alerts').then((a) => { state.alerts = a.data || []; renderTopbar(resolveRoute(parseHash().route)); }).catch(() => {});
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => { /* ambiente sem PWA: seguimos normalmente */ });
}

function bindGlobals() {
  window.addEventListener('resize', () => { if (!isNarrow()) closeNav(); renderInstallSlot(); });
  document.addEventListener('click', (ev) => {
    if (!document.body.classList.contains('nav-open')) return;
    if (ev.target.closest('#sidebar .nav-item')) { closeNav(); return; }
    if (ev.target.closest('#sidebar') || ev.target.closest('[data-burger]')) return;
    closeNav();
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeNav(); });
  window.addEventListener('beforeinstallprompt', (ev) => { ev.preventDefault(); window.__eoInstallPrompt = ev; renderInstallSlot(); });
  window.addEventListener('appinstalled', () => { window.__eoInstallPrompt = null; renderInstallSlot(); });
  renderInstallSlot();
  window.addEventListener('hashchange', () => { if (!authShown) renderRoute(); });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCommandPalette(); }
  });
}

/* --------------------------------------------- PWA: instalar como aplicativo */
function isNarrow() { try { return window.matchMedia('(max-width: 980px)').matches; } catch { return (window.innerWidth || 1200) <= 980; } }
function toggleNav() { document.body.classList.toggle('nav-open'); syncNavA11y(); }
function closeNav() { if (document.body.classList.contains('nav-open')) { document.body.classList.remove('nav-open'); syncNavA11y(); } }
function syncNavA11y() {
  const b = document.querySelector('[data-burger]');
  if (b) b.setAttribute('aria-expanded', document.body.classList.contains('nav-open') ? 'true' : 'false');
}
function isStandaloneMode() {
  try { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; } catch { return false; }
}
function isIOSDevice() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function canInstallApp() { return !isStandaloneMode() && (!!window.__eoInstallPrompt || isIOSDevice()); }
function renderInstallSlot() {
  const slot = document.getElementById('install-slot');
  if (!slot) return;
  if (!canInstallApp()) { slot.innerHTML = ''; return; }
  slot.innerHTML = '<button class="btn btn-soft btn-sm install-btn" data-install title="Instalar o Eclesia One como aplicativo">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 12 5 5 5-5"/><path d="M5 21h14"/></svg>'
    + '<span class="install-label">Instalar</span></button>';
  const b = slot.querySelector('[data-install]');
  if (b) b.addEventListener('click', promptInstall);
}
async function promptInstall() {
  const ev = window.__eoInstallPrompt;
  if (ev) {
    try { ev.prompt(); await ev.userChoice; } catch { /* usuário dispensou */ }
    window.__eoInstallPrompt = null; renderInstallSlot(); return;
  }
  showIosInstallGuide();
}
function showIosInstallGuide() {
  const root = document.getElementById('modal-root') || document.body;
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = '<div class="modal narrow" role="dialog" aria-modal="true" aria-label="Instalar no celular">'
    + '<div class="modal-head"><div><h3>Instalar no celular</h3>'
    + '<div class="sub">O Eclesia One passa a abrir em tela cheia, com ícone próprio e acesso rápido.</div></div></div>'
    + '<div class="modal-body"><p class="small soft">No iPhone e no iPad o Safari não mostra o botão automático. Faça assim:</p>'
    + '<ol class="small" style="margin:10px 0 0 18px;display:grid;gap:7px">'
    + '<li>Toque em <b>Compartilhar</b> (quadrado com a seta para cima), na barra inferior do Safari.</li>'
    + '<li>Escolha <b>Adicionar à Tela de Início</b>.</li>'
    + '<li>Confirme o nome <b>Eclesia One</b> e toque em <b>Adicionar</b>.</li></ol>'
    + '<p class="small muted mt-2">No Android, use o botão <b>Instalar</b> na barra superior ou o menu do Chrome → <b>Instalar aplicativo</b>.</p></div>'
    + '<div class="modal-foot"><button class="btn btn-primary" data-close>Entendi</button></div></div>';
  const fechar = () => back.remove();
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) fechar(); });
  document.addEventListener('keydown', function onEsc(e) { if (e.key === 'Escape') { fechar(); document.removeEventListener('keydown', onEsc); } });
  root.appendChild(back);
}

(async function boot() {
  registerServiceWorker();
  bindGlobals();
  if (!state.token) { await showAuth(); return; }
  try {
    await startApp();
  } catch (e) {
    if (e.status === 401 || e.status === 403) { setToken(null); showAuth('Sua sessão expirou. Entre novamente.'); return; }
    $('boot').hidden = true;
    $('app').hidden = false;
    renderError($('view'), e);
    renderSidebar('dashboard');
    renderTopbar(null);
  }
})();

export { APP_VERSION };
