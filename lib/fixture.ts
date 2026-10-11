import { validateParseResult } from "@/parser/validate";
import raw from "@/data/fixtures/excalidraw.json";

// Scaffolding for phase 4: `pnpm parse` output for excalidraw/excalidraw at
// ed10ac7 (703 source files, 98 folders), unmodified. Removed once analyses
// are stored. Validated on load so a stale file fails loudly, not quietly.
export const fixture = validateParseResult(raw);
