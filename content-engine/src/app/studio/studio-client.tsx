"use client";

import { useState } from "react";
import type { Book, ModuleOutput } from "@/modules/types";

function svgDataUrl(svg: string): string {
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

function linesToArr(s: string): string[] {
  return s.split("\n").map((x) => x.trim()).filter(Boolean);
}

export default function StudioClient({ sampleBooks }: { sampleBooks: Book[] }) {
  const [book, setBook] = useState<Book>(sampleBooks[0]);
  const [outputs, setOutputs] = useState<ModuleOutput[]>([]);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ book }),
      });
      const data = await res.json();
      setOutputs(data.outputs ?? []);
    } finally {
      setBusy(false);
    }
  }

  function set<K extends keyof Book>(k: K, v: Book[K]) {
    setBook((b) => ({ ...b, [k]: v }));
  }

  return (
    <main style={{ display: "flex", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
      {/* LEFT: enter the book once */}
      <aside style={{ width: 380, padding: 24, borderRight: "1px solid #2a2a2a", background: "#141414", color: "#eee", overflowY: "auto" }}>
        <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>Book → everything</h1>
        <p style={{ fontSize: 12, color: "#999", marginTop: 0 }}>
          Enter a book once. Every output type your apps make, from one source.
        </p>

        <div style={{ display: "flex", gap: 6, margin: "12px 0" }}>
          {sampleBooks.map((b) => (
            <button key={b.title} onClick={() => setBook(b)} style={chip}>
              {b.title}
            </button>
          ))}
        </div>

        <Field label="Title" value={book.title} onChange={(v) => set("title", v)} />
        <Field label="Author" value={book.author} onChange={(v) => set("author", v)} />
        <Field label="Blurb" value={book.blurb ?? ""} onChange={(v) => set("blurb", v)} textarea />
        <Field label="Quotes (one per line)" value={book.quotes.join("\n")} onChange={(v) => set("quotes", linesToArr(v))} textarea />
        <Field label="Tropes (one per line)" value={book.tropes.join("\n")} onChange={(v) => set("tropes", linesToArr(v))} textarea />
        <Field label="Hashtags (one per line)" value={book.hashtags.join("\n")} onChange={(v) => set("hashtags", linesToArr(v))} textarea />

        <button onClick={generate} disabled={busy} style={cta}>
          {busy ? "Generating…" : "Generate all outputs →"}
        </button>
      </aside>

      {/* RIGHT: the fan-out */}
      <section style={{ flex: 1, padding: 24, background: "#0d0d0d", color: "#eee", overflowY: "auto" }}>
        {outputs.length === 0 ? (
          <div style={{ color: "#666", marginTop: 40, textAlign: "center" }}>
            Pick or edit a book, then <b>Generate all outputs</b>.<br />
            One book becomes a slideshow, video storyboard, meme, Top-N list, carousel, pin, and social card.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 20 }}>
            {outputs.map((o) => (
              <OutputCard key={o.moduleKey} out={o} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function OutputCard({ out }: { out: ModuleOutput }) {
  const [i, setI] = useState(0);
  const slide = out.slides[i];
  return (
    <div style={{ border: "1px solid #2a2a2a", borderRadius: 10, overflow: "hidden", background: "#161616" }}>
      <div style={{ padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontSize: 13 }}>{out.title}</strong>
        <span style={{ fontSize: 10, color: out.implemented ? "#4caf50" : "#e0a52b" }}>
          {out.implemented ? "live" : "storyboard"}
        </span>
      </div>
      <div style={{ fontSize: 10, color: "#777", padding: "0 10px 6px" }}>from {out.sourceApp}</div>
      {slide && (
        <img
          src={svgDataUrl(slide.svg)}
          alt={slide.label}
          style={{ width: "100%", display: "block", background: "#000", aspectRatio: out.aspect.replace(":", "/") }}
        />
      )}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", padding: 8 }}>
        {out.slides.map((s, idx) => (
          <button key={idx} onClick={() => setI(idx)} style={{ ...tab, ...(idx === i ? tabActive : {}) }}>
            {s.label}
          </button>
        ))}
      </div>
      {out.note && <div style={{ fontSize: 10, color: "#e0a52b", padding: "0 10px 8px" }}>{out.note}</div>}
      <div style={{ fontSize: 11, color: "#aaa", padding: "0 10px 10px", whiteSpace: "pre-wrap", borderTop: "1px solid #222", paddingTop: 8 }}>
        {out.caption}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, textarea }: { label: string; value: string; onChange: (v: string) => void; textarea?: boolean }) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <span style={{ fontSize: 11, color: "#999", display: "block", marginBottom: 3 }}>{label}</span>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} style={input} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} style={input} />
      )}
    </label>
  );
}

const input: React.CSSProperties = { width: "100%", background: "#1e1e1e", border: "1px solid #333", borderRadius: 6, color: "#eee", padding: "7px 9px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };
const chip: React.CSSProperties = { background: "#222", border: "1px solid #333", color: "#ccc", borderRadius: 20, padding: "4px 10px", fontSize: 11, cursor: "pointer" };
const cta: React.CSSProperties = { width: "100%", background: "#7c3aed", border: 0, color: "#fff", borderRadius: 8, padding: "11px", fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 8 };
const tab: React.CSSProperties = { background: "#222", border: "1px solid #333", color: "#aaa", borderRadius: 5, padding: "2px 6px", fontSize: 10, cursor: "pointer" };
const tabActive: React.CSSProperties = { background: "#7c3aed", color: "#fff", borderColor: "#7c3aed" };
