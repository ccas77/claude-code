'use client';

import { useState } from 'react';
import type { UploadResult } from '@/lib/upload';

type Props = {
  category: 'library/genres' | 'library/books';
  onUploaded: (uploaded: UploadResult[]) => void | Promise<void>;
};

type Failed = { originalUrl: string; error: string };

export function UrlsPaste({ category, onUploaded }: Props) {
  const [url, setUrl] = useState('');
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState<Failed[]>([]);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const send = async (urls: string[]) => {
    setWorking(true);
    setFailed([]);
    try {
      const res = await fetch('/api/upload/from-urls', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ urls, category }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        uploaded: UploadResult[];
        failed: Failed[];
      };
      if (data.uploaded.length > 0) await onUploaded(data.uploaded);
      setFailed(data.failed);
      return data;
    } catch (e) {
      setFailed([{ originalUrl: urls.join(' '), error: (e as Error).message }]);
      return null;
    } finally {
      setWorking(false);
    }
  };

  const addOne = async () => {
    const u = url.trim();
    if (!u) return;
    const result = await send([u]);
    if (result && result.uploaded.length > 0) setUrl('');
  };

  const addMany = async () => {
    const urls = bulkText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!urls.length) return;
    const result = await send(urls);
    if (result) {
      // Keep only failed entries in the textarea so she can fix them
      setBulkText(result.failed.map((f) => f.originalUrl).join('\n'));
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addOne();
            }
          }}
          placeholder="Paste an image URL"
          className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm focus:border-stone-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={addOne}
          disabled={working || !url.trim()}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50 disabled:opacity-50"
        >
          {working ? 'Fetching...' : 'Add'}
        </button>
        <button
          type="button"
          onClick={() => setShowBulk((v) => !v)}
          className="rounded-md px-2 py-1.5 text-xs text-stone-600 hover:bg-stone-100"
        >
          {showBulk ? 'Single URL' : 'Paste many'}
        </button>
      </div>

      {showBulk && (
        <div className="mt-2">
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={5}
            placeholder={'One URL per line\nhttps://example.com/a.jpg\nhttps://example.com/b.png'}
            className="block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={addMany}
            disabled={working || !bulkText.trim()}
            className="mt-1 rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50 disabled:opacity-50"
          >
            {working ? 'Fetching...' : 'Add all'}
          </button>
        </div>
      )}

      {failed.length > 0 && (
        <ul className="mt-2 space-y-1 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          {failed.map((f, i) => (
            <li key={i} className="break-all">
              <span className="font-medium">{f.error}:</span>{' '}
              <span className="font-mono">{f.originalUrl.slice(0, 80)}{f.originalUrl.length > 80 ? '...' : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
