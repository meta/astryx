---
schema_version: 3
template_version: 7
kind: component
id: component:CommandPaletteEmpty
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior, theming, accessibility, testing]
verified_by:
  [
    packages/core/src/CommandPalette/CommandPaletteEmpty.test.tsx,
    packages/core/src/CommandPalette/CommandPalette.test.tsx,
    packages/core/src/CommandPalette/CommandPaletteList.test.tsx,
    packages/core/src/CommandPalette/__tests__/CommandPaletteEmptyAudit.a11y.chromium.spec.ts,
    packages/core/src/theme/themingTargets.test.ts,
    apps/storybook/stories/CommandPaletteEmpty.stories.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:component-theming-surface,
    architecture:component-test-sufficiency,
  ]
contributing: []
system_specs: [spec:AST-029, spec:AST-056]
---

# CommandPaletteEmpty component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `CommandPaletteEmpty` / `CommandPaletteEmptyProps`: required `children`, `BaseProps<HTMLDivElement>`, and a root `ref`.                                                                         |
| Behavior                | One ordinary container centers caller content as supporting text. CommandPalette renders it for the no-query and no-results branches; it owns no role, state, announcement, or interaction.     |
| End-user impact         | People who reach a palette dead end read the message, and any caller link stays ordinary reachable content rather than an option.                                                               |
| Builder impact          | None. Caller content, host attributes, and styling inputs compose on the root.                                                                                                                  |
| Compatibility/readiness | Observational patch contract. Runtime behavior, exports, and the target name are unchanged; authority stays `draft` until exact-head owner approval.                                            |
| Review checks           | Reject a component-owned role or live region, option semantics around caller content, dropped root inputs, a target moved off the painted root, or content that overflows its host inline axis. |
| Governing rules         | `architecture:public-component-api/INV1,INV5–INV8`; `architecture:component-theming-surface/INV2–INV6`; `spec:AST-056/FR3`, `AR1` for the parent's announcement; WCAG 2.2 SC 1.4.3 and 1.4.10.  |

This table is a review projection; the body below is authoritative.

## Intent

CommandPaletteEmpty presents the message shown in a CommandPalette result area
when there is nothing to choose. It owns the empty-message surface: its layout,
supporting typography, secondary text color, root input composition, and the
`command-palette-empty` theme target. CommandPalette decides when the message
appears, what it says by default, and whether it is announced.

Consumer syntax and examples belong in `CommandPaletteEmpty.doc.mjs`.

## Compatibility and migration

- Released default preserved: yes — one centered, ordinary message container.
- Compatibility class: observational patch; no public surface changes.
- Controlled/uncontrolled behavior: not applicable.
- Migration decision: none.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- One root container and its public ref, DOM/data/ARIA, class, style, event, and
  `xstyle` composition.
- Centered layout, block and inline padding, supporting type size and leading,
  body font family, and secondary text color for caller content.
- Wrapping caller text inside the host's inline size.
- The `command-palette-empty` target on the same painted root.

**Does not own / non-goals**

- When the empty branch appears, the built-in catalog messages, and the
  empty-search announcement — owned by `component:CommandPalette`.
- Result-surface semantics while empty, including dropping listbox semantics —
  owned by `component:CommandPalette` and `component:CommandPaletteList`.
- The meaning, links, or controls inside caller content — owned by the product
  callsite.

## Public concepts

| Concept       | Closed values or states                       | Meaning                                                             | Availability by variant/orientation/state                        | Default  | Owner                | Stability | Invalid-value behavior                                  |
| ------------- | --------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- | -------- | -------------------- | --------- | ------------------------------------------------------- |
| Empty message | caller `ReactNode`: text or elements          | The supporting message people read when there is nothing to choose. | No-query and no-results palette branches; standalone composition | required | component            | stable    | Rendered as given; React decides non-renderable values. |
| Root surface  | ref; DOM/data/ARIA; class/style/xstyle/events | Extends the message root.                                           | Every render                                                     | omitted  | public component API | stable    | Accepted inputs compose; the component adds no role.    |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision.

| ID  | Candidate invariant                                                                                                                                                                 | Basis                                                                          | Draft review state |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------ |
| FR1 | The component MUST render its children inside one container element that centers them on both axes with centered text, supporting type, body font family, and secondary text color. | Current source, consumer docs, and focused tests                               | verify             |
| FR2 | CommandPalette MUST render this component with `emptyBootstrapText` when there is no query and no result, and with `emptySearchText` when a query has no result.                    | Current CommandPalette source and tests                                        | verify             |
| FR3 | The root MUST carry no component-owned role, live region, or focus stop, so caller links and controls remain ordinary content.                                                      | WAI-ARIA 1.2 listbox owned-children rule; current source and Chromium evidence | verify             |
| FR4 | Caller text MUST wrap inside the host's inline size, including a single unbroken token, so no message forces inline scrolling or clipping at 320 CSS px.                            | WCAG 2.2 SC 1.4.10; Chromium evidence                                          | verify             |
| FR5 | The painted root MUST carry the `command-palette-empty` target; component styles apply before caller `xstyle`.                                                                      | `architecture:component-theming-surface/INV2–INV6`; source and focused tests   | verify             |
| FR6 | Accepted ref, DOM/data/ARIA, class, style, events, and `xstyle` MUST reach or compose on the root.                                                                                  | `architecture:public-component-api/INV5–INV8`; focused tests                   | verify             |

### Allowed variation

- **AV1 — Theme paint.** The target may restyle the message surface and text
  without changing semantics or layout ownership.
- **AV2 — Caller content.** Text length, translation, inline elements, and links
  may vary while the root stays one ordinary container.

### Representative states

| State                  | Required invariant                                                            | Allowed variation                             |
| ---------------------- | ----------------------------------------------------------------------------- | --------------------------------------------- |
| Palette no-query empty | The bootstrap message renders in the result area; no listbox is exposed.      | Built-in catalog text or caller content.      |
| Palette no-result      | The search message renders; CommandPalette announces the rendered text.       | Built-in catalog text or caller rich content. |
| Standalone             | The same root renders outside a palette with caller content.                  | Host layout and caller roles.                 |
| Long or translated     | Text wraps inside the host; no inline overflow.                               | Line count grows.                             |
| RTL                    | Centered layout and text remain direction-neutral; inline text order mirrors. | Caller content direction.                     |
| Narrow viewport        | The message wraps within a 320 CSS px host.                                   | Line count grows.                             |

### Transformation and precedence order

- **ORD1 — Root composition.** Apply the target class, component styles, then
  caller `xstyle`; append caller `className`; apply caller `style`; spread
  remaining host props onto the root.

### Performance and resources

- **PR1 — No lifecycle.** CommandPaletteEmpty uses no hook, listener, observer,
  timer, request, state, or Effect.

## Accessibility contract

- **AR1 — Ordinary content.** The root exposes caller content in reading order
  with no added role; a caller link keeps its own role and focus behavior.
- **AR2 — Readable message.** Message text meets the WCAG 2.2 SC 1.4.3 contrast
  minimum against its rendered surface in every supported theme and mode.

## Design relationships

| Anatomy or state | Design requirement                                                        | Representation authority                                          | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------- | ------------------ |
| Empty message    | Presents the dead-end message as supporting text centered in the results. | Current source tokens; no component-local visual decision settled | supporting     | FR1, FR4, FR5      |

No component-local visual decision is settled by this draft.

## Family and system relationships

- `architecture:public-component-api` owns exports and root input composition.
- `architecture:component-theming-surface` owns target placement.
- `architecture:component-test-sufficiency` owns proportionate, observable
  evidence.
- `spec:AST-056/FR3` and `AR1` require CommandPalette to announce the
  empty-search message it rendered; this component supplies the rendered node.
- CommandPalette and CommandPaletteList draft records describe the parent
  branches and empty result surface; they are observational context, not
  authority for this contract.
- `spec:AST-029` keeps this observational draft separate from the audit receipt.

## Verification map

| Contract      | Verification                                                                           | Representative states                              | Mutation or failure expectation                                                                         | Audit section                        |
| ------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| FR1, FR5–FR6  | `CommandPaletteEmpty.test.tsx`; `themingTargets.test.ts`                               | text and element children; root inputs             | A dropped input, a moved target, or lost children fails the focused assertions.                         | `audit:CommandPaletteEmpty/§2,§3,§4` |
| FR2, FR3, AR1 | `CommandPalette.test.tsx`; `CommandPaletteList.test.tsx`; exact-head Chromium receipts | bootstrap, search, rich content, modal and inline  | Exposing a listbox, adding a role, or announcing other text than the rendered message fails assertions. | `audit:CommandPaletteEmpty/§1,§4`    |
| FR4, AR2      | Exact-head Chromium receipts and contrast pairs                                        | long and translated text; 320 px; themes and modes | Inline overflow or clipping fails the reflow sensor; ratios are recorded per frame.                     | `audit:CommandPaletteEmpty/§5,§10`   |
| PR1           | Source review and the presentational lint rule                                         | every state                                        | A hook or lifecycle mechanism fails the lint rule.                                                      | `audit:CommandPaletteEmpty/§7`       |

## Decision log

None. This draft records current facts and introduces no product decision.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit scores,
screenshot matrices, implementation steps, or system rules. The audit pull request
owns the closed run evidence required by `spec:AST-029/FR5`.
