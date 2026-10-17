# Eclesia One v3.0.0

> **Centro de Comando Digital da Igreja** — plataforma integrada de gestão
> eclesiástica: pessoas, células, ministérios, pastoral, financeiro, operação,
> comunicação e inteligência. Multi-tenant por igreja, com isolamento total
> garantido no servidor.

---

## Visão geral

O Eclesia One é um sistema único para administrar uma igreja inteira. Cada
cadastro pertence a **uma igreja específica**, e os dados de uma igreja nunca
aparecem para outra igreja. O Super Admin é a única exceção: ele enxerga a
**rede de igrejas** (lista de ambientes) e cria novas igrejas, mas continua
sendo tratado como uma igreja própria quando usa o sistema.

### Modelo de papéis (RBAC)

| Papel | Quem é | O que pode fazer |
|---|---|---|
| **Super Admin (rede)** | Administrador geral do sistema | Vê todas as igrejas, cadastra novas igrejas + Pastor ADM, configura a rede. |
| **Pastor ADM** | O administrador da própria igreja | Cria sua rede de **apoiadores**, **trabalhadores**, **fiéis** e demais usuários da igreja; define limite de permissão de cada um; responde por todos os módulos da igreja. |
| Pastor, Pastor Auxiliar, Líder de Célula, Líder de Ministério, Professor EBD, Recepção, Secretaria, Financeiro, Membro | Perfis com escopo restrito | Cada um só vê e opera o que a permissão permite; o servidor valida antes de qualquer leitura ou escrita. |

> Importante: o isolamento entre igrejas **nunca depende da interface**. Toda
> consulta de dados passa por `user.church_id` no servidor. Um Pastor ADM da
> Igreja A jamais consegue ler, listar ou editar registros da Igreja B,
> mesmo que saiba o ID do registro.

### Módulos ativos (26)

Pessoas, Famílias, Visitantes, Funcionários, Células, Ministérios,
Voluntários, Escalas, EBD, Infantil, Pastoral, Eventos, Agenda,
Financeiro, Contas, Patrimônio, Manutenção, Fornecedores, Contratos,
Documentos, Tarefas, Comunicação, Relatórios, Inteligência (assistente IA),
Configurações, Auditoria.

---

## Instalação

### Requisitos
- **Node.js 22.5+** (usa `node:sqlite`, `Web Crypto`, `fetch`, etc.).
- Zero dependências externas: a stack roda com o runtime padrão.
- Porta padrão: **4173** (compatível com hospedagens como Render, Railway,
  Fly, Cloud Run, VPS).

### Passos

```bash
# 1. Entrar no diretório
cd eclesiaone

# 2. Provisionar o administrador master da rede (cria 1 igreja + 1 super admin)
MASTER_EMAIL=voce@dominio.org \
MASTER_PASSWORD='SuaSenha#Forte2026' \
MASTER_NAME='Seu Nome' \
MASTER_CHURCH='Administração da Rede' \
npm run master
```

O comando imprime as credenciais. **Anote a senha** se não foi informada.

```bash
# 3. Subir o servidor
npm start
# → http://localhost:4173
```

### Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `4173` | Porta HTTP. |
| `HOST` | `0.0.0.0` | Endereço de bind. |
| `DB_FILE` | `./data/eclesia.db` | Caminho do banco SQLite. |
| `JWT_SECRET` | `eclesia-one-dev-secret` | Segredo dos tokens JWT. **Defina em produção.** |
| `SIGNUP_DISABLED` | `false` | Quando `true`, desativa o auto-cadastro de igrejas em `/api/signup`. |
| `LOG_REQUESTS` | `true` | Log de cada rota (desative em produção se quiser menos ruído). |

### Primeira utilização (do zero, sem `npm run master`)

Se você simplesmente subir `npm start` com um banco vazio, a tela de login
exibirá o formulário **primeiro acesso** (criar administrador + igreja
inicial). Basta preencher — o sistema já cuida da criação dos 11 perfis
padrão (Super Admin, Pastor ADM, Pastor, Pastor Auxiliar, Financeiro,
Secretaria, Líder de Célula, Líder de Ministério, Professor EBD, Recepção,
Membro).

### Comandos úteis

| Comando | O que faz |
|---|---|
| `npm start` | Sobe o servidor HTTP. |
| `npm run dev` | Idem, com `--watch` (reinicia ao editar). |
| `npm run setup` | Re-aplica perfis padrão a todas as igrejas e garante o Super Admin. |
| `npm run master` | Provisiona o Super Admin (idempotente, idempotente + seguro). |
| `npm run test` | Roda a bateria de testes da API (Node puro). |

---

## Como funciona o isolamento por igreja

1. Cada tabela da camada de dados tem `church_id INTEGER NOT NULL`
   referenciando `churches(id)`. Toda tabela também tem `deleted_at` para
   **soft delete**: registros marcados não aparecem em listagens, mas ficam
   preservados para auditoria.

2. Quando um usuário faz login, o token JWT contém `church`: o `church_id`
   que o usuário pertence. O servidor recarrega esse vínculo a cada
   requisição (`hydrateUser`), portanto **mudar a igreja de um usuário exige
   novo login**.

3. Todo endpoint autenticado recebe um `ctx.user`. Todas as funções de
   `api-core.js` (`listResource`, `getResource`, `createResource`,
   `updateResource`, `deleteResource`) já incluem
   `WHERE t.church_id = ? AND t.deleted_at IS NULL`.

4. Existem perfis com **escopo adicional** além do módulo:
   - `lider_celula` → só vê as células onde ele é líder/co-líder.
   - `lider_ministerio` → idem para ministérios.
   - `professor` → idem para classes da EBD.
   - `membro` → vê apenas os próprios dados (Portal do Membro).

5. `super_admin` opera sobre qualquer igreja via `GET /api/churches` (rede)
   e `POST /api/churches` (cria igreja + Pastor ADM). Os dados de uma
   igreja cadastrada pelo Super Admin são privados para o Pastor ADM
   daquela igreja; o Super Admin apenas gerencia a rede.

---

## Tela de login

- Hero à esquerda: imagem de capa da igreja ocupando toda a altura da
  viewport, com overlay azul/violeta semitransparente; versículo de Romanos
  11:36 e a marca **Eclesia One**.
- Card à direita: vidro translúcido (`backdrop-filter: blur(14px)` +
  `rgba(255,255,255,0.78)`) contendo o formulário de acesso. No
  celular (≤980px) a imagem passa a ocupar ~38vh acima do card.
- Não há mais caixas de "contas de demonstração" ou dicas de senha na tela.
  Apenas o formulário limpo, com placeholders neutros.

---

## Auditoria & segurança

- **Senhas**: PBKDF2 + SHA-256, 120 000 iterações, salt aleatório de 16
  bytes. Senhas em texto plano nunca são registradas ou logadas.
- **Tokens**: JWT HS256 com TTL de 12 horas (`signToken` em `lib.js`).
- **Auditoria**: a função `audit()` em `auth.js` registra toda escrita
  (`criar`, `editar`, `excluir`, `cancelar`, login, logout, troca de senha,
  transferência financeira, pagamento de conta, backup, importação etc.) na
  tabela `audit_logs`, com `before`/`after` JSON, usuário, IP, módulo e
  recurso.
- **Isolamento**: todas as rotas CRUD genéricas recebem `user.church_id`
  como parâmetro obrigatório; erros 403 são retornados em qualquer
  tentativa de cross-tenant access.
- **Cancelamento financeiro**: lançamentos não são apagados; em vez disso,
  recebem `status='cancelado'`. Isso preserva o histórico e a integridade
  do extrato.
- **Backup / restore**: endpoints administrativos (`/api/backup/export`,
  `/api/backup/restore`) só podem ser chamados por perfis com permissão
  `configuracoes.edit` na própria igreja.

---

## Relatórios e exportações

- **CSV** e **PDF** nativos em qualquer listagem: `/api/<recurso>?format=csv`
  ou `?format=pdf`. O PDF é gerado pelo módulo `lib.js#buildPdf` (sem
  dependência externa, com fonte WinAnsi para acentuação pt-BR).
- **Relatórios especializados**: `/api/reports/<kind>` para membros,
  visitantes, famílias, aniversariantes, crescimento, células, frequência,
  financeiro, dízimos, contas, fluxo de caixa, orçamento x realizado,
  centros de custo, fundos, prestação de contas, ministérios, patrimônio,
  manutenção, eventos, pastoral.

---

## Atendimento ao usuário

- **Assistente IA** (`POST /api/ai/ask`): perguntas em linguagem natural.
  Resposta sempre escopada por `church_id` e pela permissão do usuário —
  o assistente **nunca** revela dados de outra igreja nem dados que o
  perfil não tem acesso.
- **Portal do Membro** (`GET /api/portal/me`): mostra apenas dados do
  próprio membro — família, células, escalas, eventos inscritos,
  contribuições (se tiver permissão financeira), pedidos de oração,
  documentos públicos.
- **QR Code** (`GET /api/qr?text=...`): SVG nativo, usado em etiquetas
  de patrimônio, crachás de crianças (check-in infantil) e ingressos de
  eventos.
- **Check-in infantil**: gera código único (`INF-AAAAMMDD-NNNN`), exige
  `released_to` (responsável autorizado) no check-out.

---

## Publicação em produção

### Build de demonstração estática (vitrine)

```bash
npm run setup   # garante perfis padrão
npm run start   # em outro terminal
npm run snapshot
npm run build:static
# → publica ./dist em Firebase Hosting, Netlify, S3, GitHub Pages...
```

> O build estático serve apenas para **demonstração** (leitura completa,
> gravação desativada). Para o sistema real, use sempre o servidor Node.

### Servidor Node em produção

- **Render**: `Build Command = npm install && npm run master`. `Start
  Command = npm start`. Defina `JWT_SECRET` e `DB_FILE=/data/eclesia.db`.
- **Railway / Fly / VPS**: similar, com filesystem persistente para
  `data/` (ou use PostgreSQL via um pequeno adaptador se preferir).
- **Cloud Run**: usar `--add-volume /data` para persistência do SQLite.

### Migração para PostgreSQL

O `schema.sql` já é compatível com PostgreSQL (com pequenos ajustes: trocar
`AUTOINCREMENT` por `SERIAL`, `datetime('now')` por `now()`, etc.).
A camada `db.js` foi desenhada com funções `one/all/run/insert/update/softDelete`
que podem ser reescritas em poucos arquivos para um driver PG, mantendo o
resto do sistema intacto.

---

## Mudanças desta revisão (v3.0.0)

### Segurança & isolamento
- ✅ Validação cruzada: garantir que toda consulta escopa por `church_id`
  do usuário autenticado (endpoint + SQL).
- ✅ Logs de auditoria ampliados em todas as escritas (já era na versão
  anterior; agora também em login, logout, signup e troca de senha com
  registro do IP).

### Limpeza de exemplos
- ❌ Removidos: tela de login mostrava contas de demonstração prontas
  (`admin@eclesiaone.app`, `pastor@eclesiaone.app`, etc., todas com
  senha `Eclesia@2026`).
- ❌ Removidos: seeds automáticos (180 pessoas, células, ministérios,
  lançamentos financeiros falsos). Os utilitários foram preservados,
  mas não rodam por padrão — apenas `npm run master` (Super Admin puro)
  é executado no provisionamento.
- ❌ Removido: `/api/demo/accounts` agora devolve lista vazia no servidor
  oficial (continua ativo **apenas** no build de vitrine estática, que
  vem do snapshot de uma instalação de demonstração controlada).

### Tela de login
- 🎨 Nova capa ocupando toda a lateral esquerda com a imagem fornecida
  (`public/img/login-cover.jpg`), overlay azul/violeta translúcido e
  versículo de Romanos 11:36.
- ✨ Card à direita com `backdrop-filter: blur(14px)` e fundo
  `rgba(255,255,255,0.78)`.
- 📱 Adaptação para celular: a capa fica em ~38vh e o card ocupa o restante
  da tela.
- 🧹 Sem caixas de "contas de demonstração". Sem dicas de senha
  preenchidas. Apenas o formulário, limpo.

### Operacional
- ✅ `npm run master` é o único provisionador recomendado — cria
  Super Admin + Igreja "Administração da Rede", sem nenhum dado
  fictício.
- ✅ Schema validado: 50 tabelas, todas com `church_id` + `deleted_at`.
- ✅ Sanity check cruzado entre igrejas (HTTP 403 / lista vazia quando
  um usuário tenta ler dados de outra igreja).

---

## Licença

Proprietário. Distribuição interna da organização.
