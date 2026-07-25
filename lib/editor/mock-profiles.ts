import type { Profile } from "./types";

export const MOCK_PROFILES: Profile[] = [
  {
    id: "p1",
    name: "CarolReactGG",
    engine: "REACT",
    templateId: "t1",
    reactionMedia: [],
  },
  {
    id: "p2",
    name: "Fatos Curiosos",
    engine: "X_STYLE",
    templateId: "t2",
    handle: "@fatoscuriosos",
    avatarUrl: null,
    verified: true,
    editorialTone: "Tom educativo e curioso",
  },
  {
    id: "p3",
    name: "Clipes Diários",
    engine: "UGC",
    templateId: "t3",
    watermarkImageUrl: null,
  },
];

export const MOCK_DRIVE_FILES = [
  "clipe_gaveta_01.mp4",
  "clipe_gaveta_02.mp4",
  "clipe_gaveta_03.mp4",
  "clipe_gaveta_04.mp4",
];
