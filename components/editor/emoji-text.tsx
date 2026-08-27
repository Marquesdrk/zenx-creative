import { isEmojiSegment, splitGraphemes, whatsappEmojiUrl } from "@/lib/emoji/whatsapp";

export function EmojiText({ text }: { text: string }) {
  return (
    <>
      {splitGraphemes(text).map((segment, index) => {
        if (!isEmojiSegment(segment)) return segment;
        const url = whatsappEmojiUrl(segment);
        if (!url) return segment;

        return (
          // eslint-disable-next-line @next/next/no-img-element -- emoji assets must render as exact WhatsApp-style PNGs.
          <img
            key={`${segment}-${index}`}
            src={url}
            alt={segment}
            className="mx-[0.03em] inline-block h-[1.12em] w-[1.12em] align-[-0.18em]"
            draggable={false}
          />
        );
      })}
    </>
  );
}
