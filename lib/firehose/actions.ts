import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emails } from "@/lib/db/schema";

export type EmailRow = typeof emails.$inferSelect;

export async function getEmailById(id: number): Promise<EmailRow | null> {
  const rows = await getDb().select().from(emails).where(eq(emails.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function setFlag(id: number, flagged: boolean): Promise<void> {
  await getDb()
    .update(emails)
    .set({ flagged, flaggedAt: flagged ? new Date() : null })
    .where(eq(emails.id, id));
}

// new | replied | archived
export async function setStatus(id: number, status: string): Promise<void> {
  await getDb().update(emails).set({ status }).where(eq(emails.id, id));
}

export async function markReplied(id: number): Promise<void> {
  await getDb()
    .update(emails)
    .set({ status: "replied", repliedAt: new Date() })
    .where(eq(emails.id, id));
}
