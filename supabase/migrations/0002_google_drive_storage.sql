-- Google Drive como storage alternativo para vídeos agendados — schema Postgres/Supabase.
-- Rode este arquivo inteiro no Supabase Dashboard → SQL Editor → New query → Run (depois de já
-- ter rodado 0001_meta_integration.sql). Idempotente — pode rodar de novo sem duplicar nada.
--
-- Por quê: o Google Drive OAuth já existia no projeto (lib/server/google-drive.ts) mas guardava
-- o token em SQLite local — em produção na Vercel isso é um /tmp efêmero, então a conexão se
-- perdia a cada cold start. Esta tabela move esse token para o mesmo banco (Supabase) já usado
-- pela integração Meta, resolvendo isso de vez e permitindo Drive como storage de vídeo
-- organizado por conta do Instagram (ver docs/META_INTEGRATION_SETUP.md).

create table if not exists google_drive_tokens (
  id integer primary key default 1,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  scope text,
  token_type text,
  expiry_date bigint,
  updated_at timestamptz not null default now(),
  constraint google_drive_tokens_singleton check (id = 1)
);

alter table scheduled_posts alter column video_url drop not null;
alter table scheduled_posts add column if not exists video_source text not null default 'url'
  check (video_source in ('url', 'drive'));
alter table scheduled_posts add column if not exists drive_file_id text;
alter table scheduled_posts add column if not exists drive_file_name text;
alter table scheduled_posts drop constraint if exists scheduled_posts_video_source_ref_check;
alter table scheduled_posts add constraint scheduled_posts_video_source_ref_check
  check (
    (video_source = 'url' and video_url is not null)
    or (video_source = 'drive' and drive_file_id is not null)
  );

alter table google_drive_tokens enable row level security;
-- Nenhuma policy é criada de propósito: sem policy, RLS nega tudo para anon/authenticated.
-- A service role key (usada só em lib/server/*) ignora RLS e continua funcionando normalmente.
