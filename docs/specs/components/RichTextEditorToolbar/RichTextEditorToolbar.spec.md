---
schema_version: 3
template_version: 7
kind: component
id: component:RichTextEditorToolbar
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-11-06
owners: [cixzhang]
review_triggers: [behavior, layout, theming, accessibility]
verified_by:
  [
    packages/richtext/src/RichTextEditorToolbarLink.test.tsx,
    packages/richtext/src/__tests__/RichTextEditorToolbar.a11y.chromium.spec.ts,
  ]
modules: []
families: []
design_specs: []
architecture: [architecture:icon-resolution-and-component-slots]
contributing: []
system_specs: [spec:AST-061, spec:AST-087/FR11]
---

# RichTextEditorToolbar component contract

<!-- path-applicability:v1 -->

```json
{
  "paths": [
    "packages/richtext/src/internal/ToolbarLinkPopover.tsx",
    "packages/richtext/src/linkForm.tsx"
  ]
}
```

## Contract at a glance

| Area                    | Contract                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | None beyond `spec:AST-061`; this record owns the link control's interaction.                                                                                                          |
| Behavior                | The Link button, or Cmd/Ctrl+K in the editor, opens a non-modal popover attached to the Link button that holds one URL field and Apply, Remove (in a link) and Cancel.                |
| End-user impact         | People add or edit a link without a modal dialog over the text they are linking, and keep their place: focus and the selection return to the editor when the popover closes.          |
| Builder impact          | None. `promptForUrl` still replaces the built-in popover.                                                                                                                             |
| Compatibility/readiness | The link UI is a non-modal popover, not a modal dialog; no prop changes.                                                                                                              |
| Review checks           | Reject a modal link surface, a closed popover that leaves focus or the selection outside the editor, a new `richtext:*` icon key for the form's buttons, or a popover off its button. |
| Governing rules         | `spec:AST-061`; `spec:AST-087` FR11; `architecture:icon-resolution-and-component-slots` INV10.                                                                                        |

This table is a review projection; the body below is authoritative.

## Intent

RichTextEditorToolbar is the formatting toolbar for RichTextEditor. This record
owns its link control: how a person adds, edits and removes a link from the
toolbar. The rest of the toolbar follows `spec:AST-061`.

Consumer syntax and examples belong in `RichTextEditor.doc.mjs`.

## Compatibility and migration

- Released default preserved: `no` — the link control opens a popover instead
  of a dialog.
- Compatibility class: interaction change with no prop, default or API change.
- Controlled/uncontrolled behavior: unchanged.
- Migration decision: DEC-1.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The link popover: when it opens, its placement, its form, and where focus
  and the selection go when it closes.

**Does not own / non-goals**

- The toolbar's props — owned by `spec:AST-061`.
- Link URL sanitizing — owned by `sanitizeUrl` in `@astryxdesign/richtext`.
- Anchoring at a text selection — the Core Popover anchors only to a button.

## Public concepts

| Concept      | Closed values or states | Meaning                                                                     | Availability by variant/orientation/state | Default | Owner                             | Stability | Invalid-value behavior                           |
| ------------ | ----------------------- | --------------------------------------------------------------------------- | ----------------------------------------- | ------- | --------------------------------- | --------- | ------------------------------------------------ |
| Link popover | closed, adding, editing | Whether the link form shows, and for a new link or one the selection is in. | Editable editor with the Link button      | closed  | `component:RichTextEditorToolbar` | stable    | A refused URL keeps the form open with an error. |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                     | Basis                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| FR1 | The toolbar's link control opens an anchored, non-modal popover attached to its Link button instead of a dialog; it holds the URL field and Apply/Cancel, and focus and the selection return to the editor at the link on Enter, Escape or Cancel. The popover holds Remove while the selection is in a link. | Owner decision, Nov 6 2026 (Cindy) (DEC-1)                                    |
| FR2 | The popover opens above the toolbar and flips below it only when there is no room above, so it does not cover the editor's first lines.                                                                                                                                                                       | Design decision (Ernest, design owner) (DD1)                                  |
| FR3 | Cmd/Ctrl+K in the editor opens the same popover. It first brings the Link button into view, in the page and in the toolbar's row, so the popover opens beside it.                                                                                                                                             | Current behavior                                                              |
| FR4 | Apply and Cancel draw the shared `check` and `close` icons, so a theme restyles them through `icons`. Remove draws fixed component artwork. The form adds no `richtext:*` icon key.                                                                                                                           | `spec:AST-087` FR11; `architecture:icon-resolution-and-component-slots` INV10 |
| FR5 | The popover is at most 320 px wide and never wider than the viewport's gutters, so at phone width the field and its buttons stay on one row inside the screen.                                                                                                                                                | Current behavior                                                              |
| FR6 | The URL field starts empty with the `example.com` placeholder, asks touch screens for a URL keyboard, marks no spelling, and takes focus as the popover opens. A URL that cannot be linked shows an error under the field and keeps focus there.                                                              | Current behavior                                                              |

## Accessibility contract

- **AR1 — The Link button names its popup.** It carries `aria-haspopup="dialog"`
  and `aria-expanded`, and controls the popover, which is a labelled
  non-modal dialog ("Insert link" or "Edit link") outside the toolbar's roving
  tab stop, so Tab moves through the form.

## Design relationships

### Design decisions

<!-- design-decisions:v1 -->

| ID  | Decision                                  | Intent or reason                                                        | Applies to   | Allowed variation                        |
| --- | ----------------------------------------- | ----------------------------------------------------------------------- | ------------ | ---------------------------------------- |
| DD1 | The link popover opens above the toolbar. | The linked words are often on the editor's first lines, right below it. | Link popover | Flips below when there is no room above. |

## Family and system relationships

- `spec:AST-061` owns the toolbar's props; this record owns the link control's
  interaction.

## Verification map

| Contract | Verification                                                                                                                              | Representative states                     | Mutation or failure expectation                                               | Audit section |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------- | ------------- |
| FR1, AR1 | `RichTextEditorToolbarLink.test.tsx` popover, Enter, Escape, Cancel, edit and Remove cases; `RichTextEditorToolbar.a11y.chromium.spec.ts` | adding, editing, refused URL              | A modal surface, or focus or the selection left outside the editor, fails.    | —             |
| FR3      | `RichTextEditorToolbarLink.test.tsx` Cmd/Ctrl+K case                                                                                      | button in view, button scrolled away      | Opening without bringing the button into view fails.                          | —             |
| FR4      | `RichTextEditorToolbarLink.test.tsx` shared-icon case                                                                                     | default icons, registered `check`/`close` | A new `richtext:*` key, or Apply and Cancel ignoring the shared icons, fails. | —             |
| FR6      | `RichTextEditorToolbarLink.test.tsx` field and refused-URL cases                                                                          | empty, refused                            | Missing native hints, or focus leaving the field on a refused URL, fails.     | —             |
| FR2, FR5 | Evidence gap: no automated test asserts placement or width; real-browser screenshots at desktop and 390 px support them.                  | desktop, phone width                      | —                                                                             | —             |

## Decision log

### DEC-1 — The link control opens a popover on its Link button

**Reference:** `component:RichTextEditorToolbar/DEC-1`
**Decider:** `cixzhang`, `2026-11-06`

A person adding a link keeps the text they are linking in view: the link form
is a small non-modal popover attached to the Link button instead of a modal
dialog.

Rejected: a popover on fine pointers with a dialog or bottom sheet on phones.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
