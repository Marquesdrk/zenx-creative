import { describe, expect, it } from "vitest";
import { buildContentCoverageReport } from "./content-coverage";
import type { Batch, BatchItem, Profile, Publication } from "@/lib/editor/types";
import type { PublicSocialAccount, ScheduledPost, ScheduledPostAccount } from "@/lib/server/meta/types";

const now = new Date("2026-09-12T12:00:00.000Z");

const profiles: Profile[] = [
  { id: "julia", name: "Julia em Pauta", engine: "REACT", templateId: "react", handle: "@juliaempauta", reactionMedia: [] },
  { id: "empty", name: "Perfil sem fila", engine: "UGC", templateId: "ugc", watermarkImageUrl: null },
];

const accounts: PublicSocialAccount[] = [
  { id: "ig", userId: null, projectId: null, platform: "INSTAGRAM", platformAccountId: "ig", pageId: null, instagramUserId: "ig", accountName: "Julia Pauta", username: "juliaempauta", profilePictureUrl: "https://cdn.example/julia.jpg", status: "connected", metaUserId: null, permissions: [], tokenExpiresAt: null, lastCheckedAt: null, lastError: null, metadata: {}, createdAt: now.toISOString(), updatedAt: now.toISOString() },
  { id: "fb", userId: null, projectId: null, platform: "FACEBOOK", platformAccountId: "fb", pageId: "fb", instagramUserId: null, accountName: "Julia Pauta Facebook", username: "juliaempauta", profilePictureUrl: null, status: "connected", metaUserId: null, permissions: [], tokenExpiresAt: null, lastCheckedAt: null, lastError: null, metadata: {}, createdAt: now.toISOString(), updatedAt: now.toISOString() },
  { id: "orphan", userId: null, projectId: null, platform: "INSTAGRAM", platformAccountId: "orphan", pageId: null, instagramUserId: "orphan", accountName: "Conta sem vínculo", username: "semvinculo", profilePictureUrl: null, status: "connected", metaUserId: null, permissions: [], tokenExpiresAt: null, lastCheckedAt: null, lastError: null, metadata: {}, createdAt: now.toISOString(), updatedAt: now.toISOString() },
];

describe("buildContentCoverageReport", () => {
  it("counts unique scheduled videos per profile, includes legacy schedules and leaves empty profiles visible", () => {
    const batches: Batch[] = [{ id: "batch", profileId: "julia", engine: "REACT", createdAt: now.toISOString() }];
    const items = [
      { id: "item", batchId: "batch", filename: "clip.mp4", status: "COMPLETED", contentUrl: null, renderedUrl: null, error: null, manualOverrides: {} } as BatchItem,
    ];
    const publications: Publication[] = [
      { id: "legacy-ig", batchItemId: "item", platform: "INSTAGRAM", status: "PENDING", scheduledAt: "2026-09-18T13:00:00.000Z", externalId: null, permalink: null, error: null, createdAt: now.toISOString(), publishedAt: null },
      { id: "legacy-fb", batchItemId: "item", platform: "FACEBOOK", status: "PENDING", scheduledAt: "2026-09-18T13:00:00.000Z", externalId: null, permalink: null, error: null, createdAt: now.toISOString(), publishedAt: null },
      { id: "published", batchItemId: "item", platform: "INSTAGRAM", status: "PUBLISHED", scheduledAt: "2026-09-16T13:00:00.000Z", externalId: null, permalink: null, error: null, createdAt: now.toISOString(), publishedAt: now.toISOString() },
    ];
    const posts: ScheduledPost[] = [
      { id: "post", userId: null, videoUrl: null, videoSource: "drive", driveFileId: "file", driveFileName: "post.mp4", caption: "", scheduledAt: "2026-09-20T14:00:00.000Z", status: "scheduled", createdAt: now.toISOString(), updatedAt: now.toISOString() },
      { id: "already-posted", userId: null, videoUrl: null, videoSource: "drive", driveFileId: "file3", driveFileName: "posted.mp4", caption: "", scheduledAt: null, status: "published", createdAt: now.toISOString(), updatedAt: now.toISOString() },
      { id: "orphan-post", userId: null, videoUrl: null, videoSource: "drive", driveFileId: "file2", driveFileName: "other.mp4", caption: "", scheduledAt: "2026-09-21T14:00:00.000Z", status: "scheduled", createdAt: now.toISOString(), updatedAt: now.toISOString() },
    ];
    const postAccounts: ScheduledPostAccount[] = [
      { id: "post-ig", scheduledPostId: "post", socialAccountId: "ig", status: "scheduled", externalPostId: null, errorCode: null, errorMessage: null, recoverable: null, attemptCount: 0, nextAttemptAt: null, publishedAt: null, createdAt: now.toISOString(), updatedAt: now.toISOString() },
      { id: "post-fb", scheduledPostId: "post", socialAccountId: "fb", status: "scheduled", externalPostId: null, errorCode: null, errorMessage: null, recoverable: null, attemptCount: 0, nextAttemptAt: null, publishedAt: null, createdAt: now.toISOString(), updatedAt: now.toISOString() },
      { id: "posted-ig", scheduledPostId: "already-posted", socialAccountId: "ig", status: "published", externalPostId: "external-1", errorCode: null, errorMessage: null, recoverable: null, attemptCount: 1, nextAttemptAt: null, publishedAt: now.toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString() },
      { id: "posted-fb", scheduledPostId: "already-posted", socialAccountId: "fb", status: "published", externalPostId: "external-2", errorCode: null, errorMessage: null, recoverable: null, attemptCount: 1, nextAttemptAt: null, publishedAt: now.toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString() },
      { id: "post-cancelled", scheduledPostId: "post", socialAccountId: "ig", status: "cancelled", externalPostId: null, errorCode: null, errorMessage: null, recoverable: null, attemptCount: 0, nextAttemptAt: null, publishedAt: null, createdAt: now.toISOString(), updatedAt: now.toISOString() },
      { id: "orphan-target", scheduledPostId: "orphan-post", socialAccountId: "orphan", status: "scheduled", externalPostId: null, errorCode: null, errorMessage: null, recoverable: null, attemptCount: 0, nextAttemptAt: null, publishedAt: null, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    ];

    const report = buildContentCoverageReport({
      profiles,
      batches,
      items,
      publications,
      scheduledPosts: posts,
      scheduledPostAccounts: postAccounts,
      socialAccounts: accounts,
      now,
    });

    expect(report.profiles.find((row) => row.profileId === "julia")).toMatchObject({
      profilePictureUrl: "/api/meta/accounts/ig/profile-picture",
      publishedVideos: 2,
      scheduledVideos: 2,
      nextScheduledAt: "2026-09-18T13:00:00.000Z",
      lastScheduledAt: "2026-09-20T14:00:00.000Z",
      accounts: expect.arrayContaining([expect.objectContaining({ id: "ig" }), expect.objectContaining({ id: "fb" })]),
    });
    expect(report.profiles.find((row) => row.profileId === "empty")).toMatchObject({ publishedVideos: 0, scheduledVideos: 0 });
    expect(report.unmatchedScheduledVideos).toBe(1);
    expect(report.unmatchedAccounts).toEqual(["@semvinculo"]);
  });
});
