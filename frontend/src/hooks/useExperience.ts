import { useEffect, useRef } from "react";
import { useReducedMotionPreference } from "./useReducedMotionPreference";
import gsap from "gsap";
import Lenis from "lenis";
import { timing } from "../animations/config";
import { isScrollLocked } from "./useDialog";

export function useExperience() {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotionPreference();
  useEffect(() => {
    if (reduceMotion) return;
    const context = gsap.context(() => {
      const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });
      const reveal = (
        selector: string,
        values: gsap.TweenVars,
        position: number,
      ) => {
        const targets = ref.current?.querySelectorAll(selector);
        if (targets?.length) timeline.from(targets, values, position);
      };
      reveal(".brand", { opacity: 0, y: 6, duration: timing.ui }, 0);
      reveal(".navigation", { opacity: 0, x: -10, duration: timing.ui }, 0.12);
      reveal(
        ".page-heading",
        { opacity: 0, y: 15, duration: timing.shared },
        0.18,
      );
      reveal(
        ".featured-copy > *",
        { opacity: 0, y: 16, stagger: 0.06, duration: timing.shared },
        0.28,
      );
      reveal(
        ".featured-art",
        { opacity: 0, y: 18, scale: 0.97, duration: timing.cinematic },
        0.3,
      );
      reveal(
        ".home-section",
        { opacity: 0, y: 18, stagger: 0.1, duration: timing.shared },
        0.5,
      );
    }, ref);
    return () => context.revert();
  }, [reduceMotion]);
  useEffect(() => {
    if (reduceMotion) return;
    const lenis = new Lenis({
      autoRaf: true,
      duration: 0.9,
      smoothWheel: true,
      syncTouch: false,
      anchors: true,
      prevent: (node) => node.hasAttribute("data-lenis-prevent"),
    });
    const onLock = () => {
      if (isScrollLocked()) lenis.stop();
      else lenis.start();
    };
    onLock();
    window.addEventListener("vault:scroll-lock", onLock);
    return () => {
      window.removeEventListener("vault:scroll-lock", onLock);
      lenis.destroy();
    };
  }, [reduceMotion]);
  return ref;
}
