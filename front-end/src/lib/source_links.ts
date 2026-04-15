import type { Question, SourceInfo } from "../types";

let cache: Map<string, SourceInfo> | null = null;
let inflight: Promise<Map<string, SourceInfo>> | null = null;

async function loadSources(): Promise<Map<string, SourceInfo>> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch("/data/sources.json");
      if (!r.ok) throw new Error(`sources.json: ${r.status}`);
      const data = (await r.json()) as SourceInfo[];
      const m = new Map<string, SourceInfo>();
      for (const s of data) m.set(s.id, s);
      cache = m;
      return m;
    } catch {
      cache = new Map();
      return cache;
    }
  })();
  return inflight;
}

/** Pre-warm the cache. Safe to call multiple times. */
export function preloadSources(): void {
  void loadSources();
}

/** Parse "0:00→15:07" or "00:05:00→00:20:00" into seconds (start side). */
export function parseSegmentStart(segment: string | undefined): number {
  if (!segment) return 0;
  const [left] = segment.split("→");
  return hmsToSeconds(left.trim());
}

function hmsToSeconds(s: string): number {
  if (!s) return 0;
  const parts = s.split(":").map((p) => parseInt(p, 10));
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] ?? 0;
}

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const v = u.searchParams.get("v");
    if (v) return v;
    if (u.hostname === "youtu.be") return u.pathname.replace(/^\//, "") || null;
    return null;
  } catch {
    return null;
  }
}

export type SourceLink = {
  href: string;
  label: string;
  precise: boolean;
  source: SourceInfo;
};

export async function resolveSourceLink(q: Question): Promise<SourceLink | null> {
  const sources = await loadSources();
  const src = sources.get(q.source_id);
  if (!src) return null;

  if (src.type === "youtube") {
    const id = extractYouTubeId(src.url);
    if (!id) return { href: src.url, label: "Open source video", precise: false, source: src };
    const t = parseSegmentStart(q.video_segment);
    const href = t > 0 ? `https://youtu.be/${id}?t=${t}` : `https://youtu.be/${id}`;
    return {
      href,
      label: t > 0 ? `Open at ${formatHMS(t)}` : "Open source video",
      precise: t > 0,
      source: src,
    };
  }

  // Playlist: no per-chunk mapping in v1 — land user on the playlist root.
  return {
    href: src.url,
    label: "Open playlist (no precise timestamp)",
    precise: false,
    source: src,
  };
}

function formatHMS(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
