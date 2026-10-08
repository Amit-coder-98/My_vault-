import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
export function useResource<T>(path: string, initial: T) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState("");
  const [loadedKey, setLoadedKey] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    api<T>(path)
      .then((value) => {
        if (!cancelled) {
          setData(value);
          setError("");
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(`${path}:${version}`);
      });
    return () => {
      cancelled = true;
    };
  }, [path, version]);
  const reload = useCallback(() => {
    setError("");
    setVersion((v) => v + 1);
  }, []);
  return { data, error, loading: loadedKey !== `${path}:${version}`, reload };
}
export function useTask() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(task: () => Promise<void>) {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await task();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The action could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return { run, busy, error, clear: () => setError("") };
}
