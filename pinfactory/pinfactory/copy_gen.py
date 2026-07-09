"""Component 2 — the pin copy generator.

For every image variant it writes a Pinterest **title** (keyword-first, ≤100
chars) and **description** (reader-search language, ≤500 chars, soft CTA, no
hashtags), varying phrasing across a book's variants so no two are near-identical.

Two backends:
  - `anthropic` (default): calls the Anthropic API. Model comes from
    ANTHROPIC_MODEL in .env, else config `copy.default_model`.
  - `mock`: an offline, deterministic template backend (assembled from your
    metadata + approved keywords). Lets you run the whole pipeline — and the
    review gallery — without a key or spending tokens. Mock copy is clearly
    marked (model = "mock") and is NOT model-generated.

Nothing here is published; generated copy lands in the DB as `draft` and must be
approved in the review gallery before it is eligible to publish.
"""

from __future__ import annotations

import json
import os
import textwrap
from dataclasses import dataclass
from typing import Any

from . import db as dbmod
from . import keywords as kwmod
from .config import Config, load_env

# Angle guidance per template, so the model varies the copy across a book's set.
VARIANT_ANGLES = {
    "headline": "Lead with the broad subgenre + the #1 trope, in reader-search language. The most keyword-forward of the set.",
    "trope_hook": "Emotional-hook angle built on the tension between the tropes. Make a reader feel the conflict.",
    "quote_card": "Evocative, quote-driven angle that leans on the mood/tone. Fewer hard keywords, more feeling.",
    "comp_card": "Read-alike / comp angle: 'if you love <trope/subgenre>, you'll love this'. Frame it as a recommendation.",
    "tropes_checklist": "Trope-stack angle: name the stack of tropes a reader gets. Great for trope hunters.",
    "stats_card": "At-a-glance angle: quick facts a reader scans (subgenre, series, tropes).",
}

TITLE_MAX = 100
DESC_MAX = 500

_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "variants": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "variant": {"type": "string"},
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                },
                "required": ["variant", "title", "description"],
            },
        },
        "hook": {"type": "string"},
    },
    "required": ["variants"],
}

SYSTEM = (
    "You are a Pinterest SEO copywriter for indie romance authors. You write pin "
    "titles and descriptions in the language REAL READERS type into Pinterest "
    "search — not marketer hype. Rules you always follow:\n"
    "- Title: <=100 characters, put the primary reader-search keyword FIRST "
    "(e.g. 'Dark Romance Books | Enemies to Lovers with a Morally Gray Hero').\n"
    "- Description: <=500 characters, keyword-rich but natural, ends with a soft "
    "call to action (e.g. 'Add it to your TBR.'). No hashtags. No emoji spam.\n"
    "- Use ONLY the tropes, subgenre, and approved keywords provided. Never "
    "invent plot details, review quotes, or facts about the book.\n"
    "- Vary phrasing across the variants for the same book so descriptions are "
    "not near-identical. Match each variant's stated angle.\n"
    "- Never mention another author or real book by name."
)


@dataclass
class VariantCopy:
    variant: str
    title: str
    description: str


class Backend:
    name = "backend"

    def generate(self, book, pen_voice: str, variants: list[str],
                 keywords: list[str], want_hook: bool) -> dict[str, Any]:
        raise NotImplementedError

    def suggest_keywords(self, subgenre: str, existing: list[str], n: int = 15) -> list[str]:
        raise NotImplementedError


# --------------------------------------------------------------------------- #
# Anthropic backend
# --------------------------------------------------------------------------- #
class AnthropicBackend(Backend):
    name = "anthropic"

    def __init__(self, model: str, api_key: str | None = None):
        self.model = model
        self._api_key = api_key
        self._client = None

    def _client_lazy(self):
        if self._client is None:
            try:
                import anthropic
            except ImportError as e:
                raise RuntimeError(
                    "The 'anthropic' package is required for live copy generation. "
                    "Run `pip install anthropic`, or use --mock for offline testing."
                ) from e
            kwargs = {"api_key": self._api_key} if self._api_key else {}
            self._client = anthropic.Anthropic(**kwargs)
        return self._client

    def generate(self, book, pen_voice, variants, keywords, want_hook) -> dict[str, Any]:
        client = self._client_lazy()
        prompt = _build_prompt(book, pen_voice, variants, keywords, want_hook)
        resp = client.messages.create(
            model=self.model,
            max_tokens=2000,
            system=SYSTEM,
            output_config={"format": {"type": "json_schema", "schema": _SCHEMA}},
            messages=[{"role": "user", "content": prompt}],
        )
        text = next((b.text for b in resp.content if b.type == "text"), "{}")
        data = json.loads(text)
        return data

    def suggest_keywords(self, subgenre, existing, n=15) -> list[str]:
        client = self._client_lazy()
        schema = {"type": "object", "additionalProperties": False,
                  "properties": {"phrases": {"type": "array", "items": {"type": "string"}}},
                  "required": ["phrases"]}
        prompt = (
            f"Propose {n} NEW Pinterest reader-search keyword phrases for the romance "
            f"subgenre '{subgenre}'. These are phrases real readers type into Pinterest "
            f"search to find books to read (e.g. 'enemies to lovers dark romance', "
            f"'morally gray hero'). Lowercase, 2-6 words, no hashtags, no author names.\n"
            f"Do NOT repeat any of these existing phrases:\n{', '.join(existing) or '(none)'}\n"
            f"Return JSON {{\"phrases\": [...]}}.")
        resp = client.messages.create(
            model=self.model, max_tokens=1000, system=SYSTEM,
            output_config={"format": {"type": "json_schema", "schema": schema}},
            messages=[{"role": "user", "content": prompt}])
        text = next((b.text for b in resp.content if b.type == "text"), "{}")
        return [p.strip() for p in json.loads(text).get("phrases", []) if p.strip()]


def _build_prompt(book, pen_voice, variants, keywords, want_hook) -> str:
    tropes = ", ".join(dbmod.book_tropes(book)) or "(none provided)"
    lines = [
        f"Book title: {book['title'] or '(untitled)'}",
        f"Pen name: {book['pen_name'] or '(none)'}",
        f"Subgenre: {book['subgenre'] or '(none)'}",
        f"Series: {book['series'] or 'standalone'}",
        f"Tropes: {tropes}",
        f"Tagline (if any): {book['tagline'] or '(none)'}",
        f"Pen-name voice notes: {pen_voice or '(none)'}",
        "",
        "Approved reader-search keywords to weave in (use naturally, do not stuff):",
        ", ".join(keywords) if keywords else "(none — rely on the tropes/subgenre above)",
        "",
        "Write copy for these variants, each with its angle:",
    ]
    for v in variants:
        lines.append(f"- {v}: {VARIANT_ANGLES.get(v, 'general')}")
    lines += [
        "",
        "Return JSON: {\"variants\":[{\"variant\":..., \"title\":..., \"description\":...}, ...]"
        + (", \"hook\": a <=90-char emotional one-liner for a cover mockup (no book facts invented)}"
           if want_hook else "}"),
        f"Titles <= {TITLE_MAX} chars, descriptions <= {DESC_MAX} chars.",
    ]
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# Mock backend (offline, deterministic, clearly not model-generated)
# --------------------------------------------------------------------------- #
class MockBackend(Backend):
    name = "mock"

    def generate(self, book, pen_voice, variants, keywords, want_hook) -> dict[str, Any]:
        tropes = [t.title() for t in dbmod.book_tropes(book)]
        sub = (book["subgenre"] or "Romance").title()
        kw = keywords[:] or []
        t1 = tropes[0] if tropes else sub
        t2 = tropes[1] if len(tropes) > 1 else ""
        cta = "Add it to your TBR."

        def clamp(s, n):
            return s if len(s) <= n else s[: n - 1].rstrip() + "…"

        def desc(body):
            return clamp(f"{body} {cta}", DESC_MAX)

        stack = ", ".join(tropes) if tropes else sub
        out = []
        for v in variants:
            if v == "headline":
                title = clamp(f"{sub} Books | {t1}" + (f" with a {t2}" if t2 else ""), TITLE_MAX)
                body = f"A {sub.lower()} read for fans of {stack.lower()}."
            elif v == "trope_hook":
                title = clamp(f"{t1} Romance | {sub} Book Recs", TITLE_MAX)
                body = f"If {t1.lower()}" + (f" and {t2.lower()}" if t2 else "") + f" are your thing, this {sub.lower()} is for you."
            elif v == "quote_card":
                title = clamp(f"{sub} Quotes | Books Like This", TITLE_MAX)
                body = (book["tagline"] or f"A {sub.lower()} that lingers.").strip().strip('"') + f" A {sub.lower()} for your list."
            elif v == "comp_card":
                title = clamp(f"If You Love {t1} | {sub} Books", TITLE_MAX)
                body = f"Loved {stack.lower()}? This {sub.lower()} scratches the same itch."
            elif v == "tropes_checklist":
                title = clamp(f"{sub} Tropes | {t1}" + (f" + {t2}" if t2 else ""), TITLE_MAX)
                body = f"The trope stack: {stack.lower()}. A {sub.lower()} made for trope hunters."
            else:  # stats_card / fallback
                title = clamp(f"{sub} Book | At a Glance", TITLE_MAX)
                body = f"{sub}. Tropes: {stack.lower()}."
            # weave one keyword if available and it fits
            if kw:
                k = kw[hash(v) % len(kw)]
                if k.lower() not in body.lower() and len(body) + len(k) + 10 < DESC_MAX - len(cta):
                    body = f"{body} Perfect if you search '{k}'."
            out.append({"variant": v, "title": title, "description": desc(body)})

        result = {"variants": out}
        if want_hook:
            if t2:
                result["hook"] = f"{t1}. {t2}. One story you won't put down."
            elif tropes:
                result["hook"] = f"{t1} — and everything it costs her."
        return result

    def suggest_keywords(self, subgenre, existing, n=15) -> list[str]:
        sub = subgenre.lower()
        base = [
            f"{sub} books", f"{sub} book recommendations", f"best {sub} books",
            f"{sub} to read", f"spicy {sub}", f"{sub} book recs", f"{sub} tbr",
            f"new {sub} releases", f"{sub} book aesthetic", f"{sub} for beginners",
            f"underrated {sub} books", f"{sub} with a happy ending",
            f"{sub} slow burn", f"{sub} book list", f"cozy {sub} reads",
        ]
        ex = {e.lower() for e in existing}
        return [p for p in base if p not in ex][:n]


# --------------------------------------------------------------------------- #
# Orchestrator
# --------------------------------------------------------------------------- #
class CopyGenerator:
    def __init__(self, cfg: Config, database: dbmod.DB, backend: Backend):
        self.cfg = cfg
        self.db = database
        self.backend = backend

    def generate_for_books(self, books, overwrite_approved: bool = False) -> dict[str, int]:
        stats = {"copy": 0, "hooks": 0, "skipped_books": 0, "kept_approved": 0}
        for book in books:
            images = self.db.list_images(book["slug"])
            if not images:
                stats["skipped_books"] += 1
                continue
            pen = self.db.get_pen_name(book["pen_name"]) if book["pen_name"] else None
            voice = pen["voice_notes"] if pen else ""
            keywords = kwmod.approved_for(self.db, book["subgenre"]) if book["subgenre"] else []
            variants = [img["variant"] for img in images]
            want_hook = not (book["hook"] or "").strip() and "trope_hook" in variants

            data = self.backend.generate(book, voice, variants, keywords, want_hook)
            by_variant = {d["variant"]: d for d in data.get("variants", [])}

            for img in images:
                existing = self.db.get_copy_for_image(img["id"])
                if existing and existing["status"] == "approved" and not overwrite_approved:
                    stats["kept_approved"] += 1
                    continue
                d = by_variant.get(img["variant"])
                if not d:
                    continue
                title = _clamp(d.get("title", ""), TITLE_MAX)
                description = _clamp(d.get("description", ""), DESC_MAX)
                self.db.upsert_copy(img["id"], title, description, self.backend.name)
                stats["copy"] += 1

            hook = (data.get("hook") or "").strip()
            if want_hook and hook:
                self.db.set_hook_suggestion(book["slug"], _clamp(hook, 90))
                stats["hooks"] += 1
        return stats


def _clamp(s: str, n: int) -> str:
    s = (s or "").strip()
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def make_backend(cfg: Config, use_mock: bool, model_override: str | None = None) -> Backend:
    if use_mock:
        return MockBackend()
    env = load_env(cfg)
    model = model_override or env.get("ANTHROPIC_MODEL") or cfg.get("copy", "default_model",
                                                                    default="claude-opus-4-8")
    api_key = env.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_API_KEY")
    return AnthropicBackend(model=model, api_key=api_key)
