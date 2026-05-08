const LOGO_SVG = `<svg width="28" height="28" viewBox="0 0 32 32" fill="none">
  <rect x="0.5" y="0.5" width="31" height="31" rx="9.5" stroke="rgba(255,255,255,0.16)"/>
  <path d="M9 22V10h6.5a4 4 0 0 1 0 8H12" stroke="oklch(70% 0.19 280)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="22.5" cy="21.5" r="1.6" fill="oklch(70% 0.19 280)"/>
</svg>`;

function domainRow(name: string, pct: number): string {
  const tone = pct < 65 ? "warn" : "iris";
  return `
    <div class="row" style="gap:12px;">
      <span style="flex:0 0 78px;font-size:13px;color:var(--paper-2);">${name}</span>
      <div class="progress-track" style="flex:1;height:4px;">
        <span class="progress-fill ${tone}" style="width:${pct}%;"></span>
      </div>
      <span class="f-mono" style="font-size:12px;color:var(--paper-2);width:30px;text-align:right;">${pct}%</span>
    </div>`;
}

function featureRow(no: string, title: string, body: string): string {
  return `
    <div class="landing-feature-row" style="display:grid;grid-template-columns:auto 1fr;gap:14px;padding:20px 0;border-top:1px solid var(--line-1);">
      <span class="f-mono dim" style="font-size:11px;letter-spacing:0.06em;padding-top:2px;">${no}</span>
      <div>
        <div style="font-size:16px;font-weight:600;margin-bottom:4px;">${title}</div>
        <div class="dim" style="font-size:14px;line-height:1.5;">${body}</div>
      </div>
    </div>`;
}

export function renderLanding(root: HTMLElement): void {
  root.innerHTML = `
    <div class="landing-page">

      <!-- nav -->
      <nav class="landing-nav">
        <div class="landing-inner row">
          <div style="display:inline-flex;align-items:center;gap:10px;">
            ${LOGO_SVG}
            <span style="font-family:var(--f-display);font-size:20px;letter-spacing:-0.01em;line-height:1;">Pacing</span>
          </div>
          <span class="spacer"></span>
          <button class="btn btn-ghost" id="cta-login" style="min-height:36px;padding:0 14px;font-size:var(--t-sm);">Sign in</button>
        </div>
      </nav>

      <!-- hero -->
      <section class="landing-hero-section">
        <div class="landing-inner">
          <div class="landing-hero-grid">

            <!-- left: text + CTAs -->
            <div>
              <div class="eyebrow" style="margin-bottom:var(--s-5);">PMP &middot; Exam companion &middot; 2026</div>
              <h1 class="f-display" style="font-size:clamp(40px,6vw,72px);line-height:0.98;letter-spacing:-0.015em;margin:0 0 var(--s-5);">
                Study like<br><em>it&#8217;s already</em><br>exam day.
              </h1>
              <p style="color:var(--paper-2);line-height:1.55;margin:0 0 var(--s-6);max-width:380px;font-size:16px;">
                Session-based practice for the PMI-PMP. Adaptive presets, real timing, honest readiness scores &mdash; no fluff.
              </p>
              <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <button class="btn btn-iris btn-lg" id="cta-signup">Start studying &rarr;</button>
                <button class="btn btn-ghost btn-lg" id="cta-demo">Take a 15-q demo</button>
              </div>
            </div>

            <!-- right: readiness teaser card -->
            <div style="padding:24px;background:linear-gradient(180deg,var(--ink-2),var(--ink-1));border:1px solid var(--line-2);border-radius:var(--r-lg);box-shadow:var(--shadow-2);">
              <div class="row" style="margin-bottom:var(--s-3);">
                <span class="eyebrow">Your readiness</span>
                <span class="spacer"></span>
                <span class="f-mono dim" style="font-size:11px;">14 days &middot; 612 q</span>
              </div>
              <div class="row" style="align-items:baseline;gap:14px;margin-bottom:var(--s-5);">
                <span class="f-display" style="font-size:64px;line-height:1;letter-spacing:-0.02em;">
                  74<span style="font-size:28px;color:var(--paper-3);">%</span>
                </span>
                <span class="chip chip-ok">On track</span>
              </div>
              <div class="stack" style="gap:10px;">
                ${domainRow("People", 78)}
                ${domainRow("Process", 71)}
                ${domainRow("Business", 62)}
              </div>
              <p class="dim" style="font-size:12px;margin:var(--s-3) 0 0;font-family:var(--f-mono);">Sign in to track your readiness score</p>
            </div>

          </div>
        </div>
      </section>

      <!-- features -->
      <section class="landing-features-section">
        <div class="landing-inner">
          <div class="eyebrow" style="margin-bottom:var(--s-4);">Built for the way you actually study</div>
          <div class="landing-features-grid">
            ${featureRow("01", "Five honest presets", "Mini, Practice, Standard, Hard, Full exam. Each tunes question count, timer, and difficulty mix the way the real PMP feels.")}
            ${featureRow("02", "Domain-weighted scoring", "Targets match PMI&#8217;s official weights &mdash; 42% People, 50% Process, 8% Business &mdash; so your score reflects exam reality, not raw counts.")}
            ${featureRow("03", "Concept mastery, not vibes", "Every wrong answer maps to a sub-topic. We surface what to revisit before the next session, not after the exam.")}
          </div>
        </div>
      </section>

      <!-- footer -->
      <footer class="landing-footer">
        <div class="landing-inner">
          <div class="row" style="margin-bottom:var(--s-3);">
            <div style="display:inline-flex;align-items:center;gap:10px;">
              ${LOGO_SVG}
              <span style="font-family:var(--f-display);font-size:18px;letter-spacing:-0.01em;">Pacing</span>
            </div>
            <span class="spacer"></span>
            <span class="f-mono" style="font-size:11px;">v 1.0</span>
          </div>
          <div class="hairline" style="margin:var(--s-3) 0;"></div>
          <div class="row">
            <span class="f-mono" style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;">&copy; 2026 Pacing</span>
            <span class="spacer"></span>
            <span class="f-mono" style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;">Privacy &middot; Terms</span>
          </div>
        </div>
      </footer>

    </div>
  `;

  root.querySelector<HTMLButtonElement>("#cta-signup")!
    .addEventListener("click", () => { location.hash = "#/signup"; });
  root.querySelector<HTMLButtonElement>("#cta-login")!
    .addEventListener("click", () => { location.hash = "#/login"; });
  root.querySelector<HTMLButtonElement>("#cta-demo")!
    .addEventListener("click", () => { location.hash = "#/demo"; });
}
