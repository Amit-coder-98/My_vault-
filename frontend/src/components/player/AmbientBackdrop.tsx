import { AnimatePresence, motion } from "motion/react";
import type { Album } from "../../types/music";
import { timing } from "../../animations/config";
import { useReducedMotionPreference } from "../../hooks/useReducedMotionPreference";

export function AmbientBackdrop({
  album,
  playing,
}: {
  album: Album;
  playing: boolean;
}) {
  const reduced = useReducedMotionPreference();
  return (
    <div
      className={`player-ambience ${playing && !reduced ? "ambience-playing" : ""}`}
      aria-hidden="true"
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={album.id}
          className="ambience-layer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: reduced ? timing.reduced : timing.background,
          }}
          style={{ backgroundColor: album.palette.ambient }}
        >
          <div
            className="ambience-art"
            style={{ backgroundImage: `url("${album.artwork}")` }}
          />
          <div
            className="ambience-glow"
            style={{
              background: `radial-gradient(ellipse at 25% 35%, ${album.palette.accent}40, transparent 65%)`,
            }}
          />
        </motion.div>
      </AnimatePresence>
      <div className="ambience-shade" />
      <div className="ambience-grain" />
    </div>
  );
}
