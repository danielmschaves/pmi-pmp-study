"""
pdf_extractor.py

Extracts text from PDF files listed in sources.yml.
Uses pdfplumber (free, open source).

Output: data/raw/<source_id>_text.txt  (full text)
        data/raw/<source_id>_chunks.json (text split by page/section for Claude API)
"""

import json
import yaml
import pdfplumber
from pathlib import Path

ROOT = Path(__file__).parent.parent
SOURCES_FILE = ROOT / "ingestion" / "sources.yml"
RAW_DIR = ROOT / "data" / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)

# Max characters per chunk sent to Claude API (stays within context limits)
CHUNK_SIZE = 4000


def extract_pages(pdf_path: Path) -> list[dict]:
    """
    Extract text from each page of a PDF.
    Returns list of {page_num, text} dicts, skipping blank pages.
    """
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            text = page.extract_text()
            if text and text.strip():
                pages.append({"page": i, "text": text.strip()})
    return pages


def pages_to_chunks(pages: list[dict], chunk_size: int = CHUNK_SIZE) -> list[dict]:
    """
    Combine pages into chunks of roughly chunk_size characters.
    Each chunk records which pages it spans for traceability.
    """
    chunks = []
    current_text = ""
    current_pages = []

    for page in pages:
        if len(current_text) + len(page["text"]) > chunk_size and current_text:
            chunks.append({
                "chunk_index": len(chunks),
                "pages": current_pages[:],
                "text": current_text.strip(),
                "char_count": len(current_text.strip()),
            })
            current_text = ""
            current_pages = []

        current_text += " " + page["text"]
        current_pages.append(page["page"])

    if current_text.strip():
        chunks.append({
            "chunk_index": len(chunks),
            "pages": current_pages[:],
            "text": current_text.strip(),
            "char_count": len(current_text.strip()),
        })

    return chunks


def process_source(source: dict) -> dict:
    """
    Process a single PDF source entry.
    Returns the source dict with updated status.
    """
    source_id = source["id"]
    raw_path = source.get("path", "")
    pdf_path = (ROOT / raw_path).resolve() if not Path(raw_path).is_absolute() else Path(raw_path)

    out_text_path = RAW_DIR / f"{source_id}_text.txt"
    out_chunks_path = RAW_DIR / f"{source_id}_chunks.json"
    meta_path = RAW_DIR / f"{source_id}_meta.json"

    print(f"[{source_id}] Extracting text from: {pdf_path}")

    if not pdf_path.exists():
        print(f"[{source_id}] ERROR: File not found — {pdf_path}")
        source["status"] = "error"
        return source

    try:
        pages = extract_pages(pdf_path)

        if not pages:
            print(f"[{source_id}] ERROR: No extractable text found in PDF.")
            source["status"] = "error"
            return source

        # Save full text (one block)
        full_text = "\n\n".join(p["text"] for p in pages)
        out_text_path.write_text(full_text, encoding="utf-8")

        # Save chunks (for Claude API batching)
        chunks = pages_to_chunks(pages)
        out_chunks_path.write_text(json.dumps(chunks, indent=2, ensure_ascii=False), encoding="utf-8")

        # Save metadata
        meta = {
            "source_id": source_id,
            "path": str(pdf_path),
            "domain": source.get("domain"),
            "topic": source.get("topic", ""),
            "page_count": len(pages),
            "chunk_count": len(chunks),
            "char_count": len(full_text),
        }
        meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

        print(
            f"[{source_id}] {len(pages)} pages → {len(chunks)} chunks "
            f"({len(full_text):,} chars) → {out_text_path.name}"
        )
        source["status"] = "processed"

    except Exception as e:
        print(f"[{source_id}] ERROR: {e}")
        source["status"] = "error"

    return source


def run(filter_domain: int = None, force: bool = False):
    """
    Process all pending PDF sources in sources.yml.

    Args:
        filter_domain: If set, only process sources for this domain number.
        force: If True, reprocess sources already marked as 'processed'.
    """
    data = yaml.safe_load(SOURCES_FILE.read_text(encoding="utf-8"))
    sources = data.get("sources") or []

    pdf_sources = [
        s for s in sources
        if s["type"] == "pdf"
        and (force or s.get("status", "pending") == "pending")
        and (filter_domain is None or s.get("domain") == filter_domain)
    ]

    if not pdf_sources:
        print("No pending PDF sources found.")
        return

    print(f"Processing {len(pdf_sources)} PDF source(s)...\n")

    for source in pdf_sources:
        process_source(source)

    # Write back updated statuses to sources.yml
    yaml_out = yaml.dump({"sources": sources}, allow_unicode=True, sort_keys=False)
    SOURCES_FILE.write_text(yaml_out, encoding="utf-8")

    print(f"\nDone. Statuses updated in sources.yml.")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Extract text from PDF sources for PMP study.")
    parser.add_argument("--domain", type=int, default=None, help="Only process sources for this domain (1, 2, or 3)")
    parser.add_argument("--force", action="store_true", help="Reprocess already-processed sources")
    args = parser.parse_args()

    run(filter_domain=args.domain, force=args.force)
