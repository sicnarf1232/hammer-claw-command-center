import InboxBrain from "@/components/InboxBrain";

// Inbox workspace layout: every inbox view (list, folders, thread) renders
// with the persistent Inbox brain on the right. Because the layout survives
// navigation within /inbox, the chat keeps its conversation as Jordan moves
// between threads; sessionStorage carries it across reloads too.
export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-5">
      <div className="min-w-0 flex-1">{children}</div>
      <aside className="sticky top-4 hidden h-[calc(100vh-6rem)] shrink-0 lg:block">
        <InboxBrain collapsible />
      </aside>
    </div>
  );
}
