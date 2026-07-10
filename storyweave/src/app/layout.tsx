import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'StoryWeave',
  description: 'Illustrated, character-consistent story videos',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 text-stone-800 antialiased">
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-baseline gap-4 px-6 py-4">
            <Link href="/" className="text-lg font-bold tracking-tight">
              🧵 StoryWeave
            </Link>
            <span className="text-sm text-stone-500">
              illustrated story videos — same character, every frame
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
