import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { MOCK_PROFILES } from "@/lib/editor/mock-profiles";
import { MOCK_TEMPLATES } from "@/lib/editor/mock-templates";
import type { Profile, Template } from "@/lib/editor/types";

// Perfis e templates do Editor em massa em Supabase — substitui o antigo localStorage (não
// sincronizava entre navegadores/máquinas) e o antigo SQLite (lib/server/db.ts, que em produção
// na Vercel vive em /tmp e some a cada cold start). Mesma forma de dado dos dois anteriores:
// id/engine/name(/templateId) como colunas, resto num blob JSON.

function throwIfError<T>(data: T, error: { message: string } | null): T {
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

type TemplateRow = { id: string; engine: string; name: string; data: Record<string, unknown> };
type ProfileRow = { id: string; engine: string; name: string; template_id: string; data: Record<string, unknown> };

function templateFromRow(row: TemplateRow): Template {
  return { ...row.data, id: row.id, engine: row.engine, name: row.name } as Template;
}

function profileFromRow(row: ProfileRow): Profile {
  return { ...row.data, id: row.id, engine: row.engine, name: row.name, templateId: row.template_id } as Profile;
}

export const editorTemplatesRepo = {
  async list(): Promise<Template[]> {
    const { data, error } = await getSupabaseAdmin().from("editor_templates").select("*");
    const rows = throwIfError(data ?? [], error) as TemplateRow[];
    if (rows.length === 0) {
      await Promise.all(MOCK_TEMPLATES.map((template) => editorTemplatesRepo.upsert(template)));
      return MOCK_TEMPLATES;
    }
    return rows.map(templateFromRow);
  },

  async upsert(template: Template): Promise<void> {
    const { id, engine, name, ...rest } = template;
    const { error } = await getSupabaseAdmin()
      .from("editor_templates")
      .upsert({ id, engine, name, data: rest, updated_at: new Date().toISOString() });
    throwIfError(null, error);
  },

  async remove(id: string): Promise<void> {
    const { error } = await getSupabaseAdmin().from("editor_templates").delete().eq("id", id);
    throwIfError(null, error);
  },
};

export const editorProfilesRepo = {
  async list(): Promise<Profile[]> {
    const { data, error } = await getSupabaseAdmin().from("editor_profiles").select("*");
    const rows = throwIfError(data ?? [], error) as ProfileRow[];
    if (rows.length === 0) {
      await Promise.all(MOCK_PROFILES.map((profile) => editorProfilesRepo.upsert(profile)));
      return MOCK_PROFILES;
    }
    return rows.map(profileFromRow);
  },

  async upsert(profile: Profile): Promise<void> {
    const { id, engine, name, templateId, ...rest } = profile as Profile & { templateId: string };
    const { error } = await getSupabaseAdmin()
      .from("editor_profiles")
      .upsert({ id, engine, name, template_id: templateId, data: rest, updated_at: new Date().toISOString() });
    throwIfError(null, error);
  },

  async remove(id: string): Promise<void> {
    const { error } = await getSupabaseAdmin().from("editor_profiles").delete().eq("id", id);
    throwIfError(null, error);
  },
};
