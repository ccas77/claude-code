'use client';

import { useEffect, useState } from 'react';

/**
 * Read-only Higgsfield connection indicator for non-primary users. Shows
 * green if connected, red if not, with a tooltip explaining the impact.
 * No click action; only the primary owner can connect or disconnect.
 */
export function HiggsfieldStatusBadge() {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/auth/higgsfield/status')
      .then((r) => r.json())
      .then((d) => setConnected(!!d.connected))
      .catch(() => setConnected(false));
  }, []);

  if (connected === null) {
    return (
      <span className="rounded-md border border-stone-200 px-2 py-1 text-xs text-stone-400">
        Higgsfield ...
      </span>
    );
  }

  if (connected) {
    return (
      <span
        title="Higgsfield is connected. Image generation is using the primary provider."
        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-800"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        Higgsfield
      </span>
    );
  }

  return (
    <span
      title="Higgsfield is not connected. Image generation will use the AI Gateway fallback. Ask Cordelia to reconnect for best results."
      className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800"
    >
      <span className="h-2 w-2 rounded-full bg-red-500" />
      Higgsfield off
    </span>
  );
}
