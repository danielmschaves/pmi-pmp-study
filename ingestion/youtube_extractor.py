"""
youtube_extractor.py

Downloads transcripts from YouTube videos listed in sources.yml.
Uses youtube-transcript-api (free, no API key required).
Supports individual videos (type: youtube) and playlists (type: youtube_playlist).

Output:
  data/raw/<source_id>_transcript.txt   — flat readable text
  data/raw/<source_id>_segments.json    — timestamped segments (used by qa_extractor)
  data/raw/<source_id>_meta.json        — source metadata
"""

import json
import re
import yaml
import yt_dlp
from pathlib import Path
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound

ROOT = Path(__file__).parent.parent
SOURCES_FILE = ROOT / "ingestion" / "sources.yml"
RAW_DIR = ROOT / "data" / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)


def extract_video_id(url: str) -> str:
    """Extract the 11-character video ID from any YouTube URL format."""
    patterns = [
        r"(?:v=)([a-zA-Z0-9_-]{11})",       # ?v=XXXXXXXXXXX
        r"(?:youtu\.be/)([a-zA-Z0-9_-]{11})", # youtu.be/XXXXXXXXXXX
        r"(?:embed/)([a-zA-Z0-9_-]{11})",     # /embed/XXXXXXXXXXX
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    raise ValueError(f"Could not extract video ID from URL: {url}")


def fetch_transcript(video_id: str) -> list[dict]:
    """
    Fetch transcript segments from YouTube.
    Returns list of {text, start, duration} dicts.
    Tries English first, falls back to auto-generated captions.
    Compatible with youtube-transcript-api v1.x (instance-based API).
    """
    api = YouTubeTranscriptApi()
    try:
        fetched = api.fetch(video_id, languages=["en"])
        return fetched.to_raw_data()
    except NoTranscriptFound:
        transcript_list = api.list(video_id)
        fetched = transcript_list.find_generated_transcript(["en"]).fetch()
        return fetched.to_raw_data()


def transcript_to_text(segments: list[dict]) -> str:
    """Join transcript segments into a single clean text block."""
    lines = [seg["text"].strip() for seg in segments if seg["text"].strip()]
    return " ".join(lines)


def _format_time(seconds: float) -> str:
    """Format seconds as h:mm:ss."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def fetch_playlist_video_ids(playlist_url: str) -> list[str]:
    """Return ordered list of video IDs from a YouTube playlist (no download)."""
    ydl_opts = {
        "extract_flat": True,
        "quiet": True,
        "no_warnings": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(playlist_url, download=False)
        entries = info.get("entries") or []
        return [e["id"] for e in entries if e.get("id")]


def process_playlist_source(source: dict) -> dict:
    """
    Process a youtube_playlist source entry.
    Fetches transcripts for every video in the playlist and merges them
    into a single source, with each video's timestamps offset so they
    form a continuous timeline. This keeps the downstream pipeline unchanged.
    """
    source_id = source["id"]
    url = source["url"]
    out_path = RAW_DIR / f"{source_id}_transcript.txt"
    meta_path = RAW_DIR / f"{source_id}_meta.json"

    print(f"[{source_id}] Fetching playlist: {url}")

    try:
        video_ids = fetch_playlist_video_ids(url)
    except Exception as e:
        print(f"[{source_id}] ERROR: Could not fetch playlist — {e}")
        source["status"] = "error"
        return source

    if not video_ids:
        print(f"[{source_id}] ERROR: Playlist returned no videos.")
        source["status"] = "error"
        return source

    print(f"[{source_id}] Found {len(video_ids)} video(s) in playlist.")

    merged_segments: list[dict] = []
    time_offset = 0.0
    skipped = 0

    for idx, vid_id in enumerate(video_ids, start=1):
        try:
            segments = fetch_transcript(vid_id)
        except (TranscriptsDisabled, NoTranscriptFound) as e:
            print(f"[{source_id}]   [{idx}/{len(video_ids)}] {vid_id} — skipped ({e})")
            skipped += 1
            continue
        except Exception as e:
            print(f"[{source_id}]   [{idx}/{len(video_ids)}] {vid_id} — error ({e}), skipping")
            skipped += 1
            continue

        # Shift each segment's start time by the running offset
        for seg in segments:
            merged_segments.append({
                **seg,
                "start": round(seg["start"] + time_offset, 3),
            })

        # Advance offset past the last segment of this video (+its duration if available)
        if segments:
            last = segments[-1]
            gap = last.get("duration", 1.0)
            time_offset += last["start"] + gap

        print(f"[{source_id}]   [{idx}/{len(video_ids)}] {vid_id} — {len(segments)} segments")

    if not merged_segments:
        print(f"[{source_id}] ERROR: No usable transcripts found in playlist.")
        source["status"] = "error"
        return source

    text = transcript_to_text(merged_segments)
    out_path.write_text(text, encoding="utf-8")

    segments_path = RAW_DIR / f"{source_id}_segments.json"
    segments_path.write_text(json.dumps(merged_segments, indent=2), encoding="utf-8")

    duration_seconds = merged_segments[-1]["start"] + merged_segments[-1].get("duration", 0)
    meta = {
        "source_id": source_id,
        "playlist_url": url,
        "domain": source.get("domain"),
        "topic": source.get("topic", ""),
        "video_count": len(video_ids),
        "videos_skipped": skipped,
        "video_ids": video_ids,
        "segment_count": len(merged_segments),
        "duration_seconds": round(duration_seconds),
        "duration_label": _format_time(duration_seconds),
        "char_count": len(text),
    }
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    print(
        f"[{source_id}] {meta['duration_label']} | {len(video_ids)} videos "
        f"({skipped} skipped) | {len(merged_segments):,} segments | "
        f"{len(text):,} chars → {out_path.name}"
    )
    source["status"] = "processed"
    return source


def process_source(source: dict) -> dict:
    """
    Process a single YouTube source entry.
    Returns the source dict with updated status and output path.
    """
    source_id = source["id"]
    url = source["url"]
    out_path = RAW_DIR / f"{source_id}_transcript.txt"
    meta_path = RAW_DIR / f"{source_id}_meta.json"

    print(f"[{source_id}] Fetching transcript from: {url}")

    try:
        video_id = extract_video_id(url)
        segments = fetch_transcript(video_id)
        text = transcript_to_text(segments)

        # Save flat transcript (human-readable)
        out_path.write_text(text, encoding="utf-8")

        # Save raw segments with timestamps (used by qa_extractor for time partitioning)
        segments_path = RAW_DIR / f"{source_id}_segments.json"
        segments_path.write_text(json.dumps(segments, indent=2), encoding="utf-8")

        # Save metadata
        duration_seconds = segments[-1]["start"] + segments[-1].get("duration", 0) if segments else 0
        meta = {
            "source_id": source_id,
            "video_id": video_id,
            "url": url,
            "domain": source.get("domain"),
            "topic": source.get("topic", ""),
            "segment_count": len(segments),
            "duration_seconds": round(duration_seconds),
            "duration_label": _format_time(duration_seconds),
            "char_count": len(text),
        }
        meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

        print(
            f"[{source_id}] {meta['duration_label']} | {len(segments):,} segments | "
            f"{len(text):,} chars → {out_path.name}"
        )
        source["status"] = "processed"

    except TranscriptsDisabled:
        print(f"[{source_id}] ERROR: Transcripts are disabled for this video.")
        source["status"] = "error"
    except NoTranscriptFound:
        print(f"[{source_id}] ERROR: No English transcript found.")
        source["status"] = "error"
    except ValueError as e:
        print(f"[{source_id}] ERROR: {e}")
        source["status"] = "error"
    except Exception as e:
        print(f"[{source_id}] ERROR: Unexpected error — {e}")
        source["status"] = "error"

    return source


def run(filter_domain: int = None, force: bool = False):
    """
    Process all pending YouTube sources in sources.yml.

    Args:
        filter_domain: If set, only process sources for this domain number.
        force: If True, reprocess sources already marked as 'processed'.
    """
    data = yaml.safe_load(SOURCES_FILE.read_text(encoding="utf-8"))
    sources = data.get("sources") or []

    youtube_sources = [
        s for s in sources
        if s["type"] in ("youtube", "youtube_playlist")
        and (force or s.get("status", "pending") == "pending")
        and (filter_domain is None or s.get("domain") == filter_domain)
    ]

    if not youtube_sources:
        print("No pending YouTube sources found.")
        return

    print(f"Processing {len(youtube_sources)} YouTube source(s)...\n")

    updated = 0
    for source in youtube_sources:
        if source["type"] == "youtube_playlist":
            process_playlist_source(source)
        else:
            process_source(source)
        updated += 1

    # Write back updated statuses to sources.yml
    yaml_out = yaml.dump({"sources": sources}, allow_unicode=True, sort_keys=False)
    SOURCES_FILE.write_text(yaml_out, encoding="utf-8")

    print(f"\nDone. {updated} source(s) processed. Statuses updated in sources.yml.")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Download YouTube transcripts for PMP study sources.")
    parser.add_argument("--domain", type=int, default=None, help="Only process sources for this domain (1, 2, or 3)")
    parser.add_argument("--force", action="store_true", help="Reprocess already-processed sources")
    args = parser.parse_args()

    run(filter_domain=args.domain, force=args.force)
