import { CriadorAvatarSkeleton } from "@/components/skeletons/criador-avatar-skeleton";

export default function CriadorAvatarPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Criador de Avatar</h1>
      <p className="mb-8 mt-1 text-sm text-muted">
        Construa influenciadores virtuais completos, do zero ao publicado.
      </p>
      <CriadorAvatarSkeleton />
    </div>
  );
}
