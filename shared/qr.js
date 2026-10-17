/**
 * Eclesia One - Gerador de QR Code real (ISO/IEC 18004).
 * Modo byte (UTF-8), versoes 1 a 6, niveis de correcao L/M/Q/H.
 * Sem dependencias externas. Funciona no Node.js e no navegador (ESM).
 *
 * Uso:
 *   import { qrMatrix, qrSvg } from './qr.js';
 *   const m = qrMatrix('INF-20260929-4831');      // matriz booleana [y][x]
 *   const svg = qrSvg('INF-20260929-4831', 6);    // string SVG
 */

const ECC_CODEWORDS_PER_BLOCK = {
  L: [-1, 7, 10, 15, 20, 26, 18],
  M: [-1, 10, 16, 26, 18, 24, 16],
  Q: [-1, 13, 22, 18, 26, 18, 24],
  H: [-1, 17, 28, 22, 16, 22, 28],
};

const NUM_ERROR_CORRECTION_BLOCKS = {
  L: [-1, 1, 1, 1, 1, 1, 2],
  M: [-1, 1, 1, 1, 2, 2, 4],
  Q: [-1, 1, 1, 2, 2, 4, 4],
  H: [-1, 1, 1, 2, 4, 4, 4],
};

const TOTAL_CODEWORDS = [-1, 26, 44, 70, 100, 134, 172];
const ALIGNMENT_CENTERS = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34] };
const EC_FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

function rsRemainder(data, divisor) {
  const result = new Array(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    for (let i = 0; i < divisor.length; i++) result[i] ^= gfMul(divisor[i], factor);
  }
  return result;
}

function toUtf8Bytes(str) {
  if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(str));
  return Array.from(Buffer.from(str, 'utf8'));
}

function encodeSegments(text, version, ecl) {
  const bytes = toUtf8Bytes(text);
  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  push(0b0100, 4);           // modo byte
  push(bytes.length, 8);     // contagem (8 bits para versoes 1-9)
  for (const b of bytes) push(b, 8);

  const dataCapacityBits = getNumDataCodewords(version, ecl) * 8;
  if (bits.length > dataCapacityBits) throw new Error('QR: texto excede a capacidade da versao 6');
  // terminador
  for (let i = 0; i < 4 && bits.length < dataCapacityBits; i++) bits.push(0);
  // alinhamento a byte
  while (bits.length % 8 !== 0) bits.push(0);
  // pad bytes
  for (let pad = 0xec; bits.length < dataCapacityBits; pad ^= 0xec ^ 0x11) push(pad, 8);

  const dataCodewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    dataCodewords.push(v);
  }
  return dataCodewords;
}

function getNumDataCodewords(version, ecl) {
  return TOTAL_CODEWORDS[version] - ECC_CODEWORDS_PER_BLOCK[ecl][version] * NUM_ERROR_CORRECTION_BLOCKS[ecl][version];
}

function addEccAndInterleave(data, version, ecl) {
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl][version];
  const ecLen = ECC_CODEWORDS_PER_BLOCK[ecl][version];
  const rawTotal = TOTAL_CODEWORDS[version];
  const numShortBlocks = numBlocks - (rawTotal % numBlocks);
  const shortBlockLen = Math.floor(rawTotal / numBlocks); // inclui ECC
  const divisor = rsDivisor(ecLen);
  const blocks = [];
  let k = 0;
  for (let i = 0; i < numBlocks; i++) {
    const dataLen = shortBlockLen - ecLen + (i < numShortBlocks ? 0 : 1);
    const dat = data.slice(k, k + dataLen);
    k += dataLen;
    blocks.push({ data: dat, ecc: rsRemainder(dat, divisor) });
  }
  const out = [];
  const maxDataLen = shortBlockLen - ecLen + 1;
  for (let i = 0; i < maxDataLen; i++) {
    for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  }
  for (let i = 0; i < ecLen; i++) for (const b of blocks) out.push(b.ecc[i]);
  return out;
}

function drawFunctionPatterns(m, size, version) {
  for (let i = 0; i < size; i++) {
    setFunc(m, 6, i, i % 2 === 0);
    setFunc(m, i, 6, i % 2 === 0);
  }
  drawFinder(m, 3, 3, size);
  drawFinder(m, size - 4, 3, size);
  drawFinder(m, 3, size - 4, size);
  const centers = ALIGNMENT_CENTERS[version];
  for (const cy of centers) {
    for (const cx of centers) {
      const overlapsFinder =
        (cx === 6 && cy === 6) || (cx === 6 && cy === size - 7) || (cx === size - 7 && cy === 6);
      if (!overlapsFinder) drawAlignment(m, cx, cy, size);
    }
  }
  // reserva areas de formato (serao escritas depois com os bits reais)
  for (let i = 0; i <= 8; i++) {
    setFunc(m, i, 8, false);
    setFunc(m, 8, i, false);
  }
  for (let i = 0; i < 8; i++) {
    setFunc(m, size - 1 - i, 8, false);
    setFunc(m, 8, size - 1 - i, false);
  }
  setFunc(m, 8, size - 8, true); // modulo escuro
}

function drawFinder(m, cx, cy, size) {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && x < size && y >= 0 && y < size) setFunc(m, x, y, dist !== 2 && dist !== 4);
    }
  }
}

function drawAlignment(m, cx, cy, size) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && x < size && y >= 0 && y < size) setFunc(m, x, y, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
}

function setFunc(m, x, y, dark) {
  m.modules[y][x] = dark;
  m.isFunction[y][x] = true;
}

function drawCodewords(m, size, data) {
  let i = 0;
  const total = data.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!m.isFunction[y][x] && i < total) {
          m.modules[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
          i++;
        }
      }
    }
  }
}

function applyMask(m, size, mask) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (m.isFunction[y][x]) continue;
      let invert;
      switch (mask) {
        case 0: invert = (x + y) % 2 === 0; break;
        case 1: invert = y % 2 === 0; break;
        case 2: invert = x % 3 === 0; break;
        case 3: invert = (x + y) % 3 === 0; break;
        case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
        case 6: invert = ((((x * y) % 2) + ((x * y) % 3)) % 2) === 0; break;
        case 7: invert = ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0; break;
        default: invert = false;
      }
      if (invert) m.modules[y][x] = !m.modules[y][x];
    }
  }
}

function drawFormatBits(m, size, ecl, mask) {
  const data = (EC_FORMAT_BITS[ecl] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const bit = (i) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) setFunc(m, 8, i, bit(i));
  setFunc(m, 8, 7, bit(6));
  setFunc(m, 8, 8, bit(7));
  setFunc(m, 7, 8, bit(8));
  for (let i = 9; i < 15; i++) setFunc(m, 14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) setFunc(m, size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) setFunc(m, 8, size - 15 + i, bit(i));
  setFunc(m, 8, size - 8, true);
}

function penaltyScore(m, size) {
  let score = 0;
  // Regra 1: sequencias de 5+ modulos iguais
  for (let y = 0; y < size; y++) {
    let run = 1;
    for (let x = 1; x < size; x++) {
      if (m.modules[y][x] === m.modules[y][x - 1]) run++;
      else { if (run >= 5) score += 3 + (run - 5); run = 1; }
    }
    if (run >= 5) score += 3 + (run - 5);
  }
  for (let x = 0; x < size; x++) {
    let run = 1;
    for (let y = 1; y < size; y++) {
      if (m.modules[y][x] === m.modules[y - 1][x]) run++;
      else { if (run >= 5) score += 3 + (run - 5); run = 1; }
    }
    if (run >= 5) score += 3 + (run - 5);
  }
  // Regra 2: blocos 2x2
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = m.modules[y][x];
      if (c === m.modules[y][x + 1] && c === m.modules[y + 1][x] && c === m.modules[y + 1][x + 1]) score += 3;
    }
  }
  // Regra 3: padroes 1:1:3:1:1
  const pat1 = [true, false, true, true, true, false, true, false, false, false, false];
  const pat2 = [false, false, false, false, true, false, true, true, true, false, true];
  const matches = (arr, i) => pat1.every((v, k) => arr[i + k] === v) || pat2.every((v, k) => arr[i + k] === v);
  for (let y = 0; y < size; y++) {
    const row = m.modules[y];
    for (let x = 0; x + 11 <= size; x++) if (matches(row, x)) score += 40;
  }
  for (let x = 0; x < size; x++) {
    const col = [];
    for (let y = 0; y < size; y++) col.push(m.modules[y][x]);
    for (let y = 0; y + 11 <= size; y++) if (matches(col, y)) score += 40;
  }
  // Regra 4: proporcao de escuros
  let dark = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (m.modules[y][x]) dark++;
  const total = size * size;
  const k = Math.floor(Math.abs(dark * 20 - total * 10) / total);
  score += k * 10;
  return score;
}

/**
 * Gera a matriz do QR Code.
 * @param {string} text
 * @param {'L'|'M'|'Q'|'H'} ecl
 * @returns {boolean[][]} matriz [y][x] (true = modulo escuro)
 */
export function qrMatrix(text, ecl = 'M') {
  if (typeof text !== 'string' || text.length === 0) throw new Error('QR: texto vazio');
  const level = ECC_CODEWORDS_PER_BLOCK[ecl] ? ecl : 'M';
  let version = 0;
  for (let v = 1; v <= 6; v++) {
    const capacityBytes = getNumDataCodewords(v, level) - 2;
    if (toUtf8Bytes(text).length <= capacityBytes) { version = v; break; }
  }
  if (!version) throw new Error('QR: conteudo muito longo (limite ~100 bytes)');

  const size = version * 4 + 17;
  const data = addEccAndInterleave(encodeSegments(text, version, level), version, level);

  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const m = {
      modules: Array.from({ length: size }, () => new Array(size).fill(false)),
      isFunction: Array.from({ length: size }, () => new Array(size).fill(false)),
    };
    drawFunctionPatterns(m, size, version);
    drawCodewords(m, size, data);
    applyMask(m, size, mask);
    drawFormatBits(m, size, level, mask);
    const score = penaltyScore(m, size);
    if (!best || score < best.score) best = { score, modules: m.modules };
  }
  return best.modules;
}

/** Renderiza o QR Code como SVG (string), com zona de silencio. */
export function qrSvg(text, scale = 6, border = 4, ecl = 'M') {
  const m = qrMatrix(text, ecl);
  const n = m.length;
  const dim = (n + border * 2) * scale;
  let path = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (m[y][x]) path += `M${(x + border) * scale} ${(y + border) * scale}h${scale}v${scale}h-${scale}z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges"><rect width="${dim}" height="${dim}" fill="#ffffff"/><path d="${path}" fill="#111827"/></svg>`;
}

/** Converte a matriz em SVG data-URI (util para <img src>). */
export function qrDataUri(text, scale = 6, ecl = 'M') {
  const svg = qrSvg(text, scale, 4, ecl);
  if (typeof Buffer !== 'undefined') return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export default { qrMatrix, qrSvg, qrDataUri };
