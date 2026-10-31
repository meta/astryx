---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-093
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-24
phase: accepted
owners: [cixzhang]
affects_architecture: []
affects_families: []
affects_contributing: []
affects_consumer_docs: []
---

# Native component guidelines system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

A person using an app built with `@astryxdesign/native` gets controls that look
and behave like their platform's own, carry the app's brand wherever the
platform leaves room for it, and were checked the same way every time.

A contributor building a native component writes a short spec for it in one
place and one shape, follows three guidelines in a fixed order (native-first,
then the platform's own design guidelines, then the theme for everything else),
and proves the result with the same tests and captures as every other native
component. Native components start in Swift, for iOS and macOS.

This record applies `spec:AST-082` to the work of specifying, building,
validating, and reviewing individual native components while
`@astryxdesign/native` is canary-only (`spec:AST-082/FR15`).

## Non-goals

- Which way of building a platform wins. `spec:AST-082/FR12` decides that by
  measurement.
- Supported OS versions (`spec:AST-082/OQ4`) and performance thresholds
  (`spec:AST-082/OQ1`).
- A component's core contract: its shared props, states, words, and
  accessibility semantics. The component's own record and `spec:AST-082/FR3`
  own them.
- Guidelines for Android and Windows (OQ1).
- Web components and `@astryxdesign/core`.
- Equivalent internal implementations remain valid when they satisfy this
  contract.

## Requirements

- **FR1 — A native component's spec lives beside its implementation.** Each
  native component has its own folder in its language's implementation, named
  as the core component, and its spec is `<Name>.spec.md` in that folder, as
  core does (`packages/core/src/<Name>/<Name>.spec.md`). Each language has one
  implementation package; for Swift that is `packages/native/apple/`, and the
  spec is `packages/native/apple/Sources/Astryx/<Name>/<Name>.spec.md`, beside
  the component's views. `<Name>` is the core component's name. The spec is a
  knowledge record of kind `component` with id `component:<language>/<Name>`
  that names its core component in `platform_of`, built from
  `docs/templates/knowledge/component-spec.md`
  (`architecture:knowledge-contracts` INV27). Until the core component has its
  own record, `platform_of` still names `component:<Name>`, and the core
  component's public source and documentation stand in as its contract. One spec covers every implementation of the
  component in that language, on every platform the language serves (Swift
  serves `ios` and `macos`). Rules that apply across a language's components
  are architecture records under `packages/native/specs/<language>/`, named
  `<slug>.spec.md`. A merged native component spec
  describes that component's implementations in that language. It never changes
  the core contract and never contradicts `spec:AST-082` or this record; where
  it does, they win.
- **FR2 — Native-first comes first.** A native component uses the platform's
  own control when one satisfies its contract (`spec:AST-082/FR11`). In Swift
  that is a SwiftUI control, or a UIKit or AppKit control where SwiftUI has
  none. A component draws its own control only where the platform has none, and
  its spec names the platform control it looked for and why it does not fit.
- **FR3 — Apple platforms follow the Apple Human Interface Guidelines.** On
  `ios` and `macos`, presentation and interaction follow the Apple Human
  Interface Guidelines: layout and spacing conventions, minimum hit targets,
  Dynamic Type, SF Symbols (`spec:AST-082/FR17`), system materials, motion
  including Reduce Motion, haptics, and VoiceOver. Each spec names the guideline
  pages it follows. The core contract keeps the component's meaning, words,
  states, and accessibility semantics; the guidelines decide how the platform
  presents them, except that a choice between presentations by screen size uses
  the compact definition of `spec:AST-012` FR9 rather than size classes.
- **FR4 — Brand shows through the theme everywhere else.** What FR2 and FR3
  leave open, such as accent and fill color, type family, corner shape,
  spacing, and icon choice, comes from the app's theme: tokens from its
  `defineTheme` definition (`spec:AST-082/FR18`) and native intent and platform
  entries from `defineNativeTheme` (`spec:AST-082/FR10`). A component reads
  every such value from the theme, never hard-codes one, and never adds a
  visual prop for one platform (`spec:AST-082/DEC-2`). Each spec lists the
  theme values the component reads.
- **FR5 — Every native component is tested and validated the same way.** A
  change to a native component ships with:
  - unit tests in its package's test target for parameter mapping, defaults,
    and state changes, built and run on every platform the package supports;
  - parameters named and typed as the platform's generated contract for the
    component (`spec:AST-082/FR5`): the core props every platform honors plus
    that platform's own props (`spec:AST-082/FR3`), never a prop kept for parity
    alone, with the contract drift tests passing, except for the
    interim Swift views listed in Current-state impact;
  - accessibility assertions for the label, traits, and value the core
    contract requires, plus a check at the largest Dynamic Type size;
  - a check that the component renders from two different themes with no
    value of its own in between;
  - captures of every state from a simulator or device, in light and dark and
    at the largest text size, attached to the change. Native-first, guideline,
    and brand claims rest on these captures, never on source or style values
    (`spec:AST-082/FR12`). A claim that could not be captured is reported as not
    measured.
- **FR6 — Native changes from the native group are approved after a spec
  review.** A pull request whose every changed file is under `packages/native/`,
  and whose author and every commit author are members of the native group, is
  approved by an engineering owner on its exact head, without a separate code or
  design review, once all three hold: its required checks pass; the review app
  has reviewed that exact head and names no defect; and a review of the change
  against `spec:AST-082`, this record, and the native spec of every component it
  touches finds every requirement they define met. Behavior a spec defines must
  match it, and a change that breaks such a requirement is not approved.
  Behavior no spec defines yet does not block approval, as in the lab package:
  the review records each such behavior as a spec gap so a spec can follow. The
  native group is the GitHub accounts `cixzhang`, `ejc3`, `ejhammond`,
  `ernestt`, `imdreamrunner`, and `vjeux`. A pull request that changes any file
  outside `packages/native/`, or that carries a commit from anyone else, follows
  the repository's normal review gate. A request for changes from any reviewer
  still blocks the merge. Changing the group is a change to this record.

### Platform support

- Supported feature/engine floor: each Swift package declares its own platforms
  and OS versions until `spec:AST-082/OQ4` is settled.
- Unsupported behavior: a capability newer than the running OS degrades as
  `spec:AST-082/FR11` requires; a component never renders a blank or broken
  state.
- Browser evidence: none. Native claims are proven by captures from a
  simulator or device (FR5).

## Current-state impact

- `@astryxdesign/native` gains `packages/native/specs/`, holding one directory
  per language, starting with `swift/`. The directory is not published.
- The Swift specs under `packages/native/specs/swift/` and the package template
  `packages/native/specs/TEMPLATE.md` predate FR1's record form. They convert
  to knowledge records in one change, which removes the template. Until then,
  the package READMEs still name the template, and a new component spec follows
  FR1 instead.
- No architecture, family, contributing, or consumer-doc record changes.
- No native component spec exists yet.
- Component folders live inside a language's implementation package. For
  Swift that is `packages/native/apple/`, whose `Astryx` product holds the
  SwiftUI views.
- The first Swift views in the `Astryx` product (Banner, Button, Card, Heading, Text,
  and TextInput) take hand-written parameters, including `action` for the
  contract's `onClick`, until they move to the generated contracts. Until then
  they are the only native components exempt from FR5's generated-parameter
  requirement; every other FR5 check applies to them. A new view never takes
  this exemption.
- Swift tests run as Swift package tests, where SwiftUI exposes no
  accessibility tree, so FR5's accessibility assertions check the label,
  traits, and value a view sets, not the tree VoiceOver reads. Until an
  app-hosted iOS test target exists, a change reports the rendered tree's
  accessibility as not measured, as FR5 reports a claim it could not capture.
  Every other FR5 check applies.

## Verification

| Contract | Verification                                                                                                                 | Representative states                                                                                                                                        | Mutation or failure expectation                                                                                                                                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Review of the spec's path beside the component, plus `pnpm check:knowledge` on its record frontmatter, id, and `platform_of` | a spec per language; a spec for a component with no core contract                                                                                            | A component spec outside its component's folder, without valid record frontmatter, under another id, naming no core component, or renaming a core prop passes                                                                             |
| FR2      | The spec's account of the platform control it builds on, or why none fits, and the state captures                            | a component built on a platform control; a component with no platform control                                                                                | A component draws its own control where a platform control fits, with no reason in its spec                                                                                                                                               |
| FR3      | The spec's account of the platform guidelines it follows, and the captures                                                   | hit target size; largest Dynamic Type; Reduce Motion; VoiceOver focus                                                                                        | A capture shows a hit target below the platform minimum or text that does not scale                                                                                                                                                       |
| FR4      | Theme test with two themes, plus source review for literals                                                                  | default theme; a second theme with different color, type, and shape                                                                                          | A brand value stays the same across both themes, or a platform-only visual prop is added                                                                                                                                                  |
| FR5      | The package's tests on every supported platform and the captures attached to the change                                      | light; dark; largest text; every state the core contract names                                                                                               | A change merges without tests, without captures, or with a capture-based claim backed only by source                                                                                                                                      |
| FR6      | Changed paths, commit authors, the review app's exact-head review, the spec review's findings, and the approval              | all native paths by group members; a spec-defined requirement unmet; behavior no spec defines; a path outside `packages/native/`; a commit from someone else | An approval without an exact-head review-app pass or a spec review, an approval with a spec-defined requirement unmet, an out-of-scope pull request approved without review, or an in-scope one blocked only for behavior no spec defines |

## Decision log

### DEC-1 — Platform conventions decide first; the theme fills what they leave open

**Reference:** `spec:AST-093/DEC-1`
**Decider:** cixzhang, 2026-10-23

A person on iOS or macOS expects controls to look and act like the rest of
their device, so the platform's own control and the Apple Human Interface
Guidelines decide first. An app's identity still matters, so everything the
platform leaves open comes from the theme the app already defines once for
every surface.

Rejected: matching the web rendering pixel for pixel, because it overrides the
platform conventions the person relies on.

### DEC-2 — Native changes from the native group merge on a spec review

**Reference:** `spec:AST-093/DEC-2`
**Decider:** cixzhang, 2026-10-23

`@astryxdesign/native` publishes only to the canary channel, so no stable user
receives a native change. While the experiment runs, the people building it
need to land components quickly, so a native change waits on no separate code
or design review. The specs stay the contract: every change is reviewed against
them before approval, and a spec-defined requirement it breaks blocks it.
Behavior no spec covers yet is welcome, as in the lab package, and becomes a
spec gap to close rather than a reason to wait. Required checks, captures, and
any reviewer's request for changes still protect the branch.

Rejected: approving on passing checks alone, because a change that breaks a
spec would merge unreviewed.

## Open questions

- **OQ1 — Which guidelines apply on Android and Windows?** (`human-design`)
  Each platform's first native component needs the counterpart of FR3 before it
  merges.
