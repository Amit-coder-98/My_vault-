import { useReducedMotionPreference } from "../../hooks/useReducedMotionPreference";
import {
  Heart,
  LoaderCircle,
  Pause,
  Play,
  Repeat,
  Repeat1,
  RotateCcw,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { motion } from "motion/react";
import { playerActions, usePlayer } from "../../lib/player-store";
import { IconButton } from "../ui/IconButton";
import { timing } from "../../animations/config";

export function PlayButton({ large = false }: { large?: boolean }) {
  const { wantsPlayback, trackId, status } = usePlayer();
  const loading = status === "LOADING" || status === "BUFFERING";
  return (
    <motion.button
      className={`play-button ${large ? "play-button-large" : ""}`}
      aria-label={
        status === "ERROR"
          ? "Retry playback"
          : wantsPlayback
            ? "Pause playback"
            : "Play music"
      }
      disabled={!trackId}
      aria-busy={loading}
      whileTap={{ scale: 0.94 }}
      onClick={playerActions.toggle}
    >
      <motion.span
        key={status === "ERROR" ? "error" : String(wantsPlayback)}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: timing.micro }}
      >
        {status === "ERROR" ? (
          <RotateCcw size={large ? 25 : 18} />
        ) : wantsPlayback ? (
          <Pause size={large ? 27 : 18} fill="currentColor" />
        ) : (
          <Play size={large ? 27 : 18} fill="currentColor" />
        )}
      </motion.span>
      {loading && (
        <LoaderCircle
          className="play-loading"
          size={large ? 64 : 36}
          aria-hidden="true"
        />
      )}
    </motion.button>
  );
}
export function Transport({ large = false }: { large?: boolean }) {
  const { shuffle, repeat, trackId, queue } = usePlayer();
  return (
    <div className={`transport ${large ? "transport-large" : ""}`}>
      <IconButton
        icon={Shuffle}
        label={shuffle ? "Disable shuffle" : "Enable shuffle"}
        active={shuffle}
        aria-pressed={shuffle}
        disabled={!trackId || queue.length < 2}
        onClick={playerActions.toggleShuffle}
        className="secondary-transport"
      />
      <IconButton
        icon={SkipBack}
        label="Previous track"
        disabled={!trackId}
        onClick={playerActions.previous}
      />
      <PlayButton large={large} />
      <IconButton
        icon={SkipForward}
        label="Next track"
        disabled={!trackId}
        onClick={playerActions.next}
      />
      <IconButton
        icon={repeat === "one" ? Repeat1 : Repeat}
        label={`Repeat: ${repeat}`}
        active={repeat !== "off"}
        aria-pressed={repeat !== "off"}
        disabled={!trackId}
        onClick={playerActions.cycleRepeat}
        className="secondary-transport"
      />
    </div>
  );
}
export function FavoriteButton({
  trackId,
  className = "",
}: {
  trackId: string;
  className?: string;
}) {
  const { favorites } = usePlayer();
  const favorite = favorites.has(trackId);
  const reduced = useReducedMotionPreference();
  return (
    <motion.button
      className={`icon-button favorite-button ${favorite ? "is-active" : ""} ${className}`}
      aria-label={
        favorite
          ? "Remove current song from favorites"
          : "Favorite current song"
      }
      aria-pressed={favorite}
      whileTap={{ scale: 1.1 }}
      onClick={() => playerActions.toggleFavorite(trackId)}
    >
      <motion.span
        key={String(favorite)}
        animate={{ scale: favorite && !reduced ? [0.8, 1.2, 1] : 1 }}
        transition={{ duration: timing.ui }}
      >
        <Heart
          size={19}
          strokeWidth={1.65}
          fill={favorite ? "currentColor" : "none"}
        />
      </motion.span>
    </motion.button>
  );
}
export function VolumeControl() {
  const { volume, muted } = usePlayer();
  return (
    <div className="volume-control">
      <IconButton
        icon={muted || volume === 0 ? VolumeX : Volume2}
        label={muted ? "Unmute" : "Mute"}
        aria-pressed={muted}
        onClick={playerActions.toggleMute}
      />
      <div className="volume-popover">
        <input
          className="range-input volume-range"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={(e) => playerActions.setVolume(Number(e.target.value))}
          aria-label="Volume"
          aria-valuetext={`${Math.round((muted ? 0 : volume) * 100)} percent`}
          style={
            {
              "--range-progress": `${(muted ? 0 : volume) * 100}%`,
            } as React.CSSProperties
          }
        />
      </div>
    </div>
  );
}
