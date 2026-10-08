import { AnimatePresence, motion } from "motion/react";
import { albumById, trackById } from "../../data/library";
import { usePlayer } from "../../lib/player-store";
import { useReducedMotionPreference } from "../../hooks/useReducedMotionPreference";
import { sharedTransition, timing } from "../../animations/config";

export function PlayerMetadata({ large = false }: { large?: boolean }) {
  const { trackId } = usePlayer();
  const reduced = useReducedMotionPreference();
  if (!trackId || !trackById[trackId]) return null;
  const track = trackById[trackId],
    album = albumById[track.albumId];
  return (
    <motion.div
      className={`player-metadata ${large ? "player-metadata-large" : ""}`}
      layoutId={reduced ? undefined : "player-metadata"}
      transition={sharedTransition}
    >
      <AnimatePresence mode="wait" initial={!large}>
        <motion.div
          key={trackId}
          initial={{ opacity: 0, y: reduced ? 0 : 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduced ? 0 : -3 }}
          transition={{ duration: reduced ? timing.reduced : timing.song }}
        >
          {large ? (
            <h1 id="player-title">{track.title}</h1>
          ) : (
            <strong>{track.title}</strong>
          )}
          <span>
            {track.artist}
            <span className="metadata-album"> · {album.title}</span>
          </span>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
