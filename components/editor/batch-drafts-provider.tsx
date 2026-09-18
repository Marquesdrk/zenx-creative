"use client";

import { createContext, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { Batch, BatchItem } from "@/lib/editor/types";

type BatchDraftContextValue = {
  batches: Batch[];
  setBatches: Dispatch<SetStateAction<Batch[]>>;
  items: BatchItem[];
  setItems: Dispatch<SetStateAction<BatchItem[]>>;
  fileRefs: Map<string, File>;
  objectUrlRefs: Set<string>;
};

const BatchDraftContext = createContext<BatchDraftContextValue | null>(null);

export function BatchDraftsProvider({ children }: { children: ReactNode }) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [fileRefs] = useState(() => new Map<string, File>());
  const [objectUrlRefs] = useState(() => new Set<string>());

  useEffect(() => {
    const urls = objectUrlRefs;
    const files = fileRefs;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
      files.clear();
    };
  }, [fileRefs, objectUrlRefs]);

  return (
    <BatchDraftContext.Provider
      value={{ batches, setBatches, items, setItems, fileRefs, objectUrlRefs }}
    >
      {children}
    </BatchDraftContext.Provider>
  );
}

export function useBatchDrafts() {
  const context = useContext(BatchDraftContext);
  if (!context) throw new Error("useBatchDrafts precisa estar dentro de BatchDraftsProvider.");
  return context;
}
