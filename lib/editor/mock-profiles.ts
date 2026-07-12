import type { Profile } from "./types";

export const MOCK_PROFILES: Profile[] = [
  {
    id: "p1",
    name: "Vidas Motivacionais",
    handle: "@vidasmotivacionais",
    avatarColor: "#6C7BFF",
    watermarkLabel: "VM",
    verified: true,
    editorialTone: "Tom inspirador e direto",
    watermarkDefaults: { x: 85, y: 90, scale: 1, opacity: 1 },
    reactionMedia: [
      { id: "vm-r1", label: "Reação animada", color: "#6C7BFF" },
      { id: "vm-r2", label: "Reação surpresa", color: "#9AA6FF" },
    ],
  },
  {
    id: "p2",
    name: "Clipes Diários",
    handle: "@clipesdiarios",
    avatarColor: "#F49D37",
    watermarkLabel: "CD",
    verified: false,
    editorialTone: "Tom descontraído e informal",
    // Sem watermarkDefaults próprio: usa o padrão global (nível 1).
    reactionMedia: [{ id: "cd-r1", label: "Reação de humor", color: "#F49D37" }],
  },
  {
    id: "p3",
    name: "Fatos Curiosos",
    handle: "@fatoscuriosos",
    avatarColor: "#4CD18A",
    watermarkLabel: "FC",
    verified: true,
    editorialTone: "Tom educativo e curioso",
    watermarkDefaults: { x: 85, y: 15, scale: 1.1, opacity: 0.85 },
    reactionMedia: [
      { id: "fc-r1", label: "Reação de espanto", color: "#4CD18A" },
      { id: "fc-r2", label: "Reação pensativa", color: "#7FE0B0" },
    ],
  },
];

export const MOCK_DRIVE_FILES = [
  "clipe_gaveta_01.mp4",
  "clipe_gaveta_02.mp4",
  "clipe_gaveta_03.mp4",
  "clipe_gaveta_04.mp4",
];
