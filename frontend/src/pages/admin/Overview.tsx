import { ArrowUpRight, Database, HardDrive, Music2, Users } from "lucide-react";
import { useResource } from "../../hooks/useResource";
import type { Overview } from "../../types/api";
import { FormError } from "../../components/ui/ManagementDialog";
export function AdminOverview({
  onSongs,
  onImport,
}: {
  onSongs: () => void;
  onImport: () => void;
}) {
  const resource = useResource<Overview | null>("/admin/overview", null);
  const data = resource.data;
  return (
    <>
      <FormError message={resource.error} />
      {resource.loading && <p role="status">Loading your vault overview…</p>}
      {data && (
        <>
          <div className="admin-stats">
            {[
              {
                icon: Music2,
                label: "Published songs",
                value: data.songs.published,
                caption: `${data.songs.draft} drafts · ${data.songs.archived} archived`,
              },
              {
                icon: Users,
                label: "Your people",
                value: data.users,
                caption: `${data.active_users} active accounts`,
              },
              {
                icon: HardDrive,
                label: "Audio storage",
                value: `${(data.storage_bytes / 1024 / 1024).toFixed(1)} MB`,
                caption: "Original audio files",
              },
              {
                icon: Database,
                label: "Listening records",
                value: data.listening_records,
                caption: "Distinct user / song records",
              },
            ].map((metric) => (
              <article key={metric.label}>
                <metric.icon size={21} />
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.caption}</small>
              </article>
            ))}
          </div>
          <div className="admin-overview-grid">
            <section className="admin-surface">
              <div className="admin-section-heading">
                <h2>Recently added</h2>
                <button className="text-link" onClick={onSongs}>
                  All songs <ArrowUpRight size={15} />
                </button>
              </div>
              {data.recent_songs.length ? (
                data.recent_songs.map((song) => (
                  <div className="admin-recent-song" key={song.id}>
                    <Music2 size={18} />
                    <div>
                      <strong>{song.title}</strong>
                      <small>{song.artist}</small>
                    </div>
                    <span className={`status-pill ${song.status}`}>
                      {song.status}
                    </span>
                  </div>
                ))
              ) : (
                <div className="admin-empty">
                  <p>Your library starts with a song.</p>
                  <button className="secondary-button" onClick={onImport}>
                    Import your folders
                  </button>
                </div>
              )}
            </section>
            <section className="admin-surface">
              <span className="eyebrow">A WELL KEPT VAULT</span>
              <h2>Everything in its place.</h2>
              <p>
                Keep feelings, styles and languages separate. A song can belong
                to several moods.
              </p>
              <div className="system-rows">
                {!!data.pending_asset_cleanup && (
                  <p>
                    <span>Old artwork cleanup</span>
                    <strong>{data.pending_asset_cleanup} pending</strong>
                  </p>
                )}
                <p>
                  <span>API</span>
                  <strong>{data.api}</strong>
                </p>
                <p>
                  <span>Database</span>
                  <strong>{data.database}</strong>
                </p>
                <p>
                  <span>Storage</span>
                  <strong>{data.storage}</strong>
                </p>
                <p>
                  <span>Upload limit</span>
                  <strong>{data.max_upload_mb} MB per file</strong>
                </p>
              </div>
              <button className="text-link" onClick={onImport}>
                Bring in your music <ArrowUpRight size={15} />
              </button>
            </section>
          </div>
        </>
      )}
    </>
  );
}
