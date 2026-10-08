import { useSyncExternalStore } from "react";
const listeners = new Set<() => void>();
window.addEventListener("popstate", () => listeners.forEach((fn) => fn()));
export function navigate(path: string, replace = false) {
  if (!path.startsWith("/") || path.startsWith("//")) path = "/";
  window.history[replace ? "replaceState" : "pushState"]({}, "", path);
  listeners.forEach((fn) => fn());
  window.scrollTo({ top: 0, behavior: "instant" });
}
export function useRoute() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => window.location.pathname + window.location.search,
  );
}
