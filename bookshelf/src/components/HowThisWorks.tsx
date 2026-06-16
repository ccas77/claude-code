import { ReactNode } from 'react';

/**
 * Friendly inline help block. Pops open with a click; steps are plain copy
 * aimed at someone who's never seen the app before.
 */
export function HowThisWorks({
  title = 'How this page works',
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <details className="mb-6 rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
      <summary className="cursor-pointer select-none font-medium text-stone-800">
        {title}
      </summary>
      <div className="mt-3 space-y-2 leading-relaxed">{children}</div>
    </details>
  );
}
