"use client";

import { useActionState } from "react";
import { analyseRepository, type FormState } from "@/app/(app)/actions";

export function AnalyseForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(analyseRepository, {
    error: null,
  });
  return (
    <form action={action} className="mb-3">
      <div className="flex gap-2">
        <input
          name="url"
          required
          placeholder="https://github.com/owner/repo"
          spellCheck={false}
          autoComplete="off"
          className="h-7 w-full max-w-md border border-border bg-surface px-2 font-mono text-xs"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-7 border border-border bg-surface px-3 text-xs disabled:text-muted"
        >
          {pending ? "Starting…" : "Analyse"}
        </button>
      </div>
      {state.error && <div className="mt-1 text-xs">{state.error}</div>}
    </form>
  );
}
