import { useEffect, useState } from "react";
import { X } from "lucide-react";
export function Notice() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    const receive = (event: Event) =>
      setMessage((event as CustomEvent<string>).detail);
    window.addEventListener("vault:notice", receive);
    return () => window.removeEventListener("vault:notice", receive);
  }, []);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 7000);
    return () => clearTimeout(timer);
  }, [message]);
  return message ? (
    <div className="vault-notice" role="status">
      <span>{message}</span>
      <button aria-label="Dismiss notification" onClick={() => setMessage("")}>
        <X size={17} />
      </button>
    </div>
  ) : null;
}
