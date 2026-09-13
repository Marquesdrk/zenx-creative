import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { BadgeCheck, User } from "lucide-react";
import { EmojiText } from "./emoji-text";
import {
  DEFAULT_X_STYLE_LAYOUT,
  DEFAULT_REACT_OVERLAY,
  FULL_FRAME_CROP,
  resolveXStyleLayout,
  type Crop,
  type FitMode,
  type Profile,
  type ReactLoopMode,
  type ReactOverlay,
  type Rotation,
  type WatermarkPosition,
  type XStyleVideoFrame,
} from "@/lib/editor/types";
import {
  contentTargetAspect,
  effectiveDimensions,
  fitCenteredRect,
  normalizedCropToPixels,
} from "@/lib/editor/crop-geometry";

const CONTENT_GRADIENT = "bg-gradient-to-br from-neutral-700 to-neutral-900";
const REACT_OVERLAY_COLORS: Record<ReactOverlay["background"], string> = {
  red: "#ef2029",
  orange: "#ff7a00",
  purple: "#7c3aed",
  cyan: "#06b6d4",
  pink: "#ec4899",
  black: "#050505",
  white: "#f5f5f5",
  custom: "#ef2029",
};
const REACT_OVERLAY_FONTS: Record<ReactOverlay["font"], string> = {
  impact: 'Impact, "Arial Black", sans-serif',
  arial: 'Arial, sans-serif',
  condensed: 'Bahnschrift, "Arial Narrow", sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  clean: 'Inter, Arial, sans-serif',
};
const REACT_OVERLAY_ACCENTS: Record<ReactOverlay["accent"], string> = {
  yellow: "#facc15",
  white: "#ffffff",
  black: "#111111",
  cyan: "#22d3ee",
  pink: "#f472b6",
};
const TORN_CLIP_PATH = "polygon(0 8%, 3% 2%, 7% 5%, 12% 1%, 18% 6%, 24% 0, 30% 5%, 38% 1%, 45% 6%, 52% 0, 60% 5%, 68% 1%, 75% 6%, 82% 0, 90% 5%, 97% 1%, 100% 8%, 98% 92%, 94% 98%, 88% 95%, 82% 100%, 75% 94%, 68% 100%, 60% 95%, 52% 100%, 45% 94%, 38% 100%, 30% 95%, 24% 100%, 18% 94%, 12% 100%, 7% 95%, 3% 100%, 0 92%)";

function overlayBackgroundColor(overlay: ReactOverlay) {
  return overlay.background === "custom"
    ? overlay.customBackground || REACT_OVERLAY_COLORS.red
    : REACT_OVERLAY_COLORS[overlay.background] ?? REACT_OVERLAY_COLORS.red;
}

function VideoThumbnail({
  url,
  className,
  crop = FULL_FRAME_CROP,
  zoom = 1,
  fit = "cover",
  rotation = 0,
  playing = false,
  loopMode = "repeat",
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
  loopMode?: ReactLoopMode;
  /** Proporção largura/altura da própria zona onde este vídeo é exibido — sem isso não dá
   *  pra calcular corretamente como o recorte interage com cover/contain. */
  frameAspect?: number;
}) {
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const reverseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (reverseTimerRef.current !== null) window.clearInterval(reverseTimerRef.current);
    };
  }, [url]);

  useEffect(() => {
    if (loopMode !== "pingpong" || !playing) {
      if (reverseTimerRef.current !== null) {
        window.clearInterval(reverseTimerRef.current);
        reverseTimerRef.current = null;
      }
    }
  }, [loopMode, playing]);

  function startReversePlayback(video: HTMLVideoElement) {
    if (reverseTimerRef.current !== null) window.clearInterval(reverseTimerRef.current);
    video.pause();
    let previous = performance.now();
    reverseTimerRef.current = window.setInterval(() => {
      const now = performance.now();
      const elapsed = Math.min(0.1, (now - previous) / 1000);
      previous = now;
      video.currentTime = Math.max(0, video.currentTime - elapsed);
      if (video.currentTime <= 0.02) {
        if (reverseTimerRef.current !== null) window.clearInterval(reverseTimerRef.current);
        reverseTimerRef.current = null;
        video.currentTime = 0;
        void video.play().catch(() => undefined);
      }
    }, 33);
  }

  if (url) {
    // Sem dimensões reais do vídeo (ou sem frameAspect) não dá pra calcular o recorte com
    // precisão — usa object-fit nativo enquanto isso, que já reduz corretamente ao
    // comportamento padrão quando crop é o frame inteiro.
    let videoClassName = `h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"}`;
    let videoStyle: CSSProperties = { transform: `rotate(${rotation}deg)` };

    if (natural && frameAspect) {
      const effective = effectiveDimensions(natural.width, natural.height, rotation);
      const selected = normalizedCropToPixels(crop, effective.width, effective.height);
      const fitted =
        fit === "cover"
          ? fitCenteredRect(selected.width, selected.height, zoom, frameAspect)
          : selected;
      const fittedX = selected.x + fitted.x;
      const fittedY = selected.y + fitted.y;
      const scale =
        fit === "cover"
          ? 1 / Math.max(1, fitted.height)
          : Math.min(frameAspect / Math.max(1, selected.width), 1 / Math.max(1, selected.height));
      const displayedWidth = effective.width * scale;
      const displayedHeight = effective.height * scale;
      const videoWidthPct = (displayedWidth / frameAspect) * 100;
      const videoHeightPct = displayedHeight * 100;
      const videoLeftPct =
        ((fit === "contain" ? (frameAspect - displayedWidth) / 2 : 0) - fittedX * scale) /
        frameAspect *
        100;
      const videoTopPct = ((fit === "contain" ? (1 - displayedHeight) / 2 : 0) - fittedY * scale) * 100;

      /* Passo 1: encaixa a região recortada no quadro alvo — "cover" amplia o centro pelo
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
      */

      videoClassName = "absolute";
      videoStyle = {
        left: `${videoLeftPct}%`,
        top: `${videoTopPct}%`,
        width: `${videoWidthPct}%`,
        height: `${videoHeightPct}%`,
        // O preflight do Tailwind aplica max-width: 100% e height: auto em <video>.
        // Isso comprime a mídia quando o recorte precisa ampliar a origem e deixa a área
        // inferior aparentemente preta. O render final não tem essa limitação.
        maxWidth: "none",
        maxHeight: "none",
        display: "block",
        transform: `rotate(${rotation}deg)`,
      };
    }

    return (
      // O clipping tem que ser por zona (não só no frame externo), senão conteúdo ampliado
      // vaza pra fora dela (ex.: cobrindo a faixa de reação acima).
      <div className={`${className} relative overflow-hidden`} style={style}>
        <video
          ref={videoRef}
          src={url}
          muted
          autoPlay={playing}
          loop={playing && loopMode === "repeat"}
          playsInline
          preload="metadata"
          onLoadStart={() => setLoadError(false)}
          onError={() => setLoadError(true)}
          // Sem isso o vídeo pausado mostra um frame preto até o usuário interagir — busca um
          // instante adiante pra prévia já nascer com uma imagem real do conteúdo. Também
          // captura a resolução real, necessária pro cálculo do recorte.
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            video.playbackRate = 1;
            if (reverseTimerRef.current !== null) window.clearInterval(reverseTimerRef.current);
            reverseTimerRef.current = null;
            if (Number.isFinite(video.duration)) {
              // Muitos vídeos exportados começam com uma pequena faixa preta. Um frame
              // ligeiramente adiante deixa a prévia útil sem alterar o arquivo original.
              video.currentTime = Math.min(1, video.duration / 2);
            }
            if (video.videoWidth && video.videoHeight) {
              setNatural({ width: video.videoWidth, height: video.videoHeight });
            }
          }}
          onLoadedData={(event) => {
            const video = event.currentTarget;
            if (playing && video.paused) void video.play().catch(() => undefined);
          }}
          onEnded={(event) => {
            if (loopMode !== "pingpong" || !playing) return;
            const video = event.currentTarget;
            startReversePlayback(video);
          }}
          className={videoClassName}
          style={videoStyle}
        />
        {loadError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#171717] p-3 text-center text-[10px] text-red-200">
            Não foi possível carregar este vídeo de conteúdo.
          </div>
        )}
      </div>
    );
  }
  return (
    <div className={`${className} ${CONTENT_GRADIENT} flex items-center justify-center p-3 text-center`} style={style}>
      <span className="text-[10px] text-gray-300">Conteúdo importado sem prévia</span>
    </div>
  );
}

function ReactFinalPreview({
  reactionUrl,
  contentUrl,
  contentCrop,
  contentFit,
  contentZoom,
  contentRotation,
  contentFrameAspect,
  reactOverlay,
  reactionLoopMode,
  playing,
}: {
  reactionUrl: string | null;
  contentUrl: string | null;
  contentCrop: Crop;
  contentFit: FitMode;
  contentZoom: number;
  contentRotation: Rotation;
  contentFrameAspect: number;
  reactOverlay: ReactOverlay;
  reactionLoopMode: ReactLoopMode;
  playing: boolean;
}) {
  return (
    <div data-testid="react-final-preview" className="absolute inset-0 isolate overflow-hidden bg-black" style={{ containerType: "inline-size" }}>
      <div className="absolute inset-x-0 top-0 z-20 h-[36%] overflow-hidden">
        <VideoThumbnail
          url={reactionUrl}
          className="h-full w-full"
          playing={playing}
          loopMode={reactionLoopMode}
        />
      </div>
      <div className="absolute inset-x-0 bottom-0 top-[36%] z-10 overflow-hidden bg-neutral-950">
        <VideoThumbnail
          url={contentUrl}
          crop={contentCrop}
          zoom={contentZoom}
          fit={contentFit}
          rotation={contentRotation}
          frameAspect={contentFrameAspect}
          playing={playing}
          className="h-full w-full"
        />
        {reactOverlay.enabled && reactOverlay.text.trim() && (() => {
          const torn = reactOverlay.template === "torn";
          const outline = Math.max(0, Math.min(100, reactOverlay.textOutline ?? 0));
          const backgroundColor = overlayBackgroundColor(reactOverlay);
          const fontSize = Math.max(24, Math.min(140, reactOverlay.fontSize ?? 66));
          const textStyle = {
            backgroundColor,
            backgroundImage:
              reactOverlay.template === "gradient"
                ? `linear-gradient(100deg, ${backgroundColor}, ${REACT_OVERLAY_ACCENTS[reactOverlay.accent]})`
                : undefined,
            color: reactOverlay.textColor === "white" ? "#fff" : "#111",
            WebkitTextStroke: `${((outline / 100) * 14 / 10.8).toFixed(3)}cqw #000`,
            paintOrder: "stroke fill",
            fontFamily: REACT_OVERLAY_FONTS[reactOverlay.font] ?? REACT_OVERLAY_FONTS.impact,
            fontSize: `clamp(10px, ${(fontSize / 10.8).toFixed(3)}cqw, 140px)`,
            lineHeight: 1.12,
            textShadow:
              reactOverlay.template === "neon" && reactOverlay.textColor === "white"
                ? `0 0 8px ${REACT_OVERLAY_ACCENTS[reactOverlay.accent]}`
                : undefined,
          };
          const text = <EmojiText text={reactOverlay.text} />;
          return torn ? (
            <div
              className="absolute left-0 top-0 z-30 w-full text-center"
              style={{ backgroundColor: "#f4f1e8", clipPath: TORN_CLIP_PATH, padding: "0.556cqw" }}
            >
              <div className="text-[clamp(10px,2.2cqw,24px)] font-extrabold" style={{ ...textStyle, padding: "1.852cqw 5.556cqw" }}>
                {text}
              </div>
            </div>
          ) : (
            <div
              className="absolute left-0 top-0 z-30 w-full text-center text-[clamp(10px,2.2cqw,24px)] font-extrabold"
              style={{ ...textStyle, padding: "1.852cqw 5.556cqw", border: "none", boxShadow: "none" }}
            >
              {text}
            </div>
          );
        })()}
      </div>
    </div>
  );
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
  reactOverlay = null,
  reactionLoopMode = "repeat",
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
  reactOverlay?: ReactOverlay | null;
  reactionLoopMode?: ReactLoopMode;
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
        <ReactFinalPreview
          reactionUrl={reactionMediaUrl}
          contentUrl={contentUrl}
          contentCrop={contentCrop}
          contentFit={contentFit}
          contentZoom={contentZoom}
          contentRotation={contentRotation}
          contentFrameAspect={contentFrameAspect}
          reactOverlay={{ ...DEFAULT_REACT_OVERLAY, ...(reactOverlay ?? {}) }}
          reactionLoopMode={reactionLoopMode}
          playing={playing}
        />
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
