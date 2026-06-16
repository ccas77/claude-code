'use client';

import { useEffect, useState } from 'react';

type Friend = {
  id: string;
  email: string;
  name: string | null;
  assignedAccountIds: number[];
};

type Account = {
  id: number;
  username: string;
  platform: string;
};

export default function AssignmentsPage() {
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Set<number>>>({});
  const [serverSets, setServerSets] = useState<Record<string, Set<number>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = async () => {
    const res = await fetch('/api/admin/assignments');
    if (res.status === 403) {
      setForbidden(true);
      return;
    }
    if (!res.ok) {
      setError((await res.json()).error ?? 'Failed to load');
      return;
    }
    const data = await res.json();
    setFriends(data.friends);
    setAccounts(data.accounts);
    const next: Record<string, Set<number>> = {};
    for (const f of data.friends as Friend[]) {
      next[f.id] = new Set(f.assignedAccountIds);
    }
    setDrafts(next);
    setServerSets(
      Object.fromEntries(Object.entries(next).map(([k, v]) => [k, new Set(v)])),
    );
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = (ownerId: string, accountId: number) => {
    setDrafts((prev) => {
      const cur = new Set(prev[ownerId] ?? []);
      if (cur.has(accountId)) cur.delete(accountId);
      else cur.add(accountId);
      return { ...prev, [ownerId]: cur };
    });
  };

  const save = async (ownerId: string) => {
    setSavingId(ownerId);
    setError(null);
    try {
      const accountIds = Array.from(drafts[ownerId] ?? []);
      const res = await fetch('/api/admin/assignments', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ownerId, accountIds }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingId(null);
    }
  };

  const isDirty = (ownerId: string): boolean => {
    const a = drafts[ownerId] ?? new Set<number>();
    const b = serverSets[ownerId] ?? new Set<number>();
    if (a.size !== b.size) return true;
    for (const id of a) if (!b.has(id)) return true;
    return false;
  };

  if (forbidden) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Only the primary owner can manage account assignments.
      </div>
    );
  }
  if (friends === null) return <p className="text-sm text-stone-600">Loading...</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account assignments</h1>
        <p className="mt-1 text-sm text-stone-600">
          Tick the Post Bridge accounts each friend is allowed to publish to.
          They only see what you give them; your own accounts stay hidden.
        </p>
      </div>

      {accounts.length === 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No accounts found on the shared Post Bridge key. Make sure
          POSTBRIDGE_API_KEY_SHARED is set and that the connected Post Bridge
          subscription has linked social accounts.
        </div>
      )}

      {friends.length === 0 ? (
        <p className="text-sm text-stone-600">
          No friends have signed in yet. They appear here after their first Google
          login.
        </p>
      ) : (
        <ul className="space-y-4">
          {friends.map((f) => (
            <li
              key={f.id}
              className="rounded-lg border border-stone-200 bg-white p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{f.name ?? f.email}</div>
                  {f.name && (
                    <div className="text-xs text-stone-500">{f.email}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => save(f.id)}
                  disabled={!isDirty(f.id) || savingId === f.id}
                  className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-40"
                >
                  {savingId === f.id ? 'Saving...' : 'Save'}
                </button>
              </div>
              {accounts.length > 0 && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                  {accounts.map((a) => {
                    const checked = drafts[f.id]?.has(a.id) ?? false;
                    return (
                      <label key={a.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(f.id, a.id)}
                        />
                        <span className="truncate">
                          <span className="font-medium">{a.platform}</span>{' '}
                          <span className="text-stone-600">@{a.username}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
