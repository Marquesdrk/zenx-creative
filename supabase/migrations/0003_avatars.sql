-- Criador de Avatar: personagens de IA gerados por OpenAI (documentos + imagens),
-- guardados no Google Drive do usuário. Schema Postgres/Supabase.
-- Rode este arquivo inteiro no Supabase Dashboard → SQL Editor → New query → Run.
-- Idempotente — pode rodar de novo sem duplicar nada.

create table if not exists openai_credentials (
  id integer primary key default 1,
  api_key_encrypted text not null,
  updated_at timestamptz not null default now(),
  constraint openai_credentials_singleton check (id = 1)
);

create table if not exists avatars (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  engine text not null check (engine in ('REACT', 'X_STYLE', 'UGC')),
  niche text not null default '',
  pain_point text not null default '',
  audience text not null default '',
  promise text not null default '',
  boundaries jsonb not null default '[]'::jsonb,
  tone_adjectives jsonb not null default '[]'::jsonb,
  always_rules jsonb not null default '[]'::jsonb,
  never_rules jsonb not null default '[]'::jsonb,
  signature_phrase text not null default '',
  pillars jsonb not null default '[]'::jsonb,
  visual_style text not null default '',
  voice_notes text not null default '',
  documents jsonb,
  image_urls jsonb,
  drive_folder_id text,
  status text not null default 'draft' check (status in ('draft', 'generating', 'ready', 'failed')),
  error_message text,
  profile_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_avatars_created on avatars (created_at desc);

alter table openai_credentials enable row level security;
alter table avatars enable row level security;
-- Nenhuma policy é criada de propósito: sem policy, RLS nega tudo para anon/authenticated.
-- A service role key (usada só em lib/server/*) ignora RLS e continua funcionando normalmente.
