# Eva marketing site

A static, dependency-free landing page for Eva. Plain HTML/CSS plus one
vanilla-JS file that renders the live graph hero; fonts are self-hosted
copies of the exact families the desktop app uses (Fragment Mono,
Instrument Sans Variable, Newsreader Variable). Design tokens are lifted
verbatim from `apps/desktop/src/style.css` so the page stays in lockstep
with the app's proof-copy look.

## Deploy

The folder is self-contained; point any static host at it:

- **GitHub Pages:** serve the `marketing/` directory (e.g. a Pages workflow
  with `path: marketing`, or copy its contents to a `gh-pages` branch).
- **Vercel/Netlify:** set the project root to `marketing/`, no build step.

It is deliberately not part of the npm workspace or the Tauri build.
