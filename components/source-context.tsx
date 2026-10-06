"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { PreviewSource } from "@/lib/model";
import { request } from "@/lib/client";
const Context = createContext<{
  source: PreviewSource | null;
  setSource: Dispatch<SetStateAction<PreviewSource | null>>;
}>({ source: null, setSource: () => {} });
export function SourceProvider({ children }: { children: React.ReactNode }) {
  const [source, setSource] = useState<PreviewSource | null>(null);
  useEffect(() => {
    void request<PreviewSource>("/api/source")
      .then(setSource)
      .catch(() => setSource(null));
  }, []);
  return (
    <Context.Provider value={{ source, setSource }}>
      {children}
    </Context.Provider>
  );
}
export function useSource() {
  const value = useContext(Context);
  return { ...value, canWrite: !!value.source && !value.source.readOnly };
}
