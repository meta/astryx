---
schema_version: 3
template_version: 1
kind: module
id: module:Table/useTableRowStatus
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-01
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Table/plugins/rowStatus/useTableRowStatus.test.tsx,
    scripts/check-knowledge.mjs,
  ]
parent_component: component:Table
references:
  [
    component:Icon,
    architecture:component-theming-surface,
    architecture:icon-resolution-and-component-slots,
    architecture:public-component-api,
    spec:AST-002/DEC-6,
  ]
---

# useTableRowStatus module contract

## Intent

`useTableRowStatus` adds an optional generated status gutter that communicates one
outcome or caller-defined marker for each Table row. The module owns its public status
vocabulary, generated column and indicator anatomy, accessible naming, internal
signifier resolution, invalid-input fallback, performance obligations, and
implementation evidence.

This current contract is authoritative for the module's intended behavior. Runtime,
public types, consumer docs, and release implementation remain explicitly pending
and MUST follow this contract when implemented.

## Compatibility and migration

- Released default preserved: `yes`; every stable `0.5.2` custom marker keeps the
  same source shape and rendered dot or caller-selected glyph.
- Compatibility class: additive semantic interface at the `getStatus` callback
  boundary plus restoration of stable behavior before the next stable release.
- Migration decision: no stable-consumer codemod and no required stable-consumer
  edit. Canary consumers that intentionally adopted the implicit semantic glyph
  from [#5671](https://github.com/meta/astryx/pull/5671) migrate manually from
  `{color: 'error', label}` to `{status: 'error', label}`.

Stable `0.5.2` already defines `{color, label}` as a caller-painted dot and
`{color, icon, label}` as a caller-selected glyph with caller-selected paint. The
exported `TableRowStatus` interface remains byte-for-byte unchanged so existing
annotations, interface extensions, and declaration merging remain valid.

A value-based codemod would be unsafe because stable `{color: 'error', label}` may
intentionally mean an error-colored dot. If the semantic implementation is not
ready before a stable cut, restore the custom-marker behavior first and defer the
new semantic interface; the overloaded canary behavior MUST NOT become stable.

This specification-only change carries no package Changeset. The implementation
pull request owns public exports, consumer docs, tests, release notes, and its
package-version Changeset.

## Ownership boundary

**Owns**

- The public `useTableRowStatus` hook, `UseTableRowStatusConfig`, unchanged
  `TableRowStatus` custom-marker interface, and proposed
  `TableSemanticRowStatus` interface.
- The exclusive result boundary of `getStatus`, including `null` for no marker.
- The generated fixed-width column, visually hidden header name, empty-cell
  behavior, indicator DOM, and internal `icon | dot` variant resolution.
- Mapping semantic row status to a shared semantic Icon name and tone before
  delegating glyph rendering.
- Runtime precedence and warning behavior for untyped semantic/custom conflicts.
- Row-status accessibility, performance constraints, migration, and evidence.

**Does not own / non-goals**

- Aggregate `TablePlugin` protocol, transform phases, named-plugin ordering, slot
  composition, failure isolation, or plugin-array identity — owned by
  `component:Table`.
- Icon artwork, Icon's target, or shared icon resolution — owned by
  `component:Icon` and `architecture:icon-resolution-and-component-slots`.
- The active theme's semantic token values or concrete semantic artwork. The theme
  supplies those through existing contracts; it does not select this module's
  internal variant.
- Product-specific meaning for custom colors or custom icons. The caller owns that
  meaning and supplies the required label.
- Shared design-feedback vocabulary. A Table row outcome is not authority for
  feedback components.
- A public `variant` or `presentation` prop, extensible variant map, reflected
  variant data attribute, or row-status theme selector axis.
- No `table-row-status` target is approved by this contract.
  [#5754](https://github.com/meta/astryx/pull/5754) remains outside this
  contract and is held for a separate AST-002 proposal proving a theme-author
  need, painter placement, and exact guarantees.

## Public API and concepts

The proposed public interfaces and callback boundary are additive:

```ts
export interface TableRowStatus {
  color: TableRowStatusColor | (string & {});
  icon?: IconName;
  label: string;
}

export interface TableSemanticRowStatus {
  status: 'success' | 'warning' | 'error';
  color?: never;
  icon?: never;
  label: string;
}

export interface UseTableRowStatusConfig<T extends Record<string, unknown>> {
  getStatus: (
    item: T,
  ) => (TableRowStatus & {status?: never}) | TableSemanticRowStatus | null;
}
```

`TableRowStatus` remains byte-for-byte the existing exported interface. The
exclusive union exists only at the callback boundary, where its custom member is
intersected with `{status?: never}`. This preserves the existing interface for
annotations, extension, and declaration merging without allowing a supported
semantic status to mix with custom marker inputs. `TableRowStatusColor` and the
existing `string & {}` CSS-color escape hatch remain unchanged; this contract does
not newly export the color type.

| Concept             | Closed values or states                         | Meaning                                                                              | Default                      | Owner                            | Stability                               |
| ------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------- | -------------------------------- | --------------------------------------- |
| Row-status presence | Either public interface or `null`               | Adds one indicator for the row or leaves the generated cell empty.                   | `null` means absent          | `module:Table/useTableRowStatus` | Stable presence; additive semantic form |
| Semantic outcome    | `success`, `warning`, `error`                   | Selects one cohesive system-owned outcome whose glyph and tone are derived together. | No implicit outcome          | `module:Table/useTableRowStatus` | Additive proposal                       |
| Custom marker paint | Existing Table row-status colors or a CSS color | Selects paint only; no color value implies a semantic outcome or representation.     | Required on `TableRowStatus` | Caller through this module       | Stable `0.5.2`                          |
| Custom marker glyph | `IconName` or absent                            | Selects the caller-owned glyph; absence selects a dot.                               | Absent means dot             | Caller through this module       | Stable `0.5.2`                          |
| Label               | Required string                                 | Names the indicator and supplies supplemental tooltip text.                          | Required                     | Caller through this module       | Stable                                  |
| Resolved variant    | Internal `icon` or `dot`                        | Names the signifier anatomy derived from the accepted result, not a caller choice.   | Derived                      | `module:Table/useTableRowStatus` | Internal                                |

Consumer docs own final import syntax, reference tables, and examples when the
implementation lands.

## Behavioral contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                | Basis                                                 | Implementation/evidence state                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| FR1  | Given a referentially stable `getStatus`, `useTableRowStatus` returns one stable `TablePlugin` that contributes a `transformColumns` function to the parent pipeline.                                                                                                                                                                    | Current source and stable behavior                    | Verified baseline; semantic branch pending.                     |
| FR2  | At its parent-owned transform position, the module prepends one fixed 28 CSS-pixel, non-resizable generated column. The visually blank header has a localized accessible name; `null` leaves that row's generated cell empty.                                                                                                            | Stable `0.5.2` behavior                               | Owner-directed module contract; composition evidence pending.   |
| FR3  | `TableRowStatus` remains byte-for-byte the exported stable `{color, icon?, label}` interface. `color` always controls paint only. An absent `icon` resolves to the existing dot; a present `icon` resolves to the caller-selected glyph with caller-selected paint, including when the color string is `success`, `warning`, or `error`. | Stable `0.5.2` compatibility and owner direction      | Owner-directed; current canary overload must be reverted.       |
| FR4  | `TableSemanticRowStatus` accepts only `success`, `warning`, or `error` plus required `label`. Each status resolves to the matching shared semantic Icon name and semantic tone from the active theme. Caller `color` and `icon` are forbidden.                                                                                           | Owner direction, 2026-09-01; Icon resolution contract | Owner-directed; implementation and theme substitution pending.  |
| FR5  | Internal variant resolves to `icon` for every semantic status, `dot` for custom color without icon, and `icon` for custom color with icon. Variant is internal/anatomy terminology only.                                                                                                                                                 | Owner direction, 2026-09-01                           | Owner-directed; no public or theme exposure approved.           |
| FR6  | Only `getStatus` forms the exclusive callback union shown above, intersecting the custom interface with `status?: never`. Typed callers cannot provide a supported `status` together with `color` or `icon`; the standalone stable interface is not narrowed.                                                                            | Owner direction and AST-002 FR15-FR16                 | Type shape verified independently; repository fixtures pending. |
| FR7  | For an untyped object with a supported `status` plus `color` and/or `icon`, semantic status wins, custom fields are ignored, and development emits at most one warning for the loaded row-status module instance. Production emits no warning and renders the same semantic result.                                                      | Owner direction, 2026-09-01                           | Owner-directed; runtime coverage pending.                       |
| FR8  | `label` remains required on both interfaces. The outer indicator exposes one accessible image name; a nested Icon is decorative. Tooltip text is supplemental and not the sole communication path.                                                                                                                                       | Stable behavior and owner direction                   | Naming is owner-directed; browser and AT evidence pending.      |
| FR9  | The semantic interface supplies a non-color cue through distinguishable themed glyphs. The custom dot makes no promise that caller-selected paint is a shared semantic outcome or an independently non-color cue.                                                                                                                        | Owner direction and accessibility boundary            | Owner-directed; theme and forced-colors evidence pending.       |
| FR10 | The module composes through the parent `TablePlugin` protocol and does not redefine or depend on a private second transform order. It prepends to the columns received at its resolved position and remains valid with supported selection, expansion, grouping, empty-data, and custom-plugin combinations.                             | Parent protocol and owner direction                   | Composition matrix pending.                                     |

### Transformation and precedence order

- **ORD1 — Result presence.** `null` produces no indicator. A non-null result moves
  to branch resolution.
- **ORD2 — Semantic branch.** A supported `status` selects semantic outcome before
  custom-marker resolution, deriving matching tone and shared glyph together.
- **ORD3 — Invalid semantic/custom mixture.** When untyped input also carries
  `color` or `icon`, ignore those fields. In development, a module-level dedupe
  emits only the first warning for the loaded module instance; repeated rows and
  renders do not spam the console. Production renders the semantic result without
  warning.
- **ORD4 — Custom branch.** Without supported semantic status, custom `color`
  selects paint; `icon` presence selects caller glyph versus dot.
- **ORD5 — Icon delegation.** The module selects a shared semantic Icon name, then
  the active theme's existing shared registry selects artwork. The theme does not
  select internal variant.
- **ORD6 — Parent pipeline.** The module prepends its column at the transform
  position supplied by `component:Table`; the parent owns all relative ordering
  and later render phases.

### Performance and resources

- **PR1 — Constant row work.** Result and variant resolution perform constant work
  per rendered row and add no layout measurement, listener, observer, timer, or
  asynchronous resource.
- **PR2 — Stable identity.** A referentially stable `getStatus` preserves the
  module's `TablePlugin` identity. Adding semantic resolution MUST NOT make
  unchanged rows rerender solely because the branch moved from `color` to
  `status`.
- **PR3 — Existing theme path.** Semantic glyph and tone resolution use existing
  synchronous Icon/theme paths rather than a parallel registry or per-row theme
  subscription.
- **PR4 — Warning bound.** Invalid-input diagnostics retain only one module-level
  boolean-equivalent dedupe state and emit at most once per loaded module instance.

Current measurements belong in audit evidence. Implementation verification must
add semantic/custom cases to representative Table render and no-op update budgets.

## Accessibility contract

- **AR1 — Named gutter.** The visually blank generated column header MUST keep one
  localized accessible name identifying the row-status column.
- **AR2 — One indicator name.** Every non-null result MUST expose exactly one
  accessible image name from required `label`; any nested Icon remains decorative.
- **AR3 — Semantic non-color cue.** Semantic outcomes MUST use distinguishable
  shared glyphs as well as semantic tone across supported themes and forced-colors
  behavior.
- **AR4 — Honest custom contract.** A custom dot remains a caller-selected
  paint-only marker. Required `label` supplies its programmatic name, but the module
  MUST NOT claim that the dot itself communicates custom meaning without color.
- **AR5 — Supplemental tooltip.** Tooltip may repeat `label` as pointer help, but
  the indicator's accessible name MUST remain sufficient without opening it. The
  current indicator is not focusable, so tooltip presence is not keyboard evidence.
- **AR6 — Row context.** The named status is exposed in its row context without a
  duplicate name, proved at the accessibility tree. Assistive-technology
  observation of the announcement is recommended follow-up under `spec:AST-009`.

## Design relationships

| Anatomy or state        | Design requirement                                                                         | Representation authority                                         | Module contract      |
| ----------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | -------------------- |
| Row-status column       | Keeps optional row outcomes aligned in one narrow generated gutter.                        | This module; relative column order belongs to `component:Table`. | FR1, FR2, FR10, AR1  |
| Row-status indicator    | Owns the row's accessible status name and contains one resolved signifier.                 | `module:Table/useTableRowStatus`                                 | FR3-FR9, AR2-AR6     |
| `icon` signifier        | Uses a semantic or caller-selected glyph through Icon.                                     | This module selects meaning; `component:Icon` renders.           | FR3-FR5, AR2, AR3    |
| `dot` signifier         | Uses the stable custom paint-only dot.                                                     | This module with caller-selected paint.                          | FR3, FR5, AR4        |
| Invalid untyped mixture | Preserves cohesive semantic outcome without combining custom axes or flooding diagnostics. | `module:Table/useTableRowStatus`                                 | FR6, FR7, ORD2, ORD3 |

No direct row-status target or variant selector is approved. Semantic icon rendering
delegates to the existing `icon` target. The custom dot has no direct public target.
Because this specification PR does not change consumer anatomy metadata, it does
not add an `anatomy-theming:v1` block. A later direct target proposal requires its
own AST-002 review and synchronized consumer anatomy.

## Parent and system relationships

- `component:Table` owns the aggregate `TablePlugin` transform protocol,
  base-before-user ordering, canonical named-plugin order, slot composition,
  failure isolation, context nesting, and plugin-array identity. This module owns
  only the row-status contribution and MUST NOT duplicate or override that order.
- `component:Icon` owns glyph presentation, size, color, target, and decorative
  versus labelled Icon semantics. The row-status indicator keeps the outer name.
- `architecture:icon-resolution-and-component-slots` owns shared semantic-key
  resolution. This module selects `success`, `warning`, or `error`; it creates no
  Table-specific component-icon slot.
- `architecture:component-theming-surface` owns target qualification and requires a
  separate decision before any `table-row-status`, `variant`, or `presentation`
  selector is public.
- `architecture:public-component-api` and `spec:AST-002/DEC-6` require the stable
  custom interface, additive semantic interface, and callback-only exclusive
  boundary to keep each public input's responsibility coherent.

## Verification map

| Contract                 | Verification                                                                                                                                                                                      | Representative states                                                                  | Mutation or failure expectation                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR1, FR2, FR10           | Extend `useTableRowStatus.test.tsx` with fixed column metadata, `null`, empty data, grouped rows, selection/expansion combinations, and parent-order permutations.                                | Module alone and with supported first-party/custom plugins.                            | The column drops, duplicates, resizes, loses its header name, or assumes a second/private plugin order.                                                            |
| FR3, FR4, FR6            | Add public-subpath compile fixtures for the unchanged interface, declaration merging and extension, semantic interface, callback union, missing labels, unknown statuses, and forbidden mixtures. | Stable custom annotations/extensions; all semantic statuses.                           | `TableRowStatus` changes or stops merging, semantic usage is inaccessible, or supported status mixes with custom fields.                                           |
| FR3-FR5                  | Extend row-status runtime tests with semantic-looking custom colors, raw/palette dots, explicit custom icons, all semantic statuses, and active-theme substitution.                               | Custom dot, custom icon, and three semantic outcomes.                                  | Custom color selects an implicit glyph, semantic status bypasses shared resolution, or variant becomes caller/theme input.                                         |
| FR7, ORD2-ORD4, PR4      | Runtime tests under development and production modes with repeated mixed objects, rows, and renders.                                                                                              | `status + color`, `status + icon`, and all three fields.                               | Custom input overrides supported status, forbidden fields affect output, production warns, or development warns more than once per loaded module instance.         |
| AR1-AR6                  | Existing role/name tests plus browser axe, forced-colors, tooltip modality, and accessibility-tree row-context evidence; VoiceOver table navigation is recommended follow-up.                     | Semantic glyphs, custom icon, custom dot, `null`, light/dark, and every shipped theme. | Header or indicator loses its name, nested glyph is announced twice, glyph distinctions disappear, tooltip becomes sole meaning, or row context duplicates status. |
| PR1-PR3                  | Extend `Table.perf.test.tsx` with semantic/custom initial render and no-op update cases.                                                                                                          | Stable rerender, mixed rows, and theme substitution.                                   | Resolution adds measurement/resources, creates a parallel registry, or exceeds existing representative Table budgets.                                              |
| Structural ownership     | `scripts/check-knowledge.mjs`.                                                                                                                                                                    | Colocated module, canonical filename/id, and parent backlink.                          | A missing, duplicate, orphaned, mis-parented, misnamed, or undiscovered record passes validation.                                                                  |
| Public hygiene and scope | Prettier, `check:knowledge`, checker tests, `check:repo`, changed-file scan, and public-content scan.                                                                                             | Parent backlink plus one module specification; no Changeset.                           | Runtime/docs files, private context, invalid record shape, or unrelated changes enter this contract proposal.                                                      |

Implementation and browser/assistive-technology evidence are pending. Passing this
specification PR's checks proves record integrity only, not future runtime behavior.

## Decision log

These entries record the approved owner direction. Runtime implementation and its
evidence remain pending.

### DEC-1 — Preserve the custom interface; union only at the callback boundary

**Reference:** `module:Table/useTableRowStatus/DEC-1`
**Direction owner:** cixzhang, 2026-09-01

The exported `TableRowStatus` interface remains byte-for-byte the stable custom
marker contract so existing annotations, extensions, and declaration merging keep
working. A separate exported `TableSemanticRowStatus` interface owns semantic
outcomes. Only `getStatus` forms their exclusive union by intersecting the custom
interface with `{status?: never}`.

Rejected: replacing `TableRowStatus` with a union alias or adding semantic fields to
it. Either choice changes the extension surface stable consumers already use.

### DEC-2 — Derive variant and delegate semantic artwork

**Reference:** `module:Table/useTableRowStatus/DEC-2`
**Direction owner:** cixzhang, 2026-09-01

The module derives internal `icon | dot` variant from semantic versus custom intent.
Semantic status selects the matching shared Icon name and tone; the active theme
supplies concrete artwork and token values. Custom color keeps caller-owned paint
and optional glyph.

Rejected: public `variant` or `presentation`, semantic caller overrides, a
Table-specific semantic icon registry, and exposing the derived branch as a theme
axis or data-attribute guarantee.

### DEC-3 — Stable behavior wins over the canary overload

**Reference:** `module:Table/useTableRowStatus/DEC-3`
**Direction owner:** cixzhang, 2026-09-01

Stable `0.5.2` custom-marker behavior is preserved without a codemod. The canary
behavior introduced by [#5671](https://github.com/meta/astryx/pull/5671), where
semantic-looking `color` values choose icons, must be reverted before stable.
Canary adopters of that implicit glyph migrate manually to `status`.

Rejected: changing stable custom colors, guessing semantic intent with a codemod,
or allowing the overload to reach stable while semantic implementation is
unfinished.

### DEC-4 — Direct row-status theming is not approved

**Reference:** `module:Table/useTableRowStatus/DEC-4`
**Direction owner:** cixzhang, 2026-09-01

The semantic interface uses Icon's existing target, registry, and theme-owned
artwork and tone. This contract records generated anatomy but does not add
`table-row-status`, `presentation`, `variant`, or an equivalent selector surface.

Owner direction holds [#5754](https://github.com/meta/astryx/pull/5754)
as written. A future direct target requires separate AST-002 review after painter
placement, theme-author need, and exact property guarantees are settled.

### DEC-5 — Supported semantic status wins invalid untyped mixtures

**Reference:** `module:Table/useTableRowStatus/DEC-5`
**Direction owner:** cixzhang, 2026-09-01

For untyped input containing a supported `status` plus `color` and/or `icon`, resolve
the semantic branch, ignore custom fields, and emit one development warning
deduplicated for the loaded row-status module instance. Production renders the same
semantic result without warning.

Rejected: allowing custom fields to override semantic intent, combining axes, or
warning once per row or render and flooding the console.

## Open questions

None. The owner approved every module-local judgment in this contract.
Implementation and its evidence remain pending.

## Content boundary

This record does not duplicate consumer import/reference docs, the parent Table
plugin protocol or ordering, shared Icon/theme algorithms, shared feedback
language, current audit results, or implementation steps. Runtime code, consumer
docs, release notes, Changeset, and final browser/assistive-technology evidence
land separately as implementation of this approved contract.
