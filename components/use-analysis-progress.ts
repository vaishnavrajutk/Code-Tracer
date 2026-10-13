"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/browser";

export interface Progress {
  stage: string;
  message: string | null;
}

export const FINAL_STAGES = ["complete", "failed"];

function readProgress(v: unknown): Progress | null {
  if (typeof v !== "object" || v === null) return null;
  const { stage, message } = v as Record<string, unknown>;
  if (typeof stage !== "string") return null;
  return { stage, message: typeof message === "string" ? message : null };
}

// Subscribes to one analysis's channel while it is unfinished. The database
// publishes on every stage change; nothing here polls. One read after the
// subscription is open covers a change that landed between the page render and
// the socket connecting.
export function useAnalysisProgress(id: string, initial: Progress): Progress {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const [live, setLive] = useState<Progress | null>(null);
  const finished = FINAL_STAGES.includes(initial.stage);

  // Kept in a ref so a new getToken identity doesn't tear down the socket.
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    if (finished) return;
    const client = createBrowserClient(async () => (await getTokenRef.current()) ?? null);
    const channel = client
      .channel(`analysis:${id}`, { config: { private: true } })
      .on("broadcast", { event: "stage" }, ({ payload }) => {
        const next = readProgress(payload);
        if (next) setLive(next);
      })
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        const { data } = await client
          .from("analyses")
          .select("stage, message, error")
          .eq("id", id)
          .maybeSingle();
        if (!data) return;
        const next = readProgress({
          stage: data.stage,
          message: data.stage === "failed" ? data.error : data.message,
        });
        if (next) setLive(next);
      });
    return () => {
      void client.removeChannel(channel);
    };
  }, [id, finished]);

  return live ?? initial;
}
