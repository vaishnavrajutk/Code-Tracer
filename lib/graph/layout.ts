import dagre from "@dagrejs/dagre";
import { fold, shortLabels } from "./fold";

// Everything the canvas draws is derived here from the parser's files and
// edges, untouched. Pure: same input and same open set give the same picture.

export interface GraphFile {
  path: string;
  folder: string;
  fanIn: number;
  fanOut: number;
}
export interface GraphEdge {
  from: string;
  to: string;
}

export interface DisplayRow {
  path: string;
  /** Path relative to the folder the row sits in. */
  label: string;
  fanIn: number;
  fanOut: number;
}

export interface DisplayNode {
  id: string;
  label: string;
  fileCount: number;
  /** Distinct files outside this node that import something inside it, and
   *  distinct files outside that something inside imports. */
  fanIn: number;
  fanOut: number;
  open: boolean;
  rows: DisplayRow[];
  /** Rows past the visible height, reached by scrolling. */
  hiddenRows: number;
  /** Index of the first row in view. Edges to rows outside the window end on
   *  the panel's top or bottom edge rather than somewhere off the box. */
  window: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** `sourceRow`/`targetRow` is a file path when that end lands on a row in view,
 *  ABOVE or BELOW when the row is scrolled out of view, null when the node is
 *  folded. `sourceFiles`/`targetFiles` keep which files each end stands for,
 *  so selecting a file still finds its edges when its row is scrolled away. */
export const ABOVE = "__above";
export const BELOW = "__below";
export interface DisplayEdge {
  id: string;
  source: string;
  sourceRow: string | null;
  sourceFiles: string[];
  target: string;
  targetRow: string | null;
  targetFiles: string[];
}

export interface Layout {
  threshold: number;
  nodes: DisplayNode[];
  edges: DisplayEdge[];
}

export const ROW_CAP = 14;
export const HEADER_H = 40;
export const ROW_H = 20;
const CHAR_W = 7; // monospace at the type size used on nodes
const MIN_W = 96; // fits "in 99 out 99" under the label

export function layoutGraph(
  files: GraphFile[],
  edges: GraphEdge[],
  open: ReadonlySet<string>,
  windows: ReadonlyMap<string, number> = new Map(),
): Layout {
  const folding = fold(files);
  const { nodeOf } = folding;
  const byPath = new Map(files.map((f) => [f.path, f]));
  const labels = shortLabels(folding.nodes.map((n) => n.id));

  const fanIn = new Map<string, Set<string>>();
  const fanOut = new Map<string, Set<string>>();
  for (const e of edges) {
    const a = nodeOf.get(e.from);
    const b = nodeOf.get(e.to);
    if (a === undefined || b === undefined || a === b) continue;
    (fanIn.get(b) ?? fanIn.set(b, new Set()).get(b)!).add(e.from);
    (fanOut.get(a) ?? fanOut.set(a, new Set()).get(a)!).add(e.to);
  }
  const maxFanIn = Math.max(1, ...folding.nodes.map((n) => fanIn.get(n.id)?.size ?? 0));

  const nodes: DisplayNode[] = folding.nodes.map((n) => {
    const label = labels.get(n.id) ?? n.id;
    const nodeFanIn = fanIn.get(n.id)?.size ?? 0;
    const isOpen = open.has(n.id);
    const prefix = n.id === "." ? "" : `${n.id}/`;
    const sorted = [...n.files].sort(
      (p, q) => (byPath.get(q)?.fanIn ?? 0) - (byPath.get(p)?.fanIn ?? 0) || p.localeCompare(q),
    );
    const rows = isOpen
      ? sorted.map((p) => ({
          path: p,
          label: p.startsWith(prefix) ? p.slice(prefix.length) : p,
          fanIn: byPath.get(p)?.fanIn ?? 0,
          fanOut: byPath.get(p)?.fanOut ?? 0,
        }))
      : [];
    const shown = Math.min(ROW_CAP, rows.length);
    const hiddenRows = rows.length - shown;
    const window = Math.min(Math.max(0, windows.get(n.id) ?? 0), hiddenRows);

    let width = Math.max(MIN_W, label.length * CHAR_W + 28);
    let height: number;
    if (isOpen) {
      // A panel is sized by what it holds; fan-in height applies to folded nodes.
      const widest = Math.max(label.length + 12, ...rows.map((r) => r.label.length + 13));
      width = Math.max(width, widest * CHAR_W + 24);
      height = HEADER_H + (shown + (hiddenRows > 0 ? 1 : 0)) * ROW_H + 6;
    } else {
      // Height carries fan-in; square root so one hub doesn't flatten the rest.
      height = 52 + Math.round(110 * Math.sqrt(nodeFanIn / maxFanIn));
    }
    return {
      id: n.id,
      label,
      fileCount: n.files.length,
      fanIn: nodeFanIn,
      fanOut: fanOut.get(n.id)?.size ?? 0,
      open: isOpen,
      rows,
      hiddenRows,
      window,
      x: 0,
      y: 0,
      width,
      height,
    };
  });
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Where an edge lands: its row if that row is in view, the panel's top or
  // bottom edge if it is scrolled out, the node itself if folded.
  const rowIndex = new Map<string, number>();
  for (const n of nodes) n.rows.forEach((r, i) => rowIndex.set(r.path, i));
  const endpoint = (path: string, nodeId: string): string | null => {
    const n = nodeById.get(nodeId);
    if (!n || !n.open) return null;
    const i = rowIndex.get(path) ?? 0;
    const shown = n.rows.length - n.hiddenRows;
    return i < n.window ? ABOVE : i >= n.window + shown ? BELOW : path;
  };
  const seen = new Map<string, DisplayEdge>();
  for (const e of edges) {
    const source = nodeOf.get(e.from);
    const target = nodeOf.get(e.to);
    if (source === undefined || target === undefined || source === target) continue;
    const sourceRow = endpoint(e.from, source);
    const targetRow = endpoint(e.to, target);
    const id = `${source}|${sourceRow ?? ""}>${target}|${targetRow ?? ""}`;
    const edge = seen.get(id) ?? { id, source, sourceRow, sourceFiles: [], target, targetRow, targetFiles: [] };
    seen.set(id, edge);
    if (!edge.sourceFiles.includes(e.from)) edge.sourceFiles.push(e.from);
    if (!edge.targetFiles.includes(e.to)) edge.targetFiles.push(e.to);
  }
  const displayEdges = [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));

  // Positions come from node-to-node structure only; rows ride inside panels.
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 28, ranksep: 110, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: n.width, height: n.height });
  const pairs = new Set(displayEdges.map((e) => `${e.source}\u0001${e.target}`));
  for (const p of [...pairs].sort()) {
    const [s, t] = p.split("\u0001");
    g.setEdge(s, t);
  }
  dagre.layout(g);
  for (const n of nodes) {
    const p = g.node(n.id);
    n.x = Math.round(p.x - n.width / 2);
    n.y = Math.round(p.y - n.height / 2);
  }

  return { threshold: folding.threshold, nodes, edges: displayEdges };
}
