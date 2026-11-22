import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { studentCode, user } from "@/db/schema";

const sent: { to: string; subject: string }[] = [];
vi.mock("@/lib/email", () => ({
  EmailNotConfiguredError: class extends Error {},
  consoleEmailAllowed: () => false,
  emailConfigured: () => true,
  sendEmail: async (mail: { to: string; subject: string }) => {
    sent.push(mail);
  },
}));

const { finishStudentVerification, startStudentVerification } = await import("@/lib/student");

/** A user who signed in with Google/Microsoft and has no student email yet. */
async function makeSocialUser() {
  const id = randomUUID();
  await db.insert(user).values({ id, name: "x", email: `${id}@gmail.com`, emailVerified: true });
  return id;
}
const lastCode = () => sent.at(-1)!.subject.slice(0, 6);
let n = 0;
const studentEmail = () => `s${Date.now()}_${n++}@uwaterloo.ca`;

beforeEach(() => {
  sent.length = 0;
});

describe("student email verification", () => {
  it("verifies with the emailed code", async () => {
    const uid = await makeSocialUser();
    const email = studentEmail();
    await startStudentVerification(uid, email);
    expect(sent[0].to).toBe(email);
    await finishStudentVerification(uid, lastCode());
    const row = await db.query.user.findFirst({ where: eq(user.id, uid) });
    expect(row?.studentEmail).toBe(email);
    // Code is single-use.
    await expect(finishStudentVerification(uid, lastCode())).rejects.toMatchObject({ kind: "no_code" });
  });

  it("only sends to student addresses", async () => {
    const uid = await makeSocialUser();
    await expect(startStudentVerification(uid, "me@gmail.com")).rejects.toMatchObject({ kind: "invalid" });
    await expect(startStudentVerification(uid, "a+b@uwaterloo.ca")).rejects.toMatchObject({ kind: "invalid" });
    expect(sent).toHaveLength(0);
  });

  it("cancels the code after 5 wrong tries", async () => {
    const uid = await makeSocialUser();
    await startStudentVerification(uid, studentEmail());
    const right = lastCode();
    const wrong = right === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      await expect(finishStudentVerification(uid, wrong)).rejects.toMatchObject({ kind: "wrong_code" });
    }
    await expect(finishStudentVerification(uid, right)).rejects.toMatchObject({ kind: "too_many_attempts" });
  });

  it("rejects expired codes", async () => {
    const uid = await makeSocialUser();
    await startStudentVerification(uid, studentEmail());
    await db.update(studentCode).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(studentCode.userId, uid));
    await expect(finishStudentVerification(uid, lastCode())).rejects.toMatchObject({ kind: "expired" });
  });

  it("allows each student email on only one account", async () => {
    const email = studentEmail();
    const a = await makeSocialUser();
    await startStudentVerification(a, email);
    await finishStudentVerification(a, lastCode());

    const b = await makeSocialUser();
    await startStudentVerification(b, email);
    await expect(finishStudentVerification(b, lastCode())).rejects.toMatchObject({ kind: "taken" });
    const row = await db.query.user.findFirst({ where: eq(user.id, b) });
    expect(row?.studentEmail).toBeNull();
  });

  it("won't replace a verified student email", async () => {
    const uid = await makeSocialUser();
    await startStudentVerification(uid, studentEmail());
    await finishStudentVerification(uid, lastCode());
    await expect(startStudentVerification(uid, studentEmail())).rejects.toMatchObject({ kind: "already_verified" });
  });
});
