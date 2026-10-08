import { useSyncExternalStore } from "react";

const query = window.matchMedia("(prefers-reduced-motion: reduce)");
let reduced = query.matches;
const listeners = new Set<() => void>();
const onChange = (event: MediaQueryListEvent) => {
  reduced = event.matches;
  listeners.forEach((fn) => fn());
};
const subscribe = (fn: () => void) => {
  if (!listeners.size) {
    reduced = query.matches;
    query.addEventListener("change", onChange);
  }
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
    if (!listeners.size) query.removeEventListener("change", onChange);
  };
};
const getSnapshot = () => reduced;
export function useReducedMotionPreference() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
