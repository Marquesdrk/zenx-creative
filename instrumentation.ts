// O hook inicializa o relógio de posts apenas no processo Node persistente local.
// Em serverless, o disparo recorrente deve vir de um serviço de cron configurado.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { ensureLocalScheduledPostScheduler } = await import("@/lib/server/scheduler-runtime");
  await ensureLocalScheduledPostScheduler();
}
