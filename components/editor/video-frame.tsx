import { useState } from "react";
import type { CSSProperties } from "react";
import { BadgeCheck, User } from "lucide-react";
import { EmojiText } from "./emoji-text";
import {
  DEFAULT_X_STYLE_LAYOUT,
  FULL_FRAME_CROP,
  resolveXStyleLayout,
  type Crop,
  type FitMode,
  type Profile,
  type Rotation,
  type WatermarkPosition,
  type XStyleVideoFrame,
} from "@/lib/editor/types";
import { contentTargetAspect } from "@/lib/editor/crop-geometry";

const CONTENT_GRADIENT = "bg-gradient-to-br from-neutral-700 to-neutral-900";

function VideoThumbnail({
  url,
  className,
  crop = FULL_FRAME_CROP,
  zoom = 1,
  fit = "cover",
  rotation = 0,
  playing = false,
  style,
  frameAspect,
}: {
  url: string | null;
  className: string;
  style?: CSSProperties;
  /** Região do vídeo original a exibir (0 a 1) — igual ao que o render final usa, ver
   *  lib/editor/crop-geometry.ts normalizedCropToPixels. */
  crop?: Crop;
  /** Zoom sobre o conteúdo já selecionado por `crop` (1 = sem zoom). Sem efeito em "contain". */
  zoom?: number;
  fit?: FitMode;
  rotation?: Rotation;
  playing?: boolean;
  /** Proporção largura/altura da própria zona onde este vídeo é exibido — sem isso não dá
   *  pra calcular corretamente como o recorte interage com cover/contain. */
  frameAspect?: number;
}) {
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);

  if (url) {
    // Sem dimensões reais do vídeo (ou sem frameAspect) não dá pra calcular o recorte com
    // precisão — usa object-fit nativo enquanto isso, que já reduz corretamente ao
    // comportamento padrão quando crop é o frame inteiro.
    let videoClassName = `h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"}`;
    let videoStyle: CSSProperties = { transform: `rotate(${rotation}deg)` };

    if (natural && frameAspect) {
      const rotated = rotation === 90 || rotation === 270;
      const rawWidth = rotated ? natural.height : natural.width;
      const rawHeight = rotated ? natural.width : natural.height;
      const cropWidth = rawWidth * crop.width;
      const cropHeight = rawHeight * crop.height;
      const cropAspect = cropWidth / Math.max(1, cropHeight);

      // Passo 1: encaixa a região recortada no quadro alvo — "cover" amplia o centro pelo
      // zoom até preencher (o excedente é descartado pelo overflow-hidden do wrapper,
      // exatamente como o crop adicional do render real), "contain" só cabe dentro, sem cortar.
      let boxWidthPct: number;
      let boxHeightPct: number;
      if (fit === "cover") {
        if (cropAspect > frameAspect) {
          boxHeightPct = 100;
          boxWidthPct = 100 * (cropAspect / frameAspect);
        } else {
          boxWidthPct = 100;
          boxHeightPct = 100 * (frameAspect / cropAspect);
        }
        boxWidthPct *= zoom;
        boxHeightPct *= zoom;
      } else if (cropAspect > frameAspect) {
        boxWidthPct = 100;
        boxHeightPct = 100 * (frameAspect / cropAspect);
      } else {
        boxHeightPct = 100;
        boxWidthPct = 100 * (cropAspect / frameAspect);
      }

      // A posição já vem inteiramente de `crop` (o usuário já enquadrou onde queria), então a
      // caixa fica sempre centralizada — sem isso duplicaria o controle de posição.
      const boxLeftPct = (100 - boxWidthPct) / 2;
      const boxTopPct = (100 - boxHeightPct) / 2;

      // Passo 2: o <video> precisa ser ampliado/deslocado de forma que só a região `crop`
      // caia exatamente dentro da caixa calculada acima.
      const videoWidthPct = boxWidthPct / crop.width;
      const videoHeightPct = boxHeightPct / crop.height;
      const videoLeftPct = boxLeftPct - crop.x * videoWidthPct;
      const videoTopPct = boxTopPct - crop.y * videoHeightPct;

      videoClassName = "absolute";
      videoStyle = {
        left: `${videoLeftPct}%`,
        top: `${videoTopPct}%`,
        width: `${videoWidthPct}%`,
        height: `${videoHeightPct}%`,
        transform: `rotate(${rotation}deg)`,
      };
    }

    return (
      // O clipping tem que ser por zona (não só no frame externo), senão conteúdo ampliado
      // vaza pra fora dela (ex.: cobrindo a faixa de reação acima).
      <div className={`${className} relative overflow-hidden`} style={style}>
        <video
          src={url}
          muted
          autoPlay={playing}
          loop={playing}
          playsInline
          preload="metadata"
          // Sem isso o vídeo pausado mostra um frame preto até o usuário interagir — busca um
          // instante adiante pra prévia já nascer com uma imagem real do conteúdo. Também
          // captura a resolução real, necessária pro cálculo do recorte.
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            if (Number.isFinite(video.duration)) {
              video.currentTime = Math.min(0.1, video.duration / 2);
            }
            if (video.videoWidth && video.videoHeight) {
              setNatural({ width: video.videoWidth, height: video.videoHeight });
            }
          }}
          className={videoClassName}
          style={videoStyle}
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
  contentCrop = FULL_FRAME_CROP,
  contentZoom = 1,
  contentFit = "cover",
  contentRotation = 0,
  playing = false,
  reactionMediaUrl = null,
  watermarkPosition = null,
  xStyleVideoFrame = null,
}: {
  profile: Profile;
  title?: string;
  caption: string;
  contentUrl?: string | null;
  /** Recorte do conteúdo importado (não da mídia de reação nem da marca d'água). */
  contentCrop?: Crop;
  contentZoom?: number;
  contentFit?: FitMode;
  contentRotation?: Rotation;
  playing?: boolean;
  /** Só relevante quando profile.engine === "REACT". */
  reactionMediaUrl?: string | null;
  /** Só relevante quando profile.engine === "UGC". Posição x/y é relativa (0 a 1). */
  watermarkPosition?: WatermarkPosition | null;
  /** Só relevante quando profile.engine === "X_STYLE". Medidas no canvas 1080x1920. */
  xStyleVideoFrame?: XStyleVideoFrame | null;
}) {
  const xStyleLayout = profile.engine === "X_STYLE" ? resolveXStyleLayout(profile.xStyleLayout) : DEFAULT_X_STYLE_LAYOUT;
  const xStyleVideo = xStyleVideoFrame ?? xStyleLayout.video;
  const contentFrameAspect = contentTargetAspect(profile.engine, xStyleVideo);

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
            crop={contentCrop}
            zoom={contentZoom}
            fit={contentFit}
            rotation={contentRotation}
            frameAspect={contentFrameAspect}
            playing={playing}
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
            crop={contentCrop}
            zoom={contentZoom}
            fit={contentFit}
            rotation={contentRotation}
            frameAspect={contentFrameAspect}
            playing={playing}
            className="absolute bg-black"
            style={{
              left: `${(xStyleVideo.x / 1080) * 100}%`,
              top: `${(xStyleVideo.y / 1920) * 100}%`,
              width: `${(xStyleVideo.width / 1080) * 100}%`,
              height: `${(xStyleVideo.height / 1920) * 100}%`,
            }}
          />
          <p
            className={`absolute line-clamp-2 whitespace-pre-line text-left font-semibold leading-tight [overflow-wrap:anywhere] ${
              profile.textColor === "white" ? "text-white" : "text-black"
            }`}
            style={{
              left: `${(xStyleLayout.title.x / 1080) * 100}%`,
              top: `${(xStyleLayout.title.y / 1920) * 100}%`,
              width: `${(xStyleLayout.title.maxWidth / 1080) * 100}%`,
              fontSize: `${(xStyleLayout.title.fontSize / 1080) * 100}cqw`,
            }}
          >
            <EmojiText text={title || profile.defaultTitle || "Titulo do video"} />
          </p>
          <p
            className={`absolute line-clamp-2 whitespace-pre-line text-center font-bold leading-tight ${
              profile.textColor === "white" ? "text-white" : "text-neutral-950"
            }`}
            style={{
              left: `${(xStyleLayout.body.x / 1080) * 100}%`,
              top: `${(xStyleLayout.body.y / 1920) * 100}%`,
              width: `${(xStyleLayout.body.maxWidth / 1080) * 100}%`,
              fontSize: `${(xStyleLayout.body.fontSize / 1080) * 100}cqw`,
            }}
          >
            <EmojiText text={caption} />
          </p>
        </div>
      )}

      {profile.engine === "UGC" && (
        <>
          <VideoThumbnail
            url={contentUrl}
            crop={contentCrop}
            zoom={contentZoom}
            fit={contentFit}
            rotation={contentRotation}
            frameAspect={contentFrameAspect}
            playing={playing}
            className="absolute inset-0"
          />
          <p className="absolute left-1/2 top-[62%] max-w-[85%] -translate-x-1/2 truncate rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold text-foreground">
            <EmojiText text={caption} />
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
