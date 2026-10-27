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
    spec:AST-094,
    spec:AST-103,
    spec:AST-105,
  ]
---

# List component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | Optional `edge?: 'padded' \| 'flush' \| 'outset' \| 'bleed'`, default `'padded'`. Deprecated `edgeCompensation?: 'inline'` resolves to `'outset'`. Optional `reorderable` takes the object `createReorderable` returns, and ListItem's `itemKey` identifies each row (`spec:AST-103`). Optional `animatedLayout` takes the handle `useAnimatedLayout` returns (`spec:AST-105`).                                                             |
| Behavior                | One edge treatment applies to every ListItem row and decides where row content and row paint sit relative to the list's edges and the host's padding. With `reorderable`, rows reorder by dragging a handle or through reorder mode (`spec:AST-103` FR3, FR4). Under a coarse pointer a row's press follows the cell profile (`spec:AST-094` FR11); with `animatedLayout`, row updates animate (`spec:AST-105`).                            |
| End-user impact         | Row text can share the line of the list header and a heading above, with row paint stopping at the text, reaching into the host padding, or reaching the host edges. Touch users get a 44 px row target (FR10) and the cell press (FR11); with `animatedLayout`, row updates animate for every pointer (FR12).                                                                                                                              |
| Builder impact          | One `edge` choice per list. `flush` works anywhere; `outset` and `bleed` act only inside a host that publishes container padding. Passing an `animatedLayout` handle is the one new choice, and rows animate only with an `itemKey`; the touch target and press need none.                                                                                                                                                                  |
| Compatibility/readiness | Additive; omission keeps current geometry; `edgeCompensation` keeps working with a codemod to `edge`. `reorderable` and `itemKey` are additive and stable, specified and not implemented yet; without them nothing changes. `animatedLayout` is additive and specified, not implemented yet. The touch target (FR10) and the press's compositor release (FR11) are specified, not implemented yet, and change nothing under a fine pointer. |
| Review checks           | Reject header movement, row paint past the host's padding edge, duplicated padding values, physical-edge logic, automatic opt-in, a ListItem-level edge prop, or a second prop that can contradict `edge`.                                                                                                                                                                                                                                  |
| Governing rules         | `architecture:container-padding/INV3`, `INV9–INV11`; `spec:AST-002/DEC-1–DEC-2`; `spec:AST-017/FR4`; `spec:AST-057/FR9`. `spec:AST-103`. `spec:AST-094` FR4, FR5, FR11, FR13; `spec:AST-105` FR1–FR5.                                                                                                                                                                                                                                       |

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
- Its rows' 44 px touch target under a coarse pointer (FR10).
- Its rows' press paint under a coarse pointer (FR11).
- Its rows' update motion with an `animatedLayout` handle: entering, exiting,
  and crossing (FR12).

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
| Animated layout                | absent, a `useAnimatedLayout` handle | Inserted, removed, and moved rows animate, and the rows after a change glide to their new places (FR12)                                          | Every density, marker style, edge treatment, and divider setting                         | absent   | `spec:AST-105`   | accepted   | Other values are rejected by the public type |
| Reordering                     | absent, a `createReorderable` object | Rows can be reordered by handle, keyboard, and assistive technology; `onReorder` receives the moved row's key and its new index (`spec:AST-103`) | Every density, marker style, edge treatment, and divider setting                         | absent   | `spec:AST-103`   | accepted   | Other values are rejected by the public type |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Basis                                                                                    | Status                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| FR1  | List MUST own `edge` and apply one treatment to every ListItem row, interactive or not; ListItem MUST NOT expose a parallel public prop. A defined `edge` MUST win over `edgeCompensation`, and `edgeCompensation="inline"` with `edge` undefined MUST resolve to `outset`.                                                                                                                                                                                                                                                                                                                                                                                                     | `component:List/DEC-1`, `component:List/DEC-3`                                           | Accepted contract                                     |
| FR2  | `padded` MUST preserve current header, list, and row geometry, apart from FR10's hit target under a coarse pointer. No treatment MAY move the header or change row block padding, gap, markers, start and end content, semantics, or hit target relative to the row box.                                                                                                                                                                                                                                                                                                                                                                                                        | Owner direction                                                                          | Accepted contract                                     |
| FR3  | `flush` MUST resolve each row's inline inset to zero through the private source that supplies Item's applied inline padding, so row content and row paint share the list's inline edges. It reads no host padding. A theme override of row inline padding takes precedence over the zero (FR7).                                                                                                                                                                                                                                                                                                                                                                                 | `component:List/DEC-3`                                                                   | Accepted contract                                     |
| FR4  | `outset` MUST place each row so it reaches past the host content line by the smaller of its own inline inset and the matching host inset, per logical edge, keeping its inset inside. Content reaches the host line when the host inset is at least the row inset.                                                                                                                                                                                                                                                                                                                                                                                                              | `architecture:container-padding/INV9–INV10`; `component:List/DEC-2`                      | Accepted contract                                     |
| FR5  | `bleed` MUST place each row so it reaches the host's padding edge on each logical edge, with square corners. Row content sits on the host content line, or at the row's own inset from its edge when the host inset is smaller. A theme override of row inline padding sets the content's inset instead (FR7).                                                                                                                                                                                                                                                                                                                                                                  | `architecture:container-padding/INV3`; `component:List/DEC-4`                            | Accepted contract                                     |
| FR6  | Missing or reset host inset MUST resolve to zero, so `outset` and `bleed` place content as `padded` does outside a padded host. No row paint MAY reach past the host's padding edge.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `architecture:container-padding/INV6`, `INV9`                                            | Accepted contract                                     |
| FR7  | Each row's retained inset MUST come from the same private density- and theme-derived source as Item's applied inline padding. A theme `item.paddingInline` override takes precedence over every treatment's row padding, as it does over density. A consumer override of row padding through `xstyle`, `className`, or `style` is outside the alignment guarantee.                                                                                                                                                                                                                                                                                                              | Shared two-owner geometry contract                                                       | Accepted contract                                     |
| FR8  | `outset` and `bleed` are valid only under a host state whose published inline inset matches its applied padding: a visually neutral host, such as a Layout region with explicit padding or a padded ScrollableArea, or the content area of a Card, Section (any variant), Dialog, or BottomSheet. Those hosts bound their padding with a border, background, or clip; FR6 keeps row paint inside the padding edge, so it never covers the border or changes the host's outline. Automatic LayoutContent/LayoutPanel states with a known publication mismatch are not eligible until that gap is fixed, and Drawer's content area is not admitted until it has its own evidence. | `architecture:container-padding/INV8–INV11`; real-browser evidence in each admitted host | Accepted contract                                     |
| FR9  | The list element containing the rows MUST clip in the inline axis with `overflow-inline: clip`, never `hidden`. Under `outset` and `bleed` its inline edges MUST reach the host's padding edge, so the clip never cuts resting row paint and a swiped row paints no further than that edge.                                                                                                                                                                                                                                                                                                                                                                                     | `spec:AST-057/FR9`                                                                       | Verified by `List.test.tsx` and real-browser geometry |
| FR10 | Under a coarse primary pointer (`spec:AST-094` FR13), every ListItem row MUST offer a hit target at least 44 px tall, through its padding or an invisible hit area, with no visual change, where its neighbors leave room: the hit area never overlaps a neighboring row's or control's target, and between close neighbors it is clamped to half the gap; row height and geometry stay as they are at every density. A fine pointer keeps today's hit target.                                                                                                                                                                                                                  | Owner decision, 2026-10-26: no row-height change, a 44 px touch target                   | Accepted contract                                     |
| FR11 | Under a coarse primary pointer, an interactive row's press MUST follow the cell profile (`spec:AST-094` FR11): it paints the `--color-overlay-pressed` token above the row's background and below its content without adding an element, and its release fades over the press model's release duration and curve on the compositor (`spec:AST-094` FR5). At rest the row's paint and stacking are as they were.                                                                                                                                                                                                                                                                 | `spec:AST-094` FR5, FR11                                                                 | Accepted contract                                     |
| FR12 | List MUST take an `animatedLayout` handle (`spec:AST-105` FR1) and report each row inserted, removed, or moved between renders. With a handle, an inserted row enters, a removed row collapses in place, inert and hidden from assistive technology until it is gone, and a row crossing rows moving the other way rides above them on the list's surface, while the rows after a change glide to their new places (`spec:AST-105` FR3), all starting on one frame on the shared motion role (`spec:AST-105` FR4). Without a handle the list changes at once (`spec:AST-105` FR2). A row's identity is its `itemKey` (`spec:AST-103` DEC-4); a row without one changes at once. | `spec:AST-105` FR1–FR5; `spec:AST-103` DEC-4                                             | Accepted contract                                     |

### Allowed variation

- Density and `item.paddingInline` theme overrides may change the retained inset;
  every treatment follows the same derived value. A theme override of row inline
  padding takes precedence over every treatment, as it does over density.
- Host padding may be uniform, asymmetric, zero, or absent; each logical edge
  resolves independently.
- Labels, descriptions, markers, start/end content, interactivity, and selection
  may vary without changing the collection-wide treatment.
- Under a coarse primary pointer, a row's hit target grows toward 44 px where
  its neighbors leave room (FR10); row geometry and appearance are unchanged.

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
| `animatedLayout`, rows change                          | Staying rows move to their new places; a removed row collapses; new rows fade in.      | Reduced motion: the role's policy.  |

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
- **PR2 — Motion only where it applies.** FR11 adds no listener, observer,
  measurement, or animation under a fine pointer, and FR12 measures rows only
  with a handle. Every motion runs on transform and opacity.

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
  List owns the collection-level treatment, row placement, and its rows' own
  entering, exiting, and crossing (FR12).
- `spec:AST-057` owns swipe actions on `Item` and the rule that the element
  containing swipe-capable rows clips in the inline axis; List carries that clip
  (FR9) and `ListItem` passes `swipeActions` and `swipeBehavior` through to
  `Item` unchanged.
- `spec:AST-094` owns the touch presentation gate (FR13), the press model
  (FR11), and motion roles (FR4); FR10 and FR11 apply the gate and the press
  model to list rows, and FR12's motion plays an FR4 role.
- `spec:AST-105` owns the animated layout handle and its shared motion; List
  adopts it for row updates (FR12).
- `spec:AST-103` owns reordering. List is its first adopter: it
  takes the `reorderable` object, a row's key is its `ListItem`'s `itemKey`
  and its position is its index, and the
  handle is the one element reordering adds to a row, at its trailing edge
  (`spec:AST-103` FR5).

## Verification map

| Contract                  | Verification                                                    | Representative states                                                                                                                                                                                                                                                                                                                | Mutation or failure expectation                                                                                                                                                                                                    | Audit section       |
| ------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| FR1–FR7, FR9              | List, Item, and theme-registry tests                            | every treatment; all densities; static and interactive rows; header; deprecated alias alone and with `edge`; ListItem outside a List                                                                                                                                                                                                 | Removing context propagation, using one host edge for both inline edges, zeroing padding without the shared inset source, or dropping the list's reach or clip fails                                                               | `audit:List/layout` |
| FR2–FR6, FR8–FR9, AR1–AR2 | Real-browser List geometry evidence                             | each treatment in a Card at two paddings, a Section, an inline Dialog with and without Layout, a BottomSheet, a padded ScrollableArea scrolling vertically and in both axes, a LayoutContent with explicit padding, and standalone; header and dividers; LTR/RTL; hovered and selected rows; a swiped row under `outset` and `bleed` | Header movement, content off the expected line, paint past the host's padding edge, clipped resting paint, or a changed row box fails                                                                                              | `audit:List/visual` |
| FR10                      | List tests of the touch hit target and real-browser hit-testing | every density; a row with a description; compact rows packed closer than 44 px; a row with an end control; a coarse and a fine pointer; a theme row padding                                                                                                                                                                          | A coarse-pointer row whose target stays at its box where its neighbors leave room, a target that reaches a neighboring row's or control's target, a changed row box, or a changed fine-pointer target fails                        | `audit:List/layout` |
| FR11                      | Item press-layer tests and real-browser pixel evidence          | press, hold, and release; a release while the main thread is blocked; a mouse                                                                                                                                                                                                                                                        | A release that stops while script runs, an element added for the press, or paint or stacking changed at rest fails                                                                                                                 | `audit:List/visual` |
| FR12                      | List update-motion tests and real-browser frame evidence        | an insert, a removal, and a reorder, with and without a handle; reduced motion; a mouse                                                                                                                                                                                                                                              | A staying row that jumps with a handle, motion without one, a collapsing removed row that takes focus, pointer input or an accessibility-tree node, a removed row left after its collapse ends, or layout or paint per frame fails | `audit:List/visual` |
| Migration                 | `astryx upgrade` codemod tests                                  | static, aliased, already-migrated, dynamic, and computed-`edge` callsites; a second run                                                                                                                                                                                                                                              | A dynamic value or a computed `edge` rewritten, a static one missed, or a second run that changes output fails                                                                                                                     | `audit:List/docs`   |
| Documentation             | `List.doc.mjs`, Storybook, and `scripts/check-knowledge.mjs`    | public prop, values, default, deprecation, and representative composition                                                                                                                                                                                                                                                            | Missing or stale contract, docs, or example fails                                                                                                                                                                                  | `audit:List/docs`   |

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

- **OQ1 — A caller's `::before` through a press.** The press paint takes the
  row's `::before` while the row is pressed, so a caller's decoration there
  is hidden for that time: (a) keep that, and document decorating a row with
  a child; or (b) require the press paint to leave a caller's `::before`
  intact.

## Content boundary

This claim-scoped contract does not duplicate List's complete prop table,
container-padding internals, consumer examples, implementation steps, or future
TabList/Button projections. Those remain with their named owners.
