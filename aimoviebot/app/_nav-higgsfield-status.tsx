"use client";
import { useEffect, useState } from "react";

// Persistent header chip showing Higgsfield connection status. Polls
// /api/oauth/higgsfield/status on mount + every 30s. When the token's
// dead, the chip turns red and clicking it kicks off the OAuth reconnect
// flow in a new tab — no more digging through error messages for the
// right URL.
export default function NavHiggsfieldStatus() {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      fetch("/api/oauth/higgsfield/status", { cache: "no-store" })
        .then((r) => r.json())
        .then((d: { connected?: boolean }) => {
          if (!cancelled) setConnected(Boolean(d.connected));
        })
        .catch(() => {
          if (!cancelled) setConnected(false);
        });
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (connected === null) {
    return (
      <span className="text-xs text-stone-400">Checking Higgsfield…</span>
    );
  }
  if (connected) {
    return (
      <a
        href="/api/oauth/higgsfield"
        target="_blank"
        rel="noreferrer"
        className="text-xs px-2 py-0.5 rounded border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
        title="Higgsfield OAuth is live. Click to re-authorise (opens new tab)."
      >
        ● Higgsfield connected
      </a>
    );
  }
  return (
    <a
      href="/api/oauth/higgsfield"
      className="text-xs px-2 py-0.5 rounded border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 font-medium"
      title="Higgsfield is not connected. Click to start the OAuth flow."
    >
      ⚠ Reconnect Higgsfield
    </a>
  );
}
