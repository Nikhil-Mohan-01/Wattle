// Who is allowed to sign in. Shared by both sign-in methods.

/** Email domains allowed to sign in, e.g. "uwaterloo.ca". Exact match only. */
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
 * Returns an error message if the email can't be used, otherwise null.
 *
 * Plus-addressing (name+anything@uwaterloo.ca) is rejected because Exchange
 * delivers it to the same inbox, which would let one student create many
 * accounts.
 */
export function emailProblem(rawEmail: string): string | null {
  const email = normalizeEmail(rawEmail);
  const at = email.lastIndexOf("@");
  if (at <= 0) return "Enter a valid email address.";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!allowedDomains().includes(domain)) {
    return `Use your Waterloo email (@${allowedDomains()[0]}).`;
  }
  if (local.includes("+")) {
    return "Email aliases with '+' aren't allowed. Use your plain Waterloo address.";
  }
  if (!/^[a-z0-9._-]+$/.test(local)) return "Enter a valid email address.";
  return null;
}

/** Waterloo's Microsoft Entra tenant. Sign-ins from any other tenant are rejected. */
export function waterlooTenantId(): string | undefined {
  return process.env.MICROSOFT_TENANT_ID || undefined;
}

export function microsoftEnabled(): boolean {
  return Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}

export function emailLinkEnabled(): boolean {
  return (process.env.AUTH_EMAIL_LINK_ENABLED ?? "true") === "true";
}
