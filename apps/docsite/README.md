# Astryx Docsite

The OSS documentation site for Astryx. Built with Next.js and StyleX.

## Quick Start

```bash
pnpm install     # from repo root
pnpm build       # build all packages (themes need built exports)
cd apps/docsite
pnpm generate    # extract data from the monorepo into src/generated/
pnpm dev         # start the dev server
```

`pnpm dev` and `pnpm build` both run `generate` automatically via `predev`/`prebuild` scripts.

## How It Works

The docsite never hardcodes package lists, component catalogs, or theme maps.
Everything flows through a build-time **data pipeline** that extracts information
from the monorepo and writes typed TypeScript registries to `src/generated/`.

### The Pipeline

`scripts/generate-data.mjs` scans the monorepo and produces:

| Registry                      | Source                                             | What it contains                                              |
| ----------------------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| `packageRegistry.ts`          | `packages/*/package.json`                          | Name, version, description, README for each published package |
| `componentRegistry.ts`        | Core + CLI-configured integration `.doc.mjs` files | Props, usage docs, hooks, groups, per package                 |
| `componentPreviewRegistry.ts` | Components from those same packages                | Runtime exports for the shared Properties preview             |
| `blockRegistry.ts`            | CLI + integration template blocks                  | Showcase and example blocks with metadata                     |
| `templateRegistry.ts`         | CLI `templates/pages/`                             | Page-level templates (e.g. dashboard, settings)               |
| `docsRegistry.ts`             | CLI `docs/`                                        | Long-form guide and foundation topics                         |
| `blogRegistry.ts`             | `src/content/blog/posts/`                          | Human-authored blog posts (frontmatter validated)             |
| `themeRegistry.ts`            | Installed `@astryxdesign/theme-*` packages         | Built theme objects, keyed by package name                    |
| `showcaseRegistry.ts`         | Blocks with `isShowcase`                           | Copied showcase source files                                  |
| `exampleRegistry.ts`          | Blocks with `exampleFor`                           | Copied example blocks per component                           |

The `src/generated/` directory is gitignored. Pages import from these registries
and render whatever the pipeline found, with no manual wiring needed.

### The Rule

**All data comes from the pipeline. Never hardcode package names, component
lists, or theme objects in page code.** If you need data about the monorepo,
add it to `generate-data.mjs` and consume it from a registry.

This means:

- No `import {fooTheme} from '@astryxdesign/theme-foo/built'` in page files; use `themeObjects` from the generated `themeRegistry`
- No hand-maintained arrays of component names; use `componentRegistry`
- No `if (pkg === '@astryxdesign/core')` switches; let the pipeline classify packages

## Versioned Content: latest vs canary

The docsite ships one codebase deployed from `main`, but the data pipeline can
read package docs from two different sources depending on the build **target**.
The two targets mirror the two npm dist-tags the packages publish under:

| Target   | npm dist-tag | Reads package docs from            | Deploys                                |
| -------- | ------------ | ---------------------------------- | -------------------------------------- |
| `latest` | `@latest`    | the last **published** npm release | production (`astryx.atmeta.com`)       |
| `canary` | `@canary`    | the live monorepo (`main`, WIP)    | the canary site + **every PR preview** |

The target is derived from Vercel's `VERCEL_ENV`: the production deploy is
`latest`; preview deploys (the `main` canary site and all PR previews) and local
dev are `canary`. `scripts/resolve-content-root.mjs` maps the target to the
filesystem root the pipeline reads from — for `latest` it downloads the
published package tarballs from npm (their `src/` ships the `.doc.mjs` the
pipeline needs); for `canary` it reads the live workspace and loads the
component integrations in `astryx.config.mjs`. Packages marked
`astryx.canaryOnly` are excluded from the `latest` snapshot. Their generated
components use the existing `isReady: false` state and are grouped under the
owning package on canary, with one flask on that package category rather than
one marker per component. Only the documented
**data** is version-pinned — CLI template demos are live-rendered React and
always resolve `@astryxdesign/core` from the bundled workspace version.

> **⚠️ Contributor gotcha: library changes don't show on the production site
> until they're released.** Production (`astryx.atmeta.com`) documents the last
> **published** release. If you add a component, change a prop, or update docs
> and merge to `main`, those changes will **not** appear in production until the
> next release publishes to npm. To see your merged change in a deployed site,
> use the **canary** site or any **PR preview** (both read `main`) — or the
> "Canary docs" link in the footer. The canary banner links back to
> production.

**Local dev is unaffected.** `pnpm dev` has no `VERCEL_ENV`, so it defaults to
`canary` and reads the live workspace — your local changes show up as expected.
To preview the `latest` view locally, run the pipeline with
`DOCSITE_TARGET=latest` (needs network to fetch the published tarballs).

## Adding a New Theme

1. Create the theme package under `packages/themes/<name>/`
2. Add `"@astryxdesign/theme-<name>": "*"` to `apps/docsite/package.json` dependencies
3. Add `@import "@astryxdesign/theme-<name>/theme.css"` to `src/app/globals.css`
4. Load the theme's fonts (see below)
5. Run `pnpm generate`; the theme appears in `themeRegistry.ts`, `packageRegistry.ts`, the sidebar, craft page, and package detail page automatically

> Only add **public** (non-private) theme packages to the docsite.

### Font loading

Themes reference fonts by name but don't bundle the font files. If the fonts
aren't loaded, the theme silently falls back to system fonts.

The docsite loads all custom typefaces from Google Fonts via a single `<link>`
tag in `src/app/layout.tsx`. When adding a new theme, check which fonts it
declares and add any missing families to that URL.

Each theme's own README documents exactly which fonts it needs and how to load
them. Check the theme's `## Fonts` section for the specific Google Fonts URL.

## Adding a New Package

1. Create the package under `packages/<name>/`
2. Add `"@astryxdesign/<name>": "*"` to `apps/docsite/package.json` dependencies
3. For a component package other than Core, add `astryx.integration.mjs` with
   `components: './src'`, include that file (and `src`) in the package's
   `files`, and list the package in `apps/docsite/astryx.config.mjs`. Keep
   optional showcase blocks in the package too and expose their directory
   through the integration's `templates` field; the docsite retrieves them
   through the CLI template API. A package that publishes only canaries also
   sets `astryx.canaryOnly: true` in its `package.json`. A package that
   publishes stable releases joins the Changesets `fixed` group in
   `.changeset/config.json` so it versions with Core: the production snapshot
   fetches every documented package at Core's published version, and a stable
   integration on its own version would fail production builds as a partly
   published release.
4. Run `pnpm generate`

The package appears in the sidebar, the libraries section, and gets its own
`/docs/<name>` detail page. If the package contains `.doc.mjs` files,
its components are extracted into `componentRegistry.ts` as well. Canary-only
packages and components appear only on canary builds and carry a flask icon.
A configured package that is a stable release (neither `private` nor
`astryx.canaryOnly`) is documented on the production site too, from its
published tarball, starting with its first stable release
(`scripts/resolve-content-root.mjs`).

## Adding a Blog Post

The blog lives at `/blog` and `/blog/<slug>`. Posts are human-authored Markdown
files with YAML frontmatter under `src/content/blog/posts/`. Adding a post is
close to dropping in one file — discovery, validation, and sorting are automatic.

See **[`src/content/blog/README.md`](src/content/blog/README.md)** for the full
guide: frontmatter reference, post types, the author registry, cover images, and
local preview. In short:

1. Create `src/content/blog/posts/<slug>.md` with required frontmatter
   (`title`, `description`, `date`, `type`, `authors`, `tags`).
2. If you are a new author, add yourself to `src/content/blog/authors.ts`.
3. Run `pnpm generate && pnpm test && pnpm typecheck`, then `pnpm dev` to preview.

Required frontmatter is validated at build time; drafts (`draft: true`) are
excluded from production output.

## Project Structure

```
apps/docsite/
├── scripts/
│   └── generate-data.mjs    # The data pipeline
├── src/
│   ├── generated/            # gitignored — pipeline output
│   ├── app/
│   │   ├── globals.css       # CSS imports (reset, astryx base, theme stylesheets)
│   │   ├── layout.tsx        # Root layout
│   │   ├── providers.tsx     # Theme + client providers
│   │   ├── (docs)/           # Main docs routes (components, packages, docs)
│   │   ├── blog/             # Blog index + post detail (no sidebar)
│   │   └── craft/            # Craft landing (templates, themes, showcases)
│   ├── components/           # Shared UI components
│   ├── content/blog/         # Blog posts (MD + frontmatter) + authors.ts
│   └── lib/blog/             # Blog discovery, validation, and types
├── package.json
└── .gitignore                # Excludes src/generated/
```

## Commands

| Command           | What it does                                    |
| ----------------- | ----------------------------------------------- |
| `pnpm generate`   | Run the data pipeline                           |
| `pnpm dev`        | Start Next.js dev server (auto-generates first) |
| `pnpm build`      | Production build (auto-generates first)         |
| `pnpm typecheck`  | Run `tsc --noEmit`                              |
| `pnpm test`       | Run vitest                                      |
| `pnpm test:watch` | Run vitest in watch mode                        |

## Playground preview restrictions

The playground is for trying Astryx code, not saving its runtime data.
Production previews (including deployed PR previews) are **ephemeral** and run
with `sandbox="allow-scripts"`: Docsite origin-bound storage and parent-page DOM
access are unavailable. Local storage may throw; previewed code has no
persistence guarantee. In-memory interaction still works; the AI Chat template's
resizable panel already falls back when its storage is unavailable. Reloading or
replacing the preview resets its runtime state, then restores the editor's current
code, theme, and mode.

Production Chromium tests also characterize these browser consequences of the
opaque origin; they do not establish separate playground capability policy:

- **Clipboard and microphone:** Chromium's permission policy denies clipboard
  writes and microphone access in the preview. Copy did not report success;
  readable text can still be selected for manual copying. Dictation remained idle
  while typing worked.
- **Native pickers:** cross-origin `showPicker()` is restricted for date/time
  controls; typed entry and Astryx's `nativePicker="never"` surface remain usable.
  File and color controls have browser-defined exceptions and can still respond
  to a user gesture. The sandbox is not a blanket ban on every native picker.
- **Navigation:** previewed Astryx links use native anchors instead of inheriting
  the docsite's Next router. Fragment links stay in the current document. A
  non-fragment navigation replaces the document and triggers preview recovery.

`next dev` retains the original same-origin sandbox so development assets load.
It is not evidence for the production security boundary. Do not add
`allow-same-origin` to make a production demo work.

## Testing

Tests live in `src/__tests__/data-extraction.test.ts` and validate the generated
registries: package discovery, component extraction, theme wiring, etc. Run
`pnpm generate` before running tests since they import from `src/generated/`.

Browser contracts for the playground preview live in `e2e/` and run with
`pnpm test:docsite-browser` from the repo root against a production build
(`pnpm build` at the root, then `pnpm build` here); see `playwright.config.ts`.
