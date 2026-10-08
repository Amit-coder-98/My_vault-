import { useSyncExternalStore } from "react";
import {
  api,
  ApiError,
  configureAuth,
  refreshSession,
  setAccessToken,
} from "./api";
import type { AuthResponse, User } from "../types/api";

let state: {
  status: "loading" | "guest" | "authenticated" | "unavailable";
  user: User | null;
  error: string | null;
} = { status: "loading", user: null, error: null };
const listeners = new Set<() => void>();
let initialization: Promise<void> | null = null;
function publish(value: typeof state) {
  state = value;
  listeners.forEach((fn) => fn());
}
function accept(data: AuthResponse) {
  setAccessToken(data.access_token);
  publish({ status: "authenticated", user: data.user, error: null });
}
export function expireSession() {
  setAccessToken(null);
  publish({ status: "guest", user: null, error: null });
}
configureAuth(accept, expireSession);
export function initializeSession() {
  if (!initialization)
    initialization = refreshSession()
      .then(() => {})
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) expireSession();
        else
          publish({
            status: "unavailable",
            user: null,
            error: error instanceof Error ? error.message : "Connection failed",
          });
      })
      .finally(() => {
        initialization = null;
      });
  return initialization;
}
export const authActions = {
  async login(email: string, password: string) {
    accept(
      await api<AuthResponse>("/auth/login", {
        method: "POST",
        anonymous: true,
        json: { email, password },
      }),
    );
  },
  async register(
    name: string,
    email: string,
    password: string,
    invitation: string,
  ) {
    accept(
      await api<AuthResponse>("/auth/register", {
        method: "POST",
        anonymous: true,
        json: { name, email, password, invitation },
      }),
    );
  },
  async logout() {
    await api("/auth/logout", { method: "POST", anonymous: true });
    expireSession();
  },
  updateUser(user: User) {
    publish({ ...state, user });
  },
};
export const getAuth = () => state;
export function useAuth() {
  return useSyncExternalStore((fn) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, getAuth);
}
