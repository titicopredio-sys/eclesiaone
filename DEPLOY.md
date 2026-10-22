# Eclesia One v3.2.1 — Guia de instalação e publicação (PT-BR)

## 1. Credenciais do administrador geral (MASTER)
Provisionadas automaticamente por `server/seed-superadmin.js` na primeira subida
do servidor (e reimpressas em todas as execuções). Valores sobrescrevíveis
apenas via variáveis de ambiente **antes** do primeiro start.

| Item | Valor |
|---|---|
| Endereço local | http://localhost:4173 |
| E-mail | `thiago@eclesiaapp.com` |
| Senha | `290369@eclesia` |
| Papel | Super Admin (rede inteira) |
| Igreja-raiz | Administração da Rede |

Trocar a senha: entre no sistema → canto superior direito **Meu perfil** → **Alterar senha**
(ou `PUT /api/auth/password`). O sistema guarda a senha só como hash PBKDF2-SHA256 (120 mil iterações).

## 2. Rodar localmente (2 comandos)
```bash
unzip eclesia-one-v2.0.0.zip && cd eclesiaone
node -v                 # precisa ser >= 22.5.0
npm start               # http://localhost:4173
npm run seed            # (opcional) dados DEMONSTRAÇÃO + 10 contas de teste
node server/bootstrap.js  # cria/redefine o administrador geral e imprime o acesso
npm test                # 135 verificações de API
```
Variáveis: `PORT=4173`, `HOST=0.0.0.0`, `DB_FILE=data/eclesia.db`, `JWT_SECRET=troque-isto-em-producao`.

## 3. Criar a rede de igrejas (multi-igreja isolada)
1. Entre como **Super Admin** → menu **Rede → Igrejas da rede**.
2. **Nova igreja + Pastor ADM**: informe nome da igreja, CNPJ/e-mail e o e-mail do Pastor ADM.
   O sistema cria a igreja, os 10 perfis padrão e o usuário Pastor ADM com **senha provisória**
   (exibida na tela; troca obrigatória no primeiro acesso).
3. O Pastor ADM entra e só enxerga a própria igreja: cada consulta no servidor filtra por `church_id`.
   Nenhuma igreja vê dados de outra (testes 104, 112, 116–122).
4. **Pastor ADM** cria seus usuários em **Rede → Usuários**, escolhendo o perfil
   (Pastor, Pastor Auxiliar, Secretaria, Financeiro, Líder de Célula, Líder de Ministério,
   Professor EBD, Recepção, Membro). Cada perfil tem permissões próprias por módulo.

## 4. Publicar a INTERFACE no Firebase Hosting (comandos exatos)
```bash
npm install -g firebase-tools
firebase login
firebase use --add                       # escolha o projeto (ex.: eclecias)
# a pasta public/ já é a raiz hospedada; firebase.json já traz headers e rewrites corretos:
firebase deploy --only hosting
```
O `firebase.json` incluído entrega `Content-Type: text/javascript` para `.js` e **não** manda
`index.html` para arquivos de asset — era exatamente isso que travava a página em "Carregando o centro de comando…".

## 5. Publicar o SERVIDOR (a API) — escolha uma opção
A hospedagem estática serve apenas a interface; a API precisa de um processo Node.

**Docker (recomendado):**
```bash
docker build -t eclesiaone .
docker run -d --name eclesiaone -p 4173:4173 -v eclesia-data:/app/data \
  -e JWT_SECRET='troque-isto' eclesiaone
```
**Systemd (VPS Linux):** use `docs/eclesiaone.service`, depois `systemctl enable --now eclesiaone`.
**Railway/Render/Fly.io:** aponte para o repositório/Dockerfile, porta 4173, volume em `/app/data`.

Depois, ligue a interface ao servidor (uma linha):
```bash
# em public/config.js
window.ECLESIA_API_BASE = 'https://api.suaigreja.org';
firebase deploy --only hosting
```
O servidor já responde com os cabeçalhos CORS necessários.

## 6. Backup, restauração e LGPD
- Exportar: `GET /api/backup/export` (JSON só da igreja do usuário).
- Restaurar: `POST /api/backup/restore` (ignora duplicidades, não sobrescreve por id).
- SQLite: `sqlite3 data/eclesia.db ".backup backup.db"` (ou copie o volume).
- Auditoria imutável (sem rota de exclusão), soft-delete em todas as tabelas, senhas em hash,
  permissões verificadas no servidor em toda rota — inclusive IA, busca e exportações.
- Dados de demonstração vêm marcados `is_demo`; limpar com **Configurações → Remover demonstração**.

## 7. Se a página travar em "Carregando o centro de comando…"
1. Abra o console do navegador: se aparecer *"was blocked because its MIME type ('text/html')"*,
   a hospedagem está devolvendo HTML no lugar do `.js` → publique novamente com o `firebase.json` deste pacote.
2. `Ctrl+Shift+R` para descartar o cache antigo do service worker (o pacote já sobe a versão v3).
3. Confira no console: `Eclesia One <versão> — interface carregada`. Se aparecer
   *"Servidor da aplicação não encontrado"*, preencha `window.ECLESIA_API_BASE` em `public/config.js`.

## 8. Produção: duas variáveis obrigatórias

```bash
JWT_SECRET='<um segredo longo e só seu>'     # assina os tokens de sessão
SIGNUP_DISABLED=true                         # ninguém se auto-cadastra pela internet
```
Com `SIGNUP_DISABLED=true`, a criação de igrejas acontece apenas pelo painel **Rede**,
com o seu acesso de Super Admin. Recriar o seu acesso em qualquer servidor novo:

```bash
MASTER_EMAIL=thiago@eclesiaapp.com MASTER_PASSWORD='290369@eclesia' \
MASTER_NAME='Thiago' MASTER_CHURCH='Administração da Rede' npm run master
```
