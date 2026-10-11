import type { EdgeIndex } from "./summary";

// Blast radius and dependency chain are one walk over the edge index. Which
// way it goes is the only difference: "dependents" follows who imports a file
// (what breaks if it changes), "imports" follows what a file imports (what it
// needs).
export type Direction = "dependents" | "imports";

// Two steps is the useful range; further out the walk returns most of a
// repository and stops being an answer.
export const DEFAULT_DEPTH = 2;

export interface Reached {
  path: string;
  /** Fewest imports between `start` and this file. */
  distance: number;
}

// Breadth-first, so each file is reported once at its shortest distance. The
// start file is never in the result, even when a cycle leads back to it.
export function reach(
  index: EdgeIndex,
  start: string,
  direction: Direction,
  depth: number = DEFAULT_DEPTH,
): Reached[] {
  const next = direction === "dependents" ? index.dependents : index.imports;
  const seen = new Set<string>([start]);
  const out: Reached[] = [];
  let frontier = [start];
  for (let distance = 1; distance <= depth && frontier.length > 0; distance++) {
    const following: string[] = [];
    for (const p of frontier) {
      for (const n of next.get(p) ?? []) {
        if (seen.has(n)) continue;
        seen.add(n);
        out.push({ path: n, distance });
        following.push(n);
      }
    }
    frontier = following;
  }
  return out;
}
