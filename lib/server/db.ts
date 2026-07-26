import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type {
  Batch,
  BatchItem,
  ManualOverrides,
  MetricSnapshot,
  Platform,
  Profile,
  Publication,
  PublicationStatus,
  SourceAnalysis,
  Template,
} from "@/lib/editor/types";
import { MOCK_PROFILES } from "@/lib/editor/mock-profiles";
import { MOCK_TEMPLATES } from "@/lib/editor/mock-templates";

const DATA_DIR = path.join(process.cwd(), "data");
mkdirSync(DATA_DIR, { recursive: true });

// Reused across hot reloads in dev (Next.js clears the module cache per request in some
// modes, but `global` survives), so we don't reopen/re-migrate the file on every import.
const globalForDb = globalThis as unknown as { __zenxDb?: DatabaseSync };

function openDb(): DatabaseSync {
  if (globalForDb.__zenxDb) return globalForDb.__zenxDb;
  const db = new DatabaseSync(path.join(DATA_DIR, "zenx.sqlite"));
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      engine TEXT NOT NULL,
      name TEXT NOT NULL,
      template_id TEXT NOT NULL,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      engine TEXT NOT NULL,
      name TEXT NOT NULL,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      engine TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS batch_items (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      status TEXT NOT NULL,
      content_url TEXT,
      rendered_url TEXT,
      error TEXT,
      manual_overrides TEXT NOT NULL,
      source_analysis TEXT
    );
    CREATE TABLE IF NOT EXISTS drive_tokens (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      tokens TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS publications (
      id TEXT PRIMARY KEY,
      batch_item_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      status TEXT NOT NULL,
      external_id TEXT,
      permalink TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      published_at TEXT
    );
    CREATE TABLE IF NOT EXISTS metric_snapshots (
      id TEXT PRIMARY KEY,
      publication_id TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      views INTEGER NOT NULL DEFAULT 0,
      likes INTEGER NOT NULL DEFAULT 0,
      comments INTEGER NOT NULL DEFAULT 0,
      shares INTEGER NOT NULL DEFAULT 0
    );
  `);
  const profileCount = (db.prepare("SELECT COUNT(*) AS n FROM profiles").get() as { n: number }).n;
  if (profileCount === 0) {
    for (const template of MOCK_TEMPLATES) {
      const { id, engine, name, ...rest } = template;
      db.prepare("INSERT INTO templates (id, engine, name, data) VALUES (?, ?, ?, ?)").run(
        id,
        engine,
        name,
        JSON.stringify(rest)
      );
    }
    for (const profile of MOCK_PROFILES) {
      const { id, engine, name, templateId, ...rest } = profile as Profile & { templateId: string };
      db.prepare("INSERT INTO profiles (id, engine, name, template_id, data) VALUES (?, ?, ?, ?, ?)").run(
        id,
        engine,
        name,
        templateId,
        JSON.stringify(rest)
      );
    }
  }

  globalForDb.__zenxDb = db;
  return db;
}

type ProfileRow = { id: string; engine: string; name: string; template_id: string; data: string };
type TemplateRow = { id: string; engine: string; name: string; data: string };
type BatchRow = { id: string; profile_id: string; engine: string; created_at: string };
type BatchItemRow = {
  id: string;
  batch_id: string;
  filename: string;
  status: string;
  content_url: string | null;
  rendered_url: string | null;
  error: string | null;
  manual_overrides: string;
  source_analysis: string | null;
};
type PublicationRow = {
  id: string;
  batch_item_id: string;
  platform: string;
  status: string;
  external_id: string | null;
  permalink: string | null;
  error: string | null;
  created_at: string;
  published_at: string | null;
};
type MetricSnapshotRow = {
  id: string;
  publication_id: string;
  captured_at: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
};

function profileFromRow(row: ProfileRow): Profile {
  return { ...JSON.parse(row.data), id: row.id, engine: row.engine, name: row.name, templateId: row.template_id } as Profile;
}

function templateFromRow(row: TemplateRow): Template {
  return { ...JSON.parse(row.data), id: row.id, engine: row.engine, name: row.name } as Template;
}

function batchFromRow(row: BatchRow): Batch {
  return { id: row.id, profileId: row.profile_id, engine: row.engine as Batch["engine"], createdAt: row.created_at };
}

function batchItemFromRow(row: BatchItemRow): BatchItem {
  return {
    id: row.id,
    batchId: row.batch_id,
    filename: row.filename,
    status: row.status as BatchItem["status"],
    contentUrl: row.content_url,
    renderedUrl: row.rendered_url,
    error: row.error,
    manualOverrides: JSON.parse(row.manual_overrides) as ManualOverrides,
    sourceAnalysis: row.source_analysis ? (JSON.parse(row.source_analysis) as SourceAnalysis) : null,
  };
}

function publicationFromRow(row: PublicationRow): Publication {
  return {
    id: row.id,
    batchItemId: row.batch_item_id,
    platform: row.platform as Platform,
    status: row.status as PublicationStatus,
    externalId: row.external_id,
    permalink: row.permalink,
    error: row.error,
    createdAt: row.created_at,
    publishedAt: row.published_at,
  };
}

function metricSnapshotFromRow(row: MetricSnapshotRow): MetricSnapshot {
  return {
    id: row.id,
    publicationId: row.publication_id,
    capturedAt: row.captured_at,
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
  };
}

export const profilesRepo = {
  list(): Profile[] {
    const rows = openDb().prepare("SELECT * FROM profiles").all() as unknown as ProfileRow[];
    return rows.map(profileFromRow);
  },
  upsert(profile: Profile) {
    const { id, engine, name, templateId, ...rest } = profile as Profile & { templateId: string };
    openDb()
      .prepare(
        `INSERT INTO profiles (id, engine, name, template_id, data) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET engine = excluded.engine, name = excluded.name,
           template_id = excluded.template_id, data = excluded.data`
      )
      .run(id, engine, name, templateId, JSON.stringify(rest));
  },
  remove(id: string) {
    openDb().prepare("DELETE FROM profiles WHERE id = ?").run(id);
  },
};

export const templatesRepo = {
  list(): Template[] {
    const rows = openDb().prepare("SELECT * FROM templates").all() as unknown as TemplateRow[];
    return rows.map(templateFromRow);
  },
  upsert(template: Template) {
    const { id, engine, name, ...rest } = template;
    openDb()
      .prepare(
        `INSERT INTO templates (id, engine, name, data) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET engine = excluded.engine, name = excluded.name, data = excluded.data`
      )
      .run(id, engine, name, JSON.stringify(rest));
  },
  remove(id: string) {
    openDb().prepare("DELETE FROM templates WHERE id = ?").run(id);
  },
};

export const batchesRepo = {
  list(): Batch[] {
    const rows = openDb().prepare("SELECT * FROM batches ORDER BY created_at ASC").all() as unknown as BatchRow[];
    return rows.map(batchFromRow);
  },
  create(batch: Batch) {
    openDb()
      .prepare("INSERT INTO batches (id, profile_id, engine, created_at) VALUES (?, ?, ?, ?)")
      .run(batch.id, batch.profileId, batch.engine, batch.createdAt);
  },
};

export const batchItemsRepo = {
  list(): BatchItem[] {
    const rows = openDb().prepare("SELECT * FROM batch_items ORDER BY rowid DESC").all() as unknown as BatchItemRow[];
    return rows.map(batchItemFromRow);
  },
  get(id: string): BatchItem | null {
    const row = openDb().prepare("SELECT * FROM batch_items WHERE id = ?").get(id) as unknown as
      | BatchItemRow
      | undefined;
    return row ? batchItemFromRow(row) : null;
  },
  create(item: BatchItem) {
    openDb()
      .prepare(
        `INSERT INTO batch_items
           (id, batch_id, filename, status, content_url, rendered_url, error, manual_overrides, source_analysis)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        item.id,
        item.batchId,
        item.filename,
        item.status,
        item.contentUrl,
        item.renderedUrl,
        item.error,
        JSON.stringify(item.manualOverrides),
        item.sourceAnalysis ? JSON.stringify(item.sourceAnalysis) : null
      );
  },
  update(id: string, patch: Partial<BatchItem>) {
    const current = batchItemsRepo.get(id);
    if (!current) return;
    const next: BatchItem = { ...current, ...patch };
    openDb()
      .prepare(
        `UPDATE batch_items SET status = ?, content_url = ?, rendered_url = ?, error = ?,
           manual_overrides = ?, source_analysis = ? WHERE id = ?`
      )
      .run(
        next.status,
        next.contentUrl,
        next.renderedUrl,
        next.error,
        JSON.stringify(next.manualOverrides),
        next.sourceAnalysis ? JSON.stringify(next.sourceAnalysis) : null,
        id
      );
  },
  remove(id: string) {
    openDb().prepare("DELETE FROM batch_items WHERE id = ?").run(id);
  },
};

export const driveTokensRepo = {
  get(): Record<string, unknown> | null {
    const row = openDb().prepare("SELECT tokens FROM drive_tokens WHERE id = 1").get() as unknown as
      | { tokens: string }
      | undefined;
    return row ? JSON.parse(row.tokens) : null;
  },
  set(tokens: Record<string, unknown>) {
    openDb()
      .prepare(
        `INSERT INTO drive_tokens (id, tokens) VALUES (1, ?)
         ON CONFLICT(id) DO UPDATE SET tokens = excluded.tokens`
      )
      .run(JSON.stringify(tokens));
  },
};

export const publicationsRepo = {
  list(): Publication[] {
    const rows = openDb()
      .prepare("SELECT * FROM publications ORDER BY created_at DESC")
      .all() as unknown as PublicationRow[];
    return rows.map(publicationFromRow);
  },
  create(publication: Publication) {
    openDb()
      .prepare(
        `INSERT INTO publications
           (id, batch_item_id, platform, status, external_id, permalink, error, created_at, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        publication.id,
        publication.batchItemId,
        publication.platform,
        publication.status,
        publication.externalId,
        publication.permalink,
        publication.error,
        publication.createdAt,
        publication.publishedAt
      );
  },
  update(id: string, patch: Partial<Publication>) {
    const row = openDb().prepare("SELECT * FROM publications WHERE id = ?").get(id) as unknown as
      | PublicationRow
      | undefined;
    if (!row) return;
    const current = publicationFromRow(row);
    const next: Publication = { ...current, ...patch };
    openDb()
      .prepare(
        `UPDATE publications SET status = ?, external_id = ?, permalink = ?, error = ?, published_at = ?
         WHERE id = ?`
      )
      .run(next.status, next.externalId, next.permalink, next.error, next.publishedAt, id);
  },
};

export const metricSnapshotsRepo = {
  listByPublication(publicationId: string): MetricSnapshot[] {
    const rows = openDb()
      .prepare("SELECT * FROM metric_snapshots WHERE publication_id = ? ORDER BY captured_at ASC")
      .all(publicationId) as unknown as MetricSnapshotRow[];
    return rows.map(metricSnapshotFromRow);
  },
  listLatestPerPublication(): MetricSnapshot[] {
    const rows = openDb()
      .prepare(
        `SELECT m.* FROM metric_snapshots m
         INNER JOIN (
           SELECT publication_id, MAX(captured_at) AS max_captured_at
           FROM metric_snapshots GROUP BY publication_id
         ) latest
         ON m.publication_id = latest.publication_id AND m.captured_at = latest.max_captured_at`
      )
      .all() as unknown as MetricSnapshotRow[];
    return rows.map(metricSnapshotFromRow);
  },
  create(snapshot: MetricSnapshot) {
    openDb()
      .prepare(
        `INSERT INTO metric_snapshots (id, publication_id, captured_at, views, likes, comments, shares)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        snapshot.id,
        snapshot.publicationId,
        snapshot.capturedAt,
        snapshot.views,
        snapshot.likes,
        snapshot.comments,
        snapshot.shares
      );
  },
};
