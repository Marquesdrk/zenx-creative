-- Perfis e templates do Editor em massa — antes viviam só no localStorage do navegador
-- (lib/editor/profiles-store.ts / templates-store.ts), o que impedia usar o Zenx de mais de uma
-- máquina/navegador: cada um tinha sua própria cópia, sem sincronizar. Move para o mesmo banco
-- (Supabase) já usado pelo resto da integração. Schema Postgres/Supabase.
-- Rode este arquivo inteiro no Supabase Dashboard → SQL Editor → New query → Run.
-- Idempotente — pode rodar de novo sem duplicar nada.

create table if not exists editor_templates (
  id text primary key,
  engine text not null check (engine in ('REACT', 'X_STYLE', 'UGC')),
  name text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists editor_profiles (
  id text primary key,
  engine text not null check (engine in ('REACT', 'X_STYLE', 'UGC')),
  name text not null,
  template_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table editor_templates enable row level security;
alter table editor_profiles enable row level security;
-- Nenhuma policy é criada de propósito: sem policy, RLS nega tudo para anon/authenticated.
-- A service role key (usada só em lib/server/*) ignora RLS e continua funcionando normalmente.
