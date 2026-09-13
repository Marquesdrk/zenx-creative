import { NextResponse } from "next/server";
import { socialAccountsRepo } from "@/lib/server/meta/db";
import { GRAPH_BASE } from "@/lib/server/meta/config";
import { graphFetch, graphUrl, MetaGraphError } from "@/lib/server/meta/graph-client";

type PagePictureResponse = {
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id?: string; profile_picture_url?: string };
};

function isMetaImageHost(hostname: string) {
  return [".cdninstagram.com", ".fbcdn.net", ".fbsbx.com"].some((suffix) => hostname.endsWith(suffix));
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await socialAccountsRepo.get(id);
  if (!account) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });

  const accessToken = await socialAccountsRepo.getAccessToken(id);
  if (!accessToken) return NextResponse.json({ error: "A conexão da conta não está disponível." }, { status: 404 });

  try {
    const graphId = account.pageId ?? account.platformAccountId;
    const fields = account.platform === "INSTAGRAM"
      ? "instagram_business_account{id,profile_picture_url}"
      : "picture{url}";
    const result = await graphFetch<PagePictureResponse>(
      graphUrl(GRAPH_BASE, graphId, { fields, access_token: accessToken }),
      undefined,
      8_000
    );
    const instagramId = result.instagram_business_account?.id;
    const imageUrl = account.platform === "INSTAGRAM"
      ? (instagramId === account.instagramUserId ? result.instagram_business_account?.profile_picture_url : null)
      : result.picture?.data?.url;

    if (!imageUrl) return NextResponse.json({ error: "A Meta não retornou uma foto para esta conta." }, { status: 404 });
    const parsedImageUrl = new URL(imageUrl);
    if (parsedImageUrl.protocol !== "https:" || !isMetaImageHost(parsedImageUrl.hostname)) {
      return NextResponse.json({ error: "Origem da foto não permitida." }, { status: 502 });
    }

    const imageResponse = await fetch(parsedImageUrl, {
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg" },
    });
    const finalUrl = new URL(imageResponse.url);
    if (!imageResponse.ok || !isMetaImageHost(finalUrl.hostname)) {
      return NextResponse.json({ error: "Não foi possível baixar a foto atual da conta." }, { status: 502 });
    }

    const contentType = imageResponse.headers.get("content-type")?.split(";")[0] ?? "";
    const contentLength = Number(imageResponse.headers.get("content-length") ?? 0);
    if (!contentType.startsWith("image/") || contentLength > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "A resposta da foto não é uma imagem válida." }, { status: 502 });
    }

    const bytes = await imageResponse.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "A foto da conta é inválida ou muito grande." }, { status: 502 });
    }

    return new Response(bytes, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=1800, stale-while-revalidate=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const diagnostic = error instanceof MetaGraphError
      ? `${error.errorCode} (HTTP ${error.httpStatus})`
      : error instanceof Error ? error.name : "UNKNOWN";
    console.error("[meta-account-profile-picture] failed", { accountId: id, diagnostic });
    return NextResponse.json({ error: "Não foi possível atualizar a foto da conta.", diagnostic }, { status: 502 });
  }
}
