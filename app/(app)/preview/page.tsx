import { Explorer } from "@/components/explorer";
import { fixture } from "@/lib/fixture";

// Scaffolding route, reading the checked-in parse output.
export default function Preview() {
  return <Explorer name="excalidraw/excalidraw" result={fixture} />;
}
