# Astryx Sandbox

The component sandbox is an adapter-free Vite app. Its route manifest discovers authored page modules and the wrappers generated from the CLI template catalog. A production build prerenders each page and its route-group layout into a real `index.html` at **every** trailing-slash route, then hydrates it in the browser. Unknown routes have a static `404.html`, not an SPA catch-all.

<!-- SYNC: When files in this directory change, update this document. -->

## Setup and development

From the repository root, install dependencies with pnpm and build the workspace first:

```bash
pnpm install
pnpm build
pnpm dev:sandbox
```

`dev:sandbox` builds core once, runs Sandbox generators, and starts Vite. The `AGENTS.md` file is generated at postinstall by `astryx init --features agents` and contains the component-authoring guidance. For core source hot reload, use `pnpm dev:sandbox:source` (the `source` condition, without guaranteed theme layers); for compiled CSS layers and near-hot reload, run `pnpm -F @astryxdesign/core dev` in a second terminal alongside `pnpm -F @astryxdesign/sandbox dev`.

## Build and routes

```bash
pnpm -F @astryxdesign/sandbox build
pnpm -F @astryxdesign/sandbox typecheck
pnpm -F @astryxdesign/sandbox test
```

The build first runs `sync-templates`, changelog, CLI/foundation docs, XLE, score-ledger, motion-audit, and theme-family generators. The score-ledger generator attempts a public wiki snapshot with a five-second timeout; its browser page refreshes with a `no-store` fetch and falls back to that snapshot or TBD. No backend or credential is involved. Then Vite compiles StyleX with `@astryxdesign/build/vite`, `scripts/prerender.mjs` renders each page and layout into `out/`, and `scripts/verify-export.mjs` checks **every** page body, HTML route and asset against `scripts/next-export-routes.json` (the preserved Next 15 export oracle).

Root-local development uses `/`. For staging under the docsite, run `SANDBOX_BASE_PATH=/sandbox pnpm -F @astryxdesign/sandbox build`; the emitted HTML, JS, CSS, template assets, tokenizer and navigation then use `/sandbox/`. `SANDBOX_TEMPLATE_ASSETS_BASE_PATH` can override the image location when a host requires it. This framework change does **not** move any production or PR deployment or modify Vercel configuration; current Pages links remain in place.

### Adding a page

Add `src/app/(sandbox)/pages/<slug>/page.tsx` for a sidebar-framed page, `(fullscreen)` for a template/preview shell, or `(raw)` for an unframed page. Add the navigation entry to `src/app/sandboxPages.ts` when the page belongs in the catalog. The route manifest discovers the page automatically. Generated template wrappers are owned by `scripts/sync-templates.js`, not hand-authored. When adding or intentionally removing a public deep link, review and update the checked `scripts/next-export-routes.json` route list along with the change; the contract test fails until the difference is accounted for.

## Key files

- `vite.config.mts`, `src/main.tsx`, `src/route-entry.tsx`, `src/RouteView.tsx`, `src/entry-server.tsx`, `src/router.tsx`: prerendered routes, matching hydration, group layouts, navigation and base paths.
- `index.html`, `src/app/globals.css`, `src/app/layers.css`: metadata, fonts, global CSS and theme layers.
- `src/app/providers.tsx`: theme and mode state (including embed sync).
- `scripts/route-manifest.mjs`, `scripts/prerender.mjs`, `scripts/verify-export.mjs`, `src/route-manifest.test.ts`: exact-path export contract and 404 behavior.
- `src/generated/`, `src/app/(fullscreen)/templates/`, `public/template-assets/`: generated registries, wrappers and mirrored public images (ignored by git).
