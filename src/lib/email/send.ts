import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;
  const host = process.env.SMTP_HOST;
  if (!host) {
    transporter = null;
    return null;
  }
  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transporter;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Sends an email. Without SMTP configured, development builds print the
 * message to the server console instead; production refuses to pretend.
 */
export async function sendMail(mail: Mail): Promise<void> {
  const t = getTransporter();
  if (!t) {
    if (process.env.NODE_ENV === "production") throw new Error("SMTP is not configured");
    console.info(`[mail:dev] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
    return;
  }
  await t.sendMail({ from: process.env.MAIL_FROM, ...mail });
}

const appName = () => process.env.APP_NAME ?? "Retail IMS";

export function passwordResetMail(to: string, code: string): Mail {
  return {
    to,
    subject: `${appName()} password reset code`,
    text: `Your password reset code is ${code}. It expires in 15 minutes.\n\nIf you did not request this, you can ignore this email.`,
  };
}

export function staffWelcomeMail(to: string, name: string, businessName: string, tempPassword: string): Mail {
  return {
    to,
    subject: `You've been added to ${businessName} on ${appName()}`,
    text: `Hi ${name},\n\nYou now have access to ${businessName}.\nSign in at ${process.env.APP_URL ?? ""}/login with:\n\nEmail: ${to}\nTemporary password: ${tempPassword}\n\nPlease change your password after signing in.`,
  };
}
