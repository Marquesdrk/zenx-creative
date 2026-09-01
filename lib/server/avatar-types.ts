import type { Engine } from "@/lib/editor/types";

export type AvatarPillar = { name: string; description: string; format: string };

/** O que o usuário preenche no wizard — vira o payload enviado pra OpenAI gerar os documentos. */
export type AvatarInput = {
  name: string;
  niche: string;
  painPoint: string;
  audience: string;
  promise: string;
  boundaries: string[];
  toneAdjectives: string[];
  alwaysRules: string[];
  neverRules: string[];
  signaturePhrase: string;
  pillars: AvatarPillar[];
  visualStyle: string;
  voiceNotes: string;
};

/** O "kit de 7 documentos" gerado pela IA (ver lib/server/openai/client.ts). */
export type AvatarDocuments = {
  purpose: string;
  toneAndRules: string;
  pillars: string;
  visualBible: string;
  voiceNotes: string;
  launchPlan: string;
  master: string;
};

export type AvatarImageUrls = {
  characterBible?: string;
  closeUp?: string;
  turnaround?: string;
  expressions?: string;
};

export type AvatarStatus = "draft" | "generating" | "ready" | "failed";

export type Avatar = AvatarInput & {
  id: string;
  engine: Engine;
  documents: AvatarDocuments | null;
  imageUrls: AvatarImageUrls | null;
  driveFolderId: string | null;
  status: AvatarStatus;
  errorMessage: string | null;
  profileId: string | null;
  createdAt: string;
  updatedAt: string;
};
