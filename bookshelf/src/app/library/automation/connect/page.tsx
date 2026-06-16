'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type Account = { id: number; username: string; platform: string };

export default function ConnectAutomation() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>('');

  useEffect(() => {
    fetch('/api/automation/accounts')
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? 'failed');
        return r.json();
      })
      .then((d) => setAccounts(d.accounts ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const byPlatform = new Map<string, Account[]>();
    for (const a of accounts) {
      const arr = byPlatform.get(a.platform) ?? [];
      arr.push(a);
      byPlatform.set(a.platform, arr);
    }
    const result: { platform: string; accounts: Account[] }[] = [];
    for (const platform of Array.from(byPlatform.keys()).sort()) {
      const list = byPlatform.get(platform)!;
      list.sort((x, y) => x.username.localeCompare(y.username));
      result.push({ platform, accounts: list });
    }
    return result;
  }, [accounts]);

  const connect = async () => {
    if (!selected) return;
    const [platform, idStr] = selected.split('|');
    const a = accounts.find((x) => x.platform === platform && String(x.id) === idStr);
    if (!a) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/automation/configs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          platform: a.platform,
          postBridgeAccountId: a.id,
          username: a.username,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'failed');
      const { config } = await res.json();
      router.push(`/library/automation/${config.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Connect an account</h1>
      <p className="mt-2 text-sm text-stone-600">
        Pulled live from your post-bridge account. Pick one to start configuring
        automation; intervals and book selections go on the next screen.
      </p>

      {loading && <p className="mt-6 text-sm text-stone-600">Loading...</p>}
      {error && (
        <div className="mt-6 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
          <p className="mt-1 text-xs">
            Make sure POSTBRIDGE_API_KEY is set in your Vercel project env.
          </p>
        </div>
      )}

      {!loading && !error && accounts.length === 0 && (
        <p className="mt-6 text-sm text-stone-600">
          No accounts found on this post-bridge key.
        </p>
      )}

      {!loading && !error && accounts.length > 0 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            connect();
          }}
          className="mt-6 max-w-md space-y-3"
        >
          <label className="block">
            <span className="text-sm font-medium">Account</span>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
            >
              <option value="">Pick an account...</option>
              {grouped.map((g) => (
                <optgroup key={g.platform} label={g.platform}>
                  {g.accounts.map((a) => (
                    <option key={`${g.platform}-${a.id}`} value={`${g.platform}|${a.id}`}>
                      @{a.username}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={!selected || busy}
            className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {busy ? 'Connecting...' : 'Connect'}
          </button>
        </form>
      )}
    </div>
  );
}
