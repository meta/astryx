---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-110
authority: draft
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
phase: accepted
owners: [cixzhang, josephfarina]
affects_architecture: [architecture:cli-surface, architecture:layer-runtime]
affects_families: []
affects_contributing: []
affects_consumer_docs: [cli]
---

# Swizzle output system spec

<!-- path-applicability:v1 -->

```json
{
  "paths": [
    "packages/cli/api/swizzle/**",
    "packages/cli/clients/cli/commands/swizzle*"
  ]
}
```

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

A product team runs `astryx swizzle <Name>` to own a component's source. The
copy builds in their app with no edits, answers to the same theme targets and
class names, and behaves like the package component it came from until they
change it. Core and the CLI keep that true for every component swizzle offers,
and the repository proves it before a change that could break it merges.

## Non-goals

- Which component a name copies and what `swizzle --list` reports:
  `spec:AST-035` FR11–FR12 and `architecture:cli-surface` INV28.
- Where the command runs: `spec:AST-081` FR3.
- How a product compiles StyleX for its own code or a copy: `spec:AST-080`.
- Keeping a copy the product has edited in step with later Core releases.
- Making Core's internal helpers public API (`spec:AST-017` FR21,
  `architecture:public-component-api` INV12).
- Equivalent internal implementations remain valid when they satisfy this
  contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.

## Requirements

- **FR1 — An ejected component builds on its own.** In a project with the same
  Core version and a StyleX compiler (`spec:AST-080`), the output of
  `astryx swizzle <Name>` type-checks and bundles with no edits. It imports from
  its owner package only paths that package's `exports` lists, and never a
  `./internal/*` path.
- **FR2 — The helpers it needs come with it.** Every module the component
  reaches that is not reachable through a public export is copied into the
  output, keeping its folder layout relative to the component, and copied files
  import each other by relative path. A symbol the owner package exports publicly
  is imported from that public path. Nested folders the component imports are
  copied with it. The output holds only source the component runs: tests,
  stories, spec records, and component docs are not copied. When a helper the
  copy needs already exists in the output from an earlier swizzle, an identical
  file is reused; a different file is never overwritten, even with
  `--overwrite`, which replaces only the component's own files: the new helper
  is written alongside under a version-suffixed name, and only the new copy's
  imports point at it.
- **FR3 — Shared runtime state stays single.** A module whose state coordinates
  components with each other (the layer stack, the modal outlet, interaction
  modality, the bottom-sheet stack) keeps that state in one store per document,
  under a registered key that carries the store's protocol version. A copy and
  the package component on the same protocol version use the same store, so
  stacking, Escape, focus return, and modality behave as they do with the package
  alone. A copy on another protocol version keeps a store of its own and never
  reads a store of a different shape. A context that connects a provider to its
  consumers is coordinating state too: its context object lives under the same
  kind of versioned key, so a copied `useToast` reaches the package's
  `LayerProvider`. A module whose state only caches work may be duplicated by a
  copy.
- **FR4 — Private attributes stay contained.** A module that owns a private
  data attribute, holding its name and the styles that set it, and that the
  component imports is copied whole and unedited, so callers, the copy
  included, still never write the attribute by hand.
- **FR5 — Theme targets and class names are unchanged.** The copy answers to the
  same theme targets and emits the same documented class names, data attributes,
  and custom properties as the package component of that version, so a theme,
  `xstyle`, and product CSS reach it the same way. The copy's component rules
  sit in `astryx-base` like the package component's, below `astryx-theme`, so a
  theme's component overrides apply to the copy as they do to the package
  (`spec:AST-080` FR7).
- **FR6 — Behavior matches the package.** Until the product edits it, the copy's
  keyboard handling, focus, roles, names, states, announcements, and events match
  the package component of the same version.
- **FR7 — Every offered component is proven before merge.** Before a change to
  a component package's source or to the swizzle copy merges, every component
  `swizzle --list` offers (`spec:AST-035` FR12) is ejected into a clean
  project, type-checked, bundled with a StyleX compiler, and rendered once on the
  server; a failure blocks the merge through a required check. Release checks run
  the same proof for every component and also render each copy in a real
  browser. The proof adds no required context and no wall-clock time to a pull
  request's slowest required check.

### Platform support

- Supported feature/engine floor: the product uses the same Core version the
  copy came from and a StyleX compiler that `spec:AST-080` supports; browser
  support is Core's.
- Unsupported behavior: a project without a StyleX compiler fails at import, as
  the command's output states. A copy kept across a Core upgrade is outside FR1
  and FR6.
- Browser evidence: a real-browser render of every copy at release time (FR7);
  server rendering is the pull-request smoke evidence.

## Current-state impact

- `architecture:cli-surface` points to this record for what `swizzle` writes.
- The CLI's swizzle copy follows the component's module graph (FR1–FR2, FR4),
  writes no test, story, spec, or doc file, and lists only component folders
  (FR7). The CLI owner implements and owns these changes.
- The FR7 proof joins the repository's existing required test lane
  (`spec:AST-030` FR11), selected by the shared change-scope classification and
  reported in the single pull-request report, with the full proof at release
  time.
- `architecture:layer-runtime`: the layer stack, the modal outlet, and the
  layer contexts (`LayerProvider` and its consumers, such as `useToast`) keep
  their state and context objects under versioned keys (FR3, DEC-2).
- `spec:AST-080` FR7 places a swizzled copy's component rules in `astryx-base`
  (FR5).
- The `swizzle` command doc states FR1 and FR6 for product teams.

### Known gaps

- The copy sends `../X/file` imports to the public `X` entry, which lacks the
  internal helpers, and deep StyleX modules are missing from Core's exports
  (FR1, FR2).
- Copied styles land in the app's cascade layer above the theme's, so theme
  component overrides stop applying (FR5).
- Copies include spec records and test files and leave out nested folders
  (FR2), and `swizzle --list` offers folders that are not components
  (`spec:AST-035` FR12).
- The layer stack, the modal outlet, and the layer contexts keep module state,
  so a copied Dialog, BottomSheet, or `useToast` starts its own stack or misses
  the package's provider (FR3).
- No private data-attribute owner module exists yet (FR4).

## Verification

| Contract | Verification                                                                                                     | Representative states                                                                                                                      | Mutation or failure expectation                                                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR1      | Eject every offered component into a clean project; type-check and bundle                                        | Every component in `swizzle --list`; Core, Lab, Charts, RichText, Vega                                                                     | A type or resolve error, or an import of a path the owner's `exports` lacks or of `./internal/*`, fails                                                            |
| FR2      | Import graph of each output                                                                                      | Helpers in `utils`, `hooks`, `Layer`; nested folders; colocated tests and docs; a helper an earlier swizzle wrote, identical and different | A copied file imports a module that is neither in the output nor a public export, or a test, story, spec, or doc is copied, or an existing helper is overwritten   |
| FR3      | Render a copied and a package layer component together; inspect stores; open, stack, and Escape                  | Dialog over package Popover; BottomSheet over package Dialog; modality; a copied `useToast` under the package `LayerProvider`              | Two stores of one protocol version exist in a document, or Escape and focus return differ from the package alone, or a copied consumer misses the package provider |
| FR4      | Scan each output for private data-attribute names and selectors; compare copied owner modules with the package's | Components that reach an owner module                                                                                                      | A hand-written private attribute name or selector, or an edited owner module, in the output                                                                        |
| FR5      | Render package and copy side by side under a theme with component overrides; compare                             | Default; each variant; a theme component override                                                                                          | A theme override, documented class name, data attribute, or theme target reaches one and not the other                                                             |
| FR6      | The component's own interaction and accessibility checks run against the copy                                    | Keyboard, pointer, screen-reader tree                                                                                                      | A check that passes on the package fails on the copy                                                                                                               |
| FR7      | The required test lane's swizzle proof and the release-time proof                                                | A change to component source; a change to the swizzle copy; an unrelated change                                                            | An offered component missing from the proof, or a failure that does not block                                                                                      |

Known verification gap: none of these checks exist on `main`.

## Decision log

### DEC-1 — Swizzle copies what a component needs and imports what is public

**Reference:** `spec:AST-110/DEC-1`
**Decider:** `cixzhang`, `2026-10-31`

A copy that builds is the whole value of swizzle, and the helpers a component
reaches are internal by `spec:AST-017` FR21. The copy therefore carries those
helpers with it and imports only public paths, so no internal helper becomes
public API to make a copy build.

Rejected: exporting the helpers copies need, because anything reachable from a
package path is public (`architecture:public-component-api` INV12).

### DEC-2 — Shared runtime state lives in versioned document stores

**Reference:** `spec:AST-110/DEC-2`
**Decider:** `cixzhang`, `2026-10-31`

A copy is a second bundle of the same modules. Core already keeps interaction
modality and the bottom-sheet stack in a per-document store under a registered,
versioned key so that duplicate bundles share one state; FR3 applies that rule
to every coordinating module, so copying a module never splits a stack and no
new public entry is needed.

Rejected: a public runtime entry that copies import instead of copying, because
it makes the coordinators public API with a compatibility promise only copies
need.

## Open questions

- None.
