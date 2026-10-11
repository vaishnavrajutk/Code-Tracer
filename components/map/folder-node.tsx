"use client";

import { Handle, Position, useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react";
import { useEffect } from "react";
import type { Selection } from "@/lib/graph/highlight";
import { ABOVE, BELOW, HEADER_H, ROW_H, type DisplayNode } from "@/lib/graph/layout";

export interface FolderData extends Record<string, unknown> {
  node: DisplayNode;
  /** Null when nothing is selected; otherwise which parts stay at full strength. */
  lit: { node: boolean; rows: ReadonlySet<string>; selectedPath: string | null } | null;
  selected: boolean;
  /** Hovered here or in the detail pane; a light touch, nothing dims. */
  hot: boolean;
  hotPath: string | null;
  onHover: (s: Selection | null) => void;
  onToggle: (id: string) => void;
  onSelectFile: (path: string, node: string) => void;
  onWindow: (id: string, firstRow: number) => void;
}
export type FolderFlowNode = Node<FolderData, "folder">;

// React Flow turns pointer events off on every node when nothing on the canvas
// is draggable or selectable (we do selection ourselves), which would swallow
// every click below. Turned back on at each node's root.
const interactive = "pointer-events-auto";

// Green in, amber out: the same two colours the edges use for direction.
function Counts({ fanIn, fanOut }: { fanIn: number; fanOut: number }) {
  return (
    <span className="tabular-nums">
      <span className="text-incoming">in {fanIn}</span> <span className="text-outgoing">out {fanOut}</span>
    </span>
  );
}

// Handles are invisible: an edge is the only thing that shows a connection.
const handleCls = "!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent";

export function FolderNode({ id, data }: NodeProps<FolderFlowNode>) {
  const { node, lit, selected, hot, hotPath, onHover, onToggle, onSelectFile, onWindow } = data;
  const update = useUpdateNodeInternals();
  // Rows come and go with the open state; tell React Flow to re-measure handles.
  useEffect(() => update(id), [id, node.open, node.rows.length, node.window, update]);

  const shown = node.rows.length - node.hiddenRows;
  const dim = lit && !lit.node ? "opacity-25" : "";
  const ring = selected ? "border-accent" : hot ? "border-muted" : "border-border";
  const hoverNode = { onMouseEnter: () => onHover({ kind: "node", id: node.id }), onMouseLeave: () => onHover(null) };

  if (!node.open) {
    return (
      <button
        type="button"
        onClick={() => onToggle(node.id)}
        {...hoverNode}
        style={{ width: node.width, height: node.height }}
        className={`${interactive} relative flex flex-col justify-center border bg-surface px-2 text-left text-xs hover:border-muted ${ring} ${dim}`}
      >
        <Handle id="in" type="target" position={Position.Left} className={handleCls} />
        <span className="truncate font-mono">{node.label}</span>
        <span className="tabular-nums text-muted">{node.fileCount} files</span>
        <Counts fanIn={node.fanIn} fanOut={node.fanOut} />
        <Handle id="out" type="source" position={Position.Right} className={handleCls} />
      </button>
    );
  }

  return (
    <div
      style={{ width: node.width, height: node.height }}
      className={`${interactive} relative border bg-surface text-xs ${ring} ${dim}`}
    >
      <button
        type="button"
        onClick={() => onToggle(node.id)}
        {...hoverNode}
        style={{ height: HEADER_H }}
        className="flex w-full flex-col justify-center border-b border-border px-2 text-left hover:bg-background"
      >
        <span className="truncate font-mono">{node.label}</span>
        <span className="flex gap-2 tabular-nums">
          <span className="text-muted">{node.fileCount} files</span>
          <Counts fanIn={node.fanIn} fanOut={node.fanOut} />
        </span>
      </button>
      <div
        // nowheel: scrolling the list must not zoom the canvas under it.
        className="nowheel nopan overflow-y-auto"
        style={{ height: shown * ROW_H }}
        onScroll={(e) => onWindow(node.id, Math.round(e.currentTarget.scrollTop / ROW_H))}
      >
        {node.rows.map((r) => {
          const isSel = lit?.selectedPath === r.path;
          const rowDim = lit && !lit.rows.has(r.path) ? "text-muted" : "";
          return (
            <button
              key={r.path}
              type="button"
              title={r.path}
              onClick={() => onSelectFile(r.path, node.id)}
              onMouseEnter={() => onHover({ kind: "file", path: r.path, node: node.id })}
              onMouseLeave={() => onHover(null)}
              style={{ height: ROW_H }}
              className={`relative flex w-full items-center justify-between gap-2 px-2 text-left hover:bg-background ${rowDim} ${isSel ? "bg-background text-accent" : hotPath === r.path ? "bg-background" : ""}`}
            >
              <Handle id={`in:${r.path}`} type="target" position={Position.Left} className={handleCls} />
              <span className="truncate font-mono">{r.label}</span>
              <span className="shrink-0 tabular-nums">
                <span className="text-incoming">←{r.fanIn}</span> <span className="text-outgoing">{r.fanOut}→</span>
              </span>
              <Handle id={`out:${r.path}`} type="source" position={Position.Right} className={handleCls} />
            </button>
          );
        })}
      </div>
      {/* Edges to rows scrolled out of view end on the list's top or bottom edge. */}
      {node.hiddenRows > 0 && (
        <>
          {[ABOVE, BELOW].map((edge) => {
            const style = { top: HEADER_H + (edge === ABOVE ? 0 : shown * ROW_H) };
            return (
              <span key={edge}>
                <Handle id={`in:${edge}`} type="target" position={Position.Left} className={handleCls} style={style} />
                <Handle id={`out:${edge}`} type="source" position={Position.Right} className={handleCls} style={style} />
              </span>
            );
          })}
          <div style={{ height: ROW_H }} className="flex items-center px-2 text-muted">
            + {node.hiddenRows} more · scroll
          </div>
        </>
      )}
    </div>
  );
}
