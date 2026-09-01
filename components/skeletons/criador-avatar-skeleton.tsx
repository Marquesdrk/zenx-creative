import { SkeletonBlock } from "./skeleton-block";

export function CriadorAvatarSkeleton() {
  return (
    <div data-testid="criador-avatar-skeleton">
      <div className="mb-8 flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-1 flex-1" />
        ))}
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-11" />
        ))}
      </div>
    </div>
  );
}
