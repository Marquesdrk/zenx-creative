alter table public.scheduled_post_accounts
  add column if not exists media_container_id text;

notify pgrst, 'reload schema';
