/**
 * Eclesia One - Servidor HTTP (Node puro, zero dependencias).
 * - API REST em /api/*
 * - Arquivos estaticos (PWA) em /public
 * - Autenticacao JWT + RBAC por modulo/acao
 * - Tratamento centralizado de erros (usuario final nunca ve stack trace)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, one } from './db.js';
import { createRouter, verifyToken } from './lib.js';
import { hydrateUser } from './auth.js';
import { registerCoreRoutes, json } from './api-core.js';
import { registerAccessRoutes } from './api-access.js';
import { registerDataRoutes } from './api-data.js';
import { registerMetaRoutes } from './api-meta.js';
import { registerOpsRoutes } from './api-ops.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'eclesia-one-dev-secret';

process.on('warning', (w) => { if (w.name !== 'ExperimentalWarning') console.warn(w); });

/* --------------------------------------------------------------- banco */
const dbFile = process.env.DB_FILE || path.join(ROOT, 'data', 'eclesia.db');
openDatabase(dbFile);

/* -------------------------------------------------------------- router */
const router = createRouter();
// Rotas especializadas primeiro: garantem que caminhos reservados
// (ex.: /api/cells/panel, /api/reports/:kind, /api/eventos/checkin) não sejam
// capturados pelo CRUD genérico de recursos.
registerAccessRoutes(router);
registerDataRoutes(router);
registerMetaRoutes(router);
registerOpsRoutes(router);
registerCoreRoutes(router);

router.add('GET', '/api/health', async (req, res) => json(res, 200, { status: 'ok', app: 'Eclesia One', version: APP_VERSION, time: new Date().toISOString() }));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf', '.csv': 'text/csv; charset=utf-8',
};

function serveStatic(req, res, pathname) {
  // Asset com extensao conhecida e arquivo ausente nunca deve receber o shell SPA:
  // responder HTML para /js/*.js faria o navegador bloquear o modulo (MIME text/html).
  if (/\.(js|mjs|css|json|webmanifest|svg|png|jpg|jpeg|ico|woff2)$/i.test(pathname)) {
    const abs = path.join(PUBLIC_DIR, pathname.replace(/^\/+/, ''));
    if (!fs.existsSync(abs)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Recurso não encontrado: ${pathname}`);
      return;
    }
  }
  let rel = pathname === '/' ? '/index.html' : pathname;
  rel = decodeURIComponent(rel.split('?')[0]);
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) return json(res, 403, { error: 'Acesso negado.' });
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // SPA fallback: qualquer rota desconhecida entrega o app
    const index = path.join(PUBLIC_DIR, 'index.html');
    if (!fs.existsSync(index)) return json(res, 404, { error: 'Recurso não encontrado.' });
    const html = fs.readFileSync(index);
    res.writeHead(200, { 'Content-Type': MIME['.html'], 'Content-Length': html.length, 'Cache-Control': 'no-cache' });
    return res.end(html);
  }
  const ext = path.extname(filePath).toLowerCase();
  const buf = fs.readFileSync(filePath);
  const isHtml = ext === '.html';
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': buf.length,
    'Cache-Control': isHtml || ext === '.js' || ext === '.css' || ext === '.webmanifest' ? 'no-cache' : 'public, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
  });
  res.end(buf);
}

async function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Payload muito grande.'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      const ct = String(req.headers['content-type'] || '');
      if (ct.includes('application/json')) {
        try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(Object.assign(new Error('JSON inválido no corpo da requisição.'), { status: 400 })); }
      } else if (ct.includes('application/x-www-form-urlencoded')) {
        resolve(Object.fromEntries(new URLSearchParams(raw)));
      } else {
        try { resolve(JSON.parse(raw)); } catch { resolve({ _raw: raw }); }
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);

  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  try {
    const route = router.match(req.method, pathname);
    if (!route) {
      const allowed = [...new Set(router.allowedMethods(pathname))];
      return json(res, allowed.length ? 405 : 404, {
        error: allowed.length ? `Método ${req.method} não permitido nesta rota.` : 'Rota de API não encontrada.',
        allowed,
      });
    }
    req.query = Object.fromEntries(url.searchParams);
    req.params = route.params;
    req.body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
    req.ip = ip;

    // autenticacao
    const header = String(req.headers.authorization || '');
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
    const token = bearer || (pathname.startsWith('/api/qr') ? null : null);
    let user = null;
    if (token) {
      const payload = verifyToken(token, JWT_SECRET);
      if (payload) {
        const row = one(
          `SELECT u.*, c.name AS church_name FROM users u LEFT JOIN churches c ON c.id = u.church_id
           WHERE u.id = ? AND u.active = 1 AND u.deleted_at IS NULL`, [payload.sub]
        );
        if (row) user = hydrateUser(row);
      }
    }
    await route.handler(req, res, { user, params: route.params, ip });
  } catch (err) {
    const status = err.status || 500;
    // Log tecnico interno; usuario final recebe mensagem amigavel.
    console.error(`[ERRO ${status}] ${req.method} ${pathname} ::`, err.message);
    if (!res.headersSent) {
      json(res, status, {
        error: status === 500 ? 'Não foi possível concluir a operação. A equipe técnica registrou o ocorrido.' : err.message,
      });
    }
  } finally {
    if (process.env.LOG_REQUESTS !== 'false') {
      console.log(`${req.method} ${pathname} -> ${res.statusCode} (${Date.now() - started}ms)`);
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Eclesia One — Centro de Comando Digital da Igreja`);
  console.log(`  Servidor ativo em http://localhost:${PORT}`);
  console.log(`  Banco de dados: ${dbFile}\n`);
});

export { server, router };
