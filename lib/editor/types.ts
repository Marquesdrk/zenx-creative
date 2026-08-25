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
/** Como o vídeo importado preenche o quadro do template. */
export type FitMode = "cover" | "contain";
export type Rotation = 0 | 90 | 180 | 270;

export type ReactProfile = {
  id: string;
  name: string;
  engine: "REACT";
  /** Template que define posições/comportamento visual deste perfil. */
  templateId: string;
  /** Mídias de reação do influencer, enviadas uma vez e reaproveitadas em todo lote. */
  reactionMedia: ReactionMedia[];
};

export type XStyleProfile = {
  id: string;
  name: string;
  engine: "X_STYLE";
  templateId: string;
  handle: string;
  /** Object URL da foto de perfil enviada. Null enquanto não for enviada. */
  avatarUrl: string | null;
  verified: boolean;
  /** Tom editorial usado para reescrever a legenda original. */
  editorialTone: string;
  /** Arte pronta do perfil, usada como fundo do vídeo X Style final. */
  backgroundImageUrl?: string | null;
  /** Texto inicial colocado como título acima do vídeo centralizado. */
  defaultTitle?: string;
  /** Layout relativo ao canvas 1080x1920 do template pronto. */
  xStyleLayout?: XStyleLayout;
};

export type UgcProfile = {
  id: string;
  name: string;
  engine: "UGC";
  templateId: string;
  /** Object URL da imagem de marca d'água personalizada enviada. Null = sem marca (opcional). */
  watermarkImageUrl: string | null;
};

/** Aponta para um template e armazena identidade, assets e configuração (Drive/conexões
 *  sociais chegam nas fases 6–7). */
export type Profile = ReactProfile | XStyleProfile | UgcProfile;

export type XStyleLayout = {
  video: { x: number; y: number; width: number; height: number };
  title: { x: number; y: number; fontSize: number; maxWidth: number; maxLines: number };
  body: { x: number; y: number; fontSize: number; maxWidth: number; maxLines: number };
};

export type XStyleVideoFrame = XStyleLayout["video"];

export const DEFAULT_X_STYLE_LAYOUT: XStyleLayout = {
  title: { x: 70, y: 325, fontSize: 48, maxWidth: 940, maxLines: 2 },
  video: { x: 70, y: 455, width: 940, height: 1120 },
  body: { x: 70, y: 1600, fontSize: 54, maxWidth: 940, maxLines: 2 },
};

export function resolveXStyleLayout(
  layout?:
    | {
        title?: Partial<XStyleLayout["title"]>;
        video?: Partial<XStyleLayout["video"]>;
        body?: Partial<XStyleLayout["body"]>;
      }
    | null
): XStyleLayout {
  return {
    title: { ...DEFAULT_X_STYLE_LAYOUT.title, ...layout?.title },
    video: { ...DEFAULT_X_STYLE_LAYOUT.video, ...layout?.video },
    body: { ...DEFAULT_X_STYLE_LAYOUT.body, ...layout?.body },
  };
}

/** Define posições, dimensões e comportamento visual — hoje só o essencial de cada engine já
 *  suportado pela UI; mais campos (fontes, cores, áudio) entram conforme forem implementados. */
export type ReactTemplate = { id: string; engine: "REACT"; name: string };
export type XStyleTemplate = { id: string; engine: "X_STYLE"; name: string };
export type UgcTemplate = {
  id: string;
  engine: "UGC";
  name: string;
  /** Padrão de posição/tamanho/opacidade da marca d'água (nível 2). Ausente = padrão global
   *  (nível 1). */
  watermarkDefaults?: WatermarkPosition;
};

export type Template = ReactTemplate | XStyleTemplate | UgcTemplate;

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
  exportPath?: string | null;
  exportedAt?: string | null;
  storageProvider?: "LOCAL" | "SUPABASE" | null;
  storageUrl?: string | null;
};

/** Ajustes manuais do item, isolados do template global do perfil. */
export type ManualOverrides = {
  title?: string;
  caption: string;
  /** Ajuste manual da janela de vídeo dentro do template X Style. Ausente = layout do perfil. */
  xStyleVideoFrame?: XStyleVideoFrame | null;
  watermarkPosition: WatermarkPosition;
  cropBox: CropBox;
  /** Zoom aplicado sobre o recorte (1 = sem zoom), permitindo um "recorte livre" combinando
   *  posição (cropBox) e escala. */
  cropZoom: number;
  fit: FitMode;
  rotation: Rotation;
  /** Corte de entrada/saída, em segundos, sobre o vídeo original. trimEnd null = até o fim. */
  trimStart: number;
  trimEnd: number | null;
  volume: number;
  muted: boolean;
  /** Mídia de reação escolhida manualmente (engine REACT); null nos demais engines. */
  reactionMediaId: string | null;
};

export function createDefaultManualOverrides(
  params: Pick<ManualOverrides, "caption" | "watermarkPosition" | "reactionMediaId"> & {
    title?: string;
  }
): ManualOverrides {
  return {
    ...params,
    title: params.title ?? "",
    cropBox: { x: 0.5, y: 0.5 },
    cropZoom: 1,
    fit: "cover",
    rotation: 0,
    trimStart: 0,
    trimEnd: null,
    volume: 1,
    muted: true,
  };
}

/** Resultado da normalização da origem (fase 3): resolução/aspect ratio reais do arquivo,
 *  detecção heurística de barras pretas/bordas uniformes (sem ML/detecção de rosto — isso
 *  fica para uma fase com um serviço de análise dedicado) e o recorte sugerido a partir
 *  disso. Guardado separado de `manualOverrides.cropBox`, que é o que o usuário efetivamente
 *  aplicou (começa igual ao sugerido, mas o usuário pode ajustar). */
export type SourceAnalysis = {
  width: number;
  height: number;
  aspectRatio: number;
  hasLetterboxing: boolean;
  suggestedCropBox: CropBox;
  /** Zoom sugerido pra excluir as barras detectadas do recorte — sem isso, reposicionar não
   *  teria efeito quando a origem já preenche o quadro alvo por completo (zoom 1x = sem
   *  folga pra mover). */
  suggestedZoom: number;
};

export type BatchItem = {
  id: string;
  batchId: string;
  filename: string;
  status: BatchItemStatus;
  manualOverrides: ManualOverrides;
  /** Null enquanto a análise (IMPORTING/ANALYZING) não terminou, ou quando não há conteúdo
   *  real para analisar (arquivos do Google Drive mockado). */
  sourceAnalysis: SourceAnalysis | null;
  /** URL pública do arquivo enviado (`/uploads/...`), servida pelo Next.js. Null para
   *  arquivos vindos do Google Drive mockado, que não têm conteúdo de verdade. */
  contentUrl: string | null;
  /** URL pública do vídeo renderizado (`/renders/...`), preenchida quando status = COMPLETED. */
  renderedUrl: string | null;
  /** Mensagem de erro quando status = FAILED. */
  error: string | null;
};

export const ENGINE_LABELS: Record<Engine, string> = {
  REACT: "React",
  X_STYLE: "X Style",
  UGC: "UGC",
};

/** Destino de publicação de um item renderizado. Kwai não tem API pública de publicação
 *  para terceiros — fica registrado só para acompanhamento manual. */
export type Platform = "INSTAGRAM" | "FACEBOOK" | "YOUTUBE" | "TIKTOK" | "KWAI";

export type PublicationStatus = "PENDING" | "PUBLISHED" | "FAILED";

export type Publication = {
  id: string;
  batchItemId: string;
  platform: Platform;
  status: PublicationStatus;
  scheduledAt: string | null;
  externalId: string | null;
  permalink: string | null;
  error: string | null;
  createdAt: string;
  publishedAt: string | null;
};

export type MetricSnapshot = {
  id: string;
  publicationId: string;
  capturedAt: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
};

export const PLATFORM_LABELS: Record<Platform, string> = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  YOUTUBE: "YouTube",
  TIKTOK: "TikTok",
  KWAI: "Kwai",
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
