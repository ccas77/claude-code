import { ReactNode } from 'react';
import { LibraryNav } from '@/components/LibraryNav';

export default function LibraryLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-800">
      <LibraryNav />
      <main className="mx-auto max-w-5xl px-6 py-8 pb-24">{children}</main>
    </div>
  );
}
