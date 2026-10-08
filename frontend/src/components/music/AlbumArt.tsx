import { motion } from "motion/react";
import { useState } from "react";
import { Disc3 } from "lucide-react";
import type { Album } from "../../types/music";
import { sharedTransition } from "../../animations/config";

export function AlbumArt({
  album,
  className = "",
  shared = false,
  priority = false,
  lettering = true,
}: {
  album: Album;
  className?: string;
  shared?: boolean;
  priority?: boolean;
  lettering?: boolean;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return (
    <motion.div
      layoutId={shared ? "player-artwork" : undefined}
      transition={sharedTransition}
      className={`album-art cover-${album.coverStyle} ${className}`}
      style={{ backgroundColor: album.palette.ambient }}
    >
      {album.artwork && failedSource !== album.artwork ? (
        <img
          src={album.artwork}
          alt={`${album.title} album artwork`}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          onError={() => setFailedSource(album.artwork)}
        />
      ) : (
        <div
          className="artwork-fallback"
          role="img"
          aria-label={`${album.title} artwork unavailable`}
        >
          <Disc3 size={48} strokeWidth={1} />
          <span>{album.artist}</span>
        </div>
      )}
      {lettering && (
        <div className="cover-lettering" aria-hidden="true">
          <span className="cover-artist">{album.artist}</span>
          <span className="cover-title">{album.title}</span>
          <span className="cover-footer">
            {album.year || ""} &nbsp; / &nbsp;{" "}
            {album.coverStyle === "library"
              ? "YOUR COLLECTION"
              : "ORIGINAL RECORDINGS"}
          </span>
        </div>
      )}
    </motion.div>
  );
}
