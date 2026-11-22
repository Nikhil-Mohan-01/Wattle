import "server-only";
import { GameError } from "./engine";
import { getCurrentUser, isPlayer, type Player } from "@/lib/session";
import { allow } from "@/lib/rate-limit";

export type { Player };

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const expected = process.env.BETTER_AUTH_URL;
  if (expected) return origin === new URL(expected).origin;
  return origin === new URL(req.url).origin;
}

/**
 * Shared wrapper for game API routes: requires a signed-in player who has
 * finished setup, blocks cross-site POSTs, rate-limits per player, and turns
 * GameErrors into JSON responses.
 */
export async function handleGameRequest(
  req: Request,
  fn: (player: Player) => Promise<unknown>,
): Promise<Response> {
  if (req.method !== "GET" && !sameOrigin(req)) {
    return json({ error: "forbidden", message: "Cross-site request blocked." }, 403);
  }
  const user = await getCurrentUser();
  if (!user) return json({ error: "unauthorized", message: "Sign in to play." }, 401);
  if (!isPlayer(user)) {
    return json({ error: "setup_required", message: "Verify your student email and finish setup first." }, 403);
  }
  if (!(await allow(`game:${user.id}`, 60, 10))) {
    return json({ error: "rate_limited", message: "Slow down a little." }, 429);
  }
  try {
    return json(await fn(user));
  } catch (err) {
    if (err instanceof GameError) return json({ error: err.code, message: err.message }, err.status);
    console.error(err);
    return json({ error: "server_error", message: "Something went wrong." }, 500);
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
