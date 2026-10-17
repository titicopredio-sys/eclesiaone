/* Captura o estado REAL do DOM depois de carregar o public/js/app.js, para
   inspeção visual fora do navegador. Salva HTML autocontido (CSS embutido).
   RENDER_MODE=login | app | signup */
import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const MODE = process.env.RENDER_MODE || 'login';
const OUT = process.env.SNAPSHOT_OUT || `docs/captura-${MODE}.html`;

const j = await (await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@eclesiaone.app', password: 'Eclesia@2026' }) })).json();
const vc = new VirtualConsole(); const logs = [];
vc.on('jsdomError', (e) => logs.push('jsdomError: ' + (e.message || e))); vc.on('error', (m, ...a) => logs.push('error: ' + m));

const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8'), { url: `${BASE}/`, pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole: vc });
const { window } = dom;
window.ECLESIA_API_BASE = '';
if (MODE !== 'login') window.localStorage.setItem('eo_token', j.token);
window.matchMedia = window.matchMedia || ((q) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
window.scrollTo = () => {}; window.alert = () => {}; window.confirm = () => true; window.prompt = () => null;
window.URL.createObjectURL = () => 'blob:x'; window.URL.revokeObjectURL = () => {};
window.IntersectionObserver = window.IntersectionObserver || class { observe() {} unobserve() {} disconnect() {} };
window.ResizeObserver = window.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
window.Element.prototype.scrollIntoView = function () {};
try { Object.defineProperty(window.navigator, 'serviceWorker', { value: { register: () => Promise.resolve({ addEventListener() {} }), ready: Promise.resolve({}) }, configurable: true }); } catch {}
for (const k of ['document', 'localStorage', 'HTMLElement', 'Node', 'Event', 'CustomEvent', 'FormData', 'SVGElement', 'MutationObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'Blob', 'File', 'FileReader', 'URL', 'matchMedia', 'history']) if (window[k] !== undefined) globalThis[k] = window[k];
globalThis.window = window; globalThis.location = window.location;
globalThis.scrollTo = () => {}; globalThis.alert = () => {}; globalThis.confirm = () => true;
globalThis.fetch = (u, o) => fetch(String(u).startsWith('http') ? String(u) : BASE + String(u), o);
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true });

let importErr = null;
try { await import(`${path.join(ROOT, 'public/js/app.js')}?v=${Date.now()}`); } catch (e) { importErr = e.message; }
await new Promise((r) => setTimeout(r, 4500));

const d = window.document;
const boot = d.getElementById('boot'), app = d.getElementById('app');
const authRoot = d.getElementById('auth-root');
const view = d.getElementById('view');
const sidebar = d.getElementById('sidebar');
const txt = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
console.log(JSON.stringify({
  modo: MODE, import_erro: importErr, erro_js: logs.slice(0, 3),
  boot_oculto: boot?.hidden, app_oculto: app?.hidden,
  auth_root: authRoot ? authRoot.innerHTML.length : 0,
  view_chars: (view?.innerHTML || '').length,
  sidebar_itens: d.querySelectorAll('#sidebar .nav-item').length,
  inputs: [...d.querySelectorAll('input')].map((i) => i.type + ':' + (i.name || i.id || '?')).join(', '),
  texto_auth: txt(authRoot).slice(0, 220),
  texto_view: txt(view).slice(0, 220),
  texto_sidebar: txt(sidebar).slice(0, 220)
}));
if (OUT !== 'none') {
  boot?.remove();
  d.getElementById('auth-root') && (d.getElementById('auth-root').hidden = false);
  if (app) { app.hidden = false; }
  const css = fs.readFileSync(path.join(ROOT, 'public/css/app.css'), 'utf8');
  fs.writeFileSync(path.join(ROOT, OUT), `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Eclesia One — ${MODE}</title><style>\n${css}\n</style></head><body>\n${d.body.innerHTML}\n</body></html>`);
  console.log('  snapshot:', OUT, fs.statSync(path.join(ROOT, OUT)).size, 'bytes');
}
