"use client";

import { extensionOf } from "@/lib/graph/summary";
import type { Category } from "@/lib/graph/category";
import type { FileNode } from "@/parser/types";

function rank(counts: Map<string | null, number>) {
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || (a.name ?? "").localeCompare(b.name ?? ""));
}

function Section({
  title,
  rows,
  isActive,
  onPick,
}: {
  title: string;
  rows: { name: string | null; count: number }[];
  isActive: (name: string | null) => boolean;
  onPick: (name: string | null) => void;
}) {
  return (
    <section>
      <h3 className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wide text-muted">{title}</h3>
      <ul className="text-xs">
        {rows.map(({ name, count }) => {
          const active = isActive(name);
          return (
            <li key={name ?? "unclassified"}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onPick(name)}
                className={`flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-background ${active ? "bg-background text-accent" : ""}`}
              >
                <span aria-hidden className={`size-2 shrink-0 ${active ? "bg-accent" : "bg-muted"}`} />
                <span className="flex-1 truncate">{name ?? "unclassified"}</span>
                <span className="tabular-nums text-muted">{count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Counts come straight from each file's `kind`. Files the adapter couldn't
// classify are said to be unclassified, not folded into a guessed category.
// Unclassified is grey: colour is reserved for kinds that exist. Clicking the
// active row again clears it.
export function CategoryRail({
  files,
  active,
  onPick,
}: {
  files: FileNode[];
  active: Category | null;
  onPick: (c: Category | null) => void;
}) {
  const kinds = new Map<string | null, number>();
  const types = new Map<string | null, number>();
  for (const f of files) {
    kinds.set(f.kind, (kinds.get(f.kind) ?? 0) + 1);
    const ext = extensionOf(f.path);
    types.set(ext, (types.get(ext) ?? 0) + 1);
  }
  const toggle = (next: Category) =>
    onPick(active && active.by === next.by && active.value === next.value ? null : next);
  return (
    <>
      <Section
        title="Kind"
        rows={rank(kinds)}
        isActive={(n) => active?.by === "kind" && active.value === n}
        onPick={(value) => toggle({ by: "kind", value })}
      />
      <Section
        title="File type"
        rows={rank(types)}
        isActive={(n) => active?.by === "type" && active.value === n}
        onPick={(value) => value !== null && toggle({ by: "type", value })}
      />
    </>
  );
}
