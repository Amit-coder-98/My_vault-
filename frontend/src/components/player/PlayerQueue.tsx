import { AudioLines, ListMusic, Play, Trash2, X } from "lucide-react";
import { motion, useIsPresent } from "motion/react";
import { albumById, trackById } from "../../data/library";
import {
  getNextTrackId,
  playerActions,
  usePlayer,
} from "../../lib/player-store";
import { useDialog } from "../../hooks/useDialog";
import { useReducedMotionPreference } from "../../hooks/useReducedMotionPreference";
import { timing, ease } from "../../animations/config";
import { AlbumArt } from "../music/AlbumArt";
import { IconButton } from "../ui/IconButton";
import { formatTime } from "../../lib/format";

export function PlayerQueue() {
  const player = usePlayer();
  const present = useIsPresent();
  const reduced = useReducedMotionPreference();
  const ref = useDialog(playerActions.closeQueue, present);
  const current = player.trackId ? trackById[player.trackId] : null;
  const nextId = getNextTrackId();
  return (
    <motion.div
      className="queue-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? timing.reduced : timing.ui }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) playerActions.closeQueue();
      }}
    >
      <motion.div
        className="player-queue"
        ref={ref}
        role={present ? "dialog" : undefined}
        aria-modal={present}
        aria-labelledby="queue-title"
        aria-hidden={!present || undefined}
        inert={!present}
        data-lenis-prevent
        initial={reduced ? { opacity: 0 } : { x: 80, y: 24 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        exit={reduced ? { opacity: 0 } : { x: 80, opacity: 0 }}
        transition={{ duration: reduced ? timing.reduced : timing.ui, ease }}
      >
        <header>
          <span className="eyebrow">ONE GOOD MOMENT AFTER ANOTHER</span>
          <IconButton
            icon={X}
            label="Close queue"
            onClick={playerActions.closeQueue}
          />
        </header>
        <div className="queue-intro">
          <ListMusic size={23} />
          <h2 id="queue-title">Your listening queue</h2>
          <p>
            {player.queue.length} songs ·{" "}
            {player.shuffle ? "Shuffle is on" : "In your chosen order"}
          </p>
        </div>
        {current && (
          <div className="queue-current">
            <span className="eyebrow">NOW PLAYING</span>
            <strong>
              {current.title}
              <small>{current.artist}</small>
            </strong>
            <AudioLines size={22} />
          </div>
        )}
        <div className="queue-toolbar">
          <span className="eyebrow">
            {current ? "YOUR QUEUE" : "NOTHING QUEUED YET"}
          </span>
          <button
            className="text-link"
            onClick={playerActions.clearQueue}
            disabled={player.queue.length <= 1}
          >
            <Trash2 size={13} />
            Clear up next
          </button>
        </div>
        <div className="queue-list">
          {player.queue.map((id, index) => {
            const track = trackById[id],
              active = id === player.trackId;
            if (!track) return null;
            return (
              <div
                className={`queue-item ${active ? "queue-item-active" : ""}`}
                key={id}
                aria-current={active ? "true" : undefined}
              >
                <button
                  className="queue-select"
                  aria-label={`Play ${track.title} from queue`}
                  onClick={() =>
                    active
                      ? playerActions.toggle()
                      : playerActions.playQueued(index)
                  }
                >
                  <div className="queue-art">
                    <AlbumArt
                      album={albumById[track.albumId]}
                      lettering={false}
                    />
                    {active && player.isPlaying ? (
                      <span className="tiny-equalizer">
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : (
                      <Play
                        className="queue-play-icon"
                        size={16}
                        fill="currentColor"
                      />
                    )}
                  </div>
                  <span>
                    <strong>{track.title}</strong>
                    <small>{track.artist}</small>
                    {id === nextId && <em>Up next</em>}
                  </span>
                </button>
                <span className="queue-duration">
                  {formatTime(track.duration)}
                </span>
                <IconButton
                  icon={X}
                  label={`Remove ${track.title} from queue`}
                  onClick={() => playerActions.removeFromQueue(id)}
                />
              </div>
            );
          })}
          {!player.queue.length && (
            <div className="queue-empty">
              <ListMusic size={38} />
              <strong>A little room for music.</strong>
              <p>Select a song or play a collection to fill your queue.</p>
            </div>
          )}
        </div>
        <footer>
          Music keeps playing while you make room for the next feeling.
        </footer>
      </motion.div>
    </motion.div>
  );
}
