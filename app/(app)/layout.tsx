import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { BackToDashboard } from "@/components/back-to-dashboard";
import { ThemeControl } from "@/components/theme-control";

// The shell later phases render inside: a top bar, then the workspace.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-surface px-3">
        <div className="flex items-center gap-3">
          <span className="font-mono">code-tracer</span>
          <OrganizationSwitcher hidePersonal />
          <BackToDashboard />
        </div>
        <div className="flex items-center gap-3">
          <ThemeControl />
          <UserButton />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </>
  );
}
