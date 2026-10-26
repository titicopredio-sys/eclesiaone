# Publicar no Firebase Hosting — Eclesia One v3.2.2

O Firebase Hosting entrega **arquivos estáticos**. Ele não executa Node.
Por isso existem dois modos, e a escolha é sua:

| Objetivo | O que publicar | O que funciona |
|---|---|---|
| **Apresentar o sistema** (demonstração para igrejas/clientes) | `dist/` (gerado por `npm run build:static`) | Navegação completa, dados do retrato, relatórios e CSV. Sem gravação. |
| **Operação real da igreja** | `public/` + servidor Node em outro serviço | Tudo grava, multi-igreja, auditoria. |

## 1. Modo demonstração (recomendado agora)

```bash
# 1) com o servidor rodando e com dados:
npm start                 # em outro terminal
npm run seed              # cria os dados de demonstração
node server/bootstrap.js  # cria/redefine o administrador geral
npm run build:static      # gera dist/ com o retrato real dos dados
# 2) publicar:
npm install -g firebase-tools
firebase login
firebase use --add                                     # escolha o projeto (ex.: eclecias)
firebase deploy --only hosting
```

O site publicado abre com a faixa **AMBIENTE DE DEMONSTRAÇÃO**, a tela de acesso
com as contas de demonstração clicáveis, e o sistema inteiro navegável.

Contas de demonstração (senha `Eclesia@2026`): `admin@eclesiaone.app` (Super Admin),
`pastor@eclesiaone.app`, `financeiro@eclesiaone.app`, `secretaria@eclesiaone.app`,
`lider.celula@eclesiaone.app`, `lider.ministerio@eclesiaone.app`,
`professor@eclesiaone.app`, `recepcao@eclesiaone.app`, `membro@eclesiaone.app`.

## 2. Julho em diante: servidor próprio (Firebase só como vitrine)

1. Suba o servidor onde preferir (Docker, VPS, Render, Railway, Cloud Run) — veja `DEPLOY.md`.
2. Em `public/config.js` escreva: `window.ECLESIA_API_BASE = 'https://sua-api.exemplo.org';`
3. `npm run build` não é necessário: publique direto a pasta `public/`:
   em `firebase.json`, troque `"public": "dist"` por `"public": "public"` e remova
   `window.ECLESIA_STATIC_DEMO` do `config.js` (deixe `false`).
4. `firebase deploy --only hosting`.

Nada no código é preso ao Firebase: o mesmo pacote roda em Netlify, S3/CloudFront,
Nginx, Apache ou qualquer hospedagem estática, e a API em qualquer provedor.

## 3. Se a tela travar em "Carregando o centro de comando…"

1. Console do navegador: se aparecer *"was blocked because its MIME type ('text/html')"*,
   a hospedagem devolveu HTML no lugar do `.js` — publique novamente com este `firebase.json`.
2. `Ctrl+Shift+R` (ou aba anônima) para descartar o service worker antigo: o pacote sobe a versão **v4**.
3. Se aparecer *"Servidor da aplicação não encontrado"*, a interface está publicada sem API
   e sem o modo demonstração — rode `npm run build:static` e publique `dist/`.
