import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { albumById, trackById } from "../../data/library";
import { playerActions, usePlayer } from "../../lib/player-store";
import { useDialog } from "../../hooks/useDialog";
import { useReducedMotionPreference } from "../../hooks/useReducedMotionPreference";
import { sharedTransition, timing } from "../../animations/config";
import { AmbientBackdrop } from "./AmbientBackdrop";
import { MiniPlayer } from "./MiniPlayer";
import { ExpandedPlayer } from "./ExpandedPlayer";
import { FullscreenPlayer } from "./FullscreenPlayer";
import { PlayerQueue } from "./PlayerQueue";

const minimize = () => playerActions.setMode("mini");
export function MusicPlayer({
  atmosphere,
  blocked,
}: {
  atmosphere: boolean;
  blocked: boolean;
}) {
  const player = usePlayer();
  const reduced = useReducedMotionPreference();
  const large = player.mode !== "mini";
  const ref = useDialog(minimize, large);
  const selectedTrack = player.trackId ? trackById[player.trackId] : undefined;
  const album = selectedTrack ? albumById[selectedTrack.albumId] : null;
  return (
    <MotionConfig skipAnimations={false}>
      <AnimatePresence>
        {large && (
          <motion.div
            className="player-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? timing.reduced : timing.ui }}
            onClick={minimize}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>
      <motion.div
        ref={ref}
        className={`player-frame player-mode-${player.mode}`}
        layout={!reduced}
        layoutRoot
        layoutId={reduced ? undefined : "player-surface"}
        transition={reduced ? { duration: timing.reduced } : sharedTransition}
        role={large ? "dialog" : "region"}
        aria-modal={large || undefined}
        aria-labelledby={large ? "player-title" : undefined}
        aria-label={!large ? "Music player" : undefined}
        inert={blocked || player.queueOpen}
        aria-hidden={blocked || player.queueOpen || undefined}
        data-mode={player.mode}
        data-status={player.status}
        style={
          {
            "--accent": album?.palette.accent ?? "#c3b5ee",
            "--ambient": album?.palette.ambient ?? "#504366",
          } as React.CSSProperties
        }
      >
        {album && <AmbientBackdrop album={album} playing={player.isPlaying} />}
        {player.mode === "mini" ? (
          <MiniPlayer />
        ) : player.mode === "expanded" ? (
          <ExpandedPlayer atmosphere={atmosphere} />
        ) : (
          <FullscreenPlayer atmosphere={atmosphere} />
        )}
      </motion.div>
      <AnimatePresence>
        {player.queueOpen && <PlayerQueue key="queue" />}
      </AnimatePresence>
    </MotionConfig>
  );
}
