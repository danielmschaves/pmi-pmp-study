import { renderHome } from "./views/home";
import { renderSetup } from "./views/setup";
import { renderPlay } from "./views/play";
import { renderResults } from "./views/results";
import { renderSessionHub } from "./views/session-hub";
import { renderSessionReport } from "./views/session-report";
import { renderLanding } from "./views/landing";
import { renderAuth } from "./views/auth";
import { getSession as getAuthSession, onAuthChange } from "./auth";
import { getSession as getQuizSession, setSession } from "./session";
import { loadBank } from "./lib/data";
import { installGlobalKeys, setKeyHandler } from "./lib/keys";

const root    = document.getElementById("app")!;
const sidebar = document.getElementById("sidebar") as HTMLElement;

const PUBLIC_ROUTES = new Set(["landing", "login", "signup", "demo"]);

const SIDEBAR_LOGO = `<svg width="28" height="28" viewBox="0 0 32 32" fill="none">
  <rect x="0.5" y="0.5" width="31" height="31" rx="9.5" stroke="rgba(255,255,255,0.16)"/>
  <path d="M9 22V10h6.5a4 4 0 0 1 0 8H12" stroke="oklch(70% 0.19 280)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="22.5" cy="21.5" r="1.6" fill="oklch(70% 0.19 280)"/>
</svg>`;

function showSidebar(routeName: string): void {
  sidebar.removeAttribute("hidden");
  document.body.classList.add("has-sidebar");

  const isHome    = routeName === "home";
  const isSession = routeName === "session-hub" || routeName === "session-report";

  sidebar.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:var(--s-6);padding:var(--s-1) 0;">
      ${SIDEBAR_LOGO}
      <span style="font-family:var(--f-display);font-size:20px;letter-spacing:-0.01em;line-height:1;">Pacing</span>
    </div>

    <div class="eyebrow" style="margin-bottom:var(--s-3);padding:0 var(--s-3);">Menu</div>

    <nav style="display:flex;flex-direction:column;gap:2px;margin-bottom:var(--s-4);">
      <a href="#/" class="sidebar-link ${isHome ? "is-active" : ""}">Home</a>
      <a href="#/session" class="sidebar-link ${isSession ? "is-active" : ""}">Study Session</a>
    </nav>

    <div style="flex:1;"></div>
    <div class="hairline" style="margin:var(--s-3) 0;"></div>
    <button class="sidebar-link" id="sidebar-settings">Settings</button>
  `;

  document.getElementById("sidebar-settings")?.addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("app:open-settings"));
  });
}

function hideSidebar(): void {
  sidebar.hidden = true;
  document.body.classList.remove("has-sidebar");
}

type Route =
  | { name: "landing" }
  | { name: "login" }
  | { name: "signup" }
  | { name: "demo" }
  | { name: "home" }
  | { name: "setup"; examId: string }
  | { name: "play" }
  | { name: "results" }
  | { name: "session-hub" }
  | { name: "session-report"; id: string | null };

function parseHash(): Route {
  const h = location.hash.replace(/^#/, "") || "/";
  if (h === "/" || h === "") return { name: "home" };
  if (h === "/landing") return { name: "landing" };
  if (h === "/login")   return { name: "login" };
  if (h === "/signup")  return { name: "signup" };
  if (h === "/demo")    return { name: "demo" };
  if (h.startsWith("/setup/")) {
    const after = h.slice("/setup/".length);
    const q = after.indexOf("?");
    return { name: "setup", examId: q === -1 ? after : after.slice(0, q) };
  }
  if (h.startsWith("/play"))    return { name: "play" };
  if (h.startsWith("/results")) return { name: "results" };
  if (h.startsWith("/session-report/"))
    return { name: "session-report", id: h.slice("/session-report/".length) || null };
  if (h.startsWith("/session-report")) return { name: "session-report", id: null };
  if (h.startsWith("/session"))  return { name: "session-hub" };
  return { name: "home" };
}

async function startDemo(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <main class="app-shell stack" style="justify-content:center;align-items:center;">
      <div class="eyebrow">Setting up your demo&hellip;</div>
    </main>`;

  try {
    const bank = await loadBank();
    // Shuffle with a simple Fisher-Yates and take 15
    const pool = [...bank];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    setSession({
      config: {
        examId: "demo",
        kind: "static",
        count: 15,
        domain: null,
        difficulty: null,
        showExplanation: false,
        seed: null,
        examMode: true,
        timeLimitSec: null,
        label: "Demo",
        demo: true,
      },
      questions: pool.slice(0, 15),
      index: 0,
      answers: [],
      startedAt: Date.now(),
    });
    location.hash = "#/play";
  } catch {
    location.hash = "#/landing";
  }
}

export function navigate(hash: string): void {
  if (location.hash === hash) render();
  else location.hash = hash;
}

async function render(): Promise<void> {
  setKeyHandler(null);
  const route = parseHash();

  if (!PUBLIC_ROUTES.has(route.name)) {
    // Fetch auth state first so isDemoPassthrough is correctly gated on "no session".
    const quizSess   = getQuizSession();
    const authSession = await getAuthSession();
    const isDemoPassthrough =
      !authSession &&
      quizSess?.config.demo === true &&
      (route.name === "play" || route.name === "results");

    if (!isDemoPassthrough) {
      if (!authSession) {
        hideSidebar();
        location.hash = "#/landing";
        return;
      }
    }

    if (!isDemoPassthrough) showSidebar(route.name);
    else hideSidebar();
  } else {
    hideSidebar();
  }

  root.innerHTML = "";
  switch (route.name) {
    case "landing":
      renderLanding(root);
      break;
    case "login":
      renderAuth(root, "login");
      break;
    case "signup":
      renderAuth(root, "signup");
      break;
    case "demo":
      await startDemo(root);
      break;
    case "home":
      renderHome(root);
      break;
    case "setup":
      renderSetup(root, route.examId);
      break;
    case "play":
      renderPlay(root);
      break;
    case "results":
      renderResults(root);
      break;
    case "session-hub":
      renderSessionHub(root);
      break;
    case "session-report":
      renderSessionReport(root, route.id);
      break;
  }
}

installGlobalKeys();
window.addEventListener("hashchange", () => { void render(); });

// Redirect to landing on sign-out; clean up URL on email-confirmation callback
onAuthChange((session) => {
  if (!session && !PUBLIC_ROUTES.has(parseHash().name)) {
    location.hash = "#/landing";
    return;
  }
  // Supabase email confirmation lands with ?access_token= or #access_token= in the URL.
  // Replace the messy URL with a clean home hash so the user doesn't see raw tokens.
  if (session && (location.search.includes("access_token") || location.hash.includes("access_token"))) {
    location.replace(location.origin + location.pathname + "#/");
  }
});

void render();
