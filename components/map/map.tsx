"use client";

import {
  Background,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  getViewportForBounds,
  useReactFlow,
  useStore,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useMemo, useState } from "react";
import { highlight, type Selection } from "@/lib/graph/highlight";
import { layoutGraph, type GraphEdge, type GraphFile, type Layout } from "@/lib/graph/layout";
import { FolderNode, type FolderFlowNode } from "./folder-node";

const nodeTypes = { folder: FolderNode };
const PADDING = 0.08;
const MIN_ZOOM = 0.1;

// Zoom is only ever allowed to go out when a panel opens. Fitting against the
// layout we just computed (not the one on screen) is what keeps the refit from
// reading the state from before the click.
function useRefit() {
  const rf = useReactFlow();
  const size = useStore((s) => ({ w: s.width, h: s.height }), (a, b) => a.w === b.w && a.h === b.h);
  return useCallback(
    (next: Layout, openedId: string) => {
      const opened = next.nodes.find((n) => n.id === openedId);
      if (!opened || size.w === 0) return;
      const vp = rf.getViewport();
      const view = { x: -vp.x / vp.zoom, y: -vp.y / vp.zoom, w: size.w / vp.zoom, h: size.h / vp.zoom };
      const inside =
        opened.x >= view.x &&
        opened.y >= view.y &&
        opened.x + opened.width <= view.x + view.w &&
        opened.y + opened.height <= view.y + view.h;
      if (inside) return;
      const x0 = Math.min(...next.nodes.map((n) => n.x));
      const y0 = Math.min(...next.nodes.map((n) => n.y));
      const x1 = Math.max(...next.nodes.map((n) => n.x + n.width));
      const y1 = Math.max(...next.nodes.map((n) => n.y + n.height));
      // maxZoom is the current zoom, so the fit can shrink but never magnify.
      void rf.setViewport(
        getViewportForBounds({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, size.w, size.h, MIN_ZOOM, vp.zoom, PADDING),
      );
    },
    [rf, size],
  );
}

interface MapProps {
  files: GraphFile[];
  edges: GraphEdge[];
  // Selection and hover live above the map so the detail pane shares them.
  selection: Selection | null;
  onSelect: (s: Selection | null) => void;
  hover: Selection | null;
  onHover: (s: Selection | null) => void;
}

function MapInner({ files, edges, selection, onSelect, hover, onHover }: MapProps) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  // First row in view per open panel; only edge endpoints depend on it.
  const [windows, setWindows] = useState<ReadonlyMap<string, number>>(new Map());
  const refit = useRefit();

  const layout = useMemo(() => layoutGraph(files, edges, open, windows), [files, edges, open, windows]);

  // Opening or closing selects the folder too, so its edges light up at once.
  // Closing a panel that holds the selected file moves the selection to the
  // folder, since the row it pointed at is gone.
  const toggle = useCallback(
    (id: string) => {
      const next = new Set(open);
      const opening = !next.delete(id);
      if (opening) next.add(id);
      setOpen(next);
      // A panel reopens scrolled to the top.
      setWindows((w) => (w.has(id) ? new Map([...w].filter(([k]) => k !== id)) : w));
      onSelect({ kind: "node", id });
      if (opening) refit(layoutGraph(files, edges, next, windows), id);
    },
    [open, windows, files, edges, refit, onSelect],
  );
  const setWindow = useCallback(
    (id: string, first: number) =>
      setWindows((w) => (w.get(id) === first ? w : new Map(w).set(id, first))),
    [],
  );
  const selectFile = useCallback((path: string, node: string) => onSelect({ kind: "file", path, node }), [onSelect]);

  const lit = useMemo(() => (selection ? highlight(layout.edges, selection) : null), [layout, selection]);

  const nodes = useMemo<FolderFlowNode[]>(
    () =>
      layout.nodes.map((n) => ({
        id: n.id,
        type: "folder",
        position: { x: n.x, y: n.y },
        width: n.width,
        height: n.height,
        data: {
          node: n,
          lit: lit
            ? {
                node: lit.nodes.has(n.id),
                rows: lit.rows,
                selectedPath: selection?.kind === "file" ? selection.path : null,
              }
            : null,
          // A selected file in a folded node can't show a row, so its node is ringed.
          selected:
            (selection?.kind === "node" && selection.id === n.id) ||
            (selection?.kind === "file" && selection.node === n.id && !n.open),
          hot: hover ? (hover.kind === "node" ? hover.id : hover.node) === n.id : false,
          hotPath: hover?.kind === "file" ? hover.path : null,
          onHover,
          onToggle: toggle,
          onSelectFile: selectFile,
          onWindow: setWindow,
        },
      })),
    [layout, lit, selection, hover, toggle, selectFile, setWindow, onHover],
  );

  const flowEdges = useMemo<Edge[]>(
    () =>
      layout.edges.map((e) => {
        const dir = lit?.edges.get(e.id);
        // Colour is direction, and only relative to something selected.
        const color = dir === "in" ? "var(--incoming)" : dir === "out" ? "var(--outgoing)" : "var(--muted)";
        const faded = lit !== null && dir === undefined;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceRow === null ? "out" : `out:${e.sourceRow}`,
          targetHandle: e.targetRow === null ? "in" : `in:${e.targetRow}`,
          style: { stroke: color, strokeWidth: 1, opacity: faded ? 0.1 : dir ? 1 : 0.45 },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 12, height: 12 },
        };
      }),
    [layout, lit],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      onPaneClick={() => onSelect(null)}
      minZoom={MIN_ZOOM}
      maxZoom={2}
      fitView
      fitViewOptions={{ padding: PADDING, maxZoom: 1 }}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={24} color="var(--border)" />
    </ReactFlow>
  );
}

export function DependencyMap(props: MapProps) {
  return (
    <ReactFlowProvider>
      <MapInner {...props} />
    </ReactFlowProvider>
  );
}
