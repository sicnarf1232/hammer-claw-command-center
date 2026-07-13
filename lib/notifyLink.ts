// Where a notification "lives": the click-through target for activity rows on
// the dashboard rail and the /notifications page. Pure so the mapping is
// unit-testable; meta arrives as untyped jsonb, so every field is narrowed.
//
// new_email meta carries { messageId, emailId } (see app/api/webhooks/email);
// a threadKey, if a future writer adds one, is preferred. An emailId maps to
// the "m:<id>" thread key the inbox already resolves. Briefs live on the
// dashboard; errors and anything unknown live on the notification log itself.
export function notificationHref(kind: string, meta: unknown): string | null {
  const m = (meta && typeof meta === "object" ? meta : {}) as Record<string, unknown>;
  switch (kind) {
    case "new_email": {
      const threadKey = typeof m.threadKey === "string" ? m.threadKey : null;
      if (threadKey) return `/inbox?selected=${encodeURIComponent(threadKey)}`;
      const emailId = typeof m.emailId === "number" && Number.isInteger(m.emailId) ? m.emailId : null;
      if (emailId != null) return `/inbox?selected=${encodeURIComponent(`m:${emailId}`)}`;
      return "/inbox";
    }
    case "due_today":
      return "/tasks";
    case "brief":
      return "/dashboard#brief";
    case "error":
    default:
      return "/notifications";
  }
}
