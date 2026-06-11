import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Hammer Claw Command Center",
  description: "Personal command center over the Hammer Claw vault.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="md:flex">
          <Nav />
          <main className="min-h-screen flex-1 px-5 py-6 md:px-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
