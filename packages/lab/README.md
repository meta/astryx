# @astryxdesign/lab

Experimental Astryx components. This package is a staging area for components being developed before graduating to `@astryxdesign/core`. It ships to npm **only under the `@canary` dist-tag** — there is never a stable (`latest`) release.

## Purpose

Components in lab:

- Are importable in storybook and sandbox for testing
- Are publishable for early external testing via the `@canary` tag only
- Can be iterated on freely without worrying about breaking stable consumers
- Compose with `@astryxdesign/core` components (use the theme, follow naming conventions)
- Graduate to `@astryxdesign/core` after thorough engineering review

See the **[Component Lifecycle](https://github.com/meta/astryx/wiki/Component-Lifecycle)** wiki for how a component moves from lab → core (and the promotion gates), and the **[Component Hardening Protocol](https://github.com/meta/astryx/wiki/Component-Hardening-Protocol)** for the bar a component must clear to graduate.

## What's here vs what's in core

**Lab:** Works, has basic props, maybe has stories. API might change. Not accessibility-hardened, not vibe-tested, not fully themed. **Canary-only — no stability promise.**

**Core:** Full keyboard/a11y, hover guards, theming story, status states, spec compliance, vibe tested. Shipped to consumers on `latest`.

## Promotion gate: accessibility

The [Accessibility Checklist](https://github.com/meta/astryx/wiki/Accessibility-Checklist) is a hard requirement for graduating to core — every item, verified in the promotion PR, alongside the hardening bar linked above.

Lab components get the same scan coverage as core (the `pr-a11y` axe audit and the full release-check scan run against lab too), but a11y findings on a lab component do not block lab merges — they block **promotion**. Iterate freely in lab; clear the checklist to graduate.

## Usage

Inside the monorepo (storybook/sandbox), imports resolve via pnpm workspaces:

```tsx
import {CodeEditor} from '@astryxdesign/lab';
```

### Trying lab components in your own project (canary)

Lab is published **only** under the `@canary` dist-tag, so you must request that tag explicitly. There is no `latest` version to install.

```bash
npm install @astryxdesign/lab@canary @astryxdesign/core@canary
```

```tsx
import {CodeEditor} from '@astryxdesign/lab';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/lab/lab.css';
```

> Canary builds track the latest commit on `main` (`0.x.y-canary.<sha>`). They can break between any two versions — pin an exact version if you need stability.

## Documenting a Lab component (canary docsite)

Lab appears **only on the canary docsite** — the production site documents the published stable release and never loads this package (see the target gates in `apps/docsite/scripts/` and the exclusion tests in `apps/docsite/src/__tests__/integration-targets.test.ts`).

Authoring is the same two-artifact flow a Core author uses; the only difference is where the runnable demos live (Core keeps its blocks centrally in `packages/cli/assets/templates/blocks/`, Lab owns its own `blocks/` directory here):

1. **Component doc** — `src/<Name>/<Name>.doc.mjs` exporting `docs` (props, usage, playground config, `examples`). Picked up automatically on canary; no registration anywhere.
2. **Runnable demos** — same-stem pairs in `blocks/`: `<BlockName>.tsx` + `<BlockName>.doc.mjs` (a `TemplateDoc` stamped `type: 'block'`). Discovered automatically once this package declares the directory — nothing per-component. The docsite renders the pair as the component page's showcase/examples and the playground can import anything the package exports.

This package declares that directory once: `templates: './blocks'` in `astryx.integration.mjs`, and `"blocks"` in the `files` list in `package.json`. A new demo is just its block pair.

How a demo reaches a component page: **`exampleFor: '<Component>'` (or `alsoExampleFor`) is what attaches a block** — the page renders every block attributed to it, whatever the block is named. The block's `name` is the demo's display name; component-doc example `labels` are CLI-snippet headings. The two are independent mechanisms.

Use these conventions for new demos:

- Give the block descriptor the same `name` as the component doc's example `label`, so the snippet and its runnable demo read as one documented set (this naming convention is what the `example-coverage` report keys on — it is not how the docsite attaches demos).
- Exactly one attributed block sets `isShowcase: true` (the hero demo — conventionally the first example).
- `displayName` and `description` are required by the docsite build; set `componentsUsed` and `aspectRatio` for the gallery.

A doc example with no corresponding block exists only as a CLI/code snippet — the docsite page's demos come solely from blocks. Note the converse does not follow from names alone: an example label with no _same-named_ block does not by itself mean the demo is missing, because the component may render demos under other names (several Core components do). The `example-coverage` docsite test output reports both sides of that pairing; it is a _report_, not a gate — Core has the same non-guarantee, and whether pairing should gate CI is an open repo-wide decision.

> Note: `astryx integration add template` scaffolds a `./templates` root for a package that declares none. Declare `templates: './blocks'` explicitly instead, matching charts and richtext; unifying the two conventions is a pending repo decision.

## Why no stable release?

`package.json` keeps `"private": true` plus an `"astryx": { "canaryOnly": true }` marker. The release workflow's stable (`latest`) job skips both private and `canaryOnly` packages, while the canary job strips `private` in its ephemeral CI checkout only (never in git) to publish the `@canary` tag. The committed `private: true` is npm's hard guarantee that no stable publish can ever happen — **do not remove it.**
