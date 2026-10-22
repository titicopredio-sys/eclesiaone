# Acesso e primeiro uso — Eclesia One v3.2.1

## 1. Entrar no sistema

O **usuário MASTER** já vem provisionado automaticamente no banco na primeira subida do servidor (seed idempotente em `server/seed-superadmin.js`).

| Campo | Valor |
|---|---|
| Endereço (no seu computador) | http://localhost:4173 |
| **E-mail** do MASTER | `thiago@eclesiaapp.com` |
| **Senha** do MASTER | `290369@eclesia` |
| Papel | **Super Admin** — administra a rede inteira |

Para sobrescrever antes do primeiro start (opcional):
```bash
MASTER_OVERRIDE_EMAIL=... MASTER_OVERRIDE_PASSWORD=... MASTER_OVERRIDE_NAME=... MASTER_OVERRIDE_CHURCH=... npm start
```
(após o primeiro start, o seed passa a ser idempotente e mantém estes mesmos valores).

Trocar a senha: canto superior direito → **Meu perfil → Alterar senha**.

## 2. Subir o sistema (pronto para rodar)

```bash
cd eclesiaone
npm start          # Node 22.5+ (sem dependencias)
```
Abra `http://localhost:4173` e entre com o MASTER acima.
O banco já vem provisionado em `data/eclesia.db` com o MASTER + perfis padrão
da igreja `Administração da Rede` (sem nenhum dado fictício).

Para recriar as credenciais do MASTER em outro servidor (caso tenha esquecido), basta rodar `npm start` — o种子 é idempotente e o log do servidor sempre imprime as credenciais.

## IMPORTANTE: tela de login

A tela de login NAO oferece mais o formulario de "Primeiro acesso" — hierarquia fechada.
So o **MASTER** pode criar igrejas e nomear seu Pastor ADM. O Pastor ADM, por sua
vez, cadastra sua equipe (Secretaria, Financeiro, Lideres, Professores, Recepcao, Membros).
Cada usuario (Pastor, Secretaria etc.) so ve os dados da SUA igreja — o servidor
filtra por church_id em qualquer consulta.

## 3. Cadastrar a primeira igreja cliente

1. Entre como Super Admin → menu **Rede → Igrejas da rede → Nova igreja + Pastor ADM**.
2. Informe nome da igreja, CNPJ/e-mail/telefone/cidade e o **e-mail do Pastor ADM**.
3. O sistema cria, numa só ação: a igreja, os **10 perfis padrão** dela e o usuário
   **Pastor ADM** com **senha provisória** (mostrada na tela; troca obrigatória no 1º acesso).
4. O Pastor ADM entra e enxerga **somente a igreja dele** — cada consulta no servidor filtra
   por `church_id`. Nenhuma igreja vê dados de outra (comprovado por testes).
5. Dentro da igreja dele, o Pastor ADM cria os demais usuários (Secretaria, Financeiro,
   Líder de Célula, Líder de Ministério, Professor EBD, Recepção, Membro…), cada perfil com as
   suas permissões.

## 4. Instalar como aplicativo no celular

- **Android (Chrome/Edge):** botão **Instalar** na barra superior do sistema.
- **iPhone/iPad (Safari):** botão **Instalar** → guia "Compartilhar → Adicionar à Tela de Início".
- O app abre em tela cheia, com ícone próprio, menu em gaveta e respeitando o recorte da tela.

## 5. Publicar

- **Vitrine/demonstração** (Firebase Hosting): `npm run build:static` e publique `dist/` — veja `FIREBASE.md`.
- **Operação real** (servidor Node): Docker ou VPS — veja `DEPLOY.md`.
  Em produção, defina `JWT_SECRET` (segredo próprio) e `SIGNUP_DISABLED=true`
  (impede auto-cadastro pela internet; a criação de igrejas passa a ser só a sua, pela Rede).

## 6. Os dois bancos que acompanham o pacote

| Arquivo | Conteúdo | Para que serve |
|---|---|---|
| `data/eclesia.db` | ambiente **limpo**: só o seu acesso + 1 ambiente de administração | operação real, cadastro de clientes |
| `data/demonstracao-eclesia.db` | igreja (DEMONSTRAÇÃO) com 180 pessoas, financeiro, células… | vitrine no Firebase |

Trocar de banco é uma variável: `DB_FILE=/caminho/eclesia.db npm start`.
