"use client";

import { useCallback, useMemo, useState } from "react";
import { CategoryRail } from "@/components/category-rail";
import { DetailPane, type PaneData, type Tab } from "@/components/detail-pane";
import { DependencyMap } from "@/components/map/map";
import { WorkspaceShell } from "@/components/workspace-shell";
import { fold } from "@/lib/graph/fold";
import type { Selection } from "@/lib/graph/highlight";
import { indexEdges, summarize } from "@/lib/graph/summary";
import type { ParseResult } from "@/parser/types";

// Owns what the map and the detail pane share: the selection, the hover and
// the open tab. Everything the pane shows is already here in the browser, so
// selecting something never goes to the network.
export function Explorer({ name, result }: { name: string; result: ParseResult }) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [hover, setHover] = useState<Selection | null>(null);
  // Lives here, not in the pane, so it survives any change of selection.
  const [tab, setTab] = useState<Tab>("structure");

  const { files, edges } = result;
  const graphFiles = useMemo(() => files.map(({ path, folder, fanIn, fanOut }) => ({ path, folder, fanIn, fanOut })), [files]);
  const graphEdges = useMemo(() => edges.map(({ from, to }) => ({ from, to })), [edges]);

  const folding = useMemo(() => fold(graphFiles), [graphFiles]);
  const data = useMemo<PaneData>(() => {
    const index = indexEdges(edges);
    return {
      name,
      adapter: result.adapter,
      files,
      byPath: new Map(files.map((f) => [f.path, f])),
      index,
      summary: summarize(files, index),
      nodeFiles: new Map(folding.nodes.map((n) => [n.id, n.files])),
    };
  }, [name, result.adapter, files, edges, folding]);

  const nodeOf = useCallback((path: string) => folding.nodeOf.get(path) ?? ".", [folding]);
  const selectPath = useCallback(
    (path: string) => setSelection({ kind: "file", path, node: nodeOf(path) }),
    [nodeOf],
  );
  const isHot = useCallback(
    (path: string) => {
      if (!hover) return false;
      return hover.kind === "file" ? hover.path === path : nodeOf(path) === hover.id;
    },
    [hover, nodeOf],
  );

  return (
    <WorkspaceShell
      rail={<CategoryRail files={files} />}
      map={
        <DependencyMap
          files={graphFiles}
          edges={graphEdges}
          selection={selection}
          onSelect={setSelection}
          hover={hover}
          onHover={setHover}
        />
      }
      detail={
        <DetailPane
          data={data}
          selection={selection}
          tab={tab}
          onTab={setTab}
          onSelectPath={selectPath}
          hover={hover}
          onHover={setHover}
          isHot={isHot}
          nodeOf={nodeOf}
        />
      }
    />
  );
}
