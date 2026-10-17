/**
 * Eclesia One - Autenticacao, RBAC e auditoria.
 */
import { one, all, insert, run } from './db.js';
import { verifyPassword, isoNow } from './lib.js';

export const MODULES = [
  'pessoas', 'familias', 'visitantes', 'funcionarios', 'celulas', 'ministerios', 'voluntarios',
  'escalas', 'ebd', 'infantil', 'pastoral', 'eventos', 'agenda', 'financeiro', 'contas',
  'patrimonio', 'manutencao', 'fornecedores', 'contratos', 'documentos', 'tarefas',
  'comunicacao', 'relatorios', 'inteligencia', 'configuracoes', 'auditoria',
];

export const ACTION_LABELS = {
  view: 'Visualizar', create: 'Criar', edit: 'Editar', delete: 'Excluir',
  approve: 'Aprovar', export: 'Exportar', print: 'Imprimir',
};

/* ------------------------------------------------------------- permissoes */
export function rolePermissions(churchId, roleSlug) {
  const role = one('SELECT permissions, slug, name FROM roles WHERE church_id = ? AND slug = ? AND deleted_at IS NULL', [churchId, roleSlug]);
  if (!role) return { name: roleSlug, permissions: {} };
  let perms = {};
  try { perms = JSON.parse(role.permissions || '{}'); } catch { perms = {}; }
  return { name: role.name, slug: role.slug, permissions: perms };
}

export function can(user, moduleKey, action = 'view') {
  if (!user) return false;
  if (isChurchAdmin(user)) return true;
  const perms = user.permissions || {};
  const list = perms[moduleKey];
  if (!Array.isArray(list)) return false;
  return list.includes(action);
}

export function canAny(user, moduleKey) {
  if (!user) return false;
  if (isChurchAdmin(user)) return true;
  const list = (user.permissions || {})[moduleKey];
  return Array.isArray(list) && list.length > 0;
}

export function permissionMatrix(user) {
  const out = {};
  for (const m of MODULES) out[m] = MODULES.includes(m) ? (isChurchAdmin(user) ? ALL_ACTIONS : ((user.permissions || {})[m] || [])) : [];
  return out;
}

/* ------------------------------------------------------------------ login */
export function authenticate(email, password, churchId) {
  const user = one(
    `SELECT u.*, c.name AS church_name FROM users u
     LEFT JOIN churches c ON c.id = u.church_id
     WHERE lower(u.email) = lower(?) AND u.deleted_at IS NULL AND u.active = 1
     ORDER BY u.id LIMIT 1`,
    [email]
  );
  if (!user) return { error: 'E-mail não encontrado ou usuário inativo.' };
  if (churchId && Number(user.church_id) !== Number(churchId)) return { error: 'Usuário não pertence à igreja informada.' };
  if (!verifyPassword(password, user.password_hash)) return { error: 'Senha inválida.' };
  return { user };
}

export function hydrateUser(user, churchId) {
  const rp = rolePermissions(user.church_id, user.role);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    role_name: rp.name,
    church_id: user.church_id,
    church_name: user.church_name || null,
    person_id: user.person_id,
    permissions: isChurchAdmin(user)
      ? (Object.keys(rp.permissions || {}).length ? rp.permissions : Object.fromEntries(MODULES.map((m) => [m, ALL_ACTIONS])))
      : rp.permissions,
  };
}

export function touchLogin(userId) {
  run('UPDATE users SET last_login = ? WHERE id = ?', [isoNow(), userId]);
}

/* --------------------------------------------------------------- auditoria */
export function audit({ churchId, user, action, module: moduleKey, resource, recordId, before, after, ip }) {
  try {
    insert('audit_logs', {
      church_id: churchId,
      user_id: user?.id ?? null,
      user_name: user?.name ?? 'sistema',
      action,
      module: moduleKey,
      resource,
      record_id: recordId != null ? String(recordId) : null,
      before_json: before ? JSON.stringify(before).slice(0, 4000) : null,
      after_json: after ? JSON.stringify(after).slice(0, 4000) : null,
      ip: ip || null,
      created_at: isoNow(),
    });
  } catch { /* auditoria nunca deve derrubar a operacao principal */ }
}

/* ============================================================ perfis do sistema */
export const ALL_ACTIONS = Object.keys(ACTION_LABELS);

/** Perfis com poder administrativo: super admin (rede) e Pastor ADM (a propria igreja). */
export const CHURCH_ADMIN_ROLES = ['super_admin', 'pastor_adm'];
export function isChurchAdmin(user) {
  return !!user && CHURCH_ADMIN_ROLES.includes(user.role);
}

const _all = () => Object.fromEntries(MODULES.map((m) => [m, [...ALL_ACTIONS]]));
const _view = (...mods) => Object.fromEntries(mods.map((m) => [m, ['view']]));
const _read = (...mods) => Object.fromEntries(mods.map((m) => [m, ['view', 'export', 'print']]));
const _crud = (...mods) => Object.fromEntries(mods.map((m) => [m, ['view', 'create', 'edit', 'export', 'print']]));
const _full = (...mods) => Object.fromEntries(mods.map((m) => [m, [...ALL_ACTIONS]]));

/** Perfis criados automaticamente em toda igreja nova (ambiente isolado). */
export const DEFAULT_ROLES = (() => {
  const pastor = _all();
  for (const m of ['financeiro', 'contas', 'configuracoes', 'auditoria']) pastor[m] = pastor[m].filter((a) => a !== 'delete');
  const auxiliar = { ...pastor };
  auxiliar.configuracoes = ['view'];
  auxiliar.auditoria = ['view'];
  const financeiro = { ..._full('financeiro', 'contas'), ..._crud('fornecedores', 'contratos'), ..._read('relatorios', 'documentos', 'patrimonio'), ..._view('agenda') };
  const secretaria = { ..._full('pessoas', 'familias', 'visitantes', 'agenda', 'documentos'), ..._crud('eventos', 'escalas', 'ebd', 'comunicacao'), ..._view('celulas', 'ministerios', 'escalas'), ..._read('relatorios') };
  const liderCelula = { ..._crud('celulas', 'pessoas', 'visitantes'), ..._read('relatorios'), ..._view('agenda'), comunicacao: ['view', 'create'] };
  const liderMinisterio = { ..._full('ministerios', 'voluntarios', 'escalas'), ..._crud('eventos'), ..._view('pessoas'), ..._read('relatorios'), comunicacao: ['view', 'create'] };
  const professor = { ..._full('ebd'), ..._crud('infantil'), ..._view('pessoas'), ..._read('relatorios') };
  const recepcao = { ..._crud('pessoas'), ..._full('visitantes', 'infantil'), ..._crud('eventos'), ..._view('agenda') };
  return [
    { slug: 'super_admin', name: 'Super Admin (rede)', description: 'Administra a rede de igrejas e todos os dados', permissions: _all() },
    { slug: 'pastor_adm', name: 'Pastor ADM (administrador da igreja)', description: 'Administrador da própria igreja: cria usuários e responde por todos os módulos', permissions: _all() },
    { slug: 'pastor', name: 'Pastor', description: 'Visão e gestão pastoral e ministerial', permissions: pastor },
    { slug: 'pastor_auxiliar', name: 'Pastor Auxiliar', description: 'Apoio pastoral sem acesso às configurações', permissions: auxiliar },
    { slug: 'financeiro', name: 'Financeiro / Tesouraria', description: 'Contas, dízimos, ofertas, contas a pagar e relatórios financeiros', permissions: financeiro },
    { slug: 'secretaria', name: 'Secretaria', description: 'Cadastros, agenda, eventos, escalas e documentos', permissions: secretaria },
    { slug: 'lider_celula', name: 'Líder de Célula', description: 'Somente as próprias células e membros vinculados', permissions: liderCelula },
    { slug: 'lider_ministerio', name: 'Líder de Ministério', description: 'Somente o próprio ministério, voluntários e escalas', permissions: liderMinisterio },
    { slug: 'professor', name: 'Professor(a) EBD', description: 'Somente as próprias classes da Escola Bíblica', permissions: professor },
    { slug: 'recepcao', name: 'Recepção', description: 'Pessoas, visitantes, eventos e check-in infantil', permissions: recepcao },
    { slug: 'membro', name: 'Membro', description: 'Acesso ao Portal do Membro (somente os próprios dados)', permissions: {} },
  ];
})();
