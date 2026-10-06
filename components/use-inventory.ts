"use client";
import { useCallback, useEffect, useState } from "react";
import { Snapshot } from "@/lib/model";
import { fetchSnapshot } from "@/lib/client";
import { useSource } from "./source-context";
export function useInventory() {
  const { setSource } = useSource();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const value = await fetchSnapshot();
      setSnapshot(value);
      if (value.source) setSource(value.source);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [setSource]);
  useEffect(() => {
    queueMicrotask(() => void reload());
  }, [reload]);
  return { snapshot, error, loading, reload, setSnapshot };
}
