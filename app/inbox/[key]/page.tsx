import { redirect } from "next/navigation";

// Legacy full-page thread route: the inbox is a panel workspace now, so old
// links and bookmarks land in /inbox with the thread selected.
export default async function ThreadPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  redirect(`/inbox?selected=${encodeURIComponent(decodeURIComponent(key))}`);
}
