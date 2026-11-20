// Runs once when a server instance starts. In production, refuse to start
// with unsafe settings instead of failing later in confusing ways.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { checkProductionConfig } = await import("./lib/config-check");
  const { errors, warnings } = checkProductionConfig(process.env);
  for (const w of warnings) console.warn(`[config] ${w}`);
  if (errors.length > 0) {
    for (const e of errors) console.error(`[config] ${e}`);
    throw new Error(`Wattle is misconfigured (${errors.length} problem(s)); see the messages above.`);
  }
}
