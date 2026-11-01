import { describe, expect, it } from "vitest";
import { cleanTitle, pickTitleFromLines, type OcrLine } from "./title-ocr";

const line = (text: string, top: number, bottom: number, confidence = 90): OcrLine => ({ text, confidence, top, bottom });

describe("cleanTitle", () => {
  it.each([
    ['O "coach" foi refutado SOS', 'O "coach" foi refutado'],
    ["Amizade mais fraca entre homens S&S", "Amizade mais fraca entre homens"],
    ["Três amigos. Um palco. Zero limites! 7)", "Três amigos. Um palco. Zero limites!"],
    ["Ele simplesmente deu uma reiniciada 7”", "Ele simplesmente deu uma reiniciada"],
    ["O ChatGPT depois de pedir pra ele resumir o texto pela 7º vez KKKKKKK", "O ChatGPT depois de pedir pra ele resumir o texto pela 7º vez KKKKKKK"],
    ["POV: Dicção Brasileira", "POV: Dicção Brasileira"],
    ["Ele esquecendo que era o pai Q", "Ele esquecendo que era o pai"],
  ])("limpa %s", (input, expected) => {
    expect(cleanTitle(input)).toBe(expected);
  });
});

describe("pickTitleFromLines", () => {
  const bandHeight = 380;
  const maxGap = 68;

  it("usa a linha colada no vídeo e ignora nome/@ do cabeçalho", () => {
    const lines = [line("Tive que Rir", 10, 60), line("@tivequerir", 70, 100), line("Ele esquecendo que era o pai", 330, 372)];
    expect(pickTitleFromLines(lines, bandHeight, maxGap)).toBe("Ele esquecendo que era o pai");
  });

  it("junta título em duas linhas e para no vão do cabeçalho", () => {
    const lines = [line("Tive que Rir", 10, 60), line("Coisas que você pode dizer", 290, 330), line("para um juiz, mas não pra namorada", 335, 375)];
    expect(pickTitleFromLines(lines, bandHeight, maxGap)).toBe("Coisas que você pode dizer para um juiz, mas não pra namorada");
  });

  it("sem título (só cabeçalho longe do vídeo) devolve null", () => {
    const lines = [line("Tive que Rir", 10, 60), line("@tivequerir", 70, 100)];
    expect(pickTitleFromLines(lines, bandHeight, maxGap)).toBeNull();
  });

  it("descarta linhas de baixa confiança", () => {
    expect(pickTitleFromLines([line("x#?$%", 330, 372, 20)], bandHeight, maxGap)).toBeNull();
  });
});
