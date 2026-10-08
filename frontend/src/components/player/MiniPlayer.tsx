import { AudioLines, ListMusic, Maximize2, Music2 } from "lucide-react";
import { playerActions, usePlayer } from "../../lib/player-store";
import { FavoriteButton, Transport, VolumeControl } from "./PlayerControls";
import { Progress } from "./Progress";
import { IconButton } from "../ui/IconButton";
import { PlayerArtwork } from "./PlayerArtwork";
import { PlayerMetadata } from "./PlayerMetadata";
import { PlayerStatus } from "./PlayerStatus";
import { demoMode } from "../../data/library";

export function MiniPlayer() {
  const player = usePlayer();
  return (
    <div className="mini-player">
      <div className="mini-player-left">
        {player.trackId ? (
          <>
            <button
              className="mini-artwork-button"
              onClick={() => playerActions.setMode("expanded")}
              aria-label="Expand music player"
            >
              <PlayerArtwork />
            </button>
            <button
              className="mini-metadata"
              onClick={() => playerActions.setMode("expanded")}
              aria-label="Expand song details"
            >
              <PlayerMetadata />
            </button>
            <FavoriteButton
              trackId={player.trackId}
              className="mini-favorite"
            />
          </>
        ) : (
          <>
            <div className="mini-empty-art">
              <Music2 size={22} />
            </div>
            <div className="mini-empty">
              <strong>No song playing</strong>
              <span>Select a song to begin listening.</span>
            </div>
          </>
        )}
        <PlayerStatus compact />
      </div>
      <div className="mini-player-center">
        <Transport />
        <Progress />
      </div>
      <div className="mini-player-right">
        <span className="player-preview-label">
          <AudioLines size={14} />
          {demoMode ? "DEMO AUDIO" : "YOUR LIBRARY"}
        </span>
        <IconButton
          icon={ListMusic}
          label="Open play queue"
          onClick={playerActions.openQueue}
        />
        <VolumeControl />
        <IconButton
          icon={Maximize2}
          label="Open immersive player"
          disabled={!player.trackId}
          onClick={() => playerActions.setMode("fullscreen")}
        />
      </div>
    </div>
  );
}
