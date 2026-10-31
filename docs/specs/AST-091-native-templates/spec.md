---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-091
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
phase: proposed
owners: [cixzhang]
affects_architecture: []
affects_families: []
affects_contributing: []
affects_consumer_docs: []
---

# Native templates system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

A person using a native app started from an Astryx template gets the same
template behavior they get from the web template: the same words, values,
validation, and states after the same steps. Each native platform draws the
template with its own controls and conventions.

A native template is plain source for one platform, with its own state, like a
catalog template is for the web. A person copies it from the Astryx repository
into their app by hand and owns it from then on; Astryx publishes nothing for
native templates. One scripted scenario
keeps each native template in step with the web template it mirrors.

## Non-goals

- Which templates gain a native version, and in what order.
- Component contracts and how a component is drawn on a platform
  (`spec:AST-082`, `spec:AST-093`).
- Copying a native template into an app through the CLI.
- Saving or syncing a template's data, sign-in, and product backends.
- A screen built from a generic component tree rather than a template.
- Equivalent internal implementations remain valid when they satisfy this
  contract.

## Requirements

- **FR1 — A native template mirrors one catalog template.** A native template
  is kept in the `@astryxdesign/native` source tree, in its platform package's
  versioned templates directory, such as `swift-ios-<n>/templates/`, and names
  the catalog page template it mirrors by its id.
- **FR2 — A native template is plain platform source.** It keeps its own state
  and logic in its platform's language and draws with that platform's Astryx
  components (`spec:AST-093`). It shares no template logic, state, or generated
  per-template types with the web template or with other platforms.
- **FR3 — One scenario keeps the web and native templates in step.** A native
  template has one scripted scenario: each step a gesture located by role and
  accessible name, and the words, values, validation, and states the person
  sees after it. The scenario replays unchanged on the catalog web template and
  on every native version, and each shows the expected result after every step.
  It is that template's scenario under `spec:AST-082/FR12`. The scenario and
  its check live with the native template's source and run with
  `@astryxdesign/native`'s tests: a catalog change that breaks it fails the
  native template, which is updated to match, and never blocks the catalog
  change.
- **FR4 — The catalog is unchanged by native templates.** A catalog template's
  source, metadata, and `astryx template` output are the same whether or not a
  native template mirrors it. Nothing in `@astryxdesign/core` or
  `@astryxdesign/cli` imports a native template (`spec:AST-082/FR14`).
- **FR5 — Nothing ships for native templates.** Native template source, its
  tests, and its scenario are excluded from every published artifact: the npm
  package's files, every package export and entry point, and every Swift
  product; the npm package's `files` leave out every templates directory. They
  exist only as source in the Astryx repository, which a person copies into
  their app by hand, and an app never depends on Astryx for a native template at
  run time. Catalog templates differ: they ship inside `@astryxdesign/cli` and
  reach people through `astryx template`
  (`architecture:template-authoring/INV8`).

### Platform support

- Supported feature/engine floor: each native template targets its platform
  package's floor, such as iOS 17 for `swift-ios-<n>`. The web floor is
  unchanged.
- Unsupported behavior: a platform with no native version of a template has no
  source for it, and Astryx renders nothing in its place.
- Browser evidence: FR3 replays the scenario on the catalog web template in a
  browser; native claims are proven by the same replay on devices.

## Current-state impact

- Versioned platform packages such as `swift-ios-<n>` do not exist on main yet;
  the only platform package is `packages/native/apple/`, which holds no
  templates. When a platform package gains a templates directory, FR5 requires
  `@astryxdesign/native`'s `files` to leave it out.
- `@astryxdesign/native` gains native templates in each platform package's
  templates directory, each with a scenario.
- No catalog template, CLI command, published artifact, or architecture record
  changes.
- No native template has a scenario yet.

## Verification

| Contract | Verification                                                                                                         | Representative states                             | Mutation or failure expectation                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| FR1      | Native package check that every native template names an existing catalog template                                   | a template with an iOS version                    | A native template names a missing catalog id                                                                       |
| FR2      | Source review and dependency check of each native template                                                           | a template's state, validation, and text          | A native template imports template logic or generated per-template types shared with the web or another platform   |
| FR3      | Scenario replay on the catalog web template and on each native version                                               | every step of each template's scenario            | Any native version or the web template shows a different result after a step, or a catalog change is blocked by it |
| FR4      | Catalog and CLI output comparison with and without native templates, plus a dependency check                         | each catalog template a native template mirrors   | Catalog source, metadata, or copy output differs, or core or the CLI imports a native template                     |
| FR5      | `npm pack` file list of `@astryxdesign/native`, its `files` and exports map, and the products of every Swift package | each native template, its tests, and its scenario | A packed file, export, entry point, or Swift product contains or exposes native template source                    |

## Decision log

### DEC-1 — The catalog web template stays separate from native templates

**Reference:** `spec:AST-091/DEC-1`
**Decider:** cixzhang, 2026-10-23

Native support is experimental, so the catalog web template stays exactly as
it is and native templates keep their own state. A parity scenario, not a
shared implementation, keeps web and native behavior the same, and web callers
take on no change or risk from native work.

Deferred: one implementation shared by the web and native templates,
considered when native support leaves the canary channel
(`spec:AST-082/FR15`).

### DEC-2 — Native templates are cloned, and nothing ships for them

**Reference:** `spec:AST-091/DEC-2`
**Decider:** cixzhang, 2026-10-23

Templates are starting points a person owns once they clone them. Anything an
app imports from Astryx for a native template at run time, code or logic,
becomes an API callers depend on and Astryx must keep stable, so native
templates are source only.

Rejected: a portable view model shared by a template's native versions,
because it is template logic Astryx would ship and maintain.

## Open questions

No question is open.
