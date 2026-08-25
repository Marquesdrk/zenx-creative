import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { decryptSecret, encryptSecret } from "@/lib/server/crypto";
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
import type {
  PublicationLog,
  PublicationLogAction,
  PublicationLogStatus,
  ScheduledPost,
  ScheduledPostAccount,
  ScheduledPostAccountStatus,
  ScheduledPostStatus,
  SocialAccount,
  SocialAccountStatus,
  SocialPlatform,
} from "@/lib/server/meta/types";

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

  // --- Integração Meta (Instagram + Facebook) ---------------------------------------------
  // Migração puramente aditiva: nenhuma tabela/coluna existente é alterada. Ver
  // docs/META_INTEGRATION_SETUP.md para o desenho completo.
  db.exec(`
    CREATE TABLE IF NOT EXISTS social_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      platform TEXT NOT NULL,
      platform_account_id TEXT NOT NULL,
      page_id TEXT,
      instagram_user_id TEXT,
      account_name TEXT NOT NULL,
      username TEXT,
      profile_picture_url TEXT,
      access_token_encrypted TEXT NOT NULL,
      token_expires_at TEXT,
      status TEXT NOT NULL DEFAULT 'connected',
      meta_user_id TEXT,
      last_checked_at TEXT,
      last_error TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (platform, platform_account_id)
    );

    -- CSRF: state de curta duração emitido em /api/meta/auth e validado em /api/meta/callback.
    CREATE TABLE IF NOT EXISTS meta_oauth_states (
      state TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    -- Cache curto (server-side) dos ativos descobertos após o OAuth, até o usuário escolher
    -- quais conectar. Guarda o token de usuário e os tokens de Página só criptografados, e
    -- nunca chegam ao navegador — só os metadados (nome, foto, ids) via /api/meta/discover.
    CREATE TABLE IF NOT EXISTS meta_oauth_sessions (
      id TEXT PRIMARY KEY,
      meta_user_id TEXT,
      discovered_encrypted TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scheduled_posts (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      video_url TEXT NOT NULL,
      caption TEXT NOT NULL DEFAULT '',
      scheduled_at TEXT,
      status TEXT NOT NULL DEFAULT 'scheduled',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scheduled_post_accounts (
      id TEXT PRIMARY KEY,
      scheduled_post_id TEXT NOT NULL,
      social_account_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      external_post_id TEXT,
      error_code TEXT,
      error_message TEXT,
      recoverable INTEGER,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT,
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_spa_due
      ON scheduled_post_accounts (status, next_attempt_at);
    CREATE INDEX IF NOT EXISTS idx_spa_post
      ON scheduled_post_accounts (scheduled_post_id);

    CREATE TABLE IF NOT EXISTS publication_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      scheduled_post_id TEXT,
      social_account_id TEXT,
      platform TEXT,
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      external_post_id TEXT,
      error_code TEXT,
      error_message TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_logs_account ON publication_logs (social_account_id, created_at);
  `);

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

// --- Integração Meta (Instagram + Facebook) -----------------------------------------------

type SocialAccountRow = {
  id: string;
  user_id: string | null;
  platform: string;
  platform_account_id: string;
  page_id: string | null;
  instagram_user_id: string | null;
  account_name: string;
  username: string | null;
  profile_picture_url: string | null;
  access_token_encrypted: string;
  token_expires_at: string | null;
  status: string;
  meta_user_id: string | null;
  last_checked_at: string | null;
  last_error: string | null;
  metadata: string;
  created_at: string;
  updated_at: string;
};

function socialAccountFromRow(row: SocialAccountRow): SocialAccount {
  return {
    id: row.id,
    userId: row.user_id,
    platform: row.platform as SocialPlatform,
    platformAccountId: row.platform_account_id,
    pageId: row.page_id,
    instagramUserId: row.instagram_user_id,
    accountName: row.account_name,
    username: row.username,
    profilePictureUrl: row.profile_picture_url,
    status: row.status as SocialAccountStatus,
    metaUserId: row.meta_user_id,
    tokenExpiresAt: row.token_expires_at,
    lastCheckedAt: row.last_checked_at,
    lastError: row.last_error,
    metadata: JSON.parse(row.metadata || "{}"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** access_token_encrypted nunca é exposto por esse tipo de retorno — quem precisa do token
 *  decodificado usa socialAccountsRepo.getAccessToken(id) explicitamente. */
export const socialAccountsRepo = {
  list(): SocialAccount[] {
    const rows = openDb()
      .prepare("SELECT * FROM social_accounts ORDER BY platform ASC, account_name ASC")
      .all() as unknown as SocialAccountRow[];
    return rows.map(socialAccountFromRow);
  },
  get(id: string): SocialAccount | null {
    const row = openDb().prepare("SELECT * FROM social_accounts WHERE id = ?").get(id) as unknown as
      | SocialAccountRow
      | undefined;
    return row ? socialAccountFromRow(row) : null;
  },
  findByPlatformAccountId(platform: SocialPlatform, platformAccountId: string): SocialAccount | null {
    const row = openDb()
      .prepare("SELECT * FROM social_accounts WHERE platform = ? AND platform_account_id = ?")
      .get(platform, platformAccountId) as unknown as SocialAccountRow | undefined;
    return row ? socialAccountFromRow(row) : null;
  },
  /** Token decodificado — só para uso interno de publicação/validação, nunca serializado
   *  numa resposta HTTP. */
  getAccessToken(id: string): string | null {
    const row = openDb().prepare("SELECT access_token_encrypted FROM social_accounts WHERE id = ?").get(id) as
      | { access_token_encrypted: string }
      | undefined;
    if (!row?.access_token_encrypted) return null;
    return decryptSecret(row.access_token_encrypted);
  },
  /** Cria a conta, ou (se já existir uma com o mesmo platform+platform_account_id — ex.:
   *  reconexão) atualiza o token e os metadados e volta o status para "connected". Nunca cria
   *  colunas por conta — cada conexão é sempre uma linha nova e independente. */
  upsertFromConnection(input: {
    id: string;
    userId?: string | null;
    platform: SocialPlatform;
    platformAccountId: string;
    pageId: string | null;
    instagramUserId: string | null;
    accountName: string;
    username: string | null;
    profilePictureUrl: string | null;
    accessToken: string;
    tokenExpiresAt: string | null;
    metaUserId: string | null;
    metadata?: Record<string, unknown>;
  }): SocialAccount {
    const now = new Date().toISOString();
    const existing = socialAccountsRepo.findByPlatformAccountId(input.platform, input.platformAccountId);
    const encrypted = encryptSecret(input.accessToken);
    const metadataJson = JSON.stringify(input.metadata ?? {});
    if (existing) {
      openDb()
        .prepare(
          `UPDATE social_accounts SET
             page_id = ?, instagram_user_id = ?, account_name = ?, username = ?,
             profile_picture_url = ?, access_token_encrypted = ?, token_expires_at = ?,
             status = 'connected', meta_user_id = ?, last_checked_at = ?, last_error = NULL,
             metadata = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          input.pageId,
          input.instagramUserId,
          input.accountName,
          input.username,
          input.profilePictureUrl,
          encrypted,
          input.tokenExpiresAt,
          input.metaUserId,
          now,
          metadataJson,
          now,
          existing.id
        );
      return socialAccountsRepo.get(existing.id)!;
    }
    openDb()
      .prepare(
        `INSERT INTO social_accounts
           (id, user_id, platform, platform_account_id, page_id, instagram_user_id, account_name,
            username, profile_picture_url, access_token_encrypted, token_expires_at, status,
            meta_user_id, last_checked_at, last_error, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'connected', ?, ?, NULL, ?, ?, ?)`
      )
      .run(
        input.id,
        input.userId ?? null,
        input.platform,
        input.platformAccountId,
        input.pageId,
        input.instagramUserId,
        input.accountName,
        input.username,
        input.profilePictureUrl,
        encrypted,
        input.tokenExpiresAt,
        input.metaUserId,
        now,
        metadataJson,
        now,
        now
      );
    return socialAccountsRepo.get(input.id)!;
  },
  updateStatus(id: string, status: SocialAccountStatus, patch?: { lastError?: string | null; lastCheckedAt?: string }) {
    const now = new Date().toISOString();
    openDb()
      .prepare(
        `UPDATE social_accounts SET status = ?, last_error = ?, last_checked_at = ?, updated_at = ? WHERE id = ?`
      )
      .run(status, patch?.lastError ?? null, patch?.lastCheckedAt ?? now, now, id);
  },
  /** "Desconectar": revoga localmente e apaga o token (não recuperável a partir daqui) — mas
   *  preserva a linha e o histórico de publicações associado a ela para auditoria. Não afeta
   *  nenhuma outra conta. Reconectar (via OAuth de novo, escolhendo o mesmo ativo) cria um
   *  token novo e volta o status para "connected". */
  disconnect(id: string) {
    const now = new Date().toISOString();
    openDb()
      .prepare(
        `UPDATE social_accounts SET status = 'revoked', access_token_encrypted = '', updated_at = ? WHERE id = ?`
      )
      .run(now, id);
  },
};

type ScheduledPostRow = {
  id: string;
  user_id: string | null;
  video_url: string;
  caption: string;
  scheduled_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

function scheduledPostFromRow(row: ScheduledPostRow): ScheduledPost {
  return {
    id: row.id,
    userId: row.user_id,
    videoUrl: row.video_url,
    caption: row.caption,
    scheduledAt: row.scheduled_at,
    status: row.status as ScheduledPostStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const scheduledPostsRepo = {
  list(): ScheduledPost[] {
    const rows = openDb()
      .prepare("SELECT * FROM scheduled_posts ORDER BY created_at DESC")
      .all() as unknown as ScheduledPostRow[];
    return rows.map(scheduledPostFromRow);
  },
  get(id: string): ScheduledPost | null {
    const row = openDb().prepare("SELECT * FROM scheduled_posts WHERE id = ?").get(id) as unknown as
      | ScheduledPostRow
      | undefined;
    return row ? scheduledPostFromRow(row) : null;
  },
  create(post: ScheduledPost) {
    openDb()
      .prepare(
        `INSERT INTO scheduled_posts (id, user_id, video_url, caption, scheduled_at, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(post.id, post.userId, post.videoUrl, post.caption, post.scheduledAt, post.status, post.createdAt, post.updatedAt);
  },
  updateStatus(id: string, status: ScheduledPostStatus) {
    openDb()
      .prepare("UPDATE scheduled_posts SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, new Date().toISOString(), id);
  },
  /** Recalcula o status agregado a partir dos destinos (scheduled_post_accounts) e persiste.
   *  Um erro num destino nunca derruba os demais — isso só reflete o agregado pra listagem. */
  syncStatusFromAccounts(id: string) {
    const accounts = scheduledPostAccountsRepo.listByPost(id);
    if (accounts.length === 0) return;
    let next: ScheduledPostStatus;
    if (accounts.every((a) => a.status === "cancelled")) next = "cancelled";
    else if (accounts.some((a) => a.status === "scheduled" || a.status === "processing")) next = "processing";
    else if (accounts.every((a) => a.status === "published" || a.status === "cancelled")) next = "published";
    else if (accounts.some((a) => a.status === "failed")) next = "failed";
    else next = "processing";
    scheduledPostsRepo.updateStatus(id, next);
  },
};

type ScheduledPostAccountRow = {
  id: string;
  scheduled_post_id: string;
  social_account_id: string;
  status: string;
  external_post_id: string | null;
  error_code: string | null;
  error_message: string | null;
  recoverable: number | null;
  attempt_count: number;
  next_attempt_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

function scheduledPostAccountFromRow(row: ScheduledPostAccountRow): ScheduledPostAccount {
  return {
    id: row.id,
    scheduledPostId: row.scheduled_post_id,
    socialAccountId: row.social_account_id,
    status: row.status as ScheduledPostAccountStatus,
    externalPostId: row.external_post_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    recoverable: row.recoverable === null ? null : Boolean(row.recoverable),
    attemptCount: row.attempt_count,
    nextAttemptAt: row.next_attempt_at,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const scheduledPostAccountsRepo = {
  listByPost(scheduledPostId: string): ScheduledPostAccount[] {
    const rows = openDb()
      .prepare("SELECT * FROM scheduled_post_accounts WHERE scheduled_post_id = ? ORDER BY created_at ASC")
      .all(scheduledPostId) as unknown as ScheduledPostAccountRow[];
    return rows.map(scheduledPostAccountFromRow);
  },
  get(id: string): ScheduledPostAccount | null {
    const row = openDb().prepare("SELECT * FROM scheduled_post_accounts WHERE id = ?").get(id) as unknown as
      | ScheduledPostAccountRow
      | undefined;
    return row ? scheduledPostAccountFromRow(row) : null;
  },
  create(row: ScheduledPostAccount) {
    openDb()
      .prepare(
        `INSERT INTO scheduled_post_accounts
           (id, scheduled_post_id, social_account_id, status, external_post_id, error_code,
            error_message, recoverable, attempt_count, next_attempt_at, published_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        row.id,
        row.scheduledPostId,
        row.socialAccountId,
        row.status,
        row.externalPostId,
        row.errorCode,
        row.errorMessage,
        row.recoverable === null ? null : row.recoverable ? 1 : 0,
        row.attemptCount,
        row.nextAttemptAt,
        row.publishedAt,
        row.createdAt,
        row.updatedAt
      );
  },
  /** Reivindica atomicamente 1 destino pendente antes de publicar — evita duplicar a
   *  publicação se dois disparos do scheduler rodarem ao mesmo tempo (a UPDATE só afeta a
   *  linha se ela ainda estiver "scheduled"; `changes === 0` = outro worker já pegou). */
  claim(id: string): boolean {
    const now = new Date().toISOString();
    const result = openDb()
      .prepare(`UPDATE scheduled_post_accounts SET status = 'processing', updated_at = ? WHERE id = ? AND status = 'scheduled'`)
      .run(now, id);
    return Number(result.changes) === 1;
  },
  listDue(nowIso: string): ScheduledPostAccount[] {
    const rows = openDb()
      .prepare(
        `SELECT spa.* FROM scheduled_post_accounts spa
         JOIN scheduled_posts sp ON sp.id = spa.scheduled_post_id
         WHERE spa.status = 'scheduled'
           AND (sp.scheduled_at IS NULL OR sp.scheduled_at <= ?)
           AND (spa.next_attempt_at IS NULL OR spa.next_attempt_at <= ?)
         ORDER BY sp.scheduled_at ASC`
      )
      .all(nowIso, nowIso) as unknown as ScheduledPostAccountRow[];
    return rows.map(scheduledPostAccountFromRow);
  },
  updateResult(
    id: string,
    patch: Partial<{
      status: ScheduledPostAccountStatus;
      externalPostId: string | null;
      errorCode: string | null;
      errorMessage: string | null;
      recoverable: boolean | null;
      attemptCount: number;
      nextAttemptAt: string | null;
      publishedAt: string | null;
    }>
  ) {
    const current = scheduledPostAccountsRepo.get(id);
    if (!current) return;
    const next = { ...current, ...patch };
    openDb()
      .prepare(
        `UPDATE scheduled_post_accounts SET
           status = ?, external_post_id = ?, error_code = ?, error_message = ?, recoverable = ?,
           attempt_count = ?, next_attempt_at = ?, published_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        next.status,
        next.externalPostId,
        next.errorCode,
        next.errorMessage,
        next.recoverable === null || next.recoverable === undefined ? null : next.recoverable ? 1 : 0,
        next.attemptCount,
        next.nextAttemptAt,
        next.publishedAt,
        new Date().toISOString(),
        id
      );
  },
};

type PublicationLogRow = {
  id: string;
  user_id: string | null;
  scheduled_post_id: string | null;
  social_account_id: string | null;
  platform: string | null;
  action: string;
  status: string;
  external_post_id: string | null;
  error_code: string | null;
  error_message: string | null;
  metadata: string;
  created_at: string;
};

function publicationLogFromRow(row: PublicationLogRow): PublicationLog {
  return {
    id: row.id,
    userId: row.user_id,
    scheduledPostId: row.scheduled_post_id,
    socialAccountId: row.social_account_id,
    platform: row.platform as SocialPlatform | null,
    action: row.action as PublicationLogAction,
    status: row.status as PublicationLogStatus,
    externalPostId: row.external_post_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    metadata: JSON.parse(row.metadata || "{}"),
    createdAt: row.created_at,
  };
}

/** Nunca receba um token/segredo em `metadata` — este log é só para diagnóstico operacional
 *  e pode ser lido por qualquer tela de auditoria no futuro. */
export const publicationLogsRepo = {
  create(log: Omit<PublicationLog, "id" | "createdAt"> & { id?: string; createdAt?: string }) {
    const id = log.id ?? crypto.randomUUID();
    const createdAt = log.createdAt ?? new Date().toISOString();
    openDb()
      .prepare(
        `INSERT INTO publication_logs
           (id, user_id, scheduled_post_id, social_account_id, platform, action, status,
            external_post_id, error_code, error_message, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        log.userId ?? null,
        log.scheduledPostId ?? null,
        log.socialAccountId ?? null,
        log.platform ?? null,
        log.action,
        log.status,
        log.externalPostId ?? null,
        log.errorCode ?? null,
        log.errorMessage ?? null,
        JSON.stringify(log.metadata ?? {}),
        createdAt
      );
    return id;
  },
  listBySocialAccount(socialAccountId: string, limit = 50): PublicationLog[] {
    const rows = openDb()
      .prepare("SELECT * FROM publication_logs WHERE social_account_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(socialAccountId, limit) as unknown as PublicationLogRow[];
    return rows.map(publicationLogFromRow);
  },
  listRecent(limit = 100): PublicationLog[] {
    const rows = openDb()
      .prepare("SELECT * FROM publication_logs ORDER BY created_at DESC LIMIT ?")
      .all(limit) as unknown as PublicationLogRow[];
    return rows.map(publicationLogFromRow);
  },
};

export const metaOAuthStateRepo = {
  create(ttlMinutes = 10): string {
    const state = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000).toISOString();
    openDb()
      .prepare("INSERT INTO meta_oauth_states (state, created_at, expires_at) VALUES (?, ?, ?)")
      .run(state, now.toISOString(), expiresAt);
    return state;
  },
  /** Valida e consome (uso único) — retorna false se o state não existir, já tiver sido usado
   *  ou tiver expirado. Essencial pra proteção contra CSRF no callback do OAuth. */
  consume(state: string): boolean {
    const db = openDb();
    const row = db.prepare("SELECT expires_at FROM meta_oauth_states WHERE state = ?").get(state) as unknown as
      | { expires_at: string }
      | undefined;
    if (!row) return false;
    db.prepare("DELETE FROM meta_oauth_states WHERE state = ?").run(state);
    return row.expires_at >= new Date().toISOString();
  },
  cleanupExpired() {
    openDb().prepare("DELETE FROM meta_oauth_states WHERE expires_at < ?").run(new Date().toISOString());
  },
};

export const metaOAuthSessionRepo = {
  /** `discovered` é serializado e criptografado inteiro (contém os tokens de Página) — só é
   *  decodificado no servidor, nunca devolvido cru pela API. */
  create(input: { metaUserId: string | null; discovered: unknown; ttlMinutes?: number }): string {
    const id = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (input.ttlMinutes ?? 15) * 60_000).toISOString();
    openDb()
      .prepare(
        "INSERT INTO meta_oauth_sessions (id, meta_user_id, discovered_encrypted, created_at, expires_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(id, input.metaUserId, encryptSecret(JSON.stringify(input.discovered)), now.toISOString(), expiresAt);
    return id;
  },
  get<T>(id: string): { metaUserId: string | null; discovered: T; expiresAt: string } | null {
    const row = openDb()
      .prepare("SELECT meta_user_id, discovered_encrypted, expires_at FROM meta_oauth_sessions WHERE id = ?")
      .get(id) as unknown as { meta_user_id: string | null; discovered_encrypted: string; expires_at: string } | undefined;
    if (!row) return null;
    if (row.expires_at < new Date().toISOString()) {
      metaOAuthSessionRepo.remove(id);
      return null;
    }
    return {
      metaUserId: row.meta_user_id,
      discovered: JSON.parse(decryptSecret(row.discovered_encrypted)) as T,
      expiresAt: row.expires_at,
    };
  },
  remove(id: string) {
    openDb().prepare("DELETE FROM meta_oauth_sessions WHERE id = ?").run(id);
  },
  cleanupExpired() {
    openDb().prepare("DELETE FROM meta_oauth_sessions WHERE expires_at < ?").run(new Date().toISOString());
  },
};
