import { eq, desc, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emailQueue } from "@/lib/db/schema";

export type EmailRow = typeof emailQueue.$inferSelect;

export async function getQueue(
  statuses: string[] = ["new", "filed", "replied"],
): Promise<EmailRow[]> {
  const db = getDb();
  return db
    .select()
    .from(emailQueue)
    .where(inArray(emailQueue.status, statuses))
    .orderBy(desc(emailQueue.receivedAt), desc(emailQueue.id));
}

export async function getEmail(id: number): Promise<EmailRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(emailQueue)
    .where(eq(emailQueue.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function markFiled(
  id: number,
  filedPath: string,
  filedCommit: string,
  workstream: string,
  account: string | null,
): Promise<void> {
  const db = getDb();
  await db
    .update(emailQueue)
    .set({
      status: "filed",
      filedPath,
      filedCommit,
      workstream,
      account,
      updatedAt: new Date(),
    })
    .where(eq(emailQueue.id, id));
}

export async function markReplied(id: number): Promise<void> {
  const db = getDb();
  await db
    .update(emailQueue)
    .set({ status: "replied", repliedAt: new Date(), updatedAt: new Date() })
    .where(eq(emailQueue.id, id));
}

export async function setStatus(id: number, status: string): Promise<void> {
  const db = getDb();
  await db
    .update(emailQueue)
    .set({ status, updatedAt: new Date() })
    .where(eq(emailQueue.id, id));
}
