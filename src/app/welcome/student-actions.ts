"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { EmailCodeError } from "@/lib/email-code";
import { getCurrentUser } from "@/lib/session";
import { finishStudentVerification, startStudentVerification, StudentVerifyError } from "@/lib/student";

export type StudentState = { step: "email" | "code"; email: string; error: string | null };

/**
 * The student-email step. `intent` is "send" (email a code), "verify" (check
 * the code) or "restart" (go back and change the email).
 */
export async function studentStep(prev: StudentState, form: FormData): Promise<StudentState> {
  const me = await getCurrentUser();
  if (!me) redirect("/sign-in");
  const intent = String(form.get("intent") ?? "");

  if (intent === "restart") return { step: "email", email: prev.email, error: null };

  if (intent === "send") {
    const email = String(form.get("email") ?? "").trim();
    try {
      const { email: sentTo } = await startStudentVerification(me.id, email, await headers());
      return { step: "code", email: sentTo, error: null };
    } catch (err) {
      if (err instanceof StudentVerifyError && err.kind === "already_verified") redirect("/welcome");
      if (err instanceof EmailCodeError || err instanceof StudentVerifyError) {
        return { step: "email", email, error: err.message };
      }
      throw err;
    }
  }

  try {
    await finishStudentVerification(me.id, String(form.get("code") ?? ""));
  } catch (err) {
    if (!(err instanceof StudentVerifyError)) throw err;
    const restart = ["no_code", "expired", "too_many_attempts", "taken"].includes(err.kind);
    return { step: restart ? "email" : "code", email: prev.email, error: err.message };
  }
  refresh();
  redirect("/welcome");
}
