/**
 * Eclesia One - Acesso e rede de igrejas (hierarquia fechada).
 *   GET  /api/setup/status       existe super admin?
 *   POST /api/signup             BLOQUEADO: sempre 403 (hierarquia fechada)
 *   GET  /api/churches           (superadmin) visão da rede com contadores
 *   POST /api/churches           (superadmin) cria igreja + Pastor ADM
 *   POST /api/churches/:id/church_admin (superadmin) troca pastor_adm
 *   GET  /api/team               (pastor_adm | superadmin) lista equipe
 *   POST /api/team               (pastor_adm | superadmin) cria usuário da equipe
 *   POST /api/team/:id           (pastor_adm | superadmin) atualiza usuário
 *   DELETE /api/team/:id         (pastor_adm | superadmin) desativa usuário
 *   POST /api/team/:id/reset-password gera senha provisória
 *   O isolamento entre igrejas é garantido por church_id em todas as consultas.
 */
import { one, all, scalar, run, insert, transaction } from './db.js';
import { signToken, jwtSecret, hashPassword, isoNow } from './lib.js';
import { authenticate, hydrateUser, permissionMatrix, audit, isChurchAdmin, CHURCH_ADMIN_ROLES, MODULES, ALL_ACTIONS } from './auth.js';
import { json, errorMessage } from './api-core.js';
import { createChurch, createUser, emailTaken, tenantStats, churchById, ensureChurchRoles, generatePassword } from './tenancy.js';


const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STAFF_BLOCKED = new Set(['super_admin', 'pastor_adm']); // apenas super_admin cria pastor_adm

function sessionFor(userId) {
  const row = one(
    `SELECT u.*, c.name AS church_name FROM users u LEFT JOIN churches c ON c.id = u.church_id WHERE u.id = ?`,
    [userId]
  );
  const user = hydrateUser(row);
  return { token: signToken({ sub: userId }, jwtSecret()), user, permissions: permissionMatrix(user), modules: MODULES };
}

function canManageStaff(user) {
  return user && (user.role === 'super_admin' || user.role === 'pastor_adm');
}

/** Buscar perfil (role) por slug dentro da igreja do solicitante. */
function roleInChurch(churchId, slug) {
  return one('SELECT id, slug, name, permissions FROM roles WHERE church_id = ? AND slug = ? AND deleted_at IS NULL', [churchId, slug]);
}

/** Constrói matriz de permissões permitidas para um novo usuário dentro da igreja. */
function normalizePermissions(role, customPerms) {
  const base = (() => {
    try { return JSON.parse(role?.permissions || '{}'); } catch { return {}; }
  })();
  // pastor_adm e super_admin sempre têm ALL em todos os módulos: não aceitam customização.
  if (role && (role.slug === 'super_admin' || role.slug === 'pastor_adm')) return base;
  // customPerms: { modulo: [acao1, acao2], ... } — aplica-se APENAS se o papel base permitir
  const out = {};
  for (const m of MODULES) out[m] = [];
  // começa com o que o perfil permite
  for (const m of Object.keys(base)) {
    if (Array.isArray(base[m])) out[m] = [...base[m]];
  }
  if (customPerms && typeof customPerms === 'object') {
    for (const m of Object.keys(customPerms)) {
      if (!out[m]) out[m] = [];
      const acoes = (customPerms[m] || []).filter((a) => ALL_ACTIONS.includes(a));
      for (const a of acoes) if (!out[m].includes(a)) out[m].push(a);
    }
  }
  return out;
}

export function registerAccessRoutes(router) {
  const authed = (handler) => async (req, res, ctx) => (ctx.user ? handler(req, res, ctx) : json(res, 401, { error: 'Sessão expirada. Faça login novamente.' }));
  const admin = (handler) => async (req, res, ctx) => (ctx.user && isChurchAdmin(ctx.user) ? handler(req, res, ctx) : json(res, 403, { error: 'Acesso restrito ao administrador.' }));

  /* ============================================================ /api/setup/status */
  router.add('GET', '/api/setup/status', async (req, res) => {
    const usuarios = Number(scalar('SELECT COUNT(*) FROM users WHERE deleted_at IS NULL') || 0);
    const igrejas = Number(scalar('SELECT COUNT(*) FROM churches WHERE deleted_at IS NULL') || 0);
    const hasSuper = Number(scalar(`SELECT COUNT(*) FROM users WHERE role = 'super_admin' AND deleted_at IS NULL`) || 0) > 0;
    return json(res, 200, {
      needs_setup: !hasSuper,
      usuarios, igrejas, has_super: hasSuper,
      signup_enabled: false, // hierarquia fechada: nunca permitir auto-cadastro pela tela de login
    });
  });

  /* ============================================================ /api/signup — BLOQUEADO */
  router.add('POST', '/api/signup', async (req, res) => {
    return json(res, 403, { error: 'O cadastro público está desativado. Entre em contato com o administrador da rede (Thiago) para abrir uma nova igreja na plataforma.' });
  });

  /* ============================================================ /api/setup — HERDADO, mas USADO APENAS PELO PROVISION-MASTER */
  router.add('POST', '/api/setup', async (req, res) => {
    return json(res, 403, { error: 'O primeiro acesso é feito via CLI (npm run master). A tela de login não permite criar igreja ou usuário anônimo.' });
  });

  /* ============================================================ REDE (apenas super_admin) */
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
    if (!adminEmail || !EMAIL_RE.test(adminEmail)) return json(res, 422, { error: 'Informe um e-mail válido para o Pastor ADM.' });
    if (emailTaken(adminEmail)) return json(res, 409, { error: 'Este e-mail já está em uso por outro usuário.' });
    if (body.admin_password && String(body.admin_password).length > 0 && String(body.admin_password).length < 8) {
      return json(res, 422, { error: 'A senha provisória deve ter ao menos 8 caracteres.' });
    }
    const churchId = createChurch({ name: body.name, city: body.city, state: body.state, email: adminEmail });
    const senhaProvisoria = body.admin_password && String(body.admin_password).length >= 8 ? String(body.admin_password) : generatePassword(12);
    const userId = createUser({ churchId, name: body.admin_name || `Pastor ADM — ${body.name}`, email: adminEmail, password: senhaProvisoria, role: 'pastor_adm' });
    const adminInfo = { id: userId, name: body.admin_name || null, email: adminEmail, role: 'pastor_adm' };
    audit({ churchId, user: ctx.user, action: 'criar_igreja', module: 'configuracoes', resource: 'churches', recordId: churchId, after: { nome: body.name, pastor_adm: adminEmail }, ip: req.ip });
    return json(res, 201, {
      church_id: churchId,
      name: churchById(churchId)?.name || body.name,
      roles_criados: ensureChurchRoles(churchId).length,
      admin: adminInfo,
      senha_provisoria: senhaProvisoria,
      data: { church_id: churchId, name: body.name, ...tenantStats(churchId), is_demo: 0, city: body.city || null, created_at: new Date().toISOString().slice(0, 10) },
      message: 'Igreja criada com perfis padrão. Entregue as credenciais ao Pastor ADM — ele(a) definirá quem entra na equipe.',
    });
  }));

  /* velocidade de troca do pastor_adm (apenas super_admin com propósito de manutenção) */
  router.add('POST', '/api/churches/:id/replace-admin', authed(async (req, res, ctx) => {
    if (ctx.user.role !== 'super_admin') return json(res, 403, { error: 'Somente o administrador geral pode substituir o Pastor ADM.' });
    const churchId = Number(req.params.id);
    if (!churchById(churchId)) return json(res, 404, { error: 'Igreja não encontrada.' });
    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return json(res, 422, { error: 'Informe um e-mail válido.' });
    if (emailTaken(email)) return json(res, 409, { error: 'Este e-mail já está em uso por outro usuário.' });
    const senha = body.password && String(body.password).length >= 8 ? String(body.password) : generatePassword(12);
    const oldAdminId = scalar('SELECT id FROM users WHERE church_id = ? AND role = ? AND deleted_at IS NULL', [churchId, 'pastor_adm']);
    run(`UPDATE users SET role = 'membro' WHERE id = ?`, [oldAdminId]);
    const newId = createUser({ churchId, name: body.name || `Pastor ADM — ${churchById(churchId)?.name || ''}`, email, password: senha, role: 'pastor_adm' });
    audit({ churchId, user: ctx.user, action: 'trocar_pastor_adm', module: 'configuracoes', resource: 'users', recordId: newId, after: { novo_admin: email, antigo_admin_id: oldAdminId }, ip: req.ip });
    return json(res, 201, { admin_id: newId, email, senha_provisoria: senha, message: 'Pastor ADM substituído. A antiga conta foi rebaixada a membro.' });
  }));

  /* ============================================================ EQUIPE (escopada pela igreja) */
  router.add('GET', '/api/team', authed(async (req, res, ctx) => {
    if (!canManageStaff(ctx.user)) return json(res, 403, { error: 'A gestão da equipe é restrita ao Pastor ADM (ou super admin).' });
    const targetChurchId = ctx.user.role === 'super_admin'
      ? (req.query.church_id ? Number(req.query.church_id) : ctx.user.church_id)
      : ctx.user.church_id;
    const rows = all(
      `SELECT u.id, u.name, u.email, u.role, u.person_id, u.phone, u.active, u.require_reset, u.last_login, u.created_at,
              (SELECT name FROM roles WHERE church_id = u.church_id AND slug = u.role AND deleted_at IS NULL) AS role_name,
              (SELECT name FROM churches WHERE id = u.church_id AND deleted_at IS NULL) AS church_name
       FROM users u WHERE u.church_id = ? AND u.deleted_at IS NULL ORDER BY u.role, u.name`,
      [targetChurchId]
    );
    return json(res, 200, {
      data: rows,
      church_id: targetChurchId,
      church_name: one('SELECT name FROM churches WHERE id = ? AND deleted_at IS NULL', [targetChurchId])?.name || null,
      available_roles: availableRoles(targetChurchId),
      blocked_roles: ['super_admin', 'pastor_adm'],
      self_id: ctx.user.id,
    });
  }));

  router.add('POST', '/api/team', authed(async (req, res, ctx) => {
    if (!canManageStaff(ctx.user)) return json(res, 403, { error: 'A gestão da equipe é restrita ao Pastor ADM (ou super admin).' });
    const body = req.body || {};
    if (!body.name || String(body.name).trim().length < 2) return json(res, 422, { error: 'Informe o nome do usuário.' });
    const email = String(body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return json(res, 422, { error: 'Informe um e-mail válido.' });
    if (emailTaken(email)) return json(res, 409, { error: 'Este e-mail já está cadastrado no sistema.' });
    if (!body.password || String(body.password).length < 8) return json(res, 422, { error: 'A senha inicial deve ter ao menos 8 caracteres.' });
    const targetChurchId = ctx.user.role === 'super_admin'
      ? (body.church_id ? Number(body.church_id) : ctx.user.church_id)
      : ctx.user.church_id;
    const role = String(body.role || '').trim().toLowerCase();
    if (!role) return json(res, 422, { error: 'Selecione o perfil do novo usuário.' });
    if (STAFF_BLOCKED.has(role)) {
      return json(res, 403, { error: 'Este perfil só pode ser atribuído pelo superadmin (ao cadastrar a igreja ou substituir o administrador).' });
    }
    const roleRow = roleInChurch(targetChurchId, role);
    if (!roleRow) return json(res, 422, { error: 'Perfil não existe nesta igreja.' });
    const newId = transaction(() => {
      const id = createUser({
        churchId: targetChurchId,
        name: body.name,
        email,
        password: body.password,
        role,
        phone: body.phone || null,
      });
      run(`UPDATE users SET require_reset = ?, updated_at = ? WHERE id = ?`, [body.require_reset ? 1 : 0, isoNow(), id]);
      return id;
    });
    audit({ churchId: targetChurchId, user: ctx.user, action: 'criar_usuario', module: 'configuracoes', resource: 'users', recordId: newId, after: { name: body.name, email, role, church_id: targetChurchId }, ip: req.ip });
    return json(res, 201, { id: newId, name: body.name, email, role, church_id: targetChurchId, message: 'Usuário criado. Oriente-o(a) a trocar a senha no primeiro acesso.' });
  }));

  router.add('POST', '/api/team/:id', authed(async (req, res, ctx) => {
    if (!canManageStaff(ctx.user)) return json(res, 403, { error: 'A gestão da equipe é restrita ao Pastor ADM.' });
    const targetId = Number(req.params.id);
    const target = one(`SELECT * FROM users WHERE id = ? AND deleted_at IS NULL`, [targetId]);
    if (!target) return json(res, 404, { error: 'Usuário não encontrado.' });
    // isolamento por igreja (super_admin pode editar de qualquer igreja; pastor_adm só da sua)
    if (ctx.user.role !== 'super_admin' && Number(target.church_id) !== Number(ctx.user.church_id)) {
      return json(res, 403, { error: 'Usuário pertence a outra igreja. Você só pode editar usuários da sua igreja.' });
    }
    const body = req.body || {};
    if (body.role && STAFF_BLOCKED.has(String(body.role))) {
      return json(res, 403, { error: 'Apenas o superadmin pode atribuir Pastor ADM ou Super Admin.' });
    }
    const clean = {};
    if (body.name) clean.name = String(body.name);
    if (body.phone !== undefined) clean.phone = body.phone || null;
    if (body.active !== undefined) clean.active = body.active ? 1 : 0;
    if (body.password && String(body.password).length >= 8) clean.password_hash = hashPassword(body.password);
    if (body.role && !STAFF_BLOCKED.has(body.role)) clean.role = body.role;
    // permissões são derivadas do perfil base (não há override por usuário nesta versão).
    clean.updated_at = isoNow();
    const keys = Object.keys(clean);
    if (!keys.length) return json(res, 422, { error: 'Nada para atualizar.' });
    const sets = keys.map((k) => `${k} = ?`).join(', ');
    const args = keys.map((k) => clean[k]);
    args.push(targetId, target.church_id);
    run(`UPDATE users SET ${sets} WHERE id = ? AND church_id = ? AND deleted_at IS NULL`, args);
    audit({ churchId: target.church_id, user: ctx.user, action: 'editar_usuario', module: 'configuracoes', resource: 'users', recordId: targetId, before: target, after: clean, ip: req.ip });
    return json(res, 200, { message: 'Usuário atualizado.', data: { id: targetId, ...clean } });
  }));

  router.add('POST', '/api/team/:id/reset-password', authed(async (req, res, ctx) => {
    if (!canManageStaff(ctx.user)) return json(res, 403, { error: 'A gestão da equipe é restrita ao Pastor ADM.' });
    const targetId = Number(req.params.id);
    const target = one(`SELECT * FROM users WHERE id = ? AND deleted_at IS NULL`, [targetId]);
    if (!target) return json(res, 404, { error: 'Usuário não encontrado.' });
    if (ctx.user.role !== 'super_admin' && Number(target.church_id) !== Number(ctx.user.church_id)) {
      return json(res, 403, { error: 'Usuário pertence a outra igreja.' });
    }
    const provisional = generatePassword(12);
    run(`UPDATE users SET password_hash = ?, require_reset = 1, updated_at = ? WHERE id = ?`, [hashPassword(provisional), isoNow(), targetId]);
    audit({ churchId: target.church_id, user: ctx.user, action: 'reset_senha', module: 'configuracoes', resource: 'users', recordId: targetId, after: { email: target.email }, ip: req.ip });
    return json(res, 200, { email: target.email, senha_provisoria: provisional, message: 'Senha provisória gerada. Entregue ao usuário em canal seguro.' });
  }));

  router.add('DELETE', '/api/team/:id', authed(async (req, res, ctx) => {
    if (!canManageStaff(ctx.user)) return json(res, 403, { error: 'A gestão da equipe é restrita ao Pastor ADM.' });
    const targetId = Number(req.params.id);
    const target = one(`SELECT * FROM users WHERE id = ? AND deleted_at IS NULL`, [targetId]);
    if (!target) return json(res, 404, { error: 'Usuário não encontrado.' });
    if (ctx.user.role !== 'super_admin' && Number(target.church_id) !== Number(ctx.user.church_id)) {
      return json(res, 403, { error: 'Usuário pertence a outra igreja.' });
    }
    if (Number(target.id) === Number(ctx.user.id)) return json(res, 422, { error: 'Você não pode desativar o próprio usuário.' });
    if (target.role === 'super_admin') return json(res, 403, { error: 'O superadmin não pode ser desativado por este caminho.' });
    run(`UPDATE users SET active = 0, deleted_at = ?, updated_at = ? WHERE id = ?`, [isoNow(), isoNow(), targetId]);
    audit({ churchId: target.church_id, user: ctx.user, action: 'desativar_usuario', module: 'configuracoes', resource: 'users', recordId: targetId, before: target, ip: req.ip });
    return json(res, 200, { message: 'Usuário desativado. Os registros e o histórico continuam preservados (soft delete).' });
  }));

  /* ============================================================ LISTAGEM DE PERFIS DISPONÍVEIS (P/ FORM DE USUARIO) */
  router.add('GET', '/api/team/roles', authed(async (req, res, ctx) => {
    if (!canManageStaff(ctx.user)) return json(res, 403, { error: 'Acesso restrito ao administrador.' });
    const churchId = ctx.user.role === 'super_admin' && req.query.church_id ? Number(req.query.church_id) : ctx.user.church_id;
    return json(res, 200, { data: availableRoles(churchId), blocked: Array.from(STAFF_BLOCKED) });
  }));

  /* ============================================================ LISTA DE IGREJAS (apenas super_admin) — para o selector de igreja */
  router.add('GET', '/api/churches/options', authed(async (req, res, ctx) => {
    if (ctx.user.role !== 'super_admin') return json(res, 403, { error: 'Acesso restrito ao administrador geral.' });
    const rows = all('SELECT id, name, city, state FROM churches WHERE deleted_at IS NULL ORDER BY name');
    return json(res, 200, { data: rows.map((r) => ({ id: r.id, label: `${r.name}${r.city ? ' — ' + r.city + '/' + (r.state || '') : ''}` })) });
  }));
}

function availableRoles(churchId) {
  const rows = all(
    `SELECT id, slug, name, description, permissions FROM roles WHERE church_id = ? AND is_system = 1 AND deleted_at IS NULL ORDER BY name`,
    [churchId]
  );
  return rows.map((r) => {
    let p = {};
    try { p = JSON.parse(r.permissions || '{}'); } catch { p = {}; }
    return { id: r.id, slug: r.slug, name: r.name, description: r.description, permissions: p };
  });
}
