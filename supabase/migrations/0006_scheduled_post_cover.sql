-- Capa opcional por publicação agendada. Lotes reaproveitam a mesma URL em cada publicação.
alter table scheduled_posts add column if not exists cover_url text;

-- Faz a API do Supabase/PostgREST reconhecer a coluna sem aguardar a atualização automática.
notify pgrst, 'reload schema';
