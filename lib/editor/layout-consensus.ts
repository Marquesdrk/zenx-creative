import type { Crop, SourceAnalysis } from "./types";

/** Vídeos de um mesmo lote costumam vir do mesmo perfil e ter o MESMO layout (ex.: miolo nítido
 *  entre duas faixas desfocadas, sempre nas mesmas linhas). Em cenas escuras/lisas a emenda do
 *  layout some e a detecção individual falha — o padrão da maioria resolve esses casos. */
const MIN_AGREEING = 3;
const MIN_SHARE = 0.6;
const AGREE_TOLERANCE = 0.02;

function close(a: Crop, b: Crop) {
  return (
    Math.abs(a.x - b.x) <= AGREE_TOLERANCE &&
    Math.abs(a.y - b.y) <= AGREE_TOLERANCE &&
    Math.abs(a.width - b.width) <= AGREE_TOLERANCE &&
    Math.abs(a.height - b.height) <= AGREE_TOLERANCE
  );
}

/** Recorte que a maioria dos vídeos detectou com segurança (método "seams"), ou null. */
export function consensusCrop(analyses: SourceAnalysis[]): Crop | null {
  const usable = analyses.filter((a) => !a.incomplete && a.width > 0);
  const confident = usable.filter((a) => a.detectionMethod === "seams");
  if (confident.length < MIN_AGREEING || confident.length / usable.length < MIN_SHARE) return null;

  let best: { crop: Crop; votes: number } | null = null;
  for (const candidate of confident) {
    const votes = confident.filter((other) => close(other.suggestedCrop, candidate.suggestedCrop)).length;
    if (!best || votes > best.votes) best = { crop: candidate.suggestedCrop, votes };
  }
  if (!best || best.votes < MIN_AGREEING || best.votes / usable.length < MIN_SHARE) return null;
  const agreeing = confident.filter((other) => close(other.suggestedCrop, best.crop));
  const mean = (pick: (c: Crop) => number) => agreeing.reduce((sum, a) => sum + pick(a.suggestedCrop), 0) / agreeing.length;
  return { x: mean((c) => c.x), y: mean((c) => c.y), width: mean((c) => c.width), height: mean((c) => c.height) };
}

/** O vídeo deve receber o recorte do lote quando a detecção própria não achou o layout (nada ou
 *  só bordas) ou divergiu do padrão que a maioria confirmou. Movimento próprio é respeitado. */
export function shouldUseConsensus(analysis: SourceAnalysis, consensus: Crop): boolean {
  if (analysis.incomplete || analysis.width <= 0) return false;
  if (analysis.detectionMethod === "motion") return false;
  return !close(analysis.suggestedCrop, consensus);
}
