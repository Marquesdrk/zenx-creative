import { openAiCredentialsRepo } from "@/lib/server/openai/credentials-db";
import type { AvatarDocuments, AvatarInput } from "@/lib/server/avatar-types";

const API_BASE = "https://api.openai.com/v1";
const CHAT_MODEL = "gpt-4o";
const IMAGE_MODEL = "gpt-image-1";

export async function isOpenAiConnected(): Promise<boolean> {
  return (await openAiCredentialsRepo.get()) !== null;
}

/** Salva a chave só depois de validar com uma chamada real e barata (/v1/models) — evita
 *  guardar uma chave inválida e só descobrir isso na hora de gerar um avatar. */
export async function connectOpenAi(apiKey: string): Promise<void> {
  const res = await fetch(`${API_BASE}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) {
    throw new Error(res.status === 401 ? "Chave de API inválida." : `Falha ao validar a chave (HTTP ${res.status}).`);
  }
  await openAiCredentialsRepo.set(apiKey);
}

async function getApiKeyOrThrow(): Promise<string> {
  const key = await openAiCredentialsRepo.get();
  if (!key) throw new Error("OpenAI não conectada — configure em Configurações.");
  return key;
}

const DOCUMENTS_SYSTEM_PROMPT = `Você é um estrategista de personagens de influencers de IA, seguindo a metodologia do guia
"Anatomia de um Influencer de IA": propósito antes de visual, documentação antes de produção.
A partir dos dados que o usuário fornecer, gere o "kit de 7 documentos" do personagem, em
português do Brasil, cada um em markdown, prontos para virar a fonte da verdade do personagem.
Responda APENAS com um JSON contendo exatamente estas 7 chaves de string:
- "purpose": nicho, público, dor real que o personagem resolve, a promessa e as fronteiras (o que ele nunca aborda).
- "toneAndRules": adjetivos da voz, lista de "sempre", lista de "nunca", e a assinatura (abertura/fechamento) exclusiva do personagem.
- "pillars": os pilares de conteúdo (territórios de tema), cada um com nome, descrição e formato de vídeo sugerido.
- "visualBible": descrição da bíblia visual (estilo de arte, aparência, roupa, acessório distintivo, sensação que deve passar) em formato de prompt estruturado com colchetes, pronto para colar num gerador de imagem.
- "voiceNotes": notas sobre a voz sonora do personagem (tom, ritmo, energia) para orientar a escolha/geração de voz.
- "launchPlan": um plano de lançamento de 10 dias, distribuindo os pilares definidos.
- "master": um documento-mestre curto que resume e amarra os outros seis.
Nunca invente fatos que contradigam o que o usuário forneceu.`;

export async function generateAvatarDocuments(input: AvatarInput): Promise<AvatarDocuments> {
  const apiKey = await getApiKeyOrThrow();
  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHAT_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: DOCUMENTS_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(input) },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI recusou a geração dos documentos (HTTP ${res.status}): ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI não retornou conteúdo para os documentos do avatar.");
  return JSON.parse(content) as AvatarDocuments;
}

/** Gera 1 imagem via OpenAI Images e devolve os bytes já decodificados — quem chama decide o
 *  que fazer com o buffer (aqui, sempre sobe pro Drive; nunca é salvo em disco). */
export async function generateAvatarImage(prompt: string): Promise<Buffer> {
  const apiKey = await getApiKeyOrThrow();
  const res = await fetch(`${API_BASE}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: IMAGE_MODEL, prompt, size: "1024x1536", n: 1 }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI recusou a geração de imagem (HTTP ${res.status}): ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI não retornou uma imagem.");
  return Buffer.from(b64, "base64");
}
