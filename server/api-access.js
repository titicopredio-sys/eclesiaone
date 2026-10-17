/**
 * Eclesia One - Acesso e rede de igrejas:
 *   GET  /api/setup/status    existe usuario cadastrado?
 *   POST /api/setup           primeiro acesso: cria administrador geral + 1a igreja
 *   POST /api/signup          auto-cadastro: cria igreja nova + Pastor ADM
 *   GET  /api/churches        (super admin) visao da rede com contadores
 *   POST /api/churches        (super admin) cria igreja + Pastor ADM
 * O isolamento entre igrejas e garantido por church_id em todas as consultas.
 */
import { one, all, scalar } from './db.js';
import { signToken, jwtSecret } from './lib.js';
import { hydrateUser, permissionMatrix, audit, MODULES } from './auth.js';
import { createChurch, createUser, emailTaken, generatePassword, tenantStats, churchById, ensureChurchRoles } from './tenancy.js';
import { json } from './api-core.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sessionFor(userId) {
  const row = one(
    `SELECT u.*, c.name AS church_name FROM users u LEFT JOIN churches c ON c.id = u.church_id WHERE u.id = ?`,
    [userId]
  );
  const user = hydrateUser(row);
  return { token: signToken({ sub: userId }, jwtSecret()), user, permissions: permissionMatrix(user), modules: MODULES };
}

function validateAccess(body) {
  const errors = [];
  if (!body.church_name || String(body.church_name).trim().length < 2) errors.push('Informe o nome da igreja.');
  if (!body.name || String(body.name).trim().length < 2) errors.push('Informe o seu nome.');
  if (!EMAIL_RE.test(String(body.email || ''))) errors.push('Informe um e-mail válido.');
  if (String(body.password || '').length < 8) errors.push('A senha deve ter ao menos 8 caracteres.');
  if (body.email && emailTaken(body.email)) errors.push('Este e-mail já está em uso neste sistema.');
  return errors;
}

export function registerAccessRoutes(router) {
  const authed = (handler) => async (req, res, ctx) => (ctx.user ? handler(req, res, ctx) : json(res, 401, { error: 'Sessão expirada.' }));

  /* --------------------------------------------------------- primeiro acesso */
  router.add('GET', '/api/setup/status', async (req, res) => {
    const usuarios = Number(scalar('SELECT COUNT(*) FROM users WHERE deleted_at IS NULL') || 0);
    const igrejas = Number(scalar('SELECT COUNT(*) FROM churches WHERE deleted_at IS NULL') || 0);
    return json(res, 200, {
      needs_setup: usuarios === 0,
      usuarios, igrejas,
      signup_enabled: process.env.SIGNUP_DISABLED !== 'true',
    });
  });

  router.add('POST', '/api/setup', async (req, res) => {
    const usuarios = Number(scalar('SELECT COUNT(*) FROM users WHERE deleted_at IS NULL') || 0);
    if (usuarios > 0) return json(res, 409, { error: 'Este sistema já possui usuários. Entre com sua conta para criar novas igrejas e usuários.' });
    const body = req.body || {};
    const errors = validateAccess(body);
    if (errors.length) return json(res, 422, { error: errors.join(' ') });
    const churchId = createChurch({ name: body.church_name, city: body.city, state: body.state });
    const userId = createUser({ churchId, name: body.name, email: body.email, password: body.password, role: 'super_admin' });
    audit({ churchId, user: { id: userId, name: body.name }, action: 'primeiro_acesso', module: 'configuracoes', resource: 'users', recordId: userId, after: { church: body.church_name }, ip: req.ip });
    return json(res, 201, { ...sessionFor(userId), church_id: churchId, message: 'Administrador geral criado com sucesso.' });
  });

  /* --------------------------------------------- auto-cadastro de Pastor ADM */
  router.add('POST', '/api/signup', async (req, res) => {
    if (process.env.SIGNUP_DISABLED === 'true') return json(res, 403, { error: 'O auto-cadastro está desativado. Solicite o acesso ao administrador do sistema.' });
    const body = req.body || {};
    const errors = validateAccess(body);
    if (errors.length) return json(res, 422, { error: errors.join(' ') });
    const churchId = createChurch({ name: body.church_name, city: body.city, state: body.state, email: body.email });
    const userId = createUser({ churchId, name: body.name, email: body.email, password: body.password, role: 'pastor_adm' });
    audit({ churchId, user: { id: userId, name: body.name }, action: 'criar', module: 'configuracoes', resource: 'churches', recordId: churchId, after: { nome: body.church_name, pastor_adm: body.email }, ip: req.ip });
    return json(res, 201, {
      ...sessionFor(userId), church_id: churchId,
      message: 'Igreja criada. Você é o Pastor ADM (administrador) desta igreja — os dados ficam isolados das demais.',
    });
  });

  /* ------------------------------------------------------------ rede (tenants) */
  router.add('GET', '/api/churches', authed(async (req, res, ctx) => {
    if (ctx.user.role !== 'super_admin') return json(res, 403, { error: 'A visão da rede é exclusiva do administrador geral. Cada igreja administra os próprios dados.' });
    const rows = all('SELECT id, name, city, state, email, is_demo, onboarded, created_at FROM churches WHERE deleted_at IS NULL ORDER BY name');
    const data = rows.map((c) => ({ ...c, ...tenantStats(c.id) }));
    return json(res, 200, {
      data,
      meta: {
        total: data.length,
        pessoas: data.reduce((s, r) => s + r.pessoas, 0),
        usuarios: data.reduce((s, r) => s + r.usuarios, 0),
        celulas: data.reduce((s, r) => s + r.celulas, 0),
      },
    });
  }));

  router.add('POST', '/api/churches', authed(async (req, res, ctx) => {
    if (ctx.user.role !== 'super_admin') return json(res, 403, { error: 'Somente o administrador geral cria novas igrejas na rede.' });
    const body = req.body || {};
    if (!body.name || String(body.name).trim().length < 2) return json(res, 422, { error: 'Informe o nome da igreja.' });
    let adminEmail = String(body.admin_email || '').trim().toLowerCase();
    if (adminEmail && !EMAIL_RE.test(adminEmail)) return json(res, 422, { error: 'Informe um e-mail válido para o Pastor ADM.' });
    if (adminEmail && emailTaken(adminEmail)) return json(res, 409, { error: 'Este e-mail já está em uso por outro usuário.' });
    if (adminEmail && String(body.admin_password || '').length > 0 && String(body.admin_password).length < 8) {
      return json(res, 422, { error: 'A senha provisória deve ter ao menos 8 caracteres.' });
    }
    const churchId = createChurch({ name: body.name, city: body.city, state: body.state, email: body.admin_email });
    let admin = null;
    let senhaProvisoria = null;
    if (adminEmail) {
      senhaProvisoria = body.admin_password && String(body.admin_password).length >= 8 ? String(body.admin_password) : generatePassword(12);
      const userId = createUser({ churchId, name: body.admin_name || `Pastor ADM — ${body.name}`, email: adminEmail, password: senhaProvisoria, role: 'pastor_adm' });
      admin = { id: userId, name: body.admin_name || null, email: adminEmail, role: 'pastor_adm' };
    }
    audit({ churchId: ctx.user.church_id, user: ctx.user, action: 'criar', module: 'configuracoes', resource: 'churches', recordId: churchId, after: { nome: body.name, pastor_adm: adminEmail || null }, ip: req.ip });
    return json(res, 201, {
      church_id: churchId,
      name: churchById(churchId)?.name || body.name,
      roles_criados: ensureChurchRoles(churchId),
      admin,
      senha_provisoria: senhaProvisoria,
      data: { church_id: churchId, name: body.name, ...tenantStats(churchId), is_demo: 0, city: body.city || null, created_at: new Date().toISOString().slice(0, 10) },
      message: 'Igreja criada com perfis padrão. Entregue as credenciais ao Pastor ADM.',
    });
  }));
}
