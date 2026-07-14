# Eva marketing site

A static, dependency-free landing page for Eva. Plain HTML/CSS plus two
vanilla-JS files: the live graph hero, and a small i18n layer covering the
same ten interface languages as the app (system-language default, saved
choice, `?lang=` override), reusing the app's established vocabulary per
locale. Fonts are self-hosted copies of the exact families the desktop app
uses (Fragment Mono, Instrument Sans Variable, Newsreader Variable). Design
tokens are lifted verbatim from `apps/desktop/src/style.css` so the page
stays in lockstep with the app's proof-copy look.

## Deploy

The folder is self-contained; point any static host at it:

- **GitHub Pages:** serve the `marketing/` directory (e.g. a Pages workflow
  with `path: marketing`, or copy its contents to a `gh-pages` branch).
- **Vercel/Netlify:** set the project root to `marketing/`, no build step.

It is deliberately not part of the npm workspace or the Tauri build.
