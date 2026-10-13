"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { FINAL_STAGES, type Progress, useAnalysisProgress } from "./use-analysis-progress";

const LADDER = ["queued", "fetching", "parsing", "storing", "complete"] as const;

// failedStage comes from the server render; it is null until the run has
// failed and the page has refreshed after the live event.
export function AnalysisProgress({
  id,
  initial,
  failedStage,
}: {
  id: string;
  initial: Progress;
  failedStage: string | null;
}) {
  const router = useRouter();
  const p = useAnalysisProgress(id, initial);
  const failed = p.stage === "failed";

  // A run that ends while this page is open. A failure refreshes so the
  // server-rendered parts (failed stage, Run again) catch up; a success shows
  // the completed state for a moment and then opens the map. A page opened on
  // an already finished run does neither.
  const wasFinished = FINAL_STAGES.includes(initial.stage);
  const justFailed = failed && !wasFinished;
  const justCompleted = p.stage === "complete" && !wasFinished;
  useEffect(() => {
    if (justFailed) router.refresh();
  }, [justFailed, router]);
  useEffect(() => {
    if (!justCompleted) return;
    const t = setTimeout(() => router.push(`/analyses/${id}/map`), 1500);
    return () => clearTimeout(t);
  }, [justCompleted, id, router]);

  const complete = p.stage === "complete";
  const at = failed ? -1 : LADDER.indexOf(p.stage as (typeof LADDER)[number]);

  return (
    <div className="text-xs">
      {complete && (
        <div className="mb-3 border border-border bg-surface px-3 py-2">
          <div>
            <span aria-hidden className="mr-1.5">
              ●
            </span>
            Completed
          </div>
          {p.message && <div className="mt-1 text-muted">{p.message}</div>}
          <div className="mt-1">
            <Link href={`/analyses/${id}/map`} className="underline">
              {justCompleted ? "Opening the map…" : "Open the map"}
            </Link>
          </div>
        </div>
      )}
      <ol className="mb-3 border border-border bg-surface">
        {LADDER.map((s, i) => {
          const done = i < at || (s === "complete" && at === i);
          const current = i === at && s !== "complete";
          const mark = done ? "●" : current ? "◐" : "○";
          return (
            <li
              key={s}
              className={`flex gap-2 border-b border-border px-3 py-1.5 last:border-b-0 ${done || current ? "" : "text-muted"}`}
            >
              <span aria-hidden className="w-3">
                {mark}
              </span>
              {s}
            </li>
          );
        })}
      </ol>
      {failed ? (
        <div className="border border-border bg-surface px-3 py-2">
          <div>Failed{failedStage ? ` while ${failedStage}` : ""}</div>
          {p.message && <div className="mt-1 text-muted">{p.message}</div>}
        </div>
      ) : (
        !complete && p.message && <div className="text-muted">{p.message}</div>
      )}
    </div>
  );
}
