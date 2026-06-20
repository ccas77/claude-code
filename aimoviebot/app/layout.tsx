import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Movie Bot",
  description: "9:16 vertical AI movies from a character + location + scene.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen max-w-2xl mx-auto px-4 py-8">{children}</div>
      </body>
    </html>
  );
}
