---
schema_version: 3
template_version: 3
kind: component
id: component:Icon
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-08-30
owners: [cixzhang, imdreamrunner]
review_triggers: [public-api, behavior, theming, accessibility]
verified_by:
  [
    packages/core/src/Icon/Icon.test.tsx,
    packages/core/src/IconButton/IconButton.test.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:component-size-cascade,
    architecture:component-theming-surface,
    architecture:icon-resolution-and-component-slots,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-087]
---

# Icon component contract

## Intent

Icon presents one visual symbol with consistent size, color, and accessibility
semantics. Consumer usage remains documented in `Icon.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes` for explicit sizes and standalone Icons
- Compatibility class: component-owned Icon slots may supply a contextual default;
  explicit Icon sizes and the standalone `md` fallback remain unchanged
- Controlled/uncontrolled behavior: not applicable
- Migration decision: no consumer migration; omit `size` when the owning Astryx
  component should select the contextual default

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Accepting a semantic icon key or a supplied icon component as the glyph source.
- Passing the resolved size and a variant the entry can receive to a registry entry.
- Resolving explicit, component-owned contextual, and standalone size defaults.
- Applying Icon's size, color, theming target, and accessibility semantics to
  the rendered glyph.

**Does not own / non-goals**

- The shared registry's key-resolution and fallback order — owned by the shared
  icon system.
- Which contextual default an owning Astryx component selects for its icon slot —
  owned by that component or family contract.
- The meaning of a glyph in product context or whether nearby text makes it
  decorative — owned by the product callsite.
- Interaction, focus, or control naming — owned by the interactive parent.
- The artwork supplied by a consumer or registered through a theme.
- A public Icon size-provider API; contextual transport is implementation detail.

## Public concepts

| Concept       | Closed values or states                                   | Meaning                                                    | Availability by variant/orientation/state        | Default                                         | Owner            | Stability | Invalid-value behavior                                                            |
| ------------- | --------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------- | ---------------- | --------- | --------------------------------------------------------------------------------- |
| Glyph source  | semantic key, namespaced extension key, or icon component | Selects the visual symbol.                                 | Every render                                     | Required                                        | `component:Icon` | Stable    | TypeScript rejects unsupported built-in string values.                            |
| Size          | `xsm`, `sm`, `md`, `lg`                                   | Selects the icon box size.                                 | Every rendered glyph                             | nearest component-owned default; otherwise `md` | `component:Icon` | Stable    | TypeScript rejects unsupported values.                                            |
| Color         | documented semantic and palette values                    | Selects the glyph color or inherits it from context.       | Every rendered glyph                             | `inherit`                                       | `component:Icon` | Stable    | TypeScript rejects unsupported values.                                            |
| Accessibility | decorative or meaningfully labelled                       | Controls whether assistive technology receives the glyph.  | Every rendered glyph                             | Decorative                                      | `component:Icon` | Stable    | Empty labels use the decorative behavior.                                         |
| Variant       | names in `IconVariantMap`; the active theme lists its own | Requests a theme's alternate artwork for a registry glyph. | Registry glyphs only; never a supplied component | None                                            | `component:Icon` | Stable    | TypeScript rejects unknown names; an unlisted variant renders the normal artwork. |

A namespaced key that does not resolve currently renders nothing. This is
existing behavior, not an intentional fallback promise.

## Behavioral and layout contract

Requirements identify their basis so observed code is not mistaken for an
intentional decision.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                           | Basis                                                 | Draft review state                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------- |
| FR1 | Icon MUST present at most one glyph from the supplied semantic key, namespaced key, or icon component.                                                                                                                                                                                                                                                                                                                                        | Documented promise and current tests.                 | Settled intent.                                         |
| FR2 | Every rendered glyph MUST carry the `icon` theming target with its resolved size and selected color reflected as target data.                                                                                                                                                                                                                                                                                                                 | Current source, docs, and theming tests.              | Settled intent.                                         |
| FR3 | Icon MUST apply the resolved size as width and height for every glyph, plus font size where needed for 1em-based icon sources. This sizing contract MUST NOT promise an HTML or SVG element type.                                                                                                                                                                                                                                             | Human decision, current source, and tests.            | Settled intent.                                         |
| FR4 | Supported SVG and styling escape hatches MUST retain their established merge and override behavior.                                                                                                                                                                                                                                                                                                                                           | Current source and regression tests.                  | Current compatibility behavior; verify before changing. |
| FR5 | An explicit Icon `size` MUST win. Without one, Icon MUST use the nearest default supplied by an owning Astryx component for its documented icon slot; without such a default, Icon MUST use `md`.                                                                                                                                                                                                                                             | Component-size precedence and Button sizing decision. | Settled intent.                                         |
| FR6 | In registry mode, Icon MUST pass `{size, variant}` to the selected entry, where `size` is the size resolved by ORD1 and `variant` is the requested variant when the active theme lists it and, for a theme-supplied entry, the theme that defined the entry lists it too, otherwise `undefined`. A supplied icon component MUST NOT receive `variant`, Icon MUST NOT forward `variant` to the DOM, and the `icon` target MUST NOT reflect it. | `spec:AST-087` FR1–FR5 and FR9.                       | Settled intent.                                         |
| FR7 | The `icon` target MUST guarantee `width` and `height` on its `size:*` selectors as reviewed target-specific additions, so a theme sets each size's dimension. Without theme styles, sizes are 12, 16, 20, and 24px at a 16px root and scale with the root font size.                                                                                                                                                                          | `spec:AST-087` FR10.                                  | Settled intent.                                         |

### Allowed variation

- **AV1 — Artwork.** The path, view box, and internal structure may vary by icon
  source or theme without changing Icon's one-part consumer anatomy.
- **AV2 — Rendering strategy.** Icon may render a supplied icon component directly or
  use an internal wrapper for a resolved key; neither element shape is public
  anatomy.
- **AV3 — Theme and consumer styling.** Existing theme and styling escape hatches
  may change visual CSS properties without changing glyph ownership.
- **AV4 — Contextual mapping.** An owning Astryx component may map its own public
  size or variant to an Icon default. That mapping belongs to the owner and MUST
  preserve explicit Icon sizes and the standalone fallback.

### Representative states

| State                            | Required invariant                                                                 | Allowed variation                              |
| -------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------- |
| Semantic key                     | One resolved glyph carries the `icon` target.                                      | Theme, registry, or built-in artwork.          |
| Namespaced extension key         | A resolved extension glyph carries the `icon` target.                              | Consumer- or library-owned artwork.            |
| Supplied icon component          | The supplied glyph carries the `icon` target.                                      | Component implementation and SVG internals.    |
| Standalone Icon without `size`   | The resolved size is `md`.                                                         | Glyph source and color.                        |
| Owned icon slot without `size`   | The nearest documented component default is used.                                  | The owning component's declared size mapping.  |
| Explicit Icon size in owned slot | The explicit Icon size wins over the contextual default.                           | Any supported Icon size.                       |
| Unresolved namespaced key        | No glyph is currently rendered.                                                    | No fallback behavior is established by intent. |
| Listed variant                   | The entry receives the size and the variant when its defining theme also lists it. | The theme's artwork for that request.          |
| Unlisted or omitted variant      | The entry receives `variant: undefined`.                                           | The theme's normal artwork.                    |
| Variant on a supplied component  | The component renders as given without `variant`.                                  | Component implementation.                      |

### Transformation and precedence order

- **ORD1 — Size resolution.** Resolve explicit Icon `size` → nearest
  component-owned contextual default → standalone `md` fallback.
- **ORD2 — Presentation.** Apply the target, resolved size, and component color
  styles, then merge consumer `xstyle`, `className`, inline `style`, and supported
  pass-through props in their established order.

### Performance and resources

- **PR1 — Render work.** Icon owns no listeners, observers, or layout
  measurement; semantic and size resolution are synchronous during render.

## Accessibility contract

- **AR1 — Decorative default.** Without a non-empty `label`, Icon MUST hide its
  glyph from assistive technology by default.
- **AR2 — Meaningful glyph.** A non-empty `label` MUST expose the glyph as an
  image with that accessible name.
- **AR3 — Parent-owned interaction.** Icon MUST NOT add interactive semantics or
  focus behavior; an interactive parent owns the control and its name.

## Design relationships

| Anatomy or state | Design requirement                                                 | Representation authority                                      | Hierarchy role    | Component contract |
| ---------------- | ------------------------------------------------------------------ | ------------------------------------------------------------- | ----------------- | ------------------ |
| Glyph            | Carries the resolved visual symbol at the resolved size and color. | Consumer or registry selects artwork; Icon owns presentation. | Context-dependent | FR1, FR2, FR3, FR5 |

`Glyph` is the single conceptual consumer part in both source modes. Current
implementation may render a supplied icon component directly or place a
registry-resolved icon in an internal wrapper; this contract intentionally does
not promise a `span`, `svg`, or other element type.

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Glyph": {"target": "icon"}
}
```

## Family and system relationships

- `architecture:component-size-cascade` owns the shared explicit → nearest
  provider → component fallback pattern and requires provider ownership to be
  declared. Icon retains its own `xsm | sm | md | lg` axis outside the standard
  element-size cascade and adopts that precedence for component-owned defaults.
- `architecture:component-theming-surface` owns the qualification and validation
  rules for the `icon` target.
- `architecture:icon-resolution-and-component-slots` owns semantic-key and
  component-slot resolution before Icon renders the selected source.
- `spec:AST-087` decides the `variant` request, theme-listed variant names, and
  theme-set size dimensions.
- `architecture:public-component-api` owns admission and compatibility rules for
  Icon's public props and observable defaults.
- The owning component or family specifies each contextual Icon-size mapping.
  The Button family currently maps `sm` and `md` controls to `sm` Icons and `lg`
  controls to `md` Icons.
- Icon has no current family contract.

## Verification map

| Contract            | Verification                                                                   | Representative states                                                                                            | Mutation or failure expectation                                                                                                               | Audit section              |
| ------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| FR1, FR3, FR5       | `Icon.test.tsx` sizing suites and `IconButton.test.tsx` contextual-size suites | standalone default; Button sizes; explicit override; both modes                                                  | Breaking source rendering, standalone fallback, contextual mapping, explicit precedence, or cross-mode sizing fails assertions.               | `audit:Icon/behavior`      |
| FR2, FR4            | `Icon.test.tsx` target/styling suites plus source inspection                   | Both source modes; size and color variants                                                                       | Removing the target or breaking override composition fails existing assertions; `data-color` reflection currently lacks focused assertions.   | `audit:Icon/theming`       |
| AR1, AR2, AR3       | `Icon.test.tsx` accessible-name suites                                         | Decorative, labelled, explicit ARIA override                                                                     | Changing default or labelled semantics fails accessibility assertions.                                                                        | `audit:Icon/accessibility` |
| FR6                 | `Icon.test.tsx` variant suites (pending)                                       | listed, unlisted, and omitted variant; no active list; inherited entry under a replaced list; supplied component | An unlisted variant, or one the entry's defining theme does not list, reaches an entry, or `variant` reaches a supplied component or the DOM. | `audit:Icon/behavior`      |
| FR7                 | Theme styling tests for each size (pending)                                    | each size with and without theme styles                                                                          | A themed size does not change the glyph dimension, or an unstyled size changes.                                                               | `audit:Icon/theming`       |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                  | Canonical consumer anatomy and current target                                                                    | Missing, extra, prefixed, or stale mappings fail repository validation.                                                                       | `audit:Icon/theming`       |

Focused coverage for `data-color` on both glyph source modes is a checkable test
gap; source inspection is the current evidence for that part of FR2.

## Decision log

### DEC-1 — One conceptual Glyph across source modes

**Reference:** `component:Icon/DEC-1`
**Decider:** cixzhang, 2026-08-30

Consumers theme and reason about one visual symbol regardless of whether it
comes from a semantic key or a supplied component. `Glyph` therefore maps to the
existing `icon` target without freezing either mode's current element shape.
Icon applies width and height for every source and adds font size where a 1em-
based source needs it. This preserves one consistent icon box without promising
a `span`, `svg`, or other element.

Rejected: separate wrapper and SVG anatomy entries, because those describe
implementation strategies rather than stable consumer concepts.

### DEC-2 — Owning components may provide contextual Icon defaults

**Reference:** `component:Icon/DEC-2`
**Decider:** cixzhang, 2026-09-23

A person should see an icon that is proportionate to the Astryx component that
owns its slot without every caller repeating a size. The owning component may
therefore provide the default while an explicit Icon size remains authoritative
and a standalone Icon remains `md`. Provider objects, hooks, and context shape
remain private implementation details rather than public API.

Rejected: an unconditional `md` default inside every composition, forcing every
caller to repeat the owner-derived size, and exposing the provider mechanism as
public API.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or system rules. It links to their owners.
