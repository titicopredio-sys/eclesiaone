/**
 * Eclesia One - Dashboards, Financeiro analitico, Relatorios, Alertas,
 * Assistente IA (consultas escopadas por permissao), QR Code e Check-in infantil.
 */
import { all, one, scalar, run, insert } from './db.js';
import { isoNow, isoDate, addDays, daysBetween, buildPdf, toCsv, money, pct, monthKey } from './lib.js';
import { RESOURCES, FK_MAP } from './registry.js';
import { can, audit } from './auth.js';
import { qrSvg } from '../shared/qr.js';
import { json } from './api-core.js';

const n = (v) => Number(v || 0);
const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const ageOf = (birth) => {
  if (!birth) return null;
  const d = new Date(String(birth).slice(0, 10) + 'T12:00:00Z');
  const now = new Date();
  let a = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) a--;
  return a;
};

const ageBucket = (age) => {
  if (age === null) return 'nao_informado';
  if (age <= 11) return 'criancas';
  if (age <= 17) return 'adolescentes';
  if (age <= 35) return 'jovens';
  if (age <= 59) return 'adultos';
  return 'idosos';
};

/* ============================================================ financeiro */
export function accountBalances(churchId) {
  const accounts = all('SELECT * FROM bank_accounts WHERE church_id = ? AND deleted_at IS NULL ORDER BY name', [churchId]);
  const mov = all(
    `SELECT account_id, dest_account_id, tx_type, SUM(value) total FROM transactions
     WHERE church_id = ? AND deleted_at IS NULL AND status != 'cancelado' GROUP BY account_id, dest_account_id, tx_type`,
    [churchId]
  );
  const credits = {}, debits = {};
  for (const m of mov) {
    if (m.tx_type === 'entrada') credits[m.account_id] = n(credits[m.account_id]) + n(m.total);
    else if (m.tx_type === 'saida') debits[m.account_id] = n(debits[m.account_id]) + n(m.total);
    else if (m.tx_type === 'transferencia') {
      debits[m.account_id] = n(debits[m.account_id]) + n(m.total);
      credits[m.dest_account_id] = n(credits[m.dest_account_id]) + n(m.total);
    }
  }
  const rows = accounts.map((a) => {
    const c = n(credits[a.id]), d = n(debits[a.id]);
    return {
      id: a.id, name: a.name, bank: a.bank, account_type: a.account_type, status: a.status,
      initial_balance: n(a.initial_balance), entradas: c, saidas: d,
      saldo: n(a.initial_balance) + c - d,
    };
  });
  return { accounts: rows, total: rows.reduce((s, r) => s + r.saldo, 0), entradas: rows.reduce((s, r) => s + r.entradas, 0), saidas: rows.reduce((s, r) => s + r.saidas, 0) };
}

export function periodSummary(churchId, from, to) {
  const rows = all(
    `SELECT t.tx_type, c.name AS categoria, c.kind, SUM(t.value) total, COUNT(*) qtd
     FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.church_id = ? AND t.deleted_at IS NULL AND t.status != 'cancelado' AND t.tx_date BETWEEN ? AND ?
     GROUP BY t.tx_type, c.name, c.kind ORDER BY total DESC`,
    [churchId, from, to]
  );
  const entradas = rows.filter((r) => r.tx_type === 'entrada');
  const saidas = rows.filter((r) => r.tx_type === 'saida');
  const sum = (arr) => arr.reduce((s, r) => s + n(r.total), 0);
  return {
    entradas: sum(entradas), saidas: sum(saidas), resultado: sum(entradas) - sum(saidas),
    entradas_detalhe: entradas, saidas_detalhe: saidas,
    dizimos: n(entradas.find((r) => r.categoria === 'Dízimos')?.total),
    ofertas: sum(entradas.filter((r) => (r.categoria || '').startsWith('Ofertas'))),
  };
}

export function monthlySeries(churchId, monthsBack = 6) {
  const out = [];
  const now = new Date();
  for (let i = monthsBack; i >= 0; i--) {
    const ref = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const y = ref.getUTCFullYear(), m = ref.getUTCMonth() + 1;
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const s = periodSummary(churchId, `${key}-01`, `${key}-31`);
    out.push({
      month: key, label: `${MONTHS_PT[m - 1].slice(0, 3)}/${String(y).slice(2)}`,
      entradas: s.entradas, saidas: s.saidas, resultado: s.resultado, dizimos: s.dizimos, ofertas: s.ofertas,
    });
  }
  return out;
}

export function cashFlow(churchId, days = 30) {
  const bal = accountBalances(churchId);
  const horizon = addDays(isoDate(), days);
  const today = isoDate();
  const rec = one(
    `SELECT COALESCE(SUM(value),0) v FROM receivables WHERE church_id = ? AND deleted_at IS NULL
     AND status IN ('pendente','atrasada') AND due_date <= ?`, [churchId, horizon]
  ).v;
  const pay = one(
    `SELECT COALESCE(SUM(value),0) v FROM payables WHERE church_id = ? AND deleted_at IS NULL
     AND status IN ('pendente','aprovada','agendada','vencida') AND due_date <= ?`, [churchId, horizon]
  ).v;
  const overduePay = one(
    `SELECT COALESCE(SUM(value),0) v, COUNT(*) c FROM payables WHERE church_id = ? AND deleted_at IS NULL
     AND status IN ('pendente','aprovada','agendada','vencida') AND due_date < ?`, [churchId, today]
  );
  const series = [];
  for (let d = 0; d <= days; d++) {
    const day = addDays(today, d);
    const r = n(one(`SELECT COALESCE(SUM(value),0) v FROM receivables WHERE church_id=? AND deleted_at IS NULL AND status IN ('pendente','atrasada') AND due_date = ?`, [churchId, day]).v);
    const p = n(one(`SELECT COALESCE(SUM(value),0) v FROM payables WHERE church_id=? AND deleted_at IS NULL AND status IN ('pendente','aprovada','agendada','vencida') AND due_date = ?`, [churchId, day]).v);
    series.push({ date: day, receber: r, pagar: p });
  }
  let acc = bal.total;
  const projection = series.map((s) => { acc += s.receber - s.pagar; return { ...s, saldo_projetado: acc }; });
  return {
    saldo_atual: bal.total, a_receber: n(rec), a_pagar: n(pay),
    saldo_projetado: bal.total + n(rec) - n(pay),
    vencidas: { valor: n(overduePay.v), quantidade: n(overduePay.c) },
    horizonte_dias: days, projection, negative: bal.total + n(rec) - n(pay) < 0,
  };
}

/* ================================================================= alertas */
export function buildAlerts(churchId, user) {
  const today = isoDate();
  const alerts = [];
  const push = (o) => alerts.push(o);

  if (can(user, 'contas', 'view') || can(user, 'financeiro', 'view')) {
    const overdue = all(
      `SELECT p.id, p.description, p.value, p.due_date FROM payables p
       WHERE p.church_id = ? AND p.deleted_at IS NULL AND p.status IN ('pendente','aprovada','agendada','vencida') AND p.due_date < ?
       ORDER BY p.due_date LIMIT 20`, [churchId, today]
    );
    if (overdue.length) push({
      kind: 'danger', group: 'financeiro', title: `${overdue.length} conta(s) vencida(s)`,
      detail: `Total em atraso: ${money(overdue.reduce((s, r) => s + n(r.value), 0))}`,
      link: '#/contas-a-pagar?f_status=vencida', items: overdue.map((r) => ({ id: r.id, label: r.description, meta: `${r.due_date} · ${money(r.value)}` })),
    });
    const soon = all(
      `SELECT id, description, value, due_date FROM payables WHERE church_id = ? AND deleted_at IS NULL
       AND status IN ('pendente','aprovada','agendada') AND due_date BETWEEN ? AND ? ORDER BY due_date LIMIT 20`,
      [churchId, today, addDays(today, 7)]
    );
    if (soon.length) push({ kind: 'warning', group: 'financeiro', title: `${soon.length} conta(s) vencem em até 7 dias`, detail: money(soon.reduce((s, r) => s + n(r.value), 0)), link: '#/contas-a-pagar', items: soon.map((r) => ({ id: r.id, label: r.description, meta: `${r.due_date} · ${money(r.value)}` })) });
    const cf = cashFlow(churchId, 30);
    if (cf.negative) push({ kind: 'danger', group: 'financeiro', title: 'FLUXO DE CAIXA PROJETADO NEGATIVO', detail: `Projeção em 30 dias: ${money(cf.saldo_projetado)}`, link: '#/fluxo-de-caixa' });
  }

  if (can(user, 'celulas', 'view')) {
    const noReport = all(
      `SELECT c.id, c.name, MAX(m.meeting_date) ultima FROM cells c
       LEFT JOIN cell_meetings m ON m.cell_id = c.id AND m.deleted_at IS NULL
       WHERE c.church_id = ? AND c.deleted_at IS NULL AND c.status = 'ativa'
       GROUP BY c.id HAVING ultima IS NULL OR ultima < ? LIMIT 20`,
      [churchId, addDays(today, -7)]
    );
    if (noReport.length) push({ kind: 'warning', group: 'celulas', title: `${noReport.length} célula(s) sem relatório recente`, detail: 'Nenhuma reunião registrada nos últimos 7 dias.', link: '#/reunioes-de-celula', items: noReport.map((r) => ({ id: r.id, label: r.name, meta: r.ultima ? `última: ${r.ultima}` : 'sem registro' })) });
  }

  if (can(user, 'escalas', 'view')) {
    const pend = all(`SELECT id, schedule_date, function_name FROM schedules WHERE church_id = ? AND deleted_at IS NULL AND status = 'pendente' AND schedule_date >= ? ORDER BY schedule_date LIMIT 20`, [churchId, today]);
    if (pend.length) push({ kind: 'info', group: 'escalas', title: `${pend.length} escala(s) sem confirmação`, detail: 'Voluntários ainda não responderam.', link: '#/escalas?f_status=pendente', items: pend.map((r) => ({ id: r.id, label: r.function_name, meta: r.schedule_date })) });
  }

  if (can(user, 'eventos', 'view')) {
    const evs = all(`SELECT id, name, event_date FROM events WHERE church_id = ? AND deleted_at IS NULL AND event_date BETWEEN ? AND ? ORDER BY event_date LIMIT 20`, [churchId, today, addDays(today, 7)]);
    if (evs.length) push({ kind: 'info', group: 'eventos', title: `${evs.length} evento(s) nos próximos 7 dias`, detail: evs.map((e) => e.name).join(' · '), link: '#/eventos', items: evs.map((r) => ({ id: r.id, label: r.name, meta: r.event_date })) });
  }

  if (can(user, 'documentos', 'view')) {
    const docs = all(`SELECT id, title, valid_until FROM documents WHERE church_id = ? AND deleted_at IS NULL AND valid_until IS NOT NULL AND valid_until BETWEEN ? AND ? ORDER BY valid_until LIMIT 20`, [churchId, today, addDays(today, 45)]);
    if (docs.length) push({ kind: 'warning', group: 'documentos', title: `${docs.length} documento(s) vencendo`, detail: 'Validade em até 45 dias.', link: '#/documentos', items: docs.map((r) => ({ id: r.id, label: r.title, meta: `vence ${r.valid_until}` })) });
  }

  if (can(user, 'manutencao', 'view')) {
    const mans = all(`SELECT id, problem, priority FROM maintenance WHERE church_id = ? AND deleted_at IS NULL AND status NOT IN ('concluido','cancelado') LIMIT 20`, [churchId]);
    if (mans.length) push({ kind: 'warning', group: 'manutencao', title: `${mans.length} manutenção(ões) pendente(s)`, detail: 'Itens aguardando conclusão.', link: '#/manutencoes', items: mans.map((r) => ({ id: r.id, label: r.problem, meta: r.priority })) });
  }

  if (can(user, 'tarefas', 'view')) {
    const late = all(`SELECT id, title, due_date FROM tasks WHERE church_id = ? AND deleted_at IS NULL AND status NOT IN ('concluida','cancelada') AND due_date < ? LIMIT 20`, [churchId, today]);
    if (late.length) push({ kind: 'danger', group: 'tarefas', title: `${late.length} tarefa(s) atrasada(s)`, detail: 'Prazo já encerrado.', link: '#/tarefas', items: late.map((r) => ({ id: r.id, label: r.title, meta: r.due_date })) });
  }

  if (can(user, 'contratos', 'view')) {
    const cts = all(`SELECT id, description, end_date FROM contracts WHERE church_id = ? AND deleted_at IS NULL AND status = 'vigente' AND end_date BETWEEN ? AND ? LIMIT 20`, [churchId, today, addDays(today, 45)]);
    if (cts.length) push({ kind: 'warning', group: 'contratos', title: `${cts.length} contrato(s) a vencer`, detail: 'Término em até 45 dias.', link: '#/contratos', items: cts.map((r) => ({ id: r.id, label: r.description, meta: `término ${r.end_date}` })) });
  }

  if (can(user, 'pastoral', 'view')) {
    const acts = all(`SELECT id, next_action, next_action_date FROM pastoral_care WHERE church_id = ? AND deleted_at IS NULL AND status != 'concluido' AND next_action_date IS NOT NULL AND next_action_date <= ? LIMIT 20`, [churchId, today]);
    if (acts.length) push({ kind: 'info', group: 'pastoral', title: `${acts.length} ação(ões) pastoral(is) em atraso`, detail: 'Próxima ação com data vencida.', link: '#/acompanhamentos', items: acts.map((r) => ({ id: r.id, label: r.next_action, meta: r.next_action_date })) });
  }

  if (can(user, 'infantil', 'view')) {
    const open = all(`SELECT id, code, child_id, checkin_at FROM child_checkins WHERE church_id = ? AND deleted_at IS NULL AND checkout_at IS NULL ORDER BY checkin_at DESC LIMIT 20`, [churchId]);
    if (open.length) push({ kind: 'info', group: 'infantil', title: `${open.length} criança(s) sem check-out`, detail: 'Confirme a saída com o responsável autorizado.', link: '#/check-ins', items: open.map((r) => ({ id: r.id, label: r.code, meta: r.checkin_at })) });
  }

  const order = { danger: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => order[a.kind] - order[b.kind]);
  return alerts;
}

/* ============================================================== dashboard */
export function dashboardData(churchId, user) {
  const today = isoDate();
  const monthStart = today.slice(0, 8) + '01';
  const prevMonthEnd = addDays(monthStart, -1);

  /* --------------------------------------------------------------- pessoas */
  const peopleStats = (() => {
    const rows = all('SELECT id, birth_date, status, join_date, baptism_date, leader_flag FROM people WHERE church_id = ? AND deleted_at IS NULL', [churchId]);
    const byStatus = {};
    const byAge = { criancas: 0, adolescentes: 0, jovens: 0, adultos: 0, idosos: 0, nao_informado: 0 };
    let novos = 0, convertidos = 0;
    for (const p of rows) {
      byStatus[p.status] = n(byStatus[p.status]) + 1;
      byAge[ageBucket(ageOf(p.birth_date))]++;
      if (p.join_date && p.join_date.slice(0, 7) === monthKey(today)) novos++;
      if (p.baptism_date && p.baptism_date.slice(0, 7) === monthKey(today)) convertidos++;
    }
    const families = scalar('SELECT COUNT(*) FROM families WHERE church_id = ? AND deleted_at IS NULL', [churchId]);
    return {
      total: rows.length,
      ativos: n(byStatus.ativo), inativos: n(byStatus.inativo), visitantes: n(byStatus.visitante),
      em_acompanhamento: n(byStatus.em_acompanhamento), transferidos: n(byStatus.transferido),
      novos_mes: novos, novos_convertidos: convertidos, familias: n(families),
      lideres: rows.filter((r) => r.leader_flag).length,
      faixa: byAge,
    };
  })();

  /* ------------------------------------------------------------ ministerios */
  const ministriesStats = (() => {
    const cells = all('SELECT id, name, status FROM cells WHERE church_id = ? AND deleted_at IS NULL', [churchId]);
    const ministries = all('SELECT id, name, status FROM ministries WHERE church_id = ? AND deleted_at IS NULL', [churchId]);
    const leaders = scalar('SELECT COUNT(*) FROM people WHERE church_id = ? AND leader_flag = 1 AND deleted_at IS NULL', [churchId]);
    const volunteers = scalar('SELECT COUNT(*) FROM volunteers WHERE church_id = ? AND deleted_at IS NULL AND status = ?', [churchId, 'ativo']);
    const ebdClasses = scalar('SELECT COUNT(*) FROM ebd_classes WHERE church_id = ? AND deleted_at IS NULL', [churchId]);
    const upcoming = all('SELECT id, name, event_date, location FROM events WHERE church_id = ? AND deleted_at IS NULL AND event_date >= ? ORDER BY event_date LIMIT 5', [churchId, today]);
    const pendingSchedules = scalar('SELECT COUNT(*) FROM schedules WHERE church_id = ? AND deleted_at IS NULL AND status = ?', [churchId, 'pendente']);
    const cellMembers = scalar('SELECT COUNT(*) FROM cell_members WHERE church_id = ? AND deleted_at IS NULL AND status = ?', [churchId, 'ativo']);
    const attendance = all(
      `SELECT meeting_date, present_count, cell_id FROM cell_meetings WHERE church_id = ? AND deleted_at IS NULL AND meeting_date >= ?`,
      [churchId, addDays(today, -35)]
    );
    const mediaPresenca = attendance.length ? Math.round(attendance.reduce((s, r) => s + n(r.present_count), 0) / attendance.length) : 0;
    return {
      celulas: cells.length, celulas_ativas: cells.filter((c) => c.status === 'ativa').length,
      ministérios: ministries.length, ministérios_ativos: ministries.filter((m) => m.status === 'ativo').length,
      lideres: n(leaders), voluntarios: n(volunteers), classes_ebd: n(ebdClasses),
      proximos_eventos: upcoming, escalas_pendentes: n(pendingSchedules),
      membros_celula: n(cellMembers), media_presenca: mediaPresenca, total_ministérios: ministries.length,
    };
  })();

  /* ------------------------------------------------------------- financeiro */
  const finance = (() => {
    if (!can(user, 'financeiro', 'view') && !can(user, 'contas', 'view')) return null;
    const bal = accountBalances(churchId);
    const mes = periodSummary(churchId, monthStart, today);
    const anterior = periodSummary(churchId, prevMonthEnd.slice(0, 8) + '01', prevMonthEnd);
    const cf = cashFlow(churchId, 30);
    const overdue = one(`SELECT COALESCE(SUM(value),0) v, COUNT(*) c FROM payables WHERE church_id = ? AND deleted_at IS NULL AND status IN ('pendente','aprovada','agendada','vencida') AND due_date < ?`, [churchId, today]);
    const receivablesOpen = one(`SELECT COALESCE(SUM(value),0) v FROM receivables WHERE church_id = ? AND deleted_at IS NULL AND status IN ('pendente','atrasada')`, [churchId]);
    const y = today.slice(0, 4);
    const budget = one(`SELECT COALESCE(SUM(planned_value),0) v FROM budgets WHERE church_id = ? AND deleted_at IS NULL AND year = ?`, [churchId, Number(y)]);
    const specialOver = [];
    return {
      saldo: bal.total, contas: bal.accounts,
      entradas_mes: mes.entradas, saidas_mes: mes.saidas, resultado_mes: mes.resultado,
      resultado_anterior: anterior.resultado, dizimos: mes.dizimos, ofertas: mes.ofertas,
      a_pagar: cf.a_pagar, a_receber: n(receivablesOpen.v), saldo_projetado: cf.saldo_projetado,
      contas_vencidas: n(overdue.c), valor_vencido: n(overdue.v),
      orcamento_anual: n(budget.v), fluxo_negativo: cf.negative,
    };
  })();

  const alerts = buildAlerts(churchId, user);

  return {
    generated_at: isoNow(),
    people: peopleStats,
    ministries: ministriesStats,
    finance,
    alerts,
    scope: { role: user.role, role_name: user.role_name, church: user.church_name, user: user.name, person_id: user.person_id },
    visibility: {
      financeiro: !!(can(user, 'financeiro', 'view') || can(user, 'contas', 'view')),
      pastoral: can(user, 'pastoral', 'view'),
      pessoas: can(user, 'pessoas', 'view'),
      celulas: can(user, 'celulas', 'view'),
    },
  };
}

/* ======================================================== painel de celulas */
export function cellsPanel(churchId, user) {
  const restricted = user.role === 'lider_celula' && user.person_id;
  const cells = all(
    `SELECT c.*, (SELECT full_name FROM people p WHERE p.id = c.leader_id) AS lider,
            (SELECT full_name FROM people p WHERE p.id = c.co_leader_id) AS co_lider,
            (SELECT full_name FROM people p WHERE p.id = c.supervisor_id) AS supervisor
     FROM cells c WHERE c.church_id = ? AND c.deleted_at IS NULL
     ${restricted ? 'AND (c.leader_id = ? OR c.co_leader_id = ?)' : ''} ORDER BY c.name`,
    restricted ? [churchId, user.person_id, user.person_id] : [churchId]
  );
  return cells.map((c) => {
    const members = scalar('SELECT COUNT(*) FROM cell_members WHERE church_id = ? AND cell_id = ? AND deleted_at IS NULL AND status = ?', [churchId, c.id, 'ativo']);
    const meetings = scalar('SELECT COUNT(*) FROM cell_meetings WHERE church_id = ? AND cell_id = ? AND deleted_at IS NULL', [churchId, c.id]);
    const media = scalar('SELECT AVG(present_count) v FROM cell_meetings WHERE church_id = ? AND cell_id = ? AND deleted_at IS NULL', [churchId, c.id]);
    const visitors = scalar('SELECT COALESCE(SUM(visitors_count),0) v FROM cell_meetings WHERE church_id = ? AND cell_id = ? AND deleted_at IS NULL', [churchId, c.id]);
    const last = one('SELECT meeting_date, present_count, report_sent FROM cell_meetings WHERE church_id = ? AND cell_id = ? AND deleted_at IS NULL ORDER BY meeting_date DESC LIMIT 1', [churchId, c.id]);
    const reports = scalar('SELECT COUNT(*) FROM cell_meetings WHERE church_id = ? AND cell_id = ? AND deleted_at IS NULL AND report_sent = 1', [churchId, c.id]);
    const pending = last ? 1 : 0;
    return {
      ...c, membros: n(members), reunioes: n(meetings),
      media_presenca: media ? Math.round(n(media) * 10) / 10 : 0,
      visitantes: n(visitors), relatorios: n(reports),
      ultima_reuniao: last?.meeting_date || null, ultima_presenca: last?.present_count ?? 0,
      proxima_reuniao: nextWeekday(c.weekday),
      sem_relatorio: !last || (last.meeting_date < addDays(isoDate(), -7) && !!pending),
      ocupacao: c.capacity ? pct(n(members), n(c.capacity)) : null,
    };
  });
}

function nextWeekday(weekday) {
  const map = { domingo: 0, segunda: 1, terca: 2, terça: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6, sábado: 6 };
  const target = map[String(weekday || '').toLowerCase()];
  if (target === undefined) return null;
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let diff = (target - d.getUTCDay() + 7) % 7;
  if (diff === 0) diff = 7;
  return addDays(isoDate(), diff);
}

/* =============================================================== relatorios */
export function reportData(churchId, user, kind, query = {}) {
  const from = query.from || addDays(isoDate(), -90);
  const to = query.to || isoDate();
  const q = (sql, p = []) => all(sql, [churchId, ...p]);
  const guard = (moduleKey) => { if (!can(user, moduleKey, 'view') && user.role !== 'super_admin') throw Object.assign(new Error(`Sem permissão para o relatório de ${moduleKey}.`), { status: 403 }); };
  const dt = (s) => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—');

  switch (kind) {
    case 'membros': {
      guard('pessoas');
      const rows = q(`SELECT full_name, status, phone, whatsapp, email, district, city, marital_status, join_date, baptism_date, birth_date,
                      (SELECT name FROM families f JOIN family_members m ON m.family_id=f.id WHERE m.person_id = people.id AND f.deleted_at IS NULL AND m.deleted_at IS NULL LIMIT 1) AS familia
                      FROM people WHERE church_id = ? AND deleted_at IS NULL ORDER BY full_name`);
      return {
        title: 'Relatório de Membros', module: 'pessoas',
        summary: [
          { label: 'Total', value: rows.length },
          { label: 'Ativos', value: rows.filter((r) => r.status === 'ativo').length },
          { label: 'Inativos', value: rows.filter((r) => r.status === 'inativo').length },
          { label: 'Visitantes', value: rows.filter((r) => r.status === 'visitante').length },
        ],
        columns: [
          { label: 'Nome', key: 'full_name', width: 2.4 }, { label: 'Situação', key: 'status' }, { label: 'Telefone', key: 'phone', width: 1.3 },
          { label: 'Família', key: 'familia', width: 1.6 }, { label: 'Bairro', key: 'district' }, { label: 'Ingresso', value: (r) => dt(r.join_date) },
          { label: 'Batismo', value: (r) => dt(r.baptism_date) },
        ],
        rows,
      };
    }
    case 'visitantes': {
      guard('visitantes');
      const rows = q(`SELECT p.full_name, v.first_visit_date, v.service, v.stage, v.status, v.origin, p.phone, p.whatsapp,
                      (SELECT full_name FROM people x WHERE x.id = v.follow_up_by) AS responsavel
                      FROM visitors v JOIN people p ON p.id = v.person_id WHERE v.church_id = ? AND v.deleted_at IS NULL AND v.first_visit_date BETWEEN ? AND ? ORDER BY v.first_visit_date DESC`, [from, to]);
      return {
        title: 'Relatório de Visitantes', module: 'visitantes', subtitle: `Período ${dt(from)} a ${dt(to)}`,
        summary: [
          { label: 'Visitantes', value: rows.length },
          { label: 'Em acompanhamento', value: rows.filter((r) => r.status === 'em_acompanhamento').length },
          { label: 'Integrados', value: rows.filter((r) => r.status === 'integrado').length },
        ],
        columns: [
          { label: 'Nome', key: 'full_name', width: 2.2 }, { label: '1ª visita', value: (r) => dt(r.first_visit_date) },
          { label: 'Culto', key: 'service', width: 1.3 }, { label: 'Etapa', key: 'stage' }, { label: 'Situação', key: 'status' },
          { label: 'Telefone', key: 'phone' }, { label: 'Acompanhamento', key: 'responsavel', width: 1.5 },
        ],
        rows,
      };
    }
    case 'familias': {
      guard('familias');
      const rows = q(`SELECT f.name, f.district, f.city, f.phone,
                      (SELECT COUNT(*) FROM family_members m WHERE m.family_id = f.id AND m.deleted_at IS NULL) AS integrantes
                      FROM families f WHERE f.church_id = ? AND f.deleted_at IS NULL ORDER BY f.name`);
      return {
        title: 'Relatório de Famílias', module: 'familias',
        summary: [{ label: 'Famílias', value: rows.length }, { label: 'Integrantes', value: rows.reduce((s, r) => s + n(r.integrantes), 0) }],
        columns: [{ label: 'Família', key: 'name', width: 2 }, { label: 'Integrantes', key: 'integrantes' }, { label: 'Bairro', key: 'district' }, { label: 'Cidade', key: 'city' }, { label: 'Telefone', key: 'phone' }],
        rows,
      };
    }
    case 'aniversariantes': {
      guard('pessoas');
      const month = Number(query.month) || new Date().getUTCMonth() + 1;
      const rows = q(`SELECT full_name, birth_date, phone, whatsapp, district FROM people
                      WHERE church_id = ? AND deleted_at IS NULL AND birth_date IS NOT NULL
                      AND CAST(strftime('%m', birth_date) AS INTEGER) = ? ORDER BY strftime('%d', birth_date)`, [month]);
      return {
        title: `Aniversariantes de ${MONTHS_PT[month - 1]}`, module: 'pessoas',
        summary: [{ label: 'Aniversariantes', value: rows.length }],
        columns: [{ label: 'Nome', key: 'full_name', width: 2.4 }, { label: 'Dia', value: (r) => String(r.birth_date).slice(8, 10) + '/' + String(r.birth_date).slice(5, 7) }, { label: 'Telefone', key: 'phone' }, { label: 'Bairro', key: 'district' }],
        rows,
      };
    }
    case 'crescimento': {
      guard('pessoas');
      const rows = [];
      for (let i = 5; i >= 0; i--) {
        const ref = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - i, 1));
        const key = `${ref.getUTCFullYear()}-${String(ref.getUTCMonth() + 1).padStart(2, '0')}`;
        rows.push({
          mes: key,
          novos: n(scalar(`SELECT COUNT(*) FROM people WHERE church_id = ? AND deleted_at IS NULL AND join_date LIKE ?`, [churchId, key + '%'])),
          batismos: n(scalar(`SELECT COUNT(*) FROM people WHERE church_id = ? AND deleted_at IS NULL AND baptism_date LIKE ?`, [churchId, key + '%'])),
          visitantes: n(scalar(`SELECT COUNT(*) FROM visitors WHERE church_id = ? AND deleted_at IS NULL AND first_visit_date LIKE ?`, [churchId, key + '%'])),
        });
      }
      return {
        title: 'Relatório de Crescimento', module: 'pessoas',
        summary: [{ label: 'Novos (6 meses)', value: rows.reduce((s, r) => s + r.novos, 0) }, { label: 'Batismos', value: rows.reduce((s, r) => s + r.batismos, 0) }, { label: 'Visitantes', value: rows.reduce((s, r) => s + r.visitantes, 0) }],
        columns: [{ label: 'Mês', key: 'mes' }, { label: 'Novos membros', key: 'novos' }, { label: 'Batismos', key: 'batismos' }, { label: 'Visitantes', key: 'visitantes' }],
        rows,
      };
    }
    case 'celulas': {
      guard('celulas');
      const rows = cellsPanel(churchId, user).map((c) => ({ nome: c.name, lider: c.lider, membros: c.membros, reunioes: c.reunioes, media_presenca: c.media_presenca, visitantes: c.visitantes, relatorios: c.relatorios, ultima: c.ultima_reuniao || '—', status: c.status }));
      return {
        title: 'Relatório de Células', module: 'celulas', landscape: true,
        summary: [{ label: 'Células', value: rows.length }, { label: 'Membros', value: rows.reduce((s, r) => s + r.membros, 0) }, { label: 'Reuniões', value: rows.reduce((s, r) => s + r.reunioes, 0) }, { label: 'Visitantes', value: rows.reduce((s, r) => s + r.visitantes, 0) }],
        columns: [
          { label: 'Célula', key: 'nome', width: 1.8 }, { label: 'Líder', key: 'lider', width: 1.7 }, { label: 'Membros', key: 'membros' },
          { label: 'Reuniões', key: 'reunioes' }, { label: 'Média presença', key: 'media_presenca' }, { label: 'Visitantes', key: 'visitantes' },
          { label: 'Relatórios', key: 'relatorios' }, { label: 'Última reunião', key: 'ultima' }, { label: 'Status', key: 'status' },
        ], rows,
      };
    }
    case 'frequencia': {
      guard('celulas');
      const rows = q(`SELECT m.meeting_date, c.name AS celula, m.present_count, m.absent_count, m.visitors_count, m.report_sent
                      FROM cell_meetings m JOIN cells c ON c.id = m.cell_id
                      WHERE m.church_id = ? AND m.deleted_at IS NULL AND m.meeting_date BETWEEN ? AND ? ORDER BY m.meeting_date DESC`, [from, to]);
      const tot = rows.reduce((s, r) => s + n(r.present_count) + n(r.absent_count), 0);
      return {
        title: 'Relatório de Frequência (Células)', module: 'celulas', subtitle: `${dt(from)} a ${dt(to)}`,
        summary: [{ label: 'Reuniões', value: rows.length }, { label: 'Presenças', value: rows.reduce((s, r) => s + n(r.present_count), 0) }, { label: 'Frequência média', value: pct(rows.reduce((s, r) => s + n(r.present_count), 0), tot) + '%' }, { label: 'Visitantes', value: rows.reduce((s, r) => s + n(r.visitors_count), 0) }],
        columns: [{ label: 'Data', value: (r) => dt(r.meeting_date) }, { label: 'Célula', key: 'celula', width: 1.8 }, { label: 'Presentes', key: 'present_count' }, { label: 'Ausentes', key: 'absent_count' }, { label: 'Visitantes', key: 'visitors_count' }, { label: 'Relatório enviado', value: (r) => (r.report_sent ? 'Sim' : 'Não') }],
        rows,
      };
    }
    case 'financeiro': {
      guard('financeiro');
      const rows = q(`SELECT t.tx_date, t.tx_type, t.description, c.name AS categoria, t.value, t.payment_method,
                      (SELECT name FROM bank_accounts b WHERE b.id = t.account_id) AS conta,
                      (SELECT name FROM cost_centers cc WHERE cc.id = t.cost_center_id) AS centro_custo,
                      (SELECT name FROM funds f WHERE f.id = t.fund_id) AS fundo
                      FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
                      WHERE t.church_id = ? AND t.deleted_at IS NULL AND t.status != 'cancelado' AND t.tx_date BETWEEN ? AND ?
                      ORDER BY t.tx_date DESC`, [from, to]);
      const s = periodSummary(churchId, from, to);
      return {
        title: 'Relatório Financeiro — Receitas e Despesas', module: 'financeiro', subtitle: `${dt(from)} a ${dt(to)}`,
        summary: [{ label: 'Entradas', value: money(s.entradas) }, { label: 'Saídas', value: money(s.saidas) }, { label: 'Resultado', value: money(s.resultado) }, { label: 'Lançamentos', value: rows.length }],
        columns: [
          { label: 'Data', value: (r) => dt(r.tx_date) }, { label: 'Tipo', key: 'tx_type' }, { label: 'Descrição', key: 'description', width: 1.7 },
          { label: 'Categoria', key: 'categoria', width: 1.3 }, { label: 'Valor', value: (r) => money(r.value) },
          { label: 'Forma', key: 'payment_method' }, { label: 'Conta', key: 'conta', width: 1.3 }, { label: 'Centro de custo', key: 'centro_custo', width: 1.3 },
        ], rows,
      };
    }
    case 'dizimos': {
      guard('financeiro');
      const rows = q(`SELECT t.tx_date, COALESCE(p.full_name, 'Não identificado') AS pessoa, t.value, t.payment_method,
                      (SELECT name FROM funds f WHERE f.id = t.fund_id) AS fundo
                      FROM transactions t LEFT JOIN people p ON p.id = t.person_id LEFT JOIN categories c ON c.id = t.category_id
                      WHERE t.church_id = ? AND t.deleted_at IS NULL AND t.status != 'cancelado' AND c.name = 'Dízimos' AND t.tx_date BETWEEN ? AND ?
                      ORDER BY t.tx_date DESC`, [from, to]);
      const total = rows.reduce((s, r) => s + n(r.value), 0);
      return {
        title: 'Relatório de Dízimos', module: 'financeiro', subtitle: `${dt(from)} a ${dt(to)} — documento de uso administrativo interno`,
        summary: [{ label: 'Total arrecadado', value: money(total) }, { label: 'Lançamentos', value: rows.length }, { label: 'Ticket médio', value: money(rows.length ? total / rows.length : 0) }],
        columns: [{ label: 'Data', value: (r) => dt(r.tx_date) }, { label: 'Contribuinte', key: 'pessoa', width: 2 }, { label: 'Valor', value: (r) => money(r.value) }, { label: 'Forma', key: 'payment_method' }, { label: 'Fundo', key: 'fundo' }],
        rows,
      };
    }
    case 'contas': {
      guard('contas');
      const pay = q(`SELECT description, due_date, value, status, (SELECT name FROM suppliers s WHERE s.id = supplier_id) AS fornecedor FROM payables WHERE church_id = ? AND deleted_at IS NULL AND due_date BETWEEN ? AND ? ORDER BY due_date`, [from, to]);
      const rec = q(`SELECT description, due_date, value, status, origin FROM receivables WHERE church_id = ? AND deleted_at IS NULL AND due_date BETWEEN ? AND ? ORDER BY due_date`, [from, to]);
      const rows = [
        ...pay.map((r) => ({ tipo: 'A pagar', descricao: r.description, parte: r.fornecedor || '—', vencimento: r.due_date, valor: n(r.value), status: r.status })),
        ...rec.map((r) => ({ tipo: 'A receber', descricao: r.description, parte: r.origin || '—', vencimento: r.due_date, valor: n(r.value), status: r.status })),
      ];
      return {
        title: 'Relatório de Contas a Pagar e Receber', module: 'contas', subtitle: `${dt(from)} a ${dt(to)}`,
        summary: [
          { label: 'A pagar', value: money(pay.reduce((s, r) => s + n(r.value), 0)) },
          { label: 'A receber', value: money(rec.reduce((s, r) => s + n(r.value), 0)) },
          { label: 'Vencidas', value: pay.filter((r) => r.status === 'vencida').length },
        ],
        columns: [{ label: 'Tipo', key: 'tipo' }, { label: 'Descrição', key: 'descricao', width: 2 }, { label: 'Fornecedor/Origem', key: 'parte', width: 1.7 }, { label: 'Vencimento', value: (r) => dt(r.vencimento) }, { label: 'Valor', value: (r) => money(r.valor) }, { label: 'Status', key: 'status' }],
        rows,
      };
    }
    case 'fluxo': {
      guard('financeiro');
      const horizon = Number(query.days) || 30;
      const cf = cashFlow(churchId, horizon);
      return {
        title: `Relatório de Fluxo de Caixa (${horizon} dias)`, module: 'financeiro',
        summary: [{ label: 'Saldo atual', value: money(cf.saldo_atual) }, { label: 'A receber', value: money(cf.a_receber) }, { label: 'A pagar', value: money(cf.a_pagar) }, { label: 'Projetado', value: money(cf.saldo_projetado) }],
        columns: [{ label: 'Data', value: (r) => dt(r.date) }, { label: 'A receber', value: (r) => money(r.receber) }, { label: 'A pagar', value: (r) => money(r.pagar) }, { label: 'Saldo projetado', value: (r) => money(r.saldo_projetado) }],
        rows: cf.projection,
      };
    }
    case 'orcamento': {
      guard('financeiro');
      const year = Number(query.year) || new Date().getUTCFullYear();
      const rows = q(`SELECT c.name AS categoria, SUM(b.planned_value) AS orcado,
                      (SELECT COALESCE(SUM(t.value),0) FROM transactions t WHERE t.church_id = b.church_id AND t.category_id = b.category_id AND t.tx_type='saida' AND t.deleted_at IS NULL AND t.status!='cancelado' AND strftime('%Y', t.tx_date) = ?) AS realizado
                      FROM budgets b LEFT JOIN categories c ON c.id = b.category_id
                      WHERE b.church_id = ? AND b.deleted_at IS NULL AND b.year = ? GROUP BY c.name ORDER BY orcado DESC`, [String(year), year]);
      const enriched = rows.map((r) => ({ ...r, variacao: n(r.orcado) - n(r.realizado), percentual: r.orcado ? pct(n(r.realizado), n(r.orcado)) : 0, estourou: n(r.realizado) > n(r.orcado) }));
      return {
        title: `Orçamento x Realizado — ${year}`, module: 'financeiro',
        summary: [{ label: 'Orçado', value: money(rows.reduce((s, r) => s + n(r.orcado), 0)) }, { label: 'Realizado', value: money(rows.reduce((s, r) => s + n(r.realizado), 0)) }, { label: 'Categorias estouradas', value: enriched.filter((r) => r.estourou).length }],
        columns: [{ label: 'Categoria', key: 'categoria', width: 2 }, { label: 'Orçado', value: (r) => money(r.orcado) }, { label: 'Realizado', value: (r) => money(r.realizado) }, { label: 'Variação', value: (r) => money(r.variacao) }, { label: '% executado', value: (r) => r.percentual + '%' }],
        rows: enriched,
      };
    }
    case 'centros_custo': {
      guard('financeiro');
      const rows = q(`SELECT cc.name AS centro, CAST(COALESCE(SUM(CASE WHEN t.tx_type='saida' THEN t.value END),0) AS REAL) AS despesas,
                      CAST(COALESCE(SUM(CASE WHEN t.tx_type='entrada' THEN t.value END),0) AS REAL) AS receitas
                      FROM cost_centers cc LEFT JOIN transactions t ON t.cost_center_id = cc.id AND t.deleted_at IS NULL AND t.status!='cancelado' AND t.tx_date BETWEEN ? AND ?
                      WHERE cc.church_id = ? AND cc.deleted_at IS NULL GROUP BY cc.name ORDER BY despesas DESC`, [from, to]);
      return {
        title: 'Despesas por Centro de Custo', module: 'financeiro', subtitle: `${dt(from)} a ${dt(to)}`,
        summary: [{ label: 'Centros', value: rows.length }, { label: 'Despesas', value: money(rows.reduce((s, r) => s + n(r.despesas), 0)) }],
        columns: [{ label: 'Centro de custo', key: 'centro', width: 2.2 }, { label: 'Despesas', value: (r) => money(r.despesas) }, { label: 'Receitas vinculadas', value: (r) => money(r.receitas) }, { label: 'Resultado', value: (r) => money(n(r.receitas) - n(r.despesas)) }],
        rows,
      };
    }
    case 'fundos': {
      guard('financeiro');
      const rows = q(`SELECT f.name AS fundo, CAST(f.goal AS REAL) AS meta,
                      CAST(COALESCE(SUM(CASE WHEN t.tx_type='entrada' THEN t.value END),0) AS REAL) AS entradas,
                      CAST(COALESCE(SUM(CASE WHEN t.tx_type='saida' THEN t.value END),0) AS REAL) AS saidas
                      FROM funds f LEFT JOIN transactions t ON t.fund_id = f.id AND t.deleted_at IS NULL AND t.status!='cancelado'
                      WHERE f.church_id = ? AND f.deleted_at IS NULL GROUP BY f.name ORDER BY entradas DESC`);
      return {
        title: 'Relatório de Fundos', module: 'financeiro',
        summary: [{ label: 'Fundos', value: rows.length }, { label: 'Entradas', value: money(rows.reduce((s, r) => s + n(r.entradas), 0)) }, { label: 'Saídas', value: money(rows.reduce((s, r) => s + n(r.saidas), 0)) }],
        columns: [{ label: 'Fundo', key: 'fundo', width: 2 }, { label: 'Entradas', value: (r) => money(r.entradas) }, { label: 'Saídas', value: (r) => money(r.saidas) }, { label: 'Saldo', value: (r) => money(n(r.entradas) - n(r.saidas)) }, { label: 'Meta', value: (r) => (n(r.meta) ? money(r.meta) : '—') }],
        rows,
      };
    }
    case 'prestacao': {
      guard('financeiro');
      const s = periodSummary(churchId, from, to);
      const bal = accountBalances(churchId);
      const startBalance = bal.accounts.reduce((sum, a) => {
        const before = one(`SELECT COALESCE(SUM(CASE WHEN tx_type='entrada' THEN value WHEN tx_type='saida' THEN -value ELSE 0 END),0) v FROM transactions WHERE church_id=? AND account_id=? AND deleted_at IS NULL AND status!='cancelado' AND tx_date < ?`, [churchId, a.id, from]);
        return sum + n(a.initial_balance) + n(before.v);
      }, 0);
      const rows = [
        ...s.entradas_detalhe.map((r) => ({ grupo: 'ENTRADAS', categoria: r.categoria || 'Sem categoria', qtd: r.qtd, valor: n(r.total) })),
        ...s.saidas_detalhe.map((r) => ({ grupo: 'SAÍDAS', categoria: r.categoria || 'Sem categoria', qtd: r.qtd, valor: n(r.total) })),
      ];
      const funds = q(`SELECT f.name AS fundo, COALESCE(SUM(CASE WHEN t.tx_type='entrada' THEN t.value WHEN t.tx_type='saida' THEN -t.value ELSE 0 END),0) AS saldo FROM funds f LEFT JOIN transactions t ON t.fund_id=f.id AND t.deleted_at IS NULL AND t.status!='cancelado' AND t.tx_date BETWEEN ? AND ? WHERE f.church_id = ? AND f.deleted_at IS NULL GROUP BY f.name`, [from, to]);
      const centers = q(`SELECT cc.name AS centro, COALESCE(SUM(CASE WHEN t.tx_type='saida' THEN t.value ELSE 0 END),0) AS despesas FROM cost_centers cc LEFT JOIN transactions t ON t.cost_center_id=cc.id AND t.deleted_at IS NULL AND t.status!='cancelado' AND t.tx_date BETWEEN ? AND ? WHERE cc.church_id = ? AND cc.deleted_at IS NULL GROUP BY cc.name ORDER BY despesas DESC`, [from, to]);
      return {
        title: 'Prestação de Contas', module: 'financeiro', subtitle: `${dt(from)} a ${dt(to)}`,
        summary: [
          { label: 'Saldo inicial', value: money(startBalance) },
          { label: 'Entradas', value: money(s.entradas) },
          { label: 'Saídas', value: money(s.saidas) },
          { label: 'Saldo final', value: money(startBalance + s.entradas - s.saidas) },
        ],
        extra: {
          dizimos: s.dizimos, ofertas: s.ofertas, resultado: s.resultado,
          contas: bal.accounts.map((a) => ({ nome: a.name, saldo: a.saldo })),
          fundos: funds.map((f) => ({ nome: f.fundo, saldo: n(f.saldo) })),
          centros: centers.map((c) => ({ nome: c.centro, despesas: n(c.despesas) })),
        },
        columns: [{ label: 'Grupo', key: 'grupo' }, { label: 'Categoria', key: 'categoria', width: 2 }, { label: 'Qtde', key: 'qtd' }, { label: 'Valor', value: (r) => money(r.valor) }],
        rows,
      };
    }
    case 'ministérios': case 'ministerios': {
      guard('ministerios');
      const rows = q(`SELECT mi.name AS ministerio, mi.type AS tipo, (SELECT full_name FROM people p WHERE p.id = mi.leader_id) AS lider,
                      (SELECT COUNT(*) FROM ministry_members mm WHERE mm.ministry_id = mi.id AND mm.deleted_at IS NULL) AS integrantes,
                      (SELECT COUNT(*) FROM volunteers v WHERE v.ministry_id = mi.id AND v.deleted_at IS NULL) AS voluntarios,
                      mi.status
                      FROM ministries mi WHERE mi.church_id = ? AND mi.deleted_at IS NULL ORDER BY mi.name`);
      return {
        title: 'Relatório de Ministérios', module: 'ministerios',
        summary: [{ label: 'Ministérios', value: rows.length }, { label: 'Integrantes', value: rows.reduce((s, r) => s + n(r.integrantes), 0) }, { label: 'Voluntários', value: rows.reduce((s, r) => s + n(r.voluntarios), 0) }],
        columns: [{ label: 'Ministério', key: 'ministerio', width: 2.2 }, { label: 'Tipo', key: 'tipo' }, { label: 'Líder', key: 'lider', width: 1.8 }, { label: 'Integrantes', key: 'integrantes' }, { label: 'Voluntários', key: 'voluntarios' }, { label: 'Status', key: 'status' }],
        rows,
      };
    }
    case 'patrimonio': {
      guard('patrimonio');
      const rows = q(`SELECT a.code, a.name, a.category, a.location, a.value, a.condition_state, a.acquisition_date, a.status,
                      (SELECT full_name FROM people p WHERE p.id = a.responsible_id) AS responsavel
                      FROM assets a WHERE a.church_id = ? AND a.deleted_at IS NULL ORDER BY a.category, a.name`);
      return {
        title: 'Relatório de Patrimônio', module: 'patrimonio',
        summary: [{ label: 'Itens', value: rows.length }, { label: 'Valor total', value: money(rows.reduce((s, r) => s + n(r.value), 0)) }, { label: 'Em estado regular', value: rows.filter((r) => r.condition_state === 'regular').length }],
        columns: [{ label: 'Código', key: 'code' }, { label: 'Descrição', key: 'name', width: 2.2 }, { label: 'Categoria', key: 'category', width: 1.3 }, { label: 'Localização', key: 'location', width: 1.3 }, { label: 'Valor', value: (r) => money(r.value) }, { label: 'Estado', key: 'condition_state' }, { label: 'Aquisição', value: (r) => dt(r.acquisition_date) }],
        rows,
      };
    }
    case 'manutencao': {
      guard('manutencao');
      const rows = q(`SELECT m.request_date, a.name AS patrimonio, m.problem, m.priority, m.cost, m.status,
                      (SELECT name FROM suppliers s WHERE s.id = m.supplier_id) AS fornecedor
                      FROM maintenance m LEFT JOIN assets a ON a.id = m.asset_id
                      WHERE m.church_id = ? AND m.deleted_at IS NULL AND m.request_date BETWEEN ? AND ? ORDER BY m.request_date DESC`, [from, to]);
      return {
        title: 'Relatório de Manutenção', module: 'manutencao', subtitle: `${dt(from)} a ${dt(to)}`,
        summary: [{ label: 'Solicitações', value: rows.length }, { label: 'Custo total', value: money(rows.reduce((s, r) => s + n(r.cost), 0)) }, { label: 'Abertas', value: rows.filter((r) => !['concluido', 'cancelado'].includes(r.status)).length }],
        columns: [{ label: 'Data', value: (r) => dt(r.request_date) }, { label: 'Patrimônio', key: 'patrimonio', width: 1.8 }, { label: 'Problema', key: 'problem', width: 2 }, { label: 'Prioridade', key: 'priority' }, { label: 'Custo', value: (r) => money(r.cost) }, { label: 'Status', key: 'status' }],
        rows,
      };
    }
    case 'eventos': {
      guard('eventos');
      const rows = q(`SELECT e.name, e.event_date, e.location, e.capacity, e.status,
                      (SELECT COUNT(*) FROM event_registrations r WHERE r.event_id = e.id AND r.deleted_at IS NULL) AS inscritos,
                      (SELECT COUNT(*) FROM schedules s WHERE s.event_id = e.id AND s.deleted_at IS NULL) AS escalados
                      FROM events e WHERE e.church_id = ? AND e.deleted_at IS NULL AND e.event_date BETWEEN ? AND ? ORDER BY e.event_date`, [from, to]);
      return {
        title: 'Relatório de Eventos', module: 'eventos', subtitle: `${dt(from)} a ${dt(to)}`,
        summary: [{ label: 'Eventos', value: rows.length }, { label: 'Inscrições', value: rows.reduce((s, r) => s + n(r.inscritos), 0) }, { label: 'Escalados', value: rows.reduce((s, r) => s + n(r.escalados), 0) }],
        columns: [{ label: 'Evento', key: 'name', width: 2 }, { label: 'Data', value: (r) => dt(r.event_date) }, { label: 'Local', key: 'location' }, { label: 'Capacidade', key: 'capacity' }, { label: 'Inscritos', key: 'inscritos' }, { label: 'Escalados', key: 'escalados' }, { label: 'Status', key: 'status' }],
        rows,
      };
    }
    case 'pastoral': {
      guard('pastoral');
      const rows = q(`SELECT pc.care_date, p.full_name AS pessoa, pc.care_type, pc.status, pc.next_action, pc.next_action_date,
                      (SELECT full_name FROM people r WHERE r.id = pc.responsible_id) AS responsavel
                      FROM pastoral_care pc LEFT JOIN people p ON p.id = pc.person_id
                      WHERE pc.church_id = ? AND pc.deleted_at IS NULL AND pc.care_date BETWEEN ? AND ? ORDER BY pc.care_date DESC`, [from, to]);
      return {
        title: 'Relatório Pastoral (agregado)', module: 'pastoral', subtitle: `${dt(from)} a ${dt(to)} — conteúdo confidencial`,
        summary: [{ label: 'Atendimentos', value: rows.length }, { label: 'Em andamento', value: rows.filter((r) => r.status === 'em_andamento').length }, { label: 'Concluídos', value: rows.filter((r) => r.status === 'concluido').length }],
        columns: [{ label: 'Data', value: (r) => dt(r.care_date) }, { label: 'Pessoa', key: 'pessoa', width: 1.8 }, { label: 'Tipo', key: 'care_type' }, { label: 'Responsável', key: 'responsavel', width: 1.6 }, { label: 'Próxima ação', key: 'next_action', width: 1.8 }, { label: 'Status', key: 'status' }],
        rows,
      };
    }
    case 'pessoas': {
      guard('pessoas');
      const rows = q(`SELECT full_name, status, phone, email, district, city, birth_date, join_date FROM people WHERE church_id = ? AND deleted_at IS NULL ORDER BY full_name`);
      return {
        title: 'Relatório de Pessoas (visão geral)', module: 'pessoas',
        summary: [{ label: 'Registros', value: rows.length }],
        columns: [{ label: 'Nome', key: 'full_name', width: 2.4 }, { label: 'Situação', key: 'status' }, { label: 'Telefone', key: 'phone' }, { label: 'E-mail', key: 'email', width: 1.6 }, { label: 'Bairro', key: 'district' }, { label: 'Cidade', key: 'city' }],
        rows,
      };
    }
    default:
      throw Object.assign(new Error('Relatório não reconhecido.'), { status: 404 });
  }
}

/* ============================================================ assistente IA */
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const money0 = (v) => money(v);

export function aiAnswer(churchId, user, question) {
  const q = norm(question);
  const today = isoDate();
  const monthStart = today.slice(0, 8) + '01';
  const inside = (words) => words.some((w) => q.includes(w));
  const suggestions = [
    'Como está a situação financeira deste mês?',
    'Quais contas estão vencidas?',
    'Quais células não enviaram relatório?',
    'Quantos membros ativos temos?',
    'Quantos visitantes recebemos este mês?',
    'Quais eventos teremos esta semana?',
    'Compare os dois últimos meses.',
  ];

  const deny = () => ({
    answer: 'Você não possui permissão para consultar essa informação. Solicite acesso ao administrador do sistema.',
    data: null, scope: 'permission_denied', suggestions: [],
  });
  const unknown = () => ({
    answer: 'Não existem informações suficientes registradas no sistema para responder a esta pergunta.',
    data: null, scope: 'unknown', suggestions,
  });

  /* ----------------------------------------------------------- comparativo */
  const MONTH_KEYS = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  if (inside(['compare', 'comparar', 'comparacao', 'comparativo', 'diferenca', 'evolucao', 'versus', ' vs '])) {
    if (!can(user, 'financeiro', 'view') && !can(user, 'contas', 'view')) return deny();
    const cited = MONTH_KEYS.map((m, i) => [m, i + 1]).filter(([m]) => q.includes(m)).map(([, i]) => i);
    const nowD = new Date();
    const prevM = new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth() - 1, 1)).getUTCMonth();
    const pair = cited.length >= 2 ? [cited[0], cited[1]] : [prevM, nowD.getUTCMonth()];
    const year = nowD.getUTCFullYear();
    const serie = pair.map((m) => {
      const key = `${year}-${String(m + 1).padStart(2, '0')}`;
      const s = periodSummary(churchId, `${key}-01`, `${key}-31`);
      return { month: key, label: `${MONTHS_PT[m].slice(0, 3)}/${String(year).slice(2)}`, entradas: s.entradas, saidas: s.saidas, resultado: s.resultado, dizimos: s.dizimos, ofertas: s.ofertas };
    });
    const [a, b] = serie;
    return {
      answer: `Comparativo — ${a.label}: entradas ${money0(a.entradas)}, saídas ${money0(a.saidas)} e resultado ${money0(a.resultado)}. ${b.label}: entradas ${money0(b.entradas)}, saídas ${money0(b.saidas)} e resultado ${money0(b.resultado)}. Variação do resultado entre os períodos: ${money0(b.resultado - a.resultado)}.`,
      data: { serie }, scope: 'financeiro', suggestions,
    };
  }

  /* ------------------------------------------------------------ financeiro */
  if (inside(['financeir', 'dinheiro', 'saldo', 'caixa', 'entrou', 'arrecad', 'resultado', 'gastamos', 'despesa', 'receita', 'dizimo', 'oferta', 'contas', 'contas a pagar', 'a pagar', 'a receber', 'orcamento', 'fundo'])) {
    if (!can(user, 'financeiro', 'view') && !can(user, 'contas', 'view')) return deny();

    if (inside(['vencid', 'atrasad', 'em atraso'])) {
      const rows = all(`SELECT description, value, due_date FROM payables WHERE church_id = ? AND deleted_at IS NULL AND status IN ('pendente','aprovada','agendada','vencida') AND due_date < ? ORDER BY due_date`, [churchId, today]);
      if (!rows.length) return { answer: 'Não há contas vencidas registradas no sistema hoje.', data: { total: 0 }, scope: 'financeiro', suggestions };
      return {
        answer: `Existem ${rows.length} conta(s) vencida(s), totalizando ${money0(rows.reduce((s, r) => s + n(r.value), 0))}. A mais antiga venceu em ${rows[0].due_date}.`,
        data: { rows, total: rows.reduce((s, r) => s + n(r.value), 0) }, scope: 'financeiro', suggestions,
      };
    }
    if (inside(['dizimo'])) {
      const prevKey = (() => { const d = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; })();
      const cur = n(scalar(`SELECT COALESCE(SUM(t.value),0) FROM transactions t JOIN categories c ON c.id=t.category_id WHERE t.church_id=? AND t.deleted_at IS NULL AND t.status!='cancelado' AND c.name='Dízimos' AND t.tx_date BETWEEN ? AND ?`, [churchId, monthStart, today]));
      const prev = n(scalar(`SELECT COALESCE(SUM(t.value),0) FROM transactions t JOIN categories c ON c.id=t.category_id WHERE t.church_id=? AND t.deleted_at IS NULL AND t.status!='cancelado' AND c.name='Dízimos' AND t.tx_date LIKE ?`, [churchId, prevKey + '%']));
      if (!cur && !prev) return unknown();
      return {
        answer: `No mês atual entraram ${money0(cur)} em dízimos. No mês anterior o total foi ${money0(prev)}.`,
        data: { atual: cur, anterior: prev },
        scope: 'financeiro', suggestions,
      };
    }
    if (inside(['compare', 'comparar', 'vs', 'diferenca', 'evolucao'])) {
      const series = monthlySeries(churchId, 2);
      const [a, b] = series;
      if (!a || !b) return unknown();
      const diff = b.resultado - a.resultado;
      return {
        answer: `${a.label}: entradas ${money0(a.entradas)} e saídas ${money0(a.saidas)} (resultado ${money0(a.resultado)}). ${b.label}: entradas ${money0(b.entradas)} e saídas ${money0(b.saidas)} (resultado ${money0(b.resultado)}). A variação do resultado foi ${money0(diff)}.`,
        data: { serie: series }, scope: 'financeiro', suggestions,
      };
    }
    if (inside(['projet', 'fluxo'])) {
      const cf = cashFlow(churchId, 30);
      return {
        answer: `Saldo atual ${money0(cf.saldo_atual)}. Considerando ${money0(cf.a_receber)} a receber e ${money0(cf.a_pagar)} a pagar nos próximos 30 dias, o saldo projetado é ${money0(cf.saldo_projetado)}${cf.negative ? '. ATENÇÃO: o fluxo projetado está negativo.' : '.'}`,
        data: cf, scope: 'financeiro', suggestions,
      };
    }
    if (inside(['manutencao', 'patrimonio', 'conserto'])) {
      const cost = n(scalar(`SELECT COALESCE(SUM(cost),0) FROM maintenance WHERE church_id = ? AND deleted_at IS NULL AND request_date BETWEEN ? AND ?`, [churchId, monthStart, today]));
      const open = n(scalar(`SELECT COUNT(*) FROM maintenance WHERE church_id = ? AND deleted_at IS NULL AND status NOT IN ('concluido','cancelado')`, [churchId]));
      if (!cost && !open) return unknown();
      return { answer: `Foram registrados ${money0(cost)} em manutenções neste mês e existem ${open} solicitação(ões) em aberto.`, data: { custo_mes: cost, abertas: open }, scope: 'financeiro', suggestions };
    }
    if (inside(['orcamento', 'orçado', 'planejado'])) {
      const year = new Date().getUTCFullYear();
      const planned = n(scalar(`SELECT COALESCE(SUM(planned_value),0) FROM budgets WHERE church_id = ? AND deleted_at IS NULL AND year = ?`, [churchId, year]));
      const realized = n(scalar(`SELECT COALESCE(SUM(value),0) FROM transactions WHERE church_id = ? AND deleted_at IS NULL AND status!='cancelado' AND tx_type='saida' AND strftime('%Y', tx_date) = ?`, [churchId, String(year)]));
      if (!planned) return { answer: 'Não existem informações suficientes registradas no sistema: nenhum orçamento foi cadastrado para o ano corrente.', data: null, scope: 'financeiro', suggestions };
      return { answer: `Para ${year} o orçamento de despesas é ${money0(planned)} e o realizado é ${money0(realized)} (${pct(realized, planned)}% executado).`, data: { planejado: planned, realizado: realized }, scope: 'financeiro', suggestions };
    }
    // padrao: situação geral
    const s = periodSummary(churchId, monthStart, today);
    const bal = accountBalances(churchId);
    const cf = cashFlow(churchId, 30);
    return {
      answer: `Situação deste mês: entradas ${money0(s.entradas)} (dízimos ${money0(s.dizimos)} e ofertas ${money0(s.ofertas)}), saídas ${money0(s.saidas)} e resultado ${money0(s.resultado)}. Saldo atual das contas: ${money0(bal.total)}. Saldo projetado em 30 dias: ${money0(cf.saldo_projetado)}${cf.negative ? ' — ATENÇÃO: projeção negativa.' : ''}.`,
      data: { mes: s, contas: bal.accounts, fluxo: { a_receber: cf.a_receber, a_pagar: cf.a_pagar, saldo_projetado: cf.saldo_projetado, negative: cf.negative } },
      scope: 'financeiro', suggestions,
    };
  }

  /* ---------------------------------------------------------------- celulas */
  if (inside(['celula', 'pequeno grupo'])) {
    if (!can(user, 'celulas', 'view')) return deny();
    const panel = cellsPanel(churchId, user);
    if (inside(['relatorio', 'relatório', 'sem relatorio', 'pendente', 'nao enviou', 'não enviou'])) {
      const missing = panel.filter((c) => c.sem_relatorio);
      if (!missing.length) return { answer: 'Todas as células possuem relatório registrado nos últimos 7 dias.', data: { total: 0 }, scope: 'celulas', suggestions };
      return { answer: `${missing.length} célula(s) estão sem relatório recente: ${missing.map((c) => c.name).join(', ')}.`, data: { rows: missing.map((c) => ({ id: c.id, nome: c.name, ultima: c.ultima_reuniao })) }, scope: 'celulas', suggestions };
    }
    const total = panel.length;
    const membros = panel.reduce((s, c) => s + c.membros, 0);
    const media = panel.length ? Math.round((panel.reduce((s, c) => s + c.media_presenca, 0) / panel.length) * 10) / 10 : 0;
    if (!total) return unknown();
    return { answer: `Existem ${total} célula(s) cadastradas, com ${membros} integrantes e média de ${media} presentes por reunião.`, data: { total, membros, media, rows: panel.map((c) => ({ id: c.id, nome: c.name, lider: c.lider, membros: c.membros, media_presenca: c.media_presenca, sem_relatorio: c.sem_relatorio })) }, scope: 'celulas', suggestions };
  }

  /* ---------------------------------------------------------------- pessoas */
  if (inside(['membro', 'pessoa', 'ativos', 'inativos', 'crianca', 'jovem', 'idoso', 'adolescente', 'lider', 'família', 'familia'])) {
    if (!can(user, 'pessoas', 'view')) return deny();
    const rows = all('SELECT birth_date, status, leader_flag FROM people WHERE church_id = ? AND deleted_at IS NULL', [churchId]);
    if (!rows.length) return unknown();
    const total = rows.length;
    const ativos = rows.filter((r) => r.status === 'ativo').length;
    const visit = rows.filter((r) => r.status === 'visitante').length;
    const familias = n(scalar('SELECT COUNT(*) FROM families WHERE church_id = ? AND deleted_at IS NULL', [churchId]));
    const faixa = { criancas: 0, adolescentes: 0, jovens: 0, adultos: 0, idosos: 0 };
    rows.forEach((r) => { const k = ageBucket(ageOf(r.birth_date)); if (faixa[k] !== undefined) faixa[k]++; });
    return {
      answer: `A igreja possui ${total} pessoas cadastradas: ${ativos} ativas, ${visit} visitantes e ${rows.filter((r) => r.leader_flag).length} líderes, distribuídas em ${familias} famílias. Faixas: ${faixa.criancas} crianças, ${faixa.adolescentes} adolescentes, ${faixa.jovens} jovens, ${faixa.adultos} adultos e ${faixa.idosos} idosos.`,
      data: { total, ativos, visitantes: visit, familias, faixa }, scope: 'pessoas', suggestions,
    };
  }

  if (inside(['visitante', 'novas visitas', 'acolhimento'])) {
    if (!can(user, 'visitantes', 'view')) return deny();
    const total = n(scalar('SELECT COUNT(*) FROM visitors WHERE church_id = ? AND deleted_at IS NULL', [churchId]));
    if (!total) return unknown();
    const mes = n(scalar('SELECT COUNT(*) FROM visitors WHERE church_id = ? AND deleted_at IS NULL AND first_visit_date LIKE ?', [churchId, monthKey(today) + '%']));
    const integrados = n(scalar("SELECT COUNT(*) FROM visitors WHERE church_id = ? AND deleted_at IS NULL AND status = 'integrado'", [churchId]));
    const aguardando = n(scalar("SELECT COUNT(*) FROM visitors WHERE church_id = ? AND deleted_at IS NULL AND status = 'aguardando_contato'", [churchId]));
    return { answer: `Temos ${total} visitantes registrados, sendo ${mes} neste mês. ${integrados} já foram integrados e ${aguardando} aguardam primeiro contato.`, data: { total, mes, integrados, aguardando }, scope: 'visitantes', suggestions };
  }

  /* ---------------------------------------------------------------- eventos */
  if (inside(['evento', 'agenda', 'calendario', 'programacao', 'proximos dias'])) {
    if (!can(user, 'eventos', 'view') && !can(user, 'agenda', 'view')) return deny();
    const rows = all(`SELECT name, event_date, start_time, location, status FROM events WHERE church_id = ? AND deleted_at IS NULL AND event_date BETWEEN ? AND ? ORDER BY event_date`, [churchId, today, addDays(today, 7)]);
    if (!rows.length) return { answer: 'Não há eventos cadastrados para os próximos 7 dias.', data: { rows: [] }, scope: 'eventos', suggestions };
    return { answer: `Nos próximos 7 dias temos ${rows.length} evento(s): ${rows.map((r) => `${r.name} (${r.event_date}${r.start_time ? ' ' + r.start_time : ''})`).join('; ')}.`, data: { rows }, scope: 'eventos', suggestions };
  }

  /* --------------------------------------------------------------- escalas */
  if (inside(['escala', 'voluntario escalado', 'escalado'])) {
    if (!can(user, 'escalas', 'view')) return deny();
    const pend = all(`SELECT s.schedule_date, s.function_name, p.full_name FROM schedules s JOIN people p ON p.id = s.person_id WHERE s.church_id = ? AND s.deleted_at IS NULL AND s.status = 'pendente' AND s.schedule_date >= ? ORDER BY s.schedule_date LIMIT 12`, [churchId, today]);
    if (!pend.length) return { answer: 'Não há escalas pendentes de confirmação.', data: { rows: [] }, scope: 'escalas', suggestions };
    return { answer: `Existem ${pend.length} escala(s) aguardando confirmação, começando por ${pend[0].full_name} em ${pend[0].schedule_date} (${pend[0].function_name}).`, data: { rows: pend }, scope: 'escalas', suggestions };
  }

  /* ------------------------------------------------------------- pastoral */
  if (inside(['pastoral', 'acompanhamento', 'visita pastoral', 'aconselhamento', 'oracao', 'oração'])) {
    if (!can(user, 'pastoral', 'view')) return deny();
    const total = n(scalar('SELECT COUNT(*) FROM pastoral_care WHERE church_id = ? AND deleted_at IS NULL', [churchId]));
    if (!total) return unknown();
    const abertos = n(scalar("SELECT COUNT(*) FROM pastoral_care WHERE church_id = ? AND deleted_at IS NULL AND status != 'concluido'", [churchId]));
    const oracoes = n(scalar("SELECT COUNT(*) FROM prayer_requests WHERE church_id = ? AND deleted_at IS NULL AND status != 'atendido'", [churchId]));
    const acompanhados = n(scalar('SELECT COUNT(DISTINCT person_id) FROM pastoral_care WHERE church_id = ? AND deleted_at IS NULL', [churchId]));
    const membros = n(scalar("SELECT COUNT(*) FROM people WHERE church_id = ? AND deleted_at IS NULL AND status = 'ativo'", [churchId]));
    return { answer: `Há ${total} registros pastorais, com ${abertos} em andamento. ${acompanhados} pessoas possuem acompanhamento registrado e ${oracoes} pedidos de oração aguardam conclusão. Da base de ${membros} membros ativos, ${Math.max(0, membros - acompanhados)} ainda não possuem acompanhamento registrado.`, data: { total, abertos, oracoes, acompanhados, membros_sem_acompanhamento: Math.max(0, membros - acompanhados) }, scope: 'pastoral', suggestions };
  }

  /* ----------------------------------------------------------- patrimonio */
  if (inside(['patrimonio', 'patrimônio', 'inventario', 'equipamento', 'manutencao', 'manutenção'])) {
    if (!can(user, 'patrimonio', 'view') && !can(user, 'manutencao', 'view')) return deny();
    const total = n(scalar('SELECT COUNT(*) FROM assets WHERE church_id = ? AND deleted_at IS NULL', [churchId]));
    if (!total) return unknown();
    const valor = n(scalar('SELECT COALESCE(SUM(value),0) FROM assets WHERE church_id = ? AND deleted_at IS NULL', [churchId]));
    const open = n(scalar("SELECT COUNT(*) FROM maintenance WHERE church_id = ? AND deleted_at IS NULL AND status NOT IN ('concluido','cancelado')", [churchId]));
    return { answer: `O patrimônio possui ${total} itens, avaliados em ${money0(valor)}, com ${open} manutenção(ões) em aberto.`, data: { total, valor, manutencoes_abertas: open }, scope: 'patrimonio', suggestions };
  }

  /* ---------------------------------------------------------- indicadores */
  if (inside(['resumo', 'panorama', 'visao geral', 'como esta a igreja', 'indicador'])) {
    const d = dashboardData(churchId, user);
    const parts = [`${d.people.total} pessoas cadastradas (${d.people.ativos} ativas)`, `${d.ministries.celulas} células`, `${d.ministries.ministérios} ministérios`, `${d.alerts.length} alertas ativos`];
    if (d.finance) parts.push(`saldo ${money0(d.finance.saldo)}`, `resultado do mês ${money0(d.finance.resultado_mes)}`);
    return { answer: `Panorama atual: ${parts.join(', ')}.`, data: d, scope: 'geral', suggestions };
  }

  return unknown();
}

/* ================================================================= rotas */
export function registerDataRoutes(router) {
  const authed = (handler) => async (req, res, ctx) => (ctx.user ? handler(req, res, ctx) : json(res, 401, { error: 'Sessão expirada.' }));

  router.add('GET', '/api/dashboard', authed(async (req, res, ctx) => json(res, 200, dashboardData(ctx.user.church_id, ctx.user))));

  router.add('GET', '/api/dashboard/ministry', authed(async (req, res, ctx) => {
    if (!can(ctx.user, 'celulas', 'view') && !can(ctx.user, 'ministerios', 'view')) return json(res, 403, { error: 'Sem permissão.' });
    const churchId = ctx.user.church_id;
    const cells = cellsPanel(churchId, ctx.user);
    const attendance = all(`SELECT meeting_date, SUM(present_count) presentes, SUM(visitors_count) visitantes FROM cell_meetings WHERE church_id = ? AND deleted_at IS NULL AND meeting_date >= ? GROUP BY meeting_date ORDER BY meeting_date`, [churchId, addDays(isoDate(), -90)]);
    const ebd = all(`SELECT c.name AS classe, (SELECT COUNT(*) FROM ebd_students s WHERE s.class_id = c.id AND s.deleted_at IS NULL) AS alunos, (SELECT full_name FROM people p WHERE p.id = c.teacher_id) AS professor FROM ebd_classes c WHERE c.church_id = ? AND c.deleted_at IS NULL`, [churchId]);
    const ministries = all(`SELECT m.name, (SELECT COUNT(*) FROM ministry_members mm WHERE mm.ministry_id = m.id AND mm.deleted_at IS NULL) AS integrantes, (SELECT COUNT(*) FROM volunteers v WHERE v.ministry_id = m.id AND v.deleted_at IS NULL) AS voluntarios FROM ministries m WHERE m.church_id = ? AND m.deleted_at IS NULL ORDER BY m.name`, [churchId]);
    const visitors30 = n(scalar('SELECT COUNT(*) FROM visitors WHERE church_id = ? AND deleted_at IS NULL AND first_visit_date >= ?', [churchId, addDays(isoDate(), -30)]));
    return json(res, 200, { cells, attendance, ebd, ministries, visitors30 });
  }));

  router.add('GET', '/api/dashboard/finance', authed(async (req, res, ctx) => {
    if (!can(ctx.user, 'financeiro', 'view') && !can(ctx.user, 'contas', 'view')) return json(res, 403, { error: 'Sem permissão para o painel financeiro.' });
    const churchId = ctx.user.church_id;
    const months = Math.min(24, Number(req.query.months) || 6);
    const series = monthlySeries(churchId, months - 1);
    const byCategory = all(`SELECT c.name AS categoria, c.kind, SUM(t.value) total FROM transactions t JOIN categories c ON c.id=t.category_id WHERE t.church_id=? AND t.deleted_at IS NULL AND t.status!='cancelado' AND t.tx_date >= ? GROUP BY c.name, c.kind ORDER BY total DESC`, [churchId, addDays(isoDate(), -180)]);
    const byCenter = all(`SELECT cc.name AS centro, SUM(t.value) total FROM transactions t JOIN cost_centers cc ON cc.id=t.cost_center_id WHERE t.church_id=? AND t.deleted_at IS NULL AND t.status!='cancelado' AND t.tx_type='saida' AND t.tx_date >= ? GROUP BY cc.name ORDER BY total DESC`, [churchId, addDays(isoDate(), -180)]);
    const byAccount = accountBalances(churchId);
    const funds = all(`SELECT f.name AS fundo, COALESCE(SUM(CASE WHEN t.tx_type='entrada' THEN t.value WHEN t.tx_type='saida' THEN -t.value ELSE 0 END),0) AS saldo FROM funds f LEFT JOIN transactions t ON t.fund_id=f.id AND t.deleted_at IS NULL AND t.status!='cancelado' WHERE f.church_id=? AND f.deleted_at IS NULL GROUP BY f.name ORDER BY saldo DESC`, [churchId]);
    const year = new Date().getUTCFullYear();
    const budget = all(`SELECT c.name AS categoria, SUM(b.planned_value) AS orcado, (SELECT COALESCE(SUM(t.value),0) FROM transactions t WHERE t.church_id=b.church_id AND t.category_id=b.category_id AND t.tx_type='saida' AND t.deleted_at IS NULL AND t.status!='cancelado' AND strftime('%Y',t.tx_date)=?) AS realizado FROM budgets b LEFT JOIN categories c ON c.id=b.category_id WHERE b.church_id=? AND b.deleted_at IS NULL AND b.year=? GROUP BY c.name`, [String(year), churchId, year]);
    const cf = cashFlow(churchId, 30);
    return json(res, 200, { series, byCategory, byCenter, accounts: byAccount, funds, budget, cashflow: cf });
  }));

  router.add('GET', '/api/alerts', authed(async (req, res, ctx) => {
    const alerts = buildAlerts(ctx.user.church_id, ctx.user);
    return json(res, 200, { data: alerts, total: alerts.reduce((s, a) => s + (a.items?.length || 0), 0), groups: alerts.length });
  }));

  router.add('GET', '/api/cashflow', authed(async (req, res, ctx) => {
    if (!can(ctx.user, 'financeiro', 'view')) return json(res, 403, { error: 'Sem permissão para consultar o fluxo de caixa.' });
    return json(res, 200, cashFlow(ctx.user.church_id, Math.min(180, Number(req.query.days) || 30)));
  }));

  router.add('GET', '/api/cells/panel', authed(async (req, res, ctx) => {
    if (!can(ctx.user, 'celulas', 'view')) return json(res, 403, { error: 'Sem permissão para o painel de células.' });
    return json(res, 200, { data: cellsPanel(ctx.user.church_id, ctx.user) });
  }));

  router.add('GET', '/api/reports/:kind', authed(async (req, res, ctx) => {
    try {
      const report = reportData(ctx.user.church_id, ctx.user, req.params.kind, req.query);
      const format = req.query.format;
      if (format === 'json' || !format) return json(res, 200, report);
      if (format === 'csv') {
        const cols = report.columns.map((c) => ({ label: c.label, value: (r) => (c.value ? c.value(r) : r[c.key]) }));
        const csv = toCsv(cols, report.rows);
        res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="relatorio-${req.params.kind}.csv"` });
        return res.end(csv);
      }
      if (format === 'pdf') {
        const pdf = buildPdf({
          title: report.title,
          subtitle: report.subtitle || `${report.rows.length} registro(s) — ${ctx.user.church_name || 'Eclesia One'}`,
          meta: [`Igreja: ${ctx.user.church_name || '—'}`, `Emitido por: ${ctx.user.name} (${ctx.user.role_name || ctx.user.role})`, report.module === 'pastoral' ? 'Documento confidencial — acesso restrito ao corpo pastoral' : 'Documento de uso administrativo interno'],
          columns: report.columns, rows: report.rows, summary: report.summary, landscape: report.landscape !== false,
          footer: 'Eclesia One — Centro de Comando Digital da Igreja',
        });
        res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="relatorio-${req.params.kind}.pdf"` });
        return res.end(pdf);
      }
      return json(res, 400, { error: 'Formato não suportado. Use json, csv ou pdf.' });
    } catch (e) {
      return json(res, e.status || 500, { error: e.message });
    }
  }));

  router.add('POST', '/api/ai/ask', authed(async (req, res, ctx) => {
    const question = String(req.body?.question || '').trim();
    if (!question) return json(res, 422, { error: 'Digite uma pergunta.' });
    const out = aiAnswer(ctx.user.church_id, ctx.user, question);
    audit({ churchId: ctx.user.church_id, user: ctx.user, action: 'consulta_ia', module: 'inteligencia', resource: 'assistente', after: { question, scope: out.scope }, ip: req.ip });
    return json(res, 200, { ...out, question, generated_at: isoNow() });
  }));

  /* --------------------------------------------------------- QR / check-in */
  router.add('GET', '/api/qr', async (req, res) => {
    const text = String(req.query.text || '').slice(0, 90);
    if (!text) return json(res, 400, { error: 'Informe o conteúdo (?text=).' });
    const svg = qrSvg(text, Math.min(12, Math.max(2, Number(req.query.scale) || 6)));
    res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
    return res.end(svg);
  });

  router.add('GET', '/api/assets/:id/qr', authed(async (req, res, ctx) => {
    const asset = one('SELECT * FROM assets WHERE id = ? AND church_id = ? AND deleted_at IS NULL', [req.params.id, ctx.user.church_id]);
    if (!asset) return json(res, 404, { error: 'Patrimônio não encontrado.' });
    const payload = JSON.stringify({ t: 'asset', id: asset.id, c: asset.code, n: asset.name, church: ctx.user.church_id });
    const svg = qrSvg(payload.slice(0, 90), 6);
    return json(res, 200, { asset: { id: asset.id, code: asset.code, name: asset.name, location: asset.location, value: asset.value, condition_state: asset.condition_state, status: asset.status }, payload, svg, url: `/api/assets/${asset.id}/qr` });
  }));

  router.add('POST', '/api/checkins', authed(async (req, res, ctx) => {
    if (!can(ctx.user, 'infantil', 'create')) return json(res, 403, { error: 'Sem permissão para registrar check-in.' });
    const { child_id, checked_in_by } = req.body || {};
    const child = one('SELECT * FROM children WHERE id = ? AND church_id = ? AND deleted_at IS NULL', [child_id, ctx.user.church_id]);
    if (!child) return json(res, 404, { error: 'Criança não encontrada.' });
    const code = `INF-${isoDate().replace(/-/g, '')}-${String(scalar('SELECT COALESCE(MAX(id),0)+1 FROM child_checkins') ).padStart(4, '0')}`;
    const id = insert('child_checkins', {
      church_id: ctx.user.church_id, child_id, code, checkin_at: isoNow(),
      checked_in_by: checked_in_by || ctx.user.name, is_demo: 0, created_at: isoNow(), updated_at: isoNow(),
    });
    audit({ churchId: ctx.user.church_id, user: ctx.user, action: 'check-in', module: 'infantil', resource: 'child_checkins', recordId: id, after: { child_id, code }, ip: req.ip });
    return json(res, 201, { data: one('SELECT * FROM child_checkins WHERE id = ?', [id]), code, qr: qrSvg(code, 6), message: `Check-in realizado. Código de retirada: ${code}` });
  }));

  router.add('POST', '/api/checkins/:id/checkout', authed(async (req, res, ctx) => {
    if (!can(ctx.user, 'infantil', 'edit')) return json(res, 403, { error: 'Sem permissão para registrar check-out.' });
    const rec = one('SELECT * FROM child_checkins WHERE id = ? AND church_id = ? AND deleted_at IS NULL', [req.params.id, ctx.user.church_id]);
    if (!rec) return json(res, 404, { error: 'Check-in não encontrado.' });
    if (rec.checkout_at) return json(res, 409, { error: 'Esta criança já teve a saída registrada.' });
    const { released_to } = req.body || {};
    if (!released_to) return json(res, 422, { error: 'Informe o nome/documento do responsável autorizado que retirou a criança.' });
    run('UPDATE child_checkins SET checkout_at = ?, checked_out_by = ?, released_to = ?, updated_at = ? WHERE id = ? AND church_id = ?', [isoNow(), ctx.user.name, released_to, isoNow(), rec.id, ctx.user.church_id]);
    audit({ churchId: ctx.user.church_id, user: ctx.user, action: 'check-out', module: 'infantil', resource: 'child_checkins', recordId: rec.id, after: { released_to }, ip: req.ip });
    return json(res, 200, { data: one('SELECT * FROM child_checkins WHERE id = ?', [rec.id]), message: 'Saída registrada com responsável autorizado.' });
  }));

  router.add('POST', '/api/events/:id/register', authed(async (req, res, ctx) => {
    const ev = one('SELECT * FROM events WHERE id = ? AND church_id = ? AND deleted_at IS NULL', [req.params.id, ctx.user.church_id]);
    if (!ev) return json(res, 404, { error: 'Evento não encontrado.' });
    const personId = req.body?.person_id || ctx.user.person_id;
    if (!personId) return json(res, 422, { error: 'Informe a pessoa que será inscrita.' });
    const exists = one('SELECT id FROM event_registrations WHERE church_id=? AND event_id=? AND person_id=? AND deleted_at IS NULL', [ctx.user.church_id, ev.id, personId]);
    if (exists) return json(res, 409, { error: 'Esta pessoa já está inscrita no evento.' });
    if (ev.capacity) {
      const count = n(scalar('SELECT COUNT(*) FROM event_registrations WHERE church_id=? AND event_id=? AND deleted_at IS NULL', [ctx.user.church_id, ev.id]));
      if (count >= n(ev.capacity)) return json(res, 409, { error: 'A capacidade máxima do evento foi atingida.' });
    }
    const code = `EVT-${ev.id}-${String(personId).padStart(4, '0')}-${randomCode()}`;
    const id = insert('event_registrations', {
      church_id: ctx.user.church_id, event_id: ev.id, person_id: personId, status: 'inscrito',
      paid: n(ev.price) > 0 ? 0 : 1, amount: n(ev.price), qr_code: code, registered_at: isoDate(),
      is_demo: 0, created_at: isoNow(), updated_at: isoNow(),
    });
    audit({ churchId: ctx.user.church_id, user: ctx.user, action: 'inscricao', module: 'eventos', resource: 'event_registrations', recordId: id, after: { event_id: ev.id, person_id: personId }, ip: req.ip });
    return json(res, 201, { data: one('SELECT * FROM event_registrations WHERE id = ?', [id]), code, qr: qrSvg(code, 5), message: 'Inscrição confirmada. Apresente o QR Code na entrada.' });
  }));

  router.add('POST', '/api/events/checkin', authed(async (req, res, ctx) => {
    if (!can(ctx.user, 'eventos', 'edit')) return json(res, 403, { error: 'Sem permissão para validar entradas.' });
    const code = String(req.body?.code || '').trim();
    const reg = one('SELECT * FROM event_registrations WHERE church_id = ? AND qr_code = ? AND deleted_at IS NULL', [ctx.user.church_id, code]);
    if (!reg) return json(res, 404, { error: 'QR Code inválido para esta igreja.' });
    run('UPDATE event_registrations SET status = ?, updated_at = ? WHERE id = ?', ['presente', isoNow(), reg.id]);
    const person = one('SELECT full_name FROM people WHERE id = ?', [reg.person_id]);
    audit({ churchId: ctx.user.church_id, user: ctx.user, action: 'entrada_evento', module: 'eventos', resource: 'event_registrations', recordId: reg.id, ip: req.ip });
    return json(res, 200, { message: `Entrada liberada para ${person?.full_name || 'participante'}.`, data: { ...reg, status: 'presente' } });
  }));

  /* ------------------------------------------------------------- portal */
  router.add('GET', '/api/portal/me', authed(async (req, res, ctx) => {
    const churchId = ctx.user.church_id;
    const pid = ctx.user.person_id;
    if (!pid) return json(res, 200, { person: null, message: 'Seu usuário não está vinculado a um cadastro de pessoa. Procure a secretaria.' });
    const person = one('SELECT * FROM people WHERE id = ? AND church_id = ? AND deleted_at IS NULL', [pid, churchId]);
    const q = (sql, p = []) => all(sql, [churchId, pid, ...p]);
    const out = {
      person,
      familia: q(`SELECT f.name, m.role FROM family_members m JOIN families f ON f.id = m.family_id WHERE m.church_id = ? AND m.person_id = ? AND m.deleted_at IS NULL`),
      celulas: q(`SELECT c.name, c.weekday, c.meeting_time, cm.role, (SELECT full_name FROM people p WHERE p.id = c.leader_id) AS lider FROM cell_members cm JOIN cells c ON c.id = cm.cell_id WHERE cm.church_id = ? AND cm.person_id = ? AND cm.deleted_at IS NULL`),
      ministerios: q(`SELECT mi.name, mm.role FROM ministry_members mm JOIN ministries mi ON mi.id = mm.ministry_id WHERE mm.church_id = ? AND mm.person_id = ? AND mm.deleted_at IS NULL`),
      escalas: q(`SELECT s.id, s.schedule_date, s.schedule_time, s.function_name, s.status FROM schedules s WHERE s.church_id = ? AND s.person_id = ? AND s.deleted_at IS NULL AND s.schedule_date >= date('now') ORDER BY s.schedule_date LIMIT 20`),
      eventos: q(`SELECT e.id, e.name, e.event_date, e.location, er.status, er.qr_code FROM event_registrations er JOIN events e ON e.id = er.event_id WHERE er.church_id = ? AND er.person_id = ? AND er.deleted_at IS NULL AND e.event_date >= date('now','-1 day') ORDER BY e.event_date LIMIT 20`),
      cursos: q(`SELECT c.name, ce.attendance_percent, ce.status FROM course_enrollments ce JOIN courses c ON c.id = ce.course_id WHERE ce.church_id = ? AND ce.person_id = ? AND ce.deleted_at IS NULL`),
      avisos: all(`SELECT id, title, body, publish_at FROM announcements WHERE church_id = ? AND deleted_at IS NULL AND status = 'publicado' AND audience IN ('toda_igreja','membros') ORDER BY publish_at DESC LIMIT 10`, [churchId]),
      oracoes: q(`SELECT id, request, status, created_at FROM prayer_requests WHERE church_id = ? AND person_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 20`),
      documentos: all(`SELECT id, title, category, file_name, valid_until FROM documents WHERE church_id = ? AND deleted_at IS NULL AND category IN ('estatuto','licencas','outros') ORDER BY title LIMIT 20`, [churchId]),
    };
    if (can(ctx.user, 'financeiro', 'view')) {
      out.contribuicoes = q(`SELECT t.tx_date, t.value, t.payment_method, c.name AS categoria FROM transactions t LEFT JOIN categories c ON c.id = t.category_id WHERE t.church_id = ? AND t.person_id = ? AND t.deleted_at IS NULL ORDER BY t.tx_date DESC LIMIT 24`);
    }
    return json(res, 200, out);
  }));

  router.add('POST', '/api/portal/prayer', authed(async (req, res, ctx) => {
    const request = String(req.body?.request || '').trim();
    if (request.length < 5) return json(res, 422, { error: 'Descreva o pedido de oração.' });
    const id = insert('prayer_requests', {
      church_id: ctx.user.church_id, person_id: ctx.user.person_id, request,
      category: req.body?.category || 'geral', is_public: req.body?.is_public ? 1 : 0, confidential: 1,
      status: 'aberto', created_by: ctx.user.id, is_demo: 0, created_at: isoNow(), updated_at: isoNow(),
    });
    return json(res, 201, { message: 'Pedido de oração registrado. Nossa equipe pastoral orará por você.', data: one('SELECT * FROM prayer_requests WHERE id = ?', [id]) });
  }));

  router.add('POST', '/api/portal/schedules/:id/respond', authed(async (req, res, ctx) => {
    const { status } = req.body || {};
    const allowed = { confirmado: 'confirmado', recusado: 'recusado', substituicao_solicitada: 'substituicao_solicitada' };
    if (!allowed[status]) return json(res, 422, { error: 'Status inválido. Use confirmado, recusado ou substituicao_solicitada.' });
    const row = one('SELECT * FROM schedules WHERE id = ? AND church_id = ? AND deleted_at IS NULL', [req.params.id, ctx.user.church_id]);
    if (!row) return json(res, 404, { error: 'Escala não encontrada.' });
    if (ctx.user.person_id && row.person_id !== ctx.user.person_id && !can(ctx.user, 'escalas', 'edit')) {
      return json(res, 403, { error: 'Você só pode responder às suas próprias escalas.' });
    }
    run('UPDATE schedules SET status = ?, responded_at = ?, updated_at = ? WHERE id = ? AND church_id = ?', [status, isoNow(), isoNow(), row.id, ctx.user.church_id]);
    audit({ churchId: ctx.user.church_id, user: ctx.user, action: 'responder_escala', module: 'escalas', resource: 'schedules', recordId: row.id, after: { status }, ip: req.ip });
    return json(res, 200, { message: `Escala atualizada para "${status}".`, data: one('SELECT * FROM schedules WHERE id = ?', [row.id]) });
  }));

  /* ---------------------------------------------- transferencia bancaria */
  router.add('POST', '/api/transfers', authed(async (req, res, ctx) => {
    if (!can(ctx.user, 'financeiro', 'create')) return json(res, 403, { error: 'Sem permissão para registrar transferências.' });
    const { account_id, dest_account_id, value, tx_date, description } = req.body || {};
    if (!account_id || !dest_account_id) return json(res, 422, { error: 'Informe a conta de origem e a conta de destino.' });
    if (Number(account_id) === Number(dest_account_id)) return json(res, 422, { error: 'A conta de origem e destino devem ser diferentes.' });
    if (!(Number(value) > 0)) return json(res, 422, { error: 'Informe um valor maior que zero.' });
    const churchId = ctx.user.church_id;
    const bal = accountBalances(churchId);
    const src = bal.accounts.find((a) => a.id === Number(account_id));
    if (!src) return json(res, 404, { error: 'Conta de origem não encontrada.' });
    if (src.saldo < Number(value)) {
      return json(res, 409, { error: `Saldo insuficiente na conta de origem (disponível ${money(src.saldo)}). A operação não foi realizada.` });
    }
    const id = insert('transactions', {
      church_id: churchId, tx_type: 'transferencia', description: description || 'Transferência entre contas',
      value: Number(value), tx_date: tx_date ? String(tx_date).slice(0, 10) : isoDate(),
      account_id, dest_account_id, status: 'confirmado', created_by: ctx.user.id,
      is_demo: 0, created_at: isoNow(), updated_at: isoNow(),
    });
    audit({ churchId, user: ctx.user, action: 'transferencia', module: 'financeiro', resource: 'transactions', recordId: id, after: { account_id, dest_account_id, value }, ip: req.ip });
    return json(res, 201, { message: 'Transferência registrada com sucesso.', data: one('SELECT * FROM transactions WHERE id = ?', [id]) });
  }));

  /* ------------------------------------------------- aprovar / liquidar */
  router.add('POST', '/api/payables/:id/pay', authed(async (req, res, ctx) => {
    if (!can(ctx.user, 'financeiro', 'edit') && !can(ctx.user, 'contas', 'edit')) return json(res, 403, { error: 'Sem permissão para liquidar contas.' });
    const row = one('SELECT * FROM payables WHERE id = ? AND church_id = ? AND deleted_at IS NULL', [req.params.id, ctx.user.church_id]);
    if (!row) return json(res, 404, { error: 'Conta não encontrada.' });
    if (row.status === 'paga') return json(res, 409, { error: 'Esta conta já consta como paga.' });
    if (row.status === 'cancelada') return json(res, 409, { error: 'Conta cancelada não pode ser paga.' });
    const accountId = req.body?.account_id || row.account_id;
    if (!accountId) return json(res, 422, { error: 'Informe a conta de saída do pagamento.' });
    const churchId = ctx.user.church_id;
    const bal = accountBalances(churchId);
    const acc = bal.accounts.find((a) => a.id === Number(accountId));
    if (acc && acc.saldo < n(row.value)) {
      return json(res, 409, { error: `Saldo insuficiente na conta "${acc.name}" (disponível ${money(acc.saldo)}). Registre uma transferência ou escolha outra conta.` });
    }
    const today = isoDate();
    const txId = insert('transactions', {
      church_id: churchId, tx_type: 'saida', category_id: row.category_id, description: row.description,
      value: n(row.value), tx_date: today, account_id: accountId, fund_id: row.fund_id,
      cost_center_id: row.cost_center_id, payment_method: req.body?.payment_method || row.payment_method,
      document: row.document, status: 'confirmado', person: undefined, created_by: ctx.user.id,
      is_demo: 0, created_at: isoNow(), updated_at: isoNow(),
    });
    run('UPDATE payables SET status = ?, payment_date = ?, account_id = ?, updated_at = ? WHERE id = ? AND church_id = ?', ['paga', today, accountId, isoNow(), row.id, churchId]);
    audit({ churchId, user: ctx.user, action: 'pagar_conta', module: 'contas', resource: 'payables', recordId: row.id, before: row, after: { status: 'paga', account_id: accountId, transaction_id: txId }, ip: req.ip });
    return json(res, 200, { message: `Pagamento registrado e lançado no extrato da conta.`, data: one('SELECT * FROM payables WHERE id = ?', [row.id]) });
  }));

  router.add('POST', '/api/receivables/:id/receive', authed(async (req, res, ctx) => {
    if (!can(ctx.user, 'financeiro', 'edit') && !can(ctx.user, 'contas', 'edit')) return json(res, 403, { error: 'Sem permissão para registrar recebimentos.' });
    const row = one('SELECT * FROM receivables WHERE id = ? AND church_id = ? AND deleted_at IS NULL', [req.params.id, ctx.user.church_id]);
    if (!row) return json(res, 404, { error: 'Conta a receber não encontrada.' });
    if (row.status === 'recebida') return json(res, 409, { error: 'Este valor já foi recebido.' });
    const churchId = ctx.user.church_id;
    const today = isoDate();
    const txId = insert('transactions', {
      church_id: churchId, tx_type: 'entrada', category_id: row.category_id, description: row.description,
      value: n(row.value), tx_date: today, account_id: req.body?.account_id || row.account_id,
      payment_method: req.body?.payment_method || 'Transferência', status: 'confirmado',
      created_by: ctx.user.id, is_demo: 0, created_at: isoNow(), updated_at: isoNow(),
    });
    run('UPDATE receivables SET status = ?, received_date = ?, account_id = ?, updated_at = ? WHERE id = ? AND church_id = ?', ['recebida', today, req.body?.account_id || row.account_id, isoNow(), row.id, churchId]);
    audit({ churchId, user: ctx.user, action: 'receber_conta', module: 'contas', resource: 'receivables', recordId: row.id, after: { status: 'recebida', transaction_id: txId }, ip: req.ip });
    return json(res, 200, { message: 'Recebimento registrado e lançado no extrato.', data: one('SELECT * FROM receivables WHERE id = ?', [row.id]) });
  }));

  /* ------------------------------------------------------- relatorios meta */
  router.add('GET', '/api/reports', authed(async (req, res, ctx) => {
    const catalog = [
      { kind: 'membros', label: 'Membros', module: 'pessoas' }, { kind: 'pessoas', label: 'Pessoas (visão geral)', module: 'pessoas' },
      { kind: 'visitantes', label: 'Visitantes', module: 'visitantes' }, { kind: 'familias', label: 'Famílias', module: 'familias' },
      { kind: 'aniversariantes', label: 'Aniversariantes do mês', module: 'pessoas' }, { kind: 'crescimento', label: 'Crescimento da igreja', module: 'pessoas' },
      { kind: 'celulas', label: 'Células', module: 'celulas' }, { kind: 'frequencia', label: 'Frequência (células)', module: 'celulas' },
      { kind: 'financeiro', label: 'Financeiro — entradas e saídas', module: 'financeiro' }, { kind: 'dizimos', label: 'Dízimos', module: 'financeiro' },
      { kind: 'contas', label: 'Contas a pagar e receber', module: 'contas' }, { kind: 'fluxo', label: 'Fluxo de caixa', module: 'financeiro' },
      { kind: 'orcamento', label: 'Orçamento x realizado', module: 'financeiro' }, { kind: 'centros_custo', label: 'Centros de custo', module: 'financeiro' },
      { kind: 'fundos', label: 'Fundos', module: 'financeiro' }, { kind: 'prestacao', label: 'Prestação de contas', module: 'financeiro' },
      { kind: 'ministerios', label: 'Ministérios', module: 'ministerios' }, { kind: 'patrimonio', label: 'Patrimônio', module: 'patrimonio' },
      { kind: 'manutencao', label: 'Manutenção', module: 'manutencao' }, { kind: 'eventos', label: 'Eventos', module: 'eventos' },
      { kind: 'pastoral', label: 'Pastoral (agregado)', module: 'pastoral' },
    ];
    return json(res, 200, { data: catalog.filter((c) => can(ctx.user, c.module, 'view') || ctx.user.role === 'super_admin') });
  }));

  router.add('GET', '/api/indicators', authed(async (req, res, ctx) => {
    const churchId = ctx.user.church_id;
    const d = dashboardData(churchId, ctx.user);
    const frequency = (() => {
      const rows = all(`SELECT SUM(present_count) p, SUM(absent_count) a FROM cell_meetings WHERE church_id = ? AND deleted_at IS NULL AND meeting_date >= ?`, [churchId, addDays(isoDate(), -35)]);
      const p = n(rows[0]?.p), a = n(rows[0]?.a);
      return p + a ? pct(p, p + a) : 0;
    })();
    return json(res, 200, {
      pessoas: d.people.total, celulas: d.ministries.celulas, frequencia: frequency,
      visitantes_mes: n(scalar('SELECT COUNT(*) FROM visitors WHERE church_id=? AND deleted_at IS NULL AND first_visit_date LIKE ?', [churchId, monthKey(isoDate()) + '%'])),
      saldo: d.finance?.saldo ?? null, a_pagar: d.finance?.a_pagar ?? null, a_receber: d.finance?.a_receber ?? null,
      saldo_projetado: d.finance?.saldo_projetado ?? null, pendencias: d.alerts.reduce((s, a) => s + (a.items?.length || 0), 0),
      eventos: n(scalar('SELECT COUNT(*) FROM events WHERE church_id=? AND deleted_at IS NULL AND event_date >= ?', [churchId, isoDate()])),
      alertas: d.alerts,
    });
  }));
}

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
