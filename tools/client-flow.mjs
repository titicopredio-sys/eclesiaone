/* Fluxo real de abertura de cliente: o administrador master cria a igreja e o
   Pastor ADM, e o novo ambiente entra funcionando e isolado dos demais.
   Uso: BASE_URL=http://127.0.0.1:4420 node tools/client-flow.mjs */
import fs from 'node:fs';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4420';
const MASTER_EMAIL = process.env.MASTER_EMAIL || 'thiago@eclesiaapp.com';
const MASTER_PASSWORD = process.env.MASTER_PASSWORD || '290369@eclesia';
const out = {};
const parse = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return { _raw: t.slice(0, 200) }; } };
const call = async (p, { method = 'GET', token, body } = {}) => {
  const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await parse(r) };
};

const m = await call('/api/auth/login', { method: 'POST', body: { email: MASTER_EMAIL, password: MASTER_PASSWORD } });
out.login_master = { status: m.status, papel: m.data.user?.role, igreja: m.data.user?.church_name, token: !!m.data.token };
if (!m.data.token) { console.log('RESUMO ' + JSON.stringify(out)); process.exit(1); }
const T = m.data.token;

const src = fs.readFileSync(new URL('../server/api-access.js', import.meta.url), 'utf8');
const bloco = src.slice(src.indexOf("router.add('POST', '/api/churches'"));
const mm = bloco.match(/const\s*\{([^}]+)\}\s*=\s*req\.body/);
const chaves = mm ? mm[1].split(',').map((s) => s.split(':').pop().trim()).filter(Boolean) : [];
const emailCliente = 'pastor@igrejateste.org';
const valores = { name: 'Igreja Cliente Teste', legal_name: 'Igreja Cliente Teste', cnpj: '11.222.333/0001-44', email: 'contato@igrejateste.org', phone: '(19) 3333-0000', city: 'Campinas', state: 'SP', address: 'Rua das Flores, 100', district: 'Centro', zip: '13010-000', pastor_name: 'Pr. Cliente Teste', pastor_email: emailCliente, email_pastor: emailCliente, admin_email: emailCliente, usuario_email: emailCliente, password: 'Cliente@2026', senha: 'Cliente@2026', primary_color: '#4F46E5', secondary_color: '#D97706', is_demo: 0 };
const chavesFinais = chaves.length ? chaves : Object.keys(valores);
const body = {}; for (const k of chavesFinais) if (valores[k] !== undefined) body[k] = valores[k];
if (!body.name) body.name = 'Igreja Cliente Teste';

const criada = await call('/api/churches', { method: 'POST', token: T, body });
const d = criada.data || {};
out.criacao_igreja = { status: criada.status, campos_aceitos: chaves, igreja_id: d.church_id || d.id || d.church?.id || d.data?.id, senha_provisoria: d.senha_provisoria || d.password || d.senha, erro: d.error };

const senhaPr = out.criacao_igreja.senha_provisoria;
if (senhaPr) {
  const pl = await call('/api/auth/login', { method: 'POST', body: { email: emailCliente, password: senhaPr } });
  out.login_pastor_adm = { status: pl.status, papel: pl.data.user?.role, igreja: pl.data.user?.church_name, token: !!pl.data.token };
  const P = pl.data.token;
  if (P) {
    const pessoas = await call('/api/people?limit=5', { token: P });
    out.igreja_nova = { status: pessoas.status, total_registros: pessoas.data.meta?.total };
    const perfis = await call('/api/roles?limit=50', { token: P });
    out.perfis_da_igreja_nova = { status: perfis.status, total: perfis.data.meta?.total, tem_pastor_adm: (perfis.data.data || []).some((r) => r.slug === 'pastor_adm') };
    const rede = await call('/api/churches', { token: P });
    out.pastor_adm_nao_ve_a_rede = { status: rede.status };
  }
}
const rede = await call('/api/churches', { token: T });
out.rede_no_master = { status: rede.status, total: (rede.data.data || []).length, nomes: (rede.data.data || []).map((c) => c.name) };
console.log('RESUMO ' + JSON.stringify(out));
