import InboxBrain from "@/components/InboxBrain";

// Inbox workspace layout: every inbox view (list, folders, thread) renders
// with the persistent Inbox brain on the right. Because the layout survives
// navigation within /inbox, the chat keeps its conversation as Jordan moves
// between threads; sessionStorage carries it across reloads too.
// The panels split one viewport-height row and scroll independently.
export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-stretch gap-4 lg:h-[calc(100vh-8.25rem)]">
      <div className="min-w-0 flex-1 lg:min-h-0">{children}</div>
      <aside className="hidden shrink-0 lg:block lg:min-h-0">
        <InboxBrain collapsible />
      </aside>
    </div>
  );
}
