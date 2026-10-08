import { useState } from "react";
import { Plus } from "lucide-react";
import { labels, refreshLabels, useLibrary } from "../../data/library";
import { api } from "../../lib/api";
import type { Label } from "../../types/api";
import { useTask } from "../../hooks/useResource";
import { FormError } from "../ui/ManagementDialog";
export function TagPicker({
  kind,
  value,
  onChange,
}: {
  kind: "mood" | "genre";
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  useLibrary();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const task = useTask();
  return (
    <fieldset className="tag-picker">
      <legend>
        {kind === "mood" ? "Moods / feelings" : "Genres / styles"}
      </legend>
      <div className="tag-options">
        {labels
          .filter((l) => l.kind === kind)
          .map((l) => (
            <button
              type="button"
              key={l.id}
              aria-pressed={value.includes(l.id)}
              onClick={() =>
                onChange(
                  value.includes(l.id)
                    ? value.filter((id) => id !== l.id)
                    : [...value, l.id],
                )
              }
            >
              {l.name}
            </button>
          ))}
        <button
          type="button"
          className="new-tag"
          onClick={() => setAdding(!adding)}
        >
          <Plus size={13} /> New {kind}
        </button>
      </div>
      {adding && (
        <div className="inline-form">
          <input
            aria-label={`New ${kind} name`}
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === "mood" ? "e.g. Road trip" : "e.g. Acoustic"}
          />
          <button
            type="button"
            className="secondary-button"
            disabled={task.busy || !name.trim()}
            onClick={() => {
              void task.run(async () => {
                const label = await api<Label>("/admin/labels", {
                  method: "POST",
                  json: { kind, name },
                });
                await refreshLabels();
                onChange([...value, label.id]);
                setName("");
                setAdding(false);
              });
            }}
          >
            Add
          </button>
        </div>
      )}
      <FormError message={task.error} />
    </fieldset>
  );
}
