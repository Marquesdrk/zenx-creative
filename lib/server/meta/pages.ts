import { socialAccountsRepo } from "@/lib/server/meta/db";
import { GRAPH_BASE } from "./config";
import { graphFetch, graphUrl } from "./graph-client";
import type {
  DiscoveredAsset,
  DiscoveredFacebookPage,
  DiscoveredInstagramAccount,
  GraphAccountsResponse,
  GraphPage,
} from "./types";

export type DiscoveredRawPage = {
  pageId: string;
  name: string;
  /** Page Access Token — usado tanto pra publicar no Facebook quanto (quando há Instagram
   *  vinculado) no Instagram dessa Página. Só existe em memória/dentro da sessão de descoberta
   *  criptografada; nunca é serializado pra fora de lib/server. */
  pageAccessToken: string;
  category: string | null;
  profilePictureUrl: string | null;
  instagram: { id: string; username: string; name: string | null; profilePictureUrl: string | null } | null;
};

/** Busca todas as Páginas que a pessoa autorizada administra, com a conta profissional do
 *  Instagram vinculada (se houver) — pagina por `paging.next` até esgotar, necessário pra
 *  quem administra muitas Páginas (ex.: agências com 30-100 clientes). */
export async function fetchManagedPages(userAccessToken: string): Promise<DiscoveredRawPage[]> {
  const pages: DiscoveredRawPage[] = [];
  let url: string | null = graphUrl(GRAPH_BASE, "me/accounts", {
    access_token: userAccessToken,
    fields:
      "id,name,access_token,category,picture{url},instagram_business_account{id,username,name,profile_picture_url}",
    limit: 100,
  });

  while (url) {
    const data: GraphAccountsResponse = await graphFetch<GraphAccountsResponse>(url);
    for (const page of data.data ?? []) {
      pages.push(rawPageFromGraph(page));
    }
    url = data.paging?.next ?? null;
  }
  return pages;
}

function rawPageFromGraph(page: GraphPage): DiscoveredRawPage {
  return {
    pageId: page.id,
    name: page.name,
    pageAccessToken: page.access_token,
    category: page.category ?? null,
    profilePictureUrl: page.picture?.data?.url ?? null,
    instagram: page.instagram_business_account
      ? {
          id: page.instagram_business_account.id,
          username: page.instagram_business_account.username ?? "",
          name: page.instagram_business_account.name ?? null,
          profilePictureUrl: page.instagram_business_account.profile_picture_url ?? null,
        }
      : null,
  };
}

/** Achados exibidos na tela de seleção — nunca inclui tokens (ficam só na sessão de
 *  descoberta criptografada no servidor; ver metaOAuthSessionRepo em lib/server/meta/db.ts). */
export async function toDiscoveredAssets(pages: DiscoveredRawPage[]): Promise<DiscoveredAsset[]> {
  const assets: DiscoveredAsset[] = [];
  for (const page of pages) {
    const fbAsset: DiscoveredFacebookPage = {
      key: `page:${page.pageId}`,
      platform: "FACEBOOK",
      pageId: page.pageId,
      name: page.name,
      username: null,
      profilePictureUrl: page.profilePictureUrl,
      category: page.category,
      alreadyConnected: Boolean(await socialAccountsRepo.findByPlatformAccountId("FACEBOOK", page.pageId)),
    };
    assets.push(fbAsset);

    if (page.instagram) {
      const igAsset: DiscoveredInstagramAccount = {
        key: `instagram:${page.instagram.id}`,
        platform: "INSTAGRAM",
        instagramUserId: page.instagram.id,
        pageId: page.pageId,
        pageName: page.name,
        username: page.instagram.username,
        name: page.instagram.name,
        profilePictureUrl: page.instagram.profilePictureUrl,
        alreadyConnected: Boolean(await socialAccountsRepo.findByPlatformAccountId("INSTAGRAM", page.instagram.id)),
      };
      assets.push(igAsset);
    }
  }
  return assets;
}
