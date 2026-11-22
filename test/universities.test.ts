import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { play, user } from "@/db/schema";
import { emailProblem } from "@/lib/auth-policy";
import { UNIVERSITIES, enabledUniversities, isFaculty, universityForEmail } from "@/lib/universities";

const sent: { to: string; subject: string }[] = [];
vi.mock("@/lib/email", () => ({
  EmailNotConfiguredError: class extends Error {},
  consoleEmailAllowed: () => false,
  emailConfigured: () => true,
  sendEmail: async (mail: { to: string; subject: string }) => {
    sent.push(mail);
  },
}));

afterEach(() => vi.unstubAllEnvs());

describe("university list", () => {
  it("has unique ids, domains and faculty ids", () => {
    const ids = UNIVERSITIES.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
    const domains = UNIVERSITIES.flatMap((u) => u.domains);
    expect(new Set(domains).size).toBe(domains.length);
    for (const u of UNIVERSITIES) {
      const f = u.faculties.map((x) => x.id);
      expect(new Set(f).size, u.id).toBe(f.length);
      expect(f.length, u.id).toBeGreaterThan(0);
    }
  });

  it("maps student email domains to universities exactly", () => {
    expect(universityForEmail("a@uwaterloo.ca")?.id).toBe("uwaterloo");
    expect(universityForEmail("A@Mail.UToronto.ca")?.id).toBe("utoronto");
    expect(universityForEmail("a@student.ubc.ca")?.id).toBe("ubc");
    expect(universityForEmail("a@utoronto.ca")).toBeUndefined(); // staff domain, not student
    expect(universityForEmail("a@evil-uwaterloo.ca")).toBeUndefined();
    expect(universityForEmail("a@uwaterloo.ca.evil.com")).toBeUndefined();
    expect(emailProblem("a@queensu.ca")).toBeNull();
    expect(emailProblem("a@gmail.com")).toMatch(/participating university/);
  });

  it("can launch with only some universities", () => {
    vi.stubEnv("ENABLED_UNIVERSITIES", "uwaterloo, ubc");
    expect(enabledUniversities().map((u) => u.id)).toEqual(["uwaterloo", "ubc"]);
    expect(universityForEmail("a@mcmaster.ca")).toBeUndefined();
    expect(emailProblem("a@mcmaster.ca")).not.toBeNull();
  });

  it("checks faculties against the player's own university", () => {
    expect(isFaculty("uwaterloo", "math")).toBe(true);
    expect(isFaculty("utoronto", "math")).toBe(false);
    expect(isFaculty(null, "math")).toBe(false);
  });
});

describe("verification sets the university", () => {
  it("from the verified student email", async () => {
    const { startStudentVerification, finishStudentVerification } = await import("@/lib/student");
    const id = randomUUID();
    await db.insert(user).values({ id, name: "x", email: `${id}@gmail.com`, emailVerified: true });
    const email = `s${Date.now()}@student.ubc.ca`;
    await startStudentVerification(id, email);
    await finishStudentVerification(id, sent.at(-1)!.subject.slice(0, 6));
    const row = await db.query.user.findFirst({ where: eq(user.id, id) });
    expect(row).toMatchObject({ studentEmail: email, university: "ubc" });
  });
});

describe("faculty standings", () => {
  it("only count players from that university", async () => {
    const { facultyBoard } = await import("@/engine/leaderboard");
    const date = "2031-03-03"; // a Monday no other test uses
    const mk = async (university: string, faculty: string, score: number) => {
      const id = randomUUID();
      await db.insert(user).values({
        id, name: id, email: `${id}@x.ca`, emailVerified: true,
        studentEmail: `${id}@x.ca`, university, faculty, handle: `h${id.slice(0, 8)}`,
      });
      await db.insert(play).values({
        id: randomUUID(), userId: id, date, gameId: "deepcut", status: "done",
        state: {}, rawScore: score, startedAt: new Date(), finishedAt: new Date(),
      });
    };
    await mk("uwaterloo", "eng", 10);
    await mk("ubc", "sci", 20);

    const waterloo = await facultyBoard({ from: date, to: date }, "uwaterloo");
    expect(waterloo.map((r) => r.faculty)).toEqual(expect.arrayContaining(["eng", "math"]));
    expect(waterloo.find((r) => r.faculty === "eng")?.players).toBe(1);
    expect(waterloo.some((r) => r.faculty === "apsc")).toBe(false);

    const ubc = await facultyBoard({ from: date, to: date }, "ubc");
    expect(ubc.find((r) => r.faculty === "sci")?.players).toBe(1);
  });
});
