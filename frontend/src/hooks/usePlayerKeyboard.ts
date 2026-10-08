import { useEffect } from "react";
import { getPlayer, playerActions } from "../lib/player-store";

export function usePlayerKeyboard(openSearch: () => void, blocked: boolean) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const typing = target?.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
      );
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        if (typing) return;
        event.preventDefault();
        openSearch();
        return;
      }
      if (
        typing ||
        blocked ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.repeat
      )
        return;
      const key = event.key.toLowerCase();
      if (event.code === "Space") {
        if (target?.closest("button, a")) return;
        event.preventDefault();
        playerActions.toggle();
      } else if (key === "arrowleft") {
        event.preventDefault();
        playerActions.seekRelative(-5);
      } else if (key === "arrowright") {
        event.preventDefault();
        playerActions.seekRelative(5);
      } else if (key === "n" || key === "l") playerActions.next();
      else if (key === "p" || key === "j") playerActions.previous();
      else if (key === "m") playerActions.toggleMute();
      else if (key === "f") {
        const id = getPlayer().trackId;
        if (id) playerActions.toggleFavorite(id);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openSearch, blocked]);
}
