import type { AuthResponse } from "../types/api";

export const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN ?? "").replace(
  /\/$/,
  "",
);
export const mediaUrl = (path: string) =>
  path.startsWith("/") ? API_ORIGIN + path : path;
let token: string | null = null;
let refreshPending: Promise<AuthResponse> | null = null;
let onRefresh = (_value: AuthResponse) => {};
let onExpired = () => {};
let epoch = 0;
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export function setAccessToken(value: string | null) {
  token = value;
  if (!value) epoch++;
}
export function configureAuth(
  refresh: typeof onRefresh,
  expired: typeof onExpired,
) {
  onRefresh = refresh;
  onExpired = expired;
}
async function failure(response: Response) {
  const data = await response.json().catch(() => null);
  const detail =
    typeof data?.detail === "string"
      ? data.detail
      : Array.isArray(data?.detail)
        ? data.detail
            .map(
              (item: { loc?: string[]; msg?: string }) =>
                `${item.loc?.slice(1).join(".")}: ${item.msg}`,
            )
            .join(" · ")
        : "The request could not be completed";
  return new ApiError(detail, response.status);
}
export function refreshSession() {
  if (!refreshPending) {
    const started = epoch;
    refreshPending = (async () => {
      if (!token) {
        let probe: Response;
        try {
          probe = await fetch(API_ORIGIN + "/api/v1/auth/session", {
            credentials: "include",
          });
        } catch {
          throw new ApiError(
            "Your vault is temporarily unavailable. Please try again.",
            0,
          );
        }
        if (!probe.ok) throw await failure(probe);
        if (!(await probe.json()).authenticated)
          throw new ApiError("Please sign in", 401);
      }
      let response: Response;
      try {
        response = await fetch(API_ORIGIN + "/api/v1/auth/refresh", {
          method: "POST",
          credentials: "include",
        });
      } catch {
        throw new ApiError(
          "The vault server is unavailable. Start the backend and try again.",
          0,
        );
      }
      if (!response.ok) throw await failure(response);
      const data: AuthResponse = await response.json();
      if (started !== epoch)
        throw new ApiError("The account changed. Please sign in again.", 401);
      token = data.access_token;
      onRefresh(data);
      return data;
    })().finally(() => {
      refreshPending = null;
    });
  }
  return refreshPending;
}
interface Options {
  method?: string;
  json?: unknown;
  body?: FormData;
  anonymous?: boolean;
}
export async function api<T = void>(
  path: string,
  options: Options = {},
  retry = true,
): Promise<T> {
  const started = epoch;
  const headers: Record<string, string> = {};
  if (!options.anonymous && token) headers.Authorization = `Bearer ${token}`;
  if (options.json !== undefined) headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(API_ORIGIN + "/api/v1" + path, {
      method: options.method ?? "GET",
      credentials: "include",
      headers,
      body:
        options.body ??
        (options.json !== undefined ? JSON.stringify(options.json) : undefined),
    });
  } catch {
    throw new ApiError("The vault server is unavailable. Please try again.", 0);
  }
  if (response.status === 401 && !options.anonymous && retry) {
    try {
      await refreshSession();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onExpired();
      throw error;
    }
    return api<T>(path, options, false);
  }
  if (!response.ok) throw await failure(response);
  if (started !== epoch && !options.anonymous)
    throw new ApiError("The account changed.", 401);
  return response.status === 204 ? (undefined as T) : response.json();
}
export function notify(message: string) {
  window.dispatchEvent(new CustomEvent("vault:notice", { detail: message }));
}
