# Integração Meta (Instagram + Facebook) — guia de configuração

Esta integração permite conectar **múltiplas contas** do Instagram e Páginas do Facebook (pensada
para ~30-100 contas) através de **1 único app da Meta**, via OAuth — cada conta conectada tem seu
próprio token, guardado criptografado, isolado das demais. Publica Reels no Instagram e Facebook,
com agendamento multi-destino (1 vídeo → N contas, status independente por conta).

**Fluxo principal: "Conectar Instagram" (Instagram API with Instagram Login)** — conecta a conta
profissional do Instagram diretamente (`instagram.com/oauth/authorize`), **sem exigir Página do
Facebook**. É o caminho certo pra maioria das contas de clientes, que muitas vezes não têm (nem
precisam ter) uma Página administrada. "Conectar Facebook" continua disponível como alternativa
para contas que já operam via Página (ganha métricas/recursos adicionais de Business Manager).

> **Importante sobre a arquitetura real deste projeto**: o projeto é **Next.js 16 (App Router)
> self-hosted, sem nenhum sistema de login** — é uma ferramenta de operador único (você/sua
> equipe), não um SaaS multi-usuário. Supabase Edge Functions → Route Handlers do Next.js
> (`app/api/...`); Supabase Auth → não existe autenticação (você escolheu manter single-tenant).
> As tabelas Meta (`social_accounts`, `scheduled_posts`, etc.) vivem em **Supabase Postgres**
> (ver seção 3) — o resto do produto (perfis/templates/lotes do editor de vídeo) continua em
> SQLite local, sem relação com a integração Meta. `user_id` e `project_id` existem reservados
> e sem uso hoje, pra facilitar uma futura migração pra multi-usuário/multi-projeto.

## Índice

1. [Variáveis de ambiente](#1-variáveis-de-ambiente)
2. [Configuração no Meta Developers](#2-configuração-no-meta-developers)
3. [Banco de dados](#3-banco-de-dados)
4. [Arquitetura do código](#4-arquitetura-do-código)
5. [Como testar localmente](#5-como-testar-localmente)
6. [Como publicar](#6-como-publicar)
7. [Como agendar](#7-como-agendar)
8. [Scheduler em produção](#8-scheduler-em-produção)
9. [Como diagnosticar erros](#9-como-diagnosticar-erros)
10. [Ciclo de vida do token](#10-ciclo-de-vida-do-token)
11. [App Review — o que você precisa fazer manualmente](#11-app-review--o-que-você-precisa-fazer-manualmente)
12. [Checklist para produção](#12-checklist-para-produção)

---

## 1. Variáveis de ambiente

Copie `.env.local.example` para `.env.local` e preencha a seção "Instagram + Facebook (Meta Graph
API)":

| Variável | Obrigatória | Descrição |
|---|---|---|
| `META_APP_ID` | Sim | ID do app na Meta — o mesmo para todas as contas conectadas. |
| `META_APP_SECRET` | Sim | Chave secreta do app. **Nunca** é enviada ao frontend; só usada em código server-side (`lib/server/meta/*`). |
| `META_REDIRECT_URI` | Sim | URL de callback do OAuth — precisa bater exatamente com o que está cadastrado no app da Meta. Em produção precisa ser HTTPS público. |
| `META_TOKEN_ENCRYPTION_KEY` | Sim | Chave AES-256-GCM (`openssl rand -base64 32`) usada para criptografar cada token de conta antes de gravar no Supabase. Trocar essa chave invalida todos os tokens salvos. |
| `META_GRAPH_API_VERSION` | Não (default `v26.0`) | Versão fixa da Graph API usada em todas as chamadas — ver `lib/server/meta/config.ts`. |
| `META_LOGIN_CONFIG_ID` | Recomendado no fluxo atual | ID da configuração criada em **Facebook Login for Business → Configurações**. Define as permissões do login e substitui `scope` manual quando preenchido. |
| `PUBLIC_BASE_URL` | Sim, para publicar | URL pública HTTPS onde o app roda — a Meta baixa o vídeo renderizado a partir daqui. Já era usada pelos adapters antigos de Instagram/Facebook/TikTok. |
| `META_OAUTH_SCOPE_MODE` | Não (default: modo básico) | `publish` pede o conjunto completo de permissões (Páginas + Instagram + publicação, seção 11). Deixe sem definir (ou qualquer outro valor) para pedir só `public_profile` — útil pra validar o OAuth num app recém-criado, antes da Meta liberar Páginas/Instagram para ele. Ver "Estratégia de dois estágios" logo abaixo. |
| `META_OAUTH_SCOPES` | Não | Lista de escopos separada por vírgula, para sobrepor manualmente tanto o modo básico quanto o `publish` (ex.: testar um subconjunto específico de permissões). Se definida, tem prioridade sobre `META_OAUTH_SCOPE_MODE`. |
| `META_DASHBOARD_BASE_URL` | Não (default: origem da própria requisição em produção; `http://127.0.0.1:PORT` em dev) | Para onde o navegador é redirecionado de volta depois do OAuth. Necessária quando o callback chega por uma URL pública (ex.: túnel ngrok) mas você abre o painel pelo `localhost` — sem isso, o redirect final tentaria voltar para a URL do túnel em vez do painel local. |
| `META_INSTAGRAM_APP_ID` / `META_INSTAGRAM_APP_SECRET` / `META_INSTAGRAM_REDIRECT_URI` | Não | Só necessárias se o produto "Instagram" (Instagram Login) estiver configurado num app da Meta separado do usado pra `META_APP_ID`. Caem no app principal quando vazias — um único app cobrindo os dois produtos funciona normalmente. |
| `CRON_SECRET` | Recomendado em produção | Protege `POST/GET /api/scheduled-posts/run-due`. Gere com `openssl rand -hex 24`. Ver seção 8. |
| `SUPABASE_URL` | Sim | URL do projeto Supabase que guarda as tabelas da integração (ver seção 3). |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Service role key — nunca sai do servidor (`lib/server/supabase-admin.ts`), nunca é enviada ao frontend. |

Variáveis legadas (`META_PAGE_ACCESS_TOKEN`, `META_IG_USER_ID`, `META_PAGE_ID`) continuam existindo
só para não quebrar os adapters antigos de conta única em `lib/server/publishing/`. Não são usadas
pelo fluxo novo — deixe em branco se for usar só o OAuth multi-conta.

### Estratégia de dois estágios para testar OAuth num app novo

Um app da Meta recém-criado normalmente ainda não tem o produto de Páginas/Instagram totalmente
liberado, e pedir de cara todas as permissões de publicação pode fazer o diálogo de login falhar
ou recusar o consentimento. Por isso o fluxo suporta dois estágios, controlados por
`META_OAUTH_SCOPE_MODE`:

1. **Básico** (`META_OAUTH_SCOPE_MODE` ausente ou diferente de `publish`): pede só
   `public_profile`. Serve para validar que o app, o `META_REDIRECT_URI` e o túnel estão
   configurados corretamente, sem depender de nenhuma permissão de Páginas/Instagram. Ao concluir
   o login nesse modo, o callback não tenta listar Páginas — ele redireciona de volta com um aviso
   (`?meta_notice=...`), exibido na tela **Contas Meta** em uma faixa azul, explicando que é
   preciso mudar para o modo de publicação.
2. **Publicação** (`META_OAUTH_SCOPE_MODE=publish`): pede o conjunto completo de permissões da
   seção 11 e já tenta listar as Páginas/Instagram autorizados. Use este modo assim que as
   permissões de Páginas e Instagram estiverem disponíveis para o seu app (como administrador/
   testador, mesmo antes da App Review — ver seção 2, item 5).

O botão **Trocar usuário** na tela Contas Meta (`?switch_account=1`) força a Meta a mostrar a tela
de seleção de conta de novo (`auth_type=reauthenticate`), útil para testar com Facebooks
diferentes sem precisar deslogar do navegador. Ao repetir o login em modo `publish` depois de já
ter feito login em modo básico, o código também envia `auth_type=rerequest` automaticamente, para
a Meta voltar a perguntar sobre as permissões novas que ainda não tinham sido concedidas.

## 2. Configuração no Meta Developers

**Isso é manual, feito por você em <https://developers.facebook.com/apps/> — o assistente não tem
como criar o app, verificar sua empresa ou aceitar termos em seu nome.**

1. Crie um app tipo **"Negócios" (Business)**.
2. Em **Configurações → Básico**: copie o **ID do aplicativo** e a **Chave secreta** para
   `META_APP_ID`/`META_APP_SECRET`. Preencha também:
   - **URL da política de privacidade** — obrigatória para submeter a App Review. Se você ainda
     não tem uma, precisa publicar uma (pode ser uma página simples no próprio domínio).
   - **URL dos termos de serviço** — recomendada, ajuda na revisão.
   - **URL de exclusão de dados do usuário**: `https://SEU_DOMINIO/api/meta/data-deletion`
     (já implementada — ver seção 4). Alternativa aceita pela Meta: uma "Instrução de exclusão de
     dados" em texto simples, se preferir não implementar o callback — mas o endpoint já existe
     e funciona, então normalmente é mais simples só usar a URL.
   - **Callback de desautorização**: `https://SEU_DOMINIO/api/meta/deauthorize` (já implementada).
3. Adicione o produto **"Facebook Login para Empresas"** (Facebook Login for Business). Em
   **Configurações do produto**, cadastre em **"URIs de redirecionamento OAuth válidos"** o valor
   exato de `META_REDIRECT_URI` (ex.: `https://SEU_DOMINIO/api/meta/callback`).
4. Em **Revisão do App → Permissões e recursos**, você verá a lista de escopos pedidos pelo
   código (`lib/server/meta/config.ts`, `META_OAUTH_SCOPES`). Ver a tabela completa na seção 11.
5. Enquanto o app estiver em **modo de desenvolvimento**, só administradores/desenvolvedores/
   testadores cadastrados no próprio app conseguem passar pelo login — é assim que você testa
   antes de submeter pra revisão. Para atender contas de terceiros (a maioria das ~30-100
   contas), o app precisa estar em **modo Live** com as permissões em **Advanced Access** — o que
   exige App Review aprovado e, na maioria dos casos, **Verificação de Negócios (Business
   Verification)** feita pela Meta. Isso é 100% manual e não pode ser automatizado por aqui — ver
   seção 11.

## 3. Banco de dados

As tabelas da integração Meta vivem em **Supabase Postgres** — schema completo em
[`supabase/migrations/0001_meta_integration.sql`](../supabase/migrations/0001_meta_integration.sql).
**Rode esse arquivo manualmente**: Supabase Dashboard → SQL Editor → New query → cole o
conteúdo do arquivo → Run (é idempotente, pode rodar de novo sem duplicar nada). Cada conta
social conectada é **uma linha independente** — nunca colunas tipo `instagram_1`, `instagram_2`.

```
social_accounts
  id, user_id (reservado), project_id (reservado, sempre null hoje),
  platform ('INSTAGRAM'|'FACEBOOK'), platform_account_id, page_id, instagram_user_id,
  account_name, username, profile_picture_url, access_token_encrypted, token_expires_at,
  status ('connected'|'expired'|'revoked'|'error'), meta_user_id, permissions (jsonb — escopos
  concedidos, capturados via /debug_token), last_checked_at, last_error, metadata,
  created_at, updated_at
  UNIQUE (platform, platform_account_id)  -- reconectar faz UPDATE, nunca duplica

meta_oauth_states         -- CSRF: state de uso único, expira em 10 min
meta_oauth_sessions       -- cache curto (15 min) dos ativos descobertos após o OAuth,
                          -- criptografado inteiro (contém os page access tokens),
                          -- até o usuário escolher o que conectar

scheduled_posts
  id, user_id, video_url (null se video_source='drive'), video_source ('url'|'drive'),
  drive_file_id, drive_file_name, caption, scheduled_at, status, created_at, updated_at

google_drive_tokens       -- token OAuth do Google (Drive + YouTube), linha única (id=1) —
                          -- ver seção 3.1

scheduled_post_accounts   -- 1 linha por destino: 1 vídeo → N contas, status independente
  id, scheduled_post_id, social_account_id, status, external_post_id,
  error_code, error_message, recoverable, attempt_count, next_attempt_at,
  published_at, created_at, updated_at

publication_logs          -- auditoria de publicações — nunca grava token completo
  id, user_id, scheduled_post_id, social_account_id, platform, action, status,
  external_post_id, error_code, error_message, metadata, created_at

meta_integration_logs     -- log estruturado de CADA etapa do fluxo (OAuth, descoberta,
                          -- validação, publicação) — granularidade maior que publication_logs,
                          -- pensado pro modal de diagnóstico (endpoint, http_status,
                          -- meta_error_code/subcode, fbtrace_id). Ver lib/server/meta/log.ts.
  id, step, social_account_id, endpoint, http_status, meta_error_code, meta_error_subcode,
  message, fbtrace_id, metadata, created_at
```

**Tokens em repouso**: `access_token_encrypted` é sempre o resultado de
`encryptSecret()` (`lib/server/crypto.ts`, AES-256-GCM com `META_TOKEN_ENCRYPTION_KEY`) — nunca
texto puro, mesmo dentro do Postgres. Nenhuma rota de API devolve esse campo;
`socialAccountsRepo.getAccessToken()` (`lib/server/meta/db.ts`) é a única forma de obter o token
decodificado, e só é chamada em código server-side de publicação (`lib/server/meta/publish.ts`).

**RLS**: todas as tabelas têm Row Level Security habilitado e **nenhuma policy** — sem policy,
o Postgres nega tudo para as roles `anon`/`authenticated`. Só a `service_role` key (usada
exclusivamente em `lib/server/*`, nunca no frontend) ignora RLS e consegue ler/escrever. Isso é
proposital: mesmo que a `ANON_KEY` do projeto vaze ou seja usada por engano em código de
cliente, ela não enxerga nada nessas tabelas.

**O resto do produto continua em SQLite**: perfis, templates, lotes de renderização e métricas
do editor de vídeo (`lib/server/db.ts`) não têm relação com a integração Meta e não foram
tocados — a migração pra Supabase foi escopada só às tabelas acima.

### 3.1. Google Drive como storage de vídeo (opcional)

Alternativa ao upload local/Vercel Blob para não depender do Supabase Storage pra volume de
vídeo: ao agendar um post, o vídeo pode ser guardado no Google Drive do próprio usuário, numa
pasta organizada automaticamente por conta —
`Zenx Creative - Agendados/@usuario_do_instagram/arquivo.mp4`. As duas opções coexistem: cada
post escolhe uma (`scheduled_posts.video_source`).

**Como funciona na publicação**: a Meta só sabe baixar vídeo de uma URL HTTPS pública — ela não
tem acesso ao Drive. Por isso, na hora de publicar, o Zenx gera uma URL própria, assinada e de
curta duração (`buildSignedDriveStreamUrl`, `lib/server/google/drive-stream-url.ts`, 30min de
validade), que aponta para `GET /api/drive/stream/[fileId]`
(`app/api/drive/stream/[fileId]/route.ts`). Essa rota baixa o arquivo do Drive com o token OAuth
do servidor e repassa os bytes via streaming — o vídeo nunca é duplicado em outro storage, só
"passa" pelo servidor no momento exato da publicação. Ver `lib/server/meta/video-source.ts`.

**Configuração** (reaproveita o mesmo app OAuth do Google já usado pelo upload de YouTube —
ver `.env.local.example`):
1. `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` — um app OAuth do Google
   Cloud com a Drive API habilitada.
2. `DRIVE_STREAM_SECRET` — assina as URLs do passo acima. Gere com `openssl rand -hex 24`.
3. `PUBLIC_BASE_URL` — precisa apontar pro domínio público de produção (a Meta busca o vídeo
   nesse domínio).
4. Conectar em **Configurações → Google Drive → Conectar** (fluxo OAuth normal, tokens
   persistidos em `google_drive_tokens` no Supabase — sobrevive a cold starts na Vercel,
   diferente da versão anterior que guardava em SQLite/`/tmp`).
5. Rode `supabase/migrations/0002_google_drive_storage.sql` no Supabase (cria a tabela de
   tokens e as colunas novas em `scheduled_posts`).

Na tela de agendamento (`/publicar`), com o Drive conectado, um checkbox "Guardar no Google
Drive" aparece marcado por padrão — desmarcar volta para o upload local/Vercel Blob de sempre.

## 4. Arquitetura do código

```
lib/server/crypto.ts          — AES-256-GCM para tokens em repouso
lib/server/supabase-admin.ts  — cliente Supabase server-only (service role)
lib/server/db.ts              — schema SQLite + repos do EDITOR (profiles/templates/batches) —
                                 não tem nada da integração Meta desde a migração pra Supabase
lib/server/scheduler.ts       — runDueScheduledPosts(): varre e processa destinos pendentes

lib/server/meta/
  config.ts                   — env vars, versão fixa da Graph API, scopes
  graph-client.ts              — fetch tipado com erro (MetaGraphError/MetaNetworkError),
                                 classifica recuperável vs erro de auth; se o `fetch` nativo
                                 falhar (ex.: bloqueio de rede/antivírus em algumas máquinas
                                 Windows), cai automaticamente para um request via `node:https`
                                 antes de desistir
  db.ts          (meta-db)    — repos Supabase (social_accounts, scheduled_posts,
                                 scheduled_post_accounts, publication_logs, meta_oauth_states,
                                 meta_oauth_sessions, meta_integration_logs) — todas async
  log.ts         (meta-log)   — logMetaStep()/logMetaApiError(): logger estruturado (console +
                                 meta_integration_logs) para as etapas META_OAUTH_STARTED,
                                 META_OAUTH_CALLBACK, META_TOKEN_RECEIVED, META_PAGES_FETCHED,
                                 META_INSTAGRAM_ACCOUNT_FOUND, META_ACCOUNT_SAVED,
                                 META_CONNECTION_VALIDATED, META_MEDIA_CONTAINER_CREATED,
                                 META_MEDIA_PROCESSING, META_MEDIA_PUBLISHED, META_API_ERROR
  auth.ts        (meta-auth)  — fluxo "Conectar Facebook": URL de login, troca code→token,
                                 token curto→longo, via Página do Facebook
  instagram-auth.ts           — fluxo "Conectar Instagram" (PRINCIPAL): URL de login direto
                                 no Instagram, troca code→token, refresh de token de longa
                                 duração (ig_refresh_token) — não depende de Página nenhuma
  pages.ts       (meta-pages) — lista Páginas + Instagram vinculado (/me/accounts) — só usado
                                 pelo fluxo "Conectar Facebook"
  instagram.ts   (meta-instagram) — container → poll status → media_publish (comum aos dois
                                 fluxos de conexão do Instagram)
  facebook.ts    (meta-facebook)  — video_reels: start → transfer (por URL) → finish
  publish.ts     (meta-publish)   — orquestra 1 destino: claim atômico, chama o adapter
                                     certo, grava resultado/erro/retry, nunca deixa uma
                                     conta com erro afetar as demais
  token.ts       (meta-token) — checa validade via /debug_token, marca expired/revoked,
                                 persiste os escopos concedidos em social_accounts.permissions
  signed-request.ts           — valida signed_request da Meta (deauthorize/data-deletion)
  types.ts                    — todos os tipos de domínio + tipos de resposta da Graph API

app/api/meta/
  instagram/auth/route.ts             — GET: fluxo PRINCIPAL "Conectar Instagram" — gera
                                         state, redireciona pro diálogo OAuth do Instagram
  instagram/callback/route.ts         — GET: troca token, busca perfil, já salva a conta
                                         direto (sem etapa de seleção — não há Páginas a
                                         escolher, a própria conta autorizada é o ativo)
  auth/route.ts                       — GET: fluxo alternativo "Conectar Facebook" — gera
                                         state, redireciona pro diálogo OAuth da Meta
  callback/route.ts                   — GET: valida state, troca token, descobre Páginas/IG,
                                         guarda numa sessão de descoberta, redireciona com
                                         ?meta_session=
  discover/route.ts                   — GET ?session=: devolve os ativos achados (sem tokens)
  accounts/route.ts                   — GET: lista contas conectadas; POST: finaliza a seleção
  accounts/[id]/route.ts              — DELETE: desconecta (revoga local, apaga token, mantém
                                         histórico)
  accounts/[id]/verify/route.ts       — POST: "Testar conexão" (debug_token), persiste escopos
  accounts/[id]/diagnostics/route.ts  — GET: conta + últimos eventos de meta_integration_logs
                                         (dados do modal de diagnóstico)
  accounts/[id]/test-publish/route.ts — POST: "Publicar Reel teste" — publica IMEDIATAMENTE
                                         nessa conta (bypassa a fila de agendamento de propósito)
  deauthorize/route.ts                — POST: callback oficial de "app removido" da Meta
  data-deletion/route.ts              — POST: callback oficial de "excluir meus dados" da Meta
  data-deletion/status/route.ts       — GET: página de status exigida pela Meta

app/api/scheduled-posts/
  route.ts                      — GET: lista posts+destinos; POST: cria post com N destinos
  run-due/route.ts              — POST: dispara o scheduler (chamado por cron externo)

app/(dashboard)/contas-meta/page.tsx  — tela "Contas conectadas" + seleção pós-OAuth
app/(dashboard)/publicar/page.tsx     — tela "Novo conteúdo" + fila + status summary
components/meta/connection-diagnostics-modal.tsx — modal "Diagnóstico da conexão": IG Account
  ID, Página vinculada, status do token, permissões, última validação, erro da API, botões
  Testar conexão e Publicar Reel teste
components/meta/*                     — demais componentes dessas telas
```

> Os dois fluxos de conexão são oficiais e coexistem por design: **"Conectar Instagram"**
> (`lib/server/meta/instagram-auth.ts` + `/api/meta/instagram/auth|callback`) é o caminho
> principal — não exige Página do Facebook, ideal pra maioria das contas de clientes.
> **"Conectar Facebook"** (via Página) continua disponível pra quem já opera assim e quer os
> recursos extras de Business Manager (insights agregados, gerenciar Página e Instagram do
> mesmo lugar). Ambos salvam em `social_accounts` com `platform = 'INSTAGRAM'`; o campo
> `metadata.authFlow` (`"instagram_login"` ou ausente/Página) diferencia qual host da Graph API
> usar em cada publicação — ver `lib/server/meta/publish.ts`.

## 5. Como testar localmente

1. Preencha `META_APP_ID`, `META_APP_SECRET`, `META_TOKEN_ENCRYPTION_KEY`.
2. Exponha `localhost:7070` publicamente (a Meta não aceita `localhost` no redirect nem no
   download do vídeo): `ngrok http 7070` ou Cloudflare Tunnel.
3. Defina `META_REDIRECT_URI=https://SUA-URL-NGROK/api/meta/callback` e `PUBLIC_BASE_URL=https://SUA-URL-NGROK`
   — e cadastre essa mesma `META_REDIRECT_URI` no app da Meta (passo 3 da seção 2). Como o
   callback chega pela URL do túnel mas o painel é aberto em `localhost`, defina também
   `META_DASHBOARD_BASE_URL=http://127.0.0.1:7070` (ou a porta que estiver usando) para o
   redirect final voltar pro painel local em vez de tentar voltar pro túnel.
4. `npm run dev` e acesse `/contas-meta`. **Os dois processos (`npm run dev` e o túnel `ngrok`)
   precisam estar rodando ao mesmo tempo** — se o túnel cair ou o `npm run dev` não estiver de
   pé, o login da Meta falha ao tentar chamar o callback.
5. Clique em **Conectar Meta** — como o app está em modo de desenvolvimento, só funciona para
   contas cadastradas como administrador/testador do app (Meta Developers → Funções). Se as
   permissões de Páginas/Instagram do app ainda não estiverem liberadas, comece com
   `META_OAUTH_SCOPE_MODE` ausente (modo básico) só para validar o login em si, e mude para
   `META_OAUTH_SCOPE_MODE=publish` quando for testar a descoberta de Páginas/Instagram (ver
   "Estratégia de dois estágios" na seção 1).
6. Depois de autorizar, você verá a lista de Páginas/Instagram encontrados — escolha o que
   conectar. Nada é conectado sem essa confirmação explícita.
7. Na tela **Contas conectadas**, clique no ícone de estetoscópio de uma marca pra abrir o
   **Diagnóstico da conexão** — mostra IG Account ID, Página vinculada, status do token,
   permissões concedidas, última validação e o histórico de eventos. Use **Testar conexão**
   pra confirmar que o token ainda funciona, e **Publicar Reel teste** pra publicar 1 vídeo
   nessa única conta sem passar pela fila de agendamento (ver seção 6.1).

## 6. Como publicar

Na tela **Publicar** (`/publicar`): envie um vídeo, escreva a legenda, marque as contas
conectadas de destino e clique em **Publicar agora**. Isso:

1. Cria 1 `scheduled_posts` + 1 `scheduled_post_accounts` por conta marcada (todas com status
   `scheduled`).
2. Dispara o processamento em segundo plano (sem travar a resposta HTTP — o processamento do
   Instagram pode levar minutos).
3. Para cada conta: Instagram cria o container (`media_type=REELS`), espera `status_code=FINISHED`
   (checagem oficial recomendada: 1x/min, até 5x) e então publica (`media_publish`). Facebook
   abre upload (`video_reels`, `upload_phase=start`), transfere por URL (o vídeo já está
   público) e fecha com `upload_phase=finish` + `video_state=PUBLISHED`.
4. A tela atualiza sozinha a cada 15s mostrando o status de cada destino independentemente —
   uma conta falhando não cancela nem atrasa as demais.

### 6.1. Publicar Reel teste (sem agendamento)

`POST /api/meta/accounts/[id]/test-publish` (botão no modal de diagnóstico) publica
**imediatamente** numa única conta, sem criar `scheduled_posts`/`scheduled_post_accounts` — só
recebe `{ videoUrl, caption }`, chama o mesmo `publishInstagramReel`/`publishFacebookReel` da
fila normal e devolve `{ mediaId }`. Existe de propósito separado do fluxo de agendamento: a
sequência recomendada é *conectar → listar → validar → publicar manualmente* funcionando de
ponta a ponta numa conta real antes de confiar no scheduler (seção 8) pra publicar sozinho.

## 7. Como agendar

Mesma tela: escolha data/hora em vez de "Publicar agora" e clique em **Agendar publicação**. O
post fica com `scheduled_at` no futuro e status `scheduled` em cada destino, até o scheduler (ver
seção 8) encontrá-lo como "due" e processar.

## 8. Scheduler em produção

`POST /api/scheduled-posts/run-due` processa tudo que está pendente e "vencido" (agendado pra
agora/antes, ou um retry cujo `next_attempt_at` já passou). Ele **não roda sozinho** — precisa ser
chamado periodicamente. Também aceita **GET** (alias do POST) especificamente porque o Vercel
Cron Jobs só dispara requisições GET.

**Já vem configurado** um Cron Job da própria Vercel em [`vercel.json`](../vercel.json)
(`0 3 * * *` — todo dia às 3h UTC). **Importante sobre o plano Hobby**: a Vercel só permite
crons **1x por dia** no plano Hobby — qualquer coisa mais frequente exige plano Pro. Isso
significa que, no Hobby, um post agendado pra "hoje às 14h" só é efetivamente publicado na
próxima janela do cron (pode levar até ~24h de atraso). Duas opções pra publicação em horário
preciso sem precisar upgrade:

- **Serviço de ping externo gratuito** (ex. [cron-job.org](https://cron-job.org)) chamando
  `POST https://SEU_DOMINIO/api/scheduled-posts/run-due` a cada 1-5 minutos — não depende do
  plano da Vercel, é só uma chamada HTTP de fora.
- **Upgrade pra Vercel Pro** e reduzir o `schedule` do `vercel.json` (ex. `*/5 * * * *`).

Endpoint protegido por `CRON_SECRET` (opcional, recomendado): se definida, só aceita chamadas
com `Authorization: Bearer <CRON_SECRET>` — a própria Vercel Cron Job já envia esse header
sozinha quando a env var existe; um serviço de ping externo precisa ser configurado pra mandar
esse header manualmente (ou deixe `CRON_SECRET` em branco pra abrir o endpoint, já que ele é
idempotente e seguro de chamar repetido).

Processa até 5 destinos em paralelo por rodada (`lib/server/scheduler.ts`, `CONCURRENCY`), pra não
sobrecarregar a Graph API com 30-100 contas. Cada destino é reivindicado atomicamente
(`scheduledPostAccountsRepo.claim`) antes de qualquer chamada de rede — rodar `run-due` em paralelo
ou repetido nunca publica a mesma coisa duas vezes.

## 9. Como diagnosticar erros

- **`publication_logs`** (Supabase) guarda toda tentativa de publicação (sucesso ou falha), com
  `error_code`/`error_message` — nunca um token. Consulte pelo Table Editor do Supabase ou pela
  aba "Histórico de eventos" do modal de diagnóstico (`/contas-meta`).
- **`meta_integration_logs`** (Supabase) guarda cada etapa granular do fluxo (OAuth, descoberta,
  validação, publicação), com `endpoint`/`http_status`/`meta_error_code`/`meta_error_subcode`/
  `fbtrace_id` — é o que alimenta o modal de diagnóstico e o que você deve mandar pro suporte da
  Meta se abrir um ticket (o `fbtrace_id` identifica a chamada do lado deles).
- **Erros recuperáveis** (rate limit — códigos Graph 4/17/32/613 — instabilidade temporária,
  timeout de rede) entram em retry automático com backoff exponencial (1, 2, 4, 8, 16 minutos),
  até 5 tentativas (`lib/server/meta/publish.ts`, `MAX_ATTEMPTS`/`BACKOFF_BASE_MS`). Depois disso
  o destino vira `failed` definitivamente.
- **Erros não recuperáveis** (token inválido/revogado — código Graph 190 — Página/conta removida,
  vídeo inválido) marcam o destino como `failed` imediatamente, sem retry, e — se for erro de
  autenticação — marcam a conta como `expired` na tela Contas Meta, pedindo reconexão.
- **"Arquivo inacessível"**: a Meta não conseguiu baixar `PUBLIC_BASE_URL + video_url` — confirme
  que a URL está mesmo pública (não atrás de VPN/túnel caído) e que o `Content-Type` do vídeo está
  correto.

## 10. Ciclo de vida do token

Cada conta guarda o **Page Access Token** da Página autorizada (usado tanto para publicar no
Facebook quanto — quando há Instagram vinculado — no Instagram daquela Página, que usa o mesmo
token). Um token derivado de um **token de usuário de longa duração** (~60 dias, gerado no
callback via `fb_exchange_token`) não expira sozinho por tempo — só para de funcionar se: a senha
do Facebook do usuário mudar, o app for desautorizado, a permissão for removida, ou a Página/conta
for removida/desvinculada.

- **Verificar validade sob demanda**: `POST /api/meta/accounts/[id]/verify` chama
  `/debug_token` (autenticado com `META_APP_ID|META_APP_SECRET`, nunca gasta o token da conta) e
  atualiza `status` de acordo.
- **Detectar automaticamente**: toda tentativa de publicação que falhar com erro de autenticação
  (código 190) marca a conta como `expired` na hora (`lib/server/meta/publish.ts`).
- **Reconectar**: clicar em **Conectar Meta** de novo e reselecionar o mesmo ativo — o
  `UNIQUE (platform, platform_account_id)` faz um `UPDATE` na mesma linha (token novo, status volta
  pra `connected`), sem duplicar nem afetar as outras contas.
- Não há um "refresh token" separado nesse fluxo (diferente do Google) — "renovar" na prática é
  reautenticar. Uma rotina periódica chamando `checkAccountToken()` para todas as contas
  conectadas (ex.: 1x/dia, via o mesmo mecanismo de cron da seção 8) é recomendada em produção
  para detectar revogação antes da próxima tentativa de publicação.

## 11. App Review — o que você precisa fazer manualmente

**O assistente não pode e não vai**: criar uma empresa em seu nome, fazer a verificação de
identidade/negócio, aceitar os termos da plataforma Meta por você, ou concluir a submissão da App
Review sem sua participação. Isso é sempre uma ação sua, na sua conta Meta Developers.

### Permissões pedidas (`lib/server/meta/config.ts`)

| Permissão | Por quê | App Review | Advanced Access |
|---|---|---|---|
| `pages_show_list` | Listar as Páginas que a pessoa administra | Não | Não precisa (Standard já serve) |
| `pages_read_engagement` | Ler dados básicos da Página (nome, categoria) | Não | Não precisa |
| `pages_manage_posts` | Publicar Reels na Página | **Sim** | **Sim**, se for gerenciar Páginas que você não é dono/admin (o caso normal com contas de clientes) |
| `instagram_basic` | Ler perfil/mídia da conta profissional do Instagram | **Sim** | **Sim** |
| `instagram_content_publish` | Publicar Reels no Instagram | **Sim** | **Sim** |
| `business_management` | Ler/gerenciar ativos via Business Manager (necessário em vários fluxos de agência) | **Sim** | **Sim** |

**Standard Access** (padrão, sem revisão) só é suficiente se o app publicar exclusivamente nas
*suas próprias* contas. Como o objetivo aqui é publicar em contas de clientes/terceiros, o app
precisa de **Advanced Access** em `pages_manage_posts`, `instagram_basic` e
`instagram_content_publish` — o que exige App Review aprovada e, quase sempre,
**Verificação de Negócios (Business Verification)** feita no Meta Business Manager (documento da
empresa, endereço, etc. — 100% manual, é você quem faz).

### URLs necessárias (Configurações → Básico do app)

- Callback OAuth: valor de `META_REDIRECT_URI` (ex.: `https://SEU_DOMINIO/api/meta/callback`)
- URL de exclusão de dados: `https://SEU_DOMINIO/api/meta/data-deletion`
- Callback de desautorização: `https://SEU_DOMINIO/api/meta/deauthorize`
- Política de privacidade: você precisa publicar uma e informar a URL
- Termos de serviço: recomendado

### Roteiro de demonstração para a revisão

A Meta pede um vídeo/roteiro mostrando o app em uso. Sugestão de roteiro (grave uma tela real):

1. Login no sistema → tela **Contas Meta** → clicar em **Conectar Meta**.
2. Login/consentimento da Meta, mostrando as permissões pedidas.
3. Tela de seleção mostrando as Páginas/Instagram encontrados, marcando algumas.
4. Voltar pra **Contas Meta** e mostrar as contas conectadas com status "Conectado".
5. Ir em **Publicar**, enviar um vídeo, escrever legenda, marcar 1+ contas, clicar em
   **Publicar agora**.
6. Mostrar o status mudando (Publicando… → Publicado) e o post real aparecendo no Instagram/
   Facebook da conta de teste.
7. Voltar em **Contas Meta** e mostrar o botão **Desconectar** funcionando.

### Passos gerais da App Review

1. Preencha as URLs da seção acima em Configurações → Básico.
2. Em **Revisão do App → Permissões e recursos**, solicite Advanced Access para as permissões
   marcadas na tabela.
3. Grave o roteiro de demonstração (passo anterior) e escreva, para cada permissão, *por que* o
   app precisa dela (pode reaproveitar a coluna "Por quê" da tabela).
4. Se pedido, complete a **Verificação de Negócios** no Business Manager antes de submeter.
5. Submeta e aguarde — a Meta normalmente responde em alguns dias úteis, podendo pedir ajustes.

## 12. Checklist para produção

- [ ] Deploy com domínio HTTPS real (não túnel) — atualizar `META_REDIRECT_URI` e
      `PUBLIC_BASE_URL`, e recadastrar o redirect URI no app da Meta.
- [ ] `META_TOKEN_ENCRYPTION_KEY` gerada com `openssl rand -base64 32` e guardada num cofre de
      secrets do ambiente de produção (nunca commitada).
- [ ] Cron/scheduler externo apontando pra `POST /api/scheduled-posts/run-due` (seção 8).
- [ ] App em modo **Live** com Advanced Access aprovado (seção 11) e, se aplicável, Verificação
      de Negócios concluída.
- [ ] Política de privacidade e termos publicados e linkados no app da Meta.
- [ ] Testar o fluxo completo (conectar → publicar → agendar → reconectar) contra o domínio de
      produção antes de conectar as contas reais dos clientes.
