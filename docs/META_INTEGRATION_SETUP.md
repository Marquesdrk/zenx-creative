# Integração Meta (Instagram + Facebook) — guia de configuração

Esta integração permite conectar **múltiplas contas** do Instagram e Páginas do Facebook (pensada
para ~30-100 contas) através de **1 único app da Meta**, via OAuth — cada conta conectada tem seu
próprio token, guardado criptografado, isolado das demais. Publica Reels no Instagram e Facebook,
com agendamento multi-destino (1 vídeo → N contas, status independente por conta).

> **Importante sobre a arquitetura real deste projeto**: o pedido original descrevia uma stack
> Lovable + Supabase Auth + Postgres + RLS. O projeto real é **Next.js 16 (App Router) self-hosted
> + SQLite local (`node:sqlite`), sem nenhum sistema de login** — é uma ferramenta de operador
> único (você/sua equipe), não um SaaS multi-usuário. A integração foi adaptada a essa realidade:
> Supabase Edge Functions → Route Handlers do Next.js (`app/api/...`); Postgres + RLS → SQLite +
> autorização "toda conta pertence ao único operador do sistema" (não existem outros usuários pra
> segregar); Supabase Auth → não existe autenticação, e não foi adicionada (você escolheu manter
> single-tenant ao responder as perguntas de esclarecimento). Se algum dia o sistema ganhar login
> multi-usuário, as tabelas já têm uma coluna `user_id` reservada e sem uso pra facilitar essa
> migração futura.

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
| `META_TOKEN_ENCRYPTION_KEY` | Sim | Chave AES-256-GCM (`openssl rand -base64 32`) usada para criptografar cada token de conta antes de gravar no SQLite. Trocar essa chave invalida todos os tokens salvos. |
| `META_GRAPH_API_VERSION` | Não (default `v26.0`) | Versão fixa da Graph API usada em todas as chamadas — ver `lib/server/meta/config.ts`. |
| `PUBLIC_BASE_URL` | Sim, para publicar | URL pública HTTPS onde o app roda — a Meta baixa o vídeo renderizado a partir daqui. Já era usada pelos adapters antigos de Instagram/Facebook/TikTok. |
| `META_OAUTH_SCOPE_MODE` | Não (default: modo básico) | `publish` pede o conjunto completo de permissões (Páginas + Instagram + publicação, seção 11). Deixe sem definir (ou qualquer outro valor) para pedir só `public_profile` — útil pra validar o OAuth num app recém-criado, antes da Meta liberar Páginas/Instagram para ele. Ver "Estratégia de dois estágios" logo abaixo. |
| `META_OAUTH_SCOPES` | Não | Lista de escopos separada por vírgula, para sobrepor manualmente tanto o modo básico quanto o `publish` (ex.: testar um subconjunto específico de permissões). Se definida, tem prioridade sobre `META_OAUTH_SCOPE_MODE`. |
| `META_DASHBOARD_BASE_URL` | Não (default: origem da própria requisição em produção; `http://127.0.0.1:PORT` em dev) | Para onde o navegador é redirecionado de volta depois do OAuth. Necessária quando o callback chega por uma URL pública (ex.: túnel ngrok) mas você abre o painel pelo `localhost` — sem isso, o redirect final tentaria voltar para a URL do túnel em vez do painel local. |

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

Migração puramente aditiva em `lib/server/db.ts` (nenhuma tabela existente foi alterada). Cada
conta social conectada é **uma linha independente** — nunca colunas tipo `instagram_1`,
`instagram_2`.

```
social_accounts
  id, user_id (reservado, sempre null hoje), platform ('INSTAGRAM'|'FACEBOOK'),
  platform_account_id, page_id, instagram_user_id, account_name, username,
  profile_picture_url, access_token_encrypted, token_expires_at,
  status ('connected'|'expired'|'revoked'|'error'), meta_user_id,
  last_checked_at, last_error, metadata, created_at, updated_at
  UNIQUE (platform, platform_account_id)  -- reconectar faz UPDATE, nunca duplica

meta_oauth_states        -- CSRF: state de uso único, expira em 10 min
meta_oauth_sessions       -- cache curto (15 min) dos ativos descobertos após o OAuth,
                          -- criptografado inteiro (contém os page access tokens),
                          -- até o usuário escolher o que conectar

scheduled_posts
  id, user_id, video_url, caption, scheduled_at, status, created_at, updated_at

scheduled_post_accounts   -- 1 linha por destino: 1 vídeo → N contas, status independente
  id, scheduled_post_id, social_account_id, status, external_post_id,
  error_code, error_message, recoverable, attempt_count, next_attempt_at,
  published_at, created_at, updated_at

publication_logs          -- auditoria — nunca grava token completo
  id, user_id, scheduled_post_id, social_account_id, platform, action, status,
  external_post_id, error_code, error_message, metadata, created_at
```

**Tokens em repouso**: `access_token_encrypted` é sempre o resultado de
`encryptSecret()` (`lib/server/crypto.ts`, AES-256-GCM com `META_TOKEN_ENCRYPTION_KEY`) — nunca
texto puro. Nenhuma rota de API devolve esse campo; `socialAccountsRepo.getAccessToken()` é a
única forma de obter o token decodificado, e só é chamada em código server-side de publicação
(`lib/server/meta/publish.ts`).

**Sobre RLS**: como o banco é SQLite local (não Postgres), Row Level Security no sentido do
Supabase não existe aqui. Como o sistema é single-tenant (sem login), a "política de segurança"
equivalente é: todo o SQLite fica só no servidor, nenhuma rota de API expõe token, e todas as
consultas por padrão retornam o conjunto inteiro de contas (porque há um único operador). Se o
sistema ganhar multi-usuário no futuro, toda query dos repos em `lib/server/db.ts` precisará
passar a filtrar por `user_id` — a coluna já existe pra isso.

## 4. Arquitetura do código

```
lib/server/crypto.ts          — AES-256-GCM para tokens em repouso
lib/server/db.ts              — schema SQLite + repos (social_accounts, scheduled_posts, ...)
lib/server/scheduler.ts       — runDueScheduledPosts(): varre e processa destinos pendentes

lib/server/meta/
  config.ts                   — env vars, versão fixa da Graph API, scopes
  graph-client.ts             — fetch tipado com erro (MetaGraphError/MetaNetworkError),
                                 classifica recuperável vs erro de auth; se o `fetch` nativo
                                 falhar (ex.: bloqueio de rede/antivírus em algumas máquinas
                                 Windows), cai automaticamente para um request via `node:https`
                                 antes de desistir
  auth.ts        (meta-auth)  — URL de login, troca code→token, token curto→longo
  pages.ts       (meta-pages) — lista Páginas + Instagram vinculado (/me/accounts)
  instagram.ts   (meta-instagram) — container → poll status → media_publish
  facebook.ts    (meta-facebook)  — video_reels: start → transfer (por URL) → finish
  publish.ts     (meta-publish)   — orquestra 1 destino: claim atômico, chama o adapter
                                     certo, grava resultado/erro/retry, nunca deixa uma
                                     conta com erro afetar as demais
  token.ts       (meta-token) — checa validade via /debug_token, marca expired/revoked
  signed-request.ts           — valida signed_request da Meta (deauthorize/data-deletion)
  types.ts                    — todos os tipos de domínio + tipos de resposta da Graph API

app/api/meta/
  auth/route.ts                — GET: gera state, redireciona pro diálogo OAuth
  callback/route.ts             — GET: valida state, troca token, descobre Páginas/IG,
                                  guarda numa sessão de descoberta, redireciona com ?meta_session=
  discover/route.ts             — GET ?session=: devolve os ativos achados (sem tokens)
  accounts/route.ts             — GET: lista contas conectadas; POST: finaliza a seleção
  accounts/[id]/route.ts        — DELETE: desconecta (revoga local, apaga token, mantém histórico)
  accounts/[id]/verify/route.ts — POST: checa o token agora (debug_token)
  deauthorize/route.ts          — POST: callback oficial de "app removido" da Meta
  data-deletion/route.ts        — POST: callback oficial de "excluir meus dados" da Meta
  data-deletion/status/route.ts — GET: página de status exigida pela Meta

app/api/scheduled-posts/
  route.ts                      — GET: lista posts+destinos; POST: cria post com N destinos
  run-due/route.ts              — POST: dispara o scheduler (chamado por cron externo)

app/(dashboard)/contas-meta/page.tsx  — tela "Contas conectadas" + seleção pós-OAuth
app/(dashboard)/publicar/page.tsx     — tela "Novo conteúdo" + fila + status summary
components/meta/*                     — componentes de cada uma dessas telas
```

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

## 7. Como agendar

Mesma tela: escolha data/hora em vez de "Publicar agora" e clique em **Agendar publicação**. O
post fica com `scheduled_at` no futuro e status `scheduled` em cada destino, até o scheduler (ver
seção 8) encontrá-lo como "due" e processar.

## 8. Scheduler em produção

`POST /api/scheduled-posts/run-due` processa tudo que está pendente e "vencido" (agendado pra
agora/antes, ou um retry cujo `next_attempt_at` já passou). Ele **não roda sozinho** — precisa ser
chamado periodicamente. Este projeto não usa Supabase (o banco é SQLite local), então não há
"Supabase Cron" — escolha uma destas opções:

- **Cron do sistema operacional** (VPS próprio): `* * * * * curl -X POST https://SEU_DOMINIO/api/scheduled-posts/run-due`
  a cada minuto.
- **Serviço de ping externo** (cron-job.org, EasyCron, etc.) apontando pra essa URL.
- **Vercel Cron / plataforma equivalente**, se decidir migrar o deploy pra lá.
- Manualmente, pelo botão **"Rodar pendentes"** na tela Publicar (útil em desenvolvimento).

Processa até 5 destinos em paralelo por rodada (`lib/server/scheduler.ts`, `CONCURRENCY`), pra não
sobrecarregar a Graph API com 30-100 contas. Cada destino é reivindicado atomicamente
(`scheduledPostAccountsRepo.claim`) antes de qualquer chamada de rede — rodar `run-due` em paralelo
ou repetido nunca publica a mesma coisa duas vezes.

## 9. Como diagnosticar erros

- **`publication_logs`** guarda toda tentativa de publicação (sucesso ou falha), com
  `error_code`/`error_message` — nunca um token. Consulte diretamente no SQLite
  (`data/zenx.sqlite`) ou exponha numa tela de auditoria futura.
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
