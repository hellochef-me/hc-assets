"use client";
import { useCallback, useEffect, useState } from "react";
import { Snapshot } from "@/lib/model";
import { fetchSnapshot } from "@/lib/client";
export function useInventory() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSnapshot(await fetchSnapshot());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    queueMicrotask(() => void reload());
  }, [reload]);
  return { snapshot, error, loading, reload, setSnapshot };
}
