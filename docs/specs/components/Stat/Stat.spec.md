---
schema_version: 3
template_version: 7
kind: component
id: component:Stat
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [josephfarina]
review_triggers: [public-api, behavior, theming, accessibility]
verified_by:
  [
    packages/core/src/Stat/Stat.test.tsx,
    packages/lab/src/Stat/Stat.test.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:component-theming-surface,
    architecture:react-component-runtime,
  ]
contributing: []
system_specs: [spec:AST-017]
---

# Stat component contract

<!-- path-applicability:v1 -->

```json
{
  "paths": ["packages/lab/src/Stat/index.ts"]
}
```

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `Stat` from `@astryxdesign/core` and `@astryxdesign/core/Stat` with `label`, `value`, `delta` (`value`, `direction`, `sentiment`), `description`, `media`, `size` (`md`), a `ref` to the root, and BaseProps. The Lab export re-exports it. |
| Behavior                | A column of label, value, optional delta, optional description and optional media. The delta's tone follows its direction unless `sentiment` sets it, and a screen reader hears the direction as translated words after the change text.    |
| End-user impact         | People see a metric, its change and its trend; screen-reader users hear the direction, not only its color and glyph.                                                                                                                        |
| Builder impact          | Callers pass pre-formatted strings for `value` and `delta.value`, and set `sentiment` for metrics where a drop is good. Lab callers change the import and rename `sentiment`'s `positive` and `negative` to `success` and `error`.          |
| Compatibility/readiness | Additive Core export; Lab's `Stat` re-exports it, so Lab callers rename `sentiment` values `positive` and `negative` to `success` and `error`. Authority: draft.                                                                            |
| Review checks           | Reject a delta whose direction is carried by color alone, an untranslated trend word, a public data attribute on the delta, an empty media wrapper for a non-renderable `media`, or a prop beyond those FR1 lists.                          |
| Governing rules         | `architecture:public-component-api` DEC-2; `architecture:component-theming-surface` INV1, INV3; `architecture:react-component-runtime` INV16; `spec:AST-017` (lifecycle).                                                                   |

This table is a review projection; the body below is authoritative.

## Intent

Stat is the KPI tile of dashboards and summary rows: a metric's name, its
value, its change and a place for a trend. It owns the layout of those parts,
the tone of the change and the words that carry the change's direction to
assistive technology. Consumer usage lives in `Stat.doc.mjs`.

## Compatibility and migration

- Released default preserved: yes for defaults and looks, which match the
  canary-only Lab component's; a non-renderable `media` leaves no gap, and
  `sentiment` takes `success` and `error` where Lab took `positive` and
  `negative` (DEC-1)
- Compatibility class: additive Core export; Lab's `Stat` and its types
  re-export the Core ones
- Controlled/uncontrolled behavior: none; Stat holds no state
- Migration decision: Lab callers change the import to `@astryxdesign/core`
  and rename the two `sentiment` values (DEC-1)

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The order and spacing of the label, value, delta, description and media
  (FR2).
- The delta's glyph, tone and screen-reader words (FR3, AR1).

**Does not own / non-goals**

- Number formatting — the caller passes formatted strings.
- Charts — the caller puts a sparkline or mini chart in `media`.
- The card or grid around a tile — `component:Card`, `Grid`.

## Public concepts

| Concept   | Closed values or states       | Meaning                                  | Availability by variant/orientation/state | Default                  | Owner            | Stability | Invalid-value behavior           |
| --------- | ----------------------------- | ---------------------------------------- | ----------------------------------------- | ------------------------ | ---------------- | --------- | -------------------------------- |
| Size      | `sm`, `md`, `lg`              | The value's font size.                   | Every Stat.                               | `md`                     | `component:Stat` | Stable    | TypeScript rejects other values. |
| Direction | `up`, `down`, `flat`          | The change's glyph and default tone.     | A Stat with `delta`.                      | None; required in delta. | `component:Stat` | Stable    | TypeScript rejects other values. |
| Sentiment | `success`, `error`, `neutral` | The change's tone, over the direction's. | A Stat with `delta`.                      | From the direction.      | `component:Stat` | Stable    | TypeScript rejects other values. |

## Behavioral and layout contract

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                   | Basis                                                          | Draft review state |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------ |
| FR1 | Stat takes `label`, `value`, `delta`, `description`, `media`, `size` and BaseProps, and forwards `ref` to its root element.                                                                                                                                                                                                                           | Current behavior (the Lab component's API)                     | human decision     |
| FR2 | Stat renders its root column with the `stat` theming target and `data-size`, then the label, then a row of the value and the delta, then the description when it is renderable, then the media when `media` is renderable (`isRenderable`).                                                                                                           | Current behavior; `architecture:react-component-runtime` INV16 | settled            |
| FR3 | The delta's tone is `sentiment` when set, else up is `success` (success text), down is `error` (error text) and flat is `neutral` (secondary text). The values are Core's tone words, as Badge's `variant` takes them; Banner's `status` shares `success` and `error` (DEC-1). The tone comes from styles alone; the delta carries no data attribute. | Current behavior; `architecture:public-component-api` DEC-2    | human decision     |

### Allowed variation

- **AV1 — Glyph artwork.** The direction glyphs may change shape if up, down
  and flat stay distinct.

- **AV2 — Glyph direction.** The trend arrows are physical: they point toward
  the right in every writing direction, as a chart in `media` does.

### Representative states

| State                | Required invariant                                   | Allowed variation      |
| -------------------- | ---------------------------------------------------- | ---------------------- |
| Label and value only | No delta, description or media element renders.      | Spacing per theme.     |
| Inverted metric      | `sentiment` sets the tone; the words keep direction. | Tone colors per theme. |

### Transformation and precedence order

- **ORD1 — Tone.** `sentiment`, when set, wins over the direction's default
  tone.

### Performance and resources

- **PR1 — No effects.** Stat renders with no state, effect, listener or
  observer.

## Accessibility contract

- **AR1 — Direction in words.** After the change text, Stat renders the
  translated `@astryx.stat.delta.up`, `.down` or `.flat` words in
  `VisuallyHidden`, so the direction never rests on the glyph (hidden from
  assistive technology) or the color alone.

## Design relationships

| Anatomy or state | Design requirement | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------ | ------------------------ | -------------- | ------------------ |
| Value            | None               | unsettled                | prominent      | FR2                |
| Delta            | None               | unsettled                | supporting     | FR3, AR1           |

The component implements design requirements without copying their rationale.
An `unsettled` representation remains a human decision; principles do not let an
agent invent the answer.

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Tile": {"target": "stat"},
  "Label": {
    "none": {
      "reason": "unsettled: the label paints but has no public theming target of its own; adding one is a future owner decision"
    }
  },
  "Value": {
    "none": {
      "reason": "unsettled: the value paints but has no public theming target of its own; adding one is a future owner decision"
    }
  },
  "Delta": {
    "none": {
      "reason": "unsettled: the delta paints but has no public theming target of its own; adding one is a future owner decision"
    }
  },
  "Description": {
    "none": {
      "reason": "unsettled: the description paints but has no public theming target of its own; adding one is a future owner decision"
    }
  },
  "Media": {
    "none": {
      "reason": "intentional: the media is caller content that Stat only places"
    }
  }
}
```

## Family and system relationships

- `spec:AST-017` owns the component lifecycle; Stat is a Core component, and
  Lab's export re-exports it.

## Verification map

| Contract            | Verification                           | Representative states                        | Mutation or failure expectation                                                     | Audit section        |
| ------------------- | -------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------- |
| FR1                 | `packages/core/src/Stat/Stat.test.tsx` | Label, value, ref, BaseProps                 | Dropping the ref or a part fails the render tests.                                  | `audit:Stat/api`     |
| FR2                 | `packages/core/src/Stat/Stat.test.tsx` | `false`, `true`, `''`, `null` media; size    | A `!= null` media check fails the non-renderable media cases.                       | `audit:Stat/layout`  |
| FR3                 | `packages/core/src/Stat/Stat.test.tsx` | Each direction; `sentiment` override         | A changed direction-to-tone map, or a data attribute on the delta, fails the tests. | `audit:Stat/tone`    |
| AR1                 | `packages/core/src/Stat/Stat.test.tsx` | Catalog overrides for each direction         | A hard-coded word fails the catalog test.                                           | `audit:Stat/a11y`    |
| Lab re-export       | `packages/lab/src/Stat/Stat.test.tsx`  | Lab `Stat`                                   | A second implementation in Lab fails the identity test.                             | `audit:Stat/lab`     |
| Theming anatomy map | `scripts/check-knowledge.mjs`          | The six anatomy parts and their dispositions | A missing, extra or stale mapping fails repository validation.                      | `audit:Stat/theming` |

## Decision log

### DEC-1 — The delta's tone uses Core's tone words

**Reference:** `component:Stat/DEC-1`
**Decider:** `josephfarina`, `2026-11-20`

`sentiment` takes `success`, `error` and `neutral`, the tone words Badge's
`variant` takes (Banner's `status` shares `success` and `error`), so a builder
who knows those components knows the values here.
The prop keeps its own name, because Badge (`variant`) and Banner (`status`)
share no name for it.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
