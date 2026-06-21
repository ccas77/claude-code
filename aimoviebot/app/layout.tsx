import type { Metadata } from "next";
import "./globals.css";
import NavHiggsfieldStatus from "./_nav-higgsfield-status";

export const metadata: Metadata = {
  title: "AI Movie Bot",
  description: "9:16 vertical AI movies from a character + location + scene.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen max-w-2xl mx-auto px-4 py-8">
          <nav className="mb-6 flex items-center gap-4 text-xs text-stone-500">
            <a href="/" className="hover:text-violet-700">Render</a>
            <a href="/projects" className="hover:text-violet-700">Projects</a>
            <a href="/library" className="hover:text-violet-700">Library</a>
            <a href="/prompts" className="hover:text-violet-700">Prompts</a>
            <span className="ml-auto">
              <NavHiggsfieldStatus />
            </span>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
