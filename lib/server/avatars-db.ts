import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { Avatar, AvatarDocuments, AvatarImageUrls, AvatarInput, AvatarStatus } from "@/lib/server/avatar-types";
import type { Engine } from "@/lib/editor/types";

function throwIfError<T>(data: T, error: { message: string } | null): T {
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

type AvatarRow = {
  id: string;
  name: string;
  engine: string;
  niche: string;
  pain_point: string;
  audience: string;
  promise: string;
  boundaries: string[] | null;
  tone_adjectives: string[] | null;
  always_rules: string[] | null;
  never_rules: string[] | null;
  signature_phrase: string;
  pillars: Avatar["pillars"] | null;
  visual_style: string;
  voice_notes: string;
  documents: AvatarDocuments | null;
  image_urls: AvatarImageUrls | null;
  drive_folder_id: string | null;
  status: string;
  error_message: string | null;
  profile_id: string | null;
  created_at: string;
  updated_at: string;
};

function fromRow(row: AvatarRow): Avatar {
  return {
    id: row.id,
    name: row.name,
    engine: row.engine as Engine,
    niche: row.niche,
    painPoint: row.pain_point,
    audience: row.audience,
    promise: row.promise,
    boundaries: row.boundaries ?? [],
    toneAdjectives: row.tone_adjectives ?? [],
    alwaysRules: row.always_rules ?? [],
    neverRules: row.never_rules ?? [],
    signaturePhrase: row.signature_phrase,
    pillars: row.pillars ?? [],
    visualStyle: row.visual_style,
    voiceNotes: row.voice_notes,
    documents: row.documents,
    imageUrls: row.image_urls,
    driveFolderId: row.drive_folder_id,
    status: row.status as AvatarStatus,
    errorMessage: row.error_message,
    profileId: row.profile_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const avatarsRepo = {
  async list(): Promise<Avatar[]> {
    const { data, error } = await getSupabaseAdmin().from("avatars").select("*").order("created_at", { ascending: false });
    return throwIfError(data ?? [], error).map((row) => fromRow(row as AvatarRow));
  },

  async get(id: string): Promise<Avatar | null> {
    const { data, error } = await getSupabaseAdmin().from("avatars").select("*").eq("id", id).maybeSingle();
    const row = throwIfError(data, error);
    return row ? fromRow(row as AvatarRow) : null;
  },

  async create(input: AvatarInput & { engine: Engine }): Promise<Avatar> {
    const { data, error } = await getSupabaseAdmin()
      .from("avatars")
      .insert({
        name: input.name,
        engine: input.engine,
        niche: input.niche,
        pain_point: input.painPoint,
        audience: input.audience,
        promise: input.promise,
        boundaries: input.boundaries,
        tone_adjectives: input.toneAdjectives,
        always_rules: input.alwaysRules,
        never_rules: input.neverRules,
        signature_phrase: input.signaturePhrase,
        pillars: input.pillars,
        visual_style: input.visualStyle,
        voice_notes: input.voiceNotes,
      })
      .select("*")
      .single();
    return fromRow(throwIfError(data, error) as AvatarRow);
  },

  async update(
    id: string,
    patch: Partial<{
      status: AvatarStatus;
      errorMessage: string | null;
      documents: AvatarDocuments | null;
      imageUrls: AvatarImageUrls | null;
      driveFolderId: string | null;
      profileId: string | null;
    }>
  ): Promise<void> {
    const { error } = await getSupabaseAdmin()
      .from("avatars")
      .update({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.errorMessage !== undefined ? { error_message: patch.errorMessage } : {}),
        ...(patch.documents !== undefined ? { documents: patch.documents } : {}),
        ...(patch.imageUrls !== undefined ? { image_urls: patch.imageUrls } : {}),
        ...(patch.driveFolderId !== undefined ? { drive_folder_id: patch.driveFolderId } : {}),
        ...(patch.profileId !== undefined ? { profile_id: patch.profileId } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    throwIfError(null, error);
  },

  async remove(id: string): Promise<void> {
    const { error } = await getSupabaseAdmin().from("avatars").delete().eq("id", id);
    throwIfError(null, error);
  },
};
