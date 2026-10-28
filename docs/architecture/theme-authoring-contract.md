---
schema_version: 1
template_version: 1
kind: architecture
id: architecture:theme-authoring-contract
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-08-30
owners: [cixzhang, imdreamrunner]
applies_to:
  [
    packages/core/src/theme/defineTheme.ts,
    packages/core/src/theme/themeAdaptations.ts,
    packages/core/src/theme/syntax/defineSyntaxTheme.ts,
    packages/core/src/theme/expandColorScale.ts,
    packages/core/src/theme/expandTypeScale.ts,
    packages/core/src/theme/expandRadiusScale.ts,
    packages/core/src/theme/expandMotionScale.ts,
    packages/core/src/theme/mergeComponents.ts,
    packages/core/src/theme/onMediaTokens.ts,
    packages/core/src/theme/localTokens.ts,
    packages/themes/,
    packages/cli/assets/theme.template.ts,
  ]
verified_by:
  [
    packages/core/src/theme/defineTheme.test.ts,
    packages/core/src/theme/themeAdaptations.test.ts,
    packages/core/src/theme/syntax/serverSafeSyntax.test.ts,
    packages/core/src/theme/expandColorScale.test.ts,
    packages/core/src/theme/expandTypeScale.test.ts,
    packages/core/src/theme/expandRadiusScale.test.ts,
    packages/core/src/theme/expandMotionScale.test.ts,
    packages/core/src/theme/onMediaTokens.test.ts,
    scripts/check-theme-template.test.mjs,
  ]
deciding_specs:
  [
    spec:AST-006/DEC-1,
    spec:AST-006/DEC-2,
    spec:AST-006/DEC-3,
    spec:AST-006/DEC-4,
    spec:AST-006/DEC-6,
    spec:AST-012/DEC-1,
    spec:AST-012/DEC-2,
    spec:AST-012/DEC-3,
    spec:AST-012/DEC-4,
    spec:AST-017/DEC-1,
    spec:AST-087/DEC-2,
    spec:AST-087/DEC-7,
    spec:AST-087/DEC-9,
    spec:AST-087/DEC-10,
  ]
---

# Theme authoring contract

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "theming": [
      "INV1",
      "INV3",
      "INV8",
      "INV9",
      "INV11",
      "INV12",
      "INV13",
      "INV14"
    ]
  }
}
```

This record defines what a theme author may express and how `defineTheme`
normalizes that input into one self-contained theme representation.

## Purpose

A theme author should describe design intent once. Runtime mounting and static
builds should consume the same normalized result instead of reinterpreting the
source configuration independently.

## System model

`DefineThemeInput` accepts:

- a name and optional normalized base theme;
- higher-order color, typography, radius, and motion configuration;
- explicit semantic token overrides;
- optional theme-family-local token declarations;
- component target/style-key overrides;
- icon and indicator registries, the `componentIcons` slot map, and the
  `iconVariants` list;
- syntax tokens;
- `onDark` / `onLight` surface overrides; and
- ordered environmental `adaptations` with a fixed named width map.

`defineTheme` resolves that input into a flat `DefinedTheme`. An extended theme
contains the resolved values it inherits, so its normalized representation is
complete. A standalone build does not need the base stylesheet.

Normalization follows one precedence order:

1. the resolved base theme;
2. values generated from color, typography, radius, and motion configuration;
3. explicit token overrides;
4. generated component typography followed by explicit component overrides;
5. inherited and explicit media-surface overrides;
6. inherited and explicit theme-local declarations, validated against the
   resolved token, component, and media surfaces; and
7. inherited and explicit icon/indicator registry entries, `componentIcons`
   entries, and the `iconVariants` list.

Explicit values win within their surface. Component maps merge by component,
style key, and CSS property rather than replacing the entire inherited target.
An explicit icon, indicator, or `componentIcons` entry replaces the inherited
entry for the same key whole. An explicit `iconVariants` list replaces the
inherited list; an omitted list is inherited. An inherited function entry keeps
the list of the theme that defined it, so it receives a requested variant only
when both that list and the active theme's list contain it, and `undefined`
otherwise.

An `icons` entry is a React node or a pure synchronous function of
`{size, variant}`, and a stateful `componentIcons` entry may be a pure
synchronous function of the slot's state. The normalized theme keeps those
functions for Astryx resolution. Its public reads stay plain:
`DefinedTheme['icons']` is node-valued, with each function read at
`{size: 'md'}`; `DefinedTheme['componentIcons']` is a static view of names,
`null`, and static requests, with resolver slots omitted; and
`DefinedTheme['iconVariants']` is the theme's list. Inside `defineTheme`, entry
functions receive `variant`, and static slot requests and slot functions return
it, typed as that theme's listed names.

## Boundaries and invariants

- **INV1 — One input produces one normalized theme.** Runtime and build consumers
  receive the same `DefinedTheme`; they do not implement separate authoring
  semantics.
- **INV2 — Precedence is deterministic.** A value's winner follows the documented
  order and does not depend on object traversal outside that order.
- **INV3 — Extension is semantically flattened.** `extends` accepts a real
  `DefinedTheme` and carries forward its resolved tokens, local-token owner and
  lineage metadata, component rules, media surfaces, adaptations and axes, icons,
  indicators, `componentIcons`, and `iconVariants`. The normalized child is
  complete.
- **INV4 — Invalid bases fail loudly.** An undefined, namespace, or plain object
  passed to `extends` cannot produce a plausible partial theme.
- **INV5 — Explicit tokens override generated scales.** Generated values provide
  coherent defaults; an explicit semantic token wins token by token.
- **INV6 — Component overrides merge deeply.** Restating one CSS property keeps
  inherited properties on the same component/style key.
- **INV7 — Surface overrides inherit coherently.** `onDark` and `onLight` combine
  system defaults, inherited surface values, and local overrides in that order.
- **INV8 — Local-token enrollment is explicit and owner-tracked.** Supplying
  `localTokens`, or extending an exact enrolled base, produces a flattened local
  declaration map plus exact ownership and lineage metadata. Every declared key is a
  valid CSS custom-property name and no key collides with `tokens`; ownership is never
  inferred from a prefix. Exact `var()` matches to an effective enrolled declaration
  are owned edges on the validated local-token, component, media-surface, and
  adaptation surfaces. Non-exact references remain external. Enrolled themes retain
  exact owner, lineage, collision, and cycle validation; unenrolled themes retain
  their legacy behavior.
- **INV9 — Authoring and output are separate systems.** This record owns the
  normalized theme definition. The shared compiler owns turning it into styles;
  runtime and build own using or saving that output.
- **INV10 — Adaptations are ordered normalized intent.** Every effective theme
  retains its complete `sm`/`md`/`lg`/`xl`/`2xl` width map, generative-axis
  metadata, and inherited-then-local `{when, value}` rule order. Rules re-resolve
  against a child theme's effective root metadata; they do not mutate root token
  reads or introduce identity, registries, media surfaces, or new local names.
- **INV11 — `defineTheme` validates only what it constructs.** It owns theme
  creation and normalization. It may reject malformed input that affects normalized
  theme behavior or generated values as a construction precondition. Authoring or
  reference data used only for validation stays outside `DefineThemeInput` and
  `DefinedTheme`.
- **INV12 — Theme `define*` helpers construct theme values.** They transform,
  derive, or normalize input into a durable typed theme value used by a current
  supported consumer; validating and returning the exact input unchanged is
  insufficient.
- **INV13 — Theme functions stay behind resolution.** Function icon entries and
  slot functions are pure and synchronous. Astryx icon resolution and build
  tooling that enumerates a theme's icon requests (`architecture:theme-compilation`
  INV15) call icon entries; only slot resolution calls slot functions. Public
  theme reads return nodes, static slot values, and the variant list, never a
  function.
- **INV14 — The variant list is theme-level.** `iconVariants` lists the variant
  names the whole theme supports. It is never per icon and never combined with
  another theme's list.

This record does not own:

- semantic token names/defaults;
- turning `DefinedTheme` into style rules, including local-token emission,
  private-variable expansion, and cascade/layer behavior;
- runtime mounting, scope lifetime, root synchronization, or DOM observation;
- CLI file generation and packaging; or
- which component targets, states, and public properties participate.

`architecture:theme-compilation` owns platform output. For web, runtime and
static build use one CSS compiler and the same maintained stylesheet rules. A
future native compiler may turn the same theme definition into native style
objects without making CSS concepts part of shared authoring. Runtime application
and CLI packaging use the compiled output without changing it. The participating
public surface belongs to
`architecture:component-theming-surface`.

## Change coupling

- Admission asks: **What normalized theme behavior or generated value does this
  field or `define*` helper construct, and how do runtime and static build consume
  it?** No concrete answer keeps it out of Core runtime authoring. An admitted
  field's normalization, precedence, inheritance, validation, template exposure,
  and negative tests change together.
- Validation-only theme data stays in theme-package tests, internal test utilities,
  or an explicit CLI checker/doctor workflow used by a current supported consumer.
  It does not enter Core runtime merely to share a validator.
- `spec:AST-017` owns breaking classification and migration. A maintained theme
  release enters that path when its source or build stops working unchanged with a
  Core version inside the theme's currently supported peer/dependency range, even
  if its normalized tokens and CSS are unchanged. A validation-only Core field,
  helper, or export that causes that failure is a real compatibility cost, not
  harmless metadata. A targeted, coordinated break may proceed only through that
  compatibility owner; this record does not define its remedy.
- A local-token change preserves explicit enrollment, valid exact custom-property
  names, exact owner metadata, source/built lineage parity, and the separation from
  portable `tokens`. Prefixes are owner conventions only: they do not grant, reserve,
  or restrict ownership. One name cannot appear in both maps because CSS output and
  portable token helpers would otherwise resolve different values.
- Changing precedence is a compatibility decision because existing themes may
  contain both generated and explicit values.
- Changing `ComponentStyleMap` merge behavior verifies base, generated, explicit,
  and on-media composition; no layer invents its own merge rule.
- A new generated scale states which semantic tokens it may produce and confirms
  explicit token overrides still win.
- An adaptation change preserves the fixed condition vocabulary, inclusive
  `from`/exclusive `below` width edges, authored rule order, root-only local-name
  enrollment, and source/built extension parity.
- Authoring fields unavailable to the runtime-only path remain prohibited.
  Build/CLI metadata without a normalized-theme effect may exist only for a named
  current supported reader, stays outside `DefineThemeInput` and `DefinedTheme`,
  and must not impose Core/runtime compatibility. A hypothetical sidecar is
  insufficient.

## Owning code

- `packages/core/src/theme/defineTheme.ts` owns the public input, normalized IR,
  orchestration, and extension behavior.
- `themeAdaptations.ts` owns the fixed breakpoint/condition vocabulary,
  validation, inherited rule ordering, axis completion, and concrete rule writes.
- `syntax/defineSyntaxTheme.ts` constructs syntax themes before `defineTheme`
  adopts their tokens.
- `expandColorScale.ts`, `expandTypeScale.ts`, `expandRadiusScale.ts`, and
  `expandMotionScale.ts` own their derived token/component values.
- `mergeComponents.ts` owns the shared deep-merge rule.
- `onMediaTokens.ts` owns normalization of inverted-surface overrides.
- `localTokens.ts` owns opt-in enrollment, valid CSS custom-property names, exact
  owner metadata, reference closure, cycle detection, cross-map collision rejection,
  and flattened lineage. It does not infer ownership from prefixes.
- `packages/cli/assets/theme.template.ts` is an author-facing projection and must
  remain aligned; it does not define additional semantics.

## Deciding specs

AST-006 decisions 1–4 and 6 establish the shipped theme-local authoring shape,
enrollment, exact-name preservation, inheritance, shared validation, and value contract.
Its 2026-09-12 amendment makes key validity and ownership prefix-independent while
retaining exact owner metadata, lineage, collisions, cycles, and legacy unenrolled
behavior. AST-012 decisions 1–4 establish the fixed width map, named closed conditions,
ordered rule cascade, and source/built adaptation metadata parity. AST-017 decision 1
owns released compatibility classification and migration. AST-087 decisions 2, 7, 9,
and 10 establish function icon entries, node-valued public reads, the theme-level
`iconVariants` list, and the static public view of `componentIcons`.

## Known conformance and verification gaps

Prefix-independent `localTokens` key acceptance is accepted but unshipped. The current
validator still requires the original theme-derived prefix and uses that prefix to
classify local references. Until the implementation lands, INV8's prefix-independent
clauses are current authority but not enforcement. Existing explicit enrollment,
owner, lineage, collision, cycle, and legacy-unenrolled behavior remains shipped.

The motion resolver is accepted but unshipped: an internal, pure
`resolveThemeMotion(theme)` returns a theme's motion knobs, durations, easings,
and role tables for the animator and for server code, touching no DOM and with
no import-time side effects (`spec:AST-108` FR6). Until it lands, FR6's
resolution is current authority but not enforcement.

## Verification

| Invariant                | Evidence                                                                                                | Failure signal                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| INV1, INV2, INV5         | `defineTheme.test.ts` plus representative runtime/build parity                                          | Runtime and build interpret one input differently, or generated values beat explicit tokens                               |
| INV3, INV4               | extension and invalid-base tests                                                                        | Child themes require a base stylesheet or silently accept a non-theme base                                                |
| INV6                     | component merge tests across base/generated/explicit rules                                              | Restating one property drops inherited component styles                                                                   |
| INV7                     | `onMediaTokens.test.ts` and generated surface-rule tests                                                | A child loses inherited surface customization or surface precedence changes                                               |
| INV8                     | AST-006 runtime/static validator and source/built inheritance tests                                     | A valid name fails because of its prefix, ownership follows spelling, or lineage/reference/collision/cycle checks diverge |
| INV10                    | `themeAdaptations.test.ts` and CLI build fixtures                                                       | Width metadata, rule order, or child re-resolution diverges across source and built themes                                |
| INV11                    | `DefineThemeInput`/output diff plus runtime/build fixtures                                              | Validation-only data enters the normalized theme, or productive input loses construction validation                       |
| INV12                    | Core theme export diff, constructed-value evidence, and current-consumer callsite                       | A theme `define*` helper only checks input and returns that exact input unchanged                                         |
| INV13, INV14             | `defineTheme.test.ts` type and normalization tests for function entries, slot functions, and the list   | A public read returns a function, a child merges variant lists, or an entry sees another theme's names                    |
| Theme/Core compatibility | Maintained theme source/build against the minimum Core in its currently supported peer/dependency range | A theme update silently requires newer in-range Core or bypasses the `spec:AST-017` path                                  |
| Authoring projection     | `scripts/check-theme-template.test.mjs`                                                                 | A supported authoring concept is missing or misstated in the template                                                     |
