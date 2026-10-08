import { useEffect } from "react";
import { AudioController } from "../lib/audio-controller";
import { bindAudioController, playerEvents } from "../lib/player-store";

export function useAudioEngine() {
  useEffect(() => {
    const controller = new AudioController(playerEvents);
    const unbind = bindAudioController(controller);
    return () => {
      unbind();
      controller.destroy();
    };
  }, []);
}
