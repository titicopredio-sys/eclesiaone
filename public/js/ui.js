/* =============================================================================
   Eclesia One — biblioteca de interface (helpers, ícones, modais, formulários,
   tabelas, gráficos e chamadas de API). Sem dependências externas.
   ============================================================================= */

/* ------------------------------------------------------------------- estado */
export const state = {
  token: localStorage.getItem('eo_token') || null,
  user: null,
  permissions: {},
  meta: {},
  enums: {},
  alerts: [],
  queries: {},
};

export const RES_KEY_ALIAS = {
  'contas-a-pagar': 'payables', 'contas-a-receber': 'receivables', 'lancamentos': 'transactions',
  'centros-de-custo': 'cost_centers', 'patrimonio': 'assets', 'manutencoes': 'maintenance',
  'reunioes-de-celula': 'cell_meetings', 'membros-de-celula': 'cell_members', 'check-ins': 'child_checkins',
  'docs': 'documents', 'log-de-auditoria': 'audit_logs',
};

/* ---------------------------------------------------------------------- API */
/* Endereco da API. Vazio = mesma origem (padrao: o proprio servidor Node).
   Publicado em hospedagem estatica (Firebase/Netlify/S3), defina
   window.ECLESIA_API_BASE em /config.js com o endereco do servidor. */
export const API_BASE = (typeof window !== 'undefined' && window.ECLESIA_API_BASE)
  ? String(window.ECLESIA_API_BASE).replace(/\/+$/, '') : '';

export const apiUrl = (path) => {
  if (!path) return path;
  if (/^https?:/i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) return path;
  if (!API_BASE) return path;
  return API_BASE + (path.startsWith('/') ? path : '/' + path);
};
export async function api(path, { method = 'GET', body, raw = false } = {}) {
  const headers = {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(apiUrl(path), { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  if (raw) return res;
  let data = null;
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) {
    const err = new Error(data?.error || `Falha na operação (HTTP ${res.status}).`);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

export function setToken(token) {
  state.token = token;
  if (token) localStorage.setItem('eo_token', token);
  else localStorage.removeItem('eo_token');
}

/* ------------------------------------------------------------------ formatos */
export const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const num = (v) => Number(v || 0).toLocaleString('pt-BR');
export const compact = (v) => {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1).replace('.', ',') + 'k';
  return num(n);
};
export const dt = (v) => {
  if (!v) return '—';
  const s = String(v).slice(0, 10);
  const [y, m, d] = s.split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(v);
};
export const dtTime = (v) => {
  if (!v) return '—';
  const s = String(v).replace('T', ' ');
  const date = dt(s.slice(0, 10));
  const time = s.slice(11, 16);
  return time ? `${date} ${time}` : date;
};
export const today = () => new Date().toISOString().slice(0, 10);
export const addDaysStr = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
export const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* -------------------------------------------------------------------- ícones */
const ICON_PATHS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8z"/>',
  dollar: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  bank: '<path d="M3 10 12 4l9 6"/><path d="M5 10v9M19 10v9M9 10v9M15 10v9M3 21h18"/>',
  wallet: '<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20"/><circle cx="17" cy="15" r="1.2"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
  box: '<path d="M21 8v8a2 2 0 0 1-1 1.7l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.7l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5l-9.4 9.4a2.8 2.8 0 0 1-4-4z"/>',
  truck: '<rect x="1" y="6" width="13" height="10" rx="1.5"/><path d="M14 9h4l3 3v4h-7z"/><circle cx="5.5" cy="18" r="1.8"/><circle cx="17.5" cy="18" r="1.8"/>',
  file: '<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/>',
  message: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4L3 21l1.1-9A8.4 8.4 0 1 1 21 11.5z"/>',
  sparkles: '<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.4-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.2a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  history: '<path d="M3 3v6h6"/><path d="M3.5 13a9 9 0 1 0 2.6-8.4L3 9"/><path d="M12 7v5l3 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
  print: '<path d="M6 9V2h12v7"/><rect x="6" y="14" width="12" height="8"/><path d="M6 18H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
  edit: '<path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h1"/>',
  baby: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M4 4.5v15"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.5 12.5 8-8 3 3-2.5 2.5 2 2-3 3-2-2-2 2z"/>',
  building: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 21v-4h6v4"/>',
  route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H16a2 2 0 0 0 0-4H8a2 2 0 0 1 0-4h8"/>',
  scale: '<path d="M12 3v18M7 21h10"/><path d="m5 8 5 3H3zM19 8l-5 3h10z"/>',
  megaphone: '<path d="m3 11 15-6v14L3 13z"/><path d="M8 13v5a2 2 0 0 0 4 0v-3"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M3 12h18"/>',
  flag: '<path d="M4 22V3h11l-1.5 4L19 7l-1.5 5H4"/>',
};

export function icon(name, cls = '') {
  const p = ICON_PATHS[name] || ICON_PATHS.grid;
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

/* -------------------------------------------------------------------- toast */
export function toast(title, msg = '', kind = '') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  const ic = kind === 'ok' ? 'check' : kind === 'err' ? 'alert' : kind === 'warn' ? 'alert' : 'bell';
  el.innerHTML = `${icon(ic)}<div><b>${esc(title)}</b>${msg ? `<span>${esc(msg)}</span>` : ''}</div>`;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(14px)'; el.style.transition = 'all .22s'; setTimeout(() => el.remove(), 240); }, kind === 'err' ? 6000 : 3800);
}

/* -------------------------------------------------------------------- modal */
export function modal({ title, subtitle = '', body, footer = '', size = '', onMount }) {
  const root = document.getElementById('modal-root');
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head">
      <div style="min-width:0">
        <h3>${esc(title)}</h3>
        ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
      </div>
      <button class="icon-btn right" data-close aria-label="Fechar">${icon('x')}</button>
    </div>
    <div class="modal-body" data-body></div>
    ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
  </div>`;
  root.appendChild(back);
  const bodyEl = back.querySelector('[data-body]');
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
  const close = () => back.remove();
  back.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
  if (onMount) onMount(back, close);
  const first = bodyEl.querySelector('input:not([readonly]), select, textarea');
  if (first) setTimeout(() => first.focus(), 60);
  return { el: back, close, body: bodyEl };
}

export function confirmDialog({ title, message, confirmLabel = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    const m = modal({
      title, size: 'narrow',
      body: `<p style="margin:0;font-size:13.5px;color:var(--text-soft)">${esc(message)}</p>`,
      footer: `<button class="btn btn-ghost" data-cancel>Cancelar</button>
               <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(confirmLabel)}</button>`,
      onMount(el, close) {
        el.querySelector('[data-cancel]').addEventListener('click', () => { close(); resolve(false); });
        el.querySelector('[data-ok]').addEventListener('click', () => { close(); resolve(true); });
      },
    });
    m.el.addEventListener('mousedown', (e) => { if (e.target === m.el) resolve(false); });
  });
}

/* ------------------------------------------------------------------ badges */
export function badgeFor(resource, field, value) {
  const map = state.enums[`${state.meta[resource]?.table}.${field}`] || state.enums[`${resource}.${field}`];
  if (map && map[value]) {
    const [label, tone] = map[value];
    return `<span class="badge ${tone || 'neutral'}">${esc(label)}</span>`;
  }
  if (value === null || value === undefined || value === '') return '<span class="muted">—</span>';
  return `<span class="badge neutral">${esc(value)}</span>`;
}

export function enumLabel(resource, field, value) {
  const map = state.enums[`${state.meta[resource]?.table}.${field}`] || state.enums[`${resource}.${field}`];
  if (map && map[value]) return map[value][0];
  return value ?? '—';
}

/* ------------------------------------------------------------------- valores */
export function renderCell(field, row) {
  const v = row[field.name];
  const lk = field.name.replace(/_id$/, '_nome');
  if (field.name.endsWith('_id') && row[lk] !== undefined) {
    return row[lk] ? `<span class="cell-main">${esc(row[lk])}</span>` : '<span class="muted">—</span>';
  }
  if (v === null || v === undefined || v === '') return '<span class="muted">—</span>';
  if (field.type === 'boolean') return v ? '<span class="badge ok">Sim</span>' : '<span class="badge neutral">Não</span>';
  if (field.type === 'enum') return badgeFor(field.resource || '', field.name, v);
  if (field.type === 'money') return `<span class="num">${brl(v)}</span>`;
  if (field.type === 'date') return dt(v);
  if (field.type === 'datetime') return dtTime(v);
  if (field.type === 'number') return `<span class="num">${num(v)}</span>`;
  if (field.name === 'full_name' || field.name === 'name' || field.name === 'title' || field.name === 'description') {
    return `<span class="cell-main">${esc(v)}</span>`;
  }
  return esc(v);
}

/* ------------------------------------------------------------------ tabela */
export function renderTable({ resource, def, rows, columns, sort, order, onSort, emptyMsg, responsive = true }) {
  if (!rows.length) {
    return `<div class="empty">${icon('search')}<h4>Nenhum registro encontrado</h4><p>${esc(emptyMsg || 'Ajuste os filtros ou cadastre o primeiro registro deste módulo.')}</p></div>`;
  }
  const fields = def.fields;
  const cols = (columns || def.list_columns).map((c) => fields.find((f) => f.name === c)).filter(Boolean);
  const head = cols.map((f) => {
    const active = sort === f.name;
    const sortable = (def.sort.allowed || []).includes(f.name) || f.name === 'id';
    return `<th class="${sortable ? 'sortable' : ''}" data-sort="${sortable ? f.name : ''}">${esc(f.label)}${active ? `<span class="arrow">${order === 'desc' ? '▼' : '▲'}</span>` : ''}</th>`;
  }).join('');
  const body = rows.map((r) => `<tr data-id="${r.id}">
    ${cols.map((f) => `<td data-label="${esc(f.label)}">${renderCell({ ...f, resource }, r)}</td>`).join('')}
    <td class="actions" data-label="Ações">
      <button class="btn btn-xs btn-ghost" data-view="${r.id}">${icon('eye')} Ver</button>
      ${def.read_only ? '' : `<button class="btn btn-xs btn-ghost" data-edit="${r.id}">${icon('edit')} Editar</button>
      <button class="btn btn-xs btn-danger-soft" data-del="${r.id}">${icon('trash')}</button>`}
    </td>
  </tr>`).join('');
  return `<div class="table-wrap"><table class="data ${responsive ? 'responsive' : ''}">
    <thead><tr>${head}<th style="width:1%">Ações</th></tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

/* ------------------------------------------------------------------- forms */
export function fieldInput(field, value, { resource } = {}) {
  const id = `f_${field.name}`;
  const req = field.required ? ' <span class="req">*</span>' : '';
  const label = `<label for="${id}">${esc(field.label)}${req}</label>`;
  const val = value === null || value === undefined ? '' : value;
  let control = '';
  switch (field.type) {
    case 'textarea':
      control = `<textarea class="textarea" id="${id}" name="${field.name}">${esc(val)}</textarea>`;
      break;
    case 'boolean':
      return `<div class="field"><label>&nbsp;</label><label class="check"><input type="checkbox" id="${id}" name="${field.name}" ${val ? 'checked' : ''}/> ${esc(field.label)}</label></div>`;
    case 'enum':
      control = field.options_query
        ? `<select class="select" id="${id}" name="${field.name}" data-options-query="${esc(field.options_query)}"><option value="">Carregando…</option></select>`
        : `<select class="select" id="${id}" name="${field.name}">${(field.options || []).map((o) => `<option value="${esc(o.value)}" ${String(val) === String(o.value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
      break;
    case 'ref':
      control = `<select class="select" id="${id}" name="${field.name}" data-ref="${field.ref}"><option value="">Carregando…</option></select>`;
      break;
    case 'money':
      control = `<input class="input num" id="${id}" name="${field.name}" type="number" step="0.01" min="0" value="${esc(val)}" inputmode="decimal" />`;
      break;
    case 'number':
      control = `<input class="input num" id="${id}" name="${field.name}" type="number" value="${esc(val)}" inputmode="numeric" />`;
      break;
    case 'date':
      control = `<input class="input" id="${id}" name="${field.name}" type="date" value="${String(val).slice(0, 10)}" />`;
      break;
    case 'datetime':
      control = `<input class="input" id="${id}" name="${field.name}" type="datetime-local" value="${String(val).replace(' ', 'T').slice(0, 16)}" />`;
      break;
    case 'password':
      control = `<input class="input" id="${id}" name="${field.name}" type="password" autocomplete="new-password" value="" />`;
      break;
    case 'email':
      control = `<input class="input" id="${id}" name="${field.name}" type="email" value="${esc(val)}" />`;
      break;
    default:
      control = `<input class="input" id="${id}" name="${field.name}" value="${esc(val)}" />`;
  }
  return `<div class="field ${field.type === 'textarea' ? 'full' : ''}">${label}${control}${field.description ? `<span class="hint">${esc(field.description)}</span>` : ''}</div>`;
}

export async function hydrateRefFields(scope) {
  const selects = [...scope.querySelectorAll('select[data-ref]')];
  await Promise.all(selects.map(async (sel) => {
    const ref = sel.dataset.ref;
    const current = sel.dataset.value || sel.value;
    try {
      const { data } = await api(`/api/meta/options/${ref}?limit=50`);
      sel.innerHTML = `<option value="">— Selecione —</option>` + data.map((o) => `<option value="${o.id}" ${String(current) === String(o.id) ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
      if (current && !data.some((o) => String(o.id) === String(current))) sel.value = '';
    } catch { sel.innerHTML = '<option value="">Erro ao carregar opções</option>'; }
  }));
  // Selects dinamicos via options_query (ex.: lista de perfis de usuario = /api/team/roles)
  const dyn = [...scope.querySelectorAll('select[data-options-query]')];
  await Promise.all(dyn.map(async (sel) => {
    const url = sel.dataset.optionsQuery;
    const current = sel.dataset.value || sel.value;
    try {
      const { data, blocked } = await api(url);
      // Se existir lista de blocked_roles, esconde os perfis restritos (super_admin / pastor_adm)
      const filtered = blocked ? data.filter((o) => !blocked.includes(o.value || o.slug)) : data;
      sel.innerHTML = `<option value="">— Selecione —</option>` + filtered.map((o) => `<option value="${o.value || o.slug}" ${String(current) === String(o.value || o.slug) ? 'selected' : ''}>${esc(o.label || o.name)}</option>`).join('');
      if (current && !filtered.some((o) => String(o.value || o.slug) === String(current))) sel.value = '';
    } catch { sel.innerHTML = '<option value="">Erro ao carregar opções</option>'; }
  }));
  // Select de igreja / filiais (apenas super_admin)
  const churchSel = scope.querySelector('[name="church_id"]');
  if (churchSel) {
    try {
      const { data } = await api('/api/churches/options');
      churchSel.innerHTML = `<option value="">— Selecione a igreja —</option>` + data.map((o) => `<option value="${o.id}" ${String(churchSel.value) === String(o.id) ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
    } catch { churchSel.innerHTML = '<option value="">Erro ao carregar igrejas</option>'; }
  }
}

/** Formulário gerado automaticamente a partir do metadado do recurso. */
export function buildForm(resource, def, row = {}, opts = {}) {
  const groups = opts.groups || null;
  const fields = def.fields.filter((f) => !(opts.exclude || []).includes(f.name));
  const visibleFields = fields.filter((f) => {
    // Campos sempre ocultos do formulario (read-only calculados pelo servidor)
    if (f.read_only_always) return false;
    return true;
  });
  const html = visibleFields.map((f) => {
    const v = row[f.name];
    const isNew = !row.id;
    if (isNew && f.read_only_create) return '';
    if (f.name === 'password') return fieldInput(f, '');
    return fieldInput(f, v);
  }).join('');
  // Acrescenta o campo de senha abaixo da senha-fixada. Para usuarios tambem
  // exigimos o campo de senha inicial na criacao (min 8 chars) e na edicao
  // (opcional, para redefinir).
  let extra = '';
  if (def.table === 'users') {
    const isNew = !row.id;
    extra = `<div class="field"><label for="f_password">Senha${isNew ? ' inicial' : ' (redefinir — deixe em branco para manter)'} <span class="req">${isNew ? '*' : ''}</span></label>
      <input class="input" id="f_password" name="password" type="password" autocomplete="new-password" placeholder="${isNew ? 'Minimo 8 caracteres' : 'Deixe em branco para manter a senha atual'}" /></div>`;
  }
  return `<form class="form-grid" data-form novalidate>${html}${extra}</form>`;
}

export function collectForm(formEl, def, { partial = false } = {}) {
  const out = {};
  const errors = [];
  // O campo "password" nao esta em def.fields, mas eh injetado por buildForm para users:
  const extraPassword = formEl.querySelector('[name="password"]');
  const passwordValue = extraPassword ? String(extraPassword.value || '') : null;
  for (const f of def.fields) {
    if (f.read_only_always) continue;
    const el = formEl.querySelector(`[name="${f.name}"]`);
    if (!el || el.disabled) continue;
    let v;
    if (f.type === 'boolean') v = el.checked ? 1 : 0;
    else v = el.value;
    if (f.type === 'number' || f.type === 'money') v = v === '' ? null : Number(v);
    if (f.required && (v === null || v === undefined || String(v).trim() === '')) {
      errors.push(`O campo "${f.label}" eh obrigatorio.`);
      continue;
    }
    if (f.type === 'money' && v !== null && v < 0) { errors.push(`O campo "${f.label}" nao pode ser negativo.`); continue; }
    out[f.name] = v === '' ? null : v;
  }
  if (def.table === 'users') {
    const isNew = !formEl.dataset.id;
    if (isNew) {
      if (!passwordValue || passwordValue.length < 8) {
        errors.push('A senha inicial deve ter ao menos 8 caracteres.');
      } else {
        out.password = passwordValue;
      }
    } else if (passwordValue && passwordValue.length > 0) {
      if (passwordValue.length < 8) errors.push('A senha deve ter ao menos 8 caracteres quando preenchida.');
      else out.password = passwordValue;
    }
  }
  return { data: out, errors };
}

/* ---------------------------------------------------------------- paginação */
export function pager(meta, baseParams = {}) {
  const params = { ...baseParams };
  const qs = (page) => {
    const p = new URLSearchParams();
    Object.entries({ ...params, page }).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) p.set(k, v); });
    return p.toString();
  };
  return `<div class="row" style="padding:11px 14px;border-top:1px solid var(--border);background:var(--surface-2);border-radius:0 0 var(--r-lg) var(--r-lg)">
    <span class="small muted">${num(meta.total)} registro(s) · página ${meta.page} de ${meta.pages}</span>
    <div class="right row tight">
      <a class="btn btn-sm btn-ghost ${meta.page <= 1 ? 'disabled' : ''}" href="?${qs(Math.max(1, meta.page - 1))}" data-page="${Math.max(1, meta.page - 1)}">${icon('chevronLeft')} Anterior</a>
      <a class="btn btn-sm btn-ghost ${meta.page >= meta.pages ? 'disabled' : ''}" href="?${qs(Math.min(meta.pages, meta.page + 1))}" data-page="${Math.min(meta.pages, meta.page + 1)}">Próxima ${icon('chevronRight')}</a>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ diversos */
export function metricCard({ key, label, value, detail, tone = 'brand', icon: ic = 'chart', href }) {
  return `<div class="metric tone-${tone} ${href ? 'clickable' : ''}" ${href ? `data-go="${href}"` : ''} ${key ? `data-metric="${key}"` : ''}>
    <div class="k">${icon(ic)} ${esc(label)}</div>
    <div class="v">${typeof value === 'string' ? value : esc(String(value))}</div>
    ${detail ? `<div class="d">${esc(detail)}</div>` : ''}
  </div>`;
}

export function loadingBlock(msg = 'Carregando dados…') {
  return `<div class="card"><div class="card-body"><div class="row"><div class="spin dark"></div><span class="small muted">${esc(msg)}</span></div>
  <div class="mt-2" style="display:grid;gap:10px">
    <div class="skel" style="height:22px;width:42%"></div>
    <div class="skel" style="height:16px;width:74%"></div>
    <div class="skel" style="height:16px;width:62%"></div>
    <div class="skel" style="height:16px;width:80%"></div>
  </div></div></div>`;
}

export function downloadUrl(url) {
  const a = document.createElement('a');
  a.href = apiUrl(url);
  a.rel = 'noopener';
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function can(moduleKey, action = 'view') {
  if (!state.user) return false;
  if (state.user.role === 'super_admin') return true;
  const list = state.permissions[moduleKey];
  return Array.isArray(list) && list.includes(action);
}

export function resourceDef(key) { return state.meta[key] || null; }
