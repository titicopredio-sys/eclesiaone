/* =============================================================================
   Eclesia One — Camada de demonstração estática
   -----------------------------------------------------------------------------
   Ativada somente quando window.ECLESIA_STATIC_DEMO === true (build para
   hospedagem estática: Firebase Hosting, Netlify, S3).
   Ela responde às chamadas /api/* a partir de um retrato real dos dados
   (/api-snapshot.json, gerado por "npm run build:static" a partir do sistema
   em execução). Nada é inventado: são os mesmos registros que o servidor
   devolveu. Leitura completa; escrita é recusada com mensagem clara.
   ============================================================================= */
(function () {
  if (!window.ECLESIA_STATIC_DEMO) return;
  var SNAP = { endpoints: {}, resources: {}, reports: {}, accounts: [] };
  var ready = fetch('/api-snapshot.json', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (j) { SNAP = j; })
    .catch(function () { /* sem retrato: respostas vazias e honestas */ });

  var original = window.fetch.bind(window);
  function jres(body, status) {
    return new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json', 'X-Demo': '1' } });
  }
  function norm(u) {
    var s = String(u).split('#')[0];
    if (/^https?:\/\//.test(s)) s = s.replace(/^https?:\/\/[^/]+/, '');
    var q = s.indexOf('?');
    return { path: q < 0 ? s : s.slice(0, q), query: q < 0 ? '' : s.slice(q + 1) };
  }
  function qs(query) {
    var o = {};
    (query || '').split('&').filter(Boolean).forEach(function (p) {
      var i = p.indexOf('='); var k = decodeURIComponent(i < 0 ? p : p.slice(0, i));
      o[k] = i < 0 ? '' : decodeURIComponent(p.slice(i + 1).replace(/\+/g, ' '));
    });
    return o;
  }
  function tokenEmail() {
    var t = '';
    try { t = localStorage.getItem('eo_token') || ''; } catch (e) {}
    return String(t).indexOf('demo.') === 0 ? String(t).slice(5) : '';
  }
  function account(email) {
    email = String(email || tokenEmail()).toLowerCase();
    for (var i = 0; i < (SNAP.accounts || []).length; i++) if (SNAP.accounts[i].email.toLowerCase() === email) return SNAP.accounts[i];
    return null;
  }
  function filtro(rows, q) {
    var p = qs(q);
    if (p.search) {
      var t = String(p.search).toLowerCase();
      rows = rows.filter(function (r) { return JSON.stringify(r).toLowerCase().indexOf(t) >= 0; });
    }
    if (p.status) rows = rows.filter(function (r) { return String(r.status || '') === String(p.status); });
    if (p.sort) {
      var desc = /^-/.test(p.sort); var k = p.sort.replace(/^-/, '');
      rows = rows.slice().sort(function (a, b) {
        var x = a[k], y = b[k];
        if (typeof x === 'number' && typeof y === 'number') return desc ? y - x : x - y;
        return desc ? String(y).localeCompare(String(x)) : String(x).localeCompare(String(y));
      });
    }
    var total = rows.length;
    var limit = Math.min(parseInt(p.limit || '50', 10) || 50, 500);
    var page = Math.max(parseInt(p.page || '1', 10) || 1, 1);
    return { rows: rows.slice((page - 1) * limit, page * limit), total: total, page: page, limit: limit };
  }
  function toCsv(rows) {
    if (!rows || !rows.length) return '';
    var cols = Object.keys(rows[0]).filter(function (c) { return c.indexOf('_at') < 0 || c === 'created_at'; });
    var cell = function (v) { v = v == null ? '' : String(v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return '\ufeff' + [cols.join(';')].concat(rows.map(function (r) {
      return cols.map(function (c) { return cell(Array.isArray(r[c]) ? r[c].join(', ') : r[c]); }).join(';');
    })).join('\n');
  }
  var NEGADO = 'Ambiente de demonstração: esta alteração não é gravada. Para usar o sistema completo, publique o servidor (npm start ou Docker) e aponte window.ECLESIA_API_BASE em public/config.js.';

  function responder(path, query, method, body) {
    /* --- sessão ---------------------------------------------------------- */
    if (path === '/api/auth/login' && method === 'POST') {
      var em = String((body && body.email) || '').trim().toLowerCase();
      var acc = account(em);
      if (!acc) return [404, { error: 'E-mail não encontrado no ambiente de demonstração. Use uma das contas de demonstração listadas na tela de acesso.', demo: true }];
      return [200, { token: 'demo.' + acc.email, user: acc.user, permissions: acc.permissions, demo: true }];
    }
    if (path === '/api/auth/me') {
      var me = account();
      if (!me) return [401, { error: 'Sessão de demonstração expirada.' }];
      return [200, { user: me.user, permissions: me.permissions, demo: true }];
    }
    if (path === '/api/setup/status') return [200, { needs_setup: false, signup_enabled: false, usuarios: 1, igrejas: 1, demo: true }];
    if (path === '/api/demo/accounts') return [200, { data: SNAP.accounts || [], demo: true }];
    if (path === '/api/health') return [200, { status: 'ok', app: 'Eclesia One', version: (SNAP.app_version || '2.1.0'), demo: true }];

    /* --- leitura --------------------------------------------------------- */
    if (method === 'GET') {
      if (SNAP.endpoints[path] !== undefined) return [200, SNAP.endpoints[path]];
      var mRep = path.match(/^\/api\/reports\/([\w-]+)$/);
      if (mRep) {
        var rep = SNAP.reports[mRep[1]];
        if (rep) return [200, rep];
        return [404, { error: 'Relatório não disponível no modo demonstração.' }];
      }
      var mCsv = path.match(/^\/api\/reports\/([\w-]+)\.csv$/) || path.match(/^\/api\/export\/([\w-]+)$/);
      if (mCsv) {
        var key = mCsv[1];
        var rows = (SNAP.reports[key] && SNAP.reports[key].rows) || (SNAP.resources[key] && SNAP.resources[key].rows) || [];
        return ['csv', toCsv(rows)];
      }
      var mRes = path.match(/^\/api\/([\w-]+)(?:\/([\w-]+))?$/);
      if (mRes) {
        var recurso = mRes[1], id = mRes[2];
        var base = SNAP.resources[recurso];
        if (base) {
          if (id) {
            var found = null;
            for (var i = 0; i < base.rows.length; i++) if (String(base.rows[i].id) === String(id)) found = base.rows[i];
            return found ? [200, { data: found, demo: true }] : [404, { error: 'Registro não encontrado.' }];
          }
          var f = filtro(base.rows, query);
          return [200, { data: f.rows, meta: { total: f.total, page: f.page, limit: f.limit, demo: true }, demo: true }];
        }
      }
      return [404, { error: 'Recurso não disponível no modo demonstração.', demo: true }];
    }

    /* --- escrita (recusada com transparência) ----------------------------- */
    return [403, { error: NEGADO, demo: true }];
  }

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('/api/') < 0) return original(input, init);
    var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    var body = null;
    try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) { body = null; }
    var n = norm(url);
    return ready.then(function () {
      var out = responder(n.path, n.query, method, body);
      if (out[0] === 'csv') {
        return new Response(out[1], { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'X-Demo': '1' } });
      }
      return jres(out[1], out[0]);
    });
  };

  /* --- aviso permanente e contas de demonstração ------------------------- */
  function ribbon() {
    if (document.querySelector('.demo-ribbon')) return;
    var st = document.createElement('style');
    st.textContent = '.demo-ribbon{position:fixed;left:0;right:0;bottom:0;z-index:900;background:#0F172A;color:#E2E8F0;font-size:12.5px;line-height:1.45;padding:7px 14px calc(7px + env(safe-area-inset-bottom));text-align:center;border-top:1px solid #334155}.demo-ribbon b{color:#FBBF24}body{padding-bottom:46px}';
    document.head.appendChild(st);
    var d = document.createElement('div');
    d.className = 'demo-ribbon';
    d.innerHTML = '<b>AMBIENTE DE DEMONSTRAÇÃO</b> — dados fictícios gerados para apresentação; a leitura é completa e as alterações não são gravadas.';
    document.body.appendChild(d);
  }
  function hint() {
    var painel = document.querySelector('.auth-form');
    if (!painel || painel.querySelector('.demo-creds') || !(SNAP.accounts || []).length) return;
    var box = document.createElement('div');
    box.className = 'demo-creds demo-box';
    box.innerHTML = '<h4>Contas de demonstração (senha ' + (SNAP.demo_password || '') + ')</h4>' +
      SNAP.accounts.slice(0, 6).map(function (a) {
        return '<div class="acct" data-fill="' + a.email + '"><b>' + a.name + '</b> <small>' + a.email + '</small></div>';
      }).join('');
    box.addEventListener('click', function (ev) {
      var alvo = ev.target.closest('[data-fill]'); if (!alvo) return;
      var mail = painel.querySelector('input[name=email]'), sen = painel.querySelector('input[name=password]');
      if (mail) mail.value = alvo.getAttribute('data-fill');
      if (sen) sen.value = SNAP.demo_password || '';
    });
    painel.appendChild(box);
  }
  var tries = 0;
  var timer = setInterval(function () {
    tries++; ribbon();
    if (document.querySelector('.auth-form')) { hint(); if (document.querySelector('.demo-creds')) clearInterval(timer); }
    if (tries > 60) clearInterval(timer);
  }, 400);
  if (document.readyState !== 'loading') { ribbon(); hint(); }
  else document.addEventListener('DOMContentLoaded', function () { ribbon(); hint(); });
})();
