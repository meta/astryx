---
schema_version: 1
template_version: 1
kind: architecture
id: architecture:theme-tokens
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-08-30
owners: [cixzhang, imdreamrunner]
applies_to:
  [
    packages/core/src/theme/tokens.stylex.ts,
    packages/core/src/theme/tokens.ts,
    packages/core/src/theme/localTokens.ts,
    packages/core/src/theme/domainTokens/,
    packages/core/src/theme/syntax/,
    packages/cli/assets/theme.template.ts,
  ]
verified_by:
  [
    packages/core/src/theme/tokens.test.ts,
    packages/core/src/theme/defineTheme.test.ts,
    scripts/check-theme-template.test.mjs,
    scripts/generate-token-docs.mjs,
  ]
deciding_specs: [spec:AST-006/DEC-1, spec:AST-006/DEC-5]
---

# Theme token architecture

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "tokens": ["INV1", "INV3", "INV4", "INV6", "INV8", "INV9", "INV10", "INV11"]
  }
}
```

This record defines the semantic token vocabulary that components, themes,
documentation, and non-CSS consumers share.

## Purpose

A theme author and a component author should refer to the same stable semantic
names. Changing a default theme, resolving a token in JavaScript, or generating
consumer documentation must not create a second token vocabulary.

## System model

Core tokens are declared as paired exports in `tokens.stylex.ts`:

- `*Defaults` objects hold default CSS values.
- `*Vars` objects are created from those defaults with `stylex.defineVars` and
  are what component styles consume.
- `defineTheme` combines the core defaults into the complete theme token type.
- `tokenVar`, `tokenVars`, `resolveThemeToken`, and `resolveThemeTokens` expose
  the same vocabulary to canvas, SVG, charts, tests, build tools, and other
  non-StyleX consumers.

Syntax-highlighting and data-visualization tokens are domain layers. They remain
separately importable so applications that do not use those domains do not need
their implementation modules, while `domainTokenDefaults` makes their names
available to theme validation and resolution.

The CLI theme template and generated token documentation are projections of
this vocabulary. They do not define additional tokens.

Theme-family-local tokens are a separate enrolled map. They may reuse the
existing token value shape, but they do not enter `TokenName`, defaults,
`tokenVar`, `tokenVars`, `resolveThemeToken`, `resolveThemeTokens`, generated
portable documentation, or Core component source. A name cannot be present in
both portable `tokens` and `localTokens` because CSS and non-CSS resolution would
then have contradictory winners.

## Boundaries and invariants

- **INV1 — `defineVars` declarations are canonical.** A core token name and its
  default originate in `tokens.stylex.ts`; projections do not introduce names.
- **INV2 — Defaults and typed variables move together.** Each core token family
  has one `*Defaults` object and matching `*Vars` export.
- **INV3 — Token names describe semantic roles.** Components consume purpose-led
  names such as text, surface, spacing, and motion roles rather than embedding a
  theme's raw palette choices.
- **INV4 — Mode-relative defaults remain one token.** A semantic role that varies
  by color mode uses a supported `light-dark()` or tuple value instead of
  creating unrelated light and dark token names.
- **INV5 — Domain layers are explicit.** Syntax and data tokens are available to
  theme authoring and resolution without being folded into the core component
  token module.
- **INV6 — Non-CSS consumers resolve the same graph.** JavaScript helpers follow
  token references and supported color expressions instead of maintaining a
  second set of resolved values.
- **INV7 — Projections cannot drift silently.** Theme-template inventory and
  generated token docs change with the canonical family or fail validation.
- **INV8 — Theme-local names stay non-portable.** Enrolled local declarations
  remain outside the canonical vocabulary, typed helpers, generated portable
  documentation, and Core component dependencies.
- **INV9 — Spacing tokens are rem.** The core `--spacing-*` defaults are `rem`
  values (`--spacing-N` is `N × 0.25rem`; `--spacing-4` is `1rem`, 16px at the
  default root), so gaps, padding, and margins built from them follow the
  reader's root font size the way the type scale does. One rule covers every
  surface: a spacing step is `rem` unless a theme documents that step as a
  `px` exception. A theme that overrides steps writes `rem`; a generator of
  spacing steps (the CLI theme templates, which copy a first-party theme
  verbatim, and the docsite playground theme editor's ramp) emits `rem`, and
  reproduces a theme's documented `px` exception only because the theme
  declares it. Values an author writes in a custom theme are honoured as
  written, never converted. Non-CSS consumers (`useTheme().token()`,
  `resolveThemeToken()`, `tokenDefaults`) return the token's value with its
  unit; code that needs pixels resolves the value against the root font size
  instead of parsing a number.
- **INV10 — Astryx's colour token names follow one grammar.** The grammar
  governs only the colour tokens Astryx defines: the Core `colorDefaults`, the
  domain-layer defaults, and the tokens Astryx's first-party themes set from
  that vocabulary. It does not govern names Astryx does not define, such as a
  product's or application's own CSS variables, a theme author's extensions or
  local tokens (INV8), or another design system's tokens. Every colour token
  Astryx defines takes one of five shapes:
  1. `--color-<property>-<role>`: a colour for one paint property. The property
     is `text`, `icon`, `background`, or `border`. The role is an emphasis
     (`primary`, `secondary`, `disabled`, `emphasized`), an intent
     (`--color-text-accent`), a surface (`surface`, `body`, `card`, `popover`,
     `muted`, `inverted`), or a hue (`--color-text-green`).
  2. `--color-<intent>`: the intent's own colour. The intents are `accent`,
     `neutral`, `info`, `success`, `warning`, and `error`.
  3. A shape-1 or shape-2 name with one variant suffix: `-muted` (the pale
     form), `-emphasized` (the strong form), `-hover` or `-pressed` (an
     interaction state), or `-inverted` (for an inverted surface).
  4. `--color-on-<fill>`: content placed on a fill, where `<fill>` is a shape-2
     or shape-3 intent name, `dark`, or `light`. `--color-on-<intent>` is
     content on the intent's strong fills, its bare and `-emphasized` forms; a
     `-muted` fill pairs with its own `--color-on-<intent>-muted`.
  5. `--color-<domain>-…` for a domain layer under INV5: `--color-data-*` and
     `--color-syntax-*`.

  The role-less utility names `--color-border`, `--color-overlay` (with its
  `-hover` and `-pressed` states), `--color-shadow`, `--color-skeleton`,
  `--color-track`, and `--color-tint-hover` keep their names. A new name adds
  no group segment (such as `status`), no other property word (such as
  `foreground`), and no property suffix (such as `-text`). Tailwind keys are a
  projection: a key may alias a token under a shorter name, and it never adds a
  CSS variable.

- **INV11 — Semantic status roles are surface-specific.** Each status (`info`,
  `success`, `warning`, `error`) has these roles on three surfaces, named under INV10:
  - `--color-text-<status>` is status text on the default page and card
    surfaces, at 4.5:1 or more against them. `--color-icon-<status>` and
    `--color-border-<status>` are status icons and status borders on those
    surfaces. Each defaults to `--color-text-<status>`; an Astryx theme that
    sets its own keeps it at 3:1 or more against the same surfaces.
  - `--color-<status>-emphasized` is the strong status fill. Content on it uses
    `--color-on-<status>`, at 4.5:1 or more.
  - `--color-<status>-muted` is the pale status fill. Content on it uses
    `--color-on-<status>-muted`, at 4.5:1 or more where the fill sits on the
    default surface.

  Every status fill and status text colour is chromatic: no Core default,
  first-party theme, or value derived under `architecture:theme-compilation`
  INV17 paints one in a neutral grey, near-black, or near-white. The contrast
  floors and the chromatic rule bind Core's defaults, Astryx's first-party
  themes, and derived values in light and dark mode; a value a third-party
  theme sets is that theme's own. Core's dark strong Info and Error fills are
  therefore deeper than its accent and base error colours, which fall below
  4.5:1 under white content. Components select the role from the surface
  instead of using one colour for every job. When a theme does not set a role,
  theme generation derives it (`architecture:theme-compilation` INV17). The
  generated token
  documentation describes each status role in one line: the surface it serves
  and the token it pairs with.

  In forced-colors mode the browser's system colours replace every status role:
  status text, icons, and content on a fill render in `CanvasText`, and fills
  render in `Canvas`. Status therefore never depends on colour there. Each
  status keeps its non-colour cue (a label, an icon, or text), and a strong or
  pale status fill keeps a visible `CanvasText` border so its shape survives.

  The released `--color-success`, `--color-warning`, and `--color-error` keep
  their values and meaning in every theme, and so do the Tailwind utilities
  that resolve to them (`bg-success`, `text-success`, `border-success`, and the
  warning and error forms); Astryx components use the surface roles instead.

This record does not own:

- the `defineTheme` input shape, generated scales, or precedence;
- local-token names, meanings, enrollment, ownership, lineage, and emission;
- mounting, nesting, color-mode selection, or runtime theme observation;
- turning a normalized theme into scoped CSS and build files;
- component-specific targets, visual states, or private derived variables.

Those concerns belong to separate theming architecture records so a token change
does not silently change authoring, runtime, compiler, or component contracts.

## Change coupling

- Adding, removing, or renaming a core `*Defaults` family updates its `*Vars`
  export, the combined `TokenName`/defaults surface, the CLI template inventory,
  generated token docs, and drift tests together.
- Adding or changing a domain token updates that domain's defaults and exported
  name type; the aggregate domain map remains the validation bridge.
- Renaming or removing a released token is a compatibility decision, not a
  mechanical cleanup. Consumers may use its CSS custom-property name directly.
- Changing a default value is a visual behavior change and requires real-browser
  evidence for representative light/dark, status, and high-contrast surfaces.
- Changes to JavaScript resolution preserve CSS cascade semantics for supported
  references and color expressions; unsupported expressions remain intact
  rather than being guessed.
- Adding a portable colour token chooses its name under INV10; a role the
  grammar cannot name changes INV10 first.
- Adding a theme-local name does not update portable defaults, name types,
  helpers, or generated token docs. Authoring validation rejects a duplicate
  across `tokens` and `localTokens` before the compiler or helpers can disagree.

## Owning code

- `packages/core/src/theme/tokens.stylex.ts` owns core token names, defaults, and
  StyleX variables.
- `packages/core/src/theme/domainTokens/` and
  `packages/core/src/theme/syntax/tokens.ts` own domain vocabularies. The
  syntax vocabulary is nineteen slots: thirteen token colours, the code
  background, the three diff row paints, and the two diff marker colours.
  `--color-syntax-added` and `--color-syntax-removed` default to
  `--color-success-muted` and `--color-error-muted` at 25% strength
  (`color-mix` with transparent); `--color-syntax-diff-header` defaults to
  `--color-background-muted` in the default syntax theme and, in a defined
  syntax theme that leaves it unset, to `transparent` (the header row sits on
  that theme's own syntax background with its `punctuation` text); `--color-syntax-added-marker` and
  `--color-syntax-removed-marker` (the line number and the glyph of a
  changed row) default to `--color-text-green` and `--color-text-red` in the
  default syntax theme, and in a defined syntax theme that leaves them unset
  they take that theme's `--color-syntax-punctuation`. The added and removed
  row paints keep their defaults in every theme that does not set them.
- `packages/core/src/theme/defineTheme.ts` aggregates token types/defaults for
  validation and authoring; it does not become a second token source.
- `packages/core/src/theme/tokens.ts` owns server-safe references and resolution.
- `packages/core/src/theme/localTokens.ts` enforces the boundary between the
  portable and enrolled local maps; it does not add local names to this
  vocabulary.
- `packages/cli/assets/theme.template.ts` and generated token docs are checked
  projections for theme authors and consumers.

## Deciding specs

AST-006 decisions 1 and 5 establish that theme-local names are additive,
theme-family contracts rather than portable Astryx tokens. The existing portable
vocabulary and helper architecture remain unchanged.

### DEC-1 — Spacing follows the root font size

**Decider:** `cixzhang`, `2026-10-12`

Spacing tokens are `rem`. A reader who raises the browser's root font size gets
proportionally larger gaps and padding, so text does not tighten inside boxes
that stay in pixels; at the default 16px root each step is `4px × step`.
`defineTheme` has no spacing base unit: it takes spacing only as per-step token
overrides (`architecture:theme-authoring-contract` owns that input). Two
surfaces generate spacing steps and both emit `rem` under INV9's one rule: the
CLI's theme templates, which copy a first-party theme's steps verbatim, and the
docsite playground's theme editor, which derives a ramp from a base step and
exports it as `defineTheme` source. The visual gate's probe theme pins
`--spacing-4` in `px` on purpose, to prove a token value flows through; it is a
test fixture, not a generator, and keeps its pin. Theme authors keep control: a
theme may pin a step in `px` as its documented exception, and author-written
values are never rewritten. Costs accepted with the decision: fixed-width table columns lose
room to larger padding at very large roots; a theme whose pinned `px` steps are
its documented exception does not follow the root for those steps; and code
that parses a spacing token as a pixel number reads the wrong value, which no
codemod can find.

Rejected: keeping spacing in `px` while type is `rem` (text grows into fixed
boxes); converting author-written `px` in custom themes (a theme's own
decision).

### DEC-2 — Info status roles reuse retired names

**Decider:** `cixzhang`, `2026-10-24`

The Info roles of INV11 use the grammar's names, including
`--color-info-muted`, which shipped with a purple meaning until v0.0.8. The
v0.0.8 upgrade transform still rewrites that name to `--color-background-purple`.
It runs only when a project upgrades from a version before v0.0.8, whose code
used the retired meaning, so the reuse does not change a released contract for
any supported project. Bare `--color-info` stays unused.

Rejected: an off-grammar name such as `--color-information-muted`, which INV10
cannot name.

## Verification

| Invariant                    | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Failure signal                                                                                                                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INV1, INV2, INV7             | `scripts/check-theme-template.test.mjs` and token-doc generation check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | A token family exists without a matching author-facing inventory or generated documentation                                                                                                                                                                |
| INV5                         | Domain-token exports and theme-generation tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Domain names disappear from validation or require importing unused domain implementation                                                                                                                                                                   |
| INV6                         | `packages/core/src/theme/tokens.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | JavaScript resolution disagrees with defaults, mode selection, references, or supported color expressions                                                                                                                                                  |
| INV8                         | `defineTheme.test.ts`, template checks, and token-doc generation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | A local name enters portable helpers/docs or can conflict with a portable declaration                                                                                                                                                                      |
| INV9                         | `tokens.test.ts` (core defaults), `SpacingRootFontSize.a11y.chromium.spec.ts` (real-Chromium root font size), each overriding theme's `*Theme.spacing.test.ts`, `check-cli-theme-bundle.test.mjs` (bundled copies byte-equal to the packages), `theme-concentricity.test.ts` (playground ramp read in rem)                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | A spacing step in `px` that no theme documents as its exception: a core default, a theme override, a bundled copy, or a generated ramp step                                                                                                                |
| INV10                        | `tokens.test.ts` name check over Astryx's own `colorDefaults` and `domainTokenDefaults` only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | A colour token Astryx defines fits none of the five shapes                                                                                                                                                                                                 |
| INV11                        | Implementation acceptance, not yet shipped: `scripts/check-muted-status-contrast.test.mjs` (resolves global and Banner pale-surface role pairs), `scripts/check-badge-contrast.test.mjs` (resolves Core Badge defaults plus theme overrides), `scripts/check-status-text-contrast.test.mjs` (resolves `--color-text-<status>`, `--color-icon-<status>`, and `--color-border-<status>` against the surface and card tokens and checks that each status fill and text colour is chromatic in every first-party theme), `neutralTheme.test.ts` (pins reviewed role values and pairings), `tailwind-theme.test.ts` (pins the status utilities, including the released base ones), forced-colors assertions in the Badge, StatusDot, and Banner tests, and theme alias-generation tests | A status role is missing, mispaired, grey, routed to the wrong public utility, or falls below its contrast threshold in light or dark mode, a status fill loses its border in forced-colors mode, or a released base status token or utility changes value |
| Released token compatibility | Type checking plus representative package/source builds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | A released CSS variable or typed token name disappears without an explicit migration decision                                                                                                                                                              |
| Visual defaults              | Real Chromium examples in light, dark, status, and high-contrast contexts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | A changed default produces unreadable or semantically inconsistent output                                                                                                                                                                                  |
