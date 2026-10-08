import { useState } from "react";
import {
  Activity,
  ArrowLeft,
  FolderInput,
  LayoutDashboard,
  Music2,
  Tags,
  Users,
} from "lucide-react";
import { useAuth } from "../../lib/auth-store";
import { navigate } from "../../lib/router";
import { AdminOverview } from "./Overview";
import { AdminSongs } from "./Songs";
import { AdminImport } from "./Import";
import { AdminLabels } from "./Labels";
import { AdminUsers } from "./Users";
import { AdminActivity } from "./Activity";
import { AdminCredits } from "./Credits";
const tabs = [
  { id: "overview", name: "Overview", icon: LayoutDashboard },
  { id: "songs", name: "Songs", icon: Music2 },
  { id: "import", name: "Import", icon: FolderInput },
  { id: "labels", name: "Categories", icon: Tags },
  { id: "credits", name: "Artists & albums", icon: Music2 },
  { id: "users", name: "People", icon: Users },
  { id: "activity", name: "Activity", icon: Activity },
] as const;
export function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("overview");
  if (!user || user.role === "user")
    return (
      <div className="empty-state">
        <h1>This space belongs to the owner.</h1>
        <p>Ask your vault owner if you need management access.</p>
        <button className="primary-button" onClick={() => navigate("/")}>
          Back to music
        </button>
      </div>
    );
  return (
    <div className="admin-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">BEHIND THE MUSIC</span>
          <h1>
            A well kept vault<span className="heading-dot">.</span>
          </h1>
          <p>Care for your collection and the people who listen.</p>
        </div>
        <button className="text-link" onClick={() => navigate("/")}>
          <ArrowLeft size={15} /> Back to music
        </button>
      </div>
      <nav className="admin-tabs" aria-label="Vault management">
        {tabs.map((item) => (
          <button
            key={item.id}
            aria-current={tab === item.id ? "page" : undefined}
            onClick={() => setTab(item.id)}
          >
            <item.icon size={16} />
            {item.name}
          </button>
        ))}
      </nav>
      <div key={tab}>
        {tab === "overview" ? (
          <AdminOverview
            onSongs={() => setTab("songs")}
            onImport={() => setTab("import")}
          />
        ) : tab === "songs" ? (
          <AdminSongs />
        ) : tab === "import" ? (
          <AdminImport />
        ) : tab === "labels" ? (
          <AdminLabels />
        ) : tab === "credits" ? (
          <AdminCredits />
        ) : tab === "users" ? (
          <AdminUsers />
        ) : (
          <AdminActivity />
        )}
      </div>
    </div>
  );
}
