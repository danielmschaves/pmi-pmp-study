type Handler = (e: KeyboardEvent) => void;

let current: Handler | null = null;

export function setKeyHandler(h: Handler | null): void {
  current = h;
}

export function installGlobalKeys(): void {
  window.addEventListener("keydown", (e) => {
    if (!current) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    current(e);
  });
}
