export type EditorTemplate = "react" | "twitter-style" | "shop-content";

export type ReactionMedia = {
  id: string;
  label: string;
  /** Object URL do vídeo/imagem de reação enviado. Null enquanto não for enviado. */
  url: string | null;
};

export type WatermarkPosition = { x: number; y: number; scale: number; opacity: number };

export type ReactProfile = {
  id: string;
  name: string;
  template: "react";
  /** Mídias de reação do influencer, enviadas uma vez e reaproveitadas em todo lote. */
  reactionMedia: ReactionMedia[];
};

export type TwitterStyleProfile = {
  id: string;
  name: string;
  template: "twitter-style";
  handle: string;
  /** Object URL da foto de perfil enviada. Null enquanto não for enviada. */
  avatarUrl: string | null;
  verified: boolean;
  /** Tom editorial usado para reescrever a legenda original. */
  editorialTone: string;
};

export type ShopContentProfile = {
  id: string;
  name: string;
  template: "shop-content";
  /** Object URL da imagem de marca d'água personalizada enviada. Null enquanto não for enviada. */
  watermarkImageUrl: string | null;
  /** Padrão de posição/tamanho/opacidade do perfil (nível 2). Ausente = padrão global (nível 1). */
  watermarkDefaults?: WatermarkPosition;
};

export type Profile = ReactProfile | TwitterStyleProfile | ShopContentProfile;

export type VideoStatus = "importing" | "processing" | "ready" | "error";

export type Batch = {
  id: string;
  profileId: string;
  template: EditorTemplate;
  createdAt: string;
};

export type EditorVideo = {
  id: string;
  batchId: string;
  filename: string;
  status: VideoStatus;
  caption: string;
  /** Só usado quando o template do lote é shop-content. */
  watermarkPosition: WatermarkPosition;
  cropBox: { x: number; y: number };
  /** Mídia de reação atribuída automaticamente (template React); null nos demais templates. */
  reactionMediaId: string | null;
  /** Object URL do arquivo enviado, usado como prévia real do conteúdo importado. Null para
   *  arquivos vindos do Google Drive mockado, que não têm conteúdo de verdade. */
  contentUrl: string | null;
};

export const TEMPLATE_LABELS: Record<EditorTemplate, string> = {
  react: "React",
  "twitter-style": "Twitter Style",
  "shop-content": "Shop/Content",
};
