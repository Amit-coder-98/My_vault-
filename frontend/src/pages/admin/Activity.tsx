import { useResource } from "../../hooks/useResource";
import type { AuditEvent } from "../../types/api";
import { FormError } from "../../components/ui/ManagementDialog";
export function AdminActivity() {
  const resource = useResource<AuditEvent[]>("/admin/activity", []);
  return (
    <section className="admin-surface">
      <div className="admin-section-heading">
        <div>
          <span className="eyebrow">A CLEAR RECORD</span>
          <h2>Vault activity</h2>
        </div>
        <button className="text-link" onClick={resource.reload}>
          Refresh
        </button>
      </div>
      <FormError message={resource.error} />
      {resource.loading && <p role="status">Loading activity…</p>}
      {resource.data.map((event) => (
        <div className="activity-row" key={event.id}>
          <span className="activity-dot" />
          <div>
            <strong>
              {event.action.replaceAll(".", " / ").replaceAll("_", " ")}
            </strong>
            <p>{event.detail || "Vault updated"}</p>
            <small>
              {event.actor_name} · {new Date(event.created_at).toLocaleString()}
            </small>
          </div>
        </div>
      ))}
      {!resource.loading && !resource.data.length && (
        <p>Administrative actions will appear here.</p>
      )}
    </section>
  );
}
