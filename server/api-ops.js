/**
 * Eclesia One - Operacoes administrativas:
 *   * Backup / restauracao (exportacao e reimportacao JSON escopada por igreja)
 *   * Importacao CSV/Excel-compativel com validacao e deduplicacao
 *   * Arvore de familia (visualizacao FAMILIA -> RESPONSAVEIS -> FILHOS -> MEMBROS -> CELULA)
 *   * Contas de demonstracao para a tela de login
 */
import { all, one, scalar, run, insert, db } from './db.js';
import { isoNow, isoDate, toCsv, buildPdf } from './lib.js';
import { RESOURCES, FK_MAP } from './registry.js';
import { can, audit } from './auth.js';
import { json, validatePayload } from './api-core.js';

const TABLE_ORDER = [
  'churches', 'roles', 'users', 'people', 'families', 'family_members', 'visitors', 'staff', 'courses',
  'course_enrollments', 'cells', 'cell_members', 'cell_meetings', 'cell_attendance', 'ministries',
  'ministry_members', 'volunteers', 'events', 'event_registrations', 'schedules', 'ebd_classes',
  'ebd_students', 'ebd_lessons', 'ebd_attendance', 'children', 'child_checkins', 'pastoral_care',
  'prayer_requests', 'bank_accounts', 'categories', 'cost_centers', 'funds', 'transactions', 'suppliers',
  'payables', 'receivables', 'budgets', 'contracts', 'assets', 'maintenance', 'documents', 'tasks',
  'calendar_events', 'announcements', 'notifications', 'integrations', 'audit_logs', 'settings',
];

export function registerOpsRoutes(router) {
  const authed = (handler) => async (req, res, ctx) => (ctx.user ? handler(req, res, ctx) : json(res, 401, { error: 'Sessão expirada.' }));
  const admin = (handler) => async (req, res, ctx) => {
    if (!ctx.user) return json(res, 401, { error: 'Sessão expirada.' });
    if (!can(ctx.user, 'configuracoes', 'edit') && ctx.user.role !== 'super_admin') {
      return json(res, 403, { error: 'Somente administradores podem executar esta operação.' });
    }
    return handler(req, res, ctx);
  };

  /* ----------------------------------------------------- endpoint de demo */
  /* /api/demo/accounts agora devolve lista vazia por padrão — contas de
     demonstração só existem no build estático (public/js/static-demo.js).
     O backend oficial não expõe credenciais prontas: cada Pastor ADM cria
     sua própria rede. */
  router.add('GET', '/api/demo/accounts', async (req, res) => {
    return json(res, 200, { data: [], demo: false, mensagem: 'O backend oficial não publica contas de demonstração. Use a vitrine estática (npm run build:static) ou cadastre sua igreja via /api/signup.' });
  });

  /* --------------------------------------------------- arvore de familia */
  router.add('GET', '/api/families/:id/tree', authed(async (req, res, ctx) => {
    if (!can(ctx.user, 'familias', 'view') && !can(ctx.user, 'pessoas', 'view')) return json(res, 403, { error: 'Sem permissão para consultar famílias.' });
    const churchId = ctx.user.church_id;
    const family = one('SELECT * FROM families WHERE id = ? AND church_id = ? AND deleted_at IS NULL', [req.params.id, churchId]);
    if (!family) return json(res, 404, { error: 'Família não encontrada.' });
    const members = all(
      `SELECT fm.id AS link_id, fm.role, p.id, p.full_name, p.birth_date, p.status, p.phone, p.whatsapp, p.marital_status,
              (SELECT c.name FROM cell_members cm JOIN cells c ON c.id = cm.cell_id WHERE cm.person_id = p.id AND cm.deleted_at IS NULL LIMIT 1) AS celula,
              (SELECT c.id FROM cell_members cm JOIN cells c ON c.id = cm.cell_id WHERE cm.person_id = p.id AND cm.deleted_at IS NULL LIMIT 1) AS celula_id,
              (SELECT mi.name FROM ministry_members mm JOIN ministries mi ON mi.id = mm.ministry_id WHERE mm.person_id = p.id AND mm.deleted_at IS NULL LIMIT 1) AS ministerio
       FROM family_members fm JOIN people p ON p.id = fm.person_id
       WHERE fm.church_id = ? AND fm.family_id = ? AND fm.deleted_at IS NULL ORDER BY
         CASE fm.role WHEN 'responsavel' THEN 0 WHEN 'conjuge' THEN 1 WHEN 'filho' THEN 2 ELSE 3 END, p.birth_date`,
      [churchId, req.params.id]
    );
    const ageOf = (b) => { if (!b) return null; const d = new Date(String(b).slice(0, 10) + 'T12:00:00Z'); const n = new Date(); let a = n.getUTCFullYear() - d.getUTCFullYear(); const m = n.getUTCMonth() - d.getUTCMonth(); if (m < 0 || (m === 0 && n.getUTCDate() < d.getUTCDate())) a--; return a; };
    const enriched = members.map((m) => ({ ...m, idade: ageOf(m.birth_date) }));
    const cells = [...new Set(enriched.map((m) => m.celula).filter(Boolean))];
    return json(res, 200, {
      family,
      responsaveis: enriched.filter((m) => ['responsavel', 'conjuge'].includes(m.role)),
      filhos: enriched.filter((m) => m.role === 'filho'),
      outros: enriched.filter((m) => !['responsavel', 'conjuge', 'filho'].includes(m.role)),
      membros: enriched, celulas: cells,
      resumo: {
        integrantes: enriched.length,
        criancas: enriched.filter((m) => m.idade !== null && m.idade <= 11).length,
        ativos: enriched.filter((m) => m.status === 'ativo').length,
      },
    });
  }));

  /* ------------------------------------------------------------- backup */
  router.add('GET', '/api/backup/export', admin(async (req, res, ctx) => {
    const churchId = ctx.user.church_id;
    const dump = { app: 'Eclesia One', version: '1.0.0', generated_at: isoNow(), church_id: churchId, tables: {} };
    let total = 0;
    for (const t of TABLE_ORDER) {
      const cols = all(`PRAGMA table_info(${t})`).map((c) => c.name);
      if (!cols.length) continue;
      let rows;
      if (cols.includes('church_id')) rows = all(`SELECT * FROM ${t} WHERE church_id = ?`, [churchId]);
      else if (t === 'churches') rows = all('SELECT * FROM churches WHERE id = ?', [churchId]);
      else continue;
      if (!rows.length) continue;
      dump.tables[t] = rows;
      total += rows.length;
    }
    dump.record_count = total;
    audit({ churchId, user: ctx.user, action: 'backup_export', module: 'configuracoes', resource: 'backup', after: { registros: total }, ip: req.ip });
    const payload = JSON.stringify(dump, null, 1);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="backup-eclesiaone-${isoDate()}.json"`,
    });
    return res.end(payload);
  }));

  router.add('POST', '/api/backup/restore', admin(async (req, res, ctx) => {
    const dump = req.body?.dump;
    if (!dump || typeof dump !== 'object' || !dump.tables) return json(res, 422, { error: 'Arquivo de backup inválido.' });
    const churchId = ctx.user.church_id;
    const summary = { inseridos: 0, ignorados: 0, tabelas: {} };
    db.exec('PRAGMA foreign_keys = OFF');
    try {
      for (const t of TABLE_ORDER) {
        const rows = dump.tables[t];
        if (!Array.isArray(rows) || !rows.length) continue;
        const cols = all(`PRAGMA table_info(${t})`).map((c) => c.name);
        if (!cols.length) continue;
        let ins = 0, skip = 0;
        for (const row of rows) {
          const keys = Object.keys(row).filter((k) => cols.includes(k));
          if (!keys.length) continue;
          if (cols.includes('church_id')) row.church_id = churchId;
          if (t === 'churches') row.id = churchId;
          const exists = cols.includes('id') && row.id ? scalar(`SELECT id FROM ${t} WHERE id = ?`, [row.id]) : null;
          const dupWhere = [];
          const dupArgs = [];
          if (t === 'people' && row.full_name) { dupWhere.push('full_name = ?'); dupArgs.push(row.full_name); }
          if (cols.includes('church_id')) { dupWhere.push('church_id = ?'); dupArgs.push(churchId); }
          const soft = cols.includes('deleted_at') ? ' AND deleted_at IS NULL' : '';
          const dup = dupWhere.length ? scalar(`SELECT id FROM ${t} WHERE ${dupWhere.join(' AND ')}${soft}`, dupArgs) : null;
          if (exists || dup) { skip++; continue; }
          try { insert(t, Object.fromEntries(keys.map((k) => [k, row[k]]))); ins++; } catch { skip++; }
        }
        summary.tabelas[t] = { inseridos: ins, ignorados: skip };
        summary.inseridos += ins; summary.ignorados += skip;
      }
    } catch (e) {
      return json(res, 400, { error: 'Falha ao restaurar o backup: ' + e.message });
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
    audit({ churchId, user: ctx.user, action: 'backup_restore', module: 'configuracoes', resource: 'backup', after: summary, ip: req.ip });
    return json(res, 200, { message: `Restauração concluída: ${summary.inseridos} registro(s) inserido(s), ${summary.ignorados} ignorado(s) por já existirem.`, summary });
  }));

  /* ----------------------------------------------------------- importacao */
  router.add('POST', '/api/import/:resource', authed(async (req, res, ctx) => {
    const key = String(req.params.resource);
    const def = RESOURCES[key];
    if (!def) return json(res, 404, { error: 'Recurso de importação não encontrado.' });
    if (def.readOnly) return json(res, 403, { error: 'Este recurso não aceita importação.' });
    if (!can(ctx.user, def.module, 'create')) return json(res, 403, { error: `Sem permissão para importar em ${def.plural}.` });
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    if (!rows) return json(res, 422, { error: 'Envie o conteúdo no formato { "rows": [ { ... } ] }.' });
    if (rows.length > 2000) return json(res, 422, { error: 'Limite de 2.000 registros por importação.' });
    const dryRun = req.body?.dry_run !== false;

    const churchId = ctx.user.church_id;
    const cols = all(`PRAGMA table_info(${def.table})`).map((c) => c.name);
    // cabeçalhos aceitos: nome do campo, ou o rótulo amigável em português
    const aliases = new Map();
    for (const c of cols) {
      aliases.set(c.toLowerCase(), c);
      aliases.set(c.replace(/_/g, ' ').toLowerCase(), c);
    }
    aliases.set('nome', 'full_name'); aliases.set('nome completo', 'full_name');
    aliases.set('nome do familiar', 'name'); aliases.set('nome da familia', 'name'); aliases.set('familia', 'name');
    aliases.set('telefone', 'phone'); aliases.set('celular', 'phone'); aliases.set('whatsapp', 'whatsapp');
    aliases.set('email', 'email'); aliases.set('e-mail', 'email'); aliases.set('bairro', 'district');
    aliases.set('cidade', 'city'); aliases.set('estado', 'state'); aliases.set('uf', 'state'); aliases.set('cep', 'zip');
    aliases.set('nascimento', 'birth_date'); aliases.set('data de nascimento', 'birth_date');
    aliases.set('situacao', 'status'); aliases.set('situação', 'status'); aliases.set('endereco', 'address'); aliases.set('endereço', 'address');
    aliases.set('cpf', 'cpf'); aliases.set('estado civil', 'marital_status'); aliases.set('sexo', 'gender');

    const seen = new Set();
    const valid = [], invalid = [];
    rows.forEach((raw, idx) => {
      const mapped = {};
      for (const [k, v] of Object.entries(raw || {})) {
        const col = aliases.get(String(k).trim().toLowerCase());
        if (col && !['id', 'church_id', 'created_at', 'updated_at', 'deleted_at', 'is_demo'].includes(col)) mapped[col] = typeof v === 'string' ? v.trim() : v;
      }
      const { errors, clean } = validatePayload(def, mapped);
      if (errors.length) { invalid.push({ linha: idx + 2, erro: errors[0], dados: raw }); return; }
      // deduplicacao
      const dupKey = def.table === 'people'
        ? (clean.cpf || clean.full_name || '').toLowerCase()
        : (clean.name ? String(clean.name).toLowerCase() : JSON.stringify(clean).toLowerCase());
      let duplicate = seen.has(dupKey);
      seen.add(dupKey);
      if (!duplicate) {
        const where = [];
        const args = [churchId];
        if (def.table === 'people') {
          if (clean.cpf) { where.push('cpf = ?'); args.push(clean.cpf); }
          else { where.push('full_name = ?'); args.push(clean.full_name); }
        } else if (clean.name) { where.push('name = ?'); args.push(clean.name); }
        if (where.length) duplicate = !!scalar(`SELECT id FROM ${def.table} WHERE church_id = ? AND ${where.join(' AND ')} AND deleted_at IS NULL`, args);
      }
      if (duplicate) { invalid.push({ linha: idx + 2, erro: 'Registro já existente (duplicidade evitada).', dados: raw }); return; }
      valid.push(clean);
    });

    if (dryRun) {
      return json(res, 200, {
        dry_run: true,
        total: rows.length, validos: valid.length, invalidos: invalid.length,
        previa: valid.slice(0, 10), erros: invalid.slice(0, 25),
        message: `Validação concluída: ${valid.length} registro(s) pronto(s) para importar e ${invalid.length} com problema.`,
      });
    }

    let inserted = 0;
    const created = [];
    for (const clean of valid) {
      clean.church_id = churchId;
      if (cols.includes('is_demo')) clean.is_demo = 0;
      clean.created_at = isoNow(); clean.updated_at = isoNow();
      try { created.push(insert(def.table, clean)); inserted++; } catch { invalid.push({ erro: 'Falha ao inserir registro.' }); }
    }
    audit({ churchId, user: ctx.user, action: 'importar', module: def.module, resource: def.table, after: { inseridos: inserted, recusados: invalid.length }, ip: req.ip });
    return json(res, 201, { inserted, rejected: invalid.length, ids: created, erros: invalid.slice(0, 25), message: `Importação concluída: ${inserted} registro(s) inserido(s).` });
  }));

  /* ------------------------------------------- exportacao personalizada */
  router.add('GET', '/api/export/:resource', authed(async (req, res, ctx) => {
    const key = String(req.params.resource);
    const def = RESOURCES[key];
    if (!def) return json(res, 404, { error: 'Recurso não encontrado.' });
    if (!can(ctx.user, def.module, 'export') && !can(ctx.user, def.module, 'view')) return json(res, 403, { error: 'Sem permissão para exportar este recurso.' });
    const format = String(req.query.format || 'csv');
    const columns = all(`PRAGMA table_info(${def.table})`).map((c) => c.name).filter((c) => !(def.hidden || []).includes(c));
    const rows = all(`SELECT * FROM ${def.table} WHERE church_id = ? AND deleted_at IS NULL ORDER BY id`, [ctx.user.church_id]);
    const labels = Object.fromEntries((def.listColumns || columns).map((c) => [c, c.replace(/_/g, ' ')]));
    if (format === 'csv') {
      const csv = toCsv(columns.map((c) => ({ label: labels[c] || c, key: c })), rows);
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${def.table}.csv"` });
      return res.end(csv);
    }
    if (format === 'pdf') {
      const pdf = buildPdf({
        title: def.plural, subtitle: `${rows.length} registro(s) — ${ctx.user.church_name || ''}`,
        columns: (def.listColumns || columns.slice(0, 7)).map((c) => ({ label: labels[c] || c, key: c })), rows,
        landscape: (def.listColumns || []).length > 5,
      });
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${def.table}.pdf"` });
      return res.end(pdf);
    }
    audit({ churchId: ctx.user.church_id, user: ctx.user, action: 'exportar', module: def.module, resource: def.table, after: { formato: format, registros: rows.length }, ip: req.ip });
    return json(res, 200, { resource: key, total: rows.length, columns, rows });
  }));

  /* -------------------------------------------------- conciliacao bancaria */
  router.add('GET', '/api/reconciliation', authed(async (req, res, ctx) => {
    if (!can(ctx.user, 'financeiro', 'view')) return res && json(res, 403, { error: 'Sem permissão.' });
    const churchId = ctx.user.church_id;
    const accounts = all('SELECT * FROM bank_accounts WHERE church_id = ? AND deleted_at IS NULL ORDER BY name', [churchId]);
    const from = String(req.query.from || '').slice(0, 10) || null;
    const to = String(req.query.to || '').slice(0, 10) || null;
    const data = accounts.map((a) => {
      const args = [churchId, a.id];
      let extra = '';
      if (from) { extra += ' AND tx_date >= ?'; args.push(from); }
      if (to) { extra += ' AND tx_date <= ?'; args.push(to); }
      const movements = all(
        `SELECT t.id, t.tx_date, t.tx_type, t.description, t.value, t.payment_method, t.document, t.dest_account_id,
                (SELECT name FROM bank_accounts b WHERE b.id = t.dest_account_id) AS destino
         FROM transactions t WHERE t.church_id = ? AND t.account_id = ? AND t.deleted_at IS NULL AND t.status != 'cancelado' ${extra}
         ORDER BY t.tx_date DESC, t.id DESC LIMIT 60`, args
      );
      const entradas = movements.filter((m) => m.tx_type === 'entrada').reduce((s, m) => s + Number(m.value), 0);
      const saidas = movements.filter((m) => m.tx_type === 'saida').reduce((s, m) => s + Number(m.value), 0);
      const transferOut = movements.filter((m) => m.tx_type === 'transferencia').reduce((s, m) => s + Number(m.value), 0);
      const transferIn = Number(scalar(`SELECT COALESCE(SUM(value),0) v FROM transactions WHERE church_id = ? AND dest_account_id = ? AND tx_type='transferencia' AND deleted_at IS NULL AND status!='cancelado'`, [churchId, a.id]));
      return {
        account: { id: a.id, name: a.name, bank: a.bank, account_type: a.account_type, status: a.status, initial_balance: Number(a.initial_balance) },
        saldo_contabil: Number(a.initial_balance) + entradas - saidas - transferOut + transferIn,
        entradas, saidas, transferOut, transferIn, movimentos: movements,
      };
    });
    return json(res, 200, { data, from, to, total_saldo: data.reduce((s, d) => s + d.saldo_contabil, 0) });
  }));

  /* --------------------------------------------- extrato por conta (PDF) */
  router.add('GET', '/api/accounts/:id/statement', authed(async (req, res, ctx) => {
    if (!can(ctx.user, 'financeiro', 'view')) return json(res, 403, { error: 'Sem permissão.' });
    const churchId = ctx.user.church_id;
    const acc = one('SELECT * FROM bank_accounts WHERE id = ? AND church_id = ? AND deleted_at IS NULL', [req.params.id, churchId]);
    if (!acc) return json(res, 404, { error: 'Conta não encontrada.' });
    const from = req.query.from || '1900-01-01';
    const to = req.query.to || isoDate();
    const rows = all(
      `SELECT tx_date, tx_type, description, value, payment_method, document FROM transactions
       WHERE church_id = ? AND account_id = ? AND deleted_at IS NULL AND status != 'cancelado' AND tx_date BETWEEN ? AND ?
       ORDER BY tx_date, id`, [churchId, acc.id, from, to]
    );
    const entradas = rows.filter((r) => r.tx_type === 'entrada').reduce((s, r) => s + Number(r.value), 0);
    const saidas = rows.filter((r) => r.tx_type === 'saida').reduce((s, r) => s + Number(r.value), 0);
    const pdf = buildPdf({
      title: `Extrato — ${acc.name}`, subtitle: `${acc.bank || ''} · ${String(from).slice(0, 10)} a ${String(to).slice(0, 10)}`,
      meta: [`Igreja: ${ctx.user.church_name || '—'}`, `Usuário: ${ctx.user.name}`],
      summary: [
        { label: 'Saldo inicial', value: Number(acc.initial_balance).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) },
        { label: 'Entradas', value: entradas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) },
        { label: 'Saídas', value: saidas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) },
        { label: 'Saldo final', value: (Number(acc.initial_balance) + entradas - saidas).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) },
      ],
      columns: [
        { label: 'Data', key: 'tx_date' }, { label: 'Tipo', key: 'tx_type', width: .8 }, { label: 'Descrição', key: 'description', width: 2.4 },
        { label: 'Forma', key: 'payment_method', width: 1 }, { label: 'Documento', key: 'document', width: 1 },
        { label: 'Valor', value: (r) => Number(r.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) },
      ],
      rows,
    });
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="extrato-${acc.id}.pdf"` });
    return res.end(pdf);
  }));

  /* -------------------------------------------------- agenda consolidada */
  router.add('GET', '/api/agenda', authed(async (req, res, ctx) => {
    const churchId = ctx.user.church_id;
    const from = String(req.query.from || isoDate()).slice(0, 10);
    const to = String(req.query.to || isoDate()).slice(0, 10);
    const allowed = ['culto', 'celula', 'reuniao', 'evento', 'pastoral', 'administrativo', 'financeiro', 'ministerio'];
    const filters = String(req.query.categories || '').split(',').map((s) => s.trim()).filter((c) => allowed.includes(c));
    const rows = all(
      `SELECT * FROM calendar_events WHERE church_id = ? AND deleted_at IS NULL AND date(start_at) BETWEEN ? AND ? ORDER BY start_at`,
      [churchId, from, to]
    );
    const events = all(
      `SELECT id, name, event_date, start_time, end_time, location, status, capacity FROM events
       WHERE church_id = ? AND deleted_at IS NULL AND event_date BETWEEN ? AND ? ORDER BY event_date`, [churchId, from, to]
    );
    const cells = all(`SELECT id, name, weekday, meeting_time FROM cells WHERE church_id = ? AND deleted_at IS NULL AND status = 'ativa'`, [churchId]);
    const schedules = all(`SELECT id, schedule_date, schedule_time, function_name, status FROM schedules WHERE church_id = ? AND deleted_at IS NULL AND schedule_date BETWEEN ? AND ?`, [churchId, from, to]);
    const combined = [
      ...rows.map((r) => ({ id: `cal-${r.id}`, ref: r.id, source: 'agenda', title: r.title, category: r.category, start: r.start_at, end: r.end_at, location: r.location, status: null })),
      ...events.map((e) => ({ id: `evt-${e.id}`, ref: e.id, source: 'evento', title: e.name, category: 'evento', start: `${e.event_date} ${e.start_time || '00:00'}`, end: `${e.event_date} ${e.end_time || ''}`, location: e.location, status: e.status })),
    ].filter((r) => !filters.length || filters.includes(r.category));
    return json(res, 200, { data: combined, cells, schedules, from, to, counts: combined.reduce((a, r) => (a[r.category] = (a[r.category] || 0) + 1, a), {}) });
  }));
}
