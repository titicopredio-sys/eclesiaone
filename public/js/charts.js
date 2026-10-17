/* =============================================================================
   Eclesia One — gráficos SVG nativos (sem bibliotecas externas).
   Todos recebem dados reais da API e desenham em coordenadas SVG.
   ============================================================================= */
import { brl, compact, num, esc, dt } from './ui.js';

const PALETTE = ['#4F46E5', '#D97706', '#059669', '#DB2777', '#0891B2', '#7C3AED', '#DC2626', '#65A30D', '#EA580C', '#0F766E'];

const niceMax = (v) => {
  if (v <= 0) return 10;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const n = v / base;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * base;
};

/** Gráfico de barras agrupadas (ex.: entradas x saídas por mês). */
export function barChart({ series, labels, values, height = 210, formatter = compact }) {
  const data = values || series || [];
  const cats = labels || [];
  const nCat = Math.max(1, data.length);
  const W = 640, H = height, padL = 52, padR = 12, padT = 14, padB = 34;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const max = niceMax(Math.max(1, ...data.map((d) => d.total ?? Math.max(...(d.values || [0])))));
  const groupW = innerW / nCat;
  const y = (v) => padT + innerH - (v / max) * innerH;

  let grid = '';
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    grid += `<line x1="${padL}" y1="${y(v).toFixed(1)}" x2="${W - padR}" y2="${y(v).toFixed(1)}" stroke="#EDEFF5" stroke-width="1"/>
      <text x="${padL - 7}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="#8A93A6">${formatter(v)}</text>`;
  }

  let bars = '';
  data.forEach((d, i) => {
    const cx = padL + groupW * i;
    const vals = d.values || [d.value ?? d.total ?? 0];
    const bw = Math.min(30, (groupW - 12) / vals.length);
    vals.forEach((v, k) => {
      const h = Math.max(1, innerH * (v / max));
      const x = cx + groupW / 2 - (bw * vals.length) / 2 + k * bw + 1;
      const color = d.colors?.[k] || PALETTE[k % PALETTE.length];
      bars += `<rect x="${x.toFixed(1)}" y="${(padT + innerH - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${color}" opacity=".92"><title>${esc(d.label || cats[i] || '')}: ${brl(v)}</title></rect>`;
    });
    bars += `<text x="${(cx + groupW / 2).toFixed(1)}" y="${H - padB + 16}" text-anchor="middle" font-size="10" fill="#64748B">${esc(d.label || cats[i] || '')}</text>`;
  });

  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img">${grid}${bars}</svg></div>`;
}

/** Gráfico de linha (tendência). */
export function lineChart({ points, labels = [], height = 200, formatter = compact }) {
  const data = (points || []).map(Number);
  const W = 640, H = height, padL = 52, padR = 14, padT = 14, padB = 32;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const max = niceMax(Math.max(1, ...data));
  const min = Math.min(0, ...data);
  const y = (v) => padT + innerH - ((v - min) / (max - min || 1)) * innerH;
  const x = (i) => padL + (innerW / Math.max(1, data.length - 1)) * i;

  let grid = '';
  for (let i = 0; i <= 4; i++) {
    const v = min + ((max - min) / 4) * i;
    grid += `<line x1="${padL}" y1="${y(v).toFixed(1)}" x2="${W - padR}" y2="${y(v).toFixed(1)}" stroke="#EDEFF5"/><text x="${padL - 7}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="#8A93A6">${formatter(v)}</text>`;
  }
  const path = data.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${path} L${x(data.length - 1).toFixed(1)} ${(padT + innerH).toFixed(1)} L${padL} ${(padT + innerH).toFixed(1)} Z`;
  const dots = data.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.4" fill="#fff" stroke="#4F46E5" stroke-width="2"><title>${esc(labels[i] || '')}: ${brl(v)}</title></circle>`).join('');
  const xlabels = labels.map((l, i) => `<text x="${x(i).toFixed(1)}" y="${H - padB + 17}" text-anchor="middle" font-size="10" fill="#64748B">${esc(l)}</text>`).join('');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"><defs><linearGradient id="lg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6366F1" stop-opacity=".28"/><stop offset="1" stop-color="#6366F1" stop-opacity="0"/></linearGradient></defs>${grid}<path d="${area}" fill="url(#lg1)"/><path d="${path}" fill="none" stroke="#4F46E5" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>${dots}${xlabels}</svg></div>`;
}

/** Rosca (composição). */
export function donutChart({ items, height = 190, total: totalOverride }) {
  const rows = (items || []).filter((i) => Number(i.value) > 0).slice(0, 8);
  const total = Number(totalOverride ?? rows.reduce((s, r) => s + Number(r.value || 0), 0));
  const R = 62, r = 40, cx = 78, cy = 78;
  if (!total) return `<div class="empty"><p>Sem dados para exibir neste período.</p></div>`;
  let angle = -Math.PI / 2, paths = '';
  rows.forEach((it, i) => {
    const frac = Number(it.value) / total;
    const a2 = angle + frac * Math.PI * 2;
    const large = frac > 0.5 ? 1 : 0;
    const color = it.color || PALETTE[i % PALETTE.length];
    const p = [
      `M${cx + R * Math.cos(angle)} ${cy + R * Math.sin(angle)}`,
      `A${R} ${R} 0 ${large} 1 ${cx + R * Math.cos(a2)} ${cy + R * Math.sin(a2)}`,
      `L${cx + r * Math.cos(a2)} ${cy + r * Math.sin(a2)}`,
      `A${r} ${r} 0 ${large} 0 ${cx + r * Math.cos(angle)} ${cy + r * Math.sin(angle)}`, 'Z',
    ].join(' ');
    paths += `<path d="${p}" fill="${color}" opacity=".92"><title>${esc(it.label)}: ${brl(it.value)} (${((frac * 100).toFixed(1))}%)</title></path>`;
    angle = a2;
  });
  const legend = rows.map((it, i) => `<div class="row tight" style="font-size:12px">
      <i style="width:9px;height:9px;border-radius:3px;background:${it.color || PALETTE[i % PALETTE.length]};display:inline-block"></i>
      <span class="trunc" style="max-width:180px">${esc(it.label)}</span>
      <span class="right num" style="font-weight:600">${brl(it.value)}</span>
      <span class="muted xsmall nowrap">${((Number(it.value) / total) * 100).toFixed(1)}%</span>
    </div>`).join('');
  return `<div class="donut-wrap">
    <div class="chart" style="flex:none;width:156px"><svg viewBox="0 0 156 156" role="img">${paths}
      <text x="78" y="74" text-anchor="middle" font-size="15" font-weight="700" fill="#16203A">${compact(total)}</text>
      <text x="78" y="88" text-anchor="middle" font-size="9" fill="#8A93A6">TOTAL</text></svg></div>
    <div class="stack" style="flex:1;min-width:210px;gap:6px">${legend}</div>
  </div>`;
}

/** Barras horizontais (comparações simples). */
export function hBars({ items, formatter = brl, toneFor }) {
  const rows = (items || []).filter((i) => Number(i.value) !== 0).slice(0, 10);
  if (!rows.length) return `<div class="empty"><p>Sem dados para exibir neste período.</p></div>`;
  const max = Math.max(...rows.map((r) => Math.abs(Number(r.value))));
  return `<div class="bars">${rows.map((r) => {
    const w = max ? Math.max(2, (Math.abs(Number(r.value)) / max) * 100) : 2;
    const tone = toneFor ? toneFor(r) : '';
    return `<div class="bar-row">
      <span class="trunc" title="${esc(r.label)}">${esc(r.label)}</span>
      <span class="bar-track"><i class="bar-fill ${tone}" style="width:${w}%"></i></span>
      <span class="val">${formatter(Number(r.value))}</span>
    </div>`;
  }).join('')}</div>`;
}

/** Série mensal financeira (entradas x saídas). */
export function financeBars(series) {
  return barChart({
    series: series.map((s) => ({ label: s.label || s.month, values: [s.entradas, s.saidas], colors: ['#059669', '#DC2626'] })),
    formatter: compact,
  });
}

export { PALETTE };
