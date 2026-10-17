/* Carrega o dist/ EXATAMENTE como o Firebase entrega (arquivos estáticos, sem API)
   e verifica se o sistema abre. Salva captura autocontida (CSS embutido).
   RENDER_MODE=login | app   SNAPSHOT_OUT=caminho.html   */
import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const MODE = process.env.RENDER_MODE || 'login';
const OUT = process.env.SNAPSHOT_OUT || '';
const res = { modo: MODE, entrega: 'arquivos estaticos (sem API)', offline: true };
const errs = [];
process.on('unhandledRejection', (e) => errs.push('rejeicao: ' + String((e && e.message) || e)));

try {
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errs.push('jsdomError: ' + String((e && e.message) || e).slice(0, 180)));
  const dom = new JSDOM(fs.readFileSync(path.join(DIST, 'index.html'), 'utf8'), { url: 'https://exemplo.test/', pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole: vc });
  const { window } = dom;
  window.Response = Response; window.Headers = Headers; window.Request = Request; window.AbortController = AbortController;
  window.fetch = function (u) {
    const s = String(u);
    if (s.indexOf('api-snapshot.json') >= 0) return Promise.resolve(new Response(fs.readFileSync(path.join(DIST, 'api-snapshot.json')), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    return Promise.resolve(new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/html' } }));
  };
  window.eval(fs.readFileSync(path.join(DIST, 'config.js'), 'utf8').toString());          // liga o modo demonstração
  window.eval(fs.readFileSync(path.join(DIST, 'js/static-demo.js'), 'utf8').toString());   // camada de demonstração
  res.modo_demo_ligado = window.ECLESIA_STATIC_DEMO === true;
  if (MODE === 'app') window.localStorage.setItem('eo_token', 'demo.admin@eclesiaone.app');

  window.matchMedia = window.matchMedia || ((q) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.scrollTo = () => {}; window.alert = () => {}; window.confirm = () => true; window.prompt = () => null;
  window.URL.createObjectURL = () => 'blob:x'; window.Element.prototype.scrollIntoView = function () {};
  try { Object.defineProperty(window.navigator, 'serviceWorker', { value: { register: () => Promise.resolve({ addEventListener() {} }), ready: Promise.resolve({}) }, configurable: true }); } catch {}
  for (const k of ['document','localStorage','HTMLElement','Node','Event','CustomEvent','FormData','SVGElement','MutationObserver','requestAnimationFrame','cancelAnimationFrame','getComputedStyle','Blob','File','FileReader','URL','matchMedia','history']) if (window[k] !== undefined) globalThis[k] = window[k];
  globalThis.window = window; globalThis.location = window.location;
  globalThis.scrollTo = () => {}; globalThis.alert = () => {};
  globalThis.fetch = window.fetch;
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true });

  try { await import(`${path.join(DIST, 'js/app.js')}?v=${Date.now()}`); res.import_ok = true; } catch (e) { res.import_ok = false; res.erro_import = e.message; }
  await new Promise((r) => setTimeout(r, 5500));

  const d = window.document, app = d.getElementById('app'), view = d.getElementById('view'), sb = d.getElementById('sidebar');
  res.boot_oculto = d.getElementById('boot') ? d.getElementById('boot').hidden : null;
  res.app_visivel = app ? app.hidden === false : null;
  res.tela_acesso = !!d.querySelector('.auth-form');
  res.campos_login = !!d.querySelector('input[name=email]') && !!d.querySelector('input[name=password]');
  res.contas_demo_na_tela = d.querySelectorAll('.demo-creds .acct').length;
  res.faixa_demo = !!d.querySelector('.demo-ribbon');
  res.itens_menu = d.querySelectorAll('#sidebar .nav-item').length;
  res.cards = d.querySelectorAll('.card, .metric').length;
  res.moeda = /R\$/.test(d.body.textContent || '');
  res.view_chars = (view ? view.innerHTML.length : 0);
  res.view_excerto = (view ? view.textContent : '').replace(/\s+/g, ' ').trim().slice(0, 260);
  res.arvore = { sidebar: !!sb, shell: !!(sb && sb.nextElementSibling && sb.nextElementSibling.className.indexOf('shell') >= 0) };
  res.menu = [...d.querySelectorAll('#sidebar .nav-group-title')].map((n) => n.textContent.trim()).slice(0, 12);

  if (OUT) {
    if (d.getElementById('boot')) d.getElementById('boot').remove();
    if (app) app.hidden = false;
    const css = fs.readFileSync(path.join(DIST, 'css/app.css'), 'utf8').toString();
    let corpo = d.body.innerHTML;
    if (process.env.SNAPSHOT_NAV === '1') corpo = corpo.replace('<body', '<body class="nav-open"');
    fs.writeFileSync(path.join(ROOT, OUT), `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Eclesia One — ${MODE}</title><style>\n${css}\n</style></head><body${process.env.SNAPSHOT_NAV === '1' ? ' class="nav-open"' : ''}>\n${corpo}\n</body></html>`);
    res.snapshot = OUT + ' (' + Math.round(fs.statSync(path.join(ROOT, OUT)).size / 1024) + ' KB)';
  }
} catch (e) { res.erro_fatal = e.message; }
res.erros = errs.slice(0, 4);
console.log('RESUMO ' + JSON.stringify(res));
