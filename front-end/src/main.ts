import { renderHome } from "./views/home";
import { renderSetup } from "./views/setup";
import { renderPlay } from "./views/play";
import { renderResults } from "./views/results";
import { renderSessionHub } from "./views/session-hub";
import { renderSessionReport } from "./views/session-report";
import { renderLanding } from "./views/landing";
import { renderAuth } from "./views/auth";
import { getSession, onAuthChange } from "./auth";
import { installGlobalKeys, setKeyHandler } from "./lib/keys";

const root = document.getElementById("app")!;

const PUBLIC_ROUTES = new Set(["landing", "login", "signup"]);

type Route =
  | { name: "landing" }
  | { name: "login" }
  | { name: "signup" }
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

export function navigate(hash: string): void {
  if (location.hash === hash) render();
  else location.hash = hash;
}

async function render(): Promise<void> {
  setKeyHandler(null);
  const route = parseHash();

  if (!PUBLIC_ROUTES.has(route.name)) {
    const session = await getSession();
    if (!session) {
      location.hash = "#/landing";
      return;
    }
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

// Redirect to landing on sign-out; redirect home after sign-in
onAuthChange((session) => {
  if (!session && !PUBLIC_ROUTES.has(parseHash().name)) {
    location.hash = "#/landing";
  }
});

void render();
