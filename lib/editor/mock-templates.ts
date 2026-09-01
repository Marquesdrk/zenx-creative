import type { Template } from "./types";

/** Um template padrão por perfil mockado (1:1 por enquanto — reuso entre perfis é uma
 *  evolução futura, já suportada pelo modelo de dados). */
export const MOCK_TEMPLATES: Template[] = [
  { id: "t1", engine: "REACT", name: "Padrão — CarolReactGG" },
  { id: "t2", engine: "X_STYLE", name: "Padrão — Fatos Curiosos" },
  { id: "t3", engine: "UGC", name: "Padrão — Clipes Diários", watermarkDefaults: undefined },
  { id: "t-x-garimpo-tech", engine: "X_STYLE", name: "Template — Garimpo Tech" },
  { id: "t-x-boo-shoops", engine: "X_STYLE", name: "Template — Boo Shoops" },
  { id: "t-x-utilidades-ffy", engine: "X_STYLE", name: "Template — Utilidades ffy" },
];
