import { useReducedMotionPreference } from "../../hooks/useReducedMotionPreference";
import { Component, lazy, Suspense, useEffect, useState } from "react";
import type { ReactNode } from "react";

const AmbientScene = lazy(() => import("./AmbientScene"));
class AtmosphereBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function OptionalAtmosphere({
  enabled,
  color,
  playing,
}: {
  enabled: boolean;
  color: string;
  playing: boolean;
}) {
  const reduceMotion = useReducedMotionPreference();
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  const [desktop, setDesktop] = useState(
    () => window.matchMedia("(min-width: 900px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(min-width: 900px)");
    const onResize = () => setDesktop(media.matches);
    media.addEventListener("change", onResize);
    return () => media.removeEventListener("change", onResize);
  }, []);
  useEffect(() => {
    const memory =
      (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    if (
      !enabled ||
      reduceMotion ||
      !desktop ||
      memory < 4 ||
      navigator.hardwareConcurrency < 4 ||
      !window.WebGL2RenderingContext
    )
      return;
    const timer = window.setTimeout(() => {
      try {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("webgl2", {
          failIfMajorPerformanceCaveat: true,
        });
        if (context) {
          context.getExtension("WEBGL_lose_context")?.loseContext();
          setReady(true);
        }
      } catch {
        /* CSS ambience remains available when context creation is blocked. */
      }
    }, 900);
    return () => {
      window.clearTimeout(timer);
    };
  }, [enabled, reduceMotion, desktop]);
  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  return ready && enabled && desktop && !reduceMotion ? (
    <AtmosphereBoundary>
      <Suspense fallback={null}>
        <AmbientScene color={color} playing={playing && visible} />
      </Suspense>
    </AtmosphereBoundary>
  ) : null;
}
