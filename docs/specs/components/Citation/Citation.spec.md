---
schema_version: 3
template_version: 7
kind: component
id: component:Citation
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, theming, accessibility, visual]
verified_by:
  [
    packages/core/src/Citation/Citation.test.tsx,
    packages/core/src/utils/safeUrl.test.ts,
    apps/storybook/stories/Citation.stories.tsx,
    apps/storybook/rtl-audit/verified-not-applicable.json,
    packages/core/src/theme/themingTargets.test.ts,
    .github/visual-baseline/manifest.json,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:navigation-destinations]
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:component-theming-surface,
    architecture:component-test-sufficiency,
    architecture:interaction-modality,
  ]
contributing: []
system_specs: [spec:AST-005]
---

# Citation component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `Citation` is exported from `@astryxdesign/core/Citation`; `source` and `number` are required, and `variant` defaults to `label`.                                                                                                                                                                                                                               |
| Behavior                | An accepted source URL renders a native anchor in a new tab. A missing or rejected URL renders the same citation content in an inert span. Label and number variants preserve that navigation decision.                                                                                                                                                         |
| End-user impact         | Readers receive a consistent citation label or numbered reference without a blocked destination becoming navigation or a decorative source icon being announced twice.                                                                                                                                                                                          |
| Builder impact          | A builder's explicit `role` or `aria-label` is meant to reach the root; today the component's role and translated name replace them (FR5 gap).                                                                                                                                                                                                                  |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes. One implementation gap is listed under Current-state impact.                                                                                                                                                                                                                         |
| Review checks           | Reject a blocked URL that becomes navigation, an accepted URL that loses native anchor affordances, an interactive or reference role that Citation adds to an inert citation, a missing inert accessible name when the caller supplies none, an announced decorative icon, dropped passthrough or ref behavior, or a new public theme target without authority. |
| Governing rules         | `family:navigation-destinations/FR1,FR3–FR5,FR7–FR8`; `architecture:public-component-api/INV1,INV5,INV6,INV8,INV9`; `architecture:component-theming-surface/INV3–INV6`; `architecture:component-test-sufficiency/INV1–INV7,INV10–INV11`.                                                                                                                        |

This table is a review projection; the body below is authoritative.

## Intent

Present an inline reference to a source as a readable label or compact number while applying the shared navigation decision before any destination reaches the native anchor.

## Compatibility and migration

- Released default preserved: `yes` — `variant="label"`.
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  target, or styling output changes.
- Controlled/uncontrolled behavior: not applicable; Citation owns no state.
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Caller `role` and `aria-label` replaced (FR5).** Caller props spread
  before the component's `role` and `aria-label`, so a caller's explicit
  values never reach the root, where `architecture:public-component-api` INV5
  lets a caller's explicit input reach the element. The root-contract test
  pins the replacement today.

## Ownership boundary

**Owns**

- Label and number presentation, accepted-link versus inert-span rendering, accessible citation naming, decorative icon treatment, and the `citation` root target.
- Supported neutral DOM and styling passthrough, including a ref to the rendered anchor or span.

**Does not own / non-goals**

- Which navigation schemes are accepted or blocked — owned by `family:navigation-destinations` and `spec:AST-005`.
- A general image or resource URL policy — source images remain outside the navigation-destination contract.
- The semantics or accessibility of a caller-supplied icon node outside Citation’s decorative wrapper.
- Citation ordering, bibliography management, content provenance, or surrounding prose — owned by the product callsite.

## Public concepts

| Concept     | Closed values or states                 | Meaning                                                                                                                                                | Availability        | Default                             | Owner                            | Stability                      | Invalid-value behavior               |
| ----------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- | ----------------------------------- | -------------------------------- | ------------------------------ | ------------------------------------ |
| variant     | `label`, `number`                       | Selects visible source-title or numbered-reference presentation.                                                                                       | Every render.       | `label`                             | `component:Citation`             | stable                         | rejected by the public type          |
| destination | accepted, missing, rejected             | Selects native-anchor or inert-span root after the shared navigation decision.                                                                         | Every variant.      | missing when `source.url` is absent | `family:navigation-destinations` | current family contract        | rejected destinations render inertly |
| source icon | node, `src`, legacy string icon, absent | Supplies optional decorative source paint in the label variant. A non-string node wins over `src`; otherwise `src` wins over a legacy string icon URL. | Label variant only. | absent                              | `component:Citation`             | shipped compatibility behavior | ordinary React rendering behavior    |
| number      | numeric value                           | Supplies the citation index and participates in the translated accessible name.                                                                        | Every variant.      | required                            | `component:Citation`             | stable                         | rejected by the public type          |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Basis                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| FR1 | An accepted `source.url` renders a native anchor with the unchanged destination, `target="_blank"`, `rel="noopener noreferrer"`, `role="doc-noteref"` unless a caller supplies an explicit `role`, and the translated accessible name unless a caller supplies an explicit `aria-label` (FR5); its `title` is the source title, or the number when there is none.                                                                                                     | shipped source and tests; `family:navigation-destinations/FR1,FR3–FR5`                    |
| FR2 | A missing or rejected destination renders the selected citation presentation in a noninteractive span; Citation adds no navigation or reference role to it. Unless a caller supplies an explicit `role`, the span uses a supported naming role, so its translated label, or a caller's `aria-label`, reaches assistive technology (FR5). Rejection derives no navigation attributes from `source.url`, invents no disabled semantics, and does not hide the citation. | shipped source and tests; `family:navigation-destinations/FR4,FR7`; WAI-ARIA naming rules |
| FR3 | The label variant presents the source title, an optional decorative source icon, and truncation; the number variant presents the supplied number as the compact visible reference.                                                                                                                                                                                                                                                                                    | shipped source, docs, tests, and stories                                                  |
| FR4 | A node icon takes precedence over `src`, and `src` over a legacy string `icon`. Every icon path remains decorative inside an `aria-hidden` wrapper.                                                                                                                                                                                                                                                                                                                   | shipped compatibility behavior and tests                                                  |
| FR5 | Both root branches preserve supported DOM props, `className`, `style`, `xstyle`, `data-*` attributes, and the declared `HTMLElement` ref, and a caller's explicit `role` or `aria-label` reaches the root (`architecture:public-component-api` INV5). Implementation gap: the component's role and translated name replace a caller's values (Current-state impact).                                                                                                  | `architecture:public-component-api/INV5,INV6,INV8`; regression tests                      |
| FR6 | Citation keeps one public `citation` target on the painted root, reflecting `variant`, and exposes no internal icon or text target without an approved theming-contract change.                                                                                                                                                                                                                                                                                       | shipped docs/source; `architecture:component-theming-surface/INV3–INV6`                   |
| FR7 | Component-owned accessible text comes from the translation catalog; visible source text and numeric content remain caller-supplied data.                                                                                                                                                                                                                                                                                                                              | shipped source and i18n infrastructure                                                    |

### Allowed variation

- **AV1 — Theme paint.** The `citation` root target may change supported visual paint without changing variant, destination, role, or accessible-name behavior.
- **AV2 — Caller content.** Source titles, numeric values, image URLs, and node icons may vary within the released public types.
- **AV3 — Native destination behavior.** Accepted relative, fragment, protocol-relative, HTTP(S), mailto, tel, and safe custom destinations retain native browser handling and the component’s existing new-tab relationship.

### Representative states

| State                   | Required invariant                                                                                                                                            | Allowed variation                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| linked label            | Native anchor, source title, optional decorative icon, translated accessible name absent a caller `aria-label`.                                               | Source content and root theme paint.  |
| linked number           | Native anchor, numeric visible reference, translated accessible name absent a caller `aria-label`.                                                            | Number and root theme paint.          |
| missing or rejected URL | Inert span with the same selected presentation; absent a caller `role`, a supported naming role; Citation adds no navigation or reference role or attributes. | Source content and root theme paint.  |
| node or image icon      | Icon remains decorative and appears only in the label variant.                                                                                                | Caller-owned artwork or source image. |

### Transformation and precedence order

- **ORD1 — Destination.** `source.url` → shared safe-URL decision → native anchor or inert span.
- **ORD2 — Icon.** Non-string `source.icon` → `source.src` → legacy string `source.icon` → no icon.
- **ORD3 — Root props.** Caller passthrough → component-owned test id and navigation attributes, and the component's role and name unless the caller supplies its own (FR5; today the component's replace the caller's, the FR5 gap) → theme and style composition.

### Performance and resources

- **PR1 — Pure render.** Citation owns no state, Effect, listener, observer, timer, or external resource lifecycle.
- **PR2 — Images.** Citation may emit one caller-supplied source image; fetching, validation, and resource policy are not decided by the navigation contract.

## Accessibility contract

- **AR1 — Linked reference.** An accepted destination exposes one native link with `doc-noteref` absent a caller `role`, and the translated `Citation {number}: {title}` accessible name absent a caller `aria-label` (FR5).
- **AR2 — Inert reference.** For a missing or rejected destination, Citation adds no interactive or navigation role or attributes; a caller's explicit `role` reaches the span (FR5). Absent a caller `role` (FR5), the inert span uses `role="group"` so its translated citation label remains an accessible name, including when the visible number has no source text.
- **AR3 — Decorative source mark.** Source image and node icon paint remains hidden from the accessibility tree so it does not duplicate the citation name.
- **AR4 — Focus ownership.** The native anchor remains the semantic focus owner. Citation adds no focus owner to the inert span.

## Design relationships

| Anatomy or state | Design requirement                                                                 | Representation authority                        | Hierarchy role           | Component contract |
| ---------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------ | ------------------ |
| Root             | Paints the label chip or numbered badge and owns the `citation` target.            | observed shipped representation and public docs | supporting reference     | FR1–FR3, FR5–FR6   |
| Source icon      | Presents optional caller-supplied source identity without accessibility semantics. | observed shipped representation                 | decorative               | FR3–FR4, AR3       |
| Label or number  | Presents the source title or compact index.                                        | observed shipped representation                 | primary citation content | FR3, FR7           |

Citation exposes only the documented `citation` root target. Internal icon and text parts have no public target.

## Family and system relationships

- `family:navigation-destinations` owns the accept/block result for `source.url`, including native-anchor sinks and preservation of accepted browser behavior.
- `spec:AST-005` owns the normalized blocked-scheme rule that the family projects onto Citation.
- `architecture:public-component-api` owns export stability, passthrough, styling composition, ref reachability, and component-owned prop precedence.
- `architecture:component-theming-surface` owns public target qualification and placement.
- `architecture:component-test-sufficiency` owns mutation-sensitive evidence for each critical branch and public promise.
- `architecture:interaction-modality` owns shared modality behavior while Citation’s native anchor remains its own semantic focus owner.

## Verification map

| Contract         | Verification                                                            | Representative states                                                        | Mutation or failure expectation                                                                                                                                                                                                   | Audit section               |
| ---------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| FR1–FR2, AR1–AR2 | `Citation.test.tsx` destination suites and `safeUrl.test.ts` matrix     | accepted, missing, blocked schemes, normalized blocked text                  | A blocked URL creates navigation, an accepted URL loses its destination or native affordances, or an inert reference loses its supported naming role when the caller supplies no `role`.                                          | `audit:Citation/navigation` |
| FR3–FR4, AR3     | `Citation.test.tsx` variant and icon suites                             | label, number, no icon, node icon, `src`, legacy string icon                 | The wrong visible variant renders, icon precedence changes, or decorative source paint reaches the accessibility tree. Gap: no test covers the label's truncation. Gap: no test covers `src` winning over a legacy string `icon`. | `audit:Citation/behavior`   |
| FR5              | `Citation.test.tsx` root-contract suite and strict type/lint validation | anchor and span roots with ref, DOM props, class, inline style, and `xstyle` | Either root drops supported passthrough or ref behavior. Gap: the root-contract test asserts that the component's role and name replace a caller's `role` and `aria-label`, which pins the FR5 gap.                               | `audit:Citation/api`        |
| FR6              | `Citation.test.tsx` class-name tests; `themingTargets.test.ts`          | linked and inert roots; both variants                                        | The root target disappearing from the class-name tests fails. `themingTargets.test.ts` catches only a renamed or undocumented target. Gap: no test asserts the `variant` reflection on the target.                                | `audit:Citation/theming`    |
| FR7              | `Citation.test.tsx` accessible-name assertions                          | linked label and number                                                      | A name that loses the source or number context fails. Gap: no test runs a non-English catalog, so text that bypasses translation passes.                                                                                          | `audit:Citation/i18n`       |
| RTL N/A          | `verified-not-applicable.json` source-hashed record                     | label and number stories; linked/inert source paths; icon/no-icon            | A direction-sensitive glyph, physical inline placement, ordering, scrolling, overlay, or horizontal keyboard behavior appears without RTL evidence.                                                                               | `audit:Citation/rtl`        |
| All              | `Citation.stories.tsx`; stable visual baseline `core-citation--label`   | Documented variants and source states                                        | A changed label citation comes back changed for review.                                                                                                                                                                           | `audit:Citation/testing`    |
| AR4, PR1, PR2    | Source review                                                           | Linked and inert roots; image icon                                           | Gap: no automated check fails if Citation adds a focus owner to the inert span, state, an effect, or a listener, or emits more than one source image.                                                                             | `audit:Citation/behavior`   |

## Decision log

### DEC-1 — Inert references use a noninteractive naming role

**Reference:** `component:Citation/DEC-1`
**Decider:** `cixzhang`, `2026-10-01`

The existing inert span uses `role="group"` so its translated `aria-label` is valid without creating navigation, focus, or a visual/DOM child. A roleless generic span cannot be named; `group` is a noninteractive, name-supporting role and is the smallest restoration that preserves the current root and presentation.

Reconsider this mechanism if a supported platform primitive can name inert inline content without group-boundary announcements, or evidence shows the group semantics harm citation reading at volume.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit results, implementation steps, navigation-system rationale, or resource policy. It links to their owners.
