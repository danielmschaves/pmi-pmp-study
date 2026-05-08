import { signIn, signUp } from "../auth";
import { pullAndMerge } from "../sync";

const LOGO_SVG = `<svg width="28" height="28" viewBox="0 0 32 32" fill="none">
  <rect x="0.5" y="0.5" width="31" height="31" rx="9.5" stroke="rgba(255,255,255,0.16)"/>
  <path d="M9 22V10h6.5a4 4 0 0 1 0 8H12" stroke="oklch(70% 0.19 280)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="22.5" cy="21.5" r="1.6" fill="oklch(70% 0.19 280)"/>
</svg>`;

const GOOGLE_ICON = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none">
  <path d="M17.5 9.18c0-.6-.05-1.18-.15-1.74H9v3.3h4.77c-.2 1.1-.83 2.04-1.78 2.66v2.2h2.88C16.53 13.79 17.5 11.61 17.5 9.18z" fill="#4285F4"/>
  <path d="M9 18c2.4 0 4.42-.8 5.88-2.16l-2.88-2.2c-.8.54-1.82.86-3 .86-2.3 0-4.26-1.55-4.96-3.65H1.06v2.27A8.99 8.99 0 0 0 9 18z" fill="#34A853"/>
  <path d="M4.04 10.85a5.4 5.4 0 0 1 0-3.7V4.88H1.06a9 9 0 0 0 0 8.24l2.98-2.27z" fill="#FBBC05"/>
  <path d="M9 3.58c1.32 0 2.5.45 3.42 1.34l2.55-2.55C13.42.89 11.4 0 9 0A8.99 8.99 0 0 0 1.06 4.88l2.98 2.27C4.74 5.05 6.7 3.58 9 3.58z" fill="#EA4335"/>
</svg>`;

const APPLE_ICON = `<svg width="14" height="17" viewBox="0 0 14 17" fill="var(--paper)">
  <path d="M11.6 8.9c0-2 1.6-2.9 1.7-3-.9-1.4-2.4-1.5-2.9-1.6-1.2-.1-2.4.7-3 .7-.6 0-1.6-.7-2.7-.7-1.4 0-2.7.8-3.4 2.1-1.5 2.5-.4 6.3 1 8.4.7 1 1.5 2.1 2.6 2 1 0 1.5-.7 2.7-.7 1.3 0 1.6.7 2.7.6 1.1 0 1.8-1 2.5-2 .8-1.2 1.1-2.3 1.1-2.4-.1 0-2.2-.8-2.3-3.4zM9.7 3c.5-.6 1-1.5.8-2.4-.8 0-1.7.5-2.3 1.2-.5.5-1 1.5-.8 2.3.9.1 1.8-.4 2.3-1.1z"/>
</svg>`;

export function renderAuth(root: HTMLElement, mode: "login" | "signup"): void {
  const isSignup = mode === "signup";

  root.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:var(--s-2);">
          ${LOGO_SVG}
          <span style="font-family:var(--f-display);font-size:20px;letter-spacing:-0.01em;line-height:1;">Pacing</span>
        </div>

        <div style="margin-bottom:var(--s-5);">
          <div class="eyebrow" style="margin-bottom:var(--s-3);">${isSignup ? "New here" : "Welcome back"}</div>
          <h1 class="f-display" style="font-size:38px;line-height:1.05;letter-spacing:-0.015em;margin:0;">
            ${isSignup ? "Create your<br>account." : "Pick up<br><em>where you left off.</em>"}
          </h1>
        </div>

        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:var(--s-4);">
          <button class="btn btn-ghost btn-lg btn-block" id="btn-google" style="justify-content:flex-start;padding-left:18px;gap:12px;">
            <span style="width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;">${GOOGLE_ICON}</span>
            <span style="flex:1;text-align:left;">Continue with Google</span>
          </button>
          <button class="btn btn-ghost btn-lg btn-block" id="btn-apple" style="justify-content:flex-start;padding-left:18px;gap:12px;">
            <span style="width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;">${APPLE_ICON}</span>
            <span style="flex:1;text-align:left;">Continue with Apple</span>
          </button>
        </div>

        <div class="hairline-dot" style="margin-bottom:var(--s-4);">or</div>

        <form class="auth-form" id="auth-form" novalidate>
          <div class="auth-field">
            <label class="field-label" for="auth-email">Email</label>
            <input
              id="auth-email"
              class="input"
              type="email"
              autocomplete="${isSignup ? "email" : "username"}"
              placeholder="you@example.com"
              required
            />
          </div>
          <div class="auth-field">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
              <label class="field-label" for="auth-password" style="margin-bottom:0;">Password</label>
              ${!isSignup ? `<a class="dim" style="font-size:12px;text-decoration:underline;text-underline-offset:3px;" href="#">Forgot?</a>` : ""}
            </div>
            <input
              id="auth-password"
              class="input"
              type="password"
              autocomplete="${isSignup ? "new-password" : "current-password"}"
              placeholder="${isSignup ? "Min. 6 characters" : "••••••••"}"
              minlength="6"
              required
            />
          </div>

          <div id="auth-error"   class="auth-error"   hidden aria-live="polite"></div>
          <div id="auth-success" class="auth-success" hidden aria-live="polite"></div>

          <button class="btn btn-iris btn-block btn-lg" type="submit" id="auth-submit">
            <span>${isSignup ? "Create account" : "Sign in"}</span>
            <span class="kbd">&crarr;</span>
          </button>
        </form>

        <p class="auth-switch">
          ${isSignup
            ? `Already have an account? <a href="#/login">Log in</a>`
            : `New here? <a href="#/signup">Create an account</a> &mdash; your first session is free.`}
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

  root.querySelector<HTMLButtonElement>("#btn-google")!.addEventListener("click", () => {
    setMessage(errorEl, "Google sign-in is not yet available. Use email/password below.");
  });
  root.querySelector<HTMLButtonElement>("#btn-apple")!.addEventListener("click", () => {
    setMessage(errorEl, "Apple sign-in is not yet available. Use email/password below.");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email    = emailInput.value.trim();
    const password = pwInput.value;

    errorEl.hidden   = true;
    successEl.hidden = true;
    submitBtn.disabled    = true;
    submitBtn.textContent = isSignup ? "Creating account…" : "Signing in…";

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
    submitBtn.textContent = isSignup ? "Create account" : "Sign in";
  });
}

function setMessage(el: HTMLElement, text: string): void {
  el.textContent = text;
  el.hidden = false;
}
