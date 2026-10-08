import { useEffect, useState } from "react";
import App from "./App";
import { Brand } from "./components/ui/Brand";
import { Notice } from "./components/ui/Notice";
import {
  clearLibrary,
  demoMode,
  loadLibrary,
  reloadPlaylists,
} from "./data/library";
import { api, notify } from "./lib/api";
import { getAuth, initializeSession, useAuth } from "./lib/auth-store";
import { playerActions } from "./lib/player-store";
import { navigate, useRoute } from "./lib/router";
import { AuthPage } from "./pages/Auth";
import { MotionConfig } from "motion/react";
import { useReducedMotionPreference } from "./hooks/useReducedMotionPreference";

function SignedIn() {
  const auth = useAuth();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    loadLibrary()
      .then((data) => {
        if (!active) return;
        const pending = new Map<string, Promise<void>>();
        playerActions.hydrate(
          data.favorites,
          data.preferences.volume,
          async (id, favorite) => {
            const previous = pending.get(id) ?? Promise.resolve();
            const save = previous
              .catch(() => {})
              .then(async () => {
                await api(`/me/favorites/${id}`, {
                  method: favorite ? "PUT" : "DELETE",
                });
              });
            pending.set(id, save);
            try {
              await save;
            } catch (e) {
              notify(
                e instanceof Error ? e.message : "Could not save this favorite",
              );
              throw e;
            } finally {
              if (pending.get(id) === save) pending.delete(id);
            }
            await reloadPlaylists().catch(() => {
              notify(
                "Favorite saved. Reopen playlists to refresh their songs.",
              );
            });
          },
        );
        setReady(true);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [auth.user?.id, attempt]);
  return ready ? (
    <App />
  ) : (
    <Connection
      message={error || "Opening your music vault…"}
      retry={
        error
          ? () => {
              setError("");
              setAttempt((v) => v + 1);
            }
          : undefined
      }
    />
  );
}
function Connection({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <main className="connection-screen">
      <Brand />
      <span className="connection-orbit" aria-hidden="true" />
      <h1>Your music is waiting.</h1>
      <p role={retry ? "alert" : "status"}>{message}</p>
      {retry && (
        <button className="primary-button" onClick={retry}>
          Try again
        </button>
      )}
    </main>
  );
}
export default function Root() {
  const reduced = useReducedMotionPreference();
  const auth = useAuth();
  const route = useRoute();
  useEffect(() => {
    if (demoMode) return;
    void initializeSession();
    const refresh = window.setInterval(() => {
      if (getAuth().status === "authenticated") void initializeSession();
    }, 10 * 60_000);
    return () => clearInterval(refresh);
  }, []);
  useEffect(() => {
    if (auth.status === "guest") {
      playerActions.reset();
      clearLibrary();
    }
  }, [auth.status]);
  useEffect(() => {
    if (
      !demoMode &&
      auth.status === "guest" &&
      !/^\/(login|register|forgot-password|reset-password)(\?|$)/.test(route)
    )
      navigate(`/login?next=${encodeURIComponent(route)}`, true);
    if (
      auth.status === "authenticated" &&
      /^\/(login|register)(\?|$)/.test(route)
    ) {
      const next = new URLSearchParams(route.split("?")[1]).get("next");
      navigate(
        next?.startsWith("/") && !next.startsWith("//") ? next : "/",
        true,
      );
    }
  }, [auth.status, route]);
  let screen;
  if (demoMode) screen = <App />;
  else if (auth.status === "loading")
    screen = <Connection message="Opening your vault…" />;
  else if (auth.status === "unavailable")
    screen = (
      <Connection
        message={auth.error ?? "Your vault is temporarily unavailable."}
        retry={() => {
          void initializeSession();
        }}
      />
    );
  else if (auth.status === "authenticated")
    screen = <SignedIn key={auth.user!.id} />;
  else screen = <AuthPage key={route.split("?")[0]} route={route} />;
  return (
    <MotionConfig reducedMotion="never" skipAnimations={reduced}>
      {screen}
      <Notice />
    </MotionConfig>
  );
}
