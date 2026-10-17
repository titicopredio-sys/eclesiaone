/**
 * Eclesia One - Biblioteca base do servidor (zero dependencias externas).
 * Criptografia de senha (PBKDF2), JWT HS256, CSV, PDF, utilidades.
 */
import crypto from 'node:crypto';

/* ------------------------------------------------------------------ tempo */
export const isoNow = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
export const isoDate = (d = new Date()) => d.toISOString().slice(0, 10);
export const addDays = (dateStr, days) => {
  const d = new Date(String(dateStr).slice(0, 10) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
};
export const daysBetween = (a, b) => Math.round((new Date(String(a).slice(0, 10)) - new Date(String(b).slice(0, 10))) / 86400000);
export const monthKey = (dateStr) => String(dateStr || '').slice(0, 7);

/* --------------------------------------------------------------- password */
const PBKDF2_ITER = 120000;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password), salt, PBKDF2_ITER, 32, 'sha256').toString('hex');
  return `pbkdf2$${PBKDF2_ITER}$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [alg, iter, salt, hash] = String(stored).split('$');
    if (alg !== 'pbkdf2') return false;
    const calc = crypto.pbkdf2Sync(String(password), salt, Number(iter), 32, 'sha256');
    const expected = Buffer.from(hash, 'hex');
    return calc.length === expected.length && crypto.timingSafeEqual(calc, expected);
  } catch { return false; }
}

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

/* -------------------------------------------------------------------- JWT */
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => {
  let t = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  return Buffer.from(t, 'base64');
};

export function signToken(payload, secret, ttlSeconds = 60 * 60 * 12) {
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const data = `${header}.${body}`;
  const sig = b64u(crypto.createHmac('sha256', secret).update(data).digest());
  return `${data}.${sig}`;
}

export function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const data = `${parts[0]}.${parts[1]}`;
  const expected = b64u(crypto.createHmac('sha256', secret).update(data).digest());
  const a = Buffer.from(parts[2]);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(unb64u(parts[1]).toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

/* --------------------------------------------------------------- utilidade */
export function normalize(str) {
  return String(str ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function slugify(str) {
  return normalize(str).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function money(v) {
  const n = Number(v || 0);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* -------------------------------------------------------------------- CSV */
export function toCsv(columns, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.label)).join(';');
  const body = rows.map((r) => columns.map((c) => esc(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(';')).join('\r\n');
  return '\uFEFF' + head + '\r\n' + body;
}

/* -------------------------------------------------------------------- PDF */
const WIN_ANSI = {
  'á': 225, 'à': 224, 'â': 226, 'ã': 227, 'ä': 228, 'é': 233, 'è': 232, 'ê': 234, 'ë': 235,
  'í': 237, 'ì': 236, 'î': 238, 'ï': 239, 'ó': 243, 'ò': 242, 'ô': 244, 'õ': 245, 'ö': 246,
  'ú': 250, 'ù': 249, 'û': 251, 'ü': 252, 'ç': 231, 'ñ': 241, 'ý': 253,
  'Á': 193, 'À': 192, 'Â': 194, 'Ã': 195, 'Ä': 196, 'É': 201, 'È': 200, 'Ê': 202, 'Ë': 203,
  'Í': 205, 'Ì': 204, 'Î': 206, 'Ï': 207, 'Ó': 211, 'Ò': 210, 'Ô': 212, 'Õ': 213, 'Ö': 214,
  'Ú': 218, 'Ù': 217, 'Û': 219, 'Ü': 220, 'Ç': 199, 'Ñ': 209, 'Ý': 221,
  'º': 186, 'ª': 170, '°': 176, '–': 150, '—': 151, '’': 146, '“': 147, '”': 148, 'R$': null,
};

function pdfEscape(str) {
  let out = '';
  for (const ch of String(str ?? '')) {
    const code = ch.codePointAt(0);
    if (ch === '\\' || ch === '(' || ch === ')') out += '\\' + ch;
    else if (code === 10 || code === 13) out += ' ';
    else if (code >= 32 && code < 127) out += ch;
    else if (WIN_ANSI[ch] !== undefined && WIN_ANSI[ch] !== null) out += '\\' + WIN_ANSI[ch].toString(8).padStart(3, '0');
    else out += '?';
  }
  return out;
}

const truncate = (str, maxChars) => {
  const s = String(str ?? '');
  return s.length > maxChars ? s.slice(0, Math.max(0, maxChars - 1)) + '…' : s;
};

/**
 * Gera um PDF A4 paisagem com titulo, metadados, resumo e tabela paginada.
 * @param {{title:string, subtitle?:string, meta?:string[], columns:Array, rows:Array, summary?:Array, footer?:string, landscape?:boolean}} doc
 */
export function buildPdf(doc) {
  const landscape = doc.landscape !== false;
  const W = landscape ? 842 : 595;
  const H = landscape ? 595 : 842;
  const M = 34;
  const titleSize = 16, smallSize = 8, cellSize = 8;
  const lineH = 15;
  const colWidths = (() => {
    const weights = doc.columns.map((c) => c.width || 1);
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const usable = W - M * 2;
    return weights.map((w) => (w / total) * usable);
  })();
  const maxChars = colWidths.map((w, i) => Math.max(4, Math.floor(w / (cellSize * (doc.columns[i].mono ? 0.62 : 0.52)))));
  const headerTop = M + 26;
  const firstRowY = headerTop + 24;
  const rowsPerPage = Math.max(1, Math.floor((H - firstRowY - 46) / lineH));
  const pages = chunk(doc.rows, rowsPerPage);

  const contents = [];
  pages.forEach((pageRows, pi) => {
    const parts = [];
    const txt = (x, y, size, font, text, color) => {
      parts.push(`BT /${font} ${size} Tf ${color ? color + ' rg' : '0 g'} 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfEscape(text)}) Tj ET`);
    };
    const rect = (x, y, w, h, color) => parts.push(`${color} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
    const line = (x1, y1, x2, y2, color = '0.85 0.85 0.85') => parts.push(`${color} RG 0.6 w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);

    rect(0, H - 62, W, 62, '0.31 0.27 0.90');
    txt(M, H - 38, titleSize, 'F2', doc.title, '1 1 1');
    if (doc.subtitle) txt(M, H - 52, smallSize + 1, 'F1', doc.subtitle, '0.92 0.92 1');
    txt(W - M - 150, H - 38, smallSize, 'F1', 'Eclesia One - Gestao Integrada', '1 1 1');
    txt(W - M - 150, H - 50, smallSize, 'F1', `Emitido em ${new Date().toLocaleString('pt-BR')}`, '0.92 0.92 1');

    let y = headerTop + (doc.meta && doc.meta.length ? 0 : 0);
    if (doc.meta && doc.meta.length) {
      for (const mTx of doc.meta) { txt(M, y, smallSize + 0.5, 'F1', mTx, '0.25 0.25 0.30'); y -= 11; }
    }
    if (doc.summary && doc.summary.length) {
      y -= 2;
      const sw = (W - M * 2) / Math.min(4, doc.summary.length) - 8;
      doc.summary.forEach((s, i) => {
        const x = M + i * (sw + 8);
        rect(x, y - 30, sw, 30, '0.965 0.965 0.98');
        txt(x + 6, y - 12, smallSize, 'F1', s.label, '0.35 0.35 0.42');
        txt(x + 6, y - 25, 11, 'F2', s.value, '0.12 0.12 0.18');
      });
      y -= 42;
    }

    // cabecalho da tabela
    rect(M, y - 4, W - M * 2, 16, '0.94 0.94 0.97');
    let x = M;
    doc.columns.forEach((c, i) => {
      txt(x + 4, y, cellSize, 'F2', truncate(c.label, maxChars[i]), '0.20 0.20 0.28');
      x += colWidths[i];
    });
    y -= lineH;
    line(M, y + 4, W - M, y + 4);

    pageRows.forEach((r) => {
      let cx = M;
      doc.columns.forEach((c, i) => {
        const val = typeof c.value === 'function' ? c.value(r) : r[c.key];
        txt(cx + 4, y, cellSize, 'F1', truncate(val, maxChars[i]), '0.15 0.15 0.20');
        cx += colWidths[i];
      });
      y -= lineH;
    });
    line(M, y + 4, W - M, y + 4);
    txt(M, 24, smallSize, 'F1', doc.footer || 'Demonstracao / dados autorizados', '0.45 0.45 0.50');
    txt(W - M - 60, 24, smallSize, 'F1', `Pagina ${pi + 1} de ${pages.length}`, '0.45 0.45 0.50');
    contents.push(parts.join('\n'));
  });

  if (contents.length === 0) {
    contents.push(`BT /F1 11 Tf ${M} ${H - 90} Td (${pdfEscape('Nenhum registro encontrado para os filtros informados.')}) Tj ET`);
  }

  // ---- montagem dos objetos PDF ----
  const objects = [];
  const nPages = contents.length;
  const pageIds = contents.map((_, i) => 3 + i);
  const contentIds = contents.map((_, i) => 3 + nPages + i);
  const fontIds = [3 + nPages * 2, 4 + nPages * 2];
  objects.push(`<< /Type /Catalog /Pages 2 0 R >>`);
  objects.push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${nPages} >>`);
  contents.forEach((_, i) => {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${fontIds[0]} 0 R /F2 ${fontIds[1]} 0 R >> >> /Contents ${contentIds[i]} 0 R >>`);
  });
  contents.forEach((c) => {
    objects.push(`<< /Length ${Buffer.byteLength(c, 'latin1')} >>\nstream\n${c}\nendstream`);
  });
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);

  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

/* ------------------------------------------------------------- mini router */
export function createRouter() {
  const routes = [];
  const add = (method, pattern, handler, opts = {}) => {
    const keys = [];
    const regex = new RegExp(
      '^' + pattern.replace(/:[A-Za-z_]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }).replace(/\*/g, '.*') + '$'
    );
    routes.push({ method, regex, keys, handler, opts });
  };
  const match = (method, pathname) => {
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = r.regex.exec(pathname);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        return { handler: r.handler, params, opts: r.opts };
      }
    }
    return null;
  };
  const allowedMethods = (pathname) => routes.filter((r) => r.regex.test(pathname)).map((r) => r.method);
  return { add, match, allowedMethods };
}

/** Segredo JWT unico do sistema (o servidor valida com o mesmo valor). */
export const jwtSecret = () => process.env.JWT_SECRET || 'eclesia-one-dev-secret';
