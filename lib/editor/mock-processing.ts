export const PROCESSING_STAGE_MS = 1000;

/** Simulates the automatic pipeline: importing -> processing -> ready, staggered per video. */
export function scheduleVideoProcessing(
  index: number,
  update: (status: "processing" | "ready") => void
): () => void {
  const stagger = index * 300;
  const toProcessing = setTimeout(() => update("processing"), stagger + PROCESSING_STAGE_MS);
  const toReady = setTimeout(() => update("ready"), stagger + PROCESSING_STAGE_MS * 2);
  return () => {
    clearTimeout(toProcessing);
    clearTimeout(toReady);
  };
}
