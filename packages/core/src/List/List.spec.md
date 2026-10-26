---
schema_version: 3
template_version: 5
kind: component
id: component:List
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-21
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming]
verified_by:
  [
    packages/core/src/List/List.test.tsx,
    packages/core/src/Item/Item.test.tsx,
    packages/core/src/theme/derivedVarRegistry.test.ts,
    packages/core/src/theme/generateThemeRules.test.ts,
    apps/storybook/stories/List.stories.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture:
  [architecture:container-padding, architecture:public-component-api]
contributing: [contributing:api-conventions]
system_specs:
  [
    spec:AST-002/DEC-1,
    spec:AST-002/DEC-2,
    spec:AST-017/FR4,
    spec:AST-057/FR9,
    spec:AST-103,
  ]
---

# List component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | Optional `edge?: 'padded' \| 'flush' \| 'outset' \| 'bleed'`, default `'padded'`. Deprecated `edgeCompensation?: 'inline'` resolves to `'outset'`. Optional `reorderable` takes the object `createReorderable` returns, and ListItem's `itemKey` identifies each row (`spec:AST-103`). |
| Behavior                | One edge treatment applies to every ListItem row and decides where row content and row paint sit relative to the list's edges and the host's padding. With `reorderable`, rows reorder by dragging a handle or through reorder mode (`spec:AST-103` FR3, FR4).                         |
| End-user impact         | Row text can share the line of the list header and a heading above, with row paint stopping at the text, reaching into the host padding, or reaching the host edges.                                                                                                                   |
| Builder impact          | One `edge` choice per list. `flush` works anywhere; `outset` and `bleed` act only inside a host that publishes container padding.                                                                                                                                                      |
| Compatibility/readiness | Additive; omission keeps current geometry; `edgeCompensation` keeps working with a codemod to `edge`. `reorderable` and `itemKey` are additive and stable, specified and not implemented yet; without them nothing changes.                                                            |
| Review checks           | Reject header movement, row paint past the host's padding edge, duplicated padding values, physical-edge logic, automatic opt-in, a ListItem-level edge prop, or a second prop that can contradict `edge`.                                                                             |
| Governing rules         | `architecture:container-padding/INV3`, `INV9–INV11`; `spec:AST-002/DEC-1–DEC-2`; `spec:AST-017/FR4`; `spec:AST-057/FR9`. `spec:AST-103`.                                                                                                                                               |

This table is a review projection; the body below is authoritative.

## Intent

Every ListItem keeps Item's inline inset so hover, press, and selection paint has
room around row content. That inset leaves row text off the line of the List
header, a heading above the list, and the host container's padding. How a
collection resolves that depends on its rows and its host: static rows need no
room around paint, interactive rows do, and a list inside a padded container can
reach into that padding. The caller knows which applies; List cannot derive it
from its rows, and the choice must hold for the whole collection.

## Compatibility and migration

- Released default preserved: `yes`; omission keeps current List and ListItem geometry.
- Compatibility class: additive optional prop; `edgeCompensation` is a deprecated
  alias with the same meaning as `edge="outset"`. Its `@deprecated` type reports
  plain use; development warns only when both props are set, naming
  `astryx upgrade` (`spec:AST-017` FR29–FR29b).
- Controlled/uncontrolled behavior: not applicable.
- Migration decision: `component:List/DEC-3`; an `astryx upgrade` codemod renames
  static `edgeCompensation="inline"` to `edge="outset"`, removes
  `edgeCompensation` beside an `edge` string that no later spread can override,
  and keeps the old prop with a TODO where `edge` is computed, on a dynamic value,
  and where the List also spreads props (`spec:AST-017` FR29c–FR29d). A spread onto a
  List that never writes `edgeCompensation` stays unchanged (`spec:AST-040` FR1);
  the `@deprecated` type reports a typed use where the props are written.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The collection-wide `edge` treatment and its application to every ListItem row.
- The deprecated `edgeCompensation` alias and its resolution.
- Keeping the optional header in place for every treatment.
- The relationship between row geometry and Item's density- and theme-aware
  inline inset.

**Does not own / non-goals**

- Container padding values, nesting, or overlay resets — owned by
  `architecture:container-padding`.
- A ListItem-level edge prop, per-edge or arbitrary inset values, automatic host
  detection, or block-axis bleed.
- TabList or Button projections.

## Public concepts

| Concept                        | Closed values or states              | Meaning                                                                                                                                          | Availability by variant/orientation/state                                                | Default  | Owner            | Stability  | Invalid-value behavior                       |
| ------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | -------- | ---------------- | ---------- | -------------------------------------------- |
| Edge treatment                 | `padded`, `flush`, `outset`, `bleed` | Where row content and row paint sit relative to the list's edges and the host's padding                                                          | Every density, marker style, and divider setting; `outset` and `bleed` read host padding | `padded` | `component:List` | accepted   | Other values are rejected by the public type |
| Edge compensation (deprecated) | omitted, `inline`                    | Same as `edge="outset"`                                                                                                                          | As `outset`                                                                              | omitted  | `component:List` | deprecated | Other values are rejected by the public type |
| Reordering                     | absent, a `createReorderable` object | Rows can be reordered by handle, keyboard, and assistive technology; `onReorder` receives the moved row's key and its new index (`spec:AST-103`) | Every density, marker style, edge treatment, and divider setting                         | absent   | `spec:AST-103`   | accepted   | Other values are rejected by the public type |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Basis                                                                                    | Status                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| FR1 | List MUST own `edge` and apply one treatment to every ListItem row, interactive or not; ListItem MUST NOT expose a parallel public prop. A defined `edge` MUST win over `edgeCompensation`, and `edgeCompensation="inline"` with `edge` undefined MUST resolve to `outset`.                                                                                                                                                                                                                                                                                                                                                                                                     | `component:List/DEC-1`, `component:List/DEC-3`                                           | Accepted contract                                     |
| FR2 | `padded` MUST preserve current header, list, and row geometry. No treatment MAY move the header or change row block padding, gap, markers, start and end content, semantics, or hit target relative to the row box.                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Owner direction                                                                          | Accepted contract                                     |
| FR3 | `flush` MUST resolve each row's inline inset to zero through the private source that supplies Item's applied inline padding, so row content and row paint share the list's inline edges. It reads no host padding. A theme override of row inline padding takes precedence over the zero (FR7).                                                                                                                                                                                                                                                                                                                                                                                 | `component:List/DEC-3`                                                                   | Accepted contract                                     |
| FR4 | `outset` MUST place each row so it reaches past the host content line by the smaller of its own inline inset and the matching host inset, per logical edge, keeping its inset inside. Content reaches the host line when the host inset is at least the row inset.                                                                                                                                                                                                                                                                                                                                                                                                              | `architecture:container-padding/INV9–INV10`; `component:List/DEC-2`                      | Accepted contract                                     |
| FR5 | `bleed` MUST place each row so it reaches the host's padding edge on each logical edge, with square corners. Row content sits on the host content line, or at the row's own inset from its edge when the host inset is smaller. A theme override of row inline padding sets the content's inset instead (FR7).                                                                                                                                                                                                                                                                                                                                                                  | `architecture:container-padding/INV3`; `component:List/DEC-4`                            | Accepted contract                                     |
| FR6 | Missing or reset host inset MUST resolve to zero, so `outset` and `bleed` place content as `padded` does outside a padded host. No row paint MAY reach past the host's padding edge.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `architecture:container-padding/INV6`, `INV9`                                            | Accepted contract                                     |
| FR7 | Each row's retained inset MUST come from the same private density- and theme-derived source as Item's applied inline padding. A theme `item.paddingInline` override takes precedence over every treatment's row padding, as it does over density. A consumer override of row padding through `xstyle`, `className`, or `style` is outside the alignment guarantee.                                                                                                                                                                                                                                                                                                              | Shared two-owner geometry contract                                                       | Accepted contract                                     |
| FR8 | `outset` and `bleed` are valid only under a host state whose published inline inset matches its applied padding: a visually neutral host, such as a Layout region with explicit padding or a padded ScrollableArea, or the content area of a Card, Section (any variant), Dialog, or BottomSheet. Those hosts bound their padding with a border, background, or clip; FR6 keeps row paint inside the padding edge, so it never covers the border or changes the host's outline. Automatic LayoutContent/LayoutPanel states with a known publication mismatch are not eligible until that gap is fixed, and Drawer's content area is not admitted until it has its own evidence. | `architecture:container-padding/INV8–INV11`; real-browser evidence in each admitted host | Accepted contract                                     |
| FR9 | The list element containing the rows MUST clip in the inline axis with `overflow-inline: clip`, never `hidden`. Under `outset` and `bleed` its inline edges MUST reach the host's padding edge, so the clip never cuts resting row paint and a swiped row paints no further than that edge.                                                                                                                                                                                                                                                                                                                                                                                     | `spec:AST-057/FR9`                                                                       | Verified by `List.test.tsx` and real-browser geometry |

### Allowed variation

- Density and `item.paddingInline` theme overrides may change the retained inset;
  every treatment follows the same derived value. A theme override of row inline
  padding takes precedence over every treatment, as it does over density.
- Host padding may be uniform, asymmetric, zero, or absent; each logical edge
  resolves independently.
- Labels, descriptions, markers, start/end content, interactivity, and selection
  may vary without changing the collection-wide treatment.

### Representative states

| State                                                  | Required invariant                                                                     | Allowed variation                   |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------- |
| `padded` (default)                                     | Header and every row keep current geometry.                                            | Any content, density, or host.      |
| `flush`                                                | Row content and paint share the list's inline edges with the header and divider ends.  | Any host, including none.           |
| `outset`, host inset at least row inset                | Row content reaches the host content line; row paint reaches past it by the row inset. | Uniform or asymmetric host padding. |
| `bleed`, host inset at least row inset                 | Row paint reaches the host's padding edge; row content sits on the host content line.  | Uniform or asymmetric host padding. |
| `outset` or `bleed`, host inset smaller than row inset | Row paint stops at the host's padding edge; content keeps the row inset.               | Either logical edge independently.  |
| `outset` or `bleed`, no host inset                     | Content placed as `padded`; `bleed` rows are square.                                   | Standalone lists and overlays.      |
| LTR or RTL                                             | Logical start/end mapping follows direction.                                           | Writing direction.                  |

### Transformation and precedence order

- **ORD1 — Treatment.** Resolve `edge`, else `outset` for `edgeCompensation="inline"`,
  else `padded`.
- **ORD2 — Host bound.** Read the matching published host inset for each logical
  edge, with missing values falling back to zero.
- **ORD3 — Local inset.** Resolve Item's inline inset through the private value
  that supplies applied padding: density sets it, `flush` replaces it with zero,
  and a theme `item.paddingInline` override replaces either.
- **ORD4 — Placement.** Apply the treatment's geometry from those values; then
  compose supported consumer styles without claiming alignment for a consumer
  override of row inline padding.

### Performance and resources

- **PR1 — CSS geometry only.** Every treatment MUST add no measurement, observer,
  listener, state, Effect, or render pass. Deprecation warnings are dev-only.

## Accessibility contract

- **AR1 — Interaction geometry remains local.** No treatment MAY change the
  interactive element, accessible role/name/state, focus target, or tab order.
- **AR2 — Direction remains logical.** Each treatment MUST produce the mirrored
  geometry under RTL without changing DOM order.

## Design relationships

| Anatomy or state   | Design requirement                                                                                                                                                                      | Representation authority | Hierarchy role     | Component contract |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------ | ------------------ |
| Optional header    | Stays on the host content line for every treatment.                                                                                                                                     | `component:List/DEC-1`   | Context            | FR2                |
| ListItem row paint | Stops at the content (`flush`), reaches past it by the row inset (`padded`, `outset`), or reaches the host edge (`bleed`).                                                              | `component:List/DEC-3`   | Supporting surface | FR3–FR6            |
| Row content        | The row's first content (its marker, start content, or label) sits inside the row inset (`padded`) or on the host content line when the host inset allows (`flush`, `outset`, `bleed`). | `component:List/DEC-3`   | Prominent          | FR2–FR5            |

## Family and system relationships

- `architecture:container-padding` owns host publication, eligibility,
  logical-edge semantics, overlay reset, and the shared `edge` vocabulary. List's
  `edge` projects all four values onto both inline edges of every row.
- `architecture:public-component-api`, `spec:AST-002`, and `spec:AST-017` own
  public API admission and the deprecation lifecycle.
- Item remains the implementation owner of row padding and interaction paint;
  List owns only the collection-level treatment and row placement.
- `spec:AST-057` owns swipe actions on `Item` and the rule that the element
  containing swipe-capable rows clips in the inline axis; List carries that clip
  (FR9) and `ListItem` passes `swipeActions` and `swipeBehavior` through to
  `Item` unchanged.
- `spec:AST-103` owns reordering. List is its first adopter: it
  takes the `reorderable` object, a row's key is its `ListItem`'s `itemKey`
  and its position is its index, and the
  handle is the one element reordering adds to a row, at its trailing edge
  (`spec:AST-103` FR5).

## Verification map

| Contract                  | Verification                                                 | Representative states                                                                                                                                                                                                                                                                                                                | Mutation or failure expectation                                                                                                                                      | Audit section       |
| ------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| FR1–FR7, FR9              | List, Item, and theme-registry tests                         | every treatment; all densities; static and interactive rows; header; deprecated alias alone and with `edge`; ListItem outside a List                                                                                                                                                                                                 | Removing context propagation, using one host edge for both inline edges, zeroing padding without the shared inset source, or dropping the list's reach or clip fails | `audit:List/layout` |
| FR2–FR6, FR8–FR9, AR1–AR2 | Real-browser List geometry evidence                          | each treatment in a Card at two paddings, a Section, an inline Dialog with and without Layout, a BottomSheet, a padded ScrollableArea scrolling vertically and in both axes, a LayoutContent with explicit padding, and standalone; header and dividers; LTR/RTL; hovered and selected rows; a swiped row under `outset` and `bleed` | Header movement, content off the expected line, paint past the host's padding edge, clipped resting paint, or a changed row box fails                                | `audit:List/visual` |
| Migration                 | `astryx upgrade` codemod tests                               | static, aliased, already-migrated, dynamic, and computed-`edge` callsites; a second run                                                                                                                                                                                                                                              | A dynamic value or a computed `edge` rewritten, a static one missed, or a second run that changes output fails                                                       | `audit:List/docs`   |
| Documentation             | `List.doc.mjs`, Storybook, and `scripts/check-knowledge.mjs` | public prop, values, default, deprecation, and representative composition                                                                                                                                                                                                                                                            | Missing or stale contract, docs, or example fails                                                                                                                    | `audit:List/docs`   |

## Decision log

### DEC-1 — List owns the collection-wide opt-in

**Reference:** `component:List/DEC-1`

**Decider:** cixzhang, 2026-09-21

The List header and ListItem rows otherwise begin on different content lines.
Only the caller knows when the containing composition requires alignment, while
List can apply one consistent decision to every row without exposing Item-level
configuration.

### DEC-2 — Compensation is row-local and bounded

**Reference:** `component:List/DEC-2`

**Decider:** cixzhang, 2026-09-21

Each row cancels no more than its own component-owned inline inset or the
matching host inset. When the host inset is at least the row inset, content
reaches the host content line. When it is smaller, content moves toward that line
without pulling row paint beyond the host boundary.

Rejected: `isFullBleed`, because the row may stop inside the host padding and the
name would promise outer-edge bleed that the component does not provide.

### DEC-3 — One edge prop names every row edge treatment

**Reference:** `component:List/DEC-3`

**Decider:** cixzhang, 2026-10-15

`padded`, `flush`, `outset`, and `bleed` are mutually exclusive answers to one
question, so one closed-value prop carries them and no combination can
contradict. The names are the shared edge vocabulary of
`architecture:container-padding`. `outset` is the bounded compensation of DEC-2;
`edgeCompensation` remains its deprecated alias.

Rejected: separate boolean props beside `edgeCompensation`, because they could
request two treatments at once.

### DEC-4 — Bleed reaches the host edge and keeps content on its padding line

**Reference:** `component:List/DEC-4`

**Decider:** cixzhang, 2026-10-15

`bleed` matches Table rows in a padded host: row paint reaches the host's padding
edge with square corners, and content sits on the host content line, never closer
to the row edge than the row's own inset. It is opt-in, so existing lists keep
their geometry.

Rejected: bleed as the default inside padded hosts, because it would move every
existing list in a container.

## Open questions

None.

## Content boundary

This claim-scoped contract does not duplicate List's complete prop table,
container-padding internals, consumer examples, implementation steps, or future
TabList/Button projections. Those remain with their named owners.
