# Astryx repository guidance

Astryx is a public design-system repository. Never commit internal links,
identifiers, service names, private operational instructions, or other
Meta-only context.

## Instruction surface

This `AGENTS.md` is the canonical, tool-agnostic instruction surface for the
repository. Add or change shared agent guidance here rather than duplicating it
in tool-specific instruction files. Put genuinely path-specific guidance in a
nested `AGENTS.md`.

## Start here

- Product builders: use `astryx docs`, component `{Name}.doc.mjs` files, and
  `packages/cli/assets/docs/`.
- Contributors: read `CONTRIBUTING.md` and the relevant guidance linked from
  `docs/README.md`.
- Pull requests: choose one primary intent and use its template under
  `.github/PULL_REQUEST_TEMPLATE/`; read `docs/contributing/pull-requests.md`
  before opening or reviewing a mixed change.
- Component work: derive the review's semantic triggers, load matching `current`
  global baseline claims with `node scripts/review-global-baselines.mjs
--authority-commit <base-sha> --review-head <head-sha> --triggers
<comma-separated-triggers>`, then read
  the component's `{Name}.spec.md` when one exists and any `module:*` records it
  lists. Load global records before narrower owners, but resolve the direct
  component or family owner first when it governs the exact delta. A global
  route exposes only the listed claim; it never makes the whole record govern
  the component or change. Preserve each matched record, claim, trigger, and
  match reason in the review receipt.
- Any path: `pnpm specs:for <path>` lists the current records linked to it,
  the specs that decided them, and the global claims its component's triggers
  route. It reads the working tree, so on a pull-request branch it shows that
  branch's proposed records; it is a lookup, not review authority. It adds to
  the component-review steps above; it does not replace them.
- Component-local visual intent: reuse or amend the optional `Design decisions`
  table in the current component/module spec only when durable local intent must
  survive future redesigns. Keep exact tuning in code/evidence and shared rules
  in `docs/design/`. DESIGNOWNER authors may include that local intent with the
  pixels and evidence in one atomic appearance-only PR. External contributors
  follow the normal contribution flow and are never asked to author specs;
  maintainers own missing authority.
- Cross-component work: read the relevant contract under `docs/families/`,
  applicable design spec under `docs/design/`, and current architecture under
  `docs/architecture/`.
- Consequential shared-system changes: use a record under `docs/specs/`.
- Writing or reviewing any knowledge record: run the rubric in
  `docs/contributing/spec-writing.md` over the record and put its results in
  the pull request description under `## Writing rubric results`. A record
  describes the system in the present tense; proposals, history, pull
  requests, and research stay out of it. When reviewing, read the record
  against the reported results; a record pull request without them is
  incomplete, so ask for them before reviewing the content.
- Integration contribution work: read `docs/specs/AST-039/spec.md`. Every new
  discoverable item owns a strongly typed, same-stem `.doc.mjs`; root manifests
  locate directories and never catalog their items. No catalog file (like
  `themes/manifest.json`) and no per-item map in the manifest, ever.

## Authority

Knowledge records declare `authority`:

- `draft`: not authoritative; may still need evidence or owner review;
- `current`: explicitly approved and authoritative;
- `archived`: context only, with a reason such as `superseded`, `withdrawn`,
  or `historical` and a replacement link when one exists.

Only `current` records govern implementation and review. Never infer approval
from merged code, silence, an old review, or an existing wiki page.

## Judgment boundary

Resolve checkable behavior from code, tests, and browser evidence. Ask a human
only when a stable public API, theme contract, ownership boundary, compatibility
policy, or genuinely subjective visual direction remains undecided. Ask one
question at a time.

Before drafting, reviewing, or implementing a proposed outcome, search current
records and open pull requests using the proposed canonical owner/id, affected
paths and exported symbols, and the behavior's semantic terms. Extend or project
the existing canonical owner by default. Create a new record only for a distinct
fact boundary, and state why the existing owner cannot contain it. Do not create
new policy for work that is already complete, owned, or superseded.

## Validation

Run `pnpm check:knowledge` after editing knowledge records or templates. A
material template-shape change requires a schema-version bump and migration of
active records; changing template guidance alone does not rewrite accepted
history.

## Custom Commands

### `/vibe-test [count]` - Run vibeability tests

Tests how well AGENTS.md helps LLMs generate correct Astryx component code.

**Usage:**

```
/vibe-test 5                    # Run 5 stratified sample tests (one-shot)
/vibe-test                      # Run all 21 tests (one-shot)
/vibe-test 5 --degradation      # Run 5 tests with degradation curve (10-turn)
```

**How to execute:**

1. Run `pnpm -F @astryxdesign/vibe-tests interactive --sample <count>` to set up iteration
2. Spawn parallel subagents (one per test prompt) to:
   - Read the task file from `results/<iteration>/tasks/{promptId}.json`
   - Generate code for the prompt using Astryx components (AGENTS.md auto-injected)
   - Self-evaluate for success/escape hatches
   - Write `.tsx` result to `results/<iteration>/results/{promptId}.tsx`
   - Write `.json` metadata to `results/<iteration>/results/{promptId}.json`
3. Trigger `gh workflow run vibe-screenshots.yml` to build previews and capture screenshots
4. Run `pnpm -F @astryxdesign/vibe-tests aggregate --iteration <id>` to see results

**Degradation mode (--degradation):**
Tests context retention across 10-turn conversations with filler, distractor, and recovery turns.
Probes at turns 0, 6, 8, 10 to measure quality degradation. Results show a line graph of each test's progression.

**Result format:**

```json
{
  "id": "<iter>-<promptId>",
  "timestamp": "...",
  "model": "claude-code-interactive",
  "persona": "naive",
  "promptCategory": "...",
  "trajectoryDepth": 0,
  "prompt": "...",
  "response": "<code>",
  "evaluation": {"success": true, "componentsUsed": [...], "escapeHatches": [...]}
}
```

Runners may also write an optional `<promptId>.provenance.json` sidecar beside the result metadata. The versioned, executor-neutral contract and fallback behavior are documented in `internal/vibe-tests/docs/execution-provenance.md`.

## AI Context

For architectural context, decisions, and research, see the **[GitHub Wiki](https://github.com/meta/astryx/wiki)**:

- **Decisions** — API Conventions, Why StyleX, StyleX Distribution
- **Architecture** — System Architecture, Component Authoring Guide
- **Research** — AI + Design Systems, AI Model Trajectory, Swizzle Ergonomics
- **Future** — Animation System, RSC Utilities, Distribution Strategy

For component-specific documentation, see the `{Name}.doc.mjs` file in each component directory under `packages/core/src/` (e.g. `Button/Button.doc.mjs`). These are plain JS files with JSDoc type annotations exporting a `ComponentDoc` object (typed via `@astryxdesign/cli/authoring`).

## Documentation Standard

Documentation lives in two places:

1. **File Headers** — Each source file has a structured JSDoc header with `@input`, `@output`, `@position`
2. **Component Docs** — `{Name}.doc.mjs` files in each component directory (props, features, examples)

**Update Protocol**: When modifying code, update the file's header comment. Look for `SYNC:` comments as reminders.

**Audience**: every `.doc.mjs`, and everything under `packages/cli/assets/docs/`, is written for people **building with** Astryx — not for people building Astryx. Internal review rubrics, readiness gates, audit checklists and lab→core criteria belong in the wiki. A public authoring-quality rubric belongs in shipped docs when callers use it to evaluate an artifact they create through Astryx and a current system spec assigns that ownership. [`packages/cli/assets/docs/README.md`](packages/cli/assets/docs/README.md) has the test and the page each kind of material goes to.

## Quick Reference

- **Package manager**: pnpm 11, pinned by the `packageManager` field (see
  CONTRIBUTING.md for install options — Corepack is one of several, and Node
  25+ no longer bundles it)
- **Testing**: Vitest (colocated tests)
- **Components**: `packages/core/`
- **Storybook**: `apps/storybook/`
- **Imports inside a package**: import the defining module (`'../List/List'`), never a folder's index barrel (`'../List'`); public consumers import `@astryxdesign/core`. `@astryx/no-internal-barrel-import` enforces it.

## JSDoc Conventions

- **`@example` code fences must use plain ` ``` `, not ` ```tsx `.**
  Storybook's autodocs parser doesn't handle language-tagged fences in JSDoc correctly — the code block won't render as a proper code block. Always use untagged fences in `@example` blocks.

<!-- STYLEX-CAPS:START -->

[StyleX v0.19.0 CSS Support]|Use CSS-native solutions. Don't build JS workarounds for supported features.
|AT-RULES: @media, @supports, @container (+named), @starting-style, @scope — YES
|AT-RULES: @layer, @property (explicit) — NO (compiles but invalid CSS output)
|PSEUDO-CLS: :hover, :focus, :focus-visible, :focus-within, :active, :disabled — YES
|PSEUDO-CLS: :first-child, :last-child, :nth-child(), :where(), :is(), :has(), :not() — YES
|PSEUDO-CLS: :placeholder-shown, :checked, :empty, :modal, :user-valid, :user-invalid — YES
|PSEUDO-EL: ::before, ::after, ::placeholder, ::selection, ::backdrop, ::marker, ::view-transition-_ — YES
|COMPOUND: ::backdrop+condition, RTL :is([dir="rtl"] _), nested @media+pseudo — YES
|VALUES: var(), calc(), clamp(), light-dark(), color-mix(), container-type/name — YES
|ANIM: transition (shorthand+individual), transitionBehavior:allow-discrete, animation longhands, stylex.keyframes — YES
|ANIM: animation shorthand — NO (use animationName/duration/timingFunction/etc.)
|WHEN: stylex.when.ancestor(':hover'/':focus-within'/':active'/':disabled') — YES
|WHEN: stylex.when.descendant(':hover'), siblingBefore(':checked'), siblingAfter(':checked'), anySibling(':hover') — YES
|WHEN: stylex.when.ancestor('[data-attr]') — YES
|NESTING: CSS nesting with & — NO (use stylex.when.ancestor/descendant/sibling for parent-child state)
|API: stylex.firstThatWorks() for CSS fallbacks (e.g. display: grid with flex fallback) — YES
|API: stylex.positionTry() for anchor positioning @position-try — YES
|API: stylex.types.color/length/etc for typed CSS variables in defineVars — YES
|API: stylex.defineConsts() for compile-time constants — YES
|DYNAMIC: Functions in stylex.create for runtime values — YES
|VARS: stylex.defineVars, stylex.createTheme (require .stylex.ts files) — YES
|LAYOUT: grid, flex+gap, aspect-ratio, overscrollBehavior, scrollbar-gutter/width — YES
|PATTERN: dialog entry animation -> @starting-style (not useState+rAF)
|PATTERN: parent hover child style -> stylex.when.ancestor(':hover', marker) (not CSS nesting). Use stylex.defineMarker() in a .stylex.ts file for scoped markers. Ancestor element MUST have marker.marker in its stylex.props() call. NEVER use stylex.defaultMarker() for form controls (CheckboxInput, RadioList, Switch) — it leaks hover/focus-within from outer containers like Popovers. Always use a component-scoped defineMarker() instead.
|PATTERN: hover on touch -> @media (hover: hover) guard
|PATTERN: zebra striping -> :nth-child(even) (not index%2 JS)
|PATTERN: container responsive -> @container (not ResizeObserver)
|PATTERN: CSS fallback values -> stylex.firstThatWorks() (not manual fallback)
|PATTERN: dynamic/runtime values -> stylex.create({ s: (val) => ({ prop: val }) }) (not inline styles)
|PATTERN: conditional styles -> stylex.props(condition && styles.x) (not className toggling)
|PATTERN: link elements -> useLinkComponent() (not hardcoded <a>). Consumers swap via LinkProvider for framework routers (Next.js, React Router)
|VERIFY: node internal/stylex-capabilities/scan.mjs

<!-- STYLEX-CAPS:END -->

<!-- ASTRYX-CLI:START -->

Astryx CLI|Run from repo root. Load agent docs before any component work.
astryx() { node packages/cli/clients/cli/bin/astryx.mjs "$@"; }
BOOTSTRAP (run every branch, <500ms):
astryx help # discover all commands and options
astryx docs # list available doc topics
astryx docs principles --dense # design rules, anti-patterns, xstyle, tokens
astryx docs tokens --dense # spacing, color, radius, typography, shadow
astryx docs theme --dense # theme provider, light/dark, overrides
astryx component --list # all components grouped by category
astryx template --list # available page templates
ON DEMAND:
astryx docs <topic> --index # section index: one line per section, with its key
astryx docs <topic> <section> # one section, by key or title
astryx component <Name> --dense # props, variants, usage, anatomy for one component
astryx template <name> # emit full page source
astryx template <name> --skeleton # layout skeleton with spatial annotations
astryx swizzle <Name> # eject component source for deep customization
astryx upgrade --from <old version> --apply # run version migration codemods
OPTIONS: --detail compact|brief less output | --dense token-efficient | --zh Chinese
RULE: always run bootstrap on each branch — docs reflect the branch's actual API
RULE: always run astryx component <Name> --dense before modifying a component
RULE: after @astryxdesign/core bump, always run astryx upgrade --from <old version> --apply

<!-- ASTRYX-CLI:END -->
