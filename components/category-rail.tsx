import { extensionOf } from "@/lib/graph/summary";
import type { FileNode } from "@/parser/types";

function rank(counts: Map<string | null, number>) {
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || (a.name ?? "").localeCompare(b.name ?? ""));
}

function Section({ title, rows }: { title: string; rows: { name: string | null; count: number }[] }) {
  return (
    <section>
      <h3 className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wide text-muted">{title}</h3>
      <ul className="text-xs">
        {rows.map(({ name, count }) => (
          <li key={name ?? "unclassified"} className="flex items-center gap-2 px-3 py-1">
            <span aria-hidden className="size-2 shrink-0 bg-muted" />
            <span className="flex-1 truncate">{name ?? "unclassified"}</span>
            <span className="tabular-nums text-muted">{count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Counts come straight from each file's `kind`. Files the adapter couldn't
// classify are said to be unclassified, not folded into a guessed category.
// Unclassified is grey: colour is reserved for kinds that exist.
export function CategoryRail({ files }: { files: FileNode[] }) {
  const kinds = new Map<string | null, number>();
  const types = new Map<string | null, number>();
  for (const f of files) {
    kinds.set(f.kind, (kinds.get(f.kind) ?? 0) + 1);
    const ext = extensionOf(f.path);
    types.set(ext, (types.get(ext) ?? 0) + 1);
  }
  return (
    <>
      <Section title="Kind" rows={rank(kinds)} />
      <Section title="File type" rows={rank(types)} />
    </>
  );
}
