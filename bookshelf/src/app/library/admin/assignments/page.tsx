'use client';

import { useEffect, useMemo, useState } from 'react';

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
  const [selectedId, setSelectedId] = useState<string>('');
  const [draft, setDraft] = useState<Set<number>>(new Set());
  const [serverSet, setServerSet] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = async (preserveSelectedId?: string) => {
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
    const keep = preserveSelectedId ?? selectedId;
    if (keep) {
      const f = (data.friends as Friend[]).find((x) => x.id === keep);
      if (f) {
        setSelectedId(f.id);
        setDraft(new Set(f.assignedAccountIds));
        setServerSet(new Set(f.assignedAccountIds));
        return;
      }
    }
    setSelectedId('');
    setDraft(new Set());
    setServerSet(new Set());
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPick = (id: string) => {
    if (!friends) return;
    const f = friends.find((x) => x.id === id);
    setSelectedId(id);
    setDraft(new Set(f?.assignedAccountIds ?? []));
    setServerSet(new Set(f?.assignedAccountIds ?? []));
  };

  const toggle = (accountId: number) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  };

  const dirty = useMemo(() => {
    if (draft.size !== serverSet.size) return true;
    for (const id of draft) if (!serverSet.has(id)) return true;
    return false;
  }, [draft, serverSet]);

  const save = async () => {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/assignments', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ownerId: selectedId,
          accountIds: Array.from(draft),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      await load(selectedId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const selectedFriend = friends?.find((f) => f.id === selectedId) ?? null;

  if (forbidden) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Only the primary owner can manage account assignments.
      </div>
    );
  }
  if (friends === null) return <p className="text-sm text-stone-600">Loading...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account assignments</h1>
        <p className="mt-1 text-sm text-stone-600">
          Pick a friend, tick the Post Bridge accounts they can publish to. They
          only see what you give them; your own accounts stay hidden.
        </p>
      </div>

      {accounts.length === 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No accounts found on the shared Post Bridge key. Make sure
          POSTBRIDGE_API_KEY_SHARED is set and that the connected Post Bridge
          subscription has linked social accounts.
        </div>
      )}

      <label className="block max-w-md">
        <span className="text-sm font-medium">Friend</span>
        <select
          value={selectedId}
          onChange={(e) => onPick(e.target.value)}
          className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
        >
          <option value="">
            {friends.length === 0
              ? 'No friends signed in yet'
              : 'Pick a friend...'}
          </option>
          {friends.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name ? `${f.name} (${f.email})` : f.email}
              {f.assignedAccountIds.length
                ? ` - ${f.assignedAccountIds.length} assigned`
                : ''}
            </option>
          ))}
        </select>
      </label>

      {selectedFriend && (
        <div className="rounded-lg border border-stone-200 bg-white p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">
                {selectedFriend.name ?? selectedFriend.email}
              </div>
              {selectedFriend.name && (
                <div className="text-xs text-stone-500">{selectedFriend.email}</div>
              )}
            </div>
            <span className="text-xs text-stone-500">
              {draft.size} of {accounts.length} ticked
            </span>
          </div>

          {accounts.length > 0 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
              {accounts.map((a) => {
                const checked = draft.has(a.id);
                return (
                  <label key={a.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(a.id)}
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

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-40"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            {dirty && (
              <button
                type="button"
                onClick={() => setDraft(new Set(serverSet))}
                className="rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
              >
                Discard
              </button>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
