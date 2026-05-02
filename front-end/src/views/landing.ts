export function renderLanding(root: HTMLElement): void {
  root.innerHTML = `
    <div class="landing">
      <div class="landing-hero">
        <h1 class="landing-title">Master the PMP.<br>On Your Schedule.</h1>
        <p class="landing-sub">
          Adaptive question bank aligned to PMI ECO 2021 &mdash; tracks what you have seen,
          shows unseen questions first, and syncs progress across all your devices.
        </p>
        <div class="landing-cta">
          <button class="btn btn-primary" id="cta-signup">Get started &mdash; free</button>
          <button class="btn btn-ghost" id="cta-login">Log in</button>
        </div>
      </div>

      <div class="landing-features">
        <div class="landing-feature">
          <span class="landing-feature-label">343+ questions</span>
          <p>Expert and hard difficulty, domain-weighted to the real exam.</p>
        </div>
        <div class="landing-feature">
          <span class="landing-feature-label">Adaptive order</span>
          <p>Unseen questions always appear first. Spaced repetition built in.</p>
        </div>
        <div class="landing-feature">
          <span class="landing-feature-label">Cross-device sync</span>
          <p>Your progress and session history follow you everywhere.</p>
        </div>
      </div>
    </div>
  `;

  root.querySelector<HTMLButtonElement>("#cta-signup")!
    .addEventListener("click", () => { location.hash = "#/signup"; });
  root.querySelector<HTMLButtonElement>("#cta-login")!
    .addEventListener("click", () => { location.hash = "#/login"; });
}
