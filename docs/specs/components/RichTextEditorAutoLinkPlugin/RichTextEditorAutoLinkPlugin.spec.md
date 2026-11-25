---
schema_version: 3
template_version: 7
kind: component
id: component:RichTextEditorAutoLinkPlugin
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility]
verified_by:
  [
    packages/richtext/src/RichTextEditorAutoLinkPlugin.test.tsx,
    packages/richtext/src/RichTextEditor.test.tsx,
    packages/richtext/src/publicSurface.test.ts,
  ]
modules: []
families: []
design_specs: []
architecture: [architecture:react-component-runtime]
contributing: []
system_specs: [spec:AST-061/DEC-8, spec:AST-062]
---

# RichTextEditorAutoLinkPlugin component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | `matchers` and `onChange`, plus the exported `DEFAULT_LINK_MATCHERS` and `NEW_TAB_LINK_ATTRIBUTES`. No `BaseProps` and no `ref`: it renders no element (`spec:AST-061` DEC-8).                         |
| Behavior                | Text that a matcher recognizes becomes a link as a person types or pastes it, except in a code block, and becomes plain text again when an edit stops the match. A passed array replaces the defaults. |
| End-user impact         | People who type or paste a URL, a `www.` host or an email address get a working link without the link control. Text in a code block stays code.                                                        |
| Builder impact          | None. A caller who wants another pattern as well spreads `DEFAULT_LINK_MATCHERS` into `matchers`.                                                                                                      |
| Compatibility/readiness | Released in `@astryxdesign/richtext`. Draft observational record.                                                                                                                                      |
| Review checks           | Reject a link inside a code block, a default link without `target="_blank"` and `rel="noopener noreferrer"`, a default URL with an unsafe scheme, or a caller array merged into the defaults.          |
| Governing rules         | `spec:AST-061` DEC-8; `spec:AST-062` FR1, FR3, FR6.                                                                                                                                                    |

This table is a review projection; the body below is authoritative.

## Intent

RichTextEditorAutoLinkPlugin turns typed and pasted URLs and email addresses
into links in a RichTextEditor. It is a thin layer over Lexical's
`AutoLinkPlugin`: it supplies safe default matchers, new-tab attributes and the
code-block exclusion, and a caller with other link conventions passes its own
matchers in the same slot.

Consumer syntax and examples belong in `RichTextEditorAutoLinkPlugin.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: observational record; no API, default or behavior change.
- Controlled/uncontrolled behavior: not applicable; the plugin holds no value.
- Migration decision: none.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The default matchers, their URL and email recognition, the new-tab
  attributes on default links, and the code-block exclusion.
- Passing `matchers` and `onChange` to Lexical's `AutoLinkPlugin`.

**Does not own / non-goals**

- When a match becomes or stops being a link (separators around the match) —
  owned by Lexical's `AutoLinkPlugin`.
- URL scheme validation — owned by `sanitizeUrl` in `@astryxdesign/richtext`.
- How a link paints in the editor — owned by RichTextEditor's editor theme.
- Registering `AutoLinkNode` — owned by RichTextEditor, which registers it by
  default.

## Public concepts

| Concept        | Closed values or states             | Meaning                                                                 | Availability by variant/orientation/state | Default                 | Owner                                    | Stability | Invalid-value behavior        |
| -------------- | ----------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------- | ----------------------- | ---------------------------------------- | --------- | ----------------------------- |
| Matcher set    | the defaults, or the caller's array | Which text becomes a link, its destination, and its link attributes.    | Inside RichTextEditor's `plugins` slot    | `DEFAULT_LINK_MATCHERS` | `component:RichTextEditorAutoLinkPlugin` | stable    | An empty array links nothing. |
| Link lifecycle | created, updated, removed           | A link appears when text matches and goes when an edit stops the match. | Editable text outside a code block        | —                       | Lexical `AutoLinkPlugin`                 | stable    | —                             |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                           | Basis                                               | Draft review state |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------ |
| FR1 | It renders no element of its own and takes no `BaseProps` or `ref`. It works only inside RichTextEditor's `plugins` slot, where it reaches the editor through Lexical's composer.                             | `spec:AST-061` DEC-8; current behavior              | settled            |
| FR2 | The default URL matcher links a URL that starts with `http://`, `https://` or `www.`. It gives a `www.` host the `https://` scheme, and its destination passes through `sanitizeUrl`.                         | Current behavior                                    | verify             |
| FR3 | The default email matcher links an email address to its `mailto:` destination.                                                                                                                                | Current behavior                                    | verify             |
| FR4 | Every link a default matcher creates carries `target="_blank"` and `rel="noopener noreferrer"` (`NEW_TAB_LINK_ATTRIBUTES`).                                                                                   | Current behavior; `rel` prevents reverse tabnabbing | verify             |
| FR5 | A `matchers` array replaces the defaults. A caller keeps URL and email links by spreading `DEFAULT_LINK_MATCHERS` into it. A caller matcher's link carries only the attributes that matcher returns.          | Current behavior                                    | verify             |
| FR6 | Text in a code block never becomes a link: on import, on paste and as a person types.                                                                                                                         | `spec:AST-062` FR3, FR6                             | settled            |
| FR7 | An edit that stops the match turns the link back into plain text. `onChange` receives the new URL and the previous one when a link is created or updated, and `null` and the previous URL when it is removed. | Current behavior (Lexical `AutoLinkPlugin`)         | verify             |

### Allowed variation

- **AV1 — Trailing punctuation.** Where a typed link ends at punctuation that
  follows it may vary with Lexical's separator rules.

### Representative states

| State                     | Required invariant                                                 | Allowed variation                   |
| ------------------------- | ------------------------------------------------------------------ | ----------------------------------- |
| Typed URL, host and email | Each becomes one link with its destination and new-tab attributes. | Where the link ends at punctuation. |
| Pasted text with a URL    | The URL becomes a link.                                            | —                                   |
| Code block                | No link.                                                           | —                                   |
| Edit that breaks a match  | The link becomes plain text.                                       | —                                   |
| Caller matchers           | Only the caller's matchers link.                                   | —                                   |

### Performance and resources

- **PR1 — Stable exclusion list.** The code-block exclusion list keeps one
  identity across renders, so a render does not register the plugin again.

## Accessibility contract

- **AR1 — A link is a native link.** A created link is a native anchor named
  by its text. Keyboard focus inside the editable text belongs to the editor.

## Design relationships

No visual output. A link paints with RichTextEditor's editor theme.

## Family and system relationships

- `spec:AST-061` DEC-8 owns the package's Lexical-based surface and says this
  plugin renders no element, so it takes no `BaseProps`.
- `spec:AST-062` owns lossless Markdown with the shipped plugins, including a
  bare URL under this plugin.

## Verification map

| Contract          | Verification                                                                                                                      | Representative states                   | Mutation or failure expectation                                    | Audit section |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------ | ------------- |
| FR1               | `RichTextEditor.test.tsx` renders-inside-the-editor case; `publicSurface.test.ts`                                                 | default                                 | A new export or a thrown render fails.                             | —             |
| FR2, FR3          | `RichTextEditor.test.tsx` default-matcher and email cases                                                                         | URL, email, quoted and bracketed emails | A wrong destination fails.                                         | —             |
| FR2 (`www.`), FR4 | `RichTextEditorAutoLinkPlugin.test.tsx` `www.` and new-tab cases                                                                  | typed URL                               | A default link without `target` or `rel` fails.                    | —             |
| FR5               | `RichTextEditorAutoLinkPlugin.test.tsx` caller-matchers and spread cases                                                          | caller array, spread defaults           | Ignoring the caller array, or merging it into the defaults, fails. | —             |
| FR6               | `RichTextEditorAutoLinkPlugin.test.tsx` code-block cases                                                                          | import, rich paste, typed               | A link inside the code block fails.                                | —             |
| FR7               | `RichTextEditorAutoLinkPlugin.test.tsx` `onChange` case                                                                           | create, remove                          | Dropping `onChange`, or a link that stays after the edit, fails.   | —             |
| AR1               | Evidence gap: no ongoing test checks the link's role and name in a browser; the audit's browser receipts and axe pass support it. | typed link                              | —                                                                  | —             |

## Decision log

None.

## Open questions

- **OQ1 — Does a caller-supplied `onChange` or `matchers` need a stable identity?**
  (`human-api`) Lexical registers the plugin again when either changes identity, so an
  inline handler or array registers it on each render. Nothing is lost, but each
  registration runs the link transforms again.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
