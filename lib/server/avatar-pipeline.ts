import { avatarsRepo } from "@/lib/server/avatars-db";
import { uploadFileToDriveFolder } from "@/lib/server/google-drive";
import { generateAvatarDocuments, generateAvatarImage } from "@/lib/server/openai/client";
import type { Avatar, AvatarImageUrls, AvatarInput } from "@/lib/server/avatar-types";

const DRIVE_ROOT = "Avatares Criados";

function toInput(avatar: Avatar): AvatarInput {
  const { name, niche, painPoint, audience, promise, boundaries, toneAdjectives, alwaysRules, neverRules, signaturePhrase, pillars, visualStyle, voiceNotes } = avatar;
  return { name, niche, painPoint, audience, promise, boundaries, toneAdjectives, alwaysRules, neverRules, signaturePhrase, pillars, visualStyle, voiceNotes };
}

/** Monta os 4 prompts de imagem da bíblia visual (ver docs do guia "Anatomia de um Influencer
 *  de IA", capítulo 4) a partir da descrição livre que o usuário deu no wizard. */
function buildImagePrompts(avatar: Avatar): Record<keyof AvatarImageUrls, string> {
  const base = `${avatar.name}, ${avatar.visualStyle}. Retrato, do peito para cima, personagem centralizado de frente, fundo desfocado, proporção 9:16.`;
  return {
    characterBible: base,
    closeUp: `Close-up de retrato do mesmo personagem: ${avatar.name}, ${avatar.visualStyle}. Rosto centralizado, enquadramento cabeça e ombros, mesma identidade exata, fundo neutro limpo, proporção 9:16.`,
    turnaround: `Folha de turnaround de corpo inteiro do personagem ${avatar.name} (${avatar.visualStyle}) em quatro vistas lado a lado, mesma escala: frente, 3/4, perfil e costas, pose neutra, fundo neutro limpo, proporção 9:16.`,
    expressions: `Grade com 8 retratos de cabeça e ombros do mesmo personagem ${avatar.name} (${avatar.visualStyle}), 4 colunas por 2 linhas, cada painel com uma expressão facial diferente (curiosa, surpresa, pensativa, rindo, séria, sorrindo, atenta, em dúvida), mesma identidade em todos os painéis, fundo neutro, proporção 9:16.`,
  };
}

/** Gera o kit de documentos + as 4 imagens da bíblia visual via OpenAI e sobe tudo pra
 *  "Avatares Criados/<nome>" no Drive do usuário. Nunca lança pra fora — qualquer falha marca
 *  o avatar como "failed" com a mensagem, pra a UI mostrar o que deu errado. */
export async function runAvatarGeneration(avatarId: string): Promise<void> {
  const avatar = await avatarsRepo.get(avatarId);
  if (!avatar) return;

  try {
    await avatarsRepo.update(avatarId, { status: "generating", errorMessage: null });

    const documents = await generateAvatarDocuments(toInput(avatar));

    const folderSegments = [DRIVE_ROOT, avatar.name];
    const imagePrompts = buildImagePrompts(avatar);
    const imageUrls: AvatarImageUrls = {};
    let driveFolderId: string | null = null;

    for (const key of Object.keys(imagePrompts) as Array<keyof AvatarImageUrls>) {
      const buffer = await generateAvatarImage(imagePrompts[key]);
      const upload = await uploadFileToDriveFolder(buffer, `${key}.png`, "image/png", folderSegments);
      imageUrls[key] = `https://drive.google.com/file/d/${upload.fileId}/view`;
      driveFolderId = upload.folderId;
    }

    const documentsBuffer = Buffer.from(
      Object.entries(documents)
        .map(([section, text]) => `# ${section}\n\n${text}`)
        .join("\n\n---\n\n"),
      "utf-8"
    );
    await uploadFileToDriveFolder(documentsBuffer, "documentos-do-personagem.md", "text/markdown", folderSegments);

    await avatarsRepo.update(avatarId, { status: "ready", documents, imageUrls, driveFolderId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha desconhecida ao gerar o avatar.";
    await avatarsRepo.update(avatarId, { status: "failed", errorMessage: message });
  }
}
