import { redirect } from "next/navigation";

// Mailstream merged into the unified Inbox (Milestone 4). Kept as a redirect so
// old links/bookmarks still work.
export default function MailstreamRedirect() {
  redirect("/inbox?view=all");
}
