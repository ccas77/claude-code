"""Reads book files and extracts structured content for post generation.

Supports: .txt, .md, .pdf, .epub
Extracts: chapters, key passages, quotes, themes, and character descriptions.
"""

from __future__ import annotations

import re
from pathlib import Path
from dataclasses import dataclass, field

from config import Config


@dataclass
class BookContent:
    """Structured content extracted from a book."""

    title: str
    author: str
    genre: str
    raw_text: str
    chapters: list[dict] = field(default_factory=list)
    quotes: list[str] = field(default_factory=list)
    passages: list[str] = field(default_factory=list)

    def summary_for_prompt(self, max_chars: int = 12000) -> str:
        """Return a condensed version suitable for an LLM prompt."""
        parts = [
            f"Title: {self.title}",
            f"Author: {self.author}",
            f"Genre: {self.genre}",
            f"Chapters: {len(self.chapters)}",
        ]
        if self.quotes:
            parts.append(
                "Notable quotes:\n" + "\n".join(f'- "{q}"' for q in self.quotes[:20])
            )
        if self.chapters:
            parts.append("Chapter summaries:")
            for ch in self.chapters[:30]:
                snippet = ch["text"][:400] + "..." if len(ch["text"]) > 400 else ch["text"]
                parts.append(f"  [{ch['title']}]: {snippet}")

        result = "\n".join(parts)
        if len(result) > max_chars:
            result = result[:max_chars] + "\n... [truncated]"
        return result


def read_txt(path: Path) -> str:
    """Read a plain text file."""
    return path.read_text(encoding="utf-8", errors="replace")


def read_md(path: Path) -> str:
    """Read a Markdown file (treated as plain text)."""
    return path.read_text(encoding="utf-8", errors="replace")


def read_pdf(path: Path) -> str:
    """Read a PDF file using PyPDF2."""
    from PyPDF2 import PdfReader

    reader = PdfReader(str(path))
    pages = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages.append(text)
    return "\n\n".join(pages)


def read_epub(path: Path) -> str:
    """Read an EPUB file using ebooklib + BeautifulSoup."""
    import ebooklib
    from ebooklib import epub
    from bs4 import BeautifulSoup

    book = epub.read_epub(str(path))
    texts = []
    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        soup = BeautifulSoup(item.get_content(), "html.parser")
        text = soup.get_text(separator="\n", strip=True)
        if text.strip():
            texts.append(text)
    return "\n\n".join(texts)


READERS = {
    ".txt": read_txt,
    ".md": read_md,
    ".pdf": read_pdf,
    ".epub": read_epub,
}


def extract_chapters(text: str) -> list[dict]:
    """Split text into chapters based on common heading patterns."""
    # Match patterns like "Chapter 1", "CHAPTER ONE", "Part I", "## Chapter"
    pattern = r"(?:^|\n)(?:#{1,3}\s*)?(?:chapter|part|section)\s+[\divxlc\w]+[:\.\s\-]*[^\n]*"
    splits = list(re.finditer(pattern, text, re.IGNORECASE))

    if not splits:
        # Fallback: split into equal-sized chunks
        chunk_size = 3000
        chunks = []
        for i in range(0, len(text), chunk_size):
            chunks.append({
                "title": f"Section {len(chunks) + 1}",
                "text": text[i : i + chunk_size].strip(),
            })
        return chunks

    chapters = []
    for i, match in enumerate(splits):
        title = match.group().strip().lstrip("#").strip()
        start = match.end()
        end = splits[i + 1].start() if i + 1 < len(splits) else len(text)
        body = text[start:end].strip()
        if body:
            chapters.append({"title": title, "text": body})

    return chapters


def extract_quotes(text: str) -> list[str]:
    """Extract notable quotable passages from the text."""
    quotes = []

    # Pull text in quotation marks (dialogue or notable phrases)
    quoted = re.findall(r'["\u201c]([^"\u201d]{30,200})["\u201d]', text)
    for q in quoted:
        clean = q.strip()
        # Filter out mundane dialogue - keep vivid or meaningful lines
        if any(
            word in clean.lower()
            for word in [
                "life", "love", "dream", "hope", "fear", "truth", "heart",
                "soul", "world", "time", "believe", "remember", "never",
                "always", "destiny", "courage", "strength", "change",
            ]
        ):
            quotes.append(clean)

    # Deduplicate while preserving order
    seen = set()
    unique = []
    for q in quotes:
        if q not in seen:
            seen.add(q)
            unique.append(q)

    return unique[:50]  # Cap at 50 quotes


def read_books() -> BookContent:
    """Read all book files from the configured directory and merge content."""
    book_dir = Config.BOOK_DIR
    if not book_dir.is_absolute():
        book_dir = Config.BASE_DIR / book_dir

    if not book_dir.exists():
        raise FileNotFoundError(
            f"Book directory not found: {book_dir}\n"
            f"Create it and add your book files (.txt, .md, .pdf, .epub)"
        )

    all_text = []
    files_read = []

    for ext, reader_fn in READERS.items():
        for filepath in sorted(book_dir.glob(f"*{ext}")):
            print(f"  Reading: {filepath.name}")
            try:
                text = reader_fn(filepath)
                all_text.append(text)
                files_read.append(filepath.name)
            except Exception as e:
                print(f"  Warning: Failed to read {filepath.name}: {e}")

    if not all_text:
        raise FileNotFoundError(
            f"No readable book files found in {book_dir}\n"
            f"Supported formats: {', '.join(READERS.keys())}"
        )

    combined = "\n\n".join(all_text)
    print(f"  Read {len(files_read)} file(s): {', '.join(files_read)}")
    print(f"  Total text length: {len(combined):,} characters")

    chapters = extract_chapters(combined)
    quotes = extract_quotes(combined)

    return BookContent(
        title=Config.BOOK_TITLE,
        author=Config.BOOK_AUTHOR,
        genre=Config.BOOK_GENRE,
        raw_text=combined,
        chapters=chapters,
        quotes=quotes,
        passages=[ch["text"][:500] for ch in chapters[:20]],
    )
