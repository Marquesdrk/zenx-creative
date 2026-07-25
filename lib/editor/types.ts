/** Define a lógica de composição aplicada a um lote. */
export type Engine = "REACT" | "X_STYLE" | "UGC";

export type ReactionMedia = {
  id: string;
  label: string;
  /** Object URL do vídeo/imagem de reação enviado. Null enquanto não for enviado. */
  url: string | null;
};

/** Posições sempre relativas (0 a 1), nunca em pixels. */
export type WatermarkPosition = { x: number; y: number; scale: number; opacity: number };
export type CropBox = { x: number; y: number };

export type ReactProfile = {
  id: string;
  name: string;
  engine: "REACT";
  /** Mídias de reação do influencer, enviadas uma vez e reaproveitadas em todo lote. */
  reactionMedia: ReactionMedia[];
};

export type XStyleProfile = {
  id: string;
  name: string;
  engine: "X_STYLE";
  handle: string;
  /** Object URL da foto de perfil enviada. Null enquanto não for enviada. */
  avatarUrl: string | null;
  verified: boolean;
  /** Tom editorial usado para reescrever a legenda original. */
  editorialTone: string;
};

export type UgcProfile = {
  id: string;
  name: string;
  engine: "UGC";
  /** Object URL da imagem de marca d'água personalizada enviada. Null = sem marca (opcional). */
  watermarkImageUrl: string | null;
  /** Padrão de posição/tamanho/opacidade do perfil (nível 2). Ausente = padrão global (nível 1). */
  watermarkDefaults?: WatermarkPosition;
};

/** Aponta para um template (por enquanto embutido no próprio perfil — fase 2 separa isso) e
 *  armazena identidade, assets e configuração. Drive/conexões sociais chegam nas fases 6–7. */
export type Profile = ReactProfile | XStyleProfile | UgcProfile;

/** Estado do item do lote ao longo do pipeline. */
export type BatchItemStatus =
  | "IMPORTING"
  | "ANALYZING"
  | "AWAITING_REVIEW"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

/** Estado agregado do lote, derivado do status dos itens. */
export type BatchStatus =
  | "IMPORTING"
  | "ANALYZING"
  | "AWAITING_REVIEW"
  | "PROCESSING"
  | "PARTIALLY_COMPLETED"
  | "COMPLETED"
  | "FAILED";

export type Batch = {
  id: string;
  profileId: string;
  engine: Engine;
  createdAt: string;
};

/** Ajustes manuais do item, isolados do template global do perfil. */
export type ManualOverrides = {
  caption: string;
  watermarkPosition: WatermarkPosition;
  cropBox: CropBox;
  /** Mídia de reação escolhida manualmente (engine REACT); null nos demais engines. */
  reactionMediaId: string | null;
};

export type BatchItem = {
  id: string;
  batchId: string;
  filename: string;
  status: BatchItemStatus;
  manualOverrides: ManualOverrides;
  /** Object URL do arquivo enviado, usado como prévia real do conteúdo importado. Null para
   *  arquivos vindos do Google Drive mockado, que não têm conteúdo de verdade. */
  contentUrl: string | null;
};

export const ENGINE_LABELS: Record<Engine, string> = {
  REACT: "React",
  X_STYLE: "X Style",
  UGC: "UGC",
};

export function computeBatchStatus(items: BatchItem[]): BatchStatus {
  if (items.length === 0) return "AWAITING_REVIEW";
  if (items.some((i) => i.status === "IMPORTING")) return "IMPORTING";
  if (items.some((i) => i.status === "ANALYZING")) return "ANALYZING";
  if (items.some((i) => i.status === "PROCESSING")) return "PROCESSING";
  if (items.some((i) => i.status === "AWAITING_REVIEW")) return "AWAITING_REVIEW";
  const completed = items.filter((i) => i.status === "COMPLETED").length;
  const failed = items.filter((i) => i.status === "FAILED").length;
  if (completed === items.length) return "COMPLETED";
  if (failed === items.length) return "FAILED";
  return "PARTIALLY_COMPLETED";
}
