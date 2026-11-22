import { randomUUID } from "node:crypto";
import { db } from "@/db/client";
import { user } from "@/db/schema";

/** Creates a player who has finished setup. */
export async function makePlayer(handle = `p_${randomUUID().slice(0, 8)}`) {
  const id = randomUUID();
  await db.insert(user).values({
    id,
    name: handle,
    email: `${handle}@uwaterloo.ca`,
    emailVerified: true,
    studentEmail: `${handle}@uwaterloo.ca`,
    studentVerifiedAt: new Date(),
    university: "uwaterloo",
    handle,
    faculty: "math",
  });
  return id;
}

/** A Tuesday/Wednesday/... in a fixed past week, for scheduling tests. */
export const DATES = {
  mon: "2026-11-16",
  tue: "2026-11-17",
  wed: "2026-11-18",
  thu: "2026-11-19",
  fri: "2026-11-20",
  sat: "2026-11-21",
} as const;
