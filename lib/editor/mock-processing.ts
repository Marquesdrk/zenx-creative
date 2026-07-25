export const PROCESSING_STAGE_MS = 1000;

/** Simula a análise automática: IMPORTING -> ANALYZING -> AWAITING_REVIEW, escalonado por item. */
export function scheduleImportAnalysis(
  index: number,
  update: (status: "ANALYZING" | "AWAITING_REVIEW") => void
): () => void {
  const stagger = index * 300;
  const toAnalyzing = setTimeout(() => update("ANALYZING"), stagger + PROCESSING_STAGE_MS);
  const toAwaitingReview = setTimeout(
    () => update("AWAITING_REVIEW"),
    stagger + PROCESSING_STAGE_MS * 2
  );
  return () => {
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
