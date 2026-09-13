import { NextResponse } from "next/server";
import { isDriveConfigured, isDriveConnected, reactionMediaFolderSegments, uploadFileToDriveFolder } from "@/lib/server/google-drive";

export async function POST(request: Request) {
  try {
    if (!isDriveConfigured()) return NextResponse.json({ error: "Google Drive não configurado." }, { status: 400 });
    if (!(await isDriveConnected())) return NextResponse.json({ error: "Google Drive não conectado." }, { status: 409 });
    const formData = await request.formData();
    const file = formData.get("file");
    const profileHandle = String(formData.get("profileHandle") || "").replace(/^@/, "");
    if (!(file instanceof File)) return NextResponse.json({ error: "Campo 'file' ausente ou inválido." }, { status: 400 });
    if (!profileHandle) return NextResponse.json({ error: "Informe o @ do perfil React." }, { status: 400 });

    const result = await uploadFileToDriveFolder(
      Buffer.from(await file.arrayBuffer()),
      file.name,
      file.type || "video/mp4",
      reactionMediaFolderSegments(profileHandle)
    );
    return NextResponse.json({
      fileId: result.fileId,
      fileName: result.fileName,
      url: `/api/drive/media/${result.fileId}`,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao enviar a reação para o Google Drive." }, { status: 502 });
  }
}
