# RTL semantic audit

A Playwright-driven audit that grades component stories against the astryx RTL
contract. It renders each target story **twice in the same run** — once LTR,
once RTL (via Storybook's `globals=direction:rtl` toggle) — and asserts the
_relationship_ between the two renders. There are **no golden/baseline
screenshots**: nothing is committed to git, nothing drifts on OS/font
differences. It reuses the `@playwright/test` chromium the `pr-a11y` job already
installs and mirrors that job's build-storybook → serve → drive shape. In CI it
is the `pr-rtl` job — the RTL sibling of `pr-a11y`.

## Three layers

### A. Auto-discovery — over every story prefix in the component-package registry

The point of the audit is to auto-catch **new or changed** components, so the
auto-discovery layer runs with **zero curated selectors**. There are three
independent auto passes: **D1 (icon-mirror)**, **D5 (positional-mirror)**, and
**D6 (directional-decoration)**.

> **Scope in CI.** `pr-rtl` passes `--filter` with the components the PR
> touched (from `analysis.json`), matching `pr-a11y`. Eligibility is classified
> by the component policy and package registry loaded from the trusted base ref;
> a missing policy, empty or unmatched path set, unresolved component list, or
> registry/classifier/workflow mutation runs the full audit rather than accepting
> an empty scope. CI partitions that full scope into one bounded shard per
> canonical package, each with eight browser workers. Core, the largest, runs as
> three parts (`--shard i/3`, every third D1 target, story and curated target)
> that `pr-rtl-merge` joins with `--merge-shards` into the report a whole Core
> leg would write; a missing or mismatched part fails the join. The stable `pr-rtl` context
> succeeds only after all five scope manifests arrive and every applicable
> package produces a report whose requested package/filter, duplicate-free exact
> D1/D5/D6 identities, and nonzero planned/completed scans match. When trusted
> policy requires full scope, every manifest must be runnable with an empty
> filter and all five package reports must arrive. A planned scan ending in ERROR
> is incomplete. Missing or malformed analysis/index/manifest input, a noncanonical owner, stale output, a missing or unexpected report, and
> an all-skipped required matrix all fail closed. An ordinary RTL-harness-only PR runs the fixed `Chart,ChartLegend` routing smoke
> scope so package discovery and curated aliases cannot skip their own check. The
> full unfiltered sweep also runs weekly in `.github/workflows/rtl-weekly.yml`.
> Omit `--filter` to run it locally. The blocking accessibility audit consumes the
> same package-qualified owner-to-story routes and fails if any selected owner
> resolves to zero stories.

### A.1 D1 icon-mirror

Directional-icon mirroring. For each audited story it:

1. Loads the story LTR and RTL.
2. Finds **directional** icons generically — classifying each icon SVG as
   left/right via (a) lucide class names (`lucide-chevron-left`,
   `lucide-arrow-right`, `lucide-chevrons-left`, `lucide-caret-right`,
   `lucide-move-left`, …), (b) known fallback-registry path signatures
   (chevron-left `m15 18-6-6 6-6`, chevron-right `m9 18 6-6-6-6`), and (c) the
   enclosing button's aria-label context. **Vertical glyphs (up/down chevrons,
   vertical carets) are excluded**, and ambiguous glyphs are treated as
   non-directional (err toward _not_ flagging — fewer false positives during the
   soft-gate window).
3. Pairs each directional icon LTR↔RTL by aria-context (fallback: index) and
   grades:
   - **pass** — every directional icon is handled: either the wrapper's computed
     `transform` becomes a horizontal-flip matrix (`matrix(-1,0,0,1,…)`) under
     RTL while identity under LTR (the shared `rtlStyles.mirror` `scaleX(-1)`),
     **or** the rendered glyph direction swaps left↔right (name-swap, e.g.
     Pagination's `chevronLeft`↔`chevronRight`).
   - **not-RTL (fail)** — a directional glyph is present but neither flips nor
     swaps (shipped without RTL handling), or it double-flips (flip in _both_
     directions nets to no mirror).
   - **N-A** — the story has no directional icons (not penalised).

This is the broad safety net: a component that lands a directional chevron
without RTL support shows up as a not-RTL finding automatically.

#### Interaction-revealed icons (popovers, dialogs, menus)

Many directional icons live inside content that is closed by default — e.g. the
`Calendar` nav chevrons inside a `DateInput`/`DateRangeInput`/`DateTimeInput`
popover. In the closed story those chevrons are mounted but 0×0, so their mirror
transform can't be evaluated. To avoid a false not-RTL, auto-discovery first runs
a **defensive reveal step**: before scanning, it clicks the first collapsed
disclosure trigger (`aria-haspopup` / `aria-expanded="false"` / `role=combobox`)
and waits briefly for popover/dialog/menu/`[popover]` content to appear, then
scans the opened DOM. Every action is time-boxed and swallowed, so the ~vast
majority of stories with no disclosure surface are untouched and never hang. As a
second guard, any icon still rendered at 0×0 after the reveal (genuinely
unreachable) is **not** counted as a directional finding — it contributes to
N-A, never a false not-RTL. Net effect: the Date\*Inputs correctly score **pass**
because their embedded Calendar chevrons mirror once the popover is open.

### A.2 D5 positional-mirror

A second auto pass, over **every** audited-package story, that catches a bug class D1 and
the `@astryx/no-physical-properties` **lint both miss**: an element positioned
with a **logical anchor** (`insetInlineStart` / `insetInlineEnd`, which _does_
flip under RTL) paired with an **unflipped physical transform**
(`translate`/`translateX`, which does _not_ flip). The physical translate
over/under-shifts the box relative to its mirrored anchor, so the element lands
on the **wrong side** in RTL.

Real instances found this way (all logical-anchor + physical-translate): the
Avatar **status-dot**, the Table **sticky-column shadow**, the **ResizeHandle**
hit-area, and the Carousel **pill**.

For each core story it:

1. Loads the story LTR and RTL (reusing the same `settle()` + **reveal step** as
   D1, so interaction-gated positioned elements — dialogs/popovers/menus — are
   scanned too, not just static ones).
2. Auto-discovers candidates: every element whose computed
   `position: absolute|fixed` **and** whose computed `transform` has a non-zero
   horizontal translate component (parsed from the `matrix()` _e_-value /
   `matrix3d` 12th entry). No per-component selectors.
3. Records each candidate's **center-X relative to its `offsetParent`**, then
   pairs LTR↔RTL candidates by DOM index (stable across directions in every
   tested story) and asserts the RTL center **mirrors** the LTR center about the
   parent's horizontal center:

   ```
   rtl_relCenterX  ≈  parentW − ltr_relCenterX      (within tolerance)
   ```

   - **pass** — every positioned candidate mirrors about its parent center.
   - **not-RTL (fail)** — a candidate's RTL center is _not_ the mirror of its
     LTR center: it stayed on the same physical side (or over-shot). The report
     lists the element class + LTR/RTL `relCenterX` + delta as an actionable
     finding.
   - **N-A** — the story has no logical-anchor + physical-transform candidates
     (the common case — not penalised), or candidates were found in one
     direction only, leaving nothing to compare.

**LTR-first short-circuit.** If the LTR render yields zero candidates the story
returns `N-A` immediately and the RTL page is never loaded — with nothing to
measure against, the second navigation can't change the verdict. Most stories
have no candidates (1378 of 1394 in a recent full sweep), so this is about half
of D5's page loads.

**One LTR load shared with D6.** D5 and D6 both scan every story, so one LTR
load serves both: D5 reads the page before the reveal step (unless
`--pm-reveal`), D6 after it, the same order each used on its own load. The RTL
page loads only when either dimension found an LTR candidate.

It is also a correctness fix: the old `ltr.length === 0 && rtl.length === 0`
guard let one-sided stories fall through to a compare loop that runs
`min(ltr, rtl) = 0` times, reporting **pass** having compared nothing.

**Tolerance: 3px.** The observed signal gap was ~10× the tolerance (a real
mis-position is tens of px off; a correctly-centered element passes at Δ=0 by
construction — e.g. a Slider thumb centered with `translateX(-50%)` mirrors to
itself). 3px absorbs sub-pixel rounding without admitting the bug class.

Three guards keep D5 at **0 false positives** at full-library scale. A real
wrong-side bug is a **small** element (width ≪ parent) sitting at one **edge**;
each guard removes a benign shape that is _not_ that:

**1. Mandatory degenerate-parent guard.** Any candidate whose `offsetParent` is
**< 8px wide** is skipped. A ~1px-wide parent (e.g. the ResizeHandle divider)
makes the mirror target ≈ the element's own coordinate, producing meaningless
"already-mirrored" or "wildly-off" readings — pure noise. In the validation
spike this guard removed the single false positive.

**2. Full-span / origin guard.** Any candidate whose own width is **≥ 90 % of
its parent's width** is skipped: a full-bleed strip spans the _entire_ parent,
so it occupies both halves and has **no left/right side** to land on the wrong
one. This catches `useResizable`'s **vertical** grab zone (`ResizeHandle`'s
`hitAreaOffsetY`): a full-width strip anchored `insetInlineStart:0;
insetInlineEnd:0` with a purely-visual centering `translate(-50%,…)`, so its
geometric _center_ sits at the parent origin (relCenterX≈0) **identically in LTR
and RTL**. The mirror assertion would otherwise compute `expected = parentW − 0
= parentW` and fire a spurious `Δ = parentW`. The degenerate-parent guard misses
it (the parent is ~850–1034 px, not tiny) and the centered guard misses it (the
center is at the _edge_, x≈0, not at `parentW/2`) — so this dedicated guard is
required. A real bug (Avatar status-dot: a tiny dot in a 20–128 px parent) has
`elW ≪ parentW` and is unaffected.

**3. Centered-element guard.** A candidate already at the parent's horizontal
center (within 5 % of parent width) mirrors to itself and can't exhibit the bug;
skipping it removes benign vertical-control noise (e.g. a vertical Slider thumb).

With all three guards the pass is **6/6 true positives (all Avatar status-dot
variants), 0 false positives across the full library**.

**Why lint can't catch this.** `@astryx/no-physical-properties` (and any
per-property linter) sees each declaration in isolation: a _logical_ inset is
_encouraged_, and a `transform` is not a physical _inset_ property, so neither is
flagged. The bug only exists in the **interaction** of the two at layout time,
which is visible only by comparing the rendered LTR vs RTL geometry — exactly
what D5 does.

### A.3 D6 directional-decoration

Text can be directional because of its **role in the UI**, not only because of
the character itself. `/` in prose is neutral; the same `/` rendered as an
`aria-hidden` separator between repeated breadcrumb items communicates forward
progress and must mirror.

D6 runs over every story and auto-discovers only strong decoration contexts:

- the element is `aria-hidden="true"`;
- its trimmed content is one supported glyph; and
- it belongs to repeated list items or sits between sibling elements.

That context prevents ordinary prose, dates, fractions, and paths from becoming
false positives. D6 then applies the glyph's actual bidi contract:

- `/`, `\\`, `→`, `←`, `>`, and `<` require exactly one explicit transform
  mirror or a left/right glyph swap;
- `›`, `‹`, `»`, and `«` have Unicode `Bidi_Mirrored=Yes`, so the browser
  mirrors an unchanged glyph. Swapping or transforming them again is a failure.

D6 returns **N-A** when a story contains no contextual decoration. The
applicability layer below decides whether that N-A is explained; D6 itself does
not turn absence into a pass.

### B. Curated precision — D2 / D3 / D4 / D7 / D8 / D9

`targets.json` holds the geometry/behavior dimensions that genuinely need
hand-written selectors, run **in addition** to auto-discovery:

- **D2 layout-order-flip** — prev/next controls swap horizontal order
  (`boundingBox`). _(Calendar, Lightbox.)_
- **D3 behavior-flip** — directional behavior inverts, e.g. Carousel's scroll
  axis: "next" makes `scrollLeft` go positive in LTR and negative in RTL.
- **D4 overlay-side** — a positioned affordance flips side (`boundingBox`).
- **D7 coarse native size/alignment** — each configured native input remains
  centered under its visible coarse-pointer wrapper, receives a center-point
  hit, and meets both dimensions of the target's `minimumTargetSize` in LTR/RTL
  at every configured size. The minimum belongs to the component/composition,
  not a universal audit default; missing or invalid dimensions are errors.
  Reports retain native and wrapper boxes separately so a large wrapper cannot
  conceal an undersized input.
- **D8 logical inline-edge mirror** — one configured, visible, non-zero subject
  carries an intentionally asymmetric logical start/end padding pair whose
  logical values stay stable while the resolved physical inline-axis sides swap
  between LTR and RTL: left/right in horizontal writing, top/bottom in vertical
  or sideways writing. The orthogonal physical edges must remain stable.
  Missing, duplicate, hidden, zero-size, symmetric, or changing-writing-mode
  fixtures fail closed because they cannot prove the relationship. Real
  Chromium startup self-checks prove horizontal and vertical-writing passes plus
  a hidden-subject failure before any component result is accepted.
- **D9 logical grouped corners** — configured first/middle/last subjects must
  tighten the end/both/start corners on one declared logical inline side, keep
  every opposite-side corner full, and mirror the physical side between LTR and
  RTL. Missing, hidden, symmetric, inconsistent, or physically pinned groups
  fail rather than earning coverage for parent alignment.

D1, D5, and D6 are intentionally **not** in `targets.json`; auto-discovery covers
them universally.

### C. Applicability: no unexplained all-N/A components

The report rolls every public component in the canonical component-package
registry into one of three states. Package roots, layouts, story prefixes, and
public component names come from `scripts/component-packages.cjs`; Storybook
titles project onto that canonical roster across Core, Lab, Charts, Rich Text,
and Vega, including one-to-many grouped titles such as
`Charts/Chrome/Axes & Grids`. Curated targets remain the exact alias when a title
cannot name its owner. An entry with an empty `dims` array is route-only: it
binds a public owner to a story that renders it for universal D1/D5/D6 scanning
without inventing a curated measurement.

- **measured**: at least one D1/D5/D6 or curated dimension was applicable;
- **verified N-A**: `verified-not-applicable.json` records a specific reason
  the component has no direction-sensitive visual, layout, or behavior;
- **coverage gap**: every dimension returned N-A and no reason is recorded.

Coverage gaps are findings. This rule applies to the existing full-library
weekly sweep and to every new or changed component in PR CI. A component with no
story is also a gap when it is named by `--filter`; it cannot disappear from the
report merely because there was nothing to render.

A verified-N/A declaration is not an allowlist. If an automatic or curated
dimension later becomes applicable, the declaration is reported as
**stale-verified-na** and must be removed or replaced with real coverage.

Add a declaration only after reading the component's source and every story:

```json
[
  {
    "component": "core/Text",
    "reason": "No direction-sensitive visual, positioned element, order, scroll, drag, overlay, or keyboard behavior."
  }
]
```

An all-N/A scorecard without such a checked-in reason means **unmeasured**, not
RTL-ready.

## Why relationship-based, not pixel baselines

Directional RTL bugs are _semantic_ ("the chevron didn't mirror", "prev/next
didn't swap sides", "the scroll axis didn't invert"), not "these pixels
changed". The audit asserts the LTR→RTL relationship per dimension, catching
exactly that class of regression while sidestepping the flakiness of
glyph-over-photo pixel diffing.

## Running locally

```bash
# 1. Build the packages + a static Storybook (root build MUST run first, or the
#    storybook build fails to resolve @astryxdesign/build/dist/vite.mjs).
pnpm build
pnpm -F @astryxdesign/storybook build

# 2. Install the Playwright browser (once).
npx playwright install chromium

# 3. Run the audit against the built Storybook.
pnpm rtl:audit
#   -> prints the scorecard and writes rtl-audit-report.json

# Scope to one component while iterating. Note the `--`: pnpm -F IS --filter,
# so without it pnpm eats the flag as a workspace filter.
pnpm rtl:audit -- --filter Pagination

# Comma-separated, matched case-insensitively (accepts analysis.json's
# PascalCase names — this is what pr-rtl passes):
pnpm rtl:audit -- --filter Avatar,TableTree

# An absent or EMPTY --filter audits the whole library: ~1400 stories.

# Parallelise the sweep across N browser pages (default 1 = serial). Results
# are ordered by input, so the report is byte-identical at any N.
pnpm rtl:audit -- --concurrency 4

# Just the broad auto-discovery net, or just the curated dims:
pnpm rtl:audit -- --auto-only
pnpm rtl:audit -- --curated-only
```

For the D7 gate's native-width, native-height, alignment, hit-testing, and
minimum-contract mutations (Chromium required):

```bash
ASTRYX_RTL_BROWSER=1 pnpm exec vitest run --project node .github/scripts/rtl-audit-coarse-hit.browser.test.mjs --maxWorkers=1
```

Exit code is non-zero if auto-discovery finds a not-RTL component, a curated
dimension fails, the applicability registry is invalid, or a full-mode run has
a coverage gap or stale verified-N/A declaration. CI remains soft-gated (see
below), so the signal does not hard-block yet.

## Adding a curated target

Edit `targets.json`. Each entry is:

```jsonc
{
  "component": "MyComponent", // explicit alias for grouped story titles
  "storyId": "core-mycomponent--some-story", // must exist in dist/index.json
  "dims": ["D2", "D3", "D9"], // D2/D3/D4/D7/D8/D9 only (D1/D5/D6 are auto)
  "setup": {
    "args": {"position": "start"}, // optional: drive Storybook args
    "click": "img", // optional: reveal the target after args settle
  },
  "selectors": {
    "prev": "button[aria-label=\"Prev\"]", // D2
    "next": "button[aria-label=\"Next\"]",
    "scroller": "[aria-roledescription=\"carousel\"] > div:first-child", // D3
    "nextButton": "button[aria-label=\"Scroll right\"]",
    "overlay": "…",
    "overlayRoot": "…", // D4
    "groups": [
      // D9
      {
        "name": "primary",
        "logicalSide": "inline-start",
        "first": "[data-testid=group-first]",
        "middle": "[data-testid=group-middle]",
        "last": "[data-testid=group-last]",
      },
    ],
  },
}
```

## No allowlist — any not-RTL is a failure

The RTL migration is complete: every component's directional icons mirror
correctly, so the audit runs with **no allowlist**. Any component auto-discovery
scores not-RTL is a real regression (a **surprise**) and should be fixed, not
excused. There is deliberately no mechanism to mark a not-RTL component as
"expected" — such a mechanism would be a built-in way to silence a genuine
future regression.

### D5 positional-mirror is not yet clean on `main`

D5 currently flags the Avatar **status-dot** on `main`: it anchors the dot with
a physical `right` + `translate(50%, 50%)`, so under RTL the dot stays
bottom-**right** instead of mirroring to bottom-**left** — a genuine RTL bug.
The fix lives on a separate branch (**#4564**) that hasn't merged yet, so on any
branch cut from `main` D5 will report the Avatar status-dot stories as
positional-mirror FAILs. **This is a real finding, not a false positive**, and
is deliberately **not** suppressed — the soft-gate (see below) keeps it
non-blocking, and it clears automatically once #4564 lands. Every _other_
component passes D5 (0 other flags), matching the validation spike's
6/6-in-Avatar-only result.

## Soft-gated — pending a stability window

The `pr-rtl` CI job runs with `continue-on-error: true`: a finding surfaces the
scorecard in the job summary but does not block merges while the audit is
observed for flake over a stability window. This soft-gate is what lets the
Avatar D5 finding (above) surface honestly without breaking CI. To promote to a
required check once stable: drop `continue-on-error` from the `pr-rtl` job in
`.github/workflows/ci.yml` and add it to the required checks.
