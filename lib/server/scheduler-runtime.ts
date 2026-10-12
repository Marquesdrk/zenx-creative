export type ScheduledPostSchedulerState = {
  enabled: boolean;
  startedAt: string | null;
  running: boolean;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastProcessed: number | null;
  lastError: string | null;
  skippedOverlaps: number;
  timer?: ReturnType<typeof setInterval>;
};

const STATE_KEY = "__zenxScheduledPostSchedulerState";
const LOCAL_TICK_MS = 60_000;

type SchedulerGlobal = typeof globalThis & {
  [key: string]: unknown;
};

function getMutableState(): ScheduledPostSchedulerState {
  const root = globalThis as SchedulerGlobal;
  const existing = root[STATE_KEY] as ScheduledPostSchedulerState | undefined;
  if (existing) return existing;

  const initial: ScheduledPostSchedulerState = {
    enabled: false,
    startedAt: null,
    running: false,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastProcessed: null,
    lastError: null,
    skippedOverlaps: 0,
  };
  root[STATE_KEY] = initial;
  return initial;
}

export function updateScheduledPostSchedulerState(
  update: Partial<ScheduledPostSchedulerState>,
): ScheduledPostSchedulerState {
  const state = getMutableState();
  Object.assign(state, update);
  return state;
}

export function getScheduledPostSchedulerState() {
  const { timer: _timer, ...state } = getMutableState();
  return state;
}

/** Inicia um único relógio dentro do processo Node persistente da aplicação local. */
export async function ensureLocalScheduledPostScheduler() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.VERCEL) return;

  const state = getMutableState();
  if (state.timer) return;

  const { runDueScheduledPosts } = await import("@/lib/server/scheduler");
  const timer = setInterval(async () => {
    const current = getMutableState();
    if (current.running) {
      current.skippedOverlaps += 1;
      return;
    }

    Object.assign(current, { running: true, lastStartedAt: new Date().toISOString() });
    try {
      const result = await runDueScheduledPosts();
      Object.assign(current, {
        lastProcessed: result.processed,
        lastError: null,
        lastFinishedAt: new Date().toISOString(),
      });
      if (result.processed > 0) {
        console.log(`[scheduler] ${result.processed} destino(s) processado(s) às ${new Date().toLocaleTimeString("pt-BR")}`);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const cause = error.cause;
      const causeMessage = cause instanceof Error
        ? `${cause.name}: ${cause.message}`
        : cause && typeof cause === "object"
          ? JSON.stringify(cause)
          : null;
      const message = causeMessage ? `${error.message} (${causeMessage})` : error.message;
      Object.assign(current, { lastError: message, lastFinishedAt: new Date().toISOString() });
      console.error("[scheduler] erro ao rodar posts vencidos:", message);
    } finally {
      current.running = false;
    }
  }, LOCAL_TICK_MS);

  Object.assign(state, {
    enabled: true,
    startedAt: new Date().toISOString(),
    lastError: null,
    timer,
  });
  console.log(`[scheduler] relógio Node ativo — verificando posts vencidos a cada ${LOCAL_TICK_MS / 1000}s`);
}
