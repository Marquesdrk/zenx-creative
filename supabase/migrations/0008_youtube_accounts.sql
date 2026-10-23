-- Canais do YouTube como contas sociais (publicação de Shorts agendados).
-- Rode no Supabase Dashboard → SQL Editor → New query → Run. Idempotente.
--
-- Para linhas YOUTUBE: platform_account_id = ID do canal (UC...), page_id/instagram_user_id = null
-- e access_token_encrypted guarda o REFRESH token do Google (o access token de 1h é obtido na
-- hora de publicar), token_expires_at fica null.

alter table social_accounts drop constraint if exists social_accounts_platform_check;
alter table social_accounts
  add constraint social_accounts_platform_check
  check (platform in ('INSTAGRAM', 'FACEBOOK', 'YOUTUBE'));

alter table publication_logs drop constraint if exists publication_logs_platform_check;
alter table publication_logs
  add constraint publication_logs_platform_check
  check (platform is null or platform in ('INSTAGRAM', 'FACEBOOK', 'YOUTUBE'));
