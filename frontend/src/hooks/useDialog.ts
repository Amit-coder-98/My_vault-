import { useEffect, useRef } from "react";

const dialogs: { token: symbol; element: HTMLElement | null }[] = [];
let savedOverflow = "";
let savedPadding = "";
export const isScrollLocked = () => dialogs.length > 0;
const notifyLock = () =>
  window.dispatchEvent(
    new CustomEvent("vault:scroll-lock", { detail: isScrollLocked() }),
  );

export function useDialog(onClose: () => void, active = true) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!active) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousLabel = previousFocus?.getAttribute("aria-label");
    if (!dialogs.length) {
      savedOverflow = document.body.style.overflow;
      savedPadding = document.body.style.paddingRight;
      const gutter = window.innerWidth - document.documentElement.clientWidth;
      if (gutter > 0) document.body.style.paddingRight = gutter + "px";
      document.body.style.overflow = "hidden";
    }
    const token = Symbol("dialog");
    dialogs.push({ token, element: ref.current });
    notifyLock();
    const element = ref.current;
    const focusable = () =>
      Array.from(
        element?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex="0"]',
        ) ?? [],
      ).filter(
        (item) => item.getClientRects().length > 0 && !item.closest("[inert]"),
      );
    const frame = requestAnimationFrame(() => {
      if (dialogs.at(-1)?.token === token)
        focusable()[0]?.focus({ preventScroll: true });
    });
    const onKey = (event: KeyboardEvent) => {
      if (dialogs.at(-1)?.token !== token) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        close.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0],
        last = items.at(-1);
      if (
        !element?.contains(document.activeElement) ||
        (event.shiftKey && document.activeElement === first)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      const index = dialogs.findIndex((item) => item.token === token);
      if (index !== -1) dialogs.splice(index, 1);
      if (!dialogs.length) {
        document.body.style.overflow = savedOverflow;
        document.body.style.paddingRight = savedPadding;
      }
      notifyLock();
      requestAnimationFrame(() => {
        const top = dialogs.at(-1)?.element;
        const replacement = previousLabel
          ? document.querySelector<HTMLElement>(
              'button[aria-label="' + CSS.escape(previousLabel) + '"]',
            )
          : null;
        const candidate =
          previousFocus?.isConnected &&
          previousFocus !== document.body &&
          previousFocus !== document.documentElement
            ? previousFocus
            : replacement;
        const target =
          candidate &&
          !candidate.closest("[inert]") &&
          (!top || top.contains(candidate))
            ? candidate
            : (top?.querySelector<HTMLElement>(
                "button:not([disabled]),input",
              ) ?? document.querySelector<HTMLElement>(".mini-artwork-button"));
        target?.focus({ preventScroll: true });
      });
    };
  }, [active]);
  return ref;
}
