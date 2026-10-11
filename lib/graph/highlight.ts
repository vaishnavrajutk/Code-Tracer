import type { DisplayEdge } from "./layout";

export type Selection =
  | { kind: "node"; id: string }
  | { kind: "file"; path: string; node: string };

export interface Highlight {
  nodes: Set<string>;
  rows: Set<string>;
  /** Edge id -> direction relative to the selection. */
  edges: Map<string, "in" | "out">;
}

// The selection, its edges, and whatever those edges connect to. Everything
// else is outside the result and gets dimmed.
export function highlight(edges: DisplayEdge[], sel: Selection): Highlight {
  const out: Highlight = {
    nodes: new Set([sel.kind === "node" ? sel.id : sel.node]),
    rows: new Set(sel.kind === "file" ? [sel.path] : []),
    edges: new Map(),
  };
  for (const e of edges) {
    const incoming = sel.kind === "node" ? e.target === sel.id : e.targetFiles.includes(sel.path);
    const outgoing = sel.kind === "node" ? e.source === sel.id : e.sourceFiles.includes(sel.path);
    if (!incoming && !outgoing) continue;
    out.edges.set(e.id, incoming ? "in" : "out");
    out.nodes.add(e.source).add(e.target);
    if (e.sourceRow) out.rows.add(e.sourceRow);
    if (e.targetRow) out.rows.add(e.targetRow);
  }
  return out;
}
