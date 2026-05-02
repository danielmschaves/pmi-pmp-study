import { signIn, signUp } from "../auth";
import { pullAndMerge } from "../sync";

export function renderAuth(root: HTMLElement, mode: "login" | "signup"): void {
  const isSignup = mode === "signup";

  root.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <h1 class="auth-title">${isSignup ? "Create account" : "Welcome back"}</h1>

        <form class="auth-form" id="auth-form" novalidate>
          <div class="auth-field">
            <label for="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              autocomplete="${isSignup ? "email" : "username"}"
              placeholder="you@example.com"
              required
            />
          </div>
          <div class="auth-field">
            <label for="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              autocomplete="${isSignup ? "new-password" : "current-password"}"
              placeholder="${isSignup ? "Min. 6 characters" : ""}"
              minlength="6"
              required
            />
          </div>

          <div id="auth-error"   class="auth-error"   hidden aria-live="polite"></div>
          <div id="auth-success" class="auth-success" hidden aria-live="polite"></div>

          <button class="btn btn-primary" type="submit" id="auth-submit">
            ${isSignup ? "Create account" : "Log in"}
          </button>
        </form>

        <p class="auth-switch">
          ${isSignup
            ? `Already have an account? <a href="#/login">Log in</a>`
            : `No account yet? <a href="#/signup">Sign up free</a>`}
        </p>
      </div>
    </div>
  `;

  const form       = root.querySelector<HTMLFormElement>("#auth-form")!;
  const emailInput = root.querySelector<HTMLInputElement>("#auth-email")!;
  const pwInput    = root.querySelector<HTMLInputElement>("#auth-password")!;
  const errorEl    = root.querySelector<HTMLElement>("#auth-error")!;
  const successEl  = root.querySelector<HTMLElement>("#auth-success")!;
  const submitBtn  = root.querySelector<HTMLButtonElement>("#auth-submit")!;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email    = emailInput.value.trim();
    const password = pwInput.value;

    errorEl.hidden   = true;
    successEl.hidden = true;
    submitBtn.disabled  = true;
    submitBtn.textContent = isSignup ? "Creating account…" : "Logging in…";

    if (isSignup) {
      const { error } = await signUp(email, password);
      if (error) {
        setMessage(errorEl, error.message);
      } else {
        setMessage(successEl, "Check your email to confirm your account.");
      }
    } else {
      const { data, error } = await signIn(email, password);
      if (error) {
        setMessage(errorEl, error.message);
      } else if (data.session) {
        await pullAndMerge(data.session.user.id);
        location.hash = "#/";
      }
    }

    submitBtn.disabled    = false;
    submitBtn.textContent = isSignup ? "Create account" : "Log in";
  });
}

function setMessage(el: HTMLElement, text: string): void {
  el.textContent = text;
  el.hidden = false;
}
