export type ReactionMedia = {
  id: string;
  label: string;
  color: string;
};

export type WatermarkPosition = { x: number; y: number; scale: number; opacity: number };

export type Profile = {
  id: string;
  name: string;
  handle: string;
  avatarColor: string;
  watermarkLabel: string;
  verified: boolean;
  /** Tom editorial usado para reescrever legendas no template Twitter/X Style. */
  editorialTone: string;
  /** Padrão de marca d'água do perfil (nível 2). Ausente = usa o padrão global (nível 1). */
  watermarkDefaults?: WatermarkPosition;
  /** Mídias de reação salvas, usadas automaticamente pelo template React. */
  reactionMedia: ReactionMedia[];
};

export type EditorTemplate = "react" | "twitter-style" | "shop-content";

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
