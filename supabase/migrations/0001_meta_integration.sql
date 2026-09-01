-- Integração Meta (Instagram + Facebook) — schema Postgres/Supabase.
-- Rode este arquivo inteiro no Supabase Dashboard → SQL Editor → New query → Run.
-- Idempotente (IF NOT EXISTS em tudo) — pode rodar de novo sem duplicar nada.
--
-- Acesso: todo o acesso a estas tabelas acontece via service role key, só em código
-- server-side (lib/server/meta/db.ts). RLS fica habilitado com "deny all" para anon/authenticated
-- porque a service role sempre ignora RLS — isso é só uma segunda camada de proteção caso a
-- ANON_KEY algum dia vaze ou seja usada por engano no cliente.

create extension if not exists pgcrypto;

create table if not exists social_accounts (
  id uuid primary key default gen_random_uuid(),
  -- Reservado para quando o sistema ganhar múltiplos usuários/projetos reais — hoje pode ficar
  -- null (instância operada por um único time). Ver docs/META_INTEGRATION_SETUP.md.
  user_id uuid,
  project_id uuid,
  platform text not null check (platform in ('INSTAGRAM', 'FACEBOOK')),
  platform_account_id text not null,
  page_id text,
  instagram_user_id text,
  account_name text not null,
  username text,
  profile_picture_url text,
  access_token_encrypted text not null,
  token_expires_at timestamptz,
  status text not null default 'connected' check (status in ('connected', 'expired', 'revoked', 'error')),
  meta_user_id text,
  -- Escopos/permissões concedidos no consentimento, capturados via /debug_token — nunca inclui token.
  permissions jsonb not null default '[]'::jsonb,
  last_checked_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, platform_account_id)
);
create index if not exists idx_social_accounts_project on social_accounts (project_id);

create table if not exists meta_oauth_states (
  state text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists meta_oauth_sessions (
  id uuid primary key default gen_random_uuid(),
  meta_user_id text,
  discovered_encrypted text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  project_id uuid,
  video_url text not null,
  caption text not null default '',
  scheduled_at timestamptz,
  status text not null default 'scheduled'
    check (status in ('draft', 'scheduled', 'processing', 'published', 'failed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists scheduled_post_accounts (
  id uuid primary key default gen_random_uuid(),
  scheduled_post_id uuid not null references scheduled_posts (id) on delete cascade,
  social_account_id uuid not null references social_accounts (id) on delete cascade,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'processing', 'published', 'failed', 'cancelled')),
  external_post_id text,
  error_code text,
  error_message text,
  recoverable boolean,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_spa_due on scheduled_post_accounts (status, next_attempt_at);
create index if not exists idx_spa_post on scheduled_post_accounts (scheduled_post_id);

create table if not exists publication_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  scheduled_post_id uuid,
  social_account_id uuid,
  platform text check (platform in ('INSTAGRAM', 'FACEBOOK')),
  action text not null,
  status text not null check (status in ('success', 'failure', 'info')),
  external_post_id text,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_logs_account on publication_logs (social_account_id, created_at);

-- Log estruturado de cada etapa do fluxo Meta (OAuth, descoberta, publicação) — granularidade
-- maior que publication_logs, pensado para diagnóstico técnico (endpoint, http_status,
-- error_code/subcode da Graph API, fbtrace_id). Nunca grava token.
create table if not exists meta_integration_logs (
  id uuid primary key default gen_random_uuid(),
  step text not null,
  social_account_id uuid,
  endpoint text,
  http_status integer,
  meta_error_code integer,
  meta_error_subcode integer,
  message text,
  fbtrace_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_integration_logs_account on meta_integration_logs (social_account_id, created_at);
create index if not exists idx_integration_logs_step on meta_integration_logs (step, created_at);

alter table social_accounts enable row level security;
alter table meta_oauth_states enable row level security;
alter table meta_oauth_sessions enable row level security;
alter table scheduled_posts enable row level security;
alter table scheduled_post_accounts enable row level security;
alter table publication_logs enable row level security;
alter table meta_integration_logs enable row level security;
-- Nenhuma policy é criada de propósito: sem policy, RLS nega tudo para anon/authenticated.
-- A service role key (usada só em lib/server/*) ignora RLS e continua funcionando normalmente.
