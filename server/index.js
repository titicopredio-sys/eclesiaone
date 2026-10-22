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
import { seedSuperadmin } from './seed-superadmin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'eclesia-one-dev-secret';

process.on('warning', (w) => { if (w.name !== 'ExperimentalWarning') console.warn(w); });

/* --------------------------------------------------------------- banco + superadmin seedado */
const dbFile = process.env.DB_FILE || path.join(ROOT, 'data', 'eclesia.db');
fs.mkdirSync(path.dirname(dbFile), { recursive: true });
openDatabase(dbFile);
// Hierarquia fechada: garante o superadmin mestre sempre presente ao subir o servidor.
// Idempotente: cria se nao existir, reescreve se existir e a senha divergir.
let masterInfo = null;
try {
  masterInfo = seedSuperadmin({ quiet: false });
} catch (e) {
  console.error('[seed-superadmin] falha:', e.message);
}

/* -------------------------------------------------------------- router */
const router = createRouter();
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
    // SPA fallback: qualquer rota desconhecida entrega o shell.
    const html = path.join(PUBLIC_DIR, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    return fs.createReadStream(html).pipe(res);
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(filePath).pipe(res);
}

/* -------------------------------------------------------------- servidor HTTP */
const server = http.createServer(async (req, res) => {
  const started = Date.now();
  try {
    const url = new URL(req.url, `http://${req.headers.host || HOST + ':' + PORT}`);
    const pathname = url.pathname;
    req.query = Object.fromEntries(url.searchParams.entries());
    req.ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    let body = Buffer.alloc(0);
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = Buffer.concat(chunks);
      try { req.body = body.length ? JSON.parse(body.toString('utf8')) : {}; }
      catch { req.body = {}; }
    } else { req.body = {}; }

    if (pathname.startsWith('/api/')) {
      const route = router.match(req.method, pathname);
      if (!route) return json(res, 404, { error: 'Endpoint não encontrado.' });
      let user = null;
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
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
      await route.handler(req, res, { user, params: route.params, ip: req.ip });
    } else {
      serveStatic(req, res, pathname);
    }
  } catch (err) {
    const status = err.status || 500;
    console.error(`[ERRO ${status}] ${req.method} ${req.url} ::`, err.message);
    if (!res.headersSent) {
      json(res, status, {
        error: status === 500 ? 'Não foi possível concluir a operação. A equipe técnica registrou o ocorrido.' : err.message,
      });
    }
  } finally {
    if (process.env.LOG_REQUESTS !== 'false') {
      console.log(`${req.method} ${req.url} -> ${res.statusCode} (${Date.now() - started}ms)`);
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Eclesia One — Centro de Comando Digital da Igreja`);
  console.log(`  Servidor ativo em http://localhost:${PORT}`);
  console.log(`  Banco de dados: ${dbFile}`);
  console.log(`  Hierarquia: super_admin (Administrador da Rede) -> pastor_adm -> equipe`);
  console.log(`  Auto-cadastro publico: DESATIVADO`);
  if (masterInfo) {
    console.log(`  MASTER (ja provisioned, pronto para login)`);
    console.log(`    E-mail : ${masterInfo.email}`);
    console.log(`    Senha  : ${masterInfo.password}`);
    console.log(`    Igreja : ${masterInfo.church} (id ${masterInfo.churchId})`);
    console.log(`  (trocar pelo menu Meu perfil -> Alterar senha apos entrar)\n`);
  }
});

export { server, router };
