import whatsappEmojiMap from "./whatsapp-map.json";

export const WHATSAPP_EMOJI_BASE_PATH = "/whatsapp-emoji/png";

export const whatsappEmojiAssets = whatsappEmojiMap as Record<string, string>;

const emojiSegmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter("pt-BR", { granularity: "grapheme" })
    : null;

export function splitGraphemes(text: string) {
  if (emojiSegmenter) {
    return Array.from(emojiSegmenter.segment(text), (segment) => segment.segment);
  }
  return Array.from(text);
}

export function isEmojiSegment(segment: string) {
  return (
    /\p{Extended_Pictographic}/u.test(segment) ||
    /^[\u{1f1e6}-\u{1f1ff}]{2}$/u.test(segment) ||
    /^[0-9#*]\u{fe0f}?\u{20e3}$/u.test(segment)
  );
}

export function emojiAssetCode(segment: string, options?: { omitVariationSelectors?: boolean }) {
  return Array.from(segment)
    .map((character) => character.codePointAt(0))
    .filter(
      (codePoint): codePoint is number =>
        Boolean(codePoint) && (!options?.omitVariationSelectors || codePoint !== 0xfe0f)
    )
    .map((codePoint) => codePoint.toString(16).padStart(4, "0"))
    .join("-");
}

export function whatsappEmojiFilename(segment: string) {
  const exactCode = emojiAssetCode(segment);
  const compactCode = emojiAssetCode(segment, { omitVariationSelectors: true });
  return whatsappEmojiAssets[exactCode] ?? whatsappEmojiAssets[compactCode] ?? null;
}

export function whatsappEmojiUrl(segment: string) {
  const filename = whatsappEmojiFilename(segment);
  return filename ? `${WHATSAPP_EMOJI_BASE_PATH}/${filename}` : null;
}
