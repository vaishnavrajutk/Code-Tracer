import { auth } from "@clerk/nextjs/server";

export default async function Home() {
  // Read from the session token during server rendering, no client round trip.
  const { orgId, orgRole } = await auth();
  return (
    <div className="p-3 font-mono text-xs">
      <div>
        <span className="text-muted">org </span>
        {orgId}
      </div>
      <div>
        <span className="text-muted">role </span>
        {orgRole}
      </div>
    </div>
  );
}
