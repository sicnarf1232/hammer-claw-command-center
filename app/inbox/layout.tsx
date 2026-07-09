// The Ask Brain panel now lives in the root layout (every page); this layout
// only gives the inbox its viewport-height workspace so the panels scroll
// independently.
export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-w-0 lg:h-[calc(100vh-8.25rem)] lg:min-h-0">{children}</div>;
}
