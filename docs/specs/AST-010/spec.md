---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-010
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-08-31
phase: shipped
owners: [cixzhang]
affects_architecture: [architecture:public-component-api]
affects_families: [family:layout-regions]
affects_contributing: []
affects_consumer_docs: [Resizable]
---

# Structured percentage useResizable configuration system spec

## Intent

A person resizing a panel should get the same panel size that the handle presents
and assistive technology announces. Builders may configure an initial size or
bounds as percentages, optionally with one explicit pixel floor or ceiling through
`percent(value, {min: pixel(value)})` or
`percent(value, {max: pixel(value)})`. Every user-selected size
remains pixels so pointer, keyboard, persistence, and programmatic behavior stay
predictable.

This spec preserves the released meaning of `defaultSize: 'N%'` when no
`containerRef` is supplied: resolve once against `window.innerWidth` (or the
1200px server fallback), then continue as pixels. Supplying `containerRef`
changes only the basis used by percentage configuration: the container's
content-box active axis replaces the viewport. It does not create a persistent
relative sizing mode.

Numeric inputs are pixels. Resolved public outputs remain pixels. Shipped source,
tests, and consumer docs remain the evidence for current behavior until the
implementation and verification below land; the draft `component:Resizable`
record is updated alongside that implementation.

## Non-goals

- Implementing runtime behavior in this specification pull request.
- Preserving a percentage ratio after pointer, keyboard, or programmatic resize.
- Automatically distributing remaining space or requiring independently sized
  regions to total 100%.
- Supporting arbitrary CSS units, functions, expressions, or recursive composition,
  including `rem`, `vw`, `calc()`, CSS `min()`, and CSS `max()`.
- Adding percentage snap points or percentage collapse thresholds.
- Adding controlled size state; current controlled collapse behavior is
  unchanged.
- Widening `resize()` beyond its released numeric pixel input.
- Changing the persisted state shape or adding a relative-size field.
- Widening SideNav's simplified `defaultWidth`, `minWidth`, and `maxWidth`
  configuration. That integration requires a separate component decision because
  SideNav owns its root and handle.
- Changing LayoutPanel's ownership of structure, scrolling, inset, or divider
  presentation.

## Requirements

- **FR1 — Percentage configuration uses an explicit basis.** Without
  `containerRef`, a percentage leaf in `defaultSize` MUST resolve once against
  `window.innerWidth`, or 1200px when `window` is unavailable, preserving the
  released fallback. With `containerRef`, it MUST resolve once against that
  container's first positive measured content-box active axis. A structured
  percentage MUST then apply its single pixel floor or ceiling. After resolution,
  the selected size is pixels and MUST NOT scale when the viewport or container
  changes.
- **FR2 — Direction selects the container basis.** With `containerRef`,
  horizontal resizing MUST use the container's content-box inline size and
  vertical resizing MUST use its content-box block size. RTL may reverse pointer
  delta, but MUST NOT change the percentage basis. Without `containerRef`, the
  compatibility basis remains `window.innerWidth` regardless of direction.
- **FR3 — Interactions remain pixel-based.** Numeric defaults and every result of
  an atomic or structured percentage default resolve to pixels. Pointer, keyboard,
  snap, collapse, expand, persistence, callback, and programmatic resize paths MUST
  continue to read and write pixel selections exactly as the released API does. No
  interaction may create or preserve a percentage-selected mode.
- **FR4 — Mixed bounds remain valid.** Builders MAY combine pixel, atomic
  percentage, and structured percentage values across `defaultSize`, `minSize`,
  and `maxSize`. Numeric bounds remain pixels. Percentage values resolve against
  the same viewport or container basis as FR1; a structured value then applies its
  one pixel floor or ceiling. Percentage bounds MUST re-resolve whenever that basis
  changes. Re-resolved bounds clamp the existing pixel selection; they MUST NOT
  scale it proportionally. If the resolved minimum exceeds the resolved maximum,
  development MUST warn and the maximum MUST win, preserving the released
  `Math.min(max, Math.max(min, size))` ordering and guaranteeing finite,
  non-`NaN` geometry.
- **FR5 — Effective geometry stays synchronized.** The effective selected pixel
  size, LayoutPanel or caller-rendered size, persisted expanded value, and
  ResizeHandle's `aria-valuenow`, `aria-valuemin`, and `aria-valuemax` MUST describe
  the same resolved geometry. CSS-only clamping that leaves hook state outside the
  painted bounds is prohibited. Existing controlled-collapse callbacks remain an
  explicit exception: they report a rejected collapse or expand intent without
  claiming that the controlled owner changed the rendered size.
- **FR6 — Basis changes update only percentage constraints.** Once an atomic or
  structured percentage default has initialized the selected pixel size, a viewport
  or container resize MUST NOT re-resolve that default. Percentage bounds MUST
  re-resolve, apply their optional pixel floor or ceiling, and clamp the selected
  pixel size. A basis-only layout change MUST NOT fire an interaction callback or
  otherwise claim that a person selected a new size.
- **FR7 — Pointer gestures preserve released behavior.** Pointer deltas continue
  from the selected pixel size. Percentage bounds MUST use one stable basis during
  a gesture; a basis change during the gesture takes effect after the gesture ends
  so the handle does not move away from the pointer.
- **FR8 — Keyboard, snap, and collapse semantics continue.** Arrow-key steps,
  Shift+Arrow steps, Home, End, collapse thresholds, and snap points remain
  pixel-based. Collapse retains the expanded pixel size, and expand restores that
  pixel size subject to the currently resolved bounds.
- **FR9 — Persistence remains pixel-only.** Existing positive plain numbers and
  `{size, isCollapsed}` entries MUST continue to restore as pixel choices. A
  legacy plain `0` MUST retain its current meaning: collapsed with no saved
  expanded size when collapse is enabled, otherwise no usable saved size. New
  percentage configuration MUST use the current persisted pixel shape; no
  percentage or relative-mode field is added.
- **FR10 — Callbacks report resolved pixels.** `onSizeChange` MUST continue to
  receive resolved pixel numbers for user interactions and released programmatic
  transitions. Initialization, hydration correction, viewport resize, container
  resize, and bounds-only re-clamping MUST NOT be reported as user interaction.
- **FR11 — Single and multi-region configurations share the contract.** A
  multi-region call MUST use one optional container and axis for all regions.
  Regions remain independently pixel-selected; this change MUST NOT add balancing,
  ratio preservation, or a 100% total invariant.
- **FR12 — Invalid configuration has safe deterministic fallbacks.** Accepted
  configuration is a non-negative finite number, an exact non-negative finite
  `Npx` string, an exact `N%` string from 0% through 100%, or a structured
  `percent()` value whose percentage is finite and within 0–100 and whose one
  `min` or `max` value is a finite non-negative `PixelWidth`. A structured value
  with neither bound, both bounds, another discriminator, or any invalid number is
  invalid. An invalid `defaultSize` MUST use 250px before normal bounds clamping;
  an invalid `minSize` MUST use 50px; and an invalid `maxSize` MUST use unbounded
  `Infinity`. Explicit `maxSize: Infinity` remains valid.
  Development MUST warn for every fallback; production MUST use the same fallback
  without warning. After initialization, an invalid raw value MUST NOT directly
  replace a persisted or otherwise legal selected pixel size; a fallback-normalized
  bound may affect that size only through normal clamping.

### Public API requirements

- **API1 — `containerRef` opts into a container basis, not a relative mode.**
  Single- and multi-region config MAY accept
  `containerRef?: React.RefObject<HTMLElement | null>`. When omitted, percentage
  configuration uses the released viewport basis. When supplied, every percentage
  default or bound uses that container's content-box active axis. The ref is
  caller-owned because only the caller can identify the intended layout container;
  the hook MUST NOT infer a panel or ResizeHandle ancestor.
- **API2 — Direction is explicit.** Single-region config MAY accept
  `direction?: 'horizontal' | 'vertical'`, defaulting to `horizontal`.
  Multi-region config's existing top-level `direction` supplies every region's
  axis. ResizeHandle direction and hook direction MUST agree; the implementation
  MUST make a mismatch detectable in development. Direction affects the
  container basis only when `containerRef` is present.
- **API3 — One explicit Resizable vocabulary covers pixels and bounded
  percentages.** Add the server-safe helper and types:

  ```ts
  type ResizablePercentSize = {
    type: 'percent';
    value: number;
  } & ({min: PixelWidth; max?: never} | {min?: never; max: PixelWidth});

  type ResizableSize =
    number | `${number}px` | `${number}%` | PixelWidth | ResizablePercentSize;

  function percent(
    value: number,
    options: {min: PixelWidth; max?: never} | {min?: never; max: PixelWidth},
  ): ResizablePercentSize;
  ```

  `minSize` and `maxSize` use `ResizableSize`. `defaultSize` keeps its released
  broad `SizeValue` and adds `PixelWidth | ResizablePercentSize`, preserving every
  existing `number | string` caller while runtime validation remains authoritative.
  Reuse Table's exact `pixel()` binding and `PixelWidth`; do not create a second
  fixed-size helper. The `percent()` options argument is REQUIRED and carries
  exactly one `min` or `max` whose value is a valid `PixelWidth`. An unbounded
  percentage keeps the existing canonical `N%` spelling; `percent(40)` is
  deliberately not a second spelling for `'40%'`. Numbers, exact `Npx`, and
  `pixel(value)` remain pixels. Exact `N%` and `percent()` percentages are finite
  and 0–100. Do not accept `proportional()` (a sibling weight, not a literal
  percentage), CSS functions, arithmetic, variables, other units, both `min` and
  `max`, or neither bound. Do not add parallel percentage props.

  Configuration mapping:

  - `333` or `'333px'` → unchanged; `pixel(333)` is the canonical structured
    static form for new compositions;
  - `'40%'` → unchanged canonical unbounded percentage;
  - `max(40%, 333px)` intent → `percent(40, {min: pixel(333)})`;
  - `min(10%, 400px)` intent → `percent(10, {max: pixel(400)})`.

- **API4 — Unified bounds are the only public spellings in 0.6.**
  `minSize` and `maxSize` are the complete bound vocabulary. The deprecated
  `minSizePx` and `maxSizePx` aliases were supported through 0.5 and are removed in
  0.6. Numeric `minSize` and `maxSize` retain identical pixel semantics, including
  explicit `maxSize: Infinity`. The 0.6 upgrade codemod rewrites static inline
  configurations; dynamically assembled configuration must rename the keys.

- **API5 — Resolved output and state stay pixels.** `ResizableRegion.size`,
  `onSizeChange`, internal `ResizableProps` geometry, and persisted state remain
  pixel numbers. Existing `width={region.size}`, arithmetic, persistence, and ARIA
  callsites MUST continue to type-check and behave as before. Controlled-collapse
  callbacks keep their released intent-reporting behavior: when the owner rejects
  a requested state change, the rendered size remains owner-controlled even
  though the callback reported the requested transition.
- **API6 — Programmatic resize remains pixels.** `resize(size: number)` retains
  its released signature and selects a clamped pixel size. Percentage strings are
  unsupported and MUST remain a type error; runtime-invalid, negative, or
  non-finite values warn in development and do not replace the last legal pixel
  selection.

### Invalid configuration behavior

| Input                                   | Accepted values                                                                                                 | Invalid fallback                | Development behavior              | Production behavior               |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------- | --------------------------------- |
| `defaultSize`                           | released `SizeValue` plus `PixelWidth` or `ResizablePercentSize`; structured default resolves once              | 250px, then normal bounds clamp | warn and use fallback             | use same fallback without warning |
| `minSize`                               | `ResizableSize`; full-match atomic strings; valid `pixel(value)` or `percent(value, {min XOR max: PixelWidth})` | 50px                            | warn and use fallback             | use same fallback without warning |
| `maxSize`                               | `ResizableSize`; full-match atomic strings; valid structured values; explicit `Infinity` remains unbounded      | unbounded `Infinity`            | warn and use fallback             | use same fallback without warning |
| resolved minimum above resolved maximum | both values are individually valid                                                                              | maximum wins                    | warn and use released clamp order | use same ordering without warning |

A fallback repairs configuration; it is not a new user selection. After
initialization, an invalid raw value never directly replaces persisted or otherwise
legal selected pixel state. Effective fallback bounds may affect that state only
through normal clamping.

### Platform support

- Supported feature/engine floor: every browser supported by Astryx Core with
  `ResizeObserver`; the shared observer remains the one runtime owner for a
  supplied container.
- Before a supplied container has a positive measurement, basis-dependent
  configuration MAY use the released deterministic 1200px basis as a temporary
  fallback. The first valid measurement resolves a basis-dependent default to its
  final initial pixel size and resolves percentage bounds without persisting or
  announcing the temporary fallback. A default-only observer MUST be removed after
  that initial choice; persisted pixel state MUST skip an otherwise unused default
  measurement.
- Browser evidence: real Chromium MUST verify the three canonical structured calls,
  wide and narrow initial containers, later basis changes, storage and ARIA, plus
  the unchanged viewport-compatibility and pixel paths. jsdom geometry stubs alone
  are not sufficient.
- SSR: without `containerRef`, atomic and structured percentage defaults preserve
  the released 1200px server basis and client initialization behavior. With
  `containerRef`, the server uses the same temporary 1200px basis until the first
  client measurement. Hydration MAY make one documented correction, but MUST NOT
  write the temporary fallback to storage or fire `onSizeChange` for that
  correction.

## Current-state impact

Current `main` ships the complete AST-010 model: `defaultSize`, `minSize`, and
`maxSize` accept pixel and percentage forms; `containerRef` supplies the optional
content-box basis; percentage defaults resolve once; and percentage bounds remain
live while selected state, paint, persistence, callbacks, and separator ARIA stay
in resolved pixels. The no-ref path retains the released `window.innerWidth` basis
and deterministic 1200px server fallback.

Before the unified bounds shipped, the pixel-only API could not express percentage
constraints. Applying CSS constraints separately could make paint disagree with
hook state and ResizeHandle ARIA. The unified bounds now own both forms. Astryx 0.6
removes the deprecated pixel-only key aliases while preserving numeric pixel
behavior under `minSize` and `maxSize`.

The shipped contract remains distributed across its current owners:

- `architecture:public-component-api` owns stable export and component contract
  shape;
- [`spec:AST-017` — Release Compatibility & Versioning system spec](../AST-017/spec.md)
  owns classification, deprecation/cleanup state, Changesets, and migration evidence;
  this spec keeps the exact Resizable mapping and its direct transition requirement;
- `family:layout-regions` delegates resize state and interaction to useResizable
  and ResizeHandle while LayoutPanel consumes resolved size;
- `spec:AST-002` governs the caller-owned container basis and predictable state;
- shipped Resizable source, tests, browser evidence, and consumer docs verify
  pointer, keyboard, collapse, snap, persistence, handle, SSR, and ARIA behavior;
  and
- `component:Resizable` records the component-specific implementation contract.

### Persistence representation

The persisted representation does not change:

```ts
interface PersistedResizableState {
  size: number | null;
  isCollapsed: boolean | null;
}
```

An atomic or structured percentage default becomes a pixel selection before it is
persisted. A persisted pixel selection wins over `defaultSize` on restore and is
clamped by the currently resolved bounds. A legacy plain `0` remains a collapse
marker with no expanded size, so expand falls back to the configured default; when
collapse is disabled it supplies no usable saved size. Pointer, keyboard, collapse,
expand, and numeric programmatic resize continue to persist pixels. Basis changes
never write a percentage descriptor or relative intent.

### Implementation requirements

1. Preserve the current no-ref resolver for every percentage default:
   `window.innerWidth` on the client and 1200px when `window` is unavailable.
2. Parse complete atomic strings and validate the complete `percent()` descriptor,
   including its XOR bound shape. Apply FR12's 250px/50px/`Infinity` fallbacks
   before clamping and warn only in development. Preserve explicit
   `maxSize: Infinity` as valid unbounded input.
3. Export `percent`, `ResizablePercentSize`, and `ResizableSize` from Resizable;
   expose `percent`, the same Table `pixel` binding, `PixelWidth`, and the
   Resizable types from the server-safe `Resizable/utils` subpath.
4. Expose only `minSize` and `maxSize` for bounds. Do not retain runtime parsing,
   conflict warnings, or source types for the removed pixel aliases.
5. When `containerRef` is supplied, measure its content box on the configured axis
   and observe it through Astryx's shared ResizeObserver.
6. Resolve a percentage default once into selected pixel state. Remove default-only
   observation once that selection is final. Re-resolve only percentage bounds when
   their viewport or container basis changes, apply their one pixel floor or
   ceiling, then clamp selected pixel state so paint, persistence, and ARIA stay
   synchronized.
7. Refresh a stale cached basis before a newly activated percentage bound can clamp,
   and remove default-only observation even when `resize()` selected pixels before
   the first positive measurement.
8. Preserve the released maximum-wins clamp order when a resolved minimum exceeds
   its maximum, warn in development, and never emit `NaN` or invalid geometry.
9. Keep pointer, keyboard, snap, collapse, expand, callback, persistence, and
   `resize(number)` behavior pixel-based. Do not add a relative mode or widen
   `resize()` to strings. Invalid later configuration must not replace persisted or
   otherwise legal selected state.
10. Preserve all current controlled-collapse and legacy persistence behavior not
    explicitly changed by this spec.
11. Keep SideNav's simplified resize configuration pixel-only until a separate
    integration spec or compatibility decision authorizes widening it.

## Verification

| Contract         | Verification                                                   | Representative states                                                                                                        | Mutation or failure expectation                                                                                                                           |
| ---------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1, API1        | Focused hook tests plus Chromium geometry                      | atomic/structured default; no ref at 1200px; wide/narrow initial container; first positive measurement; later resize         | default uses the wrong basis, rescales after initialization, or supplied ref measures the wrong element                                                   |
| FR2, API2        | Axis tests and Chromium interaction                            | horizontal/vertical; LTR/RTL; reversed handle; no-ref vertical compatibility                                                 | vertical container sizing reads width, or compatibility stops using `innerWidth`                                                                          |
| FR3, FR6-FR8     | Interaction and basis-change tests                             | structured default before/after interaction; viewport/container resize; Arrow, Shift+Arrow, Home, End; collapse/expand       | selected state preserves a ratio, basis change rescales it, or existing pixel interactions change                                                         |
| FR4              | Structured floor/ceiling, mixed-bound, and invalid-order tests | canonical `percent(40, {min: pixel(333)})` / `percent(10, {max: pixel(400)})`; mixed units; min above max                    | descriptor bound is applied in the wrong direction, bounds use different bases, selection scales instead of clamps, or maximum does not win               |
| FR5              | Hook, LayoutPanel, persistence, and ResizeHandle assertions    | below/at/above max; basis shrink; controlled collapse intent                                                                 | effective paint, state, storage, and ARIA diverge, or controlled rejection changes owned state                                                            |
| FR9              | Persistence compatibility tests                                | positive number; legacy zero; legacy object; structured default; corrupt entry                                               | stored shape changes, a descriptor is persisted, an unused default measures a basis, or old state changes meaning                                         |
| FR10, API5       | Callback tests                                                 | initialization; hydration correction; basis-only re-clamp; pointer/keyboard/programmatic change                              | callback receives a descriptor or reports a non-interaction layout correction                                                                             |
| FR11             | Multi-region and shared-observer tests                         | two regions on one container; another hook observing the same node                                                           | regions use different bases, selected ratios are introduced, or one subscription removes another                                                          |
| FR12             | Production/development validation and state-preservation tests | malformed strings; missing/both descriptor bounds; invalid percent/pixels; invalid rerender; persisted selection; `Infinity` | fallback differs by build, warning occurs in production, invalid input replaces legal state, or any path produces `NaN`                                   |
| API3, API4, API6 | Type, export, runtime-validation, and codemod tests            | required helper options; XOR bound; server-safe subpath; removed alias type errors; `resize('50%')`                          | `percent(40)` or both bounds type-check, a removed alias still type-checks, server import gains a client directive, or `resize` accepts non-pixel input   |
| Platform/SSR     | Server render, hydration test, and Chromium evidence           | no ref; ref not measured; hidden/zero container; first positive measurement; resize before layout; later bound activation    | temporary basis persists, correction fires `onSizeChange`, default-only observation leaks, or a newly active bound clamps from a stale cached measurement |
| Compatibility    | Existing Resizable, LayoutPanel, SideNav, and template suites  | current pixel-only callsites; no-ref atomic percentage default; released broad `defaultSize` string                          | existing numeric/atomic percentage behavior, broad default typing, output, interaction, or persistence changes                                            |

### Completion criteria

The shipped contract remains satisfied while:

- no-ref atomic and structured percentage defaults preserve one-time
  `window.innerWidth` resolution and the 1200px SSR fallback without tracking
  viewport resize;
- supplied-container structured defaults resolve once against the first positive
  content-box active axis, remove default-only observation after that choice, and
  remain pixel selections through basis changes and every interaction path;
- atomic and structured percentage bounds re-resolve in both basis modes, apply
  their optional pixel floor or ceiling, and clamp existing pixel state without
  proportionally scaling it;
- `percent()` requires options and exactly one of `min` / `max`, carrying a valid
  `PixelWidth`, in both the type system and runtime validation; `percent(40)` is not
  an alias for `'40%'`;
- `Resizable/utils` remains server-safe, re-exports Table's exact `pixel` binding
  and `PixelWidth`, and exports `percent` plus the Resizable types; the root package
  resolves one `pixel` symbol and one `percent` symbol without collision;
- pointer, keyboard, snap, collapse, expand, persistence, callbacks, and
  `resize(number)` preserve released pixel semantics;
- `minSizePx` and `maxSizePx` no longer type-check or receive runtime handling,
  and the 0.6 upgrade codemod rewrites static inline configurations to `minSize`
  and `maxSize`;
- exact parsing accepts only non-negative finite numbers, complete `Npx` strings,
  and 0–100 `N%` strings; descriptor validation rejects a missing/both pixel bound
  or invalid numeric field. Invalid values use the documented 250px, 50px, or
  `Infinity` fallback without replacing persisted/legal selected state, while
  explicit `maxSize: Infinity` remains valid;
- inverted resolved bounds warn in development, deterministically choose the
  maximum, and never produce `NaN` or invalid geometry;
- mixed bounds keep effective state, paint, storage, and separator ARIA aligned,
  while controlled-collapse callbacks preserve released intent reporting;
- default-only subscriptions terminate even after a pre-measurement `resize()`,
  and newly activated percentage bounds measure the current basis before clamping;
- single and multi-region subscriptions coexist with every other observer of the
  same element;
- focused tests fail against the old implementation and pass against the new one;
- real Chromium proves the three canonical structured calls across wide/narrow
  bases, later resizes, storage, and ARIA, plus unchanged compatibility paths; and
- `component:Resizable` and consumer docs describe the shipped contract in the
  same pull request as the implementation.

## Decision log

### DEC-1 — Percentages configure pixel state; they do not create relative state

**Reference:** `spec:AST-010/DEC-1`
**Decider:** `cixzhang`, `2026-08-31`

Preserve the released no-ref percentage default: resolve once against
`window.innerWidth`, use 1200px when `window` is unavailable, and then behave as
pixels. An optional caller-owned `containerRef` changes the basis for percentage
defaults and bounds to the container's content-box active axis. It does not make a
selected size responsive.

All user interaction, programmatic `resize()`, collapse/expand, callbacks, and
persistence remain pixel-only. Percentage bounds may re-resolve with their basis
and clamp that pixel state. This keeps the API predictable and every represented
state valid under `spec:AST-002` while avoiding a second persistent sizing mode.

Rejected: preserving a percentage ratio after drag or widening `resize()` to
accept percentage strings. Both would change released pixel-based interaction and
add unit-aware state, persistence, callback, and restoration semantics that the
caller did not request.

### DEC-2 — Initial size and bounds share one configuration vocabulary

**Reference:** `spec:AST-010/DEC-2`
**Decider:** `cixzhang`, `2026-08-31`

Add `minSize` and `maxSize` with the same atomic values as `defaultSize` and the
structured `ResizablePercentSize` descriptor. Numbers and exact `Npx` remain
pixels; strings also accept finite 0–100 `N%`; Table's existing `pixel(value)` is
the canonical structured static value; `percent(value, {min: pixel(value)})` adds
one pixel floor and `percent(value, {max: pixel(value)})` adds one pixel ceiling.
Mixing units across the initial size and bounds is valid. This gives builders one
predictable vocabulary without parallel percentage props or duplicate helpers.

`minSizePx` and `maxSizePx` remained deprecated compatibility aliases through
0.5. Astryx 0.6 removes them after two stable releases; numeric `minSize` and
`maxSize` preserve their pixel meaning, and `astryx upgrade` rewrites static inline
configurations. Dynamically assembled configuration must rename the keys.

Invalid inputs use deterministic role-specific fallbacks in every build: 250px for
`defaultSize`, 50px for `minSize`, and unbounded `Infinity` for `maxSize`.
Development additionally warns. Explicit `maxSize: Infinity` remains valid. If a
resolved minimum exceeds its maximum, development warns and the maximum wins under
the released clamp order. These rules keep malformed input and inverted bounds
from producing `NaN` or replacing persisted/legal selected state.

### DEC-3 — Bounded percentages use one explicit structured helper

**Reference:** `spec:AST-010/DEC-3`
**Decider:** `cixzhang`, `2026-09-03`

Use a Table-style discriminated value created by `percent()`, not a JavaScript
parser for CSS functions. The descriptor carries a percentage and exactly one
`min` or `max` whose value is Table's existing `PixelWidth`. Its options argument
is required: the existing exact `N%` string remains the only spelling for an
unbounded percentage.

```ts
pixel(333);
percent(40, {min: pixel(333)});
percent(10, {max: pixel(400)});
```

Reuse Table's exact `pixel()` binding; do not create another fixed-value helper.
Do not reuse `proportional()`: it represents relative weight among sibling columns,
not a literal percentage of one measured basis. This fixed shape exposes every
supported combination to TypeScript, remains constant-time to validate and resolve,
and does not imply arbitrary CSS composition. Rejected: recursive CSS `min()` /
`max()` strings, optional helper options, descriptors with both bounds, and separate
percentage props.

### DEC-4 — Astryx 0.6 removes the deprecated pixel-bound aliases

**Reference:** `spec:AST-010/DEC-4`
**Decider:** `cixzhang`, `2026-09-07`

Remove `minSizePx` and `maxSizePx` in the 0.6 breaking window. Their replacements
have shipped across two stable releases, numeric `minSize` and `maxSize` preserve
the same pixel behavior, first-party callers migrate in the removal change, and
`astryx upgrade` rewrites inline configurations. Keeping both vocabularies would
retain type unions, runtime parsing, conflict warnings, tests, and documentation
without adding capability.

Rejected: retaining the aliases indefinitely. They were explicitly temporary and
the unified bounds cover every supported pixel case plus percentage constraints.

## Open questions

None. Changing the released 1200px server fallback or adding a persistent
relative-size mode requires a separate decision.
