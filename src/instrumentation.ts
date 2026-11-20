// Runs once when a server instance starts. In production, refuse to start
// with unsafe settings instead of failing later in confusing ways.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { enforceProductionConfig } = await import("./lib/config-check");
  enforceProductionConfig();
}
