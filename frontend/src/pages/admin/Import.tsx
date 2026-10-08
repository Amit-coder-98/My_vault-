import { useEffect, useState } from "react";
import { CheckCircle2, FolderInput, RefreshCw } from "lucide-react";
import { api, notify } from "../../lib/api";
import { loadLibrary } from "../../data/library";
import { playerActions } from "../../lib/player-store";
import { useResource, useTask } from "../../hooks/useResource";
import type { ImportJob, ImportRow } from "../../types/api";
import { FormError } from "../../components/ui/ManagementDialog";
export function AdminImport() {
  const [preview, setPreview] = useState<ImportRow[] | null>(null);
  const resource = useResource<ImportJob[]>("/admin/import/jobs", []);
  const task = useTask();
  const running = resource.data.some(
    (job) => job.status === "queued" || job.status === "processing",
  );
  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(resource.reload, 1500);
    return () => clearInterval(interval);
  }, [running, resource.reload]);
  const latest = resource.data[0];
  useEffect(() => {
    if (latest?.status === "complete")
      void loadLibrary()
        .then(() => playerActions.reconcileCatalog())
        .catch((e: Error) => notify(e.message));
  }, [latest?.id, latest?.status]);
  return (
    <>
      <section className="admin-surface import-intro">
        <span className="import-icon">
          <FolderInput size={30} />
        </span>
        <div>
          <span className="eyebrow">BRING YOUR FEELINGS WITH YOU</span>
          <h2>Your folders, beautifully organized.</h2>
          <p>
            Love, Sad / Breakup and Silent become mood collections. Existing
            audio is recognized, and your source files stay intact.
          </p>
          <div className="form-actions">
            <button
              className="secondary-button"
              disabled={task.busy || running}
              onClick={() => {
                void task.run(async () => {
                  setPreview(await api<ImportRow[]>("/admin/import/preview"));
                });
              }}
            >
              <RefreshCw size={15} /> Preview source folder
            </button>
            <button
              className="primary-button"
              disabled={task.busy || running || !preview}
              onClick={() => {
                void task.run(async () => {
                  await api("/admin/import", { method: "POST" });
                  resource.reload();
                  setPreview(null);
                });
              }}
            >
              {running ? "Import running…" : "Import validated files"}
            </button>
          </div>
        </div>
      </section>
      <FormError message={task.error || resource.error} />
      {preview && (
        <section className="admin-surface">
          <div className="admin-section-heading">
            <h2>Import preview</h2>
            <span>
              {preview.length} files ·{" "}
              {preview.filter((r) => r.duplicate).length} already in vault
            </span>
          </div>
          <div className="import-file-list">
            {preview.map((row) => (
              <div key={row.source}>
                <div>
                  <strong>{row.title ?? row.filename}</strong>
                  <small>{row.source}</small>
                </div>
                <span
                  className={`status-pill ${row.error ? "archived" : "published"}`}
                >
                  {row.error ??
                    (row.migration_needed
                      ? "Ready for B2"
                      : row.duplicate
                        ? "Already imported"
                        : "Ready")}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="admin-surface">
        <div className="admin-section-heading">
          <h2>Import history</h2>
          <button className="text-link" onClick={resource.reload}>
            Refresh
          </button>
        </div>
        {resource.data.length ? (
          resource.data.map((job) => (
            <article className="import-job" key={job.id}>
              <div className="admin-section-heading">
                <strong>
                  <CheckCircle2 size={17} /> {job.status}
                </strong>
                <span>
                  {job.completed} / {job.total} files processed
                </span>
              </div>
              <progress value={job.completed} max={job.total || 1} />
              <div className="import-summary">
                {["imported", "migrated", "skipped", "failed"].map((status) => (
                  <span key={status}>
                    {job.results.filter((r) => r.status === status).length}{" "}
                    {status}
                  </span>
                ))}
              </div>
              {job.message && <p>{job.message}</p>}
              {job.results.some((r) => r.status === "failed") && (
                <details>
                  <summary>Review failed files</summary>
                  {job.results
                    .filter((r) => r.status === "failed")
                    .map((row) => (
                      <p key={row.source}>
                        {row.source}: {row.message}
                      </p>
                    ))}
                </details>
              )}
            </article>
          ))
        ) : (
          <p>No imports yet. Start with a preview of your source folder.</p>
        )}
      </section>
    </>
  );
}
