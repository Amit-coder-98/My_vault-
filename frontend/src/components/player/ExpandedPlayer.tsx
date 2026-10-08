import {
  ChevronDown,
  ListMusic,
  Maximize2,
  Minimize2,
  Sparkles,
} from "lucide-react";
import { motion } from "motion/react";
import { albumById, trackById } from "../../data/library";
import {
  getUpcomingCount,
  playerActions,
  usePlayer,
} from "../../lib/player-store";
import { useReducedMotionPreference } from "../../hooks/useReducedMotionPreference";
import { timing } from "../../animations/config";
import { IconButton } from "../ui/IconButton";
import { FavoriteButton, Transport, VolumeControl } from "./PlayerControls";
import { OptionalAtmosphere } from "./OptionalAtmosphere";
import { Progress } from "./Progress";
import { Waveform } from "./Waveform";
import { PlayerArtwork } from "./PlayerArtwork";
import { PlayerMetadata } from "./PlayerMetadata";
import { PlayerStatus } from "./PlayerStatus";
import { Visualizer } from "./Visualizer";

export function ExpandedPlayer({
  atmosphere,
  fullscreen = false,
}: {
  atmosphere: boolean;
  fullscreen?: boolean;
}) {
  const player = usePlayer();
  const reduced = useReducedMotionPreference();
  if (!player.trackId || !trackById[player.trackId]) return null;
  const track = trackById[player.trackId],
    album = albumById[track.albumId];
  return (
    <div
      className={`player-stage ${fullscreen ? "player-stage-full" : ""}`}
      data-lenis-prevent
    >
      <OptionalAtmosphere
        enabled={atmosphere && fullscreen}
        color={album.palette.accent}
        playing={player.isPlaying}
      />
      <motion.header
        className="player-stage-header"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduced ? timing.reduced : timing.ui }}
      >
        <IconButton
          icon={ChevronDown}
          label="Minimize music player"
          onClick={() => playerActions.setMode("mini")}
        />
        <div>
          <span className="eyebrow">NOW IN YOUR WORLD</span>
          <p>{album.title}</p>
        </div>
        <IconButton
          icon={fullscreen ? Minimize2 : Maximize2}
          label={
            fullscreen ? "Return to expanded player" : "Open immersive player"
          }
          onClick={() =>
            playerActions.setMode(fullscreen ? "expanded" : "fullscreen")
          }
        />
      </motion.header>
      <div className="player-stage-content">
        <div className="player-stage-art">
          <PlayerArtwork large />
          <span className="artwork-gesture-hint">
            Swipe to skip · pull down to return
          </span>
        </div>
        <div className="player-stage-details">
          <div className="player-song-heading">
            <PlayerMetadata large />
            <FavoriteButton trackId={track.id} />
          </div>
          <PlayerStatus />
          <motion.div
            className="player-listening-controls"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: reduced ? timing.reduced : timing.ui,
              delay: reduced ? 0 : 0.12,
            }}
          >
            <Waveform />
            <Progress fullscreen />
            <Transport large />
            <div className="player-secondary">
              <button className="text-link" onClick={playerActions.openQueue}>
                <ListMusic size={17} />
                Up next <span>{getUpcomingCount()}</span>
              </button>
              <VolumeControl />
              <span className="player-genre">{album.genre}</span>
            </div>
            <div className="player-sound-detail">
              <Visualizer />
              <span>
                {track.demo
                  ? "An original sound sketch for your vault"
                  : "From your personal collection"}
              </span>
            </div>
          </motion.div>
        </div>
      </div>
      <footer className="player-stage-footer">
        <span>
          <Sparkles size={13} />A little less noise. A little more music.
        </span>
        <kbd>ESC TO RETURN</kbd>
      </footer>
    </div>
  );
}
