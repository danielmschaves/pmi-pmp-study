import { renderHome } from "./views/home";
import { renderSetup } from "./views/setup";
import { renderPlay } from "./views/play";
import { renderResults } from "./views/results";
import { renderSessionHub } from "./views/session-hub";
import { renderSessionReport } from "./views/session-report";
import { installGlobalKeys, setKeyHandler } from "./lib/keys";

const root = document.getElementById("app")!;

type Route =
  | { name: "home" }
  | { name: "setup"; examId: string }
  | { name: "play" }
  | { name: "results" }
  | { name: "session-hub" }
  | { name: "session-report"; id: string | null };

function parseHash(): Route {
  const h = location.hash.replace(/^#/, "") || "/";
  if (h === "/" || h === "") return { name: "home" };
  if (h.startsWith("/setup/")) {
    const after = h.slice("/setup/".length);
    const q = after.indexOf("?");
    return { name: "setup", examId: q === -1 ? after : after.slice(0, q) };
  }
  if (h.startsWith("/play")) return { name: "play" };
  if (h.startsWith("/results")) return { name: "results" };
  if (h.startsWith("/session-report/"))
    return { name: "session-report", id: h.slice("/session-report/".length) || null };
  if (h.startsWith("/session-report")) return { name: "session-report", id: null };
  if (h.startsWith("/session")) return { name: "session-hub" };
  return { name: "home" };
}

export function navigate(hash: string): void {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function render(): void {
  setKeyHandler(null);
  const route = parseHash();
  root.innerHTML = "";
  switch (route.name) {
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
window.addEventListener("hashchange", render);
render();
