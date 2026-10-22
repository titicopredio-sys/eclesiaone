/* =============================================================================
   Eclesia One — páginas (PAGES). Cada página consome a API real, respeita as
   permissões do perfil e não contém dado fictício embutido.
   ============================================================================= */
import {
  state, api, brl, num, compact, dt, dtTime, today, addDaysStr, initials, esc, icon, toast,
  modal, confirmDialog, badgeFor, enumLabel, renderTable, buildForm, collectForm, hydrateRefFields,
  pager, metricCard, loadingBlock, downloadUrl, can, apiUrl, RES_KEY_ALIAS,
} from './ui.js';
import { financeBars, lineChart, donutChart, hBars, barChart } from './charts.js';

const qs = (o = {}) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) p.set(k, v); });
  const s = p.toString();
  return s ? '?' + s : '';
};

/* ==================================================== CRUD GENÉRICO */
export async function resourcePage(container, ctx) {
  const key = ctx.resource;
  const def = state.meta[key];
  if (!def) return renderSoon(container, 'Recurso não disponível', `O recurso "${key}" não está registrado no sistema.`);

  const q = { ...ctx.query };
  const params = { page: q.page || 1, limit: q.limit || 25, q: q.q || '', sort: q.sort || def.sort.default, order: q.order || 'asc' };
  Object.keys(q).forEach((k) => { if (k.startsWith('f_') || ['from', 'to', 'days'].includes(k)) params[k] = q[k]; });

  container.innerHTML = loadingBlock();
  let payload;
  try { payload = await api(`/api/${key}${qs(params)}`); }
  catch (e) { return renderError(container, e); }

  const meta = payload.meta;
  const rows = payload.data;
  const extraFilters = Object.entries(q).filter(([k]) => k.startsWith('f_')).map(([k, v]) => ({ k, v }));

  const canCreate = can(def.module, 'create') && !def.read_only;
  const canExport = can(def.module, 'export') || can(def.module, 'view');

  container.innerHTML = `
    <div class="page-head">
      <div>
        <h2>${esc(def.plural)}</h2>
        <p>${esc(ctx.description || `Gestão integrada de ${def.plural.toLowerCase()}. Os dados aqui cadastrados são reutilizados nos demais módulos do sistema.`)}</p>
      </div>
      <div class="page-actions">
        ${canExport ? `<button class="btn btn-ghost" data-export="csv">${icon('download')} CSV</button>
        <button class="btn btn-ghost" data-export="pdf">${icon('print')} PDF</button>` : ''}
        ${canCreate ? `<button class="btn btn-primary" data-new>${icon('plus')} Novo${def.label.startsWith('a') ? 'a' : ''} ${esc(def.label)}</button>` : ''}
      </div>
    </div>
    <div class="card">
      <div class="toolbar">
        <div class="search-inline">${icon('search')}<input class="input" data-q placeholder="Pesquisar em ${esc(def.plural.toLowerCase())}…" value="${esc(params.q)}" /></div>
        <select class="input filter-inline" data-sort>${(def.sort.allowed || ['id']).map((s) => {
          const f = def.fields.find((x) => x.name === s);
          return `<option value="${s}" ${s === params.sort ? 'selected' : ''}>Ordenar: ${esc(f?.label || s)}</option>`;
        }).join('')}</select>
        ${filterChips(def, extraFilters)}
        <span class="right small muted">${num(meta.total)} registro(s)</span>
      </div>
      <div data-table>${renderTable({ resource: key, def, rows, sort: params.sort, order: params.order })}</div>
      ${pager(meta, { ...params, q: params.q })}
    </div>`;

  /* interações */
  const tableEl = container.querySelector('[data-table]');
  const reload = (patch = {}) => {
    const next = { ...params, ...patch };
    const search = new URLSearchParams(Object.entries(next).filter(([, v]) => v !== '' && v !== null && v !== undefined)).toString();
    location.hash = `#/${ctx.route}?${search}`;
  };
  const qInput = container.querySelector('[data-q]');
  let t = null;
  qInput.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => reload({ q: qInput.value, page: 1 }), 350); });
  container.querySelector('[data-sort]').addEventListener('change', (e) => reload({ sort: e.target.value, page: 1 }));
  container.querySelectorAll('th[data-sort]').forEach((th) => th.addEventListener('click', () => {
    if (!th.dataset.sort) return;
    reload({ sort: th.dataset.sort, order: params.sort === th.dataset.sort && params.order === 'asc' ? 'desc' : 'asc' });
  }));
  container.querySelectorAll('[data-page]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); reload({ page: Number(a.dataset.page) }); }));
  container.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => {
    downloadUrl(`/api/${key}${qs({ ...params, format: b.dataset.export, page: 1, limit: 2000 })}`);
    toast('Exportação iniciada', `Arquivo ${b.dataset.export.toUpperCase()} gerado com os filtros atuais.`, 'ok');
  }));
  container.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => viewRecord(key, def, b.dataset.view)));
  container.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => editRecord(key, def, b.dataset.edit, () => reload())));
  container.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => removeRecord(key, def, b.dataset.del, () => reload())));
  const newBtn = container.querySelector('[data-new]');
  if (newBtn) newBtn.addEventListener('click', () => editRecord(key, def, null, () => reload()));
  container.querySelectorAll('[data-clear-filter]').forEach((b) => b.addEventListener('click', () => {
    const next = { ...params };
    delete next[b.dataset.clearFilter];
    const search = new URLSearchParams(Object.entries(next).filter(([, v]) => v !== '' && v !== null)).toString();
    location.hash = `#/${ctx.route}?${search}`;
  }));
}

function filterChips(def, active) {
  const presets = (def.list_columns || []).map((c) => def.fields.find((f) => f.name === c)).filter((f) => f && f.type === 'enum').slice(0, 2);
  return presets.map((f) => {
    const cur = active.find((a) => a.k === `f_${f.name}`)?.v || '';
    return `<select class="input filter-inline" data-filter="${f.name}">
      <option value="">${esc(f.label)}: todos</option>
      ${(f.options || []).map((o) => `<option value="${esc(o.value)}" ${String(cur) === String(o.value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
    </select>`;
  }).join('') + (active.length ? active.map((a) => `<button class="tag" data-clear-filter="${a.k}">${esc(a.k.slice(2))}: ${esc(a.v)} ✕</button>`).join('') : '');
}

/* ============================================ ficha / formulário genéricos */
export async function viewRecord(key, def, id) {
  const m = modal({ title: `Ficha — ${def.label}`, subtitle: 'Visualização integrada do registro', size: 'wide', body: loadingBlock('Carregando ficha…') });
  try {
    const { data, related } = await api(`/api/${key}/${id}`);
    const main = def.fields.filter((f) => data[f.name] !== undefined && data[f.name] !== null && data[f.name] !== '');
    m.body.innerHTML = `
      <div class="row" style="align-items:flex-start;gap:14px">
        <div class="avatar lg">${esc(initials(data.full_name || data.name || data.title || `#${id}`))}</div>
        <div style="min-width:0">
          <h3 style="font-size:19px">${esc(data.full_name || data.name || data.title || `Registro ${id}`)}</h3>
          <div class="small muted">${esc(def.plural)} · registro #${id}${data.is_demo ? ' · <span class="badge demo">DEMONSTRAÇÃO</span>' : ''}</div>
          <div class="mt-1">${def.badge && data[def.badge] ? badgeFor(key, def.badge, data[def.badge]) : ''}</div>
        </div>
        ${can(def.module, 'edit') && !def.read_only ? `<button class="btn btn-sm btn-ghost right" data-edit-open>${icon('edit')} Editar</button>` : ''}
      </div>
      <hr class="hr" />
      <dl class="kv">
        ${main.map((f) => {
          let v;
          if (f.type === 'enum') v = badgeFor(key, f.name, data[f.name]);
          else if (f.type === 'boolean') v = data[f.name] ? 'Sim' : 'Não';
          else if (f.type === 'money') v = brl(data[f.name]);
          else if (f.type === 'date' || f.type === 'datetime') v = dt(f.type === 'datetime' ? dtTime(data[f.name]) : data[f.name]);
          else if (f.name.endsWith('_id') && data[f.name.replace(/_id$/, '_nome')]) v = esc(data[f.name.replace(/_id$/, '_nome')]);
          else v = esc(String(data[f.name]));
          return `<dt>${esc(f.label)}</dt><dd>${v}</dd>`;
        }).join('')}
      </dl>
      ${related ? relatedSections(related) : ''}`;
    const btn = m.body.querySelector('[data-edit-open]');
    if (btn) btn.addEventListener('click', () => { m.close(); editRecord(key, def, id, () => { location.reload(); }); });
  } catch (e) { m.body.innerHTML = `<div class="note">${esc(e.message)}</div>`; }
}

function relatedSections(related) {
  const labels = {
    familia: 'Família', celulas: 'Células', ministerios: 'Ministérios', voluntariado: 'Voluntariado',
    escalas: 'Escalas', frequencia_celula: 'Frequência em célula', frequencia_ebd: 'Frequência na EBD',
    eventos: 'Eventos', cursos: 'Cursos', cargos: 'Cargos / funções', pastoral: 'Histórico pastoral',
    contribuicoes: 'Contribuições (acesso autorizado)', historico: 'Histórico no sistema',
  };
  const blocks = Object.entries(related).filter(([, v]) => Array.isArray(v) && v.length).map(([k, rows]) => {
    const cols = Object.keys(rows[0]);
    return `<div class="card mt-2"><div class="card-head"><h3>${esc(labels[k] || k)} <span class="badge plain neutral">${rows.length}</span></h3></div>
      <div class="table-wrap"><table class="data compact"><thead><tr>${cols.map((c) => `<th>${esc(c.replace(/_/g, ' '))}</th>`).join('')}</tr></thead>
      <tbody>${rows.slice(0, 25).map((r) => `<tr>${cols.map((c) => `<td>${esc(typeof r[c] === 'number' || /valor|value|percent/.test(c) ? brl(r[c]) : (r[c] ?? '—'))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  }).join('');
  const counts = Object.entries(related).filter(([, v]) => Array.isArray(v) && v.length === 1 && v[0] && Object.keys(v[0]).length === 1);
  const countBlocks = counts.map(([k, v]) => `<div class="metric"><div class="k">${icon('chart')} ${esc(labels[k] || k)}</div><div class="v">${num(Object.values(v[0])[0])}</div></div>`).join('');
  return `${countBlocks ? `<div class="grid g-auto mt-2">${countBlocks}</div>` : ''}${blocks || ''}`;
}

export async function editRecord(key, def, id, onDone) {
  const isNew = !id;
  let row = {};
  if (!isNew) {
    try { row = (await api(`/api/${key}/${id}`)).data; } catch (e) { return toast('Não foi possível abrir', e.message, 'err'); }
  }
  const m = modal({
    title: isNew ? `Novo${def.label.startsWith('a') ? 'a' : ''} ${def.label}` : `${def.label} #${id}`,
    subtitle: isNew ? 'Os campos com * são obrigatórios. Apenas o essencial é exigido.' : 'As alterações ficam registradas na auditoria.',
    size: 'wide',
    body: buildForm(key, def, row),
    footer: `<span class="small muted left">${isNew ? 'Cadastro único e reutilizável em todos os módulos' : `Atualizado em ${dtTime(row.updated_at)}`}</span>
      <button class="btn btn-ghost" data-close>Cancelar</button>
      <button class="btn btn-primary" data-save>${icon('check')} Salvar</button>`,
  });
  await hydrateRefFields(m.body);
  const formEl = m.body.querySelector('form');
  const saveBtn = m.el.querySelector('[data-save]');
  saveBtn.addEventListener('click', async () => {
    const { data, errors } = collectForm(formEl, def);
    m.body.querySelectorAll('.field-err').forEach((e) => e.remove());
    if (errors.length) {
      toast('Verifique os campos', errors[0], 'err');
      return;
    }
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spin"></span> Salvando…';
    try {
      if (isNew) await api(`/api/${key}`, { method: 'POST', body: data });
      else await api(`/api/${key}/${id}`, { method: 'PUT', body: data });
      toast(isNew ? 'Registro criado' : 'Registro atualizado', isNew ? 'Cadastro disponível para todos os módulos relacionados.' : 'Alteração registrada na auditoria.', 'ok');
      m.close();
      if (onDone) onDone();
    } catch (e) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `${icon('check')} Salvar`;
      toast('Não foi possível salvar', e.message, 'err');
    }
  });
}

export async function removeRecord(key, def, id, onDone) {
  const financial = !!def.financial;
  const okToGo = await confirmDialog({
    title: financial ? 'Cancelar lançamento?' : `Excluir ${def.label.toLowerCase()}?`,
    message: financial
      ? 'Lançamentos financeiros não são apagados: o registro será marcado como CANCELADO e o histórico será preservado para auditoria.'
      : 'O registro será removido das consultas (exclusão lógica). O histórico permanece registrado na auditoria, garantindo integridade e rastreabilidade (LGPD).',
    confirmLabel: financial ? 'Cancelar lançamento' : 'Excluir registro',
    danger: !financial,
  });
  if (!okToGo) return;
  try {
    const r = await api(`/api/${key}/${id}`, { method: 'DELETE' });
    toast('Operação concluída', r.message, 'ok');
    if (onDone) onDone();
  } catch (e) { toast('Operação não permitida', e.message, 'err'); }
}

/* ==================================================== DASHBOARD EXECUTIVO */
export async function dashboardPage(container) {
  container.innerHTML = loadingBlock('Consolidando indicadores da igreja…');
  let d, indicators;
  try { [d, indicators] = await Promise.all([api('/api/dashboard'), api('/api/indicators')]); }
  catch (e) { return renderError(container, e); }
  const p = d.people, m = d.ministries, f = d.finance;
  state.alerts = d.alerts;
  drawAlertBadge(d.alerts);

  container.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Visão da Igreja</h2>
        <p>Panorama executivo de ${esc(d.scope.church || 'sua igreja')} — pessoas, ministérios, finanças e pendências em menos de um minuto.</p>
      </div>
      <div class="page-actions">
        <span class="badge neutral">${esc(d.scope.role_name || d.scope.role)}</span>
        <button class="btn btn-ghost" data-refresh>${icon('refresh')} Atualizar</button>
        <button class="btn btn-primary" data-go="#/assistente-ia">${icon('sparkles')} Perguntar à IA</button>
      </div>
    </div>

    <div class="grid g-5">
      ${metricCard({ label: 'Pessoas', value: num(p.total), detail: `${num(p.ativos)} ativos · ${num(p.inativos)} inativos`, tone: 'brand', icon: 'users', href: '#/membros' })}
      ${metricCard({ label: 'Células', value: num(m.celulas), detail: `${num(m.celulas_ativas)} ativas · ${num(m.membros_celula)} integrantes`, tone: 'brand', icon: 'layers', href: '#/celulas' })}
      ${metricCard({ label: 'Frequência', value: `${num(indicators.frequencia)}%`, detail: `média de ${num(m.media_presenca)} presentes por reunião`, tone: indicators.frequencia >= 60 ? 'ok' : 'warn', icon: 'target', href: '#/relatorios/frequencia' })}
      ${metricCard({ label: 'Visitantes', value: num(indicators.visitantes_mes), detail: `${num(m.lideres)} líderes · ${num(m.voluntarios)} voluntários`, tone: 'neutral', icon: 'heart', href: '#/visitantes' })}
      ${metricCard({ label: 'Pendências', value: num(indicators.pendencias), detail: `${num(d.alerts.length)} grupos de atenção`, tone: indicators.pendencias > 0 ? 'warn' : 'ok', icon: 'alert', href: '#/alertas' })}
    </div>

    ${f ? `
    <div class="grid g-5 mt-2">
      ${metricCard({ label: 'Saldo atual', value: brl(f.saldo), detail: `${f.contas.length} conta(s)`, tone: f.saldo >= 0 ? 'ok' : 'danger', icon: 'wallet', href: '#/contas-bancarias' })}
      ${metricCard({ label: 'Entradas do mês', value: brl(f.entradas_mes), detail: `dízimos ${brl(f.dizimos)} · ofertas ${brl(f.ofertas)}`, tone: 'ok', icon: 'dollar', href: '#/financeiro' })}
      ${metricCard({ label: 'Saídas do mês', value: brl(f.saidas_mes), detail: `resultado ${brl(f.resultado_mes)}`, tone: 'danger', icon: 'dollar', href: '#/financeiro' })}
      ${metricCard({ label: 'A pagar', value: brl(f.a_pagar), detail: `${f.contas_vencidas} vencida(s) · ${brl(f.valor_vencido)} em atraso`, tone: f.contas_vencidas ? 'danger' : 'warn', icon: 'clipboard', href: '#/contas-a-pagar' })}
      ${metricCard({ label: 'Saldo projetado', value: brl(f.saldo_projetado), detail: `a receber ${brl(f.a_receber)} · 30 dias`, tone: f.fluxo_negativo ? 'danger' : 'brand', icon: 'chart', href: '#/fluxo-de-caixa' })}
    </div>` : `<div class="note mt-2">Seu perfil não possui permissão para indicadores financeiros. Os valores ficam ocultos por segurança e política de privacidade.</div>`}

    <div class="grid g-2 mt-2">
      <div class="card">
        <div class="card-head"><h3>${icon('alert')} Central de Atenção</h3><span class="right small muted">${num(d.alerts.length)} grupo(s)</span></div>
        <div class="card-body stack">
          ${d.alerts.length ? d.alerts.slice(0, 6).map((a) => alertCard(a)).join('') : `<div class="empty">${icon('check')}<h4>Nada exige atenção agora</h4><p>Não há contas vencidas, escalas pendentes ou documentos a vencer.</p></div>`}
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="card-head"><h3>${icon('users')} Composição das pessoas</h3></div>
          <div class="card-body">${hBars({ items: [
            { label: 'Crianças (0–11)', value: p.faixa.criancas }, { label: 'Adolescentes (12–17)', value: p.faixa.adolescentes },
            { label: 'Jovens (18–35)', value: p.faixa.jovens }, { label: 'Adultos (36–59)', value: p.faixa.adultos },
            { label: 'Idosos (60+)', value: p.faixa.idosos },
          ], formatter: num })}</div>
        </div>
        <div class="card">
          <div class="card-head"><h3>${icon('layers')} Ministérios</h3></div>
          <div class="card-body">
            <div class="grid g-2" style="gap:10px">
              ${[['Ministérios ativos', m.ministérios_ativos, '#/ministerios'], ['Classes EBD', m.classes_ebd, '#/ebd'],
                 ['Voluntários ativos', m.voluntarios, '#/voluntarios'], ['Escalas pendentes', m.escalas_pendentes, '#/escalas']]
                .map(([label, value, href]) => `<div class="metric clickable" data-go="${href}" style="padding:11px 12px"><div class="k">${esc(label)}</div><div class="v sm">${num(value)}</div></div>`).join('')}
            </div>
            <div class="mt-2 small muted">Novos membros no mês: <b>${num(p.novos_mes)}</b> · Foram cadastrados ${num(p.novos_convertidos)} novos convertidos (batismos no mês).</div>
          </div>
        </div>
      </div>
    </div>

    ${f ? `
    <div class="card mt-2">
      <div class="card-head"><h3>${icon('chart')} Receitas x Despesas — últimos 6 meses</h3>
        <span class="right legend"><span><i style="background:#059669"></i>Entradas</span><span><i style="background:#DC2626"></i>Saídas</span></span></div>
      <div class="card-body" data-finchart>${loadingBlock('Carregando série financeira…')}</div>
    </div>` : ''}

    <div class="card mt-2">
      <div class="card-head"><h3>${icon('calendar')} Próximos eventos</h3><a class="right small" href="#/eventos">Ver todos</a></div>
      <div class="card-body">
        ${m.proximos_eventos.length ? `<div class="table-wrap"><table class="data compact"><thead><tr><th>Evento</th><th>Data</th><th>Local</th></tr></thead>
          <tbody>${m.proximos_eventos.map((e) => `<tr><td class="cell-main">${esc(e.name)}</td><td>${dt(e.event_date)}</td><td>${esc(e.location || '—')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><p>Nenhum evento agendado.</p></div>'}
      </div>
    </div>`;

  container.querySelector('[data-refresh]')?.addEventListener('click', () => dashboardPage(container));
  container.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', () => { location.hash = el.dataset.go; }));
  if (f && container.querySelector('[data-finchart]')) {
    api('/api/dashboard/finance?months=6').then((fd) => {
      const el = container.querySelector('[data-finchart]');
      el.innerHTML = financeBars(fd.series) + `<div class="grid g-2 mt-2">
        <div><h4 class="small muted mb-1">DESPESAS POR CENTRO DE CUSTO</h4>${hBars({ items: fd.byCenter.map((c) => ({ label: c.centro, value: c.total })) })}</div>
        <div><h4 class="small muted mb-1">SALDO POR FUNDO</h4>${hBars({ items: fd.funds.map((x) => ({ label: x.fundo, value: x.saldo })), toneFor: (r) => (r.value < 0 ? 'danger' : 'ok') })}</div>
      </div>`;
    }).catch(() => { container.querySelector('[data-finchart]').innerHTML = '<div class="note">Série financeira indisponível no momento.</div>'; });
  }
}

function alertCard(a) {
  const ic = a.kind === 'danger' ? 'alert' : a.kind === 'warning' ? 'clock' : 'bell';
  return `<div class="alert ${a.kind}">
    <span class="ico">${icon(ic)}</span>
    <div style="min-width:0;flex:1">
      <h4>${esc(a.title)}</h4>
      ${a.detail ? `<p>${esc(a.detail)}</p>` : ''}
      ${a.items && a.items.length ? `<ul class="items">${a.items.slice(0, 4).map((i) => `<li><span class="trunc">${esc(i.label || '')}</span><span class="nowrap muted">${esc(i.meta || '')}</span></li>`).join('')}${a.items.length > 4 ? `<li><span class="muted">+ ${a.items.length - 4} registro(s)</span></li>` : ''}</ul>` : ''}
    </div>
    ${a.link ? `<button class="btn btn-xs btn-ghost go" data-go="${esc(a.link.replace('#', '#/'))}">Abrir</button>` : ''}
  </div>`;
}

export function drawAlertBadge(alerts) {
  const n = alerts.reduce((s, a) => s + (a.items?.length || 0), 0);
  const badge = document.querySelector('[data-nav-count="alertas"]');
  if (badge) { badge.textContent = n > 99 ? '99+' : String(n); badge.hidden = n === 0; }
  const top = document.querySelector('[data-bell-count]');
  if (top) { top.textContent = String(n); top.hidden = n === 0; }
}

export async function alertsPage(container) {
  container.innerHTML = loadingBlock('Verificando pendências de todos os módulos…');
  try {
    const { data, groups, total } = await api('/api/alerts');
    state.alerts = data;
    drawAlertBadge(data);
    container.innerHTML = `
      <div class="page-head"><div><h2>Central de Atenção</h2>
        <p>O sistema monitora contas, células, escalas, documentos, contratos, tarefas, manutenções e o fluxo de caixa, apontando o que precisa de decisão humana. O sistema <b>não</b> executa ações automaticamente.</p></div>
        <div class="page-actions"><button class="btn btn-ghost" data-refresh>${icon('refresh')} Reanalisar</button></div></div>
      <div class="grid g-4">
        ${metricCard({ label: 'Grupos de alerta', value: num(groups), tone: 'brand', icon: 'bell' })}
        ${metricCard({ label: 'Registros afetados', value: num(total), tone: total ? 'warn' : 'ok', icon: 'clipboard' })}
        ${metricCard({ label: 'Críticos', value: num(data.filter((a) => a.kind === 'danger').length), tone: 'danger', icon: 'alert' })}
        ${metricCard({ label: 'Analisado em', value: new Date().toLocaleTimeString('pt-BR'), detail: 'consulta em tempo real', tone: 'neutral', icon: 'clock' })}
      </div>
      <div class="stack mt-2">${data.length ? data.map((a) => alertCard(a)).join('') : `<div class="card"><div class="empty">${icon('check')}<h4>Nenhuma pendência</h4><p>Todo o operacional está em ordem no momento.</p></div></div>`}</div>`;
    container.querySelector('[data-refresh]')?.addEventListener('click', () => alertsPage(container));
    container.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', () => { location.hash = el.dataset.go; }));
  } catch (e) { renderError(container, e); }
}

/* ========================================================= DASHBOARDS */
export async function financeDashboard(container) {
  if (!can('financeiro', 'view') && !can('contas', 'view')) return renderForbidden(container, 'painel financeiro');
  container.innerHTML = loadingBlock('Consolidando dados financeiros…');
  const [fd, cf] = await Promise.all([api('/api/dashboard/finance?months=6'), api('/api/cashflow?days=30')]).catch((e) => { renderError(container, e); return []; });
  if (!fd || !cf) return;
  const mes = fd.series[fd.series.length - 1];
  container.innerHTML = `
    <div class="page-head"><div><h2>Painel Financeiro</h2><p>Visão administrativa de contas, arrecadação, despesas, fundos, centros de custo e orçamento — sempre em conformidade com as permissões do seu perfil.</p></div>
      <div class="page-actions">
        <button class="btn btn-ghost" data-go="#/prestacao">${icon('file')} Prestação de contas</button>
        <button class="btn btn-primary" data-go="#/contas-a-pagar">${icon('plus')} Contas a pagar</button>
      </div></div>
    <div class="grid g-4">
      ${metricCard({ label: 'Saldo total', value: brl(fd.accounts.total), detail: `${fd.accounts.accounts.length} conta(s)`, tone: 'ok', icon: 'wallet' })}
      ${metricCard({ label: 'Entradas do mês', value: brl(mes?.entradas), detail: `dízimos ${brl(mes?.dizimos)}`, tone: 'ok', icon: 'dollar' })}
      ${metricCard({ label: 'Saídas do mês', value: brl(mes?.saidas), detail: `resultado ${brl(mes?.resultado)}`, tone: (mes?.resultado || 0) >= 0 ? 'brand' : 'danger', icon: 'dollar' })}
      ${metricCard({ label: 'Projeção 30 dias', value: brl(cf.saldo_projetado), detail: `a receber ${brl(cf.a_receber)} · a pagar ${brl(cf.a_pagar)}`, tone: cf.negative ? 'danger' : 'ok', icon: 'chart' })}
    </div>
    ${cf.negative ? `<div class="alert danger mt-2"><span class="ico">${icon('alert')}</span><div><h4>FLUXO DE CAIXA PROJETADO NEGATIVO</h4><p>Com o saldo atual e os compromissos dos próximos ${cf.horizonte_dias} dias, a projeção é de ${brl(cf.saldo_projetado)}. Analise contas a pagar, recebíveis e campanhas antes de assumir novos compromissos.</p></div>
      <button class="btn btn-sm btn-primary go" data-go="#/fluxo-de-caixa">Ver fluxo</button></div>` : ''}
    <div class="grid g-2 mt-2">
      <div class="card"><div class="card-head"><h3>Receitas x Despesas — 6 meses</h3></div><div class="card-body">${financeBars(fd.series)}</div></div>
      <div class="card"><div class="card-head"><h3>Resultado mensal (linha de tendência)</h3></div><div class="card-body">${lineChart({ points: fd.series.map((s) => s.resultado), labels: fd.series.map((s) => s.label) })}</div></div>
    </div>
    <div class="grid g-2 mt-2">
      <div class="card"><div class="card-head"><h3>Receitas por categoria (6 meses)</h3></div><div class="card-body">${donutChart({ items: fd.byCategory.filter((c) => c.kind === 'receita').map((c) => ({ label: c.categoria, value: c.total })) })}</div></div>
      <div class="card"><div class="card-head"><h3>Despesas por categoria (6 meses)</h3></div><div class="card-body">${donutChart({ items: fd.byCategory.filter((c) => c.kind !== 'receita').map((c) => ({ label: c.categoria, value: c.total })) })}</div></div>
    </div>
    <div class="grid g-2 mt-2">
      <div class="card"><div class="card-head"><h3>Despesas por centro de custo</h3></div><div class="card-body">${hBars({ items: fd.byCenter.map((c) => ({ label: c.centro, value: c.total })) })}</div></div>
      <div class="card"><div class="card-head"><h3>Saldos por fundo</h3></div><div class="card-body">${hBars({ items: fd.funds.map((f) => ({ label: f.fundo, value: f.saldo })), toneFor: (r) => (r.value < 0 ? 'danger' : 'ok') })}</div></div>
    </div>
    <div class="card mt-2"><div class="card-head"><h3>Orçamento x Realizado — ${new Date().getFullYear()}</h3>
      <a class="right small" href="#/orcamento">Editar orçamento</a></div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Categoria</th><th>Orçado</th><th>Realizado</th><th>Variação</th><th>Executado</th></tr></thead><tbody>
      ${fd.budget.map((b) => {
        const per = Number(b.orcado) ? (Number(b.realizado) / Number(b.orcado)) * 100 : 0;
        const over = Number(b.realizado) > Number(b.orcado);
        return `<tr><td class="cell-main">${esc(b.categoria || '—')}</td><td class="num">${brl(b.orcado)}</td><td class="num">${brl(b.realizado)}</td>
          <td class="num" style="color:${over ? 'var(--dng-600)' : 'var(--ok-700)'}">${brl(Number(b.orcado) - Number(b.realizado))}</td>
          <td><span class="bar-track" style="display:block"><i class="bar-fill ${over ? 'danger' : per > 80 ? 'warn' : 'ok'}" style="width:${Math.min(100, per).toFixed(0)}%"></i></span>
          <span class="xsmall muted">${per.toFixed(1)}%${over ? ' · orçamento ultrapassado' : ''}</span></td></tr>`;
      }).join('')}</tbody></table></div></div>
    <div class="card mt-2"><div class="card-head"><h3>Contas e saldos</h3></div>
      <div class="table-wrap"><table class="data responsive"><thead><tr><th>Conta</th><th>Banco</th><th>Tipo</th><th>Saldo inicial</th><th>Entradas</th><th>Saídas</th><th>Saldo</th><th>Ações</th></tr></thead><tbody>
      ${fd.accounts.accounts.map((a) => `<tr><td class="cell-main" data-label="Conta">${esc(a.name)}</td><td data-label="Banco">${esc(a.bank || '—')}</td>
        <td data-label="Tipo">${esc(a.account_type || '—')}</td><td class="num" data-label="Saldo inicial">${brl(a.initial_balance)}</td>
        <td class="num" data-label="Entradas">${brl(a.entradas)}</td><td class="num" data-label="Saídas">${brl(a.saidas)}</td>
        <td class="num" data-label="Saldo" style="font-weight:650;color:${a.saldo < 0 ? 'var(--dng-600)' : 'var(--ok-700)'}">${brl(a.saldo)}</td>
        <td class="actions" data-label="Ações"><button class="btn btn-xs btn-ghost" data-go="#/reconciliacao">Conciliar</button>
        <button class="btn btn-xs btn-soft" data-extrato="${a.id}">${icon('print')} Extrato</button></td></tr>`).join('')}
      </tbody></table></div></div>`;
  container.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', () => { location.hash = el.dataset.go; }));
  container.querySelectorAll('[data-extrato]').forEach((b) => b.addEventListener('click', () => {
    downloadUrl(`/api/accounts/${b.dataset.extrato}/statement?from=${addDaysStr(-90)}&to=${today()}`);
    toast('Extrato gerado', 'O PDF foi aberto em nova aba.', 'ok');
  }));
}

export async function ministryDashboard(container) {
  if (!can('celulas', 'view') && !can('ministerios', 'view')) return renderForbidden(container, 'painel ministerial');
  container.innerHTML = loadingBlock('Consolidando dados ministeriais…');
  const d = await api('/api/dashboard/ministry').catch((e) => { renderError(container, e); return null; });
  if (!d) return;
  const totalMembros = d.cells.reduce((s, c) => s + c.membros, 0);
  const media = d.cells.length ? (d.cells.reduce((s, c) => s + c.media_presenca, 0) / d.cells.length).toFixed(1) : 0;
  container.innerHTML = `
    <div class="page-head"><div><h2>Painel Ministerial</h2><p>Células, ministérios, EBD, voluntários, visitantes e frequência em um só lugar.</p></div>
      <div class="page-actions"><button class="btn btn-ghost" data-go="#/reunioes-de-celula">Registrar reunião</button></div></div>
    <div class="grid g-5">
      ${metricCard({ label: 'Células', value: num(d.cells.length), detail: `${num(totalMembros)} integrantes`, tone: 'brand', icon: 'layers' })}
      ${metricCard({ label: 'Média de presença', value: num(media), detail: 'por reunião de célula', tone: 'ok', icon: 'target' })}
      ${metricCard({ label: 'Sem relatório', value: num(d.cells.filter((c) => c.sem_relatorio).length), tone: 'warn', icon: 'alert' })}
      ${metricCard({ label: 'Ministérios', value: num(d.ministries.length), detail: `${num(d.ministries.reduce((s, m) => s + m.voluntarios, 0))} voluntários`, tone: 'neutral', icon: 'grid' })}
      ${metricCard({ label: 'Visitantes (30 dias)', value: num(d.visitors30), tone: 'brand', icon: 'heart', href: '#/visitantes' })}
    </div>
    <div class="card mt-2"><div class="card-head"><h3>Frequência consolidada — 90 dias</h3></div>
      <div class="card-body">${lineChart({ points: d.attendance.map((a) => a.presentes), labels: d.attendance.map((a) => dt(a.meeting_date).slice(0, 5)) })}</div></div>
    <div class="card mt-2"><div class="card-head"><h3>Painel das células</h3><span class="right small muted">${d.cells.length} célula(s)</span></div>
      <div class="table-wrap"><table class="data responsive"><thead><tr><th>Célula</th><th>Líder</th><th>Dia</th><th>Membros</th><th>Média presença</th><th>Visitantes</th><th>Última reunião</th><th>Relatório</th></tr></thead><tbody>
      ${d.cells.map((c) => `<tr><td class="cell-main" data-label="Célula">${esc(c.name)}<div class="cell-sub">${esc(c.code || '')}</div></td>
        <td data-label="Líder">${esc(c.lider || '—')}</td><td data-label="Dia">${esc(c.weekday || '—')} ${esc(c.meeting_time || '')}</td>
        <td class="num" data-label="Membros">${num(c.membros)}/${num(c.capacity)}</td><td class="num" data-label="Média presença">${num(c.media_presenca)}</td>
        <td class="num" data-label="Visitantes">${num(c.visitantes)}</td><td data-label="Última reunião">${dt(c.ultima_reuniao)}</td>
        <td data-label="Relatório">${c.sem_relatorio ? '<span class="badge warn">Pendente</span>' : '<span class="badge ok">Em dia</span>'}</td></tr>`).join('')}
      </tbody></table></div></div>
    <div class="grid g-2 mt-2">
      <div class="card"><div class="card-head"><h3>Ministérios</h3></div>
        <div class="table-wrap"><table class="data compact"><thead><tr><th>Ministério</th><th>Integrantes</th><th>Voluntários</th></tr></thead>
        <tbody>${d.ministries.map((m) => `<tr><td class="cell-main">${esc(m.name)}</td><td class="num">${num(m.integrantes)}</td><td class="num">${num(m.voluntarios)}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="card"><div class="card-head"><h3>Escola Bíblica Dominical</h3></div>
        <div class="table-wrap"><table class="data compact"><thead><tr><th>Classe</th><th>Professor</th><th>Alunos</th></tr></thead>
        <tbody>${d.ebd.map((c) => `<tr><td class="cell-main">${esc(c.classe)}</td><td>${esc(c.professor || '—')}</td><td class="num">${num(c.alunos)}</td></tr>`).join('')}</tbody></table></div></div>
    </div>`;
  container.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', () => { location.hash = el.dataset.go; }));
}

/* ========================================================== RELATÓRIOS */
const REPORTS = [
  { kind: 'membros', label: 'Membros', group: 'Pessoas', icon: 'users' },
  { kind: 'pessoas', label: 'Pessoas (visão geral)', group: 'Pessoas', icon: 'users' },
  { kind: 'visitantes', label: 'Visitantes', group: 'Pessoas', icon: 'heart' },
  { kind: 'familias', label: 'Famílias', group: 'Pessoas', icon: 'home' },
  { kind: 'aniversariantes', label: 'Aniversariantes do mês', group: 'Pessoas', icon: 'calendar' },
  { kind: 'crescimento', label: 'Crescimento da igreja', group: 'Pessoas', icon: 'chart' },
  { kind: 'celulas', label: 'Células', group: 'Células', icon: 'layers' },
  { kind: 'frequencia', label: 'Frequência', group: 'Células', icon: 'target' },
  { kind: 'financeiro', label: 'Receitas e despesas', group: 'Financeiro', icon: 'dollar' },
  { kind: 'dizimos', label: 'Dízimos', group: 'Financeiro', icon: 'dollar' },
  { kind: 'contas', label: 'Contas a pagar e receber', group: 'Financeiro', icon: 'clipboard' },
  { kind: 'fluxo', label: 'Fluxo de caixa', group: 'Financeiro', icon: 'chart' },
  { kind: 'orcamento', label: 'Orçamento x realizado', group: 'Financeiro', icon: 'scale' },
  { kind: 'centros_custo', label: 'Centros de custo', group: 'Financeiro', icon: 'grid' },
  { kind: 'fundos', label: 'Fundos', group: 'Financeiro', icon: 'wallet' },
  { kind: 'prestacao', label: 'Prestação de contas', group: 'Financeiro', icon: 'file' },
  { kind: 'ministerios', label: 'Ministérios', group: 'Ministérios', icon: 'grid' },
  { kind: 'patrimonio', label: 'Patrimônio', group: 'Operacional', icon: 'box' },
  { kind: 'manutencao', label: 'Manutenção', group: 'Operacional', icon: 'wrench' },
  { kind: 'eventos', label: 'Eventos', group: 'Operacional', icon: 'calendar' },
  { kind: 'pastoral', label: 'Pastoral (agregado)', group: 'Pastoral', icon: 'heart' },
];

export async function reportsPage(container, ctx) {
  const kind = ctx.query.kind || (ctx.params && ctx.params[0]) || '';
  const from = ctx.query.from || addDaysStr(-90);
  const to = ctx.query.to || today();
  const available = await api('/api/reports').then((r) => r.data).catch(() => []);
  const allowedKinds = new Set(available.map((a) => a.kind));
  const list = REPORTS.filter((r) => allowedKinds.has(r.kind));

  if (!kind) {
    container.innerHTML = `
      <div class="page-head"><div><h2>Relatórios</h2><p>Relatórios profissionais com filtros de período e exportação em CSV, PDF e impressão. A lista é filtrada conforme as permissões do seu perfil.</p></div></div>
      <div class="card"><div class="card-body">
        ${Object.entries(list.reduce((a, r) => (a[r.group] = a[r.group] || [], a[r.group].push(r), a), {})).map(([group, items]) => `
          <h3 class="small muted mb-1" style="text-transform:uppercase;letter-spacing:.08em">${esc(group)}</h3>
          <div class="grid g-auto mb-2">${items.map((r) => `<div class="metric clickable" data-go="#/relatorios?kind=${r.kind}">
            <div class="k">${icon(r.icon)} Relatório</div><div class="v sm" style="font-size:15px">${esc(r.label)}</div>
            <div class="d">Abrir com filtros e exportação</div></div>`).join('')}</div>`).join('')}
      </div></div>`;
    container.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', () => { location.hash = el.dataset.go; }));
    return;
  }

  container.innerHTML = loadingBlock('Gerando relatório…');
  let rep;
  try { rep = await api(`/api/reports/${kind}?from=${from}&to=${to}${kind === 'aniversariantes' ? '&month=' + (ctx.query.month || (new Date().getMonth() + 1)) : ''}`); }
  catch (e) { return renderError(container, e); }

  const extra = rep.extra ? `
    <div class="grid g-4 mt-2">
      ${metricCard({ label: 'Dízimos', value: brl(rep.extra.dizimos), tone: 'ok', icon: 'dollar' })}
      ${metricCard({ label: 'Ofertas', value: brl(rep.extra.ofertas), tone: 'ok', icon: 'dollar' })}
      ${metricCard({ label: 'Resultado do período', value: brl(rep.extra.resultado), tone: rep.extra.resultado >= 0 ? 'brand' : 'danger', icon: 'chart' })}
      ${metricCard({ label: 'Contas analisadas', value: num(rep.extra.contas.length), tone: 'neutral', icon: 'wallet' })}
    </div>
    <div class="grid g-3 mt-2">
      <div class="card"><div class="card-head"><h3>Saldo por conta</h3></div><div class="card-body">${hBars({ items: rep.extra.contas.map((c) => ({ label: c.nome, value: c.saldo })) })}</div></div>
      <div class="card"><div class="card-head"><h3>Saldo por fundo</h3></div><div class="card-body">${hBars({ items: rep.extra.fundos.map((c) => ({ label: c.nome, value: c.saldo })), toneFor: (r) => (r.value < 0 ? 'danger' : 'ok') })}</div></div>
      <div class="card"><div class="card-head"><h3>Despesas por centro de custo</h3></div><div class="card-body">${hBars({ items: rep.extra.centros.map((c) => ({ label: c.nome, value: c.despesas })) })}</div></div>
    </div>` : '';

  const exportQs = `?from=${from}&to=${to}&format=`;
  container.innerHTML = `
    <div class="page-head">
      <div><h2>${esc(rep.title)}</h2><p>${esc(rep.subtitle || `${num(rep.rows.length)} registro(s) no período selecionado`)}</p></div>
      <div class="page-actions">
        <button class="btn btn-ghost" data-go="#/relatorios">${icon('chevronLeft')} Todos os relatórios</button>
        <button class="btn btn-ghost" data-export="csv">${icon('download')} CSV</button>
        <button class="btn btn-ghost" data-print>${icon('print')} Imprimir</button>
        <button class="btn btn-primary" data-export="pdf">${icon('file')} PDF</button>
      </div>
    </div>
    <div class="card"><div class="toolbar">
      <div class="row tight"><label class="small muted">Período</label>
        <input type="date" class="input" style="width:auto" data-from value="${esc(from)}" />
        <span class="muted">até</span>
        <input type="date" class="input" style="width:auto" data-to value="${esc(to)}" />
        <button class="btn btn-sm btn-soft" data-apply>${icon('filter')} Aplicar</button>
      </div>
      ${kind === 'fluxo' ? `<div class="row tight right"><label class="small muted">Horizonte</label>
        <select class="input" style="width:auto" data-days>${[7, 15, 30, 60, 90, 180].map((d) => `<option value="${d}" ${Number(ctx.query.days) === d ? 'selected' : ''}>${d} dias</option>`).join('')}</select></div>` : ''}
      ${kind === 'aniversariantes' ? `<div class="row tight right"><label class="small muted">Mês</label>
        <select class="input" style="width:auto" data-month>${[...Array(12)].map((_, i) => `<option value="${i + 1}" ${Number(ctx.query.month) === i + 1 ? 'selected' : ''}>${new Date(2000, i).toLocaleDateString('pt-BR', { month: 'long' })}</option>`).join('')}</select></div>` : ''}
    </div>
    <div class="card-body"><div class="grid g-4">${(rep.summary || []).map((s) => metricCard({ label: s.label, value: typeof s.value === 'number' ? num(s.value) : s.value, tone: 'brand', icon: 'chart' })).join('')}</div>
    ${extra}</div>
    <div class="table-wrap mt-2"><table class="data responsive">
      <thead><tr>${rep.columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${rep.rows.length ? rep.rows.slice(0, 500).map((r) => `<tr>${rep.columns.map((c) => `<td data-label="${esc(c.label)}">${esc(c.value ? c.value(r) : r[c.key] ?? '—')}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${rep.columns.length}"><div class="empty">${icon('search')}<h4>Nenhum registro no período</h4><p>Ajuste as datas ou cadastre os dados correspondentes.</p></div></td></tr>`}</tbody>
    </table></div>
    <p class="small muted mt-1">${rep.rows.length > 500 ? `Exibindo os primeiros 500 registros de ${num(rep.rows.length)}. Use a exportação para o conjunto completo.` : `${num(rep.rows.length)} registro(s).`}</p>
    </div>`;

  const go = (extra2 = '') => {
    const f = container.querySelector('[data-from]').value, t = container.querySelector('[data-to]').value;
    location.hash = `#/relatorios?kind=${kind}&from=${f}&to=${t}${extra2}`;
  };
  container.querySelector('[data-apply]')?.addEventListener('click', () => go());
  container.querySelector('[data-days]')?.addEventListener('change', (e) => go(`&days=${e.target.value}`));
  container.querySelector('[data-month]')?.addEventListener('change', (e) => go(`&month=${e.target.value}`));
  container.querySelector('[data-print]')?.addEventListener('click', () => window.print());
  container.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => {
    downloadUrl(`/api/reports/${kind}${exportQs}${b.dataset.export}`);
    toast(`Exportação ${b.dataset.export.toUpperCase()}`, 'O arquivo está sendo gerado com os filtros aplicados.', 'ok');
  }));
  container.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', () => { location.hash = el.dataset.go; }));
}

/* ======================================================= FLUXO DE CAIXA */
export async function cashflowPage(container, ctx) {
  if (!can('financeiro', 'view')) return renderForbidden(container, 'fluxo de caixa');
  const days = Number(ctx.query.days) || 30;
  container.innerHTML = loadingBlock('Projetando fluxo de caixa…');
  try {
    const cf = await api(`/api/cashflow?days=${days}`);
    container.innerHTML = `
      <div class="page-head"><div><h2>Fluxo de Caixa</h2><p>Saldo atual somado aos recebimentos previstos e subtraídos os pagamentos comprometidos. O sistema apenas projeta e alerta — as decisões permanecem humanas.</p></div>
        <div class="page-actions">
          <select class="input" style="width:auto" data-days>${[7, 15, 30, 60, 90, 180].map((d) => `<option value="${d}" ${d === days ? 'selected' : ''}>${d} dias</option>`).join('')}</select>
          <button class="btn btn-ghost" data-print>${icon('print')} Imprimir</button>
          <button class="btn btn-primary" data-export>${icon('file')} PDF</button>
        </div></div>
      ${cf.negative ? `<div class="alert danger mb-2"><span class="ico">${icon('alert')}</span><div><h4>FLUXO DE CAIXA PROJETADO NEGATIVO</h4>
        <p>Projeção de ${brl(cf.saldo_projetado)} para os próximos ${days} dias. Recomenda-se revisar contas a pagar, antecipar recebíveis e avaliar campanhas. Nenhuma ação é executada automaticamente.</p></div></div>` : ''}
      <div class="grid g-4">
        ${metricCard({ label: 'Saldo atual', value: brl(cf.saldo_atual), tone: 'brand', icon: 'wallet' })}
        ${metricCard({ label: `A receber (${days}d)`, value: brl(cf.a_receber), tone: 'ok', icon: 'dollar' })}
        ${metricCard({ label: `A pagar (${days}d)`, value: brl(cf.a_pagar), detail: `${brl(cf.vencidas.valor)} já vencido (${cf.vencidas.quantidade})`, tone: 'warn', icon: 'clipboard' })}
        ${metricCard({ label: 'Saldo projetado', value: brl(cf.saldo_projetado), tone: cf.negative ? 'danger' : 'ok', icon: 'chart' })}
      </div>
      <div class="card mt-2"><div class="card-head"><h3>Projeção diária</h3></div>
        <div class="card-body">${lineChart({ points: cf.projection.map((p) => p.saldo_projetado), labels: cf.projection.map((p, i) => (i % Math.ceil(cf.projection.length / 8) === 0 ? dt(p.date).slice(0, 5) : '')) })}</div>
        <div class="table-wrap"><table class="data responsive"><thead><tr><th>Data</th><th>A receber</th><th>A pagar</th><th>Saldo projetado</th></tr></thead><tbody>
        ${cf.projection.map((p) => `<tr><td data-label="Data">${dt(p.date)}</td><td class="num" data-label="A receber">${p.receber ? brl(p.receber) : '—'}</td>
          <td class="num" data-label="A pagar">${p.pagar ? brl(p.pagar) : '—'}</td>
          <td class="num" data-label="Saldo projetado" style="font-weight:620;color:${p.saldo_projetado < 0 ? 'var(--dng-600)' : 'var(--ink-800)'}">${brl(p.saldo_projetado)}</td></tr>`).join('')}
        </tbody></table></div></div>`;
    container.querySelector('[data-days]').addEventListener('change', (e) => { location.hash = `#/fluxo-de-caixa?days=${e.target.value}`; });
    container.querySelector('[data-print]').addEventListener('click', () => window.print());
    container.querySelector('[data-export]').addEventListener('click', () => downloadUrl(`/api/reports/fluxo?days=${days}&format=pdf`));
  } catch (e) { renderError(container, e); }
}

/* ====================================================== TRANSFERÊNCIAS */
export async function transfersPage(container) {
  if (!can('financeiro', 'view')) return renderForbidden(container, 'transferências');
  container.innerHTML = loadingBlock('Carregando contas e transferências…');
  const [bal, list] = await Promise.all([api('/api/dashboard/finance?months=1'), api('/api/transactions?f_tx_type=transferencia&limit=40&sort=tx_date&order=desc')]);
  container.innerHTML = `
    <div class="page-head"><div><h2>Transferências entre contas</h2><p>Movimentação interna de recursos com verificação de saldo na conta de origem e lançamento automático no extrato de cada conta.</p></div></div>
    <div class="grid g-2">
      <div class="card"><div class="card-head"><h3>${icon('route')} Nova transferência</h3></div><div class="card-body">
        <form class="form-grid" data-form>
          <div class="field"><label>Conta de origem <span class="req">*</span></label><select class="select" name="account_id">${bal.accounts.accounts.map((a) => `<option value="${a.id}">${esc(a.name)} — ${brl(a.saldo)}</option>`).join('')}</select></div>
          <div class="field"><label>Conta de destino <span class="req">*</span></label><select class="select" name="dest_account_id">${bal.accounts.accounts.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Valor <span class="req">*</span></label><input class="input num" type="number" step="0.01" min="0.01" name="value" placeholder="0,00" /></div>
          <div class="field"><label>Data</label><input class="input" type="date" name="tx_date" value="${today()}" /></div>
          <div class="field full"><label>Descrição</label><input class="input" name="description" placeholder="Ex.: reforço de caixa para o evento" /></div>
        </form>
        <div class="row mt-2"><button class="btn btn-primary" data-save>${icon('check')} Registrar transferência</button></div>
        <div class="note mt-2">O sistema recusa transferências sem saldo suficiente na origem e registra tudo na auditoria. Registros financeiros não são apagados — apenas cancelados.</div>
      </div></div>
      <div class="card"><div class="card-head"><h3>Saldos disponíveis</h3></div>
        <div class="table-wrap"><table class="data compact"><thead><tr><th>Conta</th><th>Saldo</th></tr></thead><tbody>
        ${bal.accounts.accounts.map((a) => `<tr><td class="cell-main">${esc(a.name)}</td><td class="num" style="font-weight:620;color:${a.saldo < 0 ? 'var(--dng-600)' : 'var(--ok-700)'}">${brl(a.saldo)}</td></tr>`).join('')}</tbody></table></div>
        <div class="card-foot" style="padding:12px 14px;border-top:1px solid var(--border)"><b>Total: ${brl(bal.accounts.total)}</b></div></div>
    </div>
    <div class="card mt-2"><div class="card-head"><h3>Últimas transferências</h3></div>
      <div class="table-wrap"><table class="data responsive"><thead><tr><th>Data</th><th>Descrição</th><th>Origem</th><th>Destino</th><th>Valor</th></tr></thead><tbody>
      ${list.data.length ? list.data.map((t) => `<tr><td data-label="Data">${dt(t.tx_date)}</td><td data-label="Descrição">${esc(t.description || '—')}</td>
        <td data-label="Origem">${esc(t.account_nome || '—')}</td><td data-label="Destino">${esc(t.dest_account_nome || '—')}</td>
        <td class="num" data-label="Valor">${brl(t.value)}</td></tr>`).join('')
        : '<tr><td colspan="5"><div class="empty"><p>Nenhuma transferência registrada.</p></div></td></tr>'}
      </tbody></table></div></div>`;
  container.querySelector('[data-save]').addEventListener('click', async () => {
    const f = container.querySelector('form');
    const body = Object.fromEntries(['account_id', 'dest_account_id', 'value', 'tx_date', 'description'].map((k) => [k, f.elements[k].value]));
    try {
      const r = await api('/api/transfers', { method: 'POST', body });
      toast('Transferência registrada', r.message, 'ok');
      transfersPage(container);
    } catch (e) { toast('Transferência não realizada', e.message, 'err'); }
  });
}

/* ======================================================== CONCILIAÇÃO */
export async function reconciliationPage(container, ctx) {
  if (!can('financeiro', 'view')) return renderForbidden(container, 'conciliação bancária');
  const from = ctx.query.from || '', to = ctx.query.to || '';
  container.innerHTML = loadingBlock('Carregando movimentações…');
  const rec = await api(`/api/reconciliation${qs({ from, to })}`).catch((e) => { renderError(container, e); return null; });
  if (!rec) return;
  container.innerHTML = `
    <div class="page-head"><div><h2>Conciliação Bancária</h2><p>Compare o saldo contábil calculado pelo sistema com os movimentos de cada conta. Diferenças indicam lançamento faltante ou valor divergente — a correção é sempre manual e auditada.</p></div>
      <div class="page-actions"><input type="date" class="input" style="width:auto" value="${esc(from)}" data-from />
        <input type="date" class="input" style="width:auto" value="${esc(to)}" data-to />
        <button class="btn btn-primary" data-apply>${icon('filter')} Aplicar</button></div></div>
    <div class="grid g-4">
      ${metricCard({ label: 'Contas analisadas', value: num(rec.data.length), tone: 'brand', icon: 'bank' })}
      ${metricCard({ label: 'Saldo contábil total', value: brl(rec.total_saldo), tone: rec.total_saldo >= 0 ? 'ok' : 'danger', icon: 'wallet' })}
      ${metricCard({ label: 'Movimentos listados', value: num(rec.data.reduce((s, d) => s + d.movimentos.length, 0)), tone: 'neutral', icon: 'history' })}
      ${metricCard({ label: 'Período', value: from || to ? `${dt(from) || '—'} a ${dt(to) || '—'}` : 'Completo', tone: 'neutral', icon: 'calendar' })}
    </div>
    <div class="stack mt-2">${rec.data.map((d) => `
      <div class="card"><div class="card-head">
        <h3>${esc(d.account.name)}</h3><span class="badge neutral">${esc(d.account.bank || '—')}</span>
        ${badgeFor('bank_accounts', 'status', d.account.status)}
        <span class="right small"><b class="mono">${brl(d.saldo_contabil)}</b> saldo contábil</span></div>
        <div class="table-wrap"><table class="data compact responsive"><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Forma</th><th>Documento</th><th>Valor</th></tr></thead><tbody>
        ${d.movimentos.length ? d.movimentos.map((m) => `<tr><td data-label="Data">${dt(m.tx_date)}</td><td data-label="Tipo">${badgeFor('transactions', 'tx_type', m.tx_type)}</td>
          <td data-label="Descrição">${esc(m.description || '—')}${m.destino ? ` <span class="xsmall muted">→ ${esc(m.destino)}</span>` : ''}</td>
          <td data-label="Forma">${esc(m.payment_method || '—')}</td><td data-label="Documento">${esc(m.document || '—')}</td>
          <td class="num" data-label="Valor">${brl(m.value)}</td></tr>`).join('') : `<tr><td colspan="6"><div class="empty"><p>Nenhum movimento nesta conta no período.</p></div></td></tr>`}
        </tbody></table></div>
        <div class="row small muted" style="padding:10px 14px;border-top:1px solid var(--border);gap:18px">
          <span>Entradas: <b>${brl(d.entradas)}</b></span><span>Saídas: <b>${brl(d.saidas)}</b></span>
          <span>Transf. enviadas: <b>${brl(d.transferOut)}</b></span><span>Transf. recebidas: <b>${brl(d.transferIn)}</b></span>
        </div></div>`).join('')}</div>`;
  container.querySelector('[data-apply]').addEventListener('click', () => {
    location.hash = `#/reconciliacao?from=${container.querySelector('[data-from]').value}&to=${container.querySelector('[data-to]').value}`;
  });
}

/* ========================================================== AGENDA */
export async function agendaPage(container, ctx) {
  const cats = ['culto', 'celula', 'reuniao', 'evento', 'pastoral', 'administrativo', 'financeiro', 'ministerio'];
  const view = ctx.query.view || 'lista';
  const from = ctx.query.from || addDaysStr(-7);
  const to = ctx.query.to || addDaysStr(30);
  const selected = (ctx.query.categories || '').split(',').filter(Boolean);
  container.innerHTML = loadingBlock('Carregando agenda…');
  const a = await api(`/api/agenda${qs({ from, to, categories: selected.join(',') })}`).catch((e) => { renderError(container, e); return null; });
  if (!a) return;

  let bodyHtml = '';
  if (view === 'mensal') {
    const first = new Date(from + 'T12:00:00');
    const start = new Date(first.getFullYear(), first.getMonth(), 1);
    const gridStart = new Date(start); gridStart.setDate(1 - ((start.getDay() + 6) % 7));
    let cells2 = '';
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart); d.setDate(gridStart.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const inMonth = d.getMonth() === start.getMonth();
      const dayItems = a.data.filter((x) => String(x.start).slice(0, 10) === iso);
      cells2 += `<div style="min-height:104px;border:1px solid var(--border);border-radius:var(--r-sm);padding:6px;background:${inMonth ? 'var(--surface)' : 'var(--ink-50)'}">
        <div class="xsmall ${inMonth ? '' : 'muted'}" style="font-weight:700">${d.getDate()}</div>
        ${dayItems.slice(0, 3).map((it) => `<div class="xsmall trunc" style="margin-top:3px;padding:2px 5px;border-radius:5px;background:var(--brand-50);color:var(--brand-700)" title="${esc(it.title)}">${esc(it.title)}</div>`).join('')}
        ${dayItems.length > 3 ? `<div class="xsmall muted">+${dayItems.length - 3}</div>` : ''}</div>`;
    }
    bodyHtml = `<div class="card-body"><div class="grid" style="grid-template-columns:repeat(7,1fr);gap:6px">
      ${['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => `<div class="xsmall muted center" style="font-weight:700;text-transform:uppercase">${d}</div>`).join('')}
      ${cells2}</div></div>`;
  } else {
    const byDay = a.data.reduce((acc, it) => { const k = String(it.start).slice(0, 10); (acc[k] = acc[k] || []).push(it); return acc; }, {});
    bodyHtml = Object.keys(byDay).sort().length ? Object.entries(byDay).sort().map(([day, items]) => `
      <div class="card mb-2"><div class="card-head"><h3>${dt(day)} <span class="small muted">${new Date(day + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' })}</span></h3>
        <span class="right badge plain neutral">${items.length} compromisso(s)</span></div>
        <div class="card-body stack" style="gap:8px">
        ${items.map((it) => `<div class="row" style="gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--r-sm)">
          <span class="badge ${it.category === 'culto' ? 'brand' : it.category === 'evento' ? 'info' : 'neutral'}">${esc(enumLabel('calendar_events', 'category', it.category))}</span>
          <b style="font-size:13.5px">${esc(it.title)}</b>
          <span class="small muted">${esc(String(it.start).slice(11, 16))}${it.end ? ' – ' + esc(String(it.end).slice(11, 16)) : ''} · ${esc(it.location || 'local não informado')}</span>
          ${it.source === 'evento' ? `<a class="right small" href="#/eventos">Ver evento</a>` : ''}</div>`).join('')}
        </div></div>`).join('') : `<div class="card"><div class="empty">${icon('calendar')}<h4>Nenhum compromisso no período</h4><p>Ajuste o intervalo de datas ou cadastre compromissos na Agenda.</p></div></div>`;
  }

  container.innerHTML = `
    <div class="page-head"><div><h2>Agenda</h2><p>Cultos, células, reuniões, eventos, compromissos pastorais, administrativos e financeiros em um único calendário.</p></div>
      <div class="page-actions">
        <select class="input" style="width:auto" data-view>
          ${[['lista', 'Lista'], ['mensal', 'Mensal']].map(([v, l]) => `<option value="${v}" ${view === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <button class="btn btn-ghost" data-print>${icon('print')} Imprimir</button>
        <button class="btn btn-primary" data-new-cat>${icon('plus')} Novo compromisso</button>
      </div></div>
    <div class="card"><div class="toolbar">
      <label class="small muted">De</label><input type="date" class="input" style="width:auto" value="${esc(from)}" data-from />
      <label class="small muted">até</label><input type="date" class="input" style="width:auto" value="${esc(to)}" data-to />
      <button class="btn btn-sm btn-soft" data-apply>${icon('filter')} Aplicar</button>
      <div class="row tight right">${cats.map((c) => `<label class="check xsmall"><input type="checkbox" data-cat="${c}" ${selected.includes(c) ? 'checked' : ''}/> ${esc(enumLabel('calendar_events', 'category', c))}</label>`).join('')}</div>
    </div></div>
    <div class="mt-2">${bodyHtml}</div>`;

  const apply = () => {
    const sel = [...container.querySelectorAll('[data-cat]:checked')].map((c) => c.dataset.cat).join(',');
    location.hash = `#/agenda?view=${view}&from=${container.querySelector('[data-from]').value}&to=${container.querySelector('[data-to]').value}${sel ? '&categories=' + sel : ''}`;
  };
  container.querySelector('[data-apply]').addEventListener('click', apply);
  container.querySelector('[data-view]').addEventListener('change', (e) => { location.hash = `#/agenda?view=${e.target.value}&from=${from}&to=${to}`; });
  container.querySelectorAll('[data-cat]').forEach((c) => c.addEventListener('change', apply));
  container.querySelector('[data-print]').addEventListener('click', () => window.print());
  container.querySelector('[data-new-cat]').addEventListener('click', () => editRecord('calendar_events', state.meta.calendar_events, null, () => agendaPage(container, ctx)));
}

/* ====================================================== ASSISTENTE IA */
export async function aiPage(container, ctx) {
  if (!can('inteligencia', 'view')) return renderForbidden(container, 'assistente de inteligência');
  const history = (ctx.session ||= { messages: [] });
  const suggestions = [
    'Como está a situação financeira deste mês?', 'Quais contas estão vencidas?', 'Quais células não enviaram relatório?',
    'Quantos membros ativos temos?', 'Quantos visitantes tivemos este mês?', 'Quais eventos teremos esta semana?',
    'Quanto gastamos com manutenção?', 'Compare os dois últimos meses.',
  ];
  container.innerHTML = `
    <div class="page-head"><div><h2>Assistente IA da Igreja</h2>
      <p>Consulte os dados reais do sistema em linguagem natural. O assistente consulta <b>somente</b> o que seu perfil permite visualizar, nunca inventa informações, não altera registros e responde claramente quando os dados não existem.</p></div></div>
    <div class="grid g-2" style="align-items:start">
      <div class="card"><div class="card-head"><h3>${icon('sparkles')} Conversa</h3><span class="right badge brand">dados em tempo real</span></div>
        <div class="card-body"><div class="stack" data-log style="max-height:58vh;overflow-y:auto"></div>
          <div class="row mt-2"><input class="input" data-q placeholder="Pergunte, por exemplo: quais contas estão vencidas?" />
          <button class="btn btn-primary" data-send>${icon('sparkles')} Perguntar</button></div>
          <div class="suggest mt-2">${suggestions.map((s) => `<button data-suggest="${esc(s)}">${esc(s)}</button>`).join('')}</div>
        </div></div>
      <div class="stack">
        <div class="card"><div class="card-head"><h3>${icon('shield')} Regras de acesso e segurança</h3></div>
          <div class="card-body"><ul class="stack" style="gap:8px;font-size:12.5px;padding-left:16px;margin:0">
            <li>O assistente responde apenas com dados existentes no banco — se não houver registro, ele informa que faltam informações.</li>
            <li>As consultas respeitam as permissões do seu perfil (financeiro, pastoral, células, patrimônio).</li>
            <li>O assistente <b>não</b> cria, altera, exclui registros, não libera permissões e não toma decisões administrativas.</li>
            <li>Todas as perguntas ficam registradas na auditoria com o escopo consultado.</li>
          </ul></div></div>
        <div class="card"><div class="card-head"><h3>${icon('chart')} Indicadores rápidos</h3></div>
          <div class="card-body" data-ind>${loadingBlock('Carregando indicadores…')}</div></div>
      </div>
    </div>`;

  const log = container.querySelector('[data-log]');
  const draw = () => {
    log.innerHTML = history.messages.length ? history.messages.map((m) => m.role === 'user'
      ? `<div class="ai-msg me"><div class="avatar sm">${esc(initials(state.user.name))}</div><div class="bubble"><p>${esc(m.text)}</p></div></div>`
      : `<div class="ai-msg"><div class="avatar sm" style="background:linear-gradient(135deg,#0EA5E9,#4F46E5)">IA</div><div class="bubble">
          <p>${esc(m.text)}</p>
          ${m.badge ? `<div class="data">${m.badge}</div>` : ''}
          ${m.scope === 'permission_denied' ? '<div class="note mt-2">Consulta bloqueada por permissão. Solicite acesso ao administrador se necessário.</div>' : ''}
          ${m.scope === 'unknown' ? '<div class="note mt-2">O assistente não completa lacunas com estimativas: os dados precisam ser registrados no sistema.</div>' : ''}
        </div></div>`).join('')
      : `<div class="empty">${icon('sparkles')}<h4>Faça a primeira pergunta</h4><p>O assistente responde com números consolidados do seu sistema, respeitando seu nível de acesso.</p></div>`;
    log.scrollTop = log.scrollHeight;
  };
  draw();

  const ask = async (question) => {
    if (!question.trim()) return;
    history.messages.push({ role: 'user', text: question });
    draw();
    const qEl = container.querySelector('[data-q]');
    qEl.value = '';
    try {
      const r = await api('/api/ai/ask', { method: 'POST', body: { question } });
      history.messages.push({ role: 'ai', text: r.answer, scope: r.scope, badge: aiDataBadge(r) });
    } catch (e) {
      history.messages.push({ role: 'ai', text: 'Não foi possível consultar agora. ' + e.message, scope: 'error' });
    }
    draw();
  };
  container.querySelector('[data-send]').addEventListener('click', () => ask(container.querySelector('[data-q]').value));
  container.querySelector('[data-q]').addEventListener('keydown', (e) => { if (e.key === 'Enter') ask(e.target.value); });
  container.querySelectorAll('[data-suggest]').forEach((b) => b.addEventListener('click', () => ask(b.dataset.suggest)));

  api('/api/indicators').then((i) => {
    container.querySelector('[data-ind]').innerHTML = `<div class="grid g-2" style="gap:10px">
      ${[['Pessoas', num(i.pessoas)], ['Células', num(i.celulas)], ['Frequência', i.frequencia + '%'], ['Visitantes no mês', num(i.visitantes_mes)],
        ['Saldo', i.saldo === null ? 'sem acesso' : brl(i.saldo)], ['A pagar', i.a_pagar === null ? 'sem acesso' : brl(i.a_pagar)],
        ['A receber', i.a_receber === null ? 'sem acesso' : brl(i.a_receber)], ['Pendências', num(i.pendencias)]]
        .map(([k, v]) => `<div class="metric" style="padding:10px 11px"><div class="k">${esc(k)}</div><div class="v sm">${esc(v)}</div></div>`).join('')}</div>`;
  }).catch(() => { container.querySelector('[data-ind]').innerHTML = '<div class="note">Indicadores indisponíveis.</div>'; });
}

function aiDataBadge(r) {
  if (!r.data) return '';
  if (r.scope === 'financeiro' && r.data.mes) return `<span class="tag">Entradas ${brl(r.data.mes.entradas)} · Saídas ${brl(r.data.mes.saidas)}</span>`;
  if (r.scope === 'pessoas' && r.data.total) return `<span class="tag">${num(r.data.total)} pessoas · ${num(r.data.ativos)} ativos · ${num(r.data.familias)} famílias</span>`;
  if (r.scope === 'celulas' && r.data.total !== undefined) return `<span class="tag">${num(r.data.total)} células · ${num(r.data.membros)} integrantes</span>`;
  if (r.scope === 'visitantes') return `<span class="tag">${num(r.data.total)} visitantes · ${num(r.data.mes)} no mês</span>`;
  if (Array.isArray(r.data.rows)) return `<span class="tag">${r.data.rows.length} registro(s) encontrados</span>`;
  return '';
}

/* ======================================================= PORTAL DO MEMBRO */
export async function portalPage(container) {
  container.innerHTML = loadingBlock('Carregando seu portal…');
  const d = await api('/api/portal/me').catch((e) => { renderError(container, e); return null; });
  if (!d) return;
  if (!d.person) {
    return renderSoon(container, 'Portal do Membro',
      d.message || 'Seu usuário ainda não está vinculado a um cadastro de pessoa. Procure a secretaria para vincular seu perfil.');
  }
  const p = d.person;
  container.innerHTML = `
    <div class="page-head"><div><h2>Olá, ${esc(String(p.full_name).split(' ')[0])}</h2>
      <p>Seu portal na igreja: dados pessoais, família, célula, ministérios, escalas, eventos, avisos, pedidos de oração e suas contribuições (quando autorizado).</p></div>
      ${badgeFor('people', 'status', p.status)}</div>
    <div class="grid g-2" style="align-items:start">
      <div class="stack">
        <div class="card"><div class="card-head"><h3>${icon('user')} Meus dados</h3></div><div class="card-body">
          <dl class="kv">
            <dt>Nome</dt><dd>${esc(p.full_name)}</dd>
            <dt>Telefone</dt><dd>${esc(p.phone || '—')}</dd>
            <dt>WhatsApp</dt><dd>${esc(p.whatsapp || '—')}</dd>
            <dt>E-mail</dt><dd>${esc(p.email || '—')}</dd>
            <dt>Nascimento</dt><dd>${dt(p.birth_date)}</dd>
            <dt>Endereço</dt><dd>${esc([p.address, p.district, p.city, p.state].filter(Boolean).join(', ') || '—')}</dd>
            <dt>Ingresso</dt><dd>${dt(p.join_date)}</dd>
            <dt>Batismo</dt><dd>${dt(p.baptism_date)}</dd>
          </dl>
          <div class="note mt-2">Para alterar seus dados, solicite à secretaria — as mudanças ficam registradas na auditoria do sistema (LGPD).</div>
        </div></div>
        <div class="card"><div class="card-head"><h3>${icon('home')} Minha família</h3></div><div class="card-body">
          ${d.familia.length ? d.familia.map((f) => `<div class="row"><b>${esc(f.name)}</b><span class="right badge neutral">${esc(f.role || 'integrante')}</span></div>`).join('') : '<p class="muted small">Nenhuma família vinculada ao seu cadastro.</p>'}
          ${d.celulas.length ? `<hr class="hr"/><h4 class="small muted mb-1">MINHA CÉLULA</h4>${d.celulas.map((c) => `<div class="row"><b>${esc(c.name)}</b><span class="small muted">${esc(c.weekday || '')} ${esc(c.meeting_time || '')} · líder: ${esc(c.lider || '—')}</span></div>`).join('')}` : ''}
          ${d.ministerios.length ? `<hr class="hr"/><h4 class="small muted mb-1">MEUS MINISTÉRIOS</h4><div class="row tight">${d.ministerios.map((m) => `<span class="tag">${esc(m.name)} · ${esc(m.role || 'integrante')}</span>`).join('')}</div>` : ''}
        </div></div>
      </div>
      <div class="stack">
        <div class="card"><div class="card-head"><h3>${icon('clipboard')} Minhas escalas</h3></div><div class="card-body">
          ${d.escalas.length ? d.escalas.map((s) => `<div class="row" style="padding:8px 0;border-bottom:1px dashed var(--border)">
            <div><b>${esc(s.function_name)}</b><div class="cell-sub">${dt(s.schedule_date)} ${esc(s.schedule_time || '')}</div></div>
            <div class="right row tight">${badgeFor('schedules', 'status', s.status)}
            ${s.status === 'pendente' ? `<button class="btn btn-xs btn-primary" data-confirm="${s.id}">Confirmar</button>
            <button class="btn btn-xs btn-ghost" data-decline="${s.id}">Recusar</button>
            <button class="btn btn-xs btn-ghost" data-sub="${s.id}">Pedir substituição</button>` : ''}</div></div>`).join('')
            : '<p class="muted small">Você não possui escalas futuras.</p>'}
        </div></div>
        <div class="card"><div class="card-head"><h3>${icon('calendar')} Eventos e inscrições</h3></div><div class="card-body">
          ${d.eventos.length ? d.eventos.map((e) => `<div class="row" style="padding:8px 0;border-bottom:1px dashed var(--border)">
            <div><b>${esc(e.name)}</b><div class="cell-sub">${dt(e.event_date)} · ${esc(e.location || '—')}</div></div>
            <div class="right row tight">${badgeFor('event_registrations', 'status', e.status)}
            ${e.qr_code ? `<button class="btn btn-xs btn-soft" data-qr="${esc(e.qr_code)}">${icon('qr')} QR Code</button>` : ''}</div></div>`).join('')
            : '<p class="muted small">Nenhuma inscrição ativa.</p>'}
        </div></div>
        <div class="card"><div class="card-head"><h3>${icon('heart')} Pedidos de oração</h3></div><div class="card-body">
          <form data-prayer><textarea class="textarea" name="request" placeholder="Escreva seu pedido de oração. Ele será visto apenas pela equipe pastoral."></textarea>
            <div class="row mt-1"><select class="input" name="category" style="width:auto">
              <option value="geral">Geral</option><option value="saude">Saúde</option><option value="familia">Família</option>
              <option value="financeiro">Financeiro</option><option value="espiritual">Espiritual</option><option value="trabalho">Trabalho</option></select>
              <label class="check small"><input type="checkbox" name="is_public" /> Permitir no mural público</label>
              <button class="btn btn-primary right" type="submit">${icon('upload')} Enviar</button></div></form>
          <div class="mt-2">${d.oracoes.length ? d.oracoes.map((o) => `<div class="row small" style="padding:6px 0;border-bottom:1px dashed var(--border)"><span class="trunc">${esc(o.request)}</span><span class="right">${badgeFor('prayer_requests', 'status', o.status)}</span></div>`).join('') : '<p class="muted small">Você ainda não registrou pedidos.</p>'}</div>
        </div></div>
        ${d.contribuicoes ? `<div class="card"><div class="card-head"><h3>${icon('dollar')} Minhas contribuições</h3><span class="right badge brand">acesso autorizado</span></div>
          <div class="card-body">${d.contribuicoes.length ? `<div class="table-wrap"><table class="data compact"><thead><tr><th>Data</th><th>Categoria</th><th>Forma</th><th>Valor</th></tr></thead>
          <tbody>${d.contribuicoes.map((c) => `<tr><td>${dt(c.tx_date)}</td><td>${esc(c.categoria || '—')}</td><td>${esc(c.payment_method || '—')}</td><td class="num">${brl(c.value)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">Nenhuma contribuição registrada em seu nome.</p>'}
          <div class="note mt-2">Seus dados financeiros pessoais são confidenciais. Não há ranking público de dizimistas, conforme a política de privacidade do sistema.</div></div></div>` : ''}
        <div class="card"><div class="card-head"><h3>${icon('megaphone')} Avisos da igreja</h3></div><div class="card-body">
          ${d.avisos.length ? d.avisos.map((a) => `<div style="padding:8px 0;border-bottom:1px dashed var(--border)"><b style="font-size:13px">${esc(a.title)}</b><div class="small soft">${esc(a.body || '')}</div><div class="xsmall muted">${dt(a.publish_at)}</div></div>`).join('') : '<p class="muted small">Nenhum aviso publicado.</p>'}
        </div></div>
      </div>
    </div>`;

  container.querySelector('[data-prayer]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      const r = await api('/api/portal/prayer', { method: 'POST', body: { request: f.elements.request.value, category: f.elements.category.value, is_public: f.elements.is_public.checked } });
      toast('Pedido registrado', r.message, 'ok');
      portalPage(container);
    } catch (err) { toast('Não foi possível registrar', err.message, 'err'); }
  });
  container.querySelectorAll('[data-confirm],[data-decline],[data-sub]').forEach((b) => b.addEventListener('click', async () => {
    const status = b.dataset.confirm ? 'confirmado' : b.dataset.decline ? 'recusado' : 'substituicao_solicitada';
    const id = b.dataset.confirm || b.dataset.decline || b.dataset.sub;
    try { const r = await api(`/api/portal/schedules/${id}/respond`, { method: 'POST', body: { status } }); toast('Escala atualizada', r.message, 'ok'); portalPage(container); }
    catch (e) { toast('Não foi possível responder', e.message, 'err'); }
  }));
  container.querySelectorAll('[data-qr]').forEach((b) => b.addEventListener('click', () => {
    modal({ title: 'QR Code de entrada', size: 'narrow', body: `<div class="center"><div class="qr-box"><img alt="QR Code" src="${apiUrl('/api/qr?text=${encodeURIComponent(b.dataset.qr)}&scale=6')}" style="width:190px;height:190px"/></div>
      <p class="small muted mt-2">Apresente este código na entrada do evento. Código: <b class="mono">${esc(b.dataset.qr)}</b></p></div>` });
  }));
}

/* ============================================ CHECK-IN / MINISTÉRIO INFANTIL */
export async function checkinPage(container) {
  if (!can('infantil', 'view')) return renderForbidden(container, 'ministério infantil');
  container.innerHTML = loadingBlock('Carregando ministério infantil…');
  const [kids, open] = await Promise.all([
    api('/api/children?limit=100'),
    api('/api/child_checkins?limit=60&sort=checkin_at&order=desc'),
  ]).catch((e) => { renderError(container, e); return []; });
  if (!kids || !open) return;
  const openOnes = open.data.filter((c) => !c.checkout_at);
  const canWrite = can('infantil', 'create');

  container.innerHTML = `
    <div class="page-head"><div><h2>Ministério Infantil — Check-in e Check-out</h2>
      <p>Cada criança recebe um código único de retirada. Somente o responsável autorizado pode retirar a criança, e todas as entradas e saídas ficam registradas com data, hora e responsável. Os dados infantis são tratados com proteção reforçada.</p></div>
      <div class="page-actions"><span class="badge ${openOnes.length ? 'warn' : 'ok'}">${openOnes.length} criança(s) no recinto</span></div></div>
    <div class="grid g-2" style="align-items:start">
      <div class="card"><div class="card-head"><h3>${icon('scan')} Registrar entrada</h3></div><div class="card-body">
        ${canWrite ? `<form data-checkin class="form-grid">
          <div class="field full"><label>Criança <span class="req">*</span></label>
            <select class="select" name="child_id" required>${kids.data.map((k) => `<option value="${k.id}">${esc(k.person_nome || `#${k.person_id}`)} — ${esc(k.class_name || 'sem turma')}${k.guardian_nome ? ' · resp.: ' + esc(k.guardian_nome) : ''}</option>`).join('')}</select></div>
          <div class="field"><label>Recebido por</label><input class="input" name="checked_in_by" value="${esc(state.user.name)}" /></div>
          <div class="field" style="justify-content:flex-end"><button class="btn btn-primary" type="submit">${icon('check')} Fazer check-in</button></div>
        </form>` : '<div class="note">Seu perfil não possui permissão para registrar check-in.</div>'}
        <div data-checkin-result class="mt-2"></div>
      </div></div>
      <div class="card"><div class="card-head"><h3>${icon('users')} Crianças cadastradas</h3><span class="right small muted">${kids.meta.total}</span></div>
        <div class="table-wrap"><table class="data compact responsive"><thead><tr><th>Criança</th><th>Turma</th><th>Responsável legal</th><th>Alergias</th></tr></thead><tbody>
        ${kids.data.slice(0, 40).map((k) => `<tr><td class="cell-main" data-label="Criança">${esc(k.person_nome || `#${k.person_id}`)}</td>
          <td data-label="Turma">${esc(k.class_name || '—')}</td><td data-label="Responsável legal">${esc(k.guardian_nome || '—')}</td>
          <td data-label="Alergias">${k.allergies ? `<span class="badge danger">${esc(k.allergies)}</span>` : '<span class="muted">—</span>'}</td></tr>`).join('')}
        </tbody></table></div></div>
    </div>
    <div class="card mt-2"><div class="card-head"><h3>${icon('history')} Registros de entrada e saída</h3></div>
      <div class="table-wrap"><table class="data responsive"><thead><tr><th>Código</th><th>Criança</th><th>Entrada</th><th>Saída</th><th>Retirado por</th><th>Ações</th></tr></thead><tbody>
      ${open.data.length ? open.data.map((c) => `<tr><td class="mono" data-label="Código">${esc(c.code)}</td><td data-label="Criança">${esc(c.child_nome || `#${c.child_id}`)}</td>
        <td data-label="Entrada">${dtTime(c.checkin_at)}</td><td data-label="Saída">${c.checkout_at ? dtTime(c.checkout_at) : '<span class="badge warn">No recinto</span>'}</td>
        <td data-label="Retirado por">${esc(c.released_to || '—')}</td>
        <td class="actions" data-label="Ações">
          <button class="btn btn-xs btn-ghost" data-qrcode="${esc(c.code)}">${icon('qr')} QR</button>
          ${!c.checkout_at && can('infantil', 'edit') ? `<button class="btn btn-xs btn-primary" data-checkout="${c.id}">Check-out</button>` : ''}
        </td></tr>`).join('') : '<tr><td colspan="6"><div class="empty"><p>Nenhum check-in registrado ainda.</p></div></td></tr>'}
      </tbody></table></div></div>`;

  container.querySelector('[data-checkin]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      const r = await api('/api/checkins', { method: 'POST', body: { child_id: f.elements.child_id.value, checked_in_by: f.elements.checked_in_by.value } });
      container.querySelector('[data-checkin-result]').innerHTML = `
        <div class="card" style="border-color:var(--ok-500)"><div class="card-body center">
          <div class="qr-box"><img alt="QR Code de retirada" src="${apiUrl('/api/qr?text=${encodeURIComponent(r.code)}&scale=6')}" style="width:180px;height:180px"/></div>
          <h3 class="mt-2">${esc(r.code)}</h3>
          <p class="small muted">Entregue este código ao responsável. A retirada só é liberada com o responsável autorizado identificado.</p>
        </div></div>`;
      toast('Check-in realizado', `Código de retirada ${r.code}.`, 'ok');
      setTimeout(() => checkinPage(container), 2600);
    } catch (err) { toast('Check-in não realizado', err.message, 'err'); }
  });
  container.querySelectorAll('[data-checkout]').forEach((b) => b.addEventListener('click', () => {
    const m = modal({
      title: 'Registrar saída da criança', size: 'narrow',
      body: `<div class="field"><label>Responsável autorizado que retirou <span class="req">*</span></label>
        <input class="input" data-name placeholder="Nome completo e documento (ex.: Maria Silva — RG 12.345.678-9)" />
        <span class="hint">Conforme a política de proteção infantil, a saída só é liberada para pessoas cadastradas como autorizadas.</span></div>`,
      footer: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Confirmar saída</button>`,
      onMount(el, close) {
        el.querySelector('[data-ok]').addEventListener('click', async () => {
          const val = el.querySelector('[data-name]').value.trim();
          if (val.length < 5) return toast('Informe o responsável', 'Nome e documento do responsável autorizado são obrigatórios.', 'err');
          try {
            const r = await api(`/api/checkins/${b.dataset.checkout}/checkout`, { method: 'POST', body: { released_to: val } });
            toast('Saída registrada', r.message, 'ok'); close(); checkinPage(container);
          } catch (e) { toast('Não foi possível registrar', e.message, 'err'); }
        });
      },
    });
  }));
  container.querySelectorAll('[data-qrcode]').forEach((b) => b.addEventListener('click', () => {
    modal({ title: 'Código de retirada', size: 'narrow', body: `<div class="center"><div class="qr-box"><img alt="QR Code" src="${apiUrl('/api/qr?text=${encodeURIComponent(b.dataset.qrcode)}&scale=6')}" style="width:180px;height:180px"/></div>
      <h3 class="mt-2 mono">${esc(b.dataset.qrcode)}</h3><p class="small muted">Apresente ao responsável para liberar a saída.</p></div>` });
  }));
}

/* ===================================================== PATRIMÔNIO / QR */
export async function assetsPage(container, ctx) {
  await resourcePage(container, { ...ctx, description: 'Inventário patrimonial com ficha, valor, localização, responsável, garantia e QR Code para etiquetagem física.' });
  container.querySelectorAll('[data-view]').forEach((old) => old.replaceWith(old.cloneNode(true)));
  const tableEl = container.querySelector('[data-table]');
  const list = await api(`/api/assets${qs(ctx.query)}`).catch(() => null);
  if (!list) return;
  container.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', async () => {
    await viewRecord('assets', state.meta.assets, b.dataset.view);
    const body = document.querySelector('.modal-back .modal-body');
    if (!body) return;
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm btn-soft mt-2';
    btn.innerHTML = `${icon('qr')} Gerar QR Code de identificação`;
    btn.addEventListener('click', async () => {
      const r = await api(`/api/assets/${b.dataset.view}/qr`);
      modal({ title: `QR Code — ${r.asset.code}`, size: 'narrow', body: `<div class="center">
        <div class="qr-box" style="padding:14px">${r.svg.replace('<svg ', '<svg style="width:210px;height:210px" ')}</div>
        <h3 class="mt-2">${esc(r.asset.code)} — ${esc(r.asset.name)}</h3>
        <p class="small muted">${esc(r.asset.location || 'local não informado')} · valor ${brl(r.asset.value)}</p>
        <p class="xsmall muted">Ao escanear, abre a ficha do patrimônio no sistema.</p>
        <button class="btn btn-ghost mt-2" data-print>${icon('print')} Imprimir etiqueta</button></div>`,
        onMount(el) { el.querySelector('[data-print]').addEventListener('click', () => window.print()); } });
    });
    body.appendChild(btn);
  }));
}

/* ==================================================== CONFIGURAÇÕES / IGREJA */
export async function settingsPage(container) {
  if (!can('configuracoes', 'view')) return renderForbidden(container, 'configurações');
  container.innerHTML = loadingBlock('Carregando configurações…');
  const [church, onboarding, demo, integrations] = await Promise.all([
    api('/api/config/church'), api('/api/config/onboarding'), api('/api/demo/status'),
    api('/api/integrations').catch(() => ({ data: [] })),
  ]).catch((e) => { renderError(container, e); return []; });
  if (!church) return;
  const c = church.data;
  const canEdit = can('configuracoes', 'edit');
  container.innerHTML = `
    <div class="page-head"><div><h2>Configurações da Igreja</h2><p>Identidade institucional, configuração inicial, dados de demonstração, integrações e backup. Alterações são registradas na auditoria.</p></div></div>
    <div class="grid g-2" style="align-items:start">
      <div class="card"><div class="card-head"><h3>${icon('building')} Dados da igreja</h3></div><div class="card-body">
        <form class="form-grid" data-church>
          ${[['name', 'Nome da igreja', 'text', true], ['legal_name', 'Razão social', 'text'], ['cnpj', 'CNPJ', 'text'],
             ['pastor_name', 'Pastor responsável', 'text'], ['email', 'E-mail institucional', 'email'], ['phone', 'Telefone', 'text'],
             ['whatsapp', 'WhatsApp', 'text'], ['address', 'Endereço', 'text'], ['district', 'Bairro', 'text'],
             ['city', 'Cidade', 'text'], ['state', 'UF', 'text'], ['zip', 'CEP', 'text'],
             ['primary_color', 'Cor primária', 'color'], ['secondary_color', 'Cor secundária', 'color']]
            .map(([name, label, type, req]) => `<div class="field"><label>${esc(label)}${req ? ' <span class="req">*</span>' : ''}</label>
              <input class="input" type="${type}" name="${name}" value="${esc(c[name] ?? '')}" ${canEdit ? '' : 'disabled'} /></div>`).join('')}
        </form>
        ${canEdit ? `<div class="row mt-2"><button class="btn btn-primary" data-save-church>${icon('check')} Salvar configurações</button></div>`
          : '<div class="note mt-2">Seu perfil pode visualizar, mas não alterar, as configurações institucionais.</div>'}
      </div></div>
      <div class="stack">
        <div class="card"><div class="card-head"><h3>${icon('clipboard')} Configuração inicial</h3><span class="right badge ${onboarding.completed === onboarding.total ? 'ok' : 'warn'}">${onboarding.completed}/${onboarding.total}</span></div>
          <div class="card-body"><div class="progress mb-2"><i style="width:${Math.round((onboarding.completed / onboarding.total) * 100)}%"></i></div>
            <div class="steps">${onboarding.steps.map((s, i) => `<div class="step ${s.done ? 'done' : ''}">
              <span class="n">${s.done ? '✓' : i + 1}</span><div><b>${i + 1}/${onboarding.total} ${esc(s.label)}</b>
              <span>${s.done ? 'Etapa concluída' : 'Pendente de configuração'}</span></div>
              ${!s.done && ['igreja', 'usuarios', 'financeiro', 'ministerios', 'agenda'].includes(s.key) ? `<button class="btn btn-xs btn-soft right" data-go="${s.key === 'igreja' ? '#/configuracoes' : s.key === 'usuarios' ? '#/usuarios' : s.key === 'financeiro' ? '#/contas-bancarias' : s.key === 'ministerios' ? '#/ministerios' : '#/agenda'}">Configurar</button>` : ''}
            </div>`).join('')}</div></div></div>
        <div class="card"><div class="card-head"><h3>${icon('alert')} Dados de demonstração</h3></div><div class="card-body">
          <p class="small">O ambiente atual contém <b>${num(demo.data.people)} pessoas</b> e ${num(demo.data.transactions)} lançamentos marcados como <span class="badge demo">DEMONSTRAÇÃO</span>. Esses registros nunca se misturam com dados reais.</p>
          <div class="table-wrap"><table class="data compact"><thead><tr><th>Tabela</th><th>Registros de demonstração</th></tr></thead><tbody>
            ${Object.entries(demo.data).filter(([k]) => k !== '__total').map(([k, v]) => `<tr><td>${esc(k.replace(/_/g, ' '))}</td><td class="num">${num(v)}</td></tr>`).join('')}
          </tbody></table></div>
          ${can('configuracoes', 'delete') ? `<div class="row mt-2"><button class="btn btn-danger-soft" data-purge>${icon('trash')} Remover dados de demonstração</button>
            <span class="small muted">A remoção é definitiva para os registros de demonstração e não afeta dados reais.</span></div>`
            : '<div class="note mt-2">Somente administradores podem remover os dados de demonstração.</div>'}
        </div></div>
      </div>
    </div>
    <div class="grid g-2 mt-2" style="align-items:start">
      <div class="card"><div class="card-head"><h3>${icon('globe')} Integrações — arquitetura preparada</h3></div>
        <div class="card-body"><p class="small muted mb-2">Estas integrações exigem credenciais de terceiros e estão <b>documentadas, porém não ativadas</b>. O sistema não simula envios.</p>
        <div class="table-wrap"><table class="data compact responsive"><thead><tr><th>Integração</th><th>Situação</th><th>Ação</th></tr></thead><tbody>
        ${(integrations.data || []).map((i) => `<tr><td class="cell-main" data-label="Integração">${esc(i.provider)}</td>
          <td data-label="Situação">${badgeFor('integrations', 'status', i.status)}</td>
          <td class="actions" data-label="Ação"><button class="btn btn-xs btn-ghost" data-integ="${i.id}">Detalhes</button></td></tr>`).join('')}
        </tbody></table></div></div></div>
      <div class="card"><div class="card-head"><h3>${icon('shield')} Backup e restauração</h3></div><div class="card-body">
        <p class="small">Exporte um arquivo completo (JSON) com todos os dados desta igreja para backup externo, ou restaure um backup anterior. A restauração <b>nunca duplica</b> registros existentes.</p>
        <div class="row mt-2">
          <button class="btn btn-primary" data-backup>${icon('download')} Exportar backup</button>
          <button class="btn btn-ghost" data-restore>${icon('upload')} Restaurar backup</button>
          <button class="btn btn-ghost" data-go="#/auditoria">${icon('history')} Ver auditoria</button>
        </div>
        <div class="note mt-2">Recomenda-se exportar o backup semanalmente e armazenar em local seguro. Em produção, a rotina pode ser automatizada por agendador.</div>
      </div></div>
    </div>`;

  container.querySelector('[data-save-church]')?.addEventListener('click', async () => {
    const f = container.querySelector('[data-church]');
    const body = Object.fromEntries([...f.elements].filter((e) => e.name).map((e) => [e.name, e.value]));
    try { const r = await api('/api/config/church', { method: 'PUT', body }); toast('Configurações salvas', r.message, 'ok'); }
    catch (e) { toast('Não foi possível salvar', e.message, 'err'); }
  });
  container.querySelector('[data-purge]')?.addEventListener('click', async () => {
    const okGo = await confirmDialog({ title: 'Remover dados de demonstração?', message: 'Todos os registros marcados como DEMONSTRAÇÃO desta igreja serão removidos de forma definitiva. Registros reais não são afetados. Esta ação é registrada na auditoria.', confirmLabel: 'Remover demonstração', danger: true });
    if (!okGo) return;
    try { const r = await api('/api/demo/purge', { method: 'POST', body: {} }); toast('Demonstração removida', r.message, 'ok'); settingsPage(container); }
    catch (e) { toast('Não foi possível remover', e.message, 'err'); }
  });
  container.querySelector('[data-backup]')?.addEventListener('click', () => downloadUrl('/api/backup/export'));
  container.querySelector('[data-restore]')?.addEventListener('click', () => {
    const m = modal({
      title: 'Restaurar backup', size: 'narrow',
      body: `<div class="field"><label>Arquivo de backup (.json)</label><input class="input" type="file" accept="application/json" data-file />
        <span class="hint">Somente o backup exportado pelo próprio Eclesia One é aceito. Registros já existentes são ignorados.</span></div>`,
      footer: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('upload')} Restaurar</button>`,
      onMount(el, close) {
        el.querySelector('[data-ok]').addEventListener('click', async () => {
          const file = el.querySelector('[data-file]').files[0];
          if (!file) return toast('Selecione o arquivo', 'Nenhum arquivo informado.', 'err');
          try {
            const text = await file.text();
            const dump = JSON.parse(text);
            const r = await api('/api/backup/restore', { method: 'POST', body: { dump } });
            toast('Restauração concluída', r.message, 'ok'); close();
          } catch (e) { toast('Falha na restauração', e.message, 'err'); }
        });
      },
    });
  });
  container.querySelectorAll('[data-integ]').forEach((b) => b.addEventListener('click', () => {
    const i = integrations.data.find((x) => String(x.id) === b.dataset.integ);
    modal({ title: i.provider, size: 'narrow', body: `<dl class="kv"><dt>Situação</dt><dd>${badgeFor('integrations', 'status', i.status)}</dd>
      <dt>Configuração</dt><dd class="small">${esc(i.config_json || '—')}</dd></dl>
      <div class="note mt-2">Para ativar, informe as credenciais do provedor (chave de API, token ou webhook). Enquanto não configurada, o sistema não realiza envios — nenhuma integração é simulada.</div>` });
  }));
  container.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', () => { location.hash = el.dataset.go; }));
}

/* =========================================== PERMISSÕES (RBAC completo) */
export async function permissionsPage(container) {
  if (!can('configuracoes', 'view')) return renderForbidden(container, 'perfis e permissões');
  container.innerHTML = loadingBlock('Carregando perfis e permissões…');
  const roles = await api('/api/roles?limit=100').catch((e) => { renderError(container, e); return null; });
  if (!roles) return;
  const MODULES = [
    ['pessoas', 'Pessoas'], ['familias', 'Famílias'], ['visitantes', 'Visitantes'], ['funcionarios', 'Funcionários'],
    ['celulas', 'Células'], ['ministerios', 'Ministérios'], ['voluntarios', 'Voluntários'], ['escalas', 'Escalas'],
    ['ebd', 'EBD'], ['infantil', 'Infantil'], ['pastoral', 'Pastoral'], ['eventos', 'Eventos'], ['agenda', 'Agenda'],
    ['financeiro', 'Financeiro'], ['contas', 'Contas'], ['patrimonio', 'Patrimônio'], ['manutencao', 'Manutenção'],
    ['fornecedores', 'Fornecedores'], ['contratos', 'Contratos'], ['documentos', 'Documentos'], ['tarefas', 'Tarefas'],
    ['comunicacao', 'Comunicação'], ['relatorios', 'Relatórios'], ['inteligencia', 'Inteligência'], ['auditoria', 'Auditoria'],
  ];
  const ACTIONS = [['view', 'Visualizar'], ['create', 'Criar'], ['edit', 'Editar'], ['delete', 'Excluir'], ['approve', 'Aprovar'], ['export', 'Exportar'], ['print', 'Imprimir']];
  const canEdit = can('configuracoes', 'edit');

  container.innerHTML = `
    <div class="page-head"><div><h2>Perfis e Permissões</h2>
      <p>Controle de acesso baseado em papéis (RBAC). Cada perfil define o que pode ser visualizado, criado, editado, excluído, aprovado, exportado e impresso. As regras são aplicadas no servidor, não apenas na interface.</p></div></div>
    <div class="grid g-auto" data-roles>${roles.data.map((r) => {
      const perms = (() => { try { return JSON.parse(r.permissions || '{}'); } catch { return {}; } })();
      const mods = Object.entries(perms).filter(([, a]) => Array.isArray(a) && a.length);
      return `<div class="metric clickable" data-role="${r.id}">
        <div class="k">${icon('shield')} ${esc(r.slug)}</div>
        <div class="v sm" style="font-size:16px">${esc(r.name)}</div>
        <div class="d">${mods.length} módulo(s) liberado(s) ${r.is_system ? '· perfil de sistema' : ''}</div>
      </div>`;
    }).join('')}</div>
    <div class="card mt-2" data-editor><div class="card-body"><div class="empty">${icon('shield')}<h4>Selecione um perfil acima</h4><p>Você verá e poderá ajustar as permissões módulo por módulo.</p></div></div></div>`;

  const editor = container.querySelector('[data-editor]');
  const openRole = (role) => {
    const perms = (() => { try { return JSON.parse(role.permissions || '{}'); } catch { return {}; } })();
    editor.innerHTML = `<div class="card-head"><h3>${esc(role.name)}</h3><span class="badge neutral">${esc(role.slug)}</span>
      <span class="right small muted">As alterações valem para novos acessos do perfil</span></div>
      <div class="card-body"><div class="perm-grid">${MODULES.map(([key, label]) => `<div class="perm-card">
        <b>${esc(label)}</b>
        <div class="perm-actions">${ACTIONS.map(([a, al]) => `<label><input type="checkbox" data-mod="${key}" data-act="${a}" ${(perms[key] || []).includes(a) ? 'checked' : ''} ${canEdit ? '' : 'disabled'} /> ${esc(al)}</label>`).join('')}</div>
      </div>`).join('')}</div>
      ${canEdit ? `<div class="row mt-2"><button class="btn btn-primary" data-save-perms="${role.id}">${icon('check')} Salvar permissões</button>
        <span class="small muted">Perfis de sistema podem ser ajustados; recomenda-se criar perfis personalizados quando necessário.</span></div>`
        : '<div class="note mt-2">Seu perfil possui acesso somente leitura a esta tela.</div>'}
      </div>`;
    editor.querySelector('[data-save-perms]')?.addEventListener('click', async (e) => {
      const out = {};
      editor.querySelectorAll('[data-mod]').forEach((i) => {
        const m = i.dataset.mod;
        out[m] = out[m] || [];
        if (i.checked) out[m].push(i.dataset.act);
      });
      try {
        const r = await api(`/api/roles/${e.target.closest('[data-save-perms]').dataset.savePerms}`, { method: 'PUT', body: { permissions: JSON.stringify(out), name: role.name, slug: role.slug } });
        toast('Permissões salvas', 'As alterações foram registradas na auditoria e já valem para novas sessões.', 'ok');
      } catch (err) { toast('Não foi possível salvar', err.message, 'err'); }
    });
  };
  container.querySelectorAll('[data-role]').forEach((b) => b.addEventListener('click', () => openRole(roles.data.find((r) => String(r.id) === b.dataset.role))));
}

/* ==================================================== AGENDA DE CÉLULAS (painel) */
export async function cellsPanelPage(container) {
  if (!can('celulas', 'view')) return renderForbidden(container, 'células');
  container.innerHTML = loadingBlock('Carregando painel de células…');
  const { data } = await api('/api/cells/panel').catch((e) => { renderError(container, e); return {}; });
  if (!data) return;
  container.innerHTML = `
    <div class="page-head"><div><h2>Painel das Células</h2><p>Visão consolidada para pastores, supervisores e líderes: membros, frequência, visitantes, relatórios pendentes e próximas reuniões.</p></div>
      <div class="page-actions"><button class="btn btn-ghost" data-export>${icon('file')} PDF</button>
      <button class="btn btn-primary" data-go="#/reunioes-de-celula">${icon('plus')} Registrar reunião</button></div></div>
    <div class="grid g-4">
      ${metricCard({ label: 'Células', value: num(data.length), tone: 'brand', icon: 'layers' })}
      ${metricCard({ label: 'Integrantes', value: num(data.reduce((s, c) => s + c.membros, 0)), tone: 'ok', icon: 'users' })}
      ${metricCard({ label: 'Média de presença', value: num(data.length ? (data.reduce((s, c) => s + c.media_presenca, 0) / data.length).toFixed(1) : 0), tone: 'ok', icon: 'target' })}
      ${metricCard({ label: 'Sem relatório', value: num(data.filter((c) => c.sem_relatorio).length), tone: 'warn', icon: 'alert' })}
    </div>
    <div class="card mt-2"><div class="card-head"><h3>Detalhamento</h3></div>
      <div class="table-wrap"><table class="data responsive"><thead><tr><th>Célula</th><th>Líder</th><th>Supervisor</th><th>Dia/Hora</th><th>Membros</th><th>Ocupação</th><th>Reuniões</th><th>Média</th><th>Visitantes</th><th>Última</th><th>Próxima</th><th></th></tr></thead><tbody>
      ${data.map((c) => `<tr><td class="cell-main" data-label="Célula">${esc(c.name)}<div class="cell-sub">${esc(c.code || '')} · ${esc(c.district || '')}</div></td>
        <td data-label="Líder">${esc(c.lider || '—')}</td><td data-label="Supervisor">${esc(c.supervisor || '—')}</td>
        <td data-label="Dia/Hora">${esc(c.weekday || '—')} ${esc(c.meeting_time || '')}</td>
        <td class="num" data-label="Membros">${num(c.membros)}</td>
        <td data-label="Ocupação"><span class="bar-track" style="display:block"><i class="bar-fill ${c.ocupacao > 90 ? 'warn' : 'ok'}" style="width:${Math.min(100, c.ocupacao || 0)}%"></i></span><span class="xsmall muted">${c.ocupacao ?? '—'}% de ${num(c.capacity)}</span></td>
        <td class="num" data-label="Reuniões">${num(c.reunioes)}</td><td class="num" data-label="Média">${num(c.media_presenca)}</td>
        <td class="num" data-label="Visitantes">${num(c.visitantes)}</td><td data-label="Última">${dt(c.ultima_reuniao)}</td>
        <td data-label="Próxima">${dt(c.proxima_reuniao)}</td>
        <td class="actions" data-label=""><span class="badge ${c.sem_relatorio ? 'warn' : 'ok'}">${c.sem_relatorio ? 'Relatório pendente' : 'Em dia'}</span></td></tr>`).join('')}
      </tbody></table></div></div>`;
  container.querySelector('[data-export]').addEventListener('click', () => downloadUrl('/api/reports/celulas?format=pdf'));
  container.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', () => { location.hash = el.dataset.go; }));
}

/* ============================================ CONFIGURAÇÕES FINANCEIRAS */
export async function finConfigPage(container) {
  if (!can('financeiro', 'view')) return renderForbidden(container, 'configurações financeiras');
  container.innerHTML = loadingBlock('Carregando estrutura financeira…');
  const [cats, centers, funds, budgets] = await Promise.all([
    api('/api/categories?limit=200').catch(() => ({ data: [] })),
    api('/api/cost_centers?limit=100').catch(() => ({ data: [] })),
    api('/api/funds?limit=100').catch(() => ({ data: [] })),
    api('/api/budgets?limit=500').catch(() => ({ data: [] })),
  ]);
  const totalOrcado = budgets.data.reduce((s, b) => s + Number(b.planned_value || 0), 0);
  container.innerHTML = `
    <div class="page-head"><div><h2>Configurações Financeiras</h2><p>Categorias, centros de custo, fundos e orçamento anual. Toda a estrutura é configurável e reutilizada nos lançamentos, contas, relatórios e prestação de contas.</p></div>
      <div class="page-actions"><button class="btn btn-primary" data-go="#/orcamento">${icon('plus')} Editar orçamento</button></div></div>
    <div class="grid g-4">
      ${metricCard({ label: 'Categorias', value: num(cats.data.length), detail: `${cats.data.filter((c) => c.kind === 'receita').length} receitas · ${cats.data.filter((c) => c.kind === 'despesa').length} despesas`, tone: 'brand', icon: 'grid' })}
      ${metricCard({ label: 'Centros de custo', value: num(centers.data.length), tone: 'brand', icon: 'layers' })}
      ${metricCard({ label: 'Fundos', value: num(funds.data.length), tone: 'ok', icon: 'wallet' })}
      ${metricCard({ label: 'Orçamento anual', value: brl(totalOrcado), detail: `${budgets.data.length} linha(s)`, tone: 'neutral', icon: 'scale' })}
    </div>
    <div class="grid g-2 mt-2" style="align-items:start">
      <div class="card"><div class="card-head"><h3>Categorias</h3><a class="right small" href="#/categorias">Gerenciar</a></div>
        <div class="table-wrap"><table class="data compact"><thead><tr><th>Categoria</th><th>Tipo</th><th>Situação</th></tr></thead>
        <tbody>${cats.data.slice(0, 30).map((c) => `<tr><td class="cell-main">${esc(c.name)}</td><td>${badgeFor('categories', 'kind', c.kind)}</td><td>${esc(c.status || '—')}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="card"><div class="card-head"><h3>Centros de custo</h3><a class="right small" href="#/centros-de-custo">Gerenciar</a></div>
        <div class="table-wrap"><table class="data compact"><thead><tr><th>Centro</th><th>Orçamento anual</th></tr></thead>
        <tbody>${centers.data.map((c) => `<tr><td class="cell-main">${esc(c.name)}</td><td class="num">${brl(c.annual_budget)}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="card"><div class="card-head"><h3>Fundos</h3><a class="right small" href="#/fundos">Gerenciar</a></div>
        <div class="table-wrap"><table class="data compact"><thead><tr><th>Fundo</th><th>Meta</th><th>Situação</th></tr></thead>
        <tbody>${funds.data.map((f) => `<tr><td class="cell-main">${esc(f.name)}</td><td class="num">${f.goal ? brl(f.goal) : '—'}</td><td>${badgeFor('funds', 'status', f.status)}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="card"><div class="card-head"><h3>Orçamento por categoria</h3><a class="right small" href="#/orcamento">Editar</a></div>
        <div class="table-wrap"><table class="data compact"><thead><tr><th>Categoria</th><th>Ano</th><th>Mês</th><th>Valor orçado</th></tr></thead>
        <tbody>${budgets.data.slice(0, 30).map((b) => `<tr><td class="cell-main">${esc(b.category_nome || '—')}</td><td>${b.year}</td><td>${b.month || 'anual'}</td><td class="num">${brl(b.planned_value)}</td></tr>`).join('')}</tbody></table></div></div>
    </div>`;
  container.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', () => { location.hash = el.dataset.go; }));
}

/* ==================================================== INTELIGÊNCIA / ANÁLISES */
export async function analyticsPage(container) {
  if (!can('inteligencia', 'view') && !can('relatorios', 'view')) return renderForbidden(container, 'análises');
  container.innerHTML = loadingBlock('Analisando dados da igreja…');
  const [ind, grow, alerts] = await Promise.all([
    api('/api/indicators'),
    api('/api/reports/crescimento').catch(() => ({ rows: [] })),
    api('/api/alerts'),
  ]).catch((e) => { renderError(container, e); return []; });
  if (!ind) return;
  container.innerHTML = `
    <div class="page-head"><div><h2>Análises e Resumos</h2>
      <p>Análises calculadas sobre os dados registrados: crescimento, consistência de registros e pontos que exigem decisão. O sistema aponta — não decide.</p></div></div>
    <div class="grid g-4">
      ${metricCard({ label: 'Crescimento (6 meses)', value: num(grow.rows.reduce((s, r) => s + r.novos, 0)), detail: 'novos membros registrados', tone: 'ok', icon: 'chart' })}
      ${metricCard({ label: 'Batismos (6 meses)', value: num(grow.rows.reduce((s, r) => s + r.batismos, 0)), tone: 'ok', icon: 'heart' })}
      ${metricCard({ label: 'Visitantes (6 meses)', value: num(grow.rows.reduce((s, r) => s + r.visitantes, 0)), tone: 'brand', icon: 'users' })}
      ${metricCard({ label: 'Alertas ativos', value: num(alerts.data.length), detail: `${num(alerts.total)} registros afetados`, tone: alerts.data.length ? 'warn' : 'ok', icon: 'alert' })}
    </div>
    <div class="card mt-2"><div class="card-head"><h3>Crescimento mês a mês</h3></div>
      <div class="card-body">${barChart({ series: grow.rows.map((r) => ({ label: r.mes.slice(5) + '/' + r.mes.slice(2, 4), values: [r.novos, r.batismos, r.visitantes], colors: ['#4F46E5', '#059669', '#D97706'] })) })}
      <div class="legend"><span><i style="background:#4F46E5"></i>Novos membros</span><span><i style="background:#059669"></i>Batismos</span><span><i style="background:#D97706"></i>Visitantes</span></div></div>
      <div class="table-wrap"><table class="data compact"><thead><tr><th>Mês</th><th>Novos membros</th><th>Batismos</th><th>Visitantes</th></tr></thead>
      <tbody>${grow.rows.map((r) => `<tr><td class="cell-main">${esc(r.mes)}</td><td class="num">${num(r.novos)}</td><td class="num">${num(r.batismos)}</td><td class="num">${num(r.visitantes)}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="card mt-2"><div class="card-head"><h3>Resumo inteligente das pendências</h3></div><div class="card-body stack">
      ${alerts.data.length ? alerts.data.map((a) => `<div class="row" style="padding:9px 0;border-bottom:1px dashed var(--border)">
        <span class="badge ${a.kind}">${a.kind === 'danger' ? 'Crítico' : a.kind === 'warning' ? 'Atenção' : 'Informativo'}</span>
        <b style="font-size:13px">${esc(a.title)}</b><span class="small muted">${esc(a.detail || '')}</span>
        ${a.link ? `<a class="right small" href="${esc(a.link.replace('#', '#/'))}">Abrir</a>` : ''}</div>`).join('')
        : `<div class="empty">${icon('check')}<h4>Nenhuma inconsistência detectada</h4><p>Os registros avaliados estão consistentes e em dia.</p></div>`}
    </div></div>
    <div class="card mt-2"><div class="card-head"><h3>${icon('sparkles')} Sugestões de perguntas ao assistente</h3></div><div class="card-body">
      <div class="suggest">${['Quantos membros estão ativos?', 'Quais células não enviaram relatório?', 'Quais são as contas vencidas?', 'Quantos visitantes tivemos este mês?', 'Compare os dois últimos meses.', 'Quanto foi arrecadado de dízimos?'].map((s) => `<button data-ask="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    </div></div>`;
  container.querySelectorAll('[data-ask]').forEach((b) => b.addEventListener('click', () => { location.hash = `#/assistente-ia?q=${encodeURIComponent(b.dataset.ask)}`; }));
}

export async function keysPage(container) { return renderSoon(container, 'Indicadores', 'A tela de indicadores foi consolidada na Visão da Igreja e nas Análises. Acesse "Visão da Igreja" para os números principais.'); }

/* =================================================== páginas auxiliares */
export function renderSoon(container, title, message) {
  container.innerHTML = `
    <div class="page-head"><div><h2>${esc(title)}</h2><p>${esc(message)}</p></div></div>
    <div class="card"><div class="card-body">
      <div class="soon-banner"><span class="ico">${icon('clock')}</span>
        <div><b>Recurso em próxima etapa</b>
        <div class="small muted">Este módulo faz parte do escopo aprovado do produto e está previsto para a próxima etapa de desenvolvimento. Nenhum botão desta tela é decorativo: quando o módulo entra em produção, ele aparece aqui já conectado ao banco de dados.</div></div>
      </div>
      <div class="note mt-2">Módulos já funcionais neste ambiente: pessoas, famílias, visitantes, funcionários, células, ministérios, voluntários, EBD, infantil (check-in), pastoral, eventos, escalas, agenda, financeiro completo (contas, dízimos, ofertas, contas a pagar/receber, transferências, conciliação, centros de custo, fundos, orçamento, fluxo de caixa, prestação de contas), patrimônio com QR Code, manutenção, fornecedores, contratos, documentos, tarefas, comunicação, relatórios, auditoria, perfis e permissões, backup/restauração, importação e assistente de IA.</div>
    </div></div>`;
}

export function renderError(container, e) {
  container.innerHTML = `<div class="card"><div class="card-body">
    <div class="alert danger"><span class="ico">${icon('alert')}</span><div><h4>Não foi possível carregar esta tela</h4>
      <p>${esc(e.message || 'Erro inesperado.')}</p></div></div>
    <div class="row mt-2"><button class="btn btn-primary" onclick="location.reload()">${icon('refresh')} Recarregar</button>
    <button class="btn btn-ghost" data-go="#/dashboard">Ir para a Visão da Igreja</button></div></div></div>`;
  container.querySelector('[data-go]')?.addEventListener('click', (ev) => { location.hash = ev.target.closest('[data-go]').dataset.go; });
}

export function renderForbidden(container, what) {
  container.innerHTML = `<div class="card"><div class="card-body">
    <div class="alert warning"><span class="ico">${icon('shield')}</span><div><h4>Acesso restrito</h4>
      <p>Seu perfil (${esc(state.user?.role_name || state.user?.role || '')}) não possui permissão para acessar ${esc(what)}. Se precisar deste acesso, solicite ao administrador do sistema — as permissões são controladas no servidor por perfil (RBAC).</p></div></div>
    <div class="row mt-2"><button class="btn btn-primary" data-go="#/dashboard">Voltar para a Visão da Igreja</button></div></div></div>`;
  container.querySelector('[data-go]')?.addEventListener('click', () => { location.hash = '#/dashboard'; });
}
