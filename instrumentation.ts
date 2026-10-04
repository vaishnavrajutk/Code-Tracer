// Importing env here makes a missing variable crash on boot, not on first use.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/env");
  }
}
