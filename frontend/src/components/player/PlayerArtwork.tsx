import { AnimatePresence, motion } from "motion/react";
import { albumById, trackById } from "../../data/library";
import { playerActions, usePlayer } from "../../lib/player-store";
import { useReducedMotionPreference } from "../../hooks/useReducedMotionPreference";
import { timing, sharedTransition } from "../../animations/config";
import { AlbumArt } from "../music/AlbumArt";

export function PlayerArtwork({ large = false }: { large?: boolean }) {
  const { trackId, isPlaying } = usePlayer();
  const reduced = useReducedMotionPreference();
  if (!trackId || !trackById[trackId]) return null;
  const album = albumById[trackById[trackId].albumId];
  return (
    <motion.div
      className={`player-artwork ${large ? "player-artwork-large" : ""} ${isPlaying ? "is-playing" : ""}`}
      layoutId={reduced ? undefined : "player-artwork-shell"}
      transition={reduced ? { duration: timing.reduced } : sharedTransition}
    >
      <motion.div
        className="artwork-gesture"
        drag={large}
        dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
        dragElastic={0.12}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          if (
            info.offset.y > 70 &&
            Math.abs(info.offset.y) > Math.abs(info.offset.x)
          )
            playerActions.setMode("mini");
          else if (
            Math.abs(info.offset.x) > 65 &&
            Math.abs(info.offset.x) > Math.abs(info.offset.y)
          ) {
            if (info.offset.x < 0) playerActions.next();
            else playerActions.previous();
          }
        }}
      >
        <motion.div
          animate={
            !reduced && large && isPlaying ? { y: [0, -4, 0] } : { y: 0 }
          }
          transition={{
            duration: isPlaying ? 7 : timing.ui,
            repeat: isPlaying && !reduced && large ? Infinity : 0,
            ease: "easeInOut",
          }}
        >
          <AnimatePresence mode="wait" initial={!large}>
            <motion.div
              key={trackId}
              initial={{
                opacity: 0,
                scale: reduced ? 1 : 0.97,
                filter: reduced ? "blur(0px)" : "blur(2px)",
              }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: reduced ? 1 : 0.99 }}
              transition={{ duration: reduced ? timing.reduced : timing.song }}
            >
              <AlbumArt album={album} lettering={large} priority />
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
