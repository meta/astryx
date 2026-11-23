---
schema_version: 3
template_version: 7
kind: component
id: component:DiffViewer
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang, imdreamrunner]
review_triggers:
  [public-api, behavior, layout, theming, accessibility, interaction]
verified_by:
  [
    packages/core/src/DiffViewer/DiffViewer.test.tsx,
    packages/core/src/DiffViewer/parseUnifiedDiff.test.ts,
    packages/core/src/DiffViewer/createDiffFile.test.ts,
    packages/core/src/DiffViewer/inlineDiff.test.ts,
    packages/core/src/DiffViewer/__tests__/DiffViewer.a11y.chromium.spec.ts,
    packages/core/src/DiffViewer/__tests__/DiffViewerForcedColors.a11y.chromium.spec.ts,
    packages/lab/src/DiffViewer/index.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:component-theming-surface,
    architecture:internationalization,
  ]
contributing: []
system_specs: [spec:AST-017, spec:AST-025, spec:AST-094]
---

# DiffViewer component contract

<!-- path-applicability:v1 -->

```json
{
  "paths": ["packages/lab/src/DiffViewer/index.ts"]
}
```

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `DiffViewer`, `parseUnifiedDiff`, `createDiffFile`, and the diff model types from `@astryxdesign/core`. Props: `file`, `viewMode`, `language`, `codeLanguages`, `hasLineNumbers`, `isWrapped`, `changeIndicator`, `inlineHighlight`, `hasChangeBackground`, `collapsible`, `headerEnd`, `renderLineAnnotation`, `onLineNumberClick`, `maxHeight`, `syntaxTheme`, a root `ref`, and BaseProps. |
| Behavior                | One read-only, syntax-highlighted file diff: a file header over the hunks in unified or split view, with a `collapsible` disclosure that starts open, a non-colour change cue on every changed line, caller annotation rows, optional line-number buttons, and folds for changes too large to show line by line.                                                                              |
| End-user impact         | Readers on a mouse, touch, keyboard, or screen reader can scan what changed, hear each change named, open and close a file, and reach every line-number button; changes stay visible under forced colors.                                                                                                                                                                                     |
| Builder impact          | Build the file with `parseUnifiedDiff` or `createDiffFile` and render one DiffViewer per file. Lab callers change the import.                                                                                                                                                                                                                                                                 |
| Compatibility/readiness | Additive Core export. The `@astryxdesign/lab` exports are deprecated re-exports of the Core ones for one release (FR14). `spec:AST-094` FR42 gap: under a coarse pointer, the disclosure and line-number buttons keep their own box, with no hit area toward 44 px.                                                                                                                           |
| Review checks           | Reject a second disclosure vocabulary beside `collapsible`, a changed line whose change reads only through colour, a line-number button off its anchor side or under 24 px of press width, an annotation row for a note that renders nothing, a fold that hides an annotated line, or a hunk area that follows the page direction.                                                            |
| Governing rules         | `architecture:public-component-api` INV19, INV21; `component:CodeBlock` FR12, FR13, DEC-1; `spec:AST-025` (scrollable areas); `spec:AST-017` FR29, FR29a (lifecycle); `spec:AST-094` FR42 (touch targets); WCAG 2.2 SC 1.4.1, 2.5.8, 4.1.2.                                                                                                                                                   |

This table is a review projection; the body below is authoritative.

## Intent

DiffViewer shows the change to one file for code review surfaces. It owns the
file header, the unified and split layouts, the change marking, the inline
highlight, the folds, and the slots a review page fills: header actions,
annotation rows, and line-number buttons. CodeBlock owns the tokenizer, the
languages, and the syntax-theme diff slots that colour the rows. Consumer
usage lives in `DiffViewer.doc.mjs`.

## Compatibility and migration

- Released default preserved: not yet released in Core; the Lab component's
  props keep their meaning and defaults
- Compatibility class: additive Core export; the Lab exports re-export the Core
  ones, deprecated, for one release (FR14)
- Controlled/uncontrolled behavior: the disclosure is uncontrolled by default
  and controlled through `collapsible={{isOpen, onOpenChange}}` (FR7)
- Migration decision: `spec:AST-017` FR29 and FR29a; Lab callers import from
  `@astryxdesign/core`

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The file header: path, status token, line counts, `headerEnd`, and the
  disclosure (FR1, FR7).
- The unified and split layouts, their scrolling, and their direction (FR2,
  FR6).
- Change marking, inline highlight, and folds (FR4, FR5, FR10).
- The annotation rows and line-number buttons it places for the caller (FR8,
  FR9).
- `parseUnifiedDiff`, `createDiffFile`, and the diff model types (FR13).

**Does not own / non-goals**

- Tokenizing, languages, and the syntax-theme diff slots — owned by
  `component:CodeBlock` (FR12, FR13, DEC-1).
- Scroll measurement, scroll focus, and the scroll area's keyboard access —
  owned by `spec:AST-025` through `useScrollableArea`.
- The disclosure state machine — the shared `useCollapsible` state that
  `component:Collapsible` and Banner also use.
- Annotation content, header actions, and the action a line-number press
  starts — product callsite.
- Editing, staging, or merging changes, and windowing very large files —
  product callsite.

## Public concepts

| Concept          | Closed values or states                                                             | Meaning                                                                         | Availability by variant/orientation/state               | Default               | Owner                  | Stability | Invalid-value behavior           |
| ---------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------- | ---------------------- | --------- | -------------------------------- |
| View mode        | `unified`, `split`                                                                  | One column, or the old file beside the new file.                                | Every file with hunks.                                  | `unified`             | `component:DiffViewer` | Stable    | TypeScript rejects other values. |
| Change indicator | `classic`, `bars`, `none`                                                           | How a changed line is marked beside its code.                                   | Every changed line.                                     | `classic`             | `component:DiffViewer` | Stable    | TypeScript rejects other values. |
| Inline highlight | `word`, `char`, `none`                                                              | How finely the change inside a paired line is marked.                           | Paired removed and added lines outside replaced blocks. | `word`                | `component:DiffViewer` | Stable    | TypeScript rejects other values. |
| Disclosure       | `true`, `false`, or `CollapsibleConfig` (`defaultIsOpen`, `isOpen`, `onOpenChange`) | Whether the file header hides and shows the hunks, and who owns the open state. | A file with a path.                                     | `true`, starting open | `component:DiffViewer` | Stable    | TypeScript rejects other values. |
| File status      | `modified`, `added`, `deleted`, `renamed`                                           | The kind of change the file model reports.                                      | Every file.                                             | From the model        | `component:DiffViewer` | Stable    | TypeScript rejects other values. |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Basis                                                                            | Draft review state |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------ |
| FR1  | DiffViewer renders one `DiffViewerFile`. Its file header shows the path (`newPath`, else `oldPath`; a renamed file shows the translated `{oldPath} → {newPath}`), a `Token` for an added (green), deleted (red), or renamed (blue) file, and the added and removed line counts, followed by `headerEnd` when it is renderable. The header renders when the file has a path or `headerEnd`. The path reads left to right in every page direction.                                                                                                                                                                                                                                                                                       | Documented promise; current source and tests                                     | settled            |
| FR2  | `viewMode="unified"` renders one table: each hunk's header row, then its lines, removed lines above the added lines that replace them. `viewMode="split"` renders two side-by-side panes, each a table in a group named for its side, and pairs each removed line with the added line that replaced it. The panes share one grid's row tracks, so a row is as tall as its taller side, and a hunk header takes the same width on both sides.                                                                                                                                                                                                                                                                                           | Documented promise; current source and tests                                     | settled            |
| FR3  | The language is `language` when set. Otherwise the file's name or extension infers it: a listed `codeLanguages` value first, where a later entry wins, then a built-in, else plain text. Rows take their tint, gutter, and hunk-header paint from the syntax-theme diff slots CodeBlock's diff layer uses, `syntaxTheme` sets a per-instance syntax theme, and highlighting never changes the code text.                                                                                                                                                                                                                                                                                                                               | `component:CodeBlock` FR12, FR13, DEC-1; tests                                   | settled            |
| FR4  | Every added or removed line carries a visually hidden "Added" or "Removed" label in every `changeIndicator` mode. `classic` shows a `+` or `-` glyph, `bars` shows a solid bar for an added line and a dashed bar for a removed line, and `none` shows neither. `hasChangeBackground` (default `true`) tints changed rows. Under forced colors each bar paints as a `CanvasText` border of its own width, and a change that only the tint marks shows the same bar.                                                                                                                                                                                                                                                                    | Documented promise; WCAG 2.2 SC 1.4.1; tests and Chromium forced-colors evidence | settled            |
| FR5  | `inlineHighlight="word"` (the default) or `"char"` marks what changed inside each removed line and the added line paired with it, paired run by run as split view pairs them. Changed words that only whitespace separates join into one mark. A pair that shares nothing but whitespace, a line inside an expanded replaced block, and `inlineHighlight="none"` get no inline mark.                                                                                                                                                                                                                                                                                                                                                   | Documented promise; tests                                                        | settled            |
| FR6  | `hasLineNumbers` (default `true`) shows the old and new line-number gutters. Unwrapped, line numbers and change indicators stay pinned while the code scrolls sideways; in split view each pane scrolls sideways on its own at half the width, both panes take the widest line of either side, and they scroll sideways in lockstep. `isWrapped` wraps long lines at spaces first and inside a word only when the word cannot fit. While code overflows sideways, sideways overscroll is off. `maxHeight` caps the hunk area, which then scrolls. The hunk area reads left to right in every page direction; the file header and annotation content follow the page direction, and annotation rows scroll with the code.               | Documented promise; tests                                                        | settled            |
| FR7  | When the file has a path, `collapsible` (default `true`) makes the file header a disclosure: a native button around the chevron and the path, with `aria-expanded` and `aria-controls` naming the hunk region. It takes the shared `CollapsibleConfig`: `true` starts open, `{defaultIsOpen: false}` starts collapsed, and `{isOpen, onOpenChange}` is controlled, where a press only calls `onOpenChange`. Uncontrolled, a press updates the open state and also calls `onOpenChange`. With `false`, or for a file without a path, there is no disclosure and the hunks always show; with `false` the path is plain text. Collapsed hunks are not rendered. The chevron points to the inline end while collapsed and down while open. | DEC-1; `architecture:public-component-api` INV19, INV21; tests                   | settled            |
| FR8  | DiffViewer calls `renderLineAnnotation` once for each line with its `DiffViewerLineRef`, and renders a full-width annotation row under the line only when the result is renderable. In split view the row sits under the line's own side.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Documented promise; tests                                                        | settled            |
| FR9  | With `onLineNumberClick`, only the number on each line's anchor side is a native button: the original number of a removed line, and the changed-file number of an added or unchanged line. The button is named "Original line N" or "Changed line N" and calls `onLineNumberClick` with the line's `DiffViewerLineRef` and the event. Every button is its own Tab stop, with no arrow-key movement. Each button takes presses across at least 24 px of width, and its press area stays in its own row.                                                                                                                                                                                                                                 | Documented promise; WCAG 2.2 SC 2.5.8; tests and Chromium hit-test evidence      | settled            |
| FR10 | A hunk marked `isReplacedBlock`, and a file with more than 2,000 changed lines outside replaced blocks, start folded behind a "Large change: N lines" row, where N counts removed plus added lines, with a Show full diff and Hide full diff button. Split view shows one control across both sides. A fold opens by itself when a line it hides has a renderable annotation. The reader's toggles start over for a new `file`. A file with 2,000 such lines shows no fold.                                                                                                                                                                                                                                                            | Documented promise; tests                                                        | settled            |
| FR11 | A binary file shows "Binary file not shown" in place of hunks, and a file with no hunks shows "No content changes".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Current source and tests                                                         | settled            |
| FR12 | `ref`, `xstyle`, `className`, `style`, and other DOM props reach the root element, and styling inputs compose.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `architecture:public-component-api` INV5, INV6, INV8; tests                      | settled            |
| FR13 | `parseUnifiedDiff(patch)` returns one `DiffViewerFile` for each file in a git or `diff -u` patch, or for a bare hunk. `createDiffFile` builds a file from two versions of a text and marks a change too large to compare line by line as one `isReplacedBlock` hunk that lists every old line as removed and every new line as added.                                                                                                                                                                                                                                                                                                                                                                                                  | Documented promise; tests                                                        | settled            |
| FR14 | The `@astryxdesign/lab` `DiffViewer`, `parseUnifiedDiff`, `createDiffFile`, and type exports re-export the Core ones, marked deprecated with static metadata, for one release, and are then removed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `spec:AST-017` FR29, FR29a                                                       | settled            |
| FR15 | The root carries `diff-viewer` and reflects `viewMode`; the file header carries `diff-viewer-header`; the path carries `diff-viewer-path`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Current source; `architecture:component-theming-surface`                         | settled            |

### Allowed variation

- **AV1 — Syntax paint.** A syntax theme may restyle tokens, row tints, gutters,
  and hunk headers through the diff slots CodeBlock owns.
- **AV2 — Caller content.** `headerEnd` and annotation content vary; DiffViewer
  places them and never inspects them.

### Representative states

| State                        | Required invariant                                                                          | Allowed variation             |
| ---------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------- |
| Unified, open                | Header, hunk headers, numbered lines, glyphs, and tints; disclosure `aria-expanded="true"`. | Language, syntax theme.       |
| Split                        | Two named side tables with paired rows of equal height that scroll sideways together.       | Wrapped or unwrapped.         |
| Collapsed                    | Header only; `aria-expanded="false"`; no hunk rows rendered.                                | Controlled or uncontrolled.   |
| Not collapsible              | Path as plain text; hunks always shown.                                                     | —                             |
| Annotated, with line buttons | Annotation rows under their lines; anchor-side numbers are named buttons in the Tab order.  | Annotation content.           |
| Folded                       | "Large change" row with its button; an annotated line opens its fold.                       | Replaced block or large file. |
| Binary or no hunks           | The matching message in place of hunks.                                                     | —                             |
| Right-to-left page           | Header and annotation content follow the page; the hunk area stays left to right.           | —                             |
| Forced colors                | Every changed line keeps a visible marker.                                                  | Glyphs or bars.               |

### Transformation and precedence order

- **ORD1 — Language.** `language`, then a listed `codeLanguages` value (a later
  entry wins), then a built-in, then plain text.
- **ORD2 — Open state.** A controlled `isOpen`, then the internal state seeded by
  `defaultIsOpen`, which defaults to open.
- **ORD3 — Fold.** A reader's toggle for the current file, then an annotated
  hidden line (open), then folded.

### Performance and resources

- **PR1 — No windowing.** Every row renders as plain DOM. A file with more than
  2,000 changed lines outside replaced blocks renders its folded lines only
  when the reader opens the fold (FR10).
- **PR2 — No resource of its own.** DiffViewer adds no document listener, timer,
  or observer beyond the scroll areas `useScrollableArea` measures and the
  shared highlight styles CodeBlock injects once.

Current measurements belong in the audit record; this subsection owns only
durable constraints and their verification target.

## Accessibility contract

- **AR1 — The diff is a named table.** Unified view is one table and each split
  side is a table in a group named "Original code" or "Changed code". Every
  column has a screen-reader header: "Original line number", "Changed line
  number", "Change", and "Code", "Original code", or "Changed code". The hunk
  area is a scroll area named by the path, else "Diff", that takes keyboard
  focus while it overflows (`spec:AST-025`).
- **AR2 — A change never reads through colour alone.** Every changed line
  carries a hidden "Added" or "Removed" label, and a visible marker stays under
  forced colors (FR4). The line counts are hidden from assistive technology,
  which hears one sentence such as "12 lines added, 3 lines removed".
- **AR3 — The disclosure is a native button.** It follows the WAI-ARIA APG
  disclosure pattern: a `<button>` with `aria-expanded` and `aria-controls`,
  named by the path it holds (FR7).
- **AR4 — Line-number buttons are named, reachable targets.** Each is a native
  button in the Tab order, named for its side and line, with a press width of
  at least 24 px (FR9).

## Design relationships

| Anatomy or state  | Design requirement                                      | Representation authority | Hierarchy role | Component contract |
| ----------------- | ------------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| File header       | Path, status, and counts on one row above the hunks.    | Current source           | Supporting     | FR1, FR7           |
| Hunk area         | Code rows coloured by the syntax-theme diff slots.      | `component:CodeBlock`    | Prominent      | FR2–FR6            |
| Large-change fold | A labeled row with one button in place of folded lines. | Current source           | Supporting     | FR10               |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Frame": {"target": "diff-viewer"},
  "File header": {"target": "diff-viewer-header"},
  "Disclosure toggle": {"inherits": "diff-viewer-header"},
  "Chevron": {"delegatesTo": {"owner": "component:Icon", "target": "icon"}},
  "File path": {"target": "diff-viewer-path"},
  "Status token": {
    "delegatesTo": {"owner": "component:Token", "target": "token"}
  },
  "Line counts": {"inherits": "diff-viewer-header"},
  "Header end": {
    "none": {
      "reason": "intentional: caller content keeps its own styling and has no component-owned paint target"
    }
  },
  "Hunk area": {"inherits": "diff-viewer"},
  "Annotation row": {
    "none": {
      "reason": "intentional: caller content keeps its own styling, and the row takes the surface of the line above it"
    }
  },
  "Large-change fold": {"inherits": "diff-viewer"}
}
```

Rows, gutters, and hunk headers take their paint from the syntax-theme diff
slots `component:CodeBlock` owns, so a syntax theme styles them rather than a
DiffViewer target.

## Family and system relationships

- `component:CodeBlock` owns the tokenizer, the languages and their inference
  rule (FR12, FR13), and the syntax-theme diff slots (DEC-1); DiffViewer reuses
  them, so one syntax theme styles a CodeBlock diff and a DiffViewer alike.
- `component:Text` FR3 owns how Text wraps a long word; wrapped code and
  annotation content set Text's wrap so text inside them wraps the same way.
- `spec:AST-025` owns scroll measurement, scroll focus, and the scroll area's
  name and keyboard access; DiffViewer owns its viewport and pane structure.
- `architecture:public-component-api` INV19 and INV21 own the named feature prop
  and its one shared config (DEC-1).
- `architecture:internationalization` owns the catalog; every DiffViewer string
  is a translated `@astryx.diffViewer.*` key.
- `spec:AST-094` FR42 owns coarse-pointer touch targets. FR42 gap: the
  disclosure and line-number buttons take no hit area toward 44 px under a
  coarse pointer; the fold button is a Button and takes Button's.

## Verification map

| Contract  | Verification                                                                                                                     | Representative states                                                                   | Mutation or failure expectation                                                                                              | Audit section               |
| --------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| FR1, FR11 | `DiffViewer.test.tsx` path, counts, status, rename, binary, and no-change cases                                                  | Modified, added, deleted, renamed, binary, and empty files                              | A missing or wrong path, status, count, or message fails.                                                                    | `audit:DiffViewer/behavior` |
| FR2, FR6  | `DiffViewer.test.tsx` unified, split, gutter, lockstep, pane width, and overscroll cases                                         | Unified and split; wrapped and unwrapped; with and without line numbers                 | Rows that do not pair, panes that scroll apart or size apart, or overscroll left on while code overflows fails.              | `audit:DiffViewer/behavior` |
| FR3       | `DiffViewer.test.tsx` language-value and highlighting cases                                                                      | A language value; a listed and a custom language inferred from a path; new built-ins    | Changed code text, a listed value that loses to a built-in, or an unlisted module inferred fails.                            | `audit:DiffViewer/behavior` |
| FR4, AR2  | `DiffViewer.test.tsx` change-label, indicator, tint, and forced-colors bar cases; `DiffViewerForcedColors.a11y.chromium.spec.ts` | Classic, bars, and none; with and without the tint; forced colors on and off            | A changed line without its hidden label, or one without a visible marker under forced colors, fails.                         | `audit:DiffViewer/a11y`     |
| FR5       | `inlineDiff.test.ts`; `DiffViewer.test.tsx` word, char, whitespace-join, unrelated-line, and off cases                           | Word, char, and none; unrelated lines; an expanded replaced block                       | A mark on an unrelated pair, a split whitespace run, or a mark inside a replaced block fails.                                | `audit:DiffViewer/behavior` |
| FR7, AR3  | `DiffViewer.test.tsx` disclosure, default-closed, controlled, not-collapsible, and chevron cases                                 | Uncontrolled open and closed, `defaultIsOpen: false`, controlled, `false`               | A press that ignores the controlled state, a missing `aria-expanded` or `aria-controls`, or a disclosure with `false` fails. | `audit:DiffViewer/a11y`     |
| FR8       | `DiffViewer.test.tsx` annotation cases                                                                                           | Unified and split; a callback that returns a node, `null`, and `false`                  | An annotation row for a note that renders nothing, or a split row on the wrong side, fails.                                  | `audit:DiffViewer/behavior` |
| FR9, AR4  | `DiffViewer.test.tsx` line-number button, anchor-side, name, and Tab-order cases; `DiffViewer.a11y.chromium.spec.ts`             | Unified and split, LTR and RTL                                                          | A button off its anchor side, an unnamed button, arrow-key movement, or a press width under 24 px fails.                     | `audit:DiffViewer/a11y`     |
| FR10      | `DiffViewer.test.tsx` replaced-block and large-file cases                                                                        | A replaced block, a file over and at 2,000 changed lines, an annotated hidden line      | A fold that hides an annotated line, one that survives a new file, or a fold at 2,000 lines fails.                           | `audit:DiffViewer/behavior` |
| FR12      | `DiffViewer.test.tsx` root-prop case                                                                                             | `ref`, `className`, and a DOM prop                                                      | A ref or prop that misses the root fails.                                                                                    | `audit:DiffViewer/api`      |
| FR13      | `parseUnifiedDiff.test.ts`; `createDiffFile.test.ts`                                                                             | git and `diff -u` patches, bare hunks, renames, binaries; two texts, a too-large change | A file the patch holds that is missing, or a too-large change that is not one replaced block, fails.                         | `audit:DiffViewer/behavior` |
| FR14      | Lab `index.test.ts` identity and deprecation cases                                                                               | Lab imports                                                                             | A Lab export that is not the Core export, or one without the deprecation metadata, fails.                                    | `audit:DiffViewer/api`      |
| FR15      | `themingTargets.test.ts`; `scripts/check-knowledge.mjs`                                                                          | The three targets and the anatomy map                                                   | A target that leaves its part, an axis that stops reflecting, or a stale anatomy mapping fails.                              | `audit:DiffViewer/theming`  |

## Decision log

### DEC-1 — The file disclosure is one `collapsible` feature prop with the shared config

**Reference:** `component:DiffViewer/DEC-1`
**Decider:** pending engineering-owner approval

A file's disclosure is one feature with one open state. DiffViewer configures it
through one named feature prop (`architecture:public-component-api` INV19) that
takes the `CollapsibleConfig` Banner and Collapsible take, so a caller learns one
shape for every disclosure and the state lives in the shared hook (INV21).
DiffViewer keeps the hook's default, collapsible and open, because a file's
lines are what the reader came to see.

Rejected: separate `isCollapsible`, `isCollapsed`, `defaultIsCollapsed`, and
`onCollapsedChange` props, a second vocabulary for the job `CollapsibleConfig`
does.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables or examples, CodeBlock's
tokenizer and syntax-slot rules, or scroll-area rules. It links to their owners.
