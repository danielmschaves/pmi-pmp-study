import { renderHome } from "./views/home";
import { renderSetup } from "./views/setup";
import { renderPlay } from "./views/play";
import { renderResults } from "./views/results";
import { installGlobalKeys, setKeyHandler } from "./lib/keys";

const root = document.getElementById("app")!;

type Route =
  | { name: "home" }
  | { name: "setup"; examId: string }
  | { name: "play" }
  | { name: "results" };

function parseHash(): Route {
  const h = location.hash.replace(/^#/, "") || "/";
  if (h === "/" || h === "") return { name: "home" };
  if (h.startsWith("/setup/")) return { name: "setup", examId: h.slice("/setup/".length) };
  if (h.startsWith("/play")) return { name: "play" };
  if (h.startsWith("/results")) return { name: "results" };
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
  }
}

installGlobalKeys();
window.addEventListener("hashchange", render);
render();
