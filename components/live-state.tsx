"use client";

import { type Progress, useAnalysisProgress } from "./use-analysis-progress";

// Shape, not colour: an open ring waits, a half is in progress, a dot is
// finished, a cross failed.
function glyph(stage: string): string {
  if (stage === "queued") return "○";
  if (stage === "complete") return "●";
  if (stage === "failed") return "✕";
  return "◐";
}

export function LiveState({ id, initial }: { id: string; initial: Progress }) {
  const p = useAnalysisProgress(id, initial);
  const strong = p.stage === "complete" || p.stage === "failed";
  return (
    <div>
      <div className={strong ? "" : "text-muted"}>
        <span aria-hidden className="mr-1.5 inline-block w-3">
          {glyph(p.stage)}
        </span>
        {p.stage}
      </div>
      {p.message && <div className="pl-[1.125rem] text-muted">{p.message}</div>}
    </div>
  );
}
