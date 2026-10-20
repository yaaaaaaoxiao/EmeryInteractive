# Emery Interactive

![snapshot](screenGrab.png)

An interactive 3D viewer for cubic crystal structures (FCC, BCC, SC) and their interstitial sites, for teaching materials science. Originally built by Aaron M. Geller (Northwestern IT) and Jonathan Emery (Northwestern Materials Science and Engineering) to recreate [Jonathan Emery's interactive PDFs](https://github.com/emeryjdk/Interactive-3D-Exploration).

## Features

- Atoms and every interstitial site type (octahedral, tetrahedral, triangular; cubic and square-planar in SC), each toggled on its own.
- Hard-sphere or sparse style, clipping to the unit cell, adjustable atom opacity, and polyhedra around sites.
- Neighbors tool: click any atom or site to see its surrounding atoms, bonds and count, and animate the largest sphere that fits (r/R).
- Planes by (h k l), with a section view or a cutaway of the 3D model.
- Click to select atoms/sites; 2 give a direction [u v w], 3 a plane (h k l), 4+ a polyhedron.
- Repeat the cell in x, y and z; camera presets along [100], [110], [111].
- Every combination of settings works, and the page URL describes the current setup so it can be shared.

See [docs/SPEC.md](docs/SPEC.md) for how the controls behave.

## Development

Requires Node.js 20 or newer.

```bash
npm install
npm run dev        # local server with live reload
npm test           # unit tests (crystal geometry, settings rules, links, scene)
npm run test:e2e   # browser tests in Chromium and WebKit (first run: npx playwright install chromium webkit)
npm run lint       # lint and formatting check (Biome)
npm run format     # fix formatting and safe lint issues
npm run check      # everything the pull-request checks run
npm run build      # production build in dist/
```

Code layout:

- `src/crystal/` — structures as data, and generation of all atoms, sites and neighbours
- `src/state.ts` — the single state object, its rules, and URL syncing
- `src/scene/` — builds the three.js scene from the state; renderer, camera and picking
- `src/ui/` — the controls and information panels
- `public/legacy/` — the original version of the site, served unchanged at `legacy/`
- `tests/` — unit tests (Vitest); `tests/e2e/` — browser tests (Playwright)

## Checks

Every pull request runs `.github/workflows/ci.yml`: lint and formatting, type checking, unit tests, the build, and browser tests in Chromium and WebKit. To make GitHub block merging until they pass, add a branch rule for `master` (Settings → Rules → Rulesets, or Settings → Branches) that requires the "Lint, types, unit tests, build" and "Browser tests" checks.

## Deployment

Pushing to `master` builds and publishes the site with GitHub Actions (`.github/workflows/deploy.yml`). In the repository settings, set Pages → Source to "GitHub Actions" once.
