---
schema_version: 3
template_version: 7
kind: component
id: component:RichTextView
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, accessibility]
verified_by:
  [
    packages/richtext/src/RichTextEditor.test.tsx,
    packages/richtext/src/__tests__/RichTextView.a11y.chromium.spec.ts,
    packages/richtext/src/internal/TableScrollRegionPlugin.test.tsx,
    packages/richtext/src/internal/CodeBlockHeaderPlugin.test.tsx,
    packages/richtext/src/internal/BlockDirectionPlugin.test.tsx,
    packages/richtext/src/internal/MarkdownExtensionsPlugin.test.tsx,
    packages/richtext/src/markdownTaskList.test.tsx,
    packages/richtext/src/publicSurface.test.ts,
  ]
modules: []
families: []
design_specs: [design:bidirectionality]
architecture: [architecture:react-component-runtime]
contributing: []
system_specs:
  [
    spec:AST-061/FR2,
    spec:AST-061/FR6,
    spec:AST-061/FR8,
    spec:AST-061/DEC-4,
    spec:AST-061/DEC-6,
    spec:AST-061/DEC-7,
    spec:AST-061/DEC-8,
    spec:AST-064/FR2,
    spec:AST-064/FR8,
    spec:AST-106/FR5,
  ]
---

# RichTextView component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `value`, `nodes`, `markdownExtensions`, `codeLanguages`, `plugins`, `namespace`, `onParseError` and `errorFallback`, plus `BaseProps` on the root element. No `ref`.                                                    |
| Behavior                | Renders serialized Lexical editor state read-only, as the editor draws it, and follows later `value` changes. A value that cannot be parsed renders `errorFallback` instead of throwing, and `onParseError` reports it. |
| End-user impact         | Readers see stored rich text with the editor's typography, code frames, task states and tables. Assistive technology reads it as document content, not as a form field.                                                 |
| Builder impact          | None.                                                                                                                                                                                                                   |
| Compatibility/readiness | Released in `@astryxdesign/richtext`. Draft observational record.                                                                                                                                                       |
| Review checks           | Reject a `textbox` role or widget-only ARIA on the content, a parse failure that throws into the host, a view that keeps its first `value`, or a wide table that widens the page.                                       |
| Governing rules         | `spec:AST-061` FR2, FR6, FR8, DEC-4, DEC-6, DEC-7, DEC-8; `spec:AST-064` FR2, FR8.                                                                                                                                      |

This table is a review projection; the body below is authoritative.

## Intent

RichTextView renders the value that `RichTextEditor` produces, serialized
Lexical editor state, as read-only document content. It mounts the editor's
node set, theme and document plugins without editing affordances, so a stored
document reads as it looked while someone wrote it.

Consumer syntax and examples belong in `RichTextView.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: observational record; no API, default or behavior change.
- Controlled/uncontrolled behavior: `value` is controlled; the view holds no value of its own.
- Migration decision: none.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Mounting the editor's node set, theme, table, code block, task-list,
  direction and Markdown extension plugins read-only around one value.
- Applying a changed `value` to the mounted view.
- Parse-failure handling: `errorFallback` in place of the content and one
  `onParseError` report per distinct failure.
- Removing the content editable's `textbox` role and widget-only ARIA.

**Does not own / non-goals**

- The value format and Markdown conversion — owned by `spec:AST-061` DEC-7 and
  `spec:AST-062`.
- Block typography, spacing, measure, direction and the code block frame —
  owned by `spec:AST-061` and the shared editor theme.
- How a Markdown plugin node renders — owned by `spec:AST-064` FR8.
- A labelled, read-only field — `RichTextEditor` with `isReadOnly`;
  `spec:AST-061` DEC-7 makes the editor the labelled form field.

## Public concepts

| Concept        | Closed values or states       | Meaning                                                                     | Availability by variant/orientation/state | Default | Owner                    | Stability | Invalid-value behavior                               |
| -------------- | ----------------------------- | --------------------------------------------------------------------------- | ----------------------------------------- | ------- | ------------------------ | --------- | ---------------------------------------------------- |
| Rendered value | content, fallback             | The document the view shows, or the caller's fallback when the value fails. | Always                                    | content | `component:RichTextView` | stable    | A value that fails to parse renders `errorFallback`. |
| Node set       | the default set, plus `nodes` | The node types the view can deserialize.                                    | Read when the view first builds           | default | `component:RichTextView` | stable    | An unregistered node type is a parse failure.        |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                       | Basis                                                                                           | Draft review state |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------ |
| FR1 | The view renders the serialized editor state in `value` with the editor's default nodes plus `nodes`, and it is not editable.                                                                                                                                             | `spec:AST-061` DEC-7; current behavior                                                          | settled            |
| FR2 | Body text — paragraphs, list items, quotes and table cells — takes the theme's body size, leading, family and color, as the editor and core `Markdown` set it, not the host page's font. Headings keep the heading type.                                                  | `spec:AST-061` FR2                                                                              | settled            |
| FR3 | A prose block (paragraph, heading, quote or list item) lays out in the direction of its own text; a prose block whose text has no strongly directional character takes the provider's direction. A task checkbox sits at the inline start of its item in that direction.  | `spec:AST-061` FR6, DEC-6 (a checkbox in place of the marker); current behavior (checkbox side) | settled            |
| FR4 | A fenced code block shows the editor's code frame: a copy action, and the language label when the fence names one. The copy action follows the content in tab order.                                                                                                      | `spec:AST-061` FR8, DEC-4; current behavior (tab order)                                         | settled            |
| FR5 | A Markdown plugin node renders through `markdownExtensions` exactly as core `Markdown` renders it, and a node whose plugin is not passed shows its source.                                                                                                                | `spec:AST-064` FR2, FR8                                                                         | settled            |
| FR6 | A later `value` replaces the rendered content.                                                                                                                                                                                                                            | Current behavior; consumer docs                                                                 | verify             |
| FR7 | A value that is not JSON, or that names a node type the view does not register, renders `errorFallback` (default nothing) inside the root element instead of throwing. `onParseError` receives each distinct failure once, after commit. A corrected value renders again. | Current behavior; consumer docs                                                                 | verify             |
| FR8 | A table wider than the view scrolls inside a group named by the translated table label ("Table" in English) that takes a tab stop only while it overflows, as core `Table` does, so the page does not scroll sideways.                                                    | Current behavior; consumer docs                                                                 | verify             |
| FR9 | `className`, `style` and `xstyle` merge with the view's own styles on the root element, and other base props land on it, in both the content and the fallback state.                                                                                                      | `architecture:public-component-api`; current behavior                                           | verify             |

FR7 gap: a first value that names an unregistered node renders the fallback,
but the view updates its state while Lexical's composer renders, which React
reports as an error.

### Allowed variation

- **AV1 — Fallback content.** What `errorFallback` renders is the caller's.

### Representative states

| State                      | Required invariant                                       | Allowed variation |
| -------------------------- | -------------------------------------------------------- | ----------------- |
| Document with every block  | Same blocks, typography and frames as the editor.        | —                 |
| Mixed-direction task list  | Each checkbox at its own item's inline start.            | —                 |
| Wide table at phone width  | The table scrolls in its named group; the page does not. | —                 |
| Changed value              | The new document replaces the old one.                   | —                 |
| Malformed or foreign value | The fallback renders, and the failure is reported once.  | Fallback content. |

## Accessibility contract

- **AR1 — Document content, not a field.** The content carries no `textbox`
  role, `aria-readonly` or `aria-autocomplete`; headings, lists, links and
  tables keep their own roles, and the view takes no label.
- **AR2 — Read-only task states.** Task checkboxes are read-only, named by
  their item's text, and take no tab stop.

## Design relationships

| Anatomy or state            | Design requirement        | Representation authority | Hierarchy role | Component contract |
| --------------------------- | ------------------------- | ------------------------ | -------------- | ------------------ |
| Block direction, checkboxes | `design:bidirectionality` | prescribed               | supporting     | FR3                |

## Family and system relationships

- `spec:AST-061` owns the document's visual contract, which the view shares
  with `RichTextEditor` and core `Markdown`, and DEC-7 names the view as the
  renderer of the editor's value.
- `spec:AST-064` owns Markdown plugin nodes on the view.
- `spec:AST-106` FR5 says the view draws an affordance's content as the
  read-only editor draws it.

## Verification map

| Contract | Verification                                                                                                                                     | Representative states              | Mutation or failure expectation                                         | Audit section |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ----------------------------------------------------------------------- | ------------- |
| FR1, AR1 | `RichTextEditor.test.tsx` read-only and document-content cases                                                                                   | default                            | An editable or `textbox` content fails.                                 | —             |
| FR2      | `RichTextView.a11y.chromium.spec.ts`                                                                                                             | light, dark                        | A block in the host page's font fails.                                  | —             |
| FR3      | `BlockDirectionPlugin.test.tsx` (block direction); RTL audit overlay-side check on the digit-only task story                                     | both directions                    | A block in the wrong direction, or a checkbox on the wrong side, fails. | —             |
| FR4      | `CodeBlockHeaderPlugin.test.tsx` (frame, label, copy action). Evidence gap: no ongoing test checks the tab order.                                | named and unnamed language         | A missing copy action fails.                                            | —             |
| FR5      | `MarkdownExtensionsPlugin.test.tsx`                                                                                                              | passed and missing plugin          | A node that does not match core fails.                                  | —             |
| FR6      | `RichTextEditor.test.tsx` value-change case                                                                                                      | changed value                      | A view that keeps its first value fails.                                | —             |
| FR7      | `RichTextEditor.test.tsx` malformed-JSON, StrictMode, recovery and unregistered-node cases                                                       | malformed, unregistered, recovered | A throw, a missing fallback or a repeated report fails.                 | —             |
| FR8      | `TableScrollRegionPlugin.test.tsx` (name and conditional tab stop). Evidence gap: no ongoing test checks that the page does not scroll sideways. | fits, overflows                    | A missing name or a tab stop on a table that fits fails.                | —             |
| FR9      | `RichTextEditor.test.tsx` className, xstyle and fallback styling cases. Evidence gap: no test covers `style` or other base props.                | content, fallback                  | A dropped class fails.                                                  | —             |
| AR2      | `markdownTaskList.test.tsx`                                                                                                                      | checked, unchecked                 | An editable checkbox in the view fails.                                 | —             |

## Decision log

None.

## Open questions

- **OQ1 — Does the view take a `ref`?** (`human-api`) The view's props have
  no `ref`, and `spec:AST-061` DEC-8 names `ref` only for
  `RichTextEditorToolbar`.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
