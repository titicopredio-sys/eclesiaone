import { JSDOM } from 'jsdom';
import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const MODE = process.env.RENDER_MODE || 'login';
const res = { mode: MODE, base: BASE };

const lr = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@eclesiaone.app', password: 'Eclesia@2026' }) });
const lj = await lr.json();
res.login_servidor = { status: lr.status, token: !!lj.token, papel: lj.user?.role, igreja: lj.user?.church_name };

const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: `${BASE}/`, pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.ECLESIA_API_BASE = '';                       // mesma origem, como no index.html
if (MODE === 'app') window.localStorage.setItem('eo_token', lj.token);
for (const k of ['window', 'document', 'localStorage', 'location', 'HTMLElement', 'Node', 'Event', 'CustomEvent', 'FormData', 'SVGElement', 'MutationObserver', 'requestAnimationFrame']) {
  if (window[k] !== undefined) globalThis[k] = window[k];
}
globalThis.location = window.location;
globalThis.scrollTo = () => {}; globalThis.fetch = (u, o) => fetch(String(u).startsWith('http') ? u : BASE + u, o);
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true });
window.scrollTo = () => {};
window.addEventListener('error', (e) => { res.erro_js = String(e.message || e.error); });

try {
  const mod = await import(`${path.join(ROOT, 'public/js/app.js')}?v=${Date.now()}`);
  res.app_version = mod.APP_VERSION || '(sem APP_VERSION)';
  res.rotas = Object.keys(mod).filter((k) => /ROUTES|PAGES|MODULES|RES_|NAV/.test(k));
} catch (e) { res.erro_import = e.message; }
await new Promise((r) => setTimeout(r, 3500));

const d = window.document;
const app = d.getElementById('app');
const view = d.getElementById('view');
res.travou_em_carregando = /Carregando o centro de comando/.test(d.body.textContent || '');
res.app_visivel = app ? app.hidden === false : null;
res.possui_form_login = !!d.querySelector('input[name=email]') && !!d.querySelector('input[name=password]');
res.features_signup = /Criar minha igreja|Cadastrar minha igreja/i.test(d.body.textContent || '');
res.total_svg = d.querySelectorAll('svg').length;
res.svg_gigante = [...d.querySelectorAll('svg')].filter((s) => {
  const w = s.getAttribute('width'), h = s.getAttribute('height'); const cs = (s.getAttribute('style') || '');
  return (w && +parseFloat(w) > 64) || (h && +parseFloat(h) > 64) || /width:\s*100%/.test(cs);
}).length;
res.nav_itens = d.querySelectorAll('#sidebar .nav-item').length;
res.grupos_menu = d.querySelectorAll('#sidebar .nav-group, #sidebar .nav-section').length;
res.sidebar_txt = (d.querySelector('#sidebar')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 400);
res.topbar_txt = (d.querySelector('#topbar')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200);
res.view_len = (view?.textContent || '').length;
res.view_txt = (view?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 700);
res.tem_moeda = /R\$/.test(d.body.textContent || '');
res.cards = d.querySelectorAll('.card, .metric, .kpi').length;
res.modulos_menu = [...d.querySelectorAll('#sidebar .nav-item')].map((n) => (n.textContent || '').replace(/\s+/g, ' ').trim()).slice(0, 40);
res.titulo = d.title;

if (process.env.SNAPSHOT_OUT) {
  const css = fs.readFileSync(path.join(ROOT, 'public/css/app.css'), 'utf8');
  const doc = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${res.titulo}</title><style>\n${css}\n</style></head><body>\n${d.body.innerHTML}\n</body></html>`;
  fs.writeFileSync(path.join(ROOT, process.env.SNAPSHOT_OUT), doc);
  res.snapshot = process.env.SNAPSHOT_OUT + ' (' + fs.statSync(path.join(ROOT, process.env.SNAPSHOT_OUT)).size + ' bytes)';
}
console.log('OBSERVACOES ' + MODE + ' :: ' + JSON.stringify(res, null, 1));
process.exit(0);
