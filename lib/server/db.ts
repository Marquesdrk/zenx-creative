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
import { DEFAULT_X_STYLE_LAYOUT } from "@/lib/editor/types";
import { MOCK_PROFILES } from "@/lib/editor/mock-profiles";
import { MOCK_TEMPLATES } from "@/lib/editor/mock-templates";

const DATA_DIR = process.env.VERCEL ? path.join("/tmp", "zenx-data") : path.join(process.cwd(), "data");
mkdirSync(DATA_DIR, { recursive: true });

// Reused across hot reloads in dev (Next.js clears the module cache per request in some
// modes, but `global` survives), so we don't reopen/re-migrate the file on every import.
const globalForDb = globalThis as unknown as { __zenxDb?: DatabaseSync };

function seedDefaults(db: DatabaseSync) {
  for (const template of MOCK_TEMPLATES) {
    const exists = db.prepare("SELECT id FROM templates WHERE id = ?").get(template.id);
    if (!exists) {
      const { id, engine, name, ...rest } = template;
      db.prepare("INSERT INTO templates (id, engine, name, data) VALUES (?, ?, ?, ?)").run(
        id,
        engine,
        name,
        JSON.stringify(rest)
      );
    }
  }
  for (const profile of MOCK_PROFILES) {
    const exists = db.prepare("SELECT id FROM profiles WHERE id = ?").get(profile.id);
    if (!exists) {
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
  const xStyleRows = db.prepare("SELECT * FROM profiles WHERE engine = ?").all("X_STYLE") as unknown as ProfileRow[];
  for (const row of xStyleRows) {
    const data = JSON.parse(row.data) as Record<string, unknown>;
    const layout = data.xStyleLayout as
      | {
          title?: { x?: number; y?: number; maxLines?: number };
          video?: { x?: number; y?: number; width?: number; height?: number };
          body?: { x?: number; y?: number; fontSize?: number; maxWidth?: number; maxLines?: number };
        }
      | undefined;
    const usesLegacyStack =
      !layout ||
      (layout.title?.y === 1395 && layout.video?.y === 390 && layout.body?.y === 1475) ||
      (layout.title?.y === 350 &&
        layout.video?.x === 120 &&
        layout.video?.y === 485 &&
        layout.video?.width === 840 &&
        layout.video?.height === 1000 &&
        layout.body?.y === 1535) ||
      (layout.title?.y === 350 &&
        layout.video?.x === 70 &&
        layout.video?.y === 455 &&
        layout.video?.width === 940 &&
        layout.video?.height === 1120 &&
        (layout.title?.x === undefined || layout.title?.maxLines === undefined));
    const usesSmallLowerCaption =
      !layout?.body ||
      layout.body.fontSize === undefined ||
      layout.body.fontSize <= 40 ||
      (layout.body.x === 120 && layout.body.y === 1615 && layout.body.maxWidth === 840);

    if (!usesLegacyStack && !usesSmallLowerCaption) continue;
    data.xStyleLayout = usesLegacyStack
      ? DEFAULT_X_STYLE_LAYOUT
      : { ...DEFAULT_X_STYLE_LAYOUT, ...layout, body: DEFAULT_X_STYLE_LAYOUT.body };
    db.prepare("UPDATE profiles SET data = ? WHERE id = ?").run(JSON.stringify(data), row.id);
  }
}

function openDb(): DatabaseSync {
  if (globalForDb.__zenxDb) {
    seedDefaults(globalForDb.__zenxDb);
    return globalForDb.__zenxDb;
  }
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
      scheduled_at TEXT,
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
  ensureColumn(db, "batches", "export_path", "TEXT");
  ensureColumn(db, "batches", "exported_at", "TEXT");
  ensureColumn(db, "batches", "storage_provider", "TEXT");
  ensureColumn(db, "batches", "storage_url", "TEXT");
  ensureColumn(db, "publications", "scheduled_at", "TEXT");

  seedDefaults(db);

  globalForDb.__zenxDb = db;
  return db;
}

type ProfileRow = { id: string; engine: string; name: string; template_id: string; data: string };
type TemplateRow = { id: string; engine: string; name: string; data: string };
type BatchRow = {
  id: string;
  profile_id: string;
  engine: string;
  created_at: string;
  export_path: string | null;
  exported_at: string | null;
  storage_provider: string | null;
  storage_url: string | null;
};
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
  scheduled_at: string | null;
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
  return {
    id: row.id,
    profileId: row.profile_id,
    engine: row.engine as Batch["engine"],
    createdAt: row.created_at,
    exportPath: row.export_path,
    exportedAt: row.exported_at,
    storageProvider: row.storage_provider as Batch["storageProvider"],
    storageUrl: row.storage_url,
  };
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
    scheduledAt: row.scheduled_at,
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

function ensureColumn(db: DatabaseSync, table: string, column: string, type: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{ name: string }>;
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

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
  update(id: string, patch: Partial<Batch>) {
    const row = openDb().prepare("SELECT * FROM batches WHERE id = ?").get(id) as unknown as BatchRow | undefined;
    if (!row) return;
    const current = batchFromRow(row);
    const next: Batch = { ...current, ...patch };
    openDb()
      .prepare(
        `UPDATE batches SET export_path = ?, exported_at = ?, storage_provider = ?, storage_url = ?
         WHERE id = ?`
      )
      .run(next.exportPath ?? null, next.exportedAt ?? null, next.storageProvider ?? null, next.storageUrl ?? null, id);
  },
  remove(id: string) {
    openDb().prepare("DELETE FROM batches WHERE id = ?").run(id);
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
           (id, batch_item_id, platform, status, scheduled_at, external_id, permalink, error, created_at, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        publication.id,
        publication.batchItemId,
        publication.platform,
        publication.status,
        publication.scheduledAt,
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
        `UPDATE publications SET status = ?, scheduled_at = ?, external_id = ?, permalink = ?, error = ?, published_at = ?
         WHERE id = ?`
      )
      .run(next.status, next.scheduledAt, next.externalId, next.permalink, next.error, next.publishedAt, id);
  },
  get(id: string): Publication | null {
    const row = openDb().prepare("SELECT * FROM publications WHERE id = ?").get(id) as unknown as
      | PublicationRow
      | undefined;
    return row ? publicationFromRow(row) : null;
  },
  listDue(nowIso: string): Publication[] {
    const rows = openDb()
      .prepare(
        `SELECT * FROM publications
         WHERE status = 'PENDING' AND scheduled_at IS NOT NULL AND scheduled_at <= ?
         ORDER BY scheduled_at ASC`
      )
      .all(nowIso) as unknown as PublicationRow[];
    return rows.map(publicationFromRow);
  },
  removeByBatchItem(batchItemId: string) {
    openDb().prepare("DELETE FROM publications WHERE batch_item_id = ?").run(batchItemId);
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

