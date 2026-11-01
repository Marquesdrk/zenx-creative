import type { Batch, BatchItem, Platform, Profile, Publication } from "@/lib/editor/types";
import type {
  PublicSocialAccount,
  ScheduledPost,
  ScheduledPostAccount,
} from "@/lib/server/meta/types";

export type ContentCoverageRow = {
  profileId: string;
  profileName: string;
  engine: Profile["engine"];
  handle: string | null;
  profilePictureUrl: string | null;
  accounts: Array<{ id: string; name: string; platform: Platform | "INSTAGRAM" | "FACEBOOK"; connected: boolean }>;
  publishedVideos: number;
  scheduledVideos: number;
  nextScheduledAt: string | null;
  lastScheduledAt: string | null;
  overdueVideos: number;
  daysUntilEnd: number | null;
};

export type ContentCoverageReport = {
  generatedAt: string;
  timezone: "America/Sao_Paulo";
  profiles: ContentCoverageRow[];
  unmatchedScheduledVideos: number;
  unmatchedAccounts: string[];
  /** Nomes de perfis cadastrados em duplicidade (mesmo @ ou mesmo nome/engine) que o relatório
   *  juntou numa linha só — a cópia sobrando deve ser removida em Configurações. */
  mergedDuplicateProfiles: string[];
};

type ContentCoverageInput = {
  profiles: Profile[];
  batches: Batch[];
  items: BatchItem[];
  publications: Publication[];
  scheduledPosts: ScheduledPost[];
  scheduledPostAccounts: ScheduledPostAccount[];
  socialAccounts: PublicSocialAccount[];
  now?: Date;
};

const TIME_ZONE = "America/Sao_Paulo" as const;

function normalizedKey(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .replace(/^@/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function dateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((candidate) => candidate.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dayNumber(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function daysBetweenLocalDates(from: Date, to: Date) {
  return dayNumber(dateKey(to)) - dayNumber(dateKey(from));
}

function accountLabel(account: PublicSocialAccount) {
  return account.username ? `@${account.username.replace(/^@/, "")}` : account.accountName;
}

/** Junta perfis cadastrados em duplicidade (mesmo @, ou mesmo nome na mesma engine). O perfil
 *  "principal" de cada grupo é o que tem foto (senão o primeiro). Sem isso, as duas cópias
 *  disputam a mesma conta social e nenhuma recebe os vídeos. */
function dedupeProfiles(profiles: Profile[]) {
  const canonicalById = new Map<string, Profile>();
  const groups: Profile[][] = [];
  const groupByKey = new Map<string, Profile[]>();
  for (const profile of profiles) {
    const handleKey = normalizedKey("handle" in profile ? profile.handle : null);
    const nameKey = `${profile.engine}:${normalizedKey(profile.name)}`;
    const keys = [handleKey ? `handle:${handleKey}` : null, `name:${nameKey}`].filter((key): key is string => Boolean(key));
    let group = keys.map((key) => groupByKey.get(key)).find(Boolean);
    if (!group) {
      group = [];
      groups.push(group);
    }
    group.push(profile);
    for (const key of keys) groupByKey.set(key, group);
  }
  const merged: string[] = [];
  const unique: Profile[] = [];
  for (const group of groups) {
    const primary =
      group.find((profile) => profile.profilePictureUrl || ("avatarUrl" in profile && profile.avatarUrl)) ?? group[0];
    unique.push(primary);
    for (const profile of group) canonicalById.set(profile.id, primary);
    if (group.length > 1) merged.push(primary.name);
  }
  return { unique, canonicalById, merged };
}

export function buildContentCoverageReport(input: ContentCoverageInput): ContentCoverageReport {
  const now = input.now ?? new Date();
  const { unique: uniqueProfiles, canonicalById, merged: mergedDuplicateProfiles } = dedupeProfiles(input.profiles);
  const profilesById = new Map(input.profiles.map((profile) => [profile.id, canonicalById.get(profile.id) ?? profile]));
  const rows = new Map<string, {
    profile: Profile;
    published: Set<string>;
    videos: Map<string, Set<number>>;
    accounts: Map<string, ContentCoverageRow["accounts"][number]>;
  }>();
  for (const profile of uniqueProfiles) {
    rows.set(profile.id, { profile, published: new Set(), videos: new Map(), accounts: new Map() });
  }

  const profileIdsByKey = new Map<string, string[]>();
  for (const profile of uniqueProfiles) {
    const keys = new Set([normalizedKey(profile.name), normalizedKey("handle" in profile ? profile.handle : null)]);
    for (const key of keys) {
      if (!key) continue;
      const ids = profileIdsByKey.get(key) ?? [];
      ids.push(profile.id);
      profileIdsByKey.set(key, ids);
    }
  }

  const profilesByAccountId = new Map<string, string>();
  for (const account of input.socialAccounts) {
    const accountKeys = [normalizedKey(account.username), normalizedKey(account.accountName)].filter(Boolean);
    const matchedIds = new Set(
      accountKeys.flatMap((key) => profileIdsByKey.get(key) ?? [])
    );
    if (matchedIds.size !== 1) continue;
    const profileId = [...matchedIds][0];
    if (!profileId) continue;
    profilesByAccountId.set(account.id, profileId);
    rows.get(profileId)?.accounts.set(account.id, {
      id: account.id,
      name: accountLabel(account),
      platform: account.platform,
      connected: account.status === "connected",
    });
  }

  function addVideo(profileId: string, key: string, scheduledAt: string) {
    const row = rows.get(profileId);
    const timestamp = Date.parse(scheduledAt);
    if (!row || !Number.isFinite(timestamp)) return;
    const dates = row.videos.get(key) ?? new Set<number>();
    dates.add(timestamp);
    row.videos.set(key, dates);
  }

  // Legacy calendar rows have a direct path from publication → item → batch → profile.
  const itemsById = new Map(input.items.map((item) => [item.id, item]));
  const batchesById = new Map(input.batches.map((batch) => [batch.id, batch]));
  for (const publication of input.publications) {
    const item = itemsById.get(publication.batchItemId);
    const batch = item ? batchesById.get(item.batchId) : undefined;
    const canonicalProfile = batch ? profilesById.get(batch.profileId) : undefined;
    if (!item || !batch || !canonicalProfile) continue;
    if (publication.status === "PUBLISHED") {
      rows.get(canonicalProfile.id)?.published.add(`batch-item:${item.id}`);
    } else if (publication.status === "PENDING" && publication.scheduledAt) {
      addVideo(canonicalProfile.id, `batch-item:${item.id}`, publication.scheduledAt);
    }
  }

  // New multi-account schedules are one ScheduledPost per video and one account row per target.
  // Count the video once per matching profile, not once per destination.
  const postsById = new Map(input.scheduledPosts.map((post) => [post.id, post]));
  const unmatchedPosts = new Set<string>();
  const postsWithProfile = new Set<string>();
  const unmatchedAccounts = new Set<string>();
  const socialAccountsById = new Map(input.socialAccounts.map((account) => [account.id, account]));
  for (const target of input.scheduledPostAccounts) {
    const post = postsById.get(target.scheduledPostId);
    if (!post) continue;
    const profileId = profilesByAccountId.get(target.socialAccountId);
    if (profileId) {
      if (target.status === "published") {
        rows.get(profileId)?.published.add(`scheduled-post:${post.id}`);
      } else if ((target.status === "scheduled" || target.status === "processing") && post.scheduledAt) {
        addVideo(profileId, `scheduled-post:${post.id}`, post.scheduledAt);
        postsWithProfile.add(post.id);
      }
    } else {
      if ((target.status !== "scheduled" && target.status !== "processing") || !post.scheduledAt) continue;
      unmatchedPosts.add(post.id);
      const account = socialAccountsById.get(target.socialAccountId);
      if (account) unmatchedAccounts.add(accountLabel(account));
    }
  }
  for (const postId of postsWithProfile) unmatchedPosts.delete(postId);

  const profiles = [...rows.values()].map(({ profile, published, videos, accounts }) => {
    const allTimestamps = [...videos.values()].flatMap((dates) => [...dates]);
    const lastTimestamp = allTimestamps.length ? Math.max(...allTimestamps) : null;
    const nextTimestamp = allTimestamps.filter((timestamp) => timestamp >= now.getTime()).sort((a, b) => a - b)[0] ?? null;
    const overdueVideos = [...videos.values()].filter((dates) => Math.max(...dates) < now.getTime()).length;
    const lastScheduledAt = lastTimestamp === null ? null : new Date(lastTimestamp).toISOString();
    const linkedAccountForPicture = [...accounts.values()].sort((a, b) =>
      Number(b.connected) - Number(a.connected)
      || Number(b.platform === "INSTAGRAM") - Number(a.platform === "INSTAGRAM")
    )[0];

    return {
      profileId: profile.id,
      profileName: profile.name,
      engine: profile.engine,
      handle: "handle" in profile ? profile.handle ?? null : null,
      profilePictureUrl: profile.profilePictureUrl
        ?? ("avatarUrl" in profile ? profile.avatarUrl : null)
        ?? (linkedAccountForPicture ? `/api/meta/accounts/${linkedAccountForPicture.id}/profile-picture` : null),
      accounts: [...accounts.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
      publishedVideos: published.size,
      scheduledVideos: videos.size,
      nextScheduledAt: nextTimestamp === null ? null : new Date(nextTimestamp).toISOString(),
      lastScheduledAt,
      overdueVideos,
      daysUntilEnd: lastScheduledAt ? daysBetweenLocalDates(now, new Date(lastScheduledAt)) : null,
    } satisfies ContentCoverageRow;
  });

  profiles.sort((a, b) => {
    if (a.scheduledVideos === 0 && b.scheduledVideos > 0) return 1;
    if (b.scheduledVideos === 0 && a.scheduledVideos > 0) return -1;
    if (a.lastScheduledAt && b.lastScheduledAt) return a.lastScheduledAt.localeCompare(b.lastScheduledAt);
    return a.profileName.localeCompare(b.profileName, "pt-BR");
  });

  return {
    generatedAt: now.toISOString(),
    timezone: TIME_ZONE,
    profiles,
    unmatchedScheduledVideos: unmatchedPosts.size,
    unmatchedAccounts: [...unmatchedAccounts].sort((a, b) => a.localeCompare(b, "pt-BR")),
    mergedDuplicateProfiles,
  };
}
