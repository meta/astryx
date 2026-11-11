---
schema_version: 3
template_version: 7
kind: component
id: component:RichTextEditorLinkPopoverPlugin
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [behavior, layout, accessibility]
verified_by:
  [
    packages/richtext/src/RichTextEditorLinkPopoverPlugin.test.tsx,
    packages/richtext/src/publicSurface.test.ts,
    packages/richtext/src/__tests__/RichTextEditorLinkPopoverPlugin.a11y.chromium.spec.ts,
  ]
modules: []
families: [family:overlay-dismissal]
design_specs: []
architecture: [architecture:react-component-runtime]
contributing: []
system_specs: [spec:AST-106, spec:AST-106/DEC-4, spec:AST-061/DEC-8]
---

# RichTextEditorLinkPopoverPlugin component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `RichTextEditorLinkPopoverPlugin` and `RichTextEditorLinkPopoverPluginProps` from `@astryxdesign/richtext`, with one prop, `hasNewTabLinks`, used through `plugins`. |
| Behavior                | The caret in a link opens a popover under its line: the address, Open in new tab, Edit, Remove. Cmd/Ctrl-click opens a link in a new tab; hover does nothing.        |
| End-user impact         | People see, open, change, or remove the link they are in without leaving the text.                                                                                   |
| Builder impact          | Opt-in: passing the plugin turns it on; without it, an editor's links behave as with no plugin.                                                                      |
| Compatibility/readiness | Additive; no prop of `RichTextEditor`, `RichTextView` or `RichTextEditorToolbar` changes.                                                                            |
| Review checks           | Reject a popover without the plugin, a popover opened by hover, a popover inside the editable text, scroll-path layout reads, or a second copy of the link form.     |
| Governing rules         | `spec:AST-106` FR1, FR6, FR7, FR8, FR10 and DEC-4 (the Link popover row); `family:overlay-dismissal` FR1; `architecture:react-component-runtime` INV1, INV18.        |

This table is a review projection; the body below is authoritative.

## Intent

RichTextEditorLinkPopoverPlugin is `spec:AST-106`'s Link popover: a person
opens, edits or removes the link at the caret where it sits. A product turns
it on by passing the plugin to `plugins`.

Consumer syntax and examples belong in `RichTextEditor.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes` — the plugin is opt-in.
- Compatibility class: additive export.
- Controlled/uncontrolled behavior: not applicable.
- Migration decision: none.

## Ownership boundary

**Owns**

- When the popover shows and closes, what it shows, its placement, and
  Cmd/Ctrl-click on a link while the plugin is on.

**Does not own / non-goals**

- The link form and the link rules: `linkForm.tsx` and `linkEditing.ts`, shared
  with `component:RichTextEditorToolbar`'s link popover.
- Link URL sanitizing — owned by `sanitizeUrl` in `@astryxdesign/richtext`.
- A link shown as a card with a product's preview — `spec:AST-106`'s Link card
  row, a separate plugin.

## Public concepts

| Concept       | Closed values or states  | Meaning                                                                                  | Availability by variant/orientation/state | Default | Owner                                       |
| ------------- | ------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------- | ------- | ------------------------------------------- |
| Link popover  | hidden, details, editing | Whether the popover shows, and its address or its link form.                             | Editable editor with the plugin           | hidden  | `component:RichTextEditorLinkPopoverPlugin` |
| New-tab links | on, off                  | Whether a link the popover edits gets `target="_blank"` and `rel="noopener noreferrer"`. | Always                                    | on      | `component:RichTextEditorLinkPopoverPlugin` |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                        | Basis                                                            | Status           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------- |
| FR1 | With the caret in a link (a click on it, or arrowing into it) while focus is in the editor or the popover, the popover shows under the link's line. A range selection, a pointer drag, or focus elsewhere shows none. Hovering a link does nothing.                                                                                                                              | `spec:AST-106/DEC-4`                                             | Current behavior |
| FR2 | The popover shows the address without its web scheme, which opens the link in a new tab when it is safe to open, then Open in new tab (only for an address safe to open), Edit and Remove.                                                                                                                                                                                       | Current behavior                                                 | Current behavior |
| FR3 | Edit, or Cmd/Ctrl+K with the caret in a link, shows the same link form as the toolbar's link popover. Apply sets the address as one undo step with the new-tab attributes `hasNewTabLinks` names; an empty address removes the link and keeps its words; a refused address shows the field's error and keeps focus there. A link deleted while its form is open closes the form. | Current behavior                                                 | Current behavior |
| FR4 | Cmd-click (Ctrl-click off Apple platforms) on a link in an editable editor opens it in a new tab; a plain click places the caret.                                                                                                                                                                                                                                                | `spec:AST-106/DEC-4`                                             | Current behavior |
| FR5 | Escape closes the popover through the shared layer dismissal stack and keeps it away until the caret is in another link.                                                                                                                                                                                                                                                         | `family:overlay-dismissal` FR1                                   | Current behavior |
| FR6 | The popover renders into the positioned element around the editable text, beside it and never inside it, absolutely positioned, so it never reflows the document. It is placed once per link and through the shared reposition scheduler, which listens to editor updates and resizes, never scroll.                                                                             | `spec:AST-106` FR6; `architecture:react-component-runtime` INV18 | Current behavior |
| FR7 | A read-only or disabled editor shows no popover and follows no Cmd/Ctrl-click.                                                                                                                                                                                                                                                                                                   | Current behavior                                                 | Current behavior |

## Accessibility contract

- **AR1 — A named group of named controls.** The popover is a group named
  "Link"; every control in it is named and has a tooltip, and Tab from the
  editable text reaches it, since it follows the text in the document.

## Design relationships

The popover uses the popover surface tokens (background, container radius,
medium shadow) and the toolbar link form's controls; it adds no design
decision of its own.

## Internal modules

| Module                     | What it holds                                                                                | Why existing code is not enough                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `linkForm.tsx`             | `LinkForm`, the URL form, and Remove's glyph (shared with `ToolbarLinkPopover.tsx`)          | The form was private to `RichTextEditorToolbar.tsx`, so the plugin could not call it; one form keeps adding and editing a link alike. |
| `linkEditing.ts`           | The link rules both callers share (`toLinkHref`), and setting or removing the link at a key  | The toolbar's apply logic was private to it; the plugin edits a link by key, which the toolbar's selection-based apply does not do.   |
| `editorReposition.ts`      | `registerEditorReposition`, the once-per-frame scheduler for chrome beside the editable text | Code block headers and task checkboxes each copied the same scheduler; one shared scheduler replaces the copies.                      |
| `useEditorFocusAndDrag.ts` | Whether focus is in the editor's frame and whether a pointer drags a selection in its text   | No existing hook gives a Lexical root's focus and drag state without keeping the root element in React state (INV1).                  |

## Family and system relationships

- `spec:AST-106` admits the Link popover as a plugin (FR10); this record owns
  its behavior.
- `component:RichTextEditorToolbar` owns the toolbar's link popover, which
  renders the same `LinkForm`.

## Verification map

| Contract | Verification                                                                                                                                                              | Representative states                  | Mutation or failure expectation                                            | Audit refs |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------- | ---------- |
| FR1      | `RichTextEditorLinkPopoverPlugin.test.tsx` caret, arrowing-in, range, focus-leaving and hover cases                                                                       | caret in a link, range, blurred, hover | A popover from hover, or none for the caret, fails.                        | —          |
| FR2      | `RichTextEditorLinkPopoverPlugin.test.tsx` address, Open in new tab and unsafe-address cases                                                                              | safe and unsafe addresses              | Opening an unsafe address fails.                                           | —          |
| FR3      | `RichTextEditorLinkPopoverPlugin.test.tsx` Edit, empty, refused, `hasNewTabLinks`, Cmd/Ctrl+K and deleted-link cases                                                      | form open, refused, link deleted       | Two undo steps, a lost form focus, or a form left on a deleted link fails. | —          |
| FR4, FR7 | `RichTextEditorLinkPopoverPlugin.test.tsx` Cmd/Ctrl-click, plain click, read-only and disabled cases                                                                      | editable, read-only, disabled          | A followed plain click, or a followed click in a read-only editor, fails.  | —          |
| FR5      | `RichTextEditorLinkPopoverPlugin.test.tsx` Escape case                                                                                                                    | dismissed, caret in another link       | A popover back while the caret stays in the link fails.                    | —          |
| FR6      | `RichTextEditorLinkPopoverPlugin.test.tsx` placement case and `linkPopoverPlacement` geometry; `RichTextEditorLinkPopoverPlugin.a11y.chromium.spec.ts` at 1280 and 390 px | left-to-right, right-to-left, edges    | A popover inside the editable text or in its flow fails.                   | —          |
| AR1      | `RichTextEditorLinkPopoverPlugin.test.tsx` named-control and tooltip cases                                                                                                | details, form                          | An unnamed control fails.                                                  | —          |

## Decision log

None.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
