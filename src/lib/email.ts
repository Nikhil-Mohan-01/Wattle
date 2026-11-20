import "server-only";
import nodemailer from "nodemailer";

type Mail = { to: string; subject: string; text: string; html: string };

const transport = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;

/**
 * Sends an email through SMTP_URL. Without SMTP configured (local dev), the
 * message is printed to the server console instead.
 */
export async function sendEmail(mail: Mail): Promise<void> {
  if (!transport) {
    console.log(`\n[email:dev] To: ${mail.to}\nSubject: ${mail.subject}\n${mail.text}\n`);
    return;
  }
  await transport.sendMail({
    from: process.env.EMAIL_FROM ?? "Wattle <no-reply@localhost>",
    ...mail,
  });
}
