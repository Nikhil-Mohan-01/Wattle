import "server-only";
import nodemailer from "nodemailer";

type Mail = { to: string; subject: string; text: string; html: string };

const transport = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;

/** Printing emails to the console is only allowed when running `next dev`. */
export function consoleEmailAllowed(): boolean {
  return process.env.NODE_ENV === "development";
}

export function emailConfigured(): boolean {
  return transport !== null || consoleEmailAllowed();
}

export class EmailNotConfiguredError extends Error {}

/**
 * Sends an email through SMTP_URL. In local development without SMTP, the
 * message is printed to the server console instead. Anywhere else, a missing
 * SMTP config is an error: emails can contain sign-in links, which must
 * never be written to logs.
 */
export async function sendEmail(mail: Mail): Promise<void> {
  if (transport) {
    await transport.sendMail({
      from: process.env.EMAIL_FROM ?? "Wattle <no-reply@localhost>",
      ...mail,
    });
    return;
  }
  if (consoleEmailAllowed()) {
    console.log(`\n[email:dev] To: ${mail.to}\nSubject: ${mail.subject}\n${mail.text}\n`);
    return;
  }
  // Deliberately log nothing about the message itself.
  console.error("[email] SMTP_URL is not set; refusing to send email.");
  throw new EmailNotConfiguredError("Email is not configured.");
}
