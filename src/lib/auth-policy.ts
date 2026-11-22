// Which email addresses count as student emails, and which sign-in methods are on.

/** Student email domains, e.g. "uwaterloo.ca". Exact match only. */
export function allowedDomains(): string[] {
  return (process.env.ALLOWED_EMAIL_DOMAINS ?? "uwaterloo.ca")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Returns an error message if the address can't be used as a student email,
 * otherwise null.
 *
 * Plus-addressing (name+anything@uwaterloo.ca) is rejected because university
 * mail servers deliver it to the same inbox, which would let one student
 * create many accounts.
 */
export function emailProblem(rawEmail: string): string | null {
  const email = normalizeEmail(rawEmail);
  const at = email.lastIndexOf("@");
  if (at <= 0) return "Enter a valid email address.";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!allowedDomains().includes(domain)) {
    return `Use your student email (@${allowedDomains()[0]}).`;
  }
  if (local.includes("+")) {
    return "Email aliases with '+' aren't allowed. Use your plain student address.";
  }
  if (!/^[a-z0-9._-]+$/.test(local)) return "Enter a valid email address.";
  return null;
}

export function microsoftEnabled(): boolean {
  return Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}

export function googleEnabled(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * Email codes need a way to deliver email: SMTP, or local `next dev` (which
 * prints them to the console). Without it, nobody can verify a student
 * email, so production requires SMTP (see config-check).
 */
export function emailEnabled(): boolean {
  return Boolean(process.env.SMTP_URL) || process.env.NODE_ENV === "development";
}
