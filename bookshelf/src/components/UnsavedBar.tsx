'use client';

import { ReactNode } from 'react';

type Props = {
  visible: boolean;
  saving?: boolean;
  message?: ReactNode;
  onSave: () => void;
  onDiscard: () => void;
};

export function UnsavedBar({
  visible,
  saving,
  message = 'You have unsaved changes',
  onSave,
  onDiscard,
}: Props) {
  if (!visible) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white shadow-lg">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <span className="text-sm text-stone-700">{message}</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
