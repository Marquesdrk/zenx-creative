/** Horários de pico de engajamento no Instagram, dentro da janela 8h-22h pedida — cobre o
 *  trajeto matinal, o intervalo de almoço, o fim de tarde e o horário de lazer à noite, que é
 *  onde a maioria dos estudos de melhor horário de postagem (Later, Hootsuite, Sprout Social)
 *  convergem para contas de entretenimento/lifestyle. Não é uma pesquisa ao vivo — é um padrão
 *  fixo, ajustável aqui se o usuário perceber horários melhores pro próprio público. */
export const BEST_TIME_SLOTS = ["08:00", "11:00", "13:00", "15:00", "17:00", "19:00", "21:00"];

export const MAX_VIDEOS_PER_DAY = BEST_TIME_SLOTS.length;

/** Escolhe `count` horários dentre os disponíveis (`BEST_TIME_SLOTS` por padrão, mas o usuário
 *  pode substituir pelos próprios horários — ver TimeSlotsEditor), espaçados o mais
 *  uniformemente possível ao longo do dia (em vez de sempre pegar os N primeiros) — com 2
 *  vídeos/dia, por exemplo, usa um de manhã e um à noite em vez de dois seguidos de manhã. */
export function pickTimeSlots(count: number, availableSlots: string[] = BEST_TIME_SLOTS): string[] {
  const slots = availableSlots.length > 0 ? availableSlots : BEST_TIME_SLOTS;
  const clamped = Math.max(1, Math.min(count, slots.length));
  if (clamped === slots.length) return [...slots];
  if (clamped === 1) return [slots[Math.floor((slots.length - 1) / 2)]];
  const step = (slots.length - 1) / (clamped - 1);
  const indices = Array.from({ length: clamped }, (_, i) => Math.round(i * step));
  return indices.map((i) => slots[i]);
}

function atTime(day: Date, hhmm: string): Date {
  const [hours, minutes] = hhmm.split(":").map(Number);
  const result = new Date(day);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Distribui `count` vídeos em `perDay` por dia, nos melhores horários (ou nos horários
 *  customizados em `availableSlots`), a partir de agora — pula qualquer horário que já tenha
 *  passado hoje em vez de agendar no passado. Devolve um timestamp por vídeo, na mesma ordem (o
 *  vídeo mais antigo no Drive publica primeiro). */
export function planSchedule(count: number, perDay: number, from: Date = new Date(), availableSlots: string[] = BEST_TIME_SLOTS): Date[] {
  const slots = pickTimeSlots(perDay, availableSlots);
  const result: Date[] = [];
  let dayOffset = 0;
  // Se algum horário de hoje ainda não passou, começa hoje; senão só amanhã.
  const hasSlotLeftToday = slots.some((slot) => atTime(from, slot).getTime() > from.getTime());
  if (!hasSlotLeftToday) dayOffset = 1;

  let index = 0;
  while (index < count) {
    const day = addDays(from, dayOffset);
    for (const slot of slots) {
      if (index >= count) break;
      const candidate = atTime(day, slot);
      if (candidate.getTime() <= from.getTime()) continue;
      result.push(candidate);
      index += 1;
    }
    dayOffset += 1;
  }
  return result;
}
