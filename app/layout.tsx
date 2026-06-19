import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Film Room — Meeting Intelligence",
  description: "Meeting intelligence over the Hammer Claw vault.",
};

// Set the theme class before paint to avoid a flash of the wrong theme.
const themeScript = `
try {
  var t = localStorage.getItem('theme');
  if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
} catch (e) {}
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="font-sans" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <div className="flex">
          <Nav />
          <main className="min-w-0 flex-1">
            <div className="mx-auto max-w-[1360px] animate-fade-in px-6 py-8 pb-24 sm:px-9">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
