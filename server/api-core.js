/**
 * Eclesia One - Núcleo da API: autenticação, CRUD genérico com RBAC,
 * escopo por perfil, auditoria, busca global e assistente de configuração.
 */
import { all, one, insert, update, run, scalar, db, hasColumn } from './db.js';
import {
  isoNow, isoDate, addDays, signToken, verifyToken, hashPassword, randomToken,
  toCsv, buildPdf, monthKey, daysBetween, pct,
} from './lib.js';
import { RESOURCES, FK_MAP, labelKey } from './registry.js';
import { authenticate, hydrateUser, can, permissionMatrix, audit, MODULES, CHURCH_ADMIN_ROLES } from './auth.js';
import { createChurch, createUser, emailTaken, ensureChurchRoles, generatePassword, churchById } from './tenancy.js';

// Helpers locais (escopados por igreja) ---
function emailTakenInChurch(email, churchId) {
  return !!scalar(
    'SELECT id FROM users WHERE lower(email) = lower(?) AND deleted_at IS NULL AND church_id = ?',
    [email, churchId],
  );
}

function normalizeRoleForCreation(role) {
  // Apenas super_admin pode atribuir pastor_adm; demais atribuicoes vao via /api/churches.
  const r = String(role || '').trim().toLowerCase();
  if (CHURCH_ADMIN_ROLES.includes(r) && r !== 'super_admin') return 'membro';
  if (!r) return 'membro';
  return r;
}

function currentRoleCanCreateStaff(user) {
  return user && CHURCH_ADMIN_ROLES.includes(user.role);
}

const PAGE_MAX = 200;

/** Filtro de exclusao logica: aplicado apenas quando a tabela possui a coluna deleted_at. */
const softFilter = (table, alias = 't') => {
  if (!hasColumn(table, 'deleted_at')) return '';
  return alias ? ` AND ${alias}.deleted_at IS NULL` : ' AND deleted_at IS NULL';
};

/* ------------------------------------------------------------ utilitarios */
export const json = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
};

export function errorMessage(field, rule) {
  const labels = {
    required: `O campo "${field}" é obrigatório.`,
    number: `O campo "${field}" deve ser um número válido.`,
    date: `O campo "${field}" deve estar no formato AAAA-MM-DD.`,
    email: 'Informe um e-mail válido.',
    duplicate: 'Já existe um registro com este valor.',
    fk: 'O registro relacionado informado não existe.',
  };
  return labels[rule] || 'Dados inválidos.';
}

/* ------------------------------------------------------------- validacoes */
const isDate = (v) => /^\d{4}-\d{2}-\d{2}/.test(String(v));
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v));

export function validatePayload(def, body, { partial = false } = {}) {
  const errors = [];
  const clean = {};
  const columns = all(`PRAGMA table_info(${def.table})`).map((c) => c.name);
  for (const [k, v] of Object.entries(body || {})) {
    if (!columns.includes(k)) continue;
    // O sistema sempre recalcula: church_id, created_at, updated_at, deleted_at, password_hash, last_login, require_reset.
    if (['id', 'church_id', 'created_at', 'updated_at', 'deleted_at', 'password_hash', 'last_login'].includes(k)) continue;
    clean[k] = v === '' ? null : v;
  }
  if (!partial) {
    for (const field of def.required || []) {
      // No recurso users, a senha eh exigida como campo separado (campo "password", coluna password_hash).
      if (def.table === 'users' && field === 'name') {
        const v = clean.name;
        if (v === undefined || v === null || String(v).trim() === '') errors.push('Informe o nome do usuario.');
      } else {
        const v = clean[field];
        if (v === undefined || v === null || String(v).trim() === '') errors.push(errorMessage(field, 'required'));
      }
    }
    // Senha inicial: exige ao criar.
    if (def.table === 'users' && !partial && !body.password) {
      errors.push('Informe uma senha inicial (minimo 8 caracteres).');
    }
  }
  for (const field of def.numbers || []) {
    const v = clean[field];
    if (v !== undefined && v !== null && v !== '' && Number.isNaN(Number(v))) errors.push(errorMessage(field, 'number'));
    else if (v !== undefined && v !== null && v !== '') clean[field] = Number(v);
  }
  for (const field of def.dates || []) {
    const v = clean[field];
    if (v !== undefined && v !== null && v !== '' && !isDate(v)) errors.push(errorMessage(field, 'date'));
  }
  if (clean.email !== undefined && clean.email !== null && clean.email !== '' && !isEmail(clean.email)) {
    errors.push(errorMessage('email', 'email'));
  }
  // integridade referencial amigavel
  for (const [col, [table, label]] of Object.entries(FK_MAP)) {
    const v = clean[col];
    if (v !== undefined && v !== null && v !== '') {
      const exists = scalar(`SELECT id FROM ${table} WHERE id = ?${hasColumn(table, 'deleted_at') ? ' AND deleted_at IS NULL' : ''}`, [v]);
      if (!exists) errors.push(`O registro relacionado em "${col}" não foi localizado.`);
    }
  }
  return { errors, clean };
}

/* ------------------------------------------------------------------ escopo */
/** Restringe a consulta conforme o perfil (lider de celula, ministerio, professor). */
export function scopeClause(def, user) {
  const moduleKey = def.module;
  if (user.role === 'super_admin' || user.role === 'pastor') return { sql: '', params: [] };
  const personId = user.person_id;

  if (user.role === 'lider_celula' && def.scope === 'cell') {
    if (!personId) return { sql: ' AND 1 = 0', params: [] };
    if (def.table === 'cells') {
      return { sql: ' AND (leader_id = ? OR co_leader_id = ? OR supervisor_id = ?)', params: [personId, personId, personId] };
    }
    if (def.table === 'cell_members' || def.table === 'cell_meetings' || def.table === 'cell_attendance') {
      return {
        sql: `${def.table === 'cell_attendance' ? ' AND meeting_id IN (SELECT id FROM cell_meetings WHERE cell_id IN (SELECT id FROM cells WHERE leader_id = ? OR co_leader_id = ?))' : ' AND cell_id IN (SELECT id FROM cells WHERE leader_id = ? OR co_leader_id = ?)'}`,
        params: [personId, personId],
      };
    }
  }
  if (user.role === 'lider_ministerio' && def.scope === 'ministry') {
    if (!personId) return { sql: ' AND 1 = 0', params: [] };
    if (def.table === 'ministries') return { sql: ' AND (leader_id = ? OR co_leader_id = ?)', params: [personId, personId] };
    if (def.table === 'ministry_members' || def.table === 'volunteers') {
      return { sql: ' AND ministry_id IN (SELECT id FROM ministries WHERE leader_id = ? OR co_leader_id = ?)', params: [personId, personId] };
    }
  }
  if (user.role === 'professor' && def.scope === 'ebd') {
    if (!personId) return { sql: ' AND 1 = 0', params: [] };
    if (def.table === 'ebd_classes') return { sql: ' AND (teacher_id = ? OR co_teacher_id = ?)', params: [personId, personId] };
    if (def.table === 'ebd_students' || def.table === 'ebd_lessons') {
      return { sql: ' AND class_id IN (SELECT id FROM ebd_classes WHERE teacher_id = ? OR co_teacher_id = ?)', params: [personId, personId] };
    }
    if (def.table === 'ebd_attendance') {
      return { sql: ' AND lesson_id IN (SELECT id FROM ebd_lessons WHERE class_id IN (SELECT id FROM ebd_classes WHERE teacher_id = ? OR co_teacher_id = ?))', params: [personId, personId] };
    }
  }
  if (user.role === 'membro') {
    if (def.table === 'people') return { sql: ' AND id = ?', params: [personId || -1] };
    if (def.table === 'pastoral_care' || def.table === 'prayer_requests') return { sql: ' AND person_id = ?', params: [personId || -1] };
    if (def.table === 'schedules') return { sql: ' AND person_id = ?', params: [personId || -1] };
    if (def.table === 'event_registrations' || def.table === 'course_enrollments' || def.table === 'cell_members') return { sql: ' AND person_id = ?', params: [personId || -1] };
    if (def.table === 'transactions') return { sql: ' AND person_id = ?', params: [personId || -1] };
  }
  return { sql: '', params: [] };
}

/* --------------------------------------------------------------- listagem */
const selectFields = (def) => {
  const cols = all(`PRAGMA table_info(${def.table})`).map((c) => c.name)
    .filter((c) => !(def.hidden || []).includes(c));
  const parts = cols.map((c) => `t.${c}`);
  for (const c of cols) {
    if (FK_MAP[c]) {
      const [table, label] = FK_MAP[c];
      parts.push(`(SELECT ${label} FROM ${table} x WHERE x.id = t.${c}) AS ${labelKey(c)}`);
    }
  }
  return { cols, select: parts.join(', ') };
};

export function listResource(req, res, user, def, params) {
  const { page = 1, limit = 25, q = '', sort, order = 'asc', format } = req.query;
  const { cols, select } = selectFields(def);
  const where = ['t.church_id = ?'];
  if (hasColumn(def.table, 'deleted_at')) where.push('t.deleted_at IS NULL');
  const args = [user.church_id];
  const sc = scopeClause(def, user);
  if (sc.sql) { where.push(sc.sql.replace(/^\s*AND\s*/, '')); args.push(...sc.params); }

  if (q && (def.search || []).length) {
    const like = `%${String(q).toLowerCase()}%`;
    where.push('(' + def.search.map((f) => `lower(COALESCE(t.${f}, '')) LIKE ?`).join(' OR ') + ')');
    def.search.forEach(() => args.push(like));
  }
  // filtros dinamicos: f_campo=valor  e  from/to no campo data
  for (const [key, val] of Object.entries(req.query)) {
    if (!key.startsWith('f_')) continue;
    const col = key.slice(2);
    if (!cols.includes(col)) continue;
    if (val === '' || val === null) continue;
    const values = String(val).split(',');
    where.push(`t.${col} IN (${values.map(() => '?').join(',')})`);
    values.forEach((v) => args.push(v));
  }
  for (const key of ['from', 'to']) {
    const val = req.query[key];
    if (!val) continue;
    const df = def.dateField || 'created_at';
    where.push(`t.${df} ${key === 'from' ? '>=' : '<='} ?`);
    args.push(String(val).slice(0, 10));
  }
  if (req.query.days) {
    const df = def.dateField || 'created_at';
    where.push(`t.${df} >= ?`);
    args.push(addDays(isoDate(), -Number(req.query.days)));
  }

  const sortCol = (def.sort?.allowed || []).includes(sort) ? sort : (def.sort?.default || 'id');
  const dir = String(order).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  const total = scalar(`SELECT COUNT(*) FROM ${def.table} t WHERE ${where.join(' AND ')}`, args) || 0;
  const lim = Math.min(PAGE_MAX, Math.max(1, Number(limit) || 25));
  const off = Math.max(0, (Number(page) - 1) * lim);

  const rows = all(
    `SELECT ${select} FROM ${def.table} t WHERE ${where.join(' AND ')} ORDER BY t.${sortCol} ${dir}, t.id DESC LIMIT ? OFFSET ?`,
    [...args, lim, off]
  );

  if (format === 'csv' || format === 'pdf') {
    const columns = (def.listColumns || cols.slice(0, 8)).map((c) => {
      const lk = labelKey(c);
      return { key: cols.includes(lk) ? lk : c, label: cols.includes(lk) ? lk.replace(/_nome$/, '').replace(/_/g, ' ') : c.replace(/_/g, ' '), value: (r) => (cols.includes(lk) ? r[lk] ?? r[c] : r[c]) };
    });
    const title = `${def.plural}`;
    if (format === 'csv') {
      const csv = toCsv(columns, rows);
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${def.table}.csv"`,
      });
      return res.end(csv);
    }
    const html = buildPdf({ title, subtitle: `${total} registro(s) — ${user.church_name || ''}`, columns, rows, footer: 'Eclesia One — exportação autorizada' });
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${def.table}.pdf"` });
    return res.end(html);
  }

  return json(res, 200, {
    data: rows,
    meta: { total, page: Number(page), limit: lim, pages: Math.max(1, Math.ceil(total / lim)), columns: def.listColumns || cols.slice(0, 8), label: def.plural, module: def.module, resource: Object.keys(RESOURCES).find((k) => RESOURCES[k] === def) },
  });
}

/* --------------------------------------------------------------- detalhes */
export function getResource(req, res, user, def, id) {
  const { select } = selectFields(def);
  const row = one(`SELECT ${select} FROM ${def.table} t WHERE t.id = ? AND t.church_id = ?${softFilter(def.table)}`, [id, user.church_id]);
  if (!row) return json(res, 404, { error: 'Registro não encontrado.' });
  const deep = deepDetail(user, def, id);
  return json(res, 200, { data: row, related: deep });
}

/** Relacionamentos reutilizados: exibe tudo o que se conecta a esta pessoa. */
function deepDetail(user, def, id) {
  if (def.table !== 'people') return null;
  const pid = Number(id);
  const q = (sql, ...p) => all(sql, [user.church_id, ...p]);
  const out = {
    familia: q(`SELECT f.id, f.name, m.role FROM family_members m JOIN families f ON f.id = m.family_id WHERE m.church_id = ? AND m.person_id = ? AND m.deleted_at IS NULL`, pid),
    celulas: q(`SELECT c.id, c.name, cm.role FROM cell_members cm JOIN cells c ON c.id = cm.cell_id WHERE cm.church_id = ? AND cm.person_id = ? AND cm.deleted_at IS NULL`, pid),
    ministerios: q(`SELECT mi.id, mi.name, mm.role FROM ministry_members mm JOIN ministries mi ON mi.id = mm.ministry_id WHERE mm.church_id = ? AND mm.person_id = ? AND mm.deleted_at IS NULL`, pid),
    voluntariado: q(`SELECT v.id, v.function_name, v.availability, m.name AS ministry FROM volunteers v LEFT JOIN ministries m ON m.id = v.ministry_id WHERE v.church_id = ? AND v.person_id = ? AND v.deleted_at IS NULL`, pid),
    escalas: q(`SELECT s.id, s.schedule_date, s.function_name, s.status FROM schedules s WHERE s.church_id = ? AND s.person_id = ? AND s.deleted_at IS NULL ORDER BY s.schedule_date DESC LIMIT 25`, pid),
    frequencia_celula: q(`SELECT COUNT(*) AS presencas FROM cell_attendance WHERE church_id = ? AND person_id = ? AND status = 'presente' AND deleted_at IS NULL`, pid),
    frequencia_ebd: q(`SELECT COUNT(*) AS presencas FROM ebd_attendance WHERE church_id = ? AND person_id = ? AND status = 'presente' AND deleted_at IS NULL`, pid),
    eventos: q(`SELECT e.id, e.name, e.event_date, er.status FROM event_registrations er JOIN events e ON e.id = er.event_id WHERE er.church_id = ? AND er.person_id = ? AND er.deleted_at IS NULL ORDER BY e.event_date DESC LIMIT 20`, pid),
    cursos: q(`SELECT c.id, c.name, ce.attendance_percent, ce.status FROM course_enrollments ce JOIN courses c ON c.id = ce.course_id WHERE ce.church_id = ? AND ce.person_id = ? AND ce.deleted_at IS NULL`, pid),
    cargos: q(`SELECT st.id, st.role_title, st.department, st.status FROM staff st WHERE st.church_id = ? AND st.person_id = ? AND st.deleted_at IS NULL`, pid),
  };
  if (can(user, 'pastoral', 'view')) {
    out.pastoral = q(`SELECT p.id, p.care_type, p.care_date, p.status FROM pastoral_care p WHERE p.church_id = ? AND p.person_id = ? AND p.deleted_at IS NULL ORDER BY p.care_date DESC LIMIT 20`, pid);
  }
  if (can(user, 'financeiro', 'view')) {
    out.contribuicoes = q(`SELECT t.id, t.tx_date, t.value, t.payment_method, c.name AS categoria FROM transactions t LEFT JOIN categories c ON c.id = t.category_id WHERE t.church_id = ? AND t.person_id = ? AND t.deleted_at IS NULL ORDER BY t.tx_date DESC LIMIT 20`, pid);
  }
  out.historico = q(`SELECT a.id, a.created_at, a.action, a.module, a.user_name FROM audit_logs a WHERE a.church_id = ? AND a.resource IN ('people') AND a.record_id = ? ORDER BY a.created_at DESC LIMIT 20`, String(pid));
  return out;
}

/* ---------------------------------------------------------------- escrita */
export function createResource(req, res, user, def, body, ip) {
  if (def.readOnly) return json(res, 403, { error: 'Este recurso é somente leitura.' });
  const { errors, clean } = validatePayload(def, body);
  if (errors.length) return json(res, 422, { error: errors[0], errors });
  if (def.table === 'users') {
    // O endpoint /api/users (CRUD generico) soh aceita usuarios que o proprio
    // servidor pode vincular a uma igreja existente. A criacao de Pastor ADM
    // eh exclusiva do superadmin via /api/churches (escopo definido em
    // api-access.js). Aqui apenas validamos e gravamos.
    if (!currentRoleCanCreateStaff(user)) {
      return json(res, 403, { error: 'Apenas o administrador da rede ou o Pastor ADM pode cadastrar usuarios.' });
    }
    if (!clean.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(clean.email))) {
      return json(res, 422, { error: 'Informe um e-mail valido para o usuario.' });
    }
    if (emailTakenInChurch(clean.email, user.church_id)) {
      return json(res, 409, { error: 'Ja existe um usuario com este e-mail nesta igreja.' });
    }
    if (body.password) {
      if (String(body.password).length < 8) {
        return json(res, 422, { error: 'A senha inicial deve ter ao menos 8 caracteres.' });
      }
      clean.password_hash = hashPassword(body.password);
    } else {
      return json(res, 422, { error: 'Informe uma senha inicial (minimo 8 caracteres).' });
    }
    clean.role = normalizeRoleForCreation(clean.role || 'membro');
    // exige troca de senha no primeiro acesso (sempre que outro usuario cria)
    clean.require_reset = 1;
  }
  clean.church_id = user.church_id;
  if (Object.prototype.hasOwnProperty.call(all(`PRAGMA table_info(${def.table})`).reduce((a, r) => (a[r.name] = 1, a), {}), 'is_demo')) clean.is_demo = 0;
  clean.created_at = isoNow();
  clean.updated_at = isoNow();
  let id;
  try {
    id = insert(def.table, clean);
  } catch (e) {
    return json(res, 400, { error: 'Não foi possível salvar: ' + e.message });
  }
  const created = one(`SELECT * FROM ${def.table} WHERE id = ?`, [id]);
  if (created?.password_hash) delete created.password_hash;
  audit({ churchId: user.church_id, user, action: 'criar', module: def.module, resource: def.table, recordId: id, after: created, ip });
  return json(res, 201, { data: created, message: `${def.label} cadastrado(a) com sucesso.` });
}

export function updateResource(req, res, user, def, id, body, ip) {
  if (def.readOnly) return json(res, 403, { error: 'Este recurso é somente leitura.' });
  const before = one(`SELECT * FROM ${def.table} WHERE id = ? AND church_id = ?${softFilter(def.table, '')}`, [id, user.church_id]);
  if (!before) return json(res, 404, { error: 'Registro não encontrado.' });
  const { errors, clean } = validatePayload(def, body, { partial: true });
  if (errors.length) return json(res, 422, { error: errors[0], errors });
  if (def.table === 'users' && body.password) {
    if (String(body.password).length < 8) {
      return json(res, 422, { error: 'A nova senha deve ter ao menos 8 caracteres.' });
    }
    clean.password_hash = hashPassword(body.password);
  }
  if (def.financial && before.status === 'cancelado' && clean.status && clean.status !== 'cancelado') {
    return json(res, 409, { error: 'Registros financeiros cancelados não podem ser reativados. Crie um novo lançamento.' });
  }
  clean.updated_at = isoNow();
  Object.keys(clean).forEach((k) => { if (clean[k] === undefined) delete clean[k]; });
  if (!Object.keys(clean).length) return json(res, 400, { error: 'Nenhum campo válido foi informado para atualização.' });
  try {
    update(def.table, id, user.church_id, clean);
  } catch (e) {
    return json(res, 400, { error: 'Falha ao atualizar: ' + e.message });
  }
  const after = one(`SELECT * FROM ${def.table} WHERE id = ?`, [id]);
  if (after?.password_hash) delete after.password_hash;
  const b = { ...before }; if (b.password_hash) delete b.password_hash;
  audit({ churchId: user.church_id, user, action: 'editar', module: def.module, resource: def.table, recordId: id, before: b, after, ip });
  return json(res, 200, { data: after, message: `${def.label} atualizado(a) com sucesso.` });
}

export function deleteResource(req, res, user, def, id, ip) {
  if (def.readOnly) return json(res, 403, { error: 'Este recurso é somente leitura.' });
  const before = one(`SELECT * FROM ${def.table} WHERE id = ? AND church_id = ?${softFilter(def.table, '')}`, [id, user.church_id]);
  if (!before) return json(res, 404, { error: 'Registro não encontrado.' });
  if (def.financial) {
    if (!can(user, def.module, 'approve')) return json(res, 403, { error: 'Somente perfis com permissão de aprovação podem cancelar lançamentos financeiros.' });
    update(def.table, id, user.church_id, { status: 'cancelado', updated_at: isoNow() });
    audit({ churchId: user.church_id, user, action: 'cancelar', module: def.module, resource: def.table, recordId: id, before, after: { status: 'cancelado' }, ip });
    return json(res, 200, { message: 'Lançamento cancelado (histórico preservado). O registro não foi apagado.' });
  }
  const patch = { deleted_at: isoNow() };
  if (hasColumn(def.table, 'updated_at')) patch.updated_at = isoNow();
  update(def.table, id, user.church_id, patch);
  audit({ churchId: user.church_id, user, action: 'excluir', module: def.module, resource: def.table, recordId: id, before, ip });
  return json(res, 200, { message: `${def.label} removido(a) com segurança (exclusão lógica).` });
}

/* ------------------------------------------------------------ busca global */
export function globalSearch(req, res, user) {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return json(res, 200, { groups: [], message: 'Informe ao menos 2 caracteres.' });
  const groups = [];
  for (const [key, def] of Object.entries(RESOURCES)) {
    if (def.readOnly && def.table !== 'audit_logs') continue;
    if (!canAnyModule(user, def.module)) continue;
    const searchable = (def.search || []).filter(Boolean);
    if (!searchable.length) continue;
    if (['users', 'roles', 'integrations'].includes(key) && !can(user, 'configuracoes', 'view')) continue;
    const { select } = selectFields(def);
    const like = `%${q.toLowerCase()}%`;
    const sc = scopeClause(def, user);
    const rows = all(
      `SELECT ${select} FROM ${def.table} t WHERE t.church_id = ?${softFilter(def.table)} ${sc.sql}
       AND (${searchable.map((f) => `lower(COALESCE(t.${f},'')) LIKE ?`).join(' OR ')})
       ORDER BY t.id DESC LIMIT 8`,
      [user.church_id, ...sc.params, ...searchable.map(() => like)]
    );
    if (rows.length) {
      groups.push({
        resource: key, label: def.plural, module: def.module,
        column: (def.listColumns || [])[0] || searchable[0],
        items: rows.map((r) => {
          const lc = (def.listColumns || [])[0] || searchable[0];
          const lk = labelKey(lc);
          return { id: r.id, title: r[lk] ?? r[lc] ?? `#${r.id}`, subtitle: buildSubtitle(def, r) };
        }),
      });
    }
  }
  return json(res, 200, { query: q, groups });
}

function buildSubtitle(def, row) {
  const bits = [];
  for (const c of (def.listColumns || []).slice(1, 4)) {
    const lk = labelKey(c);
    const v = row[lk] ?? row[c];
    if (v !== null && v !== undefined && v !== '') bits.push(String(v));
  }
  return bits.join(' · ');
}

function canAnyModule(user, moduleKey) {
  if (user.role === 'super_admin') return true;
  const list = (user.permissions || {})[moduleKey];
  return Array.isArray(list) && list.includes('view');
}

/* ---------------------------------------------------------------- rotas */
export function registerCoreRoutes(router) {
  const need = (user, moduleKey, action) => user && can(user, moduleKey, action);

  const authed = (handler) => async (req, res, ctx) => {
    if (!ctx.user) return json(res, 401, { error: 'Sessão expirada. Faça login novamente.' });
    return handler(req, res, ctx);
  };

  /* --------------------------------------------------------------- auth */
  router.add('POST', '/api/auth/login', async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return json(res, 422, { error: 'Informe e-mail e senha.' });
    const result = authenticate(email, password);
    if (result.error) {
      audit({ churchId: null, user: { id: null, name: String(email) }, action: 'login_falha', module: 'configuracoes', resource: 'users', ip: req.ip });
      return json(res, 401, { error: result.error });
    }
    const user = hydrateUser(result.user);
    run('UPDATE users SET last_login = ? WHERE id = ?', [isoNow(), user.id]);
    const token = signToken({ sub: user.id, church: user.church_id, role: user.role }, process.env.JWT_SECRET || 'eclesia-one-dev-secret', 60 * 60 * 12);
    audit({ churchId: user.church_id, user, action: 'login', module: 'configuracoes', resource: 'users', recordId: user.id, ip: req.ip });
    return json(res, 200, { token, user, message: `Bem-vindo(a), ${user.name}.` });
  });

  router.add('POST', '/api/auth/logout', authed(async (req, res, ctx) => {
    audit({ churchId: ctx.user.church_id, user: ctx.user, action: 'logout', module: 'configuracoes', resource: 'users', recordId: ctx.user.id, ip: req.ip });
    return json(res, 200, { message: 'Sessão encerrada.' });
  }));

  router.add('GET', '/api/auth/me', authed(async (req, res, ctx) => json(res, 200, { user: ctx.user, permissions: permissionMatrix(ctx.user), modules: MODULES })));

  router.add('POST', '/api/auth/forgot', async (req, res) => {
    const { email } = req.body || {};
    const user = one('SELECT id, church_id, name, email FROM users WHERE lower(email) = lower(?) AND deleted_at IS NULL', [email]);
    // resposta sempre igual: nao revela existencia de conta
    if (user) {
      const token = randomToken(24);
      insert('password_resets', {
        church_id: user.church_id, user_id: user.id, email: user.email, token,
        expires_at: isoNow().slice(0, 10) + ' ' + new Date(Date.now() + 3600e3).toISOString().slice(11, 19),
        created_at: isoNow(),
      });
      audit({ churchId: user.church_id, user, action: 'solicitar_recuperacao', module: 'configuracoes', resource: 'users', recordId: user.id, ip: req.ip });
      return json(res, 200, {
        message: 'Se o e-mail estiver cadastrado, enviaremos as instruções de recuperação.',
        // Em produção o token seria enviado por e-mail (integração documentada).
        token_preview: process.env.EXPOSE_RESET_TOKEN === 'false' ? undefined : token,
      });
    }
    return json(res, 200, { message: 'Se o e-mail estiver cadastrado, enviaremos as instruções de recuperação.' });
  });

  router.add('POST', '/api/auth/reset', async (req, res) => {
    const { token, password } = req.body || {};
    if (!token || !password || String(password).length < 6) return json(res, 422, { error: 'Informe o token e uma senha com ao menos 6 caracteres.' });
    const rec = one('SELECT * FROM password_resets WHERE token = ? AND used_at IS NULL', [token]);
    if (!rec) return json(res, 400, { error: 'Token inválido ou já utilizado.' });
    run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hashPassword(password), isoNow(), rec.user_id]);
    run('UPDATE password_resets SET used_at = ? WHERE id = ?', [isoNow(), rec.id]);
    audit({ churchId: rec.church_id, user: { id: rec.user_id, name: rec.email }, action: 'redefinir_senha', module: 'configuracoes', resource: 'users', recordId: rec.user_id, ip: req.ip });
    return json(res, 200, { message: 'Senha redefinida com sucesso. Faça login novamente.' });
  });

  router.add('PUT', '/api/auth/password', authed(async (req, res, ctx) => {
    const { current, password } = req.body || {};
    const row = one('SELECT id, password_hash FROM users WHERE id = ?', [ctx.user.id]);
    const { verifyPassword } = await import('./lib.js');
    if (!verifyPassword(current, row.password_hash)) return json(res, 422, { error: 'Senha atual incorreta.' });
    if (String(password || '').length < 6) return json(res, 422, { error: 'A nova senha deve ter ao menos 6 caracteres.' });
    run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hashPassword(password), isoNow(), ctx.user.id]);
    audit({ churchId: ctx.user.church_id, user: ctx.user, action: 'alterar_senha', module: 'configuracoes', resource: 'users', recordId: ctx.user.id, ip: req.ip });
    return json(res, 200, { message: 'Senha alterada com sucesso.' });
  }));

  /* -------------------------------------------------------- CRUD generico */
  for (const [key, def] of Object.entries(RESOURCES)) {
    const visible = def.table !== 'users' || true;
    // 'notifications' tem rota dedicada (central de notificacoes) logo abaixo.
    if (key !== 'notifications') router.add('GET', `/api/${key}`, authed(async (req, res, ctx) => {
      if (key === 'audit_logs' && !need(ctx.user, 'auditoria', 'view')) return json(res, 403, { error: 'Sem permissão para consultar a auditoria.' });
      if (!can(ctx.user, def.module, 'view') && !(key === 'people' && ctx.user.role === 'membro')) return json(res, 403, { error: `Sem permissão para visualizar ${def.plural}.` });
      return listResource(req, res, ctx.user, def);
    }));

    router.add('GET', `/api/${key}/:id`, authed(async (req, res, ctx) => {
      if (!can(ctx.user, def.module, 'view') && !(key === 'people' && ctx.user.role === 'membro')) return json(res, 403, { error: 'Sem permissão para visualizar este registro.' });
      return getResource(req, res, ctx.user, def, req.params.id);
    }));

    if (!def.readOnly) {
      router.add('POST', `/api/${key}`, authed(async (req, res, ctx) => {
        if (!can(ctx.user, def.module, 'create')) return json(res, 403, { error: `Sem permissão para cadastrar em ${def.plural}.` });
        return createResource(req, res, ctx.user, def, req.body, req.ip);
      }));

      router.add('PUT', `/api/${key}/:id`, authed(async (req, res, ctx) => {
        if (!can(ctx.user, def.module, 'edit')) return json(res, 403, { error: `Sem permissão para editar em ${def.plural}.` });
        return updateResource(req, res, ctx.user, def, req.params.id, req.body, req.ip);
      }));

      router.add('DELETE', `/api/${key}/:id`, authed(async (req, res, ctx) => {
        if (!can(ctx.user, def.module, 'delete') && !(def.financial && can(ctx.user, def.module, 'approve'))) {
          return json(res, 403, { error: `Sem permissão para excluir em ${def.plural}.` });
        }
        return deleteResource(req, res, ctx.user, def, req.params.id, req.ip);
      }));
    }
  }

  /* -------------------------------------------------------- busca global */
  router.add('GET', '/api/search', authed(async (req, res, ctx) => globalSearch(req, res, ctx.user)));

  /* ----------------------------------------------------------- auditoria */
  router.add('GET', '/api/auditoria', authed(async (req, res, ctx) => {
    if (!can(ctx.user, 'auditoria', 'view')) return json(res, 403, { error: 'Sem permissão para consultar a auditoria.' });
    const { page = 1, limit = 50, q = '' } = req.query;
    const where = ['church_id = ?'];
    const args = [ctx.user.church_id];
    if (q) { where.push('(lower(user_name) LIKE ? OR lower(action) LIKE ? OR lower(module) LIKE ? OR lower(COALESCE(resource,\'\')) LIKE ?)'); const l = `%${String(q).toLowerCase()}%`; args.push(l, l, l, l); }
    const total = scalar(`SELECT COUNT(*) FROM audit_logs WHERE ${where.join(' AND ')}`, args);
    const lim = Math.min(200, Number(limit) || 50);
    const rows = all(`SELECT * FROM audit_logs WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ? OFFSET ?`, [...args, lim, (Number(page) - 1) * lim]);
    return json(res, 200, { data: rows, meta: { total, page: Number(page), limit: lim, pages: Math.max(1, Math.ceil(total / lim)), label: 'Auditoria' } });
  }));

  /* -------------------------------------------------------- configuracoes */
  router.add('GET', '/api/config/church', authed(async (req, res, ctx) => {
    const church = one('SELECT * FROM churches WHERE id = ?', [ctx.user.church_id]);
    return json(res, 200, { data: church, demo_records: countDemo(ctx.user.church_id) });
  }));

  router.add('PUT', '/api/config/church', authed(async (req, res, ctx) => {
    if (!can(ctx.user, 'configuracoes', 'edit')) return json(res, 403, { error: 'Sem permissão para alterar as configurações da igreja.' });
    const allowed = ['name', 'legal_name', 'cnpj', 'email', 'phone', 'whatsapp', 'address', 'district', 'city', 'state', 'zip', 'pastor_name', 'logo_url', 'primary_color', 'secondary_color', 'onboarded'];
    const before = one('SELECT * FROM churches WHERE id = ?', [ctx.user.church_id]);
    const clean = {};
    for (const k of allowed) if (req.body?.[k] !== undefined) clean[k] = req.body[k];
    if (!Object.keys(clean).length) return json(res, 400, { error: 'Nenhum campo válido informado.' });
    const sets = Object.keys(clean).map((k) => `${k} = ?`).join(', ');
    run(`UPDATE churches SET ${sets}, updated_at = ? WHERE id = ?`, [...Object.values(clean), isoNow(), ctx.user.church_id]);
    audit({ churchId: ctx.user.church_id, user: ctx.user, action: 'editar', module: 'configuracoes', resource: 'churches', recordId: ctx.user.church_id, before, after: clean, ip: req.ip });
    return json(res, 200, { data: one('SELECT * FROM churches WHERE id = ?', [ctx.user.church_id]), message: 'Configurações da igreja atualizadas.' });
  }));

  router.add('GET', '/api/config/onboarding', authed(async (req, res, ctx) => {
    const cid = ctx.user.church_id;
    const c = (sql, p = []) => scalar(sql, [cid, ...p]) || 0;
    const steps = [
      { key: 'igreja', label: 'Igreja', done: !!(one('SELECT name FROM churches WHERE id = ?', [cid])?.name && one('SELECT city FROM churches WHERE id = ?', [cid])?.city) },
      { key: 'usuarios', label: 'Usuários', done: c('SELECT COUNT(*) FROM users WHERE church_id = ? AND is_demo = 0 AND deleted_at IS NULL') > 0 || c('SELECT COUNT(*) FROM users WHERE church_id = ? AND deleted_at IS NULL') > 1 },
      { key: 'financeiro', label: 'Financeiro', done: c('SELECT COUNT(*) FROM bank_accounts WHERE church_id = ? AND deleted_at IS NULL') > 0 },
      { key: 'pessoas', label: 'Pessoas', done: c('SELECT COUNT(*) FROM people WHERE church_id = ? AND deleted_at IS NULL') > 0 },
      { key: 'ministerios', label: 'Ministérios', done: c('SELECT COUNT(*) FROM ministries WHERE church_id = ? AND deleted_at IS NULL') > 0 },
      { key: 'celulas', label: 'Células', done: c('SELECT COUNT(*) FROM cells WHERE church_id = ? AND deleted_at IS NULL') > 0 },
      { key: 'agenda', label: 'Agenda', done: c('SELECT COUNT(*) FROM calendar_events WHERE church_id = ? AND deleted_at IS NULL') > 0 },
      { key: 'concluido', label: 'Concluído', done: false },
    ];
    const doneCount = steps.filter((s) => s.done).length;
    steps[steps.length - 1].done = doneCount === steps.length - 1;
    return json(res, 200, { steps, completed: steps.filter((s) => s.done).length, total: steps.length });
  }));

  router.add('GET', '/api/notifications', authed(async (req, res, ctx) => {
    const rows = all('SELECT * FROM notifications WHERE church_id = ? AND (user_id = ? OR user_id IS NULL) ORDER BY id DESC LIMIT 30', [ctx.user.church_id, ctx.user.id]);
    const unread = rows.filter((r) => !r.read_at).length;
    return json(res, 200, { data: rows, unread });
  }));

  router.add('POST', '/api/notifications/:id/read', authed(async (req, res, ctx) => {
    run('UPDATE notifications SET read_at = ? WHERE id = ? AND church_id = ? AND (user_id = ? OR user_id IS NULL)', [isoNow(), req.params.id, ctx.user.church_id, ctx.user.id]);
    return json(res, 200, { message: 'Notificação marcada como lida.' });
  }));

  /* ------------------------------------------------------------------- DEMO */
  router.add('GET', '/api/demo/status', authed(async (req, res, ctx) => {
    return json(res, 200, { data: countDemo(ctx.user.church_id) });
  }));

  router.add('POST', '/api/demo/purge', authed(async (req, res, ctx) => {
    if (!can(ctx.user, 'configuracoes', 'delete')) return json(res, 403, { error: 'Somente administradores podem remover os dados de demonstração.' });
    const removed = purgeDemo(ctx.user.church_id);
    audit({ churchId: ctx.user.church_id, user: ctx.user, action: 'remover_demonstracao', module: 'configuracoes', resource: 'demo', after: { removidos: removed }, ip: req.ip });
    return json(res, 200, { message: `Dados de demonstração removidos (${removed} registros).`, removed });
  }));
}

/* ============================================================ contadores demo */
/* Implementados em api-core para que o sistema funcione sem os arquivos de
   seed opcionais. Apenas contam/excluem registros com is_demo = 1. */
const DEMO_TABLES = [
  'people', 'families', 'family_members', 'visitors', 'staff', 'courses', 'course_enrollments',
  'cells', 'cell_members', 'cell_meetings', 'cell_attendance', 'ministries', 'ministry_members',
  'volunteers', 'events', 'event_registrations', 'schedules', 'ebd_classes', 'ebd_students',
  'ebd_lessons', 'ebd_attendance', 'children', 'child_checkins', 'pastoral_care',
  'prayer_requests', 'bank_accounts', 'categories', 'cost_centers', 'funds', 'transactions',
  'suppliers', 'payables', 'receivables', 'budgets', 'contracts', 'assets', 'maintenance',
  'documents', 'tasks', 'calendar_events', 'announcements', 'notifications',
];
function countDemo(churchId) {
  const out = { __total: 0 };
  for (const t of DEMO_TABLES) {
    const cols = all(`PRAGMA table_info(${t})`).map((c) => c.name);
    if (!cols.includes('church_id') || !cols.includes('is_demo') || !cols.includes('deleted_at')) continue;
    const v = Number(scalar(`SELECT COUNT(*) FROM ${t} WHERE church_id = ? AND is_demo = 1 AND deleted_at IS NULL`, [churchId]) || 0);
    if (v) { out[t] = v; out.__total += v; }
  }
  return out;
}
function purgeDemo(churchId) {
  let total = 0;
  const ts = isoNow();
  for (const t of DEMO_TABLES) {
    const cols = all(`PRAGMA table_info(${t})`).map((c) => c.name);
    if (!cols.includes('church_id') || !cols.includes('is_demo') || !cols.includes('deleted_at')) continue;
    const { changes } = run(`UPDATE ${t} SET deleted_at = ?, is_demo = 0, updated_at = ? WHERE church_id = ? AND is_demo = 1 AND deleted_at IS NULL`, [ts, ts, churchId]);
    total += changes;
  }
  return total;
}
