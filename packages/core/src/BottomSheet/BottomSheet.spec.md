---
schema_version: 3
template_version: 3
kind: component
id: component:BottomSheet
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-24
owners: [cixzhang]
review_triggers: [theming, layout, public-api]
verified_by:
  [
    packages/core/src/BottomSheet/BottomSheet.test.tsx,
    packages/core/src/BottomSheet/BottomSheetPanel.test.tsx,
    packages/core/src/BottomSheet/BottomSheetKeyboard.test.tsx,
    packages/core/src/BottomSheet/__tests__/BottomSheetNativeModal.a11y.browser.spec.ts,
    packages/core/src/BottomSheet/__tests__/BottomSheetKeyboard.a11y.browser.spec.ts,
    apps/storybook/stories/BottomSheet.stories.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:overlay-dismissal]
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:container-padding,
    architecture:layer-runtime,
  ]
contributing: []
system_specs: [spec:AST-025, spec:AST-099]
---

# BottomSheet component contract

## Intent

BottomSheet presents caller-provided content in a panel that rises from the
bottom edge. This record covers consumer anatomy, the native dialog every sheet
renders, keyboard-reachable scrolling, theming reachability, and the Content
area's container padding. Where the shipped sheet does not yet meet a
requirement, the row carries a present-tense implementation gap note.

## Compatibility and migration

- Released default preserved: `yes`; with no `padding` prop and no theme
  padding, the Content area insets by `--spacing-4` on every logical edge, and
  `padding={0}` keeps an unpadded Content area
- Compatibility class: records the shipped anatomy, padded Content area, and
  native dialog; no public prop, default, or export changes
- Controlled/uncontrolled behavior: unchanged
- Migration decision: none; the precedence rule under Transformation and
  precedence order is the whole contract

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The visual Sheet panel and its current `bottom-sheet` target.
- The scrolling Content area, its shared viewport/content-box integration, and
  automatic keyboard-path selection.
- The Content area's container padding, published per
  `architecture:container-padding`.
- Standalone sheet presentation, including its optional native-dialog Scrim.
- The native dialog every sheet renders, standalone or switcher-managed
  (`component:BottomSheetSwitcher` DEC-1).

**Does not own / non-goals**

- Caller-provided content rendered inside the Content area.
- A separate target for Content area, Handle, or Scrim; none exists on current
  `main`.
- The presentation lifecycle of its dialog and the flow's scrim ownership when
  the sheet participates in a BottomSheetSwitcher — owned by BottomSheetSwitcher
  (`component:BottomSheetSwitcher` DEC-1).
- Shared layer hosting or dismissal policy.

## Public concepts

No new public concept is introduced. Consumer props and usage remain documented
in `BottomSheet.doc.mjs`.

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                   | Basis                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| FR1 | The current presented sheet contains one Sheet panel, one scrolling Content area, and one decorative Handle; a Scrim is present only in scrim-backed presentation.                                                                          | Current source, docs, and tests  |
| FR2 | The Sheet panel carries `bottom-sheet`; Content area, Handle, and Scrim carry no BottomSheet public target.                                                                                                                                 | Current source, docs, and tests  |
| FR3 | Content renders in one real observed content box. Effective overflow, containment, and keyboard access come from `useScrollableArea`; the named overflowing body delegates forward Tab entry to a safe first sequential native link/button. | `spec:AST-025`; tests            |
| FR4 | The Content area pads caller content by the sheet's container inset and publishes the applied inset to descendants as a container publisher.                                                                                                | `architecture:container-padding` |

### Allowed variation

- Caller-provided children may vary without becoming BottomSheet-owned anatomy.
- Height, snap points, motion phase, and standalone versus switcher hosting may
  vary without changing the four-part anatomy recorded here.

### Representative states

- A standalone modal sheet renders Sheet panel, Content area, Handle, and Scrim.
- A standalone non-modal sheet renders Sheet panel, Content area, and Handle
  without a Scrim.
- A switcher-managed sheet renders the same panel anatomy in its own dialog while
  BottomSheetSwitcher coordinates that dialog's lifecycle and the flow's one Scrim
  (`component:BottomSheetSwitcher` DEC-1).

### Transformation and precedence order

- Content area inset: the `padding` prop, then the theme's `padding` properties
  on `bottom-sheet`, then `--spacing-4` on every logical edge.
- No new height, gesture, or motion precedence rule is introduced.

### Performance and resources

- No new performance or resource rule is introduced.

## Accessibility contract

- **AR1 — Keyboard scroll path.** The named body is a tab stop while effectively
  overflowing. On forward Tab entry, the shared hook may delegate to the first
  sequential native link/button outside navigation-key-owning surfaces. It keeps
  the body stop for excluded content and skips the body on reverse traversal
  from the delegated first child.
- **AR2 — Focus continuity.** Content, overflow, or eligibility changes MUST NOT
  move focus. Pointer/programmatic body focus never delegates. A focused body
  losing overflow remains programmatically focusable.

## Design relationships

| Anatomy or state | Design requirement                                                                    | Representation authority       | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------------------------------------- | ------------------------------ | -------------- | ------------------ |
| Sheet panel      | Presents the painted bottom-edge surface and owns panel geometry and motion.          | Current source and public docs | Prominent      | FR1, FR2           |
| Content area     | Provides the scrolling, inset area for caller-provided sheet content.                 | Current source and tests       | Prominent      | FR1, FR2, FR4      |
| Handle           | Presents the decorative grab affordance and owns the panel's drag interaction region. | Current source and tests       | Supporting     | FR1, FR2           |
| Scrim            | Dims and blocks the page in a scrim-backed host.                                      | Current source and public docs | Supporting     | FR1, FR2           |

Content area, Handle, and Scrim are stable visible parts, but no current public
target reaches them. Their `none` dispositions record factual reachability, not
a decision that they must remain unthemeable.

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Sheet panel": {"target": "bottom-sheet"},
  "Content area": {
    "none": {
      "reason": "reachability-gap: No current public target reaches the scrolling content area."
    }
  },
  "Handle": {
    "none": {
      "reason": "reachability-gap: No current public target reaches the handle bar or pill."
    }
  },
  "Scrim": {
    "none": {
      "reason": "reachability-gap: No BottomSheet public target reaches the native dialog backdrop, standalone or switcher-coordinated."
    }
  }
}
```

## Family and system relationships

- `architecture:component-theming-surface` owns anatomy qualification, target
  mapping, and factual `none` dispositions.
- `architecture:container-padding` owns the shared container inset protocol and
  admits the Content area as a container publisher.
- `architecture:layer-runtime` owns the current native-dialog host distinction
  and records that sheets retain local scrim and swipe behavior.
- `spec:AST-025` owns effective scroll measurement, overflow and containment,
  automatic keyboard-owner selection, and focus continuity.
- BottomSheet's on-screen keyboard behavior is owned by `spec:AST-099`.
- `family:overlay-dismissal` owns shared Escape and platform-close ordering. A
  standalone BottomSheet registers with the shared stack while it is presented;
  a switcher-hosted sheet is covered by BottomSheetSwitcher's registration.

## Verification map

| Contract            | Verification                                                                                       | Representative states                                                    | Mutation or failure expectation                                                                         | Audit section                     |
| ------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | --------------------------------- |
| FR1                 | `BottomSheet.test.tsx` render, content, Handle, and scrim behavior suites                          | Modal, non-modal, and switcher presentations                             | Removing a documented part fails existing content, structure, or dismissal assertions.                  | `audit:BottomSheet/anatomy`       |
| FR2                 | Panel target assertion, source inspection, and theming target inventories                          | Sheet panel, Content area, Handle, and Scrim                             | Removing the panel target or documenting an unshipped child target fails evidence or inventory.         | `audit:BottomSheet/theming`       |
| FR3, AR1–AR2        | `BottomSheetKeyboard.test.tsx`; `BottomSheetKeyboard.a11y.browser.spec.ts`; open Storybook stories | fitting/overflow, plain text, usable/unusable/dynamic descendants, focus | Missing/duplicate keyboard access, stale ownership, focus movement, or broken content-box layout fails. | `audit:BottomSheet/accessibility` |
| Layout evidence     | `BottomSheetPanel.test.tsx`                                                                        | Floating Handle and scrolling Content area                               | Reordering or merging the stable parts fails existing panel structure and style assertions.             | `audit:BottomSheet/anatomy`       |
| FR4                 | `BottomSheetPanel.test.tsx` container padding tests; `derivedVarRegistry.test.ts`                  | default, `padding` prop, theme `padding`, lone padded Section child      | The published inset differs from the applied padding, or a lone padded Section changes geometry.        | `audit:BottomSheet/anatomy`       |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                      | Canonical anatomy and current target inventory                           | Missing, extra, prefixed, stale, or multiply assigned mappings fail repository validation.              | `audit:BottomSheet/theming`       |

Existing tests directly assert the Sheet panel target, Content area placement,
Handle structure, and scrim behavior. Source and public target metadata confirm
that the other three parts have no public target.

## Decision log

### DEC-1 — BottomSheet adopts automatic shared keyboard ownership

**Reference:** `component:BottomSheet/DEC-1`
**Decider:** cixzhang, 2026-09-13

BottomSheet supplies its existing label to
`keyboardAccess.owner="contentOrViewport"`. The shared hook keeps the overflowing
body named and tabbable, delegating forward keyboard entry to a safe first native
link/button. Pointer/programmatic focus and excluded content keep the body path. BottomSheet retains `stickyContainment="always"` because the
body deliberately remains the sheet-local Sticky boundary.

A real flow-root content box supplies the hook's observation seam while preserving
representative margin, float, percentage-height, flex/grid-child, and hug-height
behavior.

## Open questions

- **OQ1 — Should Content area, Handle, or Scrim gain a stable public theming
  target?** (`human-api`) Their current lack of reachability is an audit gap, not
  settled intent.

## Content boundary

This file does not duplicate consumer prop tables, examples, gesture algorithms,
implementation steps, or shared layer and theming rules. It links to their
owners.
