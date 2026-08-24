import { useState } from "react";
import type { CSSProperties } from "react";
import { BadgeCheck, User } from "lucide-react";
import {
  DEFAULT_X_STYLE_LAYOUT,
  resolveXStyleLayout,
  type CropBox,
  type FitMode,
  type Profile,
  type Rotation,
  type WatermarkPosition,
  type XStyleVideoFrame,
} from "@/lib/editor/types";

const CONTENT_GRADIENT = "bg-gradient-to-br from-neutral-700 to-neutral-900";
const DEFAULT_CROP: CropBox = { x: 0.5, y: 0.5 };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function VideoThumbnail({
  url,
  className,
  cropBox,
  cropZoom = 1,
  fit = "cover",
  rotation = 0,
  onDragPosition,
  style,
}: {
  url: string | null;
  className: string;
  style?: CSSProperties;
  /** Recorte relativo (0 a 1) aplicado via object-position — nunca estica o vídeo. */
  cropBox?: CropBox;
  /** Zoom sobre o recorte (1 = sem zoom), combinado com cropBox para um "recorte livre". */
  cropZoom?: number;
  fit?: FitMode;
  rotation?: Rotation;
  /** Quando presente, arrastar sobre o vídeo reposiciona o recorte ao vivo — mais direto
   *  que digitar em sliders pra alinhar o conteúdo. */
  onDragPosition?: (next: CropBox) => void;
}) {
  const [dragging, setDragging] = useState(false);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!onDragPosition) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || !onDragPosition || !cropBox) return;
    const rect = event.currentTarget.getBoundingClientRect();
    // Arrastar "empurra" o conteúdo, então a janela de recorte anda pro lado oposto do
    // gesto — igual segurar e mover uma foto. Divide pelo zoom porque, quanto mais
    // ampliado, menos o recorte precisa andar pro mesmo deslocamento de tela.
    const dxFraction = event.movementX / rect.width / cropZoom;
    const dyFraction = event.movementY / rect.height / cropZoom;
    onDragPosition({
      x: clamp(cropBox.x - dxFraction, 0, 1),
      y: clamp(cropBox.y - dyFraction, 0, 1),
    });
  }

  function handlePointerUp() {
    setDragging(false);
  }

  if (url) {
    return (
      // O zoom escala o <video> via transform — sem um wrapper com overflow-hidden do
      // tamanho exato da zona, o vídeo ampliado vaza para fora dela (ex.: conteúdo
      // cobrindo a faixa de reação acima). O clipping tem que ser por zona, não só no
      // frame externo.
      <div
        className={`${className} overflow-hidden ${onDragPosition ? "cursor-grab touch-none active:cursor-grabbing" : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={style}
      >
        <video
          src={url}
          muted
          playsInline
          preload="metadata"
          // Sem isso o vídeo pausado mostra um frame preto até o usuário interagir — busca um
          // instante adiante pra prévia já nascer com uma imagem real do conteúdo.
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            if (Number.isFinite(video.duration)) {
              video.currentTime = Math.min(0.1, video.duration / 2);
            }
          }}
          className={`h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"}`}
          style={{
            objectPosition: cropBox ? `${cropBox.x * 100}% ${cropBox.y * 100}%` : undefined,
            transform: `rotate(${rotation}deg) scale(${cropZoom})`,
            pointerEvents: onDragPosition ? "none" : undefined,
          }}
        />
      </div>
    );
  }
  return <div className={`${className} ${CONTENT_GRADIENT}`} style={style} />;
}

export function VideoFrame({
  profile,
  title,
  caption,
  contentUrl = null,
  contentCropBox = DEFAULT_CROP,
  contentCropZoom = 1,
  contentFit = "cover",
  contentRotation = 0,
  reactionMediaUrl = null,
  watermarkPosition = null,
  xStyleVideoFrame = null,
  onContentPositionChange,
}: {
  profile: Profile;
  title?: string;
  caption: string;
  contentUrl?: string | null;
  /** Recorte do conteúdo importado (não da mídia de reação nem da marca d'água). */
  contentCropBox?: CropBox;
  contentCropZoom?: number;
  contentFit?: FitMode;
  contentRotation?: Rotation;
  /** Só relevante quando profile.engine === "REACT". */
  reactionMediaUrl?: string | null;
  /** Só relevante quando profile.engine === "UGC". Posição x/y é relativa (0 a 1). */
  watermarkPosition?: WatermarkPosition | null;
  /** Só relevante quando profile.engine === "X_STYLE". Medidas no canvas 1080x1920. */
  xStyleVideoFrame?: XStyleVideoFrame | null;
  /** Presente só no editor manual — arrastar o conteúdo reposiciona o recorte ao vivo. */
  onContentPositionChange?: (next: CropBox) => void;
}) {
  const xStyleLayout = profile.engine === "X_STYLE" ? resolveXStyleLayout(profile.xStyleLayout) : DEFAULT_X_STYLE_LAYOUT;
  const xStyleVideo = xStyleVideoFrame ?? xStyleLayout.video;

  return (
    <div
      data-testid="video-frame"
      className="relative aspect-[9/16] w-full overflow-hidden rounded-xl border border-border bg-black"
    >
      {profile.engine === "REACT" && (
        <>
          <VideoThumbnail
            url={reactionMediaUrl}
            className="absolute inset-x-0 top-0 z-10 h-[36%] border-b border-dashed border-white/20"
          />
          <VideoThumbnail
            url={contentUrl}
            cropBox={contentCropBox}
            cropZoom={contentCropZoom}
            fit={contentFit}
            rotation={contentRotation}
            onDragPosition={onContentPositionChange}
            className="absolute inset-x-0 bottom-0 top-[36%] z-0"
          />
        </>
      )}

      {profile.engine === "X_STYLE" && (
        <div className="absolute inset-0 bg-white [container-type:inline-size]">
          {profile.backgroundImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- template artwork served from /public
            <img src={profile.backgroundImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute left-[10%] top-[7%] flex items-center gap-[3%] text-black">
              {profile.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- object URL, not an optimizable static asset
                <img src={profile.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100">
                  <User size={16} className="text-neutral-500" />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <span className="truncate text-[17px] text-black">{profile.name}</span>
                  {profile.verified && <BadgeCheck size={16} className="shrink-0 text-accent" fill="currentColor" />}
                </div>
                <div className="truncate text-[12px] text-neutral-700">{profile.handle}</div>
              </div>
            </div>
          )}
          <VideoThumbnail
            url={contentUrl}
            cropBox={contentCropBox}
            cropZoom={contentCropZoom}
            fit={contentFit}
            rotation={contentRotation}
            onDragPosition={onContentPositionChange}
            className="absolute bg-black"
            style={{
              left: `${(xStyleVideo.x / 1080) * 100}%`,
              top: `${(xStyleVideo.y / 1920) * 100}%`,
              width: `${(xStyleVideo.width / 1080) * 100}%`,
              height: `${(xStyleVideo.height / 1920) * 100}%`,
            }}
          />
          <p
            className="absolute line-clamp-2 text-left font-semibold leading-tight text-black [overflow-wrap:anywhere]"
            style={{
              left: `${(xStyleLayout.title.x / 1080) * 100}%`,
              top: `${(xStyleLayout.title.y / 1920) * 100}%`,
              width: `${(xStyleLayout.title.maxWidth / 1080) * 100}%`,
              fontSize: `${(xStyleLayout.title.fontSize / 1080) * 100}cqw`,
            }}
          >
            {title || profile.defaultTitle || "Titulo do video"}
          </p>
          <p
            className="absolute line-clamp-4 text-left font-bold leading-snug text-neutral-950"
            style={{
              left: `${(xStyleLayout.body.x / 1080) * 100}%`,
              top: `${(xStyleLayout.body.y / 1920) * 100}%`,
              width: `${(xStyleLayout.body.maxWidth / 1080) * 100}%`,
              fontSize: `${(xStyleLayout.body.fontSize / 1080) * 100}cqw`,
            }}
          >
            {caption}
          </p>
        </div>
      )}

      {profile.engine === "UGC" && (
        <>
          <VideoThumbnail
            url={contentUrl}
            cropBox={contentCropBox}
            cropZoom={contentCropZoom}
            fit={contentFit}
            rotation={contentRotation}
            onDragPosition={onContentPositionChange}
            className="absolute inset-0"
          />
          <p className="absolute left-1/2 top-[62%] max-w-[85%] -translate-x-1/2 truncate rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold text-foreground">
            {caption}
          </p>
          {watermarkPosition && profile.watermarkImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- object URL, not an optimizable static asset
            <img
              src={profile.watermarkImageUrl}
              alt=""
              data-testid="watermark-badge"
              style={{
                left: `${watermarkPosition.x * 100}%`,
                top: `${watermarkPosition.y * 100}%`,
                transform: `translate(-50%, -50%) scale(${watermarkPosition.scale})`,
                opacity: watermarkPosition.opacity,
              }}
              className="absolute max-h-[20%] max-w-[35%] object-contain"
            />
          )}
        </>
      )}
    </div>
  );
}
