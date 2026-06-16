'use client';

import { useEffect, useState } from 'react';

export function HiggsfieldConnect() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    fetch('/api/auth/higgsfield/status')
      .then((r) => r.json())
      .then((d) => setConnected(!!d.connected))
      .catch(() => setConnected(false));
  }, []);

  const disconnect = async () => {
    if (!confirm('Disconnect Higgsfield? Image gen falls back to OpenAI until reconnected.')) {
      return;
    }
    setWorking(true);
    await fetch('/api/auth/higgsfield/disconnect', { method: 'POST' });
    setConnected(false);
    setWorking(false);
  };

  if (connected === null) {
    return (
      <span className="rounded-md border border-stone-200 px-2 py-1 text-xs text-stone-400">
        Higgsfield ...
      </span>
    );
  }

  if (connected) {
    return (
      <button
        type="button"
        onClick={disconnect}
        disabled={working}
        title="Higgsfield connected. Click to disconnect."
        className="flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        Higgsfield
      </button>
    );
  }

  return (
    <a
      href="/api/auth/higgsfield/start"
      className="rounded-md bg-stone-900 px-2 py-1 text-xs font-medium text-white hover:bg-stone-800"
    >
      Connect Higgsfield
    </a>
  );
}
