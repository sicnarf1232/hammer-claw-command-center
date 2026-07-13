import { eq, and, isNull, desc } from "drizzle-orm";
import { getDb, dbConfigured } from "@/lib/db";
import { notifications } from "@/lib/db/schema";

// Notifications are always logged to Postgres (the notification log, docs/01).
// External delivery (phone/email) is optional: if NOTIFY_WEBHOOK_URL is set
// (e.g. a Power Automate push flow), undelivered notifications are POSTed there
// and marked sent. Without it, notifications are in-app only.

export interface NotificationInput {
  kind: string; // due_today | new_email | brief | error
  title: string;
  body?: string;
  meta?: Record<string, unknown>;
  dedupeKey?: string; // skip if a notification with this key already exists
}

export async function createNotification(
  input: NotificationInput,
): Promise<{ created: boolean }> {
  if (!dbConfigured()) return { created: false };
  const db = getDb();

  if (input.dedupeKey) {
    const existing = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.dedupeKey, input.dedupeKey))
      .limit(1);
    if (existing.length > 0) return { created: false };
  }

  await db.insert(notifications).values({
    kind: input.kind,
    title: input.title,
    body: input.body ?? null,
    channel: notifyConfigured() ? "external" : "in-app",
    meta: input.meta ?? null,
    dedupeKey: input.dedupeKey ?? null,
  });
  return { created: true };
}

export function notifyConfigured(): boolean {
  return Boolean(process.env.NOTIFY_WEBHOOK_URL);
}

// Deliver any unsent notifications to the external channel, if configured.
export async function deliverPending(): Promise<{ delivered: number }> {
  if (!dbConfigured() || !notifyConfigured()) return { delivered: 0 };
  const db = getDb();
  const url = process.env.NOTIFY_WEBHOOK_URL!;

  const pending = await db
    .select()
    .from(notifications)
    .where(isNull(notifications.sentAt))
    .orderBy(notifications.id)
    .limit(50);

  let delivered = 0;
  for (const n of pending) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: n.kind, title: n.title, body: n.body }),
      });
      if (res.ok) {
        await db
          .update(notifications)
          .set({ sentAt: new Date() })
          .where(eq(notifications.id, n.id));
        delivered++;
      }
    } catch {
      // Leave unsent; the next cron tick retries.
    }
  }
  return { delivered };
}

export async function recentNotifications(limit = 20) {
  if (!dbConfigured()) return [];
  const db = getDb();
  return db
    .select()
    .from(notifications)
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

// Newest notification of one kind (e.g. the latest brief for the dashboard
// card). Null when none exists or the DB is not configured.
export async function latestNotificationOfKind(kind: string) {
  if (!dbConfigured()) return null;
  const rows = await getDb()
    .select()
    .from(notifications)
    .where(eq(notifications.kind, kind))
    .orderBy(desc(notifications.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function unsentCount(): Promise<number> {
  if (!dbConfigured()) return 0;
  const db = getDb();
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(isNull(notifications.sentAt)));
  return rows.length;
}
