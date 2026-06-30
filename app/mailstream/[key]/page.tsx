import { redirect } from "next/navigation";

// Merged into the unified Inbox thread view.
export default async function MailstreamThreadRedirect({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  redirect(`/inbox/${key}`);
}
