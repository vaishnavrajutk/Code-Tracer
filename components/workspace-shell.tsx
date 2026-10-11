import type { ReactNode } from "react";

// The three columns, fixed here and not rearranged by later phases: they fill
// the slots, they don't move them. The detail pane is a column, never an
// overlay. 2.25rem is the top bar's height from the app layout.
export function WorkspaceShell({
  rail,
  map,
  detail,
}: {
  rail: ReactNode;
  map: ReactNode;
  detail: ReactNode;
}) {
  return (
    <div className="grid h-[calc(100dvh-2.25rem)] grid-cols-[12rem_minmax(0,1fr)_20rem]">
      <aside aria-label="Categories" className="overflow-y-auto border-r border-border bg-surface">
        {rail}
      </aside>
      <section aria-label="Map" className="relative min-w-0 overflow-hidden">
        {map}
      </section>
      <aside aria-label="Detail" className="overflow-y-auto border-l border-border bg-surface">
        {detail}
      </aside>
    </div>
  );
}
