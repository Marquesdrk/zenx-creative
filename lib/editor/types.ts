export type Profile = {
  id: string;
  name: string;
  handle: string;
  avatarColor: string;
  watermarkLabel: string;
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
  watermarkPosition: { x: number; y: number; scale: number };
  cropBox: { x: number; y: number };
};

export const TEMPLATE_LABELS: Record<EditorTemplate, string> = {
  react: "React",
  "twitter-style": "Twitter Style",
  "shop-content": "Shop/Content",
};
