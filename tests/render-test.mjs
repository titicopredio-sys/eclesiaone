/**
 * Eclesia One — teste de RENDERIZAÇÃO real (jsdom + módulos ES).
 * Executa o public/js/app.js de verdade contra a API em execução e verifica o
 * HTML final produzido. Dois modos:
 *   RENDER_MODE=login  -> tela de acesso (sem token)
 *   RENDER_MODE=app    -> painel autenticado como administrador (com token real)
 * Uso: npm run test:render
 */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const MODE = process.env.RENDER_MODE || 'login';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@eclesiaone.app';
const PASS = process.env.ADMIN_PASSWORD || 'Eclesia@2026';

let pass = 0, fail = 0;
const ok = (n, c, det = '') => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FAIL ${n}${det ? ' :: ' + det : ''}`); } };

const lr = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASS }),
});
const lj = await lr.json();
if (!lj.token) { console.log('FALHA: não autenticou no servidor de render:', JSON.stringify(lj)); process.exit(1); }

const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: `${BASE}/`, pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;

/* liga o DOM real do jsdom ao ambiente Node: os módulos ES rodam de verdade */
window.ECLESIA_API_BASE = BASE;                       // exercita o mecanismo do config.js
if (MODE === 'app') window.localStorage.setItem('eo_token', lj.token);
globalThis.window = window;
globalThis.document = window.document;
globalThis.localStorage = window.localStorage;
globalThis.location = window.location;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
globalThis.Event = window.Event;
globalThis.CustomEvent = window.CustomEvent;
globalThis.FormData = window.FormData;
globalThis.scrollTo = () => {};
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true });

const mod = await import(`${path.join(ROOT, 'public/js/app.js')}?v=${Date.now()}`);
await new Promise((r) => setTimeout(r, 3000));        // aguarda as chamadas reais à API

const d = window.document;
const body = d.body.textContent || '';
const svgs = d.querySelectorAll('svg').length;
console.log(`\n  modo=${MODE}  app.js=${mod.APP_VERSION}  svg renderizados=${svgs}  #app${d.getElementById('app').hidden ? ' oculto' : ' visível'}`);

if (MODE === 'login') {
  ok('01 tela de acesso renderizada (não trava em "Carregando")', !body.includes('Carregando o centro de comando') && /Entrar/.test(body));
  ok('02 formulário de login presente', !!d.querySelector('input[name=email]') && !!d.querySelector('input[name=password]'));
  ok('03 auto-cadastro de Pastor ADM oferecido', body.includes('Criar minha igreja'));
  ok('04 API respondeu (não caiu no aviso de servidor ausente)', !body.includes('Servidor da aplicação não encontrado'));
  ok('05 destaques da tela de acesso renderizados', d.querySelectorAll('.auth-perks li').length === 4, `li=${d.querySelectorAll('.auth-perks li').length}`);
  ok('06 ícones renderizados na tela de acesso', svgs >= 4, `svg=${svgs}`);
  ok('07 nenhum erro de tela invocada', !body.includes('Acesso restrito'));
} else {
  ok('08 painel liberado após autenticação (#app visível)', d.getElementById('app').hidden === false);
  ok('09 menu lateral com o nome da igreja', !!d.querySelector('#sidebar') && /Eclesia One/.test(d.querySelector('#sidebar').textContent || ''));
  ok('10 barra superior com busca global', /Buscar/.test(d.querySelector('#topbar')?.textContent || ''));
  ok('11 conteúdo do painel carregado da API', (d.querySelector('#view')?.textContent || '').length > 400, `chars=${(d.querySelector('#view')?.textContent || '').length}`);
  ok('12 indicador financeiro real exibido (R$)', /R\$/.test(body));
  ok('13 menu possui grupos de módulos', d.querySelectorAll('#sidebar .nav-item').length >= 15, `itens=${d.querySelectorAll('#sidebar .nav-item').length}`);
  ok('14 acesso de administrador às configurações', d.querySelectorAll('#sidebar .nav-item').length > 0 && !body.includes('Acesso restrito'));
}

/* CSS servido: a regra que impede ícone gigante precisa estar publicada */
const css = await (await fetch(`${BASE}/css/app.css`)).text();
ok('15 CSS publicado define tamanho padrão dos ícones', /svg\s*\{\s*width:\s*18px/.test(css));
ok('16 CSS publicado contém os estilos da tela de acesso', css.includes('.auth-perks'));
ok('17 CSS publicado corrige text-size-adjust', /text-size-adjust:\s*100%/.test(css));

/* assets servidos com MIME correto (causa do bloqueio de módulo) */
for (const [u, ct] of [['/js/app.js', 'text/javascript'], ['/js/ui.js', 'text/javascript'], ['/js/modules.js', 'text/javascript'], ['/js/charts.js', 'text/javascript'], ['/config.js', 'text/javascript'], ['/css/app.css', 'text/css']]) {
  const r = await fetch(BASE + u);
  ok(`18 ${u} servido como ${ct}`, r.status === 200 && String(r.headers.get('content-type') || '').includes(ct), `status=${r.status} ct=${r.headers.get('content-type')}`);
}

console.log(`\n  Render ${MODE}: ${pass} aprovados, ${fail} reprovados\n`);
process.exit(fail ? 1 : 0);
