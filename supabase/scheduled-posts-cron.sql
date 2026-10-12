-- Execute no SQL Editor após cadastrar o segredo no Vault com este nome:
-- zenx_scheduled_posts_cron_secret
-- O job chama a aplicação publicada a cada minuto; o POST só processa itens vencidos.
select cron.schedule(
  'zenx-scheduled-posts-every-minute',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://zenx-creative.vercel.app/api/scheduled-posts/run-due',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'zenx_scheduled_posts_cron_secret'
          limit 1
        ),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    ) as request_id;
  $job$
);
