// Pure arithmetic over a file list and an edge list.
export interface FanCounts {
  fanIn: number;
  fanOut: number;
}

// Duplicates are removed first: an import and a re-export of the same file, or
// two imports of it, are one connection for fan purposes.
export function computeFan(
  files: readonly string[],
  edges: readonly { from: string; to: string }[],
): Map<string, FanCounts> {
  const importers = new Map<string, Set<string>>();
  const imported = new Map<string, Set<string>>();
  for (const f of files) {
    importers.set(f, new Set());
    imported.set(f, new Set());
  }
  for (const e of edges) {
    importers.get(e.to)?.add(e.from);
    imported.get(e.from)?.add(e.to);
  }
  const out = new Map<string, FanCounts>();
  for (const f of files) {
    out.set(f, {
      fanIn: importers.get(f)?.size ?? 0,
      fanOut: imported.get(f)?.size ?? 0,
    });
  }
  return out;
}
