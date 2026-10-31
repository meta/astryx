---
schema_version: 3
template_version: 7
kind: component
id: component:ChatSystemMessage
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility, testing]
verified_by:
  [
    packages/core/src/Chat/ChatSystemMessage.test.tsx,
    packages/core/src/Chat/__tests__/ChatSystemMessage.a11y.chromium.spec.ts,
    packages/core/src/theme/themingTargets.test.ts,
    apps/storybook/stories/ChatSystemMessageAudit.stories.tsx,
    apps/storybook/rtl-audit/verified-not-applicable.json,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:component-theming-surface,
    architecture:component-test-sufficiency,
    architecture:react-component-runtime,
    architecture:theme-tokens,
    architecture:knowledge-contracts,
  ]
contributing: []
system_specs: [spec:AST-029, spec:AST-086]
---

# ChatSystemMessage component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `ChatSystemMessage` with required `children`, `variant` (`default`, `divider`; default `default`), optional `icon`, `ref`, `xstyle`, `className`, `style`, and root DOM props.      |
| Behavior                | `default` renders a centered row of optional icon content and the children, wrapping long text. `divider` renders the children as a labelled horizontal Divider and ignores `icon`. |
| End-user impact         | Readers can tell system notices apart from sender messages and see labelled date or section breaks; a notice added to a chat log is announced once, by the log.                     |
| Builder impact          | None.                                                                                                                                                                               |
| Compatibility/readiness | Records shipped behavior; no public change. No implementation gap; one owner question stays open.                                                                                   |
| Review checks           | Reject a live role on the row, a lost separator or its name, dropped root inputs, or a change that settles the divider-icon question without its owner.                             |
| Governing rules         | `spec:AST-086` FR4; `component:Divider`; `architecture:public-component-api`; `architecture:component-theming-surface`; `architecture:theme-tokens`.                                |

This table is a review projection; the body below is authoritative.

## Intent

ChatSystemMessage presents short non-sender content in a chat transcript, such
as "conversation started" or a date break. It keeps system notices apart from
sender messages and hands labelled separators to Divider. Consumer usage lives
in `ChatSystemMessage.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: not applicable; the component owns no state
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The root row, its `chat-system-message` target, and choosing between the
  centered row and the Divider composition (FR1, FR2, FR5).
- Wrapping long default-variant content and keeping icon content from
  shrinking (FR1).
- Root ref, DOM props, and styling (FR4).

**Does not own / non-goals**

- Announcing the notice — a chat log announces content added inside it
  (`spec:AST-086` FR4).
- The separator's rule, label placement, role, name, and label partitions —
  owned by `component:Divider`.
- Sender identity, transcript order, and scrolling.
- The meaning of caller content and icon artwork.

## Public concepts

| Concept      | Closed values or states | Meaning                                                   | Availability by variant/orientation/state          | Default   | Owner                         | Stability | Invalid-value behavior           |
| ------------ | ----------------------- | --------------------------------------------------------- | -------------------------------------------------- | --------- | ----------------------------- | --------- | -------------------------------- |
| Presentation | `default`, `divider`    | A centered notice row or a labelled horizontal separator. | Every render.                                      | `default` | `component:ChatSystemMessage` | Stable    | TypeScript rejects other values. |
| Icon         | omitted; a React node   | Optional artwork before the notice.                       | Rendered by `default`; ignored by `divider` (OQ1). | omitted   | `component:ChatSystemMessage` | Stable    | Not applicable.                  |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                   | Basis                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | `default` renders a centered row with `icon`, when given, before the children; the children wrap within the available inline space, the icon does not shrink, and no divider rule is drawn. | Current source and tests |
| FR2 | `divider` renders the children as the label of a horizontal `component:Divider` inside the root, so the separator is named by its label; `icon` is not rendered (OQ1).                      | Current source and tests |
| FR3 | The root carries no live role of its own in either variant; a chat log announces a notice added inside it (`spec:AST-086` FR4).                                                             | `spec:AST-086`; tests    |
| FR4 | `ref`, DOM, data, and ARIA props, including a caller `role`, `className`, `style`, and `xstyle` reach the root in both variants.                                                            | Current source and tests |
| FR5 | The root carries the `chat-system-message` target and reflects `variant`.                                                                                                                   | Current source and tests |

### Allowed variation

- **AV1 — Content.** Text and other React content vary; Divider owns how empty
  and numeric labels render in the `divider` variant.
- **AV2 — Theme.** Semantic color, spacing, and typography tokens resolve per
  theme.

### Representative states

| State                 | Required invariant                            | Allowed variation |
| --------------------- | --------------------------------------------- | ----------------- |
| Default               | Centered notice; no rule; no live role.       | Content.          |
| Default with icon     | Icon before the content.                      | Artwork.          |
| Default, long content | Content wraps with no horizontal overflow.    | Locale.           |
| Divider               | A separator named by its label; no live role. | Label.            |
| Divider with icon     | The icon is not rendered (OQ1).               | —                 |

### Transformation and precedence order

- **ORD1 — Variant.** `divider` selects the Divider composition; otherwise the
  centered row renders.

### Performance and resources

- **PR1 — Render only.** The component adds no state, Effect, observer,
  listener, or timer.

## Accessibility contract

- **AR1 — No live role.** The notice is ordinary transcript content; the
  enclosing log announces it (FR3).
- **AR2 — Separator.** The `divider` variant exposes a separator named by its
  label through Divider (FR2).
- **AR3 — Noninteractive.** The component adds no focus target, keyboard
  command, or pointer action.

## Design relationships

| Anatomy or state | Design requirement                               | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------ | ------------------------ | -------------- | ------------------ |
| System message   | A centered, concise non-sender row.              | Current source and docs  | Supporting     | FR1, FR5           |
| Icon             | Optional artwork before the notice.              | Current source and docs  | Supporting     | FR1                |
| Divider          | A labelled separator for date or section breaks. | `component:Divider`      | Supporting     | FR2                |

No anatomy-theming map is recorded yet; the block is optional during
migration, so the map is deferred.

## Family and system relationships

- `component:Divider` owns the separator's structure, role, name, paint, and
  label partitions.
- `spec:AST-086` FR4 assigns announcement of content added inside a live
  container to that container.
- `architecture:public-component-api` owns root passthrough and styling
  composition; `architecture:theme-tokens` owns the token vocabulary.
- `spec:AST-029` owns the audit evidence inventory this record's verification
  map follows.

## Verification map

| Contract | Verification                                                                                     | Representative states                       | Mutation or failure expectation                          | Audit section                           |
| -------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------- | -------------------------------------------------------- | --------------------------------------- |
| FR1      | `ChatSystemMessage.test.tsx` children, no-divider, and icon tests                                | default; default with icon                  | Missing content or icon, or a drawn rule, fails.         | `audit:ChatSystemMessage/behavior`      |
| FR2, AR2 | `ChatSystemMessage.test.tsx` divider, separator-name, divider-icon, and numeric-zero label tests | divider; divider with icon                  | A missing separator, wrong name, or rendered icon fails. | `audit:ChatSystemMessage/accessibility` |
| FR3, AR1 | `ChatSystemMessage.test.tsx` no-live-role tests                                                  | both variants                               | A live role on the root fails.                           | `audit:ChatSystemMessage/accessibility` |
| FR4      | `ChatSystemMessage.test.tsx` "preserves the complete root passthrough seam" for each variant     | ref, data, ARIA, role, class, style, xstyle | A dropped input fails.                                   | `audit:ChatSystemMessage/public-api`    |
| FR5      | `ChatSystemMessage.test.tsx` variant test; `themingTargets.test.ts`                              | both variants                               | A missing target or reflected variant fails.             | `audit:ChatSystemMessage/theming`       |
| FR1      | `ChatSystemMessage.a11y.chromium.spec.ts` 320px coarse-pointer reflow test                       | long content at 320 CSS px                  | Horizontal overflow fails.                               | `audit:ChatSystemMessage/responsive`    |

Read from source, with no focused test yet:

- FR1: centering, and the icon not shrinking.
- PR1, AR3: no state, Effect, or interaction of the component's own.

## Decision log

No component-local decision is recorded.

## Open questions

- **OQ1 — What should `icon` do with `variant="divider"`?** (`human-api`)
  Today it is accepted and not rendered. Rendering it with the label, a
  breaking type restriction under `architecture:public-component-api` INV9, or
  keeping the no-op with documentation and a development warning each change
  the public contract.

## Content boundary

This file does not duplicate consumer prop tables or examples, or Divider's
rules. It links to their owners.
