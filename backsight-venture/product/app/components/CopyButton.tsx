"use client";

import { useState } from "react";

/** Copies `${origin}${path}` to the clipboard (client share link). */
export default function CopyButton({ path, label }: { path: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        const url = `${window.location.origin}${path}`;
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          window.prompt("Copy this link:", url);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700"
    >
      {copied ? "Copied!" : label}
    </button>
  );
}
