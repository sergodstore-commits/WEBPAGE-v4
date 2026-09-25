import nodemailer from 'nodemailer';
import { getDb, type Db } from './db';
import { isProd, uuid } from './core';
export async function enqueueMail(tx: Db, key: string, to: string, subject: string, body: string) {
  if (!to) return;
  await tx.query(
    'INSERT INTO mail_outbox(id,dedupe_key,recipient,subject,body) VALUES($1,$2,$3,$4,$5) ON CONFLICT(dedupe_key) DO NOTHING',
    [uuid(), key, to, subject, body],
  );
}
export async function flushMail() {
  const db = await getDb();
  if (!process.env.SMTP_HOST) {
    if (!isProd()) await db.query("UPDATE mail_outbox SET status='local' WHERE status='queued'");
    return;
  }
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 8000,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
  const { rows } = await db.query(
    `UPDATE mail_outbox SET status='sending', locked_at=now(),attempts=attempts+1 WHERE id IN (SELECT id FROM mail_outbox WHERE (status IN ('queued','failed') OR (status='sending' AND locked_at<now()-interval '10 minutes')) AND attempts<5 ORDER BY created_at LIMIT 3 FOR UPDATE SKIP LOCKED) RETURNING *`,
  );
  await Promise.all(
    rows.map(async (m) => {
      try {
        await transport.sendMail({
          from: process.env.MAIL_FROM,
          to: m.recipient,
          subject: m.subject,
          text: m.body,
          messageId: `<${m.id}@sergod.store>`,
        });
        await db.query(
          "UPDATE mail_outbox SET status='sent',sent_at=now(),last_error=NULL WHERE id=$1",
          [m.id],
        );
      } catch (e) {
        await db.query("UPDATE mail_outbox SET status='failed',last_error=$2 WHERE id=$1", [
          m.id,
          e instanceof Error ? e.message : 'SMTP failure',
        ]);
      }
    }),
  );
}
