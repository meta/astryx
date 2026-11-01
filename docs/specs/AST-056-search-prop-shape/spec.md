---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-056
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-02
phase: accepted
owners: [cixzhang]
affects_architecture: [architecture:public-component-api]
affects_families: [family:input-fields]
affects_contributing: [contributing:api-conventions]
affects_consumer_docs:
  [Selector, MultiSelector, Tokenizer, Typeahead, BaseTypeahead, CommandPalette]
review_triggers: [public-api, accessibility, compatibility]
---

# Search state vocabulary system spec

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "public-api": [
      "FR1",
      "FR2",
      "FR3",
      "FR4",
      "FR5",
      "FR6",
      "FR7",
      "DEC-1",
      "DEC-2",
      "DEC-3",
      "DEC-4"
    ],
    "accessibility": ["AR1", "AR2"],
    "compatibility": ["FR7"]
  }
}
```

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | One vocabulary, not one structure. "The query matched nothing" is `emptySearchText` taking `ReactNode`, on every component that has the state; "there is nothing here at all" stays `emptyText` and the two never merge (FR1, FR2, DEC-1). A capability that needs a query names that in its own prop name, and its handler is its only switch (FR5, DEC-3). No configuration object (DEC-2).                                                                                                                   |
| Behavior                | Unchanged. Who resolves a query is settled by who owns the choices and is not restated per component: a component holding its own choice set filters them and exposes a boolean to show the input; a component whose presented choices ARE the query's result takes a required `searchSource` (FR4, DEC-2).                                                                                                                                                                                                     |
| End-user impact         | A person meets the same dead end everywhere, and can be offered the same way out of it: widening `emptySearchResultsText` to `ReactNode` lets a product put a link or a create row in a `Tokenizer`'s empty result as it already can in a `Selector`'s. A half-configured create row stops silently rendering nothing (FR5). Whatever a caller supplies is also what gets announced (FR3, AR1).                                                                                                                 |
| Builder impact          | One rename to learn: `emptySearchResultsText` becomes `emptySearchText`. No prop moves, no object literal, no restructuring. Every shipped prop keeps working through the cycle.                                                                                                                                                                                                                                                                                                                                |
| Compatibility/readiness | Not additive, but small: one prop renamed on three components, with its type widened from `string` to `ReactNode`. No required prop moves. The replacement-first cycle and its cost are in `Migration and compatibility`; FR7 is the only requirement that constrains it. Authority: `draft`. Three owner questions remain open; none of them changes FR1 or FR2.                                                                                                                                               |
| Review checks           | Reject a second name for a state these props already express; a boolean that gates a handler; a capability that renders inert when a sibling prop is missing; an empty-state value that cannot reach assistive technology (AR1); a query input named only by its placeholder (AR2).                                                                                                                                                                                                                             |
| Governing rules         | [`spec:AST-002`](../AST-002/spec.md) FR1, FR4, FR15, FR16 and `spec:AST-002/DEC-1`, `DEC-6` for admission and one responsibility per input; [`architecture:public-component-api`](../../architecture/public-component-api.md) INV1, INV2, INV3, INV9 for the shared naming grammar and released-API lifecycle; [`spec:AST-017`](../AST-017/spec.md) FR28–FR31 for deprecation and cleanup; [`family:input-fields`](../../families/input-fields.md) for the field chrome around the query input, unchanged here. |

This table is a review projection; the body below is authoritative.

## Intent

Typing to narrow a list is one thing a person does, and Astryx spells it seven
ways. A builder who has used `hasSearch` on `Selector` finds no `hasSearch` on
`Tokenizer`; a builder who has set `emptySearchResultsText` on `Typeahead`
finds `emptySearchText` on `CommandPalette`, taking a different type. Nothing
is broken for the person using the product, but every new search-adjacent
capability lands as another flat prop on one component, with its own name, and
the next component copies whichever neighbour it happened to read.

This record owns one answer: **a shared vocabulary for the states a typed
query produces, with no restructuring.** It fixes the name and type of "the
query matched nothing", keeps that state distinct from "there is nothing here
at all", and says how a capability that cannot work without a query declares
that dependency.

An earlier draft proposed collecting these props into one object-valued
`search` prop. That is rejected in DEC-2: it would have cost nine
deprecations across seven components, four of them a required prop, to solve
a tidiness problem rather than one a person using an Astryx product meets.

The trigger is [#6829](https://github.com/meta/astryx/pull/6829), which
proposes `hasCreate` + `onCreate` on `MultiSelector` — a sixth and seventh
search-adjacent prop on a component that already carries three, under a name
`Tokenizer` already ships with a different contract. That pull request is
blocked on this ruling, and the shape it adopts is the shape every later
component copies.

## Ownership boundary

**Owns**

- The name and type of each observable state a typed query produces, shared
  across every component that has that state.
- That "the query matched nothing" and "there is nothing here at all" are
  distinct states under distinct names, and neither absorbs the other.
- How a capability that cannot function without a query declares that
  dependency, and what gates it.
- Whether a newly proposed search-related prop joins this vocabulary or
  introduces a second name for something it already says.
- The accessibility floor the arrangement must keep for the empty-result
  message and the query input's name.

**Why no existing record can hold it**

- [`spec:AST-002`](../AST-002/spec.md) is `current` and approved, and a record
  carries one `authority` value, so adding unapproved claims to it would
  present them as approved (`architecture:knowledge-contracts` INV1, INV14).
  It also owns a different fact — whether a public API is admitted at all —
  and both its FR17 and its DEC-7 say in their own words that **component prop
  and event naming remains separate**. A rule about the shape and name of a
  component prop is structurally outside what AST-002 claims. This record sits
  downstream of AST-002 FR1 and FR4: admission still decides whether a search
  capability exists, and this record decides only where it is spelled.
- [`architecture:public-component-api`](../../architecture/public-component-api.md)
  is `current` and approved, with the same authority problem. It holds the
  shared naming grammar (INV2) and links its human rulings through
  `deciding_specs` — `spec:AST-002/DEC-1`, `spec:AST-005/DEC-1`,
  `spec:AST-012/DEC-1`. A new cross-component ruling belongs in a spec it
  links, not inside it; its own INV18 boundary keeps observable caller-visible
  behavior in a product contract.
- [`family:input-fields`](../../families/input-fields.md) is `current` and owns
  the field chrome — label, status, size, theming — shared by its members. Two
  of the components this record binds, `BaseTypeahead` and `CommandPalette`,
  are not members and are not input fields; `CommandPalette` is a dialog. They
  are not one sibling family, which is why the vocabulary is owned here rather
  than by that contract.
- `contributing:api-conventions` and the wiki's `Prop Naming` section document
  conventions for booleans, callbacks, enums, direction, and HTML collisions.
  They say nothing about one state keeping one name across components, and
  guidance is not an authority record. Both owe an amendment once this record
  is `current`.
- The six component records would each hold a private copy of the same
  decision, which `architecture:knowledge-contracts` INV2 forbids.
  `component:MultiSelector` is already drafting one as its FR10 / DEC-3.

## Non-goals

- **Matching quality.** Fuzzy matching, ranking, highlighting, tokenization,
  and diacritic folding are not settled here. FR4 fixes only the floor for the
  mode where the component does the filtering.
- **Whether any particular component should gain search, or a create row.**
  That is `spec:AST-002` admission, case by case.
- **`PowerSearch`.** Its query is a structured field/operator/value expression,
  not a typed string narrowing a list. Its `maxSearchResults` and its per-field
  `searchSource` are cited as evidence of spread, not governed (OQ4).
- **`emptyBootstrapText` on `CommandPalette`.** "No query yet, and the default
  set is empty" is a different observable state from "the query matched
  nothing"; it stays a top-level prop.
- **The trigger-menu configuration on `ChatComposerInput`.** Its per-trigger
  objects each carry an `emptySearchResultsText`, so FR1 reaches them, but
  whether that nested rename rides this record's cycle is OQ4.
- **Internal filtering implementation.** Equivalent internal implementations
  remain valid when they satisfy this contract. Internal modules, files,
  function names, algorithms, data structures, storage layouts, manifests,
  journals, locks, transaction protocols, and CI job/workflow topology belong in
  architecture or implementation unless callers or interoperating systems
  intentionally depend on that exact mechanism as a public protocol.

## Evidence: every search-shaped prop in core today

Read from `packages/core/src` at this record's base commit. This table is the
evidence for FR1–FR5; it is not a migration plan.

| Component           | Query input exists because                        | Who resolves the query                                 | Placeholder                                       | "Nothing matched"                                        | Query observable by the caller                       | Create affordance                                         | Other search-shaped props                                      |
| ------------------- | ------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| `Selector`          | `hasSearch?: boolean` — default `false`           | the component, over its own `options`                  | `searchPlaceholder?: string` — `'Search…'`        | `emptySearchText?: ReactNode` — `'No results found'`     | **no** — `searchQuery` is internal `useState`        | —                                                         | `emptyText?: ReactNode` (`'No options'`, a different state)    |
| `MultiSelector`     | `hasSearch?: boolean` — default `false`           | the component, over its own `options`                  | `searchPlaceholder?: string` — `'Search…'`        | `emptySearchText?: ReactNode` — `'No results found'`     | **no** — `searchQuery` is internal `useState`        | `hasCreate` + `onCreate` **proposed** in #6829            | `emptyText?: ReactNode` (`'No options'`)                       |
| `Tokenizer`         | `searchSource: SearchSource<T>` — **required**    | the caller's source                                    | `placeholder?: string` — the input is the control | `emptySearchResultsText?: string` — `'No results found'` | `onChangeQuery?: (query: string) => void`            | `hasCreate?: boolean` — **the component mints the token** | `minQueryLength?: number` (`1`), `debounceMs?: number` (`150`) |
| `Typeahead`         | `searchSource: SearchSource<T>` — **required**    | the caller's source                                    | `placeholder?: string`                            | `emptySearchResultsText?: string`                        | `onChangeQuery?: (query: string) => void`            | —                                                         | `minQueryLength?: number`, `debounceMs?: number`               |
| `BaseTypeahead`     | `searchSource: SearchSource<T>` — **required**    | the caller's source                                    | `placeholder?: string`                            | `emptySearchResultsText?: string`                        | `onChangeQuery?: (query: string) => void`            | `__queryEntries` — underscored, `@internal`               | `minQueryLength?: number`, `debounceMs?: number`               |
| `CommandPalette`    | `searchSource: SearchSource<T>` — **required**    | the caller's source                                    | `CommandPaletteInput.placeholder` — `'Search…'`   | `emptySearchText?: ReactNode` — `'No results'`           | through the `input` slot's `value` / `onValueChange` | —                                                         | `emptyBootstrapText?: ReactNode` (`'Type to search'`)          |
| `ChatComposerInput` | one `searchSource` per entry in `triggers[]`      | the caller's source, per trigger                       | — (the composer's own `placeholder`)              | `triggers[].emptySearchResultsText?: string`             | —                                                    | —                                                         | `triggers[].loadingText`, `triggers[].menuLabel`, `debounceMs` |
| `PowerSearch`       | a structured filter expression, not a typed query | the caller's per-field `searchSource?` (value pickers) | internal (`@astryx.powersearch.placeholder`)      | —                                                        | —                                                    | —                                                         | `maxSearchResults?: number`                                    |

Four drift axes are visible in that table, and each one is a separate decision
somebody made alone:

1. **Two names for "nothing matched":** `emptySearchText` on `Selector`,
   `MultiSelector`, and `CommandPalette`; `emptySearchResultsText` on
   `Typeahead`, `BaseTypeahead`, `Tokenizer`, and each `ChatComposerTrigger`.
2. **Two types for the same message:** `ReactNode` on the first group, `string`
   on the second. A builder who can pass an element to one component cannot to
   its neighbour.
3. **Three defaults for it:** `'No results found'`, `'No results'`, and —
   because `Selector` and `MultiSelector` also carry a top-level `emptyText` —
   `'No options'` for the adjacent state.
4. **The prefix only appears where search is optional.** `Selector` and
   `MultiSelector` write `searchPlaceholder` because they also have a trigger
   placeholder; `Typeahead` and `Tokenizer` write `placeholder` because the
   query input _is_ the control. Both are locally right, which is exactly why
   no component will fix this on its own.

Beyond core, `packages/lab` has already copied the drift and added a fifth
name: `MobileTokenizer` takes `searchSource` + `emptySearchResultsText`,
`TransferList` takes `hasSearch` + `searchPlaceholder` + `searchLabel`, and
`ChatEmojiPicker` takes `searchLabel`. Lab is not a stable public promise, so
this record does not govern it; it is evidence that the pattern spreads by
copying.

### Two prior claims about prior art, corrected

- **`searchConfig` is not a component prop and is not prior art for this
  shape.** It is a parameter and plugin-config field in
  `Table/plugins/filtering/useTableFiltering.tsx`, holding a
  `PowerSearchConfig` — the structured field/operator/value configuration of
  the filter builder. It configures a different concept.
- **The repository's real precedent for this shape is `ChatComposerTrigger`.**
  Each entry in `ChatComposerInput`'s `triggers[]` is an object carrying
  `searchSource`, `renderItem`, `onSelect`, `emptySearchResultsText`,
  `loadingText`, and `menuLabel` — the whole configuration of one trigger's
  query in one value, with keys that mostly drop the prefix the surrounding
  name already supplies. It works, it is shipped, and nobody has asked for it
  to be flattened.

## Public API and concepts

| Concept                 | Closed values or states                      | Meaning                                                                                                | Default                           | Owner          | Stability |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------- | -------------- | --------- |
| `emptySearchText`       | `ReactNode`                                  | What the component shows when the query matched nothing. One name and one type everywhere (FR1)        | per component                     | `spec:AST-056` | proposed  |
| showing the input       | a boolean, or a required `searchSource`      | A component holding its own choices exposes a boolean; one whose choices ARE the result takes a source | per component                     | the component  | shipped   |
| a query-only capability | a handler whose name says it needs a query   | Presence of the handler is the switch; no boolean beside it (FR5)                                      | absent                            | `spec:AST-056` | proposed  |
| "no choices at all"     | the component's own top-level `emptyText`    | A different observable state from "the query matched nothing"; unchanged by this record                | the component's localized default | the component  | stable    |
| fetch tuning            | `minQueryLength`, `debounceMs`, loading text | Not placed by this record; they belong to whoever fetches, and OQ5 asks whether they move inside       | per component                     | the component  | stable    |

## Requirements

### Behavioral contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Basis                                                                        | Verification state                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------- |
| FR1 | One observable state has one prop name and one type across every component with a typed query. "The query matched nothing" is `emptySearchText`, accepting `ReactNode`. `emptySearchResultsText` resolves to it and its `string` typing is widened, so a caller may pass an element. No component may name or type this state differently.                                                                                                                                                                                                        | DEC-1; `architecture:public-component-api` INV2                              | Proposed; no evidence on `main`         |
| FR2 | "The query matched nothing" and "the component was given no choices at all" are different states and MUST stay separately expressible under distinct names: `emptySearchText` and `emptyText`. `Selector` and `MultiSelector` already declare both, so neither name may absorb the other, and a component offering only one MUST still use the name that matches the state it means.                                                                                                                                                              | DEC-1; `spec:AST-002` FR16                                                   | Proposed; shipped behavior, unspecified |
| FR3 | Whatever a caller supplies for an empty state MUST reach the person operating the component, visually and non-visually alike. A component that announces this state MUST announce what it rendered. Announcing a built-in default while rendering the caller's element is a defect, not a fallback.                                                                                                                                                                                                                                               | AR1; `architecture:interaction-modality`                                     | Proposed; defect on `main` (see AR1)    |
| FR4 | Who resolves the query is settled by who owns the choices, and is not restated per component. A component that holds its own choice set resolves the query itself, matching case-insensitively on each choice's displayed label at minimum, and exposes a boolean to turn the query input on. A component whose presented choices ARE the query's result takes a required `searchSource`. Both kinds reach the same observable states: a narrowed list, an empty result, and `emptyText`.                                                         | DEC-2; `spec:AST-002` FR16                                                   | Proposed; shipped behavior, unspecified |
| FR5 | A capability that cannot function without a typed query MUST have exactly one switch, and MUST report through the component's primary change callback with a descriptor naming the kind of change, rather than through a handler prop of its own. A caller MUST NOT be able to express a configuration that renders nothing and reports nothing, which `hasCreate && hasSearch && onCreate != null` permits whenever any one piece is missing. Enabling it on a component with no query input MUST warn in development rather than fail silently. | DEC-3; `spec:AST-002` FR15 (never silently render a broken state)            | Proposed; no evidence on `main`         |
| FR6 | A new search-related capability is admitted under `spec:AST-002` against this record, or not at all. A new top-level prop whose name carries the word `search` MUST name the state or capability it governs in the vocabulary this record fixes, and MUST NOT introduce a second name for a state one of these props already expresses.                                                                                                                                                                                                           | DEC-4; `spec:AST-002` FR1, FR5, DEC-1                                        | Proposed; no evidence on `main`         |
| FR7 | Every prop this record renames is a released public surface with a victim, so it MUST follow `spec:AST-017` FR28–FR31: the replacement ships first, old usage stays equivalent through the overlap, and removal happens in a declared minor with a `[breaking]` Changeset naming the replacement. While both exist, a component given both MUST resolve to the new prop and MUST fire a development warning.                                                                                                                                      | `architecture:public-component-api` INV9; `spec:AST-017` FR1, FR3, FR28–FR31 | Proposed; cycle not started             |

### Accessibility contract

- **AR1 — The empty-result message reaches assistive technology as written.**
  Whatever `emptySearchText` renders on screen MUST be what a screen reader
  receives when the panel becomes empty. Today it is not: `Selector` and
  `MultiSelector` announce `typeof emptySearchText === 'string' ? emptySearchText
: t('@astryx.selector.emptySearchResults')`, so a caller who passes an element
  — which the `ReactNode` type invites — is silently announced the default
  string instead of their own message. Accepting `ReactNode` (FR1) obliges the
  component to derive an announceable string from it, or to document and
  require a separate announceable form; it may not announce something the
  person on screen is not reading.
- **AR2 — The query input has an accessible name that is not its placeholder.**
  A placeholder is placeholder text and MUST NOT be the input's only
  accessible name. The component supplies the name: a localized "Search
  options" in `Selector` and `MultiSelector`, and a localized "Search commands"
  in `CommandPaletteInput`.

### Platform support

- Supported feature/engine floor: every supported renderer and every supported
  browser. Nothing here is behind a capability check.
- Unsupported behavior: none. A component that cannot satisfy FR3's
  required/optional rule does not partially adopt the prop; it keeps its
  current API until the rule is settled for it.
- Browser evidence: DOM live-region assertions prove the rendered content source,
  but they do not prove what assistive technology announces or when. Any adopter
  that changes announcement content or timing proves its routing, text, and
  occasion count at the DOM and accessibility-tree layers; real-AT observation is
  recommended follow-up under `spec:AST-009`.

## Migration and compatibility

This is not additive, and the cost is concentrated in one place.

**What is shipped and has a released victim.** Nine public props across seven
core components: `hasSearch`, `searchPlaceholder`, and `emptySearchText` on
`Selector` and `MultiSelector`; `searchSource` and `emptySearchResultsText` on
`Tokenizer`, `Typeahead`, and `BaseTypeahead`; `searchSource` and
`emptySearchText` on `CommandPalette`; `onChangeQuery` on the three typeaheads;
`hasCreate` on `Tokenizer`; `emptySearchResultsText` on every
`ChatComposerTrigger`. Under `spec:AST-017` FR1 and FR3, and
`architecture:public-component-api` INV9, removing or retyping any of them is a
breaking change.

**Nothing required moves.** An earlier draft would have folded the **required**
`searchSource` on `Tokenizer`, `Typeahead`, `BaseTypeahead` and
`CommandPalette` into an object, failing every existing callsite of those four
components at type-check. DEC-2 rejected that, so the whole migration is now
one optional prop renamed on four surfaces, with its type widened.

**This record's recommendation: deprecate with a replacement-first cycle.** Not
coexist indefinitely, not replace.

- A patch ships `emptySearchText` on each renaming component while the old prop keeps working,
  carries `@deprecated` naming its replacement, and behaves exactly as before
  (`spec:AST-017` FR28, FR29). During the overlap a component reads both and
  the new prop wins, with one development warning on conflict (FR7).
- Removal happens in a later declared minor with a `[breaking]` Changeset that
  names the replacement (`spec:AST-017` FR31). This record sets no clock; FR30
  forbids reading release cadence as one.
- A caller who passed a `string` needs no edit beyond the name: the type only
  widens, so every existing value stays valid.

**What each option actually costs.**

- **Deprecate with a cycle (recommended).** One prop doubles for the length of
  the overlap, on `Tokenizer`, `Typeahead`, `BaseTypeahead` and
  `ChatComposerTrigger`: `emptySearchResultsText` and `emptySearchText` both
  present in the types, both in `.doc.mjs`, both in the consumer docs. Four
  `DEP-*` records and four `CLN-*` ids. The rename is mechanically
  codemoddable, including where a caller spreads props, because the value's
  meaning does not change and the type only widens. Then one minor that breaks
  unmigrated callsites of those four surfaces.
- **Coexist indefinitely.** Nothing breaks, ever. The drift survives in the
  type signature: a builder still meets `emptySearchResultsText` on one
  component and `emptySearchText` on another, and the standard governs only
  components built after it. That answers "so when we add it later on other
  components we match the pattern" and leaves today's inconsistency in place.
- **Replace outright.** A minor that renames with no overlap. Rejected: the
  deprecation costs little here and no user problem justifies breaking
  callsites that a cycle would carry.

**`Tokenizer.hasCreate` needs no migration.** An earlier reading treated it as
a collision, because `Tokenizer`'s `hasCreate` is a boolean with no callback
while #6829 proposed a handler for `MultiSelector`. OQ5 settles it the other
way: `Tokenizer` mints the token itself and reports it through
`onChange(items, {item, type: 'create'})`, which is exactly the shape DEC-3
describes, so `Tokenizer` already conforms and changes nothing.
`MultiSelector` converges on it when #6829 returns.

## Current-state impact

- `architecture:public-component-api` gains `spec:AST-056` in its
  `deciding_specs` and a line in its `Deciding specs` list when this record
  becomes `current`. No invariant of that record changes: FR1–FR7 sit inside
  its INV2, INV3, and INV9 grammar rather than amending it.
- `contributing:api-conventions` and the wiki's `Prop Naming` section gain the
  state-naming rule: one observable state has one prop name and one type
  across every component that has it, and a new prop may not introduce a
  second name for a state an existing one already expresses. Neither surface
  rules on this today.
- `component:Selector`, `component:MultiSelector`, `component:Tokenizer`,
  `component:Typeahead`, `component:BaseTypeahead`, and
  `component:CommandPalette` cite this record instead of each recording a
  private copy. `component:MultiSelector` is `authority: draft` and is drafting
  exactly such a copy; that claim is withdrawn in favour of FR5 and FR6 here.
- [#6829](https://github.com/meta/astryx/pull/6829) is blocked on this
  ruling. Its `hasCreate` + `onCreate` pair is rejected by FR5, which admits
  the same user need as `hasCreate` alone, reported through the component's
  existing `onChange` with a descriptor naming the creation — the shape
  `Tokenizer` already ships — so the capability cannot be half-configured and
  one word does not carry two contracts.
- `family:input-fields`, `spec:AST-002`, and `spec:AST-017` are read, not
  changed: field chrome, admission, and the deprecation lifecycle keep their
  owners.
- No shipped public API changes on this record's own merge. Every component
  keeps every prop and every default until an adoption change lands.
- While this record is `draft` its `review-applicability:v1` block routes
  nothing: global routing loads `current` claims only
  (`architecture:knowledge-contracts` INV20). It becomes live on approval.

## Verification

| Contract  | Verification                                                                                      | Representative states                                                                                     | Mutation or failure expectation                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1, FR2  | Per-adopter prop-surface suites plus the repository's exported-surface and `.doc.mjs` prop checks | Each adopter's declared props; the exported object type imported from the package entry point             | A top-level prop whose name carries `search`, a key repeating the prefix, or an unexported object type fails.                                                       |
| FR3       | Per-adopter rendering suites                                                                      | `search` absent; `search={{}}`; `search` omitted on a component that requires it                          | A query input rendering with the prop absent, residual query state, or a required/optional declaration that contradicts whether the component holds choices, fails. |
| FR4       | Per-adopter suites in both modes                                                                  | No `source`, with choices the component holds; a `source` supplied; a query matching nothing in each mode | Divergent observable states between the two modes, or a component re-filtering what a `source` returned, fails.                                                     |
| FR5, AR1  | Per-adopter suites plus their live-region assertions                                              | A string `emptyText`; an element `emptyText`; the adjacent "no choices at all" state                      | A differently named or typed key, or an announcement that does not carry what the element rendered, fails. This is the gap AR1 names on `main` today.               |
| FR6, FR7  | Type-level checks plus per-adopter suites                                                         | `onCreate` given with `search` present; `onCreate` given with `search` absent                             | A create affordance reachable without search, a boolean gating a handler, or a silently inert configuration, fails.                                                 |
| FR8       | Per-adopter suites                                                                                | Typing; clearing; programmatic change                                                                     | A callback that suppresses the component's own resolution, or a component requiring it, fails.                                                                      |
| FR9       | Overlap suites on each adopter plus the declared-tier Changeset check                             | Old prop alone; key alone; both given; neither                                                            | Old usage changing behavior, a silent win for the old prop, a missing `DEP-*`/`CLN-*` pair, or a removal absent from the frozen minor manifest, fails.              |
| FR10, AR2 | Public-API review against this record; per-adopter accessible-name assertions                     | A proposed new search capability; each adopter's query input, named and unnamed                           | A new top-level `search*` prop admitted, or a query input whose only name is its placeholder, fails.                                                                |

Known verification gap: none of the suites above exist on `main`, and no
component implements `search`. This record is `draft`, does not govern review,
and names no implementation. AR1 additionally records a defect in current
shipped behavior rather than a passing contract.

## Decision log

Every decision below was ruled by `cixzhang` on 2026-10-02, on this record's
pull request.

### DEC-1 — One name and one type for "the query matched nothing"

**Reference:** `spec:AST-056/DEC-1`
**Decider:** `cixzhang`, `2026-10-02`

`emptySearchText`, accepting `ReactNode`, everywhere.

This is the drift that reached people. A person who searches a `Selector` and
a `Tokenizer` in the same product meets the same dead end, and today the two
components do not even agree what to call it, let alone what a caller may put
there. `Selector`, `MultiSelector` and `CommandPalette` say `emptySearchText`
and accept a `ReactNode`; `Tokenizer`, `Typeahead`, `BaseTypeahead` and
`ChatComposerInput` say `emptySearchResultsText` and accept a `string` — so
the same product cannot offer the same "no results, try X" row in both, and a
builder who learns one component has to discover the other.

The name resolves toward `emptySearchText` rather than a shorter one, and the
reason is load-bearing: `Selector` and `MultiSelector` already declare BOTH
`emptyText` and `emptySearchText`, for two genuinely different sentences —
"there is nothing here at all" and "nothing matched what you typed". Shortening
the search state's name would collide with a shipped prop meaning the other
thing, on the two components with the most search surface. So three components
rename toward the majority spelling instead of seven renaming away from it.

The type resolves toward `ReactNode`, not toward `string`. A dead end is
exactly where a product wants a link, an illustration, or a create
affordance, and narrowing the four components that already allow it would
remove a shipped capability to win consistency. Widening the other three is
what lets a product offer the same dead end everywhere, which is the whole
point of agreeing on the name.

### DEC-2 — No `search` configuration object

**Reference:** `spec:AST-056/DEC-2`
**Decider:** `cixzhang`, `2026-10-02`

An earlier draft of this record proposed collecting every search-related prop
into one object-valued `search` prop, with `placeholder`, `emptyText`,
`onChange` and `onCreate` as keys. Rejected.

The object would have solved tidiness rather than anything a person using an
Astryx product meets. Three flat props are not hard to pass, and the survey
below shows the repository has no settled convention to appeal to: every
`*Config` object in core configures a hook, and the only object-valued
component props are `collapsible` and `button`.

Against that, the cost was concrete. Nine shipped props would have entered a
deprecation cycle, four of them a **required** `searchSource`, breaking every
callsite of four components in the cleanup minor. `ComplexSelector` would
have taken a `search` object with one meaningful key, since it owns its own
content. And autocomplete gets worse, not better: typing inside a component's
tag lists flat props immediately, while `search={{` has to be known about
first.

What the drift actually called for was a shared vocabulary, which DEC-1 and
FR6 give without restructuring anything.

### DEC-3 — A query-only capability is enabled by a boolean and reported through the existing change callback

**Reference:** `spec:AST-056/DEC-3`
**Decider:** `cixzhang`, `2026-10-02`

A capability that only exists while a query does — creating a value from text
that matched nothing — is enabled by one boolean and reported through the
component's primary change callback, carrying a descriptor that says what kind
of change it was.

`Tokenizer` already does this: `hasCreate` turns the row on, and
`onChange(items, change)` reports `{item, type: 'create'}` beside `'add'`,
`'remove'` and `'reorder'`. A caller learns about a creation on the channel it
already listens to for every other change, and nothing can be half-configured,
because there is only one switch.

The shape this rules out is a boolean and a handler gating each other, which
is what `hasCreate && hasSearch && onCreate != null` produces: three ways to
be half-set, every one of them rendering nothing, reporting nothing, and
warning about nothing. A builder sets the boolean, sees no create row, and has
no way to learn why.

A component whose value does not carry the created object — `MultiSelector`
holds `options` separately from `value: string[]` — reports the next value and
the creation together, so the caller adds the option and accepts the value in
one update. That obligation is the caller's and must be stated where the
capability lands; it does not justify a second shape for the same capability.

The one case a boolean cannot prevent is enabling creation on a component
whose query input is switched off. That warns in development (FR5) rather than
rendering nothing in silence.

### DEC-4 — The vocabulary is fixed; new capabilities join it

**Reference:** `spec:AST-056/DEC-4`
**Decider:** `cixzhang`, `2026-10-02`

Every prop in the survey below was a reasonable local decision. The drift came
from each one being made alone: two names for one state, two types for one
name, `searchLabel` in lab, `maxSearchResults` on one component.

So the standard is a vocabulary rather than a structure. A new search-related
prop names its state in the words this record fixes, and does not introduce a
second name for something an existing prop already says. That is checkable in
review without anybody restructuring a component.

## Open questions

- **OQ1 — ANSWERED. Two concepts, split by who owns the choices.** (`human-api`)

  `cixzhang`, 2026-10-02: a component that holds its own choices takes the
  `search` object; a component whose choices arrive from the caller keeps
  `searchSource`. The shared matching rule and `createStaticSource` show the
  two can be unified, but unifying them would make `source` a required member
  of an otherwise-optional object on four components, and would move a shipped
  required prop for no gain to its callers. FR1 and FR4 record the split, and
  DEC-1 carries the reasoning.

- **OQ2 — ANSWERED. Deprecate with a cycle.** (`human-api`)

  `cixzhang`, 2026-10-02: `emptySearchResultsText` is marked `@deprecated`
  pointing at `emptySearchText`, both work through the overlap, and removal
  happens in a later minor under `spec:AST-017` FR28–FR31. The cost is one
  doubled prop on three components, which is
  what FR7 already describes — far less than the nine pairs the rejected
  object form would have cost. The rename is codemoddable even where a caller
  spreads props, because the value's meaning does not change and the type only
  widens.

- **OQ3 — ANSWERED. No.** (`human-api`)

  `cixzhang`, 2026-10-02: observing the query does not become public on
  `Selector` or `MultiSelector` as part of this record. `searchQuery` stays
  internal state on both. A caller who needs to act on the query gets a
  capability that names what it is for — creation, below — rather than a raw
  query feed they must then re-implement the component's own behavior around.

- **OQ4 — ANSWERED. Three adopters; the rest are governed by FR1 only.** (`human-api`)

  `cixzhang`, 2026-10-02: `Selector`, `MultiSelector` and `ComplexSelector`
  are where a `search` object would have gone, so they are the components this
  record most directly addresses; with the object rejected (DEC-2) the
  distinction mostly dissolves. `Tokenizer`, `Typeahead`, `BaseTypeahead`,
  `CommandPalette` and `ChatComposerInput` keep `searchSource` and are bound by
  FR1 (one name, one type for "the query matched nothing") and FR6 (no second
  name for a state these props already express). `PowerSearch` stays cited and
  excluded: a structured field/operator/value expression is not a typed query
  over a list.

- **OQ5 — ANSWERED. One capability, a boolean plus a change descriptor.** (`human-api`)

  `cixzhang`, 2026-10-02: a create affordance is enabled by a boolean and
  reported through the component's existing change callback, carrying a
  descriptor that says the change was a creation. No separate handler prop,
  and no `create` configuration object.

  `Tokenizer` already works this way: `onChange(items, change)` where `change`
  is `{item, type: 'create'}`, alongside `'add'`, `'remove'` and `'reorder'`.
  `MultiSelector` can report the same way — the next value together with a
  descriptor naming the created query — so the caller adds the option and
  accepts the value in one update, learning about creation on the channel it
  already listens to for every other selection change.

  This supersedes an earlier answer here that treated the two as different
  capabilities needing different shapes, on the grounds that `MultiSelector`
  splits `options` from `value: string[]` and so cannot mint an option the way
  `Tokenizer` mints a token. That difference is real but does not force a
  separate handler: reporting the value and the creation together is exactly
  what the descriptor is for. `hasCreate` therefore means one thing in both
  components, which is FR1's rule applied to a verb rather than a state.

  Two things the contract owes, to be settled where the capability lands
  rather than here: the descriptor's shape as a public type, and the caller's
  obligation to add the created option — `Tokenizer` has no such obligation
  because its value carries the object itself, while a `MultiSelector` caller
  who accepts the value without adding the option holds an id that matches
  nothing.

  `minQueryLength`, `debounceMs` and the trigger-menu `loadingText` stay where
  they are. They describe fetching, which only exists where the caller owns
  the choices, and this record does not reorganize shipped props.

## Content boundary

This record does not duplicate any component's anatomy, prop table, theming
targets, or consumer examples; the admission argument in `spec:AST-002`; the
deprecation, cleanup, and release-manifest mechanics in `spec:AST-017`; the
shared naming grammar in `architecture:public-component-api`; the field chrome
in `family:input-fields`; or the matching, debouncing, and cancellation
behavior each component's own record owns. It links their canonical owners.
