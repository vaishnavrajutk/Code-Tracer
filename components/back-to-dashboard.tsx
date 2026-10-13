"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// In the top bar so it is there on the map, which fills the screen below it.
// Hidden on the dashboard itself, where it would point at the page you're on.
export function BackToDashboard() {
  if (usePathname() === "/") return null;
  return (
    <Link href="/" className="text-xs text-muted hover:text-foreground">
      ← All analyses
    </Link>
  );
}
