// Roda uma vez quando o servidor Next.js sobe (hook oficial, ver
// https://nextjs.org/docs/app/guides/instrumentation). Só faz sentido em `next dev`/`next
// start` local: na Vercel, cada invocação de function é uma instância isolada e efêmera — um
// setInterval não sobrevive entre requisições, então lá quem processa os posts vencidos é o
// workflow em .github/workflows/run-scheduled-posts.yml (a cada 5min) + o Cron Job do
// vercel.json como rede de segurança. Sem esse relógio local, nada dispara sozinho aqui —
// alguém precisaria clicar em "Rodar pendentes" toda vez que um post vencesse.
const LOCAL_TICK_MS = 60_000;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.VERCEL) return;

  const { runDueScheduledPosts } = await import("@/lib/server/scheduler");

  console.log(`[scheduler] relógio local ativo — verificando posts vencidos a cada ${LOCAL_TICK_MS / 1000}s`);

  setInterval(() => {
    runDueScheduledPosts()
      .then((result) => {
        if (result.processed > 0) {
          console.log(`[scheduler] ${result.processed} destino(s) processado(s) às ${new Date().toLocaleTimeString("pt-BR")}`);
        }
      })
      .catch((err) => {
        console.error("[scheduler] erro ao rodar posts vencidos:", err instanceof Error ? err.message : err);
      });
  }, LOCAL_TICK_MS);
}
