import { ExpandedPlayer } from "./ExpandedPlayer";

export function FullscreenPlayer({ atmosphere }: { atmosphere: boolean }) {
  return <ExpandedPlayer atmosphere={atmosphere} fullscreen />;
}
