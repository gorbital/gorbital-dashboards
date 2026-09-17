"use client";

import { useState } from "react";
import { Bookmark, BookmarkPlus, Check, Trash2 } from "lucide-react";
import { Button } from "@gorbital/dash/components/button";
import { Dialog } from "@gorbital/dash/components/dialog";
import { Dropdown, type DropdownItem } from "@gorbital/dash/components/dropdown";
import { Field, Input } from "@gorbital/dash/components/input";
import { Empty } from "@gorbital/dash/components/panel";
import { useDeleteFilter, useSaveFilter, useSavedFilters, type SavedFilter } from "@/lib/api/logs";
import { describeFilters, filtersEqual, filtersFromJSON, type LogFilters } from "@/lib/logs/filters";
import { when } from "@/lib/time";

const namePattern = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,59}$/;

type Props = {
  filters: LogFilters;
  enabled: boolean;
  onApply: (next: LogFilters) => void;
};

/** The saved filters as a menu (apply one, save the current ones) and a dialog to name, replace and delete them. */
export function SavedFiltersMenu({ filters, enabled, onApply }: Props) {
  const saved = useSavedFilters(enabled);
  const save = useSaveFilter();
  const del = useDeleteFilter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const list = saved.data ?? [];
  const current = list.find((f) => filtersEqual(filtersFromJSON(f.query), filters));

  const items: DropdownItem[] = [
    ...list.map((f) => ({ label: f.name, icon: <Bookmark size={12} />, checked: current?.name === f.name, onSelect: () => onApply(filtersFromJSON(f.query)) })),
    ...(list.length ? ["separator" as const] : []),
    { label: "Save current filters…", icon: <BookmarkPlus size={12} />, onSelect: () => setOpen(true) },
    { label: "Manage saved filters…", disabled: list.length === 0, onSelect: () => setOpen(true) },
  ];

  const submit = () => {
    const n = name.trim();
    if (!namePattern.test(n)) return;
    save.mutate({ name: n, query: filters }, { onSuccess: () => setName("") });
  };

  return (
    <>
      <Dropdown
        trigger={
          <Button size="sm" kind="ghost" icon={<Bookmark size={11} />} disabled={!enabled}>
            {current ? current.name : "Saved filters"}
            {list.length > 0 && !current && <span className="font-mono text-[11px] text-dim">{list.length}</span>}
          </Button>
        }
        items={items}
        label="Saved filters"
      />
      <Dialog open={open} onOpenChange={setOpen} title="Saved filters" description=".orb/portal/log-filters.json, in the app; a name that exists is replaced." size="md">
        <div className="grid gap-4 pb-1">
          <form
            className="grid grid-cols-[1fr_auto] items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Field label="Save the current filters as" htmlFor="filter-name" hint={describeFilters(filters).join(" · ")} error={name && !namePattern.test(name.trim()) ? "1 to 60 letters, digits, spaces, dots, hyphens or underscores" : undefined}>
              <Input id="filter-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Slow 5xx on /v1" autoFocus autoComplete="off" />
            </Field>
            <Button type="submit" size="md" kind="primary" icon={<BookmarkPlus size={12} />} loading={save.isPending} disabled={!namePattern.test(name.trim())}>
              Save
            </Button>
          </form>
          {list.length === 0 ? (
            <Empty title="No saved filters yet" hint="Name the current filters above; they show in the menu on every visit." />
          ) : (
            <ul className="divide-y divide-hairline rounded-lg border border-hairline">
              {list.map((f: SavedFilter) => (
                <li key={f.name} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[12px] font-medium">
                      {f.name}
                      {current?.name === f.name && <Check size={11} className="text-primary" />}
                    </div>
                    <div className="truncate font-mono text-[11px] text-dim">
                      {describeFilters(filtersFromJSON(f.query)).join(" · ")} · saved {when(f.saved)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    kind="secondary"
                    onClick={() => {
                      onApply(filtersFromJSON(f.query));
                      setOpen(false);
                    }}
                  >
                    Apply
                  </Button>
                  <Button size="sm" kind="ghost" icon={<Trash2 size={11} />} aria-label={`Delete ${f.name}`} onClick={() => del.mutate(f.name)} loading={del.isPending && del.variables === f.name}>
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>
    </>
  );
}
