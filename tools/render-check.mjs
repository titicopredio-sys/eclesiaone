/* Executa o public/js/app.js real dentro de um DOM (jsdom) com os APIs de navegador
   usados pelo app, contra a API em execucao, e reporta o que o usuario ve.
   RENDER_MODE=login (tela de acesso) | app (painel autenticado). */
import { JSDOM } from 'jsdom';
import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const MODE = process.env.RENDER_MODE || 'login';
const r = { modo: MODE, base: BASE };

const j = await (await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.ADMIN_EMAIL || 'admin@eclesiaone.app', password: process.env.ADMIN_PASSWORD || 'Eclesia@2026' }) })).json();
r.login_api = { token: !!j.token, papel: j.user?.role, igreja: j.user?.church_name };

const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8'), { url: `${BASE}/`, pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.ECLESIA_API_BASE = '';
if (MODE === 'app' && j.token) window.localStorage.setItem('eo_token', j.token);
/* stubs dos APIs de navegador que o app usa e o jsdom nao implementa */
window.matchMedia = window.matchMedia || ((q) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
window.scrollTo = () => {}; window.alert = () => {}; window.confirm = () => true; window.prompt = () => null;
window.URL.createObjectURL = () => 'blob:x'; window.URL.revokeObjectURL = () => {};
window.IntersectionObserver = window.IntersectionObserver || class { observe() {} unobserve() {} disconnect() {} };
window.ResizeObserver = window.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
window.Notification = window.Notification || class { static requestPermission() { return Promise.resolve('granted'); } };
window.Element.prototype.scrollIntoView = function () {};
try { Object.defineProperty(window.navigator, 'serviceWorker', { value: { register: () => Promise.resolve({ addEventListener() {} }), ready: Promise.resolve({}) }, configurable: true }); } catch {}
for (const k of ['document', 'localStorage', 'HTMLElement', 'Node', 'Event', 'CustomEvent', 'FormData', 'SVGElement', 'MutationObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'Blob', 'File', 'FileReader', 'URL', 'matchMedia', 'IntersectionObserver', 'ResizeObserver']) if (window[k] !== undefined) globalThis[k] = window[k];
globalThis.window = window; globalThis.location = window.location; globalThis.history = window.history;
globalThis.scrollTo = () => {}; globalThis.alert = () => {};
globalThis.fetch = (u, o) => fetch(String(u).startsWith('http') ? String(u) : BASE + String(u), o);
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true });
window.addEventListener('error', (e) => { r.erro_js = String(e.message || e.error).slice(0, 160); });
window.addEventListener('unhandledrejection', (e) => { r.erro_promise = String(e.reason && e.reason.message || e.reason).slice(0, 160); });

try {
  const mod = await import(`${path.join(ROOT, 'public/js/app.js')}?v=${Date.now()}`);
  r.import_ok = true; r.app_version = mod.APP_VERSION || '(n/d)';
} catch (e) { r.import_ok = false; r.erro_import = e.message; }
await new Promise((s) => setTimeout(s, 4000));

const d = window.document, app = d.getElementById('app'), view = d.getElementById('view');
r.travou_em_carregando = /Carregando o centro de comando/.test(d.body.textContent || '');
r.app_visivel = app ? app.hidden === false : null;
r.form_login = !!d.querySelector('input[name=email]') && !!d.querySelector('input[name=password]');
r.oferta_criar_igreja = /Criar minha igreja|Cadastrar minha igreja|Pastor ADM/i.test(d.body.textContent || '');
r.aviso_servidor_ausente = /Servidor da aplicação não encontrado/i.test(d.body.textContent || '');
const svgs = [...d.querySelectorAll('svg')];
r.svgs = svgs.length;
r.svgs_sem_tamanho = svgs.filter((s) => !s.getAttribute('width') && !s.getAttribute('height') && !/svg\s*\{[^}]*width/.test('')).length;
r.svgs_gigantes = svgs.filter((s) => { const w = s.getAttribute('width'), h = s.getAttribute('height'); return (w && +parseFloat(w) > 64) || (h && +parseFloat(h) > 64) || /width:\s*(100%|100vw)/.test(s.getAttribute('style') || ''); }).length;
r.nav_itens = d.querySelectorAll('#sidebar .nav-item, #sidebar .menu-item, #sidebar a').length;
r.cards = d.querySelectorAll('.card, .metric, .kpi').length;
r.moeda = /R\$/.test(d.body.textContent || '');
r.view_chars = (view?.textContent || '').length;
r.view_excerto = (view?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 260);
r.sidebar_excerto = (d.querySelector('#sidebar')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300);
r.menu = [...d.querySelectorAll('#sidebar .nav-item, #sidebar .menu-item, #sidebar a')].map((n) => (n.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 34);
if (process.env.SNAPSHOT_OUT) {
  d.getElementById('boot')?.remove();
  if (app) app.hidden = false;
  const css = fs.readFileSync(path.join(ROOT, 'public/css/app.css'), 'utf8');
  fs.writeFileSync(path.join(ROOT, process.env.SNAPSHOT_OUT), `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${d.title}</title><style>\n${css}\n</style></head><body>\n${d.body.innerHTML}\n</body></html>`);
  r.snapshot = process.env.SNAPSHOT_OUT;
}
console.log('RESUMO ' + JSON.stringify(r));
process.exit(0);
