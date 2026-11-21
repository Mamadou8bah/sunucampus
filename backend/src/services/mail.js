import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transport = null;

export const mailConfigured = () => Boolean(env.smtp.host);

function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  }
  return transport;
}

/** Sends a plain-text email. Without SMTP settings it logs the message instead (development). */
export async function sendMail({ to, subject, text }) {
  if (!mailConfigured()) {
    if (!env.isTest) console.log(`\n[mail not configured] To: ${to}\nSubject: ${subject}\n${text}\n`);
    return { delivered: false };
  }
  await getTransport().sendMail({ from: env.smtp.from, to, subject, text });
  return { delivered: true };
}
