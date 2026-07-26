export type PublishInput = {
  /** Caminho absoluto no disco do arquivo renderizado (para upload direto, ex.: YouTube). */
  videoPath: string;
  /** URL pública HTTPS do vídeo — obrigatória para Instagram/Facebook/TikTok, que buscam o
   *  arquivo a partir dos próprios servidores (não aceitam localhost). */
  videoPublicUrl: string;
  caption: string;
};

export type PublishResult = { externalId: string; permalink: string | null };

export type FetchedMetrics = { views: number; likes: number; comments: number; shares: number };

export interface PlatformAdapter {
  name: string;
  isConfigured(): boolean;
  publish(input: PublishInput): Promise<PublishResult>;
  fetchMetrics(externalId: string): Promise<FetchedMetrics>;
}
