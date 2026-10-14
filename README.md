# Helora — Chatbot multi-tenant para WhatsApp + Messenger + Instagram

Sistema completo (backend + frontend) para atender WhatsApp, Messenger e
Instagram em um único painel, com bot automático, atendimento humano e
suporte a **múltiplos clientes (contas) na mesma instalação** — pensado para
ser vendido por assinatura mensal a diferentes empresas de vários segmentos,
cada uma com seus próprios dados totalmente isolados dos demais.

## Arquitetura (produção)

Uma única instalação atende TODOS os clientes — não existe mais "um
Supabase/Railway/Vercel por cliente". Cada cliente é uma **conta** (`account`)
dentro do mesmo banco, isolada por Row Level Security (RLS):

```
┌─────────────────┐      lê + realtime       ┌──────────────────┐
│  Frontend (Railway)│ ───────────────────────▶ │  Supabase (Postgres)│
│  painel React      │ ◀─────────────────────── │  + Realtime + Auth  │
└─────────────────┘                            └──────────────────┘
         │ chama a API (com token de login)              ▲
         ▼                                               │ escreve
┌─────────────────────────────────────────────────────────┘
│  Backend (Railway) — processo sempre ligado
│  - Baileys: 1 conexão WhatsApp POR DISPOSITIVO (uma conta pode ter vários)
│  - Webhook do Meta: roteia cada evento pra conta certa
│  - Motor do bot (escopado por conta)
└─────────────────────────────────────────────────────────
```

- **Frontend**: mesmo site para todo mundo (`app.seudominio.com`). O login
  (Supabase Auth) é que diz a qual conta cada pessoa pertence.
- **Banco**: Supabase (Postgres). Toda tabela de dados tem uma coluna
  `account_id`, e RLS garante que ninguém vê dado de outra conta.
- **Backend**: mantém uma conexão Baileys **separada por dispositivo de
  WhatsApp** (uma conta pode ter mais de um número) e roteia os webhooks do
  Meta (Messenger/Instagram) pra conta certa usando a tabela `channels`.

> Por que não dá pra simplificar isso: mesmo com um banco só, cada cliente
> ainda precisa de uma sessão de WhatsApp própria — o Baileys simula uma
> conexão de WhatsApp Web, que não pode ser compartilhada entre números
> diferentes. O backend hoje gerencia várias dessas conexões ao mesmo tempo,
> uma por conta ativa.

```
chatbot-project/
  backend/
    src/
      whatsapp/baileysClient.js   -> gerenciador de conexões WhatsApp (1 por conta)
      meta/webhookRoutes.js       -> roteia webhook do Meta pra conta certa
      meta/metaClient.js          -> envia mensagem usando o token DA CONTA
      middleware/auth.js          -> valida login e descobre a conta do usuário
      routes/api.js               -> API do painel (tudo escopado por account_id)
      routes/admin.js             -> criação de contas novas (só super admin)
      bot/engine.js               -> lógica do bot (escopada por conta)
      config/db.js                -> acesso ao Supabase
  frontend/                       -> painel React (login + dashboard)
  supabase/
    schema.sql                     -> instalação NOVA (já multi-tenant)
    migration_002_chatwoot_features.sql
    migration_003_multitenancy.sql -> migração pra quem já tinha o single-tenant
```

## Como funciona o multi-tenant

- **`accounts`**: uma linha por cliente que assina a Helora.
- **`profiles`**: liga cada login (Supabase Auth) a uma conta e a um papel
  (`owner` ou `agent`). Uma conta pode ter vários atendentes logando
  separadamente.
- **`channels`**: guarda o Page ID + access token do Messenger/Instagram de
  cada conta (o WhatsApp não precisa disso — é só a sessão QR Code).
- **Isolamento**: toda tabela (`conversations`, `messages`, `labels`, etc.)
  tem `account_id`, e as políticas de RLS no Supabase só liberam leitura da
  própria conta. As escritas passam pelo backend, que também sempre filtra
  por `account_id` — mesmo alguém adivinhando o ID de uma conversa de outra
  conta, a query simplesmente não retorna nada.
- **Super admin**: um perfil com `is_super_admin = true` enxerga todas as
  contas e tem acesso à aba **Admin** no painel, onde cria contas novas.

### Como criar uma conta nova (fechar uma venda)

1. Faça login no painel com seu usuário de super admin.
2. Vá em **Admin → Nova conta**, preencha o nome do cliente e o e-mail do
   dono. Isso já cria a conta, envia um e-mail de convite (magic link) pro
   dono definir a senha, e deixa a conexão de WhatsApp dessa conta pronta.
3. Quando o cliente entrar pela primeira vez, ele já pode ir em
   **Conversas → Conectar WhatsApp** e escanear o QR Code do número dele.
4. Se o cliente também quiser Messenger/Instagram, cadastre o canal dele na
   tela **Canais** do painel, ou direto na tabela `channels`.

## Etapas 1, 2 e 3 — Setores, múltiplos dispositivos e mídia

### Etapa 1 — Setores (departamentos) e "visão de túnel"

- **Gestor** (`role: owner`) vê todas as conversas da conta, sem restrição.
- **Atendente** (`role: agent`) só vê, na lista de Conversas, os tickets do(s)
  **setor(es) dele** ou os que estiverem **atribuídos diretamente a ele** —
  isso é aplicado no backend (`listConversations` recebe o escopo do usuário
  logado), não é só uma questão de esconder na tela.
- Configure setores em **Configurações → Setores**, e vincule cada atendente
  a um ou mais setores em **Configurações → Equipe**.
- Cada conversa pode ter um **Setor** e um **Atendente atribuído**, editáveis
  no painel de contexto (à direita do chat).

### Etapa 2 — Múltiplos dispositivos de WhatsApp + permissões

- Uma conta pode ter **vários números de WhatsApp conectados ao mesmo tempo**
  (antes só existia 1 por conta). Gerencie em **Canais**.
- Cada dispositivo pode ter um **setor vinculado** (pra onde as conversas
  desse número são roteadas) e uma **matriz de permissão** (quais atendentes
  específicos enxergam aquele número — sem nenhuma marcação, fica aberto pra
  conta inteira).
- Cada dispositivo mantém sua própria sessão/QR Code, independente dos
  outros.

### Etapa 3 — Anexos, nota de voz, reações e nome do atendente

- **Anexos**: imagem, vídeo e documento, enviados e recebidos, guardados no
  Supabase Storage (bucket `media`, criado automaticamente na primeira vez).
- **Nota de voz**: grava no navegador (formato webm/opus) e o backend
  converte pra ogg/opus (formato que o WhatsApp exige pra tratar como nota de
  voz de verdade, com onda sonora — não como arquivo anexado). Essa conversão
  usa `ffmpeg-static` + `fluent-ffmpeg`, que já vêm com o binário do ffmpeg
  embutido via npm — não precisa instalar nada manualmente no Railway.
- **Reações**: passe o mouse sobre uma mensagem pra reagir com emoji. Reações
  que o cliente dá numa mensagem sua também aparecem (Baileys emite esse
  evento).
- **Nome do atendente**: mensagens enviadas manualmente pelo painel agora
  mostram quem respondeu (ex: "Ana · 14:32").

> **Atenção ao maior risco técnico dessas 3 etapas:** a conversão de áudio
> depende do `ffmpeg-static` baixar o binário certo durante o `npm install`
> no Railway. Na grande maioria dos casos isso funciona sem configuração
> extra, mas se o envio de nota de voz falhar em produção, o primeiro lugar
> pra olhar é o log de build do Railway (procure por erros do
> `ffmpeg-static` ou `postinstall`).

## Início, rodapé, admin e mobile (inspirado num sistema de referência)

- **Início**: nova tela padrão ao logar — saudação, conversas de prioridade
  alta aguardando, e atalhos rápidos pras outras seções. As "pendências"
  usam dados reais (prioridade + status), não é um mural à parte.
- **Rodapé editável**: cada conta pode colocar um aviso fixo no rodapé
  (versão, data de atualização, aviso) — editável pelo Gestor ou super
  admin, em qualquer tela. Some automaticamente no celular (colidiria com a
  barra de navegação inferior).
- **Admin com abas**: a tela de Admin agora tem **Contas** (já existia) e
  **Usuários** (novo — todo mundo que tem login, em todas as contas, com
  busca) + uma legenda explicando os 3 papéis (Super Admin, Gestor,
  Atendente).
- **Mobile**: os modais agora abrem como "bottom sheet" (deslizam de baixo
  pra cima, com cantos arredondados só em cima), e o Kanban de Negócios vira
  um carrossel horizontal com encaixe de coluna — os dois, iguais ao padrão
  de apps nativos.

Rode `supabase/migration_006_footer_note.sql` no SQL Editor (depois da
migration_005) pra habilitar o rodapé editável.

## Chatbot, dashboard, avatar, logo e comunicados

- **Fluxo do bot configurável** (`Chatbot` no menu): construtor de árvore de
  decisão em JSON, editável pelo cliente — nó de Mensagem, Menu (espera
  resposta), Transferir p/ atendente ou Encerrar. Enquanto a conta não
  configura nada, o bot usa o menu fixo de sempre (nenhuma conta quebra).
  Rode `migration_008_bot_flow.sql`.
- **Dashboard**: cards de KPI com ícone colorido, filtro de período (De/até)
  e ranking por atendente/setor.
- **Foto de perfil**: clique no avatar (sidebar ou sheet "Mais" no mobile)
  pra trocar. Rode `migration_007_avatar.sql`.
- **Logo de verdade**: a marca Helora está em `frontend/public/brand/` (a
  wordmark colorida, a marca curta pra sidebar recolhida, a versão escura e
  a branca) — usada na sidebar, no login e no favicon.
- **Sidebar branca**: o menu principal virou tema claro, com o logo em cima
  e o nome da conta do usuário logado embaixo dele.
- **Comunicados** (aba dentro de Admin, só super admin): envia avisos pra
  todas as contas, uma conta específica ou um usuário específico — aparece
  no Início de quem se encaixa. Rode `migration_009_announcements.sql`.

Rode as migrations **nessa ordem** (depois da migration_006):
`migration_007_avatar.sql` → `migration_008_bot_flow.sql` →
`migration_009_announcements.sql` → `migration_010_stats_rpc_and_deals.sql` →
`migration_011_scheduled_messages.sql`.

## Correção de bug crítico + rebranding pra Helora + Etapas 6, 7 e 8

- **Bug corrigido**: a tela travava em "Carregando sua conta..." pra sempre
  quando a consulta do perfil dava erro (ex: coluna de uma migration que
  ainda não tinha rodado) — ficava em silêncio, sem avisar nada. Agora
  mostra o erro de verdade, com botão de tentar de novo e de sair.
- **Rebranding Zoe → Helora**: logo novo em `frontend/public/brand/`
  (`helora-wordmark.png` e `helora-icon.png`), favicon novo, cor de marca
  atualizada pro azul do novo logo. Toda referência ao nome antigo foi
  trocada no código, comentários e README.
- **Login com degradê**: tela cheia com gradiente radial escuro (igual à
  referência, na cor da Helora), card branco flutuante com animação de
  entrada.
- **Etapa 6 — Dashboard avançado**: filtros de período/setor/atendente/canal
  de verdade, TMR (tempo até 1ª resposta) e TMA (tempo médio de
  atendimento), tudo calculado dentro do Postgres via a função
  `overview_stats` (RPC) — o Node só repassa os filtros.
- **Etapa 7 — Kanban de Negócios**: dono do negócio, tempo parado na etapa
  (com aviso quando passa de 5 dias), botões rápidos Ganho/Perdido no
  card, filtro por dono, e um painel lateral com Histórico (com anotações
  manuais) e a conversa vinculada (clicável, já leva pra ela). *Também
  corrigi outro bug: a seção "Negócios" existia no menu mas nunca tinha
  sido ligada a nenhuma tela — ficava em branco.*
- **Etapa 8 — Configurações em hub**: as abas simples viraram uma grade de
  cards (Respostas automáticas, Respostas prontas, Etiquetas, Setores,
  Equipe & Permissões, Mensagens agendadas, Dispositivos). Mensagens
  agendadas é funcionalidade nova de verdade: agenda uma mensagem de texto
  pra uma conversa, num dia/hora futuro, e um despachante no backend
  (`scheduler.js`) confere a cada 1 minuto e envia sozinho.

## Deploy passo a passo

### 1. Supabase (banco de dados)

**Instalação nova** (projeto Supabase vazio): rode `supabase/schema.sql` no
SQL Editor — já vem com tudo (multi-tenant incluso).

**Se você já tinha o projeto rodando** (single-tenant): rode, nessa ordem,
`migration_002_chatwoot_features.sql` (se ainda não rodou),
`migration_003_multitenancy.sql`, `migration_004_deals.sql` e
`migration_005_departments_channels_media.sql`. A migration 003 cria uma
conta "padrão" com UUID fixo e migra todos os dados existentes pra ela — o
próprio arquivo tem, no final, o passo manual pra você virar super admin
dessa conta (criar seu usuário no Supabase Auth e linkar o perfil). A
migration 005 também recria automaticamente o dispositivo de WhatsApp
"Principal" de cada conta, reaproveitando a sessão que já existia em disco
(sem precisar escanear o QR Code de novo).

Depois, em **Project Settings → API**, copie:
- `Project URL` e `anon public key` → vão no frontend
- `service_role key` → vai **somente** no backend — nunca no frontend

### 2. Tudo no Railway (backend + painel)

São **2 serviços no mesmo projeto do Railway**, apontando pro mesmo repositório do GitHub:

**2.1 — Serviço `backend`**

1. **New Project → Deploy from GitHub repo** → escolha o repositório.
2. No serviço criado: **Settings → Root Directory = `backend`**. (O `backend/railway.json` já define start, healthcheck em `/health` e 1 réplica.)
3. **Settings → Volumes → Add Volume**, Mount path = `/data`.
   É onde ficam as sessões de WhatsApp de todos os clientes. Sem volume, todo deploy desconecta todo mundo.
4. **Variables** (modelo em `backend/.env.example`):
   - `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`
   - `SESSIONS_DIR=/data/sessions`
   - `FRONTEND_ORIGIN` = URL do painel (preencha depois do passo 2.2)
   - `META_VERIFY_TOKEN` (só se for usar Messenger/Instagram)
5. **Settings → Networking → Generate Domain**. Essa URL é o `VITE_API_BASE` do painel e, com `/webhook/meta` no final, o webhook do Meta.

> Mantenha **1 réplica** só. Duas instâncias com o mesmo número de WhatsApp derrubam a sessão.

**2.2 — Serviço `frontend` (painel)**

1. No mesmo projeto: **+ New → GitHub Repo** → mesmo repositório.
2. **Settings → Root Directory = `frontend`**. (O `frontend/railway.json` já faz `npm run build` e serve a pasta `dist`.)
3. **Variables** (modelo em `frontend/.env.example`):
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_BASE` = URL do backend (passo 2.1.5), sem barra no final
4. **Generate Domain**. Volte no backend e coloque essa URL em `FRONTEND_ORIGIN`.

> As variáveis `VITE_*` entram no build: se mudar alguma, clique em **Redeploy** no frontend.

### 3. Últimos ajustes no Supabase

1. **Authentication → URL Configuration → Site URL** = URL do painel no Railway
   (é pra onde o link do e-mail de convite dos clientes leva).
2. **Authentication → Users → Add user** com seu e-mail e senha (Auto Confirm).
3. Rode `supabase/primeiro_acesso_super_admin.sql` (troque o e-mail dentro dele).
4. Entre no painel, vá em **Canais** e clique em **Conectar** no WhatsApp "Principal".

### Conectar WhatsApp (o jeito novo, mais simples)

- Ao abrir **Conectar**, o QR Code já é gerado sozinho. Basta escanear em
  *Aparelhos conectados → Conectar um aparelho*.
- **Sem câmera à mão?** Aba **Código pelo número**: digite o número com DDI e DDD
  (ex: `5584999998888`), e o painel mostra um código de 8 letras para digitar em
  *Conectar com número de telefone* no celular.
- **Gerar novo QR Code**: descarta a sessão antiga e começa do zero (antes era
  preciso apagar a pasta da sessão no servidor).
- **Desconectar número**: tira o aparelho do celular e limpa a sessão.
- Se o cliente desconectar pelo celular, o sistema limpa a sessão sozinho; é só
  clicar em Conectar de novo.
- Queda de internet: reconecta sozinho, com espera crescente (até 30s).
- Ao criar um canal novo de WhatsApp, o QR já abre na hora.

### 4. Configurando Messenger e Instagram por conta

Cada cliente que quiser Messenger/Instagram precisa do próprio app configurado
no Meta for Developers (Página do Facebook + token de acesso). Como agora é
multi-tenant, depois de gerar o Page Access Token do cliente, cadastre-o:

```sql
insert into channels (account_id, platform, external_page_id, access_token)
values ('UUID-DA-CONTA', 'messenger', 'PAGE_ID_DO_CLIENTE', 'TOKEN_DO_CLIENTE');
```

O webhook do Meta (`.../webhook/meta`) é o mesmo para todos os clientes — o
backend descobre de qual conta é cada mensagem através dessa tabela.

---

## Rodando localmente (desenvolvimento)

```bash
# Backend
cd backend && cp .env.example .env
npm install
npm run dev

# Frontend (outro terminal)
cd frontend && cp .env.example .env
npm install
npm run dev
```

Acesse **http://localhost:5173** e faça login com o usuário que você criou
como super admin.

## Recursos do painel

- **Painel**: estatísticas, funil de atendimento (Conversas → Bot →
  Transferidas → Resolvidas), gráfico de mensagens e CSAT médio.
- **Agentes**: bot configurado (base para múltiplos agentes/fluxos depois).
- **Conversas**: inbox unificado, com painel de contexto à direita
  (prioridade, etiquetas, notas internas) inspirado no layout do Chatwoot.
- **Configurações**: respostas automáticas do bot, respostas prontas do
  atendente (`/atalho` no composer) e etiquetas.
- **Admin** (só super admin): criação de contas novas.

## Modo Bot vs. Atendente

Cada conversa tem um campo `mode`: `bot` (responde sozinho) ou `human`
(atendente assumiu). Muda pra `human` automaticamente quando o cliente pede
"falar com atendente" ou quando alguém manda mensagem manual pelo painel.
Também dá pra marcar uma conversa como **Resolvida**, o que dispara a
pesquisa de satisfação (CSAT) automaticamente.

## Segurança dos dados

- Login obrigatório (Supabase Auth) — sem sessão válida, a API do backend
  recusa a requisição (401) e o Supabase recusa a leitura (RLS).
- RLS filtra tudo por `account_id`: um atendente só vê dados da própria
  conta, mesmo tendo o link direto do painel.
- A tabela `channels` (que guarda tokens do Meta) não é exposta nem por RLS —
  só o backend, com a service_role key, acessa.
- `service_role key` fica só no backend (Railway); o frontend usa a `anon
  key`, seguindo sempre as regras de RLS.

## Observações importantes

- O WhatsApp usa **Baileys** (não-oficial, QR Code) — gratuito, mas com risco
  de bloqueio se usado para disparo em massa. Para operação comercial mais
  robusta, o caminho natural a médio prazo é migrar para a **API oficial da
  Meta (Cloud API)**, o que padronizaria WhatsApp com Messenger/Instagram
  (mesmo modelo de `channels` por conta, só trocando o transporte).
- O backend mantém uma conexão Baileys por conta **na memória do mesmo
  processo**. Isso funciona bem até algumas dezenas de contas simultâneas;
  se o número de clientes crescer muito, o próximo passo é distribuir essas
  conexões entre mais de um processo/servidor.
