# Contributing to Astryx

For the full contribution process — what we accept, how to propose new components, and how API decisions are made — read the **[Contributing wiki](https://github.com/facebook/astryx/wiki/Contributing)**.

Key pages:

- **[Pull request intents](docs/contributing/pull-requests.md)** — choose one primary intent, its evidence bar, and the matching PR template
- **[API conventions guide](docs/contributing/api-conventions.md)** — practical naming, composition, styling, proposal, and review guidance linked to current owner records
- **[Design Conventions](https://github.com/facebook/astryx/wiki/Design-Conventions)** — the design-side bar: tokens, spacing, radius, elevation, type, color, motion, and state representations
- **[Specification Protocol](https://github.com/facebook/astryx/wiki/Component-Specification-Protocol)** — the 9-phase process for new components
- **[Component Lifecycle](https://github.com/facebook/astryx/wiki/Component-Lifecycle)** — how components move from lab → core and templates from hidden → visible
- **[API Arbitration](https://github.com/facebook/astryx/wiki/API-Arbitration)** — how we resolve API design questions
- **[Contributing Templates](https://github.com/facebook/astryx/wiki/Contributing-Templates)** — building templates/blocks and the template grading rubric
- **[Blog Review Rubric](https://github.com/facebook/astryx/wiki/Blog-Review-Rubric#three-required-scored-criteria)** — how docsite blog posts are reviewed
- **[Contributing with AI](https://github.com/facebook/astryx/wiki/Contributing-with-AI-Assistants)** — safe zones, spec protocol, and working with AI tools

This file covers local development setup.

---

## Prerequisites

### Node.js

The Node version lives in `.nvmrc` (currently the 24.x line). CI reads the same
file via `node-version-file`, so local and CI never drift apart. Don't declare
the version anywhere else.

**Via nvm (recommended):**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.zshrc
nvm install   # no argument — reads .nvmrc
```

`fnm` and `mise` read `.nvmrc` too. `asdf` does not; its `.tool-versions` is
git-ignored precisely so it cannot become a competing source of truth.

**Via nodejs.org:**
Download and install from https://nodejs.org

### pnpm

Astryx uses [pnpm](https://pnpm.io/) as its package manager (declared in
the `packageManager` field of
`package.json`). You can install pnpm directly:

```bash
# Via npm
npm install -g pnpm@11

# Via Homebrew (macOS)
brew install pnpm

# Via standalone installer (no npm or Node.js required)
curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=11.10.0 sh -

# Via GitHub releases (single binary, no dependencies)
# https://github.com/pnpm/pnpm/releases/latest
```

Or use [Corepack](https://nodejs.org/api/corepack.html) to install the exact
pnpm version Astryx pins:

```bash
corepack enable
```

Corepack ships with Node.js 22 and 24, but current Node.js 25+ releases no
longer bundle it. If `corepack` is missing and you want the auto-pinning path,
install Corepack manually first:

```bash
npm install -g corepack
corepack enable
```

Verify installation:

```bash
node --version   # v24.x.x
pnpm --version   # 11.x.x
```

## Getting Started

```bash
# Clone without downloading historical file contents up front
git clone --filter=blob:none https://github.com/facebook/astryx.git
cd astryx

# Install dependencies
pnpm install

# Start Storybook for component development
cd apps/storybook
pnpm dev
```

### Running Storybook

Storybook resolves every workspace package to its `src/` directory and compiles
it itself, so a fresh clone needs no build step first — `pnpm install` then
`pnpm dev` is enough.

```bash
cd apps/storybook
pnpm dev
```

Storybook will open at http://localhost:6006 with:

- **Theme switcher** - Toggle between the base tokens and the Neutral, Stone, and Y2K themes
- **Mode switcher** - Toggle between Light and Dark modes
- **Component stories** - Interactive component examples

**If you make changes to `@astryxdesign/core`:** source changes update without a
rebuild or restart. Storybook and the docsite also watch
`packages/core/locales/*.json`, regenerate the compact runtime catalogs, and
reload imported messages after a locale edit.

### Running the Doc Site

The doc site (`apps/docsite/`) is a Next.js app that renders the component
documentation at https://astryx.atmeta.com. To run it locally:

```bash
# First time only — build the workspace packages it depends on
pnpm build

# Start the doc site (Next dev server, defaults to localhost:3000)
pnpm docsite
```

`pnpm docsite` is a thin alias for `pnpm -F @astryxdesign/docsite dev`,
which runs the doc site's `generate` step (theme CSS, registries,
playground scope) before booting Next.

> **Note:** `pnpm docs` collides with the `npm docs` builtin, which
> tries to open the package's npm page in a browser. Use `pnpm docsite`
> instead.

## Project Structure

```
astryx/
├── apps/
│   ├── storybook/      # Component playground (localhost:6006)
│   ├── docsite/        # Doc site (localhost:3000)
│   └── sandbox/        # Development testing
│
├── packages/
│   ├── core/           # Core components (Button, Input, etc.)
│   ├── cli/            # CLI tooling (astryx)
│   ├── lab/            # Experimental components (not yet stable)
│   └── themes/         # Theme presets (neutral, stone, y2k, and more)
│
└── internal/           # Internal tooling (not published)
    └── test-utils/     # Shared test helpers
```

## Development Workflow

### Common Commands

| Command           | Description                                  |
| ----------------- | -------------------------------------------- |
| `pnpm install`    | Install all dependencies                     |
| `pnpm dev`        | Start Storybook (alias for `pnpm storybook`) |
| `pnpm build`      | Build all packages                           |
| `pnpm test`       | Run all tests                                |
| `pnpm test:watch` | Run tests in watch mode                      |
| `pnpm typecheck`  | Typecheck every package (after `pnpm build`) |
| `pnpm storybook`  | Start Storybook at localhost:6006            |
| `pnpm lint`       | Lint all packages                            |

## Adding a New Component

Components use **colocated tests** — test files live alongside the component.

### 1. Create the Component Directory

```bash
mkdir -p packages/core/src/MyComponent
```

### 2. Create the Component Files

```
packages/core/src/MyComponent/
├── MyComponent.tsx        # Component implementation
├── MyComponent.test.tsx   # Unit tests (colocated)
├── MyComponent.doc.mjs    # Component doc (props, features, examples)
└── index.ts               # Public exports
```

Stories are **not** colocated — they live in the Storybook app:

```
apps/storybook/stories/MyComponent.stories.tsx
```

### 3. Component Template

````tsx
// MyComponent.tsx
import type {HTMLAttributes, ReactNode, Ref} from 'react';

export interface MyComponentProps extends HTMLAttributes<HTMLDivElement> {
  /** Ref forwarded to the root element */
  ref?: Ref<HTMLDivElement>;
  /** Description for AI-assisted development */
  children: ReactNode;
}

/**
 * Brief description of the component.
 *
 * @example
 * ```
 * <MyComponent>Hello</MyComponent>
 * ```
 */
export function MyComponent({children, ref, ...props}: MyComponentProps) {
  return (
    <div ref={ref} {...props}>
      {children}
    </div>
  );
}

MyComponent.displayName = 'MyComponent';
````

### 4. Test Template

```tsx
// MyComponent.test.tsx
import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {MyComponent} from './MyComponent';

describe('MyComponent', () => {
  it('renders children', () => {
    render(<MyComponent>Hello</MyComponent>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

### 5. Story Template

Stories live in the Storybook app, not next to the component —
`apps/storybook/.storybook/main.ts` discovers them with
`'../stories/**/*.stories.@(js|jsx|mjs|ts|tsx)'`, so a story anywhere under
`packages/` is never picked up. Import the component through its published
entry point, and title it under `Core/` (or `Lab/` for `@astryxdesign/lab`).

```tsx
// apps/storybook/stories/MyComponent.stories.tsx
import type {Meta, StoryObj} from '@storybook/react';
import {MyComponent} from '@astryxdesign/core/MyComponent';

const meta = {
  title: 'Core/MyComponent',
  component: MyComponent,
  tags: ['autodocs'],
} satisfies Meta<typeof MyComponent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Hello World',
  },
};
```

### 6. Export from Package

```ts
// packages/core/src/index.ts
export * from './MyComponent';
```

> **Note:** Do not manually edit the `"exports"` field in `packages/core/package.json`.
> It is auto-generated from the `src/` directory by `scripts/sync-exports.js` and
> committed automatically when changes land on `main`. If you need to verify your
> component will be included, run `pnpm sync:exports:check`.

### User-facing strings and text direction

Components read user-facing strings with `useTranslator()` rather than
hardcoding them:

```tsx
import {useTranslator} from '@astryxdesign/core/i18n';

function SaveButton() {
  const t = useTranslator();
  return <button>{t('@astryx.actions.save')}</button>;
}
```

Astryx's own strings live in `packages/core/locales/en.json`. The
`@astryx/no-hardcoded-i18n-string` ESLint rule rejects a hardcoded one. For a
prop whose default is a translated string, alias the prop and resolve it in the
body: destructure `label: labelFromProps`, then
`const label = labelFromProps ?? t('@astryx.<component>.<key>')`.

A component that responds to text direction resolves it from the DOM, not from
a render-time JavaScript read. Reach for the lightest tool that works, in this
order:

1. **CSS logical properties.** Use `insetInlineStart`, `paddingInlineEnd`,
   `marginInline`, and friends instead of physical `left`/`right`. Most
   mirroring needs nothing more: the browser flips it from the ambient `dir`.
   The `@astryx/no-physical-properties` ESLint rule enforces this.
2. **Directional icons: mirror with CSS, not a name swap.** Render one fixed
   glyph and wrap it in the shared `rtlStyles.mirror` (a `scaleX(-1)` that only
   applies under `[dir="rtl"]`). It flips from the ancestor `dir` through the
   cascade, so it works on the server with no hydration flash. Do not pick
   `chevronLeft` or `chevronRight` in JavaScript. Pagination, Calendar, and
   Carousel handle their chevrons this way.

   ```tsx
   import * as stylex from '@stylexjs/stylex';
   import {rtlStyles} from '@astryxdesign/core';

   function NextButton() {
     // One glyph; CSS flips it under RTL. No direction read.
     return (
       <span {...stylex.props(rtlStyles.mirror)}>
         <Icon icon="chevronRight" />
       </span>
     );
   }
   ```

3. **Behavior: read the DOM lazily, on the event.** For what CSS can't express
   (arrow-key mapping, drag and scroll math), read direction at interaction
   time with `isRtlElement(el)` (a `getComputedStyle().direction` check), never
   during render. The focus hooks (`useListFocus`, `useGridFocus`,
   `useTreeFocus`) already detect direction from their container, so arrow keys
   flip for free; don't pass them a direction flag.
4. **`useDirection()` context, as a last resort.** Use it only when you need
   the direction value during render and nothing above fits. It is SSR-safe
   and returns `'ltr'` outside a provider (like `useTranslator`'s silent
   fallback), but it is the one path that can mismatch on hydration when the
   provider's direction disagrees with `<html dir>`. No Astryx component reads
   direction from context at render time.

### Adding a semantic icon

Add a semantic icon name only for a glyph the whole system shares:

1. Add the name to the `IconName` type in
   `packages/core/src/Icon/globalIconRegistry.tsx`.
2. Add the default SVG to `packages/core/src/Icon/defaultIcons.tsx`.
3. Add a row to the Available Names table in
   `packages/cli/assets/docs/icons.doc.mjs`.

A glyph that belongs to one component takes a namespaced key instead
(`numberInput:stepperDown`), so the shared `IconName` list does not grow. Ship
its fallback in `defaultIcons` under the same key so the glyph still renders
with no theme.

## Accessibility Checklist

Every new component — and any change to an interactive one — must clear the
**[Accessibility Checklist](https://github.com/facebook/astryx/wiki/Accessibility-Checklist)**
(wiki) before review. The checklist lives on the wiki so accessibility
experts can refine it without a code PR; reviewers block on it (it is `A1`–`A16`
on the [Component Audit Rubric](https://github.com/facebook/astryx/wiki/Component-Audit-Rubric)),
and it is a hard requirement for a lab → core promotion (see
`packages/lab/README.md`).

Two repo-side rules worth restating here:

- Compose the shared primitives — `VisuallyHidden`, `useAnnounce`,
  `useFocusTrap`, and the focus hooks (`useListFocus`, `useGridFocus`,
  `useTreeFocus`) — rather than hand-rolling equivalents. They implement the
  WAI-ARIA APG patterns and are tested once; a bespoke reimplementation of
  one is a review reject.
- CI is the enforcement layer, not a replacement for the checklist: the
  `pr-a11y` job in `ci.yml` runs an axe audit on every PR that touches
  components, a weekly workflow scans the full component surface, and the
  `useAnnounce` lint rule rejects hand-wired `aria-live` regions. axe only
  catches static, DOM-level issues — keyboard behavior, focus management, and
  announcement timing are exactly what the checklist and the component's unit
  tests cover.

## Working on the `astryx` CLI

The CLI (`packages/cli/`) is layered so behavior, presentation, and contracts stay separable:

- **`clients/cli/`** — the Commander program and per-command handlers. A handler is a _thin wrapper_: parse flags → call the matching `api/` function → render (JSON via `jsonOut`, or text via the formatter kit in `clients/cli/formatters/`).
- **`api/`** — the programmatic API (`@astryxdesign/cli/api`). Each command maps to `api/<name>/`, whose functions return a typed `{ type, data }` envelope. This is the behavior source of truth, so `astryx --json` and the imported function return identical data.
- **`authoring/`** — the pure data contracts (`@astryxdesign/cli/authoring`): the TypeScript types you author objects against (config, integration, codemod, and the doc-types) plus the sealed zod parsers the CLI runs at the load boundary.
- **`foundation/`** — the bottom layer: cross-cutting infra that everything above builds on — the `{ type, data }` JSON contract, the stable `ERROR_CODES`, discovery (components, templates), integration contribution validators, and path-safety. It never imports `api/` or `clients/`; if foundation needs something, that something belongs in foundation.

### The CLI documents itself

Every CLI surface has a colocated, typed `.doc.mjs` next to what it describes, annotated with a `@type` from `@astryxdesign/cli/authoring`:

| Surface                                                                                 | Doc-type                                             | Lives next to                                              |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| An API function (a hook or an `api/` export)                                            | `FunctionDoc`                                        | `api/<name>/<fn>.doc.mjs`                                  |
| A CLI command                                                                           | `CommandDoc` (references its `FunctionDoc` via `fn`) | `clients/cli/commands/<name>.doc.mjs`                      |
| An authored object (config, integration, codemod, the doc-types, the response envelope) | `SchemaDoc`                                          | beside the schema (`authoring/**`, `foundation/response/`) |
| A closed vocabulary (error codes, response types)                                       | `EnumDoc`                                            | `foundation/response/`                                     |
| A long-form topic (tokens, principles, theming, …)                                      | `ReferenceDoc`                                       | `assets/docs/<topic>.doc.mjs`                              |

These are not free-form. `parseDoc` validates each at load, and a **drift harness** (`packages/cli/test/drift/`) enforces that they mirror their source of truth: every `CommandDoc`'s `fn`/args/options match the live CLI, and the `EnumDoc`s equal `ERROR_CODES` / the manifest's response-type set exactly. A doc that drifts fails CI.

### What's enforced for you

Most of the conventions above are mechanical, so they're checked rather than reviewed:

| Rule                                                                                                                                              | Enforced by                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| the layer directions hold: `authoring/` imports no other layer, `foundation/` never imports `api/` or `clients/`, `api/` never imports `clients/` | ESLint (`no-restricted-imports`)                             |
| zod stays sealed behind the `authoring/` parsers                                                                                                  | ESLint (`no-restricted-imports`)                             |
| commands register via `defineCommand`, never straight onto Commander                                                                              | ESLint (`no-restricted-syntax`)                              |
| a command handler must not access the environment: no filesystem, network, subprocess, Project, or discovery imports (INV22)                      | `pnpm check:cli-structure`                                   |
| an API module (other than an adapter or helper imported only by adapters) must not access the environment (INV21)                                 | `pnpm check:cli-structure`                                   |
| a command handler must not build text with `.padEnd()`, `.padStart()`, `.repeat()`, or `new Block()` (INV23, FR3)                                 | ESLint (`no-restricted-syntax`) + `pnpm check:cli-structure` |
| every executable `CommandDoc` `fn` must name a function exported from `api/index.mjs` (FR1)                                                       | `pnpm check:cli-structure`                                   |
| every function exported from `api/index.mjs` must have a `FunctionDoc` whose `name` matches (FR2)                                                 | `pnpm check:cli-structure`                                   |
| each doc-type ships `type.ts` + `parse.mjs` + `<kind>.doc.mjs`, re-exports its parser, and appears in `parseDoc`'s `@returns`                     | `pnpm check:cli-structure`                                   |
| each `api/<name>/` ships its typedefs, a `FunctionDoc`, and a test                                                                                | `pnpm check:cli-structure`                                   |
| every `CommandDoc`/`EnumDoc` matches the live CLI                                                                                                 | the drift harness                                            |

You never hand-write the `.d.mts` declarations. `packages/cli/scripts/sync-api-types.mjs` emits them for both `api/` and `authoring/` from the `.mjs` JSDoc — gitignored, regenerated at `prepack`, and stamped `@generated`. Edit the JSDoc and run `pnpm -F @astryxdesign/cli sync:api-types`.

That matters because a hand-written declaration _shadows_ the JSDoc in its `.mjs`, and both ways it can lie shipped once: a missing declaration made a strict consumer resolve the parser as `any` (surfacing only at pack time as TS7016, since local typechecks run with `checkJs` and never exercise the packed surface), and a stale `parseDoc` union silently dropped three doc kinds from the published type while still compiling. Generation removes both. The one declaration still written by hand is `authoring/index.d.ts`, the curated public barrel.

### Adding a command

Author the docs _before_ the handler: `defineCommand` builds the Commander command from the `CommandDoc`, so the handler needs it to exist.

1. Add the behavior under `api/<name>/`, with a colocated `<name>.type.mjs` (the `Options` + `{ type, data }` response typedefs — the shape source of truth) and a test.
2. Author the docs — a `FunctionDoc` at `api/<name>/<fn>.doc.mjs` and a `CommandDoc` at `clients/cli/commands/<name>.doc.mjs`. Copy the `blog` pair as a template.
3. Write the thin handler in `clients/cli/commands/<name>.mjs`, registering it with `defineCommand(program, <name>Command, {fn: <name>Fn, action})` so `--help` and the manifest come from the doc. Call its `register<Name>` from `clients/cli/index.mjs`.
4. Run the checks below. The drift harness catches a doc that disagrees with the live command, and `check:cli-structure` catches a missing typedef, doc, or test.

### Testing the CLI

```bash
# Run the CLI locally (no build needed)
node packages/cli/clients/cli/bin/astryx.mjs --help

# Validate every colocated doc parses + mirrors its source of truth
pnpm -F @astryxdesign/cli test              # includes the drift suite
pnpm -F @astryxdesign/cli typecheck:authoring

# Structural conventions (doc-type quartets, api/ leaf contents). Also runs as
# part of `pnpm lint` via check:repo, and in the pre-commit hook.
pnpm check:cli-structure

# Keep the generated CLI README tables (commands, error codes, response types)
# in sync with the manifest + EnumDocs. After an intended change, refresh + review:
pnpm -F @astryxdesign/cli readme            # regenerate the tables
pnpm -F @astryxdesign/cli readme:check      # CI gate: fails on any un-refreshed drift
```

## Testing

### Run Tests

```bash
# All tests
pnpm test

# Watch mode
pnpm test:watch

# Specific package
pnpm -F @astryxdesign/core test

# One Vitest project, as CI runs it (CI shards each across legs)
pnpm test:ui            # the ui project, without the FR23 benchmark
pnpm test:ui:isolated   # the FR23 benchmark alone, as test-ui leg 1 runs it
pnpm test:node

# With coverage
pnpm test:coverage

# Accessibility and RTL audits over the built Storybook (see below)
pnpm a11y:audit
pnpm rtl:audit
```

### Test Structure

Tests are colocated with components:

```
src/Button/
├── Button.tsx
└── Button.test.tsx   # Tests live here
```

### Accessibility audits

PRs that touch components run an axe-core audit (the `pr-a11y` CI job) over
the Storybook stories of the changed components. The job **fails** when it
finds a violation that is not listed in the checked-in baseline,
`.github/a11y-baseline.json`. Violations are keyed
`Component::Story::rule-id`, so unrelated markup churn does not invalidate
baseline entries.

To reproduce and fix a failure locally:

```bash
# One-time setup
pnpm storybook:build
npx playwright install chromium

# Audit specific components against the baseline (what CI does)
pnpm a11y:audit -- --components Button,Dialog
```

Fix the violation whenever possible. If it is a known, intentional exception,
add it to the baseline (scoped to the affected components, and expect
reviewers to ask why):

```bash
pnpm a11y:baseline -- --components Button,Dialog
```

When the audit reports baseline entries as "resolved", delete them from
`.github/a11y-baseline.json` — the baseline should only shrink over time.

> **Scope caveat:** axe-core automates only a subset of WCAG (roughly a
> third of the success criteria). A green `pr-a11y` job does not mean a
> component is accessible — keyboard flows, focus order, screen-reader
> semantics, and contrast in context still need manual checks.

### Accessibility spec-test contracts

axe finds broad markup violations; it does not know that a switch has to turn
back off. The reusable **accessibility spec tests** in
[`internal/a11y-spec/`](internal/a11y-spec/README.md) encode one adopted
WAI-ARIA APG pattern as a standards-traceable contract, and components bind to
it. Each expectation names the WCAG success criterion or APG requirement it
comes from, the evidence layer that can observe it, and whether it gates.

They run in two lanes, and the split is the point: jsdom proves DOM-layer facts
in `pnpm test`, and everything that needs a computed accessibility tree, real
focus, or real activation is reported `unrun` there and proven in Chromium.

```bash
# One-time setup
pnpm storybook:build
npx playwright install chromium

pnpm test:a11y-contract      # the Chromium lane (also runs inside pr-a11y)
```

Adopting the pattern in a new component means binding to the existing contract,
not copying its assertions — see the package README and
[`docs/specs/AST-020`](docs/specs/AST-020/spec.md) /
[`docs/specs/AST-021`](docs/specs/AST-021/spec.md).

### RTL audits

PRs that touch components also run an RTL audit (`pr-rtl`), scoped to the
changed components like `pr-a11y`. It is soft-gated — findings show in the job
summary but don't block. Repro locally with `pnpm rtl:audit -- --filter Avatar`
(the `--` matters: `pnpm -F` is itself `--filter`). The report classifies every
scoped component as **measured**, **verified N-A**, or a **coverage gap**; an
unexplained all-N-A result is not a clean RTL result. The weekly unfiltered run
applies the same contract to the full existing roster, while PR CI applies it
to new and changed components. See `apps/storybook/rtl-audit/README.md`.

### Modal close visibility guard

The same `pr-a11y` job runs one more Chromium probe
(`.github/scripts/modal-close-visibility.js`, or `pnpm guard:modal-close`
against a built Storybook). It opens each modal `<dialog>` surface in the
list at the top of that script, closes it, and fails if the dialog's computed
`display` was `none` at the moment `close()` ran.

A dialog hidden while still `:modal` swallows every click on the page, and a
browser is not obliged to release that when `close()` finally runs — Safari
26.1 did not (#4290). The ordering comes from a CSS transition, so jsdom
cannot see it and the unit suites pass either way. Add a target here when a
component closes a `<dialog>` on a delay.

### Disabled hover guard

A disabled element must never paint a hover state: `:hover` keeps matching a
disabled control in every engine, so a hover treatment written for the enabled
element is still painted under the pointer. Guard every self-`:hover` with
`:hover:where(:not(:disabled,[aria-disabled="true"]))` — `:where()` adds no
specificity, so the rule weighs the same as before. The `@astryx/no-hover-on-disabled`
lint rule (autofixable) enforces it at author time; `pnpm guard:disabled-hover
--storybook-dir apps/storybook/dist` sweeps a built Storybook in Chromium and
fails on any disabled element whose paint changes under a forced `:hover`.

### Disabled cursor guard

A disabled control must not answer the pointer with an interactive cursor: the
cursor is the only affordance a pointer user gets before they commit to a
click. Write every `cursor` so the disabled state takes it back —
`cursor: {default: 'pointer', ':is(:disabled,[aria-disabled="true"])': 'default'}`
— including a flat `cursor` inside a `disabled` style, since StyleX merges one
property at a time and a later declaration replaces the earlier one's
conditions along with its value. `default` rather than `not-allowed`: a
disabled control sealed behind `pointer-events: none` shows whatever its
ancestor shows, so one cursor everywhere beats a stronger one we can only
paint on some of them. The `@astryx/disabled-cursor` lint rule (autofixable)
enforces it at author time; `pnpm guard:disabled-cursor --storybook-dir
apps/storybook/dist` hit-tests every disabled element in a built Storybook in
Chromium and fails on any other cursor.

### Playground preview isolation

The docsite playground runs user-authored code in a sandboxed iframe with an
opaque origin, tied to the page only by a nonce-attested MessagePort handshake
(`apps/docsite/src/app/playground/previewChannel.ts`). The `docsite-browser`
job feeds the existing required `docsite-test` check and proves that boundary
in Chromium against a production build: a reloaded
preview document recovers with the current code and theme, and a document that
previewed code navigated the frame to receives nothing. The sandbox only exists
in production builds (`next dev` cannot serve its assets to an opaque origin),
so the specs need a build first:

```bash
pnpm build                                   # workspace packages the docsite imports
pnpm -F @astryxdesign/docsite build
npx playwright install chromium

pnpm test:docsite-browser
```

## Versioning & Releases

We use [Changesets](https://github.com/changesets/changesets) for versioning, with a thin Astryx layer on top so changelogs stay categorized, contributor-attributed, and aligned with our pre-1.0 conventions.

### Adding a Changeset

When you make a change that should be released:

```bash
pnpm changeset:new
```

This wrapper:

1. **Detects which packages you changed** from your git diff and pre-selects them — no hand-enumerating the frontmatter.
2. **Asks for a category** (`breaking`, `experimental`, `component`, `feat`, `fix`, `perf`, `docs`, `chore`) — this drives changelog grouping and the pre-1.0 semver bump.
3. **Captures the contributor(s)** — defaults to your `gh`/git identity, so credit is recorded at authoring time (not reconstructed from the release bot's commit).
4. **Derives the semver bump from the category** — a `[breaking]` change bumps the minor; `[experimental]` and every other category bump the patch (see below).

Choose `[breaking]` only when a valid consumer of the latest stable release must
change source or configuration to keep a supported functional contract working,
or loses a stable public surface. A change only to existing content's appearance,
spacing, typography, layout styling, or visual default uses `[fix]` or `[feat]`
even when its pixels change. Its release note names the old and new appearance
and how to keep the old look when a supported escape exists.

It writes a normal `.changeset/<id>.md` — commit it with your PR. The body looks like:

```md
---
'@astryxdesign/core': patch
---

[fix] Spinner inherits the variant foreground on themed buttons (#2717)
@yourhandle
```

You can also pass everything as flags for non-interactive use:

```bash
pnpm changeset:new --category fix --summary "…" --pr 2717 --contributor yourhandle
```

> The bare `pnpm changeset` CLI still works, but you must follow the body
> convention by hand (`[category]` first line + `@handle` line). CI
> (`pnpm check:changesets`) rejects changesets missing a category or
> contributor, or whose bump doesn't match the category (`[breaking]` must be
> `minor`; `[experimental]` and every other category must be `patch`), or
> declaring a `major` bump while 0.x.

#### When CI requires one

Every pull request runs `scripts/release/changeset-coverage.mjs`, the same
classifier the release coverage audit runs over a release's commits. It fails
when the pull request changes something a published package ships and no
Changeset it adds or edits names that package:

- package source, such as `packages/*/src` of a published package;
- CLI behavior and output under `packages/cli` (`api`, `clients`,
  `foundation`, `authoring`, `assets`);
- shipped documentation: `packages/cli/assets/docs`, `*.doc.mjs`, and a
  package README;
- consumer-facing `package.json` fields such as `exports`, `bin`, and
  dependency or peer ranges.

Stories, the sandbox, tests, fixtures, snapshots, spec records, generated
CHANGELOGs, private and canary-only packages (`lab`, `charts`, `vega`), the
docsite app, CI, and repository tooling never reach a consumer and
need no Changeset. The failure names the package and the command to run, for
example `pnpm changeset:new --packages @astryxdesign/cli --category docs`. Run
the check locally with
`node scripts/release/changeset-coverage.mjs pr --base origin/main --explain`.

Translation updates and new languages need no Changeset; changes to English
source messages or keys still do. Removing a released language import path
follows the [breaking-change policy](docs/specs/AST-017/spec.md).

The same check compares the CLI's machine-readable ids with the latest
release: response `type` values, response fields, golden JSON fields, and
`astryx doctor` check ids. Removing or renaming a released one breaks scripts
that read it. Restore it, or classify the removal in a `@astryxdesign/cli`
Changeset: a `[breaking]` entry that names the id, or a paragraph beginning
`Compatibility:` that names the id and says why consumers of the latest
release keep working. Name an id the way the failure prints it, such as
`themes` or `DoctorCheck.fix`. Catalog values inside those responses, such as template
slugs and docs routes, are data and may change.

### Release versions

- **Main declares the next version.** The fixed group's version in main's
  `package.json` files is the next planned release. Before a cut, an owner may
  raise or lower it while it stays strictly above newest stable. Required
  pull-request lint does not compare that declaration with stable or an active
  cut. The canary publisher publishes only while one plain fixed-group
  declaration is above newest stable, skips equality, and fails below-stable or
  split declarations. Trusted merge-back leaves main's declaration untouched;
  a separate owner change declares the next plan after the release.
- **0.x: the category states the tier a change needs.** A `[breaking]`
  Changeset declares `minor` and is admitted only while main already declares
  the next minor. `[experimental]` and every other category declare `patch`.
  A Changeset never chooses the plan. CI refuses `[breaking]` on a patch plan
  and refuses a minor-to-patch lowering PR that would strand pending breaking
  work. The routes are to keep the old usage compatible through deprecation, or
  have an owner explicitly plan the minor.
- All publishable packages are a `fixed` group, so they release together at one
  version. Only genuinely affected packages get a changelog entry.
- As a contributor you never change the declared version. State compatibility
  intent and add the right Changeset; a maintainer owns release planning. The
  governing contract is `spec:AST-017` FR46–FR51.

### How a release is cut

First, the canonical full-scope `release-check` must pass on an exact commit from
current `main`; the release branch is cut only from that checked SHA while it remains
in current main history. A minor cut also requires Cindy, the release owner, to
explicitly sign off on the exact `vX.Y.0` immediately before the branch is created.
Scheduled or standing authority does not cover a minor.

A release branch `release/vX.Y.Z` is then cut from that commit, where `X.Y.Z` is the
version main declares. On that branch only:

```bash
pnpm version-packages   # changelogs at the declared version + codemod promotion + formatting
```

`scripts/release/version-packages.mjs` admits the frozen Changesets against the
declared version, writes their changelog entries under it, and deletes them; it
never changes a package version. The command then promotes staged codemods,
refreshes exact internal pins, and formats changelogs with contributor credit.
Refresh and verify `pnpm-lock.yaml` before the Version Packages PR merges. After tag and publication, one trusted
`chore/merge-vX.Y.Z-to-main` PR squashes the exact branch-owned outputs and
frozen deletions onto current main while preserving every post-cut change and
main's declaration. A separate owner PR then declares the next plan across the
fixed group, exact internal pins, and lockfile—patch successor by default,
minor only when the owner explicitly names it.

Before the Version Packages PR merges, a patch release self-grades its complete
generated changelogs and draft GitHub Release notes against the public [Blog Review
Rubric](https://github.com/facebook/astryx/wiki/Blog-Review-Rubric#three-required-scored-criteria)
under the `update` profile and records the result on that PR. Every criterion
must pass; failures are fixed on the PR and the complete text is re-graded. A
minor release instead requires Cindy's explicit human editorial approval of the
changelogs, release notes, and public blog, recorded the same way.

## Finding Something to Work On

Labels signal what's open for contribution:

- **`good first issue`** / **`help wanted`** — ready to be picked up; start here.
- **`discussion`** — still being shaped and **not ready for contribution**. The problem is
  recorded but the solution isn't decided. Please don't start work on a fix until it's triaged
  out of `discussion`. Comments and ideas are welcome.

For **pull requests**, use GitHub's native **Draft** state to signal "not ready to review/merge
yet" — open the PR as a draft and mark it ready for review when it's done.

## What's expected of a change

The bar — what a change has to carry, and what blocks — lives on the
**[Component Audit Rubric](https://github.com/facebook/astryx/wiki/Component-Audit-Rubric)**.
It is stated there once, so it cannot drift between this file, the reviewer
instructions, and the wiki. Read it before you open a PR: it is the same page
the reviewer applies to your change, and every check carries an id
(`A8`, `T1`, `P2`…) so a finding always points back to the rule behind it.

What you will find there:

- **[The bright lines that block](https://github.com/facebook/astryx/wiki/Component-Audit-Rubric#the-checks)** —
  hardcoded colors (`T1`, `T3`) · removing a themeable surface (`T2`) · raw CSS
  where StyleX suffices (`T8`) or raw HTML where a primitive exists (`T29`) · a
  broken accessible path (`A8`) and the accessibility bright lines (`A1`, `A3`,
  `A14`) · hardcoded user-facing strings (`I1`, `I2`, `A16`) · public
  API-convention violations (`P1`–`P10`) · dropped passthroughs and breaking
  changes (`P2`, `P11`, `P12`) · a public-repo leak (`L15`) · a missing
  changeset (`X20`). Severity is set by **what breaks if it ships**, not by how
  likely the trigger is — the rubric states each rule, its exceptions, and how
  it is judged.
- **[The bar for your kind of change](https://github.com/facebook/astryx/wiki/Component-Audit-Rubric#reviewing-a-change)** —
  a bug fix owes evidence it was broken before and is fixed now; a new feature
  runs the automatable checks plus whatever the diff touches; a new component in
  `core` gets a full audit; a new component in `lab` is deliberately lax, with
  the audit as the **promotion gate** rather than an entry fee.
- **[Which checks your diff earns](https://github.com/facebook/astryx/wiki/Component-Audit-Rubric#reviewing-a-change)** —
  a trigger table from what you touched to the checks that fire, so a two-line
  fix is not reviewed like a new component.
- **[Recorded component grades](https://github.com/facebook/astryx/wiki/Component-Audit-Rubric#recording-an-audit)** —
  audited components have a score and an open-blocker count in the wiki's
  `component-scores.json` ledger, which is useful context on what shape a
  component is in before you change it. Most components are unaudited, which
  means "no evidence", not "fine". **No PR is gated on a score**, and you are
  never asked to fix problems you inherited by touching a file.

### Before you push

These are this repo's mechanical gates. A reviewer stops at a red one rather
than spending judgment on a PR that doesn't build.

```bash
pnpm lint:strict   # CI severity, not the local warn tier — a warn-tier-green PR is not lint-clean
pnpm test          # the full suite, locally; CI is not your test runner
pnpm build
```

`pnpm lint:strict` runs `pnpm check:repo` first, which covers `check:sync`,
`check:package-boundaries`, `check:changesets`, `check:demo-media`,
`check:executable-bits`, `check:cli-structure`, `check:use-client`, and
`check:i18n-catalog` — so a green `lint:strict` also clears the changeset and
`'use client'` gates.

Also attach **before/after screenshots for any visual change**, and update the
Storybook story for anything you added or altered.

## Pull Request Guidelines

1. Create a feature branch from `main`
2. Make your changes with tests
3. Clear [Before you push](#before-you-push): `pnpm lint:strict`, `pnpm test`,
   `pnpm build`
4. Add a changeset if needed: `pnpm changeset:new`
5. Open a PR with a clear description
6. **Leave "Allow edits by maintainers" enabled** (it's checked by default when
   you open the PR). This lets us rebase your branch onto the latest `main` to
   clear merge conflicts and keep CI passing against current `main`, so a PR
   that's ready doesn't get stuck behind staleness while you're away.

> **Why this helps.** `main` moves quickly, and a branch that was green a few
> days ago can go stale — CI last ran against an older `main`, or a merge
> conflict appears. With maintainer edits enabled we can rebase and re-run CI
> for you instead of round-tripping. (One exception: PRs that modify
> `.github/workflows/**` can't be pushed on your behalf — GitHub requires the
> author to update those; we'll ping you if so.)

## Code Style

The design-system rules — StyleX usage, semantic tokens, theming, API
conventions, accessibility — are on the wiki and indexed from the
[Component Audit Rubric](https://github.com/facebook/astryx/wiki/Component-Audit-Rubric).
What this repo enforces mechanically:

- TypeScript strict mode
- Functional components that declare `ref` as a prop (React 19 — no
  `forwardRef`; `@eslint-react/no-forward-ref` rejects it, and
  `@astryx/require-ref-prop` requires `ref?: React.Ref<T>` on a publicly
  exported props interface)
- `'use client';` as the first statement of any file importing a React client
  API — only comments and blank lines may precede it (`pnpm check:use-client`,
  part of `pnpm check:repo`)
- JSDoc comments for AI-assisted development, with `@example` fences left
  untagged (plain ` ``` `) or Storybook autodocs won't render them
- Export types alongside components

## Troubleshooting

### Setup Issues

**`pnpm: command not found`**

Install pnpm directly:

```bash
npm install -g pnpm@11
```

Or enable Corepack if you want to use the repository's pinned pnpm version:

```bash
corepack enable
```

**`corepack: command not found`**

Install Corepack manually, then enable it:

```bash
npm install -g corepack
corepack enable
```

Node 25+ does not include Corepack. You can either install Corepack manually or
install pnpm directly.

**Unexpected Node.js version**

Check the active version before installing dependencies:

```bash
node --version
```

Use an active LTS line such as 22 or 24 if your shell selected a different
version, such as a non-LTS `stable` release.

**CLI path issues**

If `astryx` is not found in a consuming app, add the package script shown in the
root `README.md` and run it through your package manager:

```bash
pnpm astryx -- component --list
```

### pnpm Installation Issues

If `corepack enable` succeeds but `pnpm` fails to download its binary
(e.g. `ECONNRESET`, `fetch failed`, or `503` from `registry.npmjs.org`),
your environment likely blocks outbound network access.

**Alternative install methods (no `registry.npmjs.org` needed):**

```bash
brew install pnpm                        # Homebrew (macOS)
curl -fsSL https://get.pnpm.io/install.sh | sh -  # Standalone installer
npm install -g pnpm@11                   # Via npm
```

You can also download the binary directly from
[GitHub Releases](https://github.com/pnpm/pnpm/releases/latest).

**Sandboxed IDE terminals:** if your IDE blocks all network, run
`corepack enable && pnpm install` from a regular terminal first, then
open the project in your IDE — `node_modules` is on the local filesystem
and doesn't need network to use.

### Storybook Issues

**"Failed to fetch dynamically imported module"**

- Cause: Core package not built or out of date
- Fix: `pnpm -F @astryxdesign/core build` then restart Storybook

**"React is not defined"**

- Cause: Missing React import in preview.tsx
- Fix: Ensure `import * as React from 'react';` at top of preview.tsx

**"Unexpected 'stylex.defineVars' call at runtime"**

- Cause: StyleX code trying to run without compilation
- Fix: Storybook should load from `dist/` not `src/`. Check vite.config.ts aliases.

**Changes not appearing in Storybook**

- Rebuild the package: `pnpm -F @astryxdesign/core build`
- Hard refresh browser: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
- Clear Storybook cache: Remove `apps/storybook/node_modules/.cache`

## Translations

Astryx accepts community translations via Crowdin. To help translate astryx
into your language, visit <https://crowdin.com/project/astryx>. New locales are
picked up automatically after a maintainer reviews the auto-generated
translations PR. Direct PRs against `packages/core/locales/*.json` also work if
you prefer that flow.

Calendar’s compact weekday labels, such as `Su` and `Mo`, are generated from
Unicode CLDR data because browsers do not provide that format.

## Contributor License Agreement ("CLA")

In order to accept your pull request, we need you to submit a CLA. You only need
to do this once to work on any of Meta's open source projects.

Complete your CLA here: <https://code.facebook.com/cla>

## Issues

We use GitHub issues to track public bugs. Please ensure your description is
clear and has sufficient instructions to be able to reproduce the issue.

Meta has a [bounty program](https://bugbounty.meta.com/) for the safe disclosure
of security bugs. In those cases, please go through the process outlined on that
page and do not file a public issue.
