import { analyzeVideoSource } from "./source-analysis";
import type { SourceAnalysis } from "./types";

export const PROCESSING_STAGE_MS = 1000;

export type ImportAnalysisUpdate =
  | { status: "ANALYZING" }
  | { status: "AWAITING_REVIEW"; analysis: SourceAnalysis | null };

/**
 * IMPORTING -> ANALYZING -> AWAITING_REVIEW, escalonado por item. A etapa ANALYZING roda a
 * normalização de verdade (fase 3: resolução/aspect ratio real + detecção de barras via
 * canvas) quando há um `contentUrl` real; para arquivos do Google Drive mockado (sem
 * conteúdo real), resolve direto com `analysis: null`.
 */
export function scheduleImportAnalysis(
  index: number,
  contentUrl: string | null,
  update: (result: ImportAnalysisUpdate) => void
): () => void {
  let cancelled = false;
  const stagger = index * 300;

  const toAnalyzing = setTimeout(() => {
    if (cancelled) return;
    update({ status: "ANALYZING" });
  }, stagger + PROCESSING_STAGE_MS);

  const toAwaitingReview = setTimeout(async () => {
    const analysis = contentUrl ? await analyzeVideoSource(contentUrl).catch(() => null) : null;
    if (cancelled) return;
    update({ status: "AWAITING_REVIEW", analysis });
  }, stagger + PROCESSING_STAGE_MS * 2);

  return () => {
    cancelled = true;
    clearTimeout(toAnalyzing);
    clearTimeout(toAwaitingReview);
  };
}

/** Simula a renderização em fila após a confirmação do lote: PROCESSING -> COMPLETED. */
export function scheduleRender(
  index: number,
  update: (status: "PROCESSING" | "COMPLETED") => void
): () => void {
  const stagger = index * 300;
  const toProcessing = setTimeout(() => update("PROCESSING"), stagger + PROCESSING_STAGE_MS);
  const toCompleted = setTimeout(
    () => update("COMPLETED"),
    stagger + PROCESSING_STAGE_MS * 2
  );
  return () => {
    clearTimeout(toProcessing);
    clearTimeout(toCompleted);
  };
}
