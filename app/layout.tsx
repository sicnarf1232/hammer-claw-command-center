import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import InboxBrain from "@/components/InboxBrain";
import { BrandColorsProvider } from "@/components/BrandColors";

// Merit Type Style Guide: Inter carries body & UI (weights 300–700), Outfit
// carries display — headings, eyebrows, all-caps (weights 400–900). Loaded
// via next/font (self-hosted, no layout shift) and exposed as CSS variables
// that globals.css maps onto --font-sans / --font-display.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Main St.",
  description: "Your command center over the vault.",
};

// Dark is the default (Main St.). Only an explicit "light" preference opts out,
// applied before paint to avoid a flash of the wrong theme.
const themeScript = `
try {
  if (localStorage.getItem('theme') !== 'light') {
    document.documentElement.classList.add('dark');
  }
} catch (e) { document.documentElement.classList.add('dark'); }
try {
  document.documentElement.style.setProperty('--nav-w', localStorage.getItem('nav-collapsed') === '1' ? '64px' : '236px');
} catch (e) {}
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${outfit.variable} font-sans`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <BrandColorsProvider>
          <Nav />
          <main className="min-w-0 transition-[padding] duration-200 md:pl-[var(--nav-w,236px)]">
            <div className="page-shell mx-auto flex max-w-[1360px] items-start gap-4 animate-fade-in px-4 py-6 pb-24 sm:px-9 sm:py-8">
              <div className="min-w-0 flex-1">{children}</div>
              {/* The brain rides along on every page (collapsible; Cmd+K). */}
              <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] shrink-0 self-start lg:block">
                <InboxBrain collapsible />
              </aside>
            </div>
          </main>
        </BrandColorsProvider>
      </body>
    </html>
  );
}
