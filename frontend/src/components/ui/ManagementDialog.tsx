import { X } from "lucide-react";
import { useDialog } from "../../hooks/useDialog";
export function ManagementDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useDialog(onClose);
  return (
    <div
      className="management-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        className="management-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="management-title"
        data-lenis-prevent
      >
        <header>
          <div>
            <span className="eyebrow">YOUR VAULT</span>
            <h2 id="management-title">{title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close form"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function FormError({ message }: { message: string }) {
  return message ? (
    <p className="form-error" role="alert">
      {message}
    </p>
  ) : null;
}
