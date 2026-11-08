---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-032
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-22
phase: accepted
owners: [cixzhang, imdreamrunner]
affects_architecture: [architecture:icon-resolution-and-component-slots]
affects_families: []
affects_contributing: []
affects_consumer_docs: [FileInput, ChatSendButton, Icon]
---

# Upload and send icon theming

## Intent

Let themes choose the artwork for FileInput's upload affordance and
ChatSendButton's send action without repainting any other icon. Upload is a
shared semantic icon: any surface that uploads can render it, and each theme
draws it in its own style. Send is a ChatSendButton role that a theme maps to a
shared icon.

## Non-goals

- Adding a shared `send` name.
- Changing the meaning or artwork of the shared `arrowUp` icon.
- Changing FileInput or ChatSendButton interaction, layout, sizing, or
  accessibility.
- Removing or changing ChatSendButton's existing `sendIcon` prop.
- Changing ChatSendButton's stop-state icon.
- Prescribing a particular upload, send, or directional drawing.
- Choosing which other components render `upload`; each component's own
  contract decides that.

## Requirements

- **FR1 — Upload is a shared icon.** `IconName` MUST include `upload`, the
  shared meaning for sending files or content from the person's device.
  FileInput's upload affordance MUST render `upload` in both input and dropzone
  modes.
- **FR2 — Send is a ChatSendButton role.** `ComponentIconSlotMap` MUST include
  `chat-send-button-send`. ChatSendButton's send state MUST resolve that slot
  with `arrowUp` as its fallback.
- **FR3 — Existing instance configuration keeps precedence.** An explicit
  `ChatSendButton.sendIcon` MUST continue to win over the active theme's
  component-slot mapping. FileInput exposes no instance prop for its upload icon.
- **FR4 — Themes draw upload and map send independently.** A theme MAY draw
  `upload` through its `icons` map, as it draws any shared name, and MAY map
  `chat-send-button-send` to an existing shared `IconName` or to `null` through
  `componentIcons`. Drawing `upload` MUST NOT change `arrowUp` or any other
  shared name, and mapping the send slot MUST NOT change `upload`.
- **FR5 — Defaults keep geometry and accessibility.** With no theme artwork for
  `upload`, FileInput MUST render the default `upload` artwork with its existing
  size, placement, color, and accessible behavior. That default MUST depict
  uploading and MUST be distinguishable from `arrowUp`. With no slot mapping and
  no `sendIcon`, ChatSendButton MUST render `arrowUp` with its existing size,
  placement, and accessible behavior. Sortable Table and every other `arrowUp`
  consumer MUST remain unchanged.
- **FR6 — Every shipped registry draws upload.** The default registry, each
  bundled theme, and each CLI theme template MUST supply `upload` artwork in
  that registry's own style. The public `IconRegistry` type describes a complete
  registry and MUST require `upload` like every other shared name. A consumer
  migrates by adding an `upload` entry drawn in its registry's style.
- **IR1 — Owner surfaces stay synchronized.** For upload: `IconName`, the
  default registry, every bundled theme and CLI theme template, the documented
  lists of shared icon names, FileInput source and docs, and focused registry
  and FileInput tests MUST change together. For send: the public
  component-slot map, ChatSendButton source, its component documentation and
  current contract, and focused resolver and component tests MUST change
  together.

### Platform support

- Supported feature/engine floor: unchanged from the current icon resolver.
- Unsupported behavior: unchanged; a theme without `upload` artwork or a send
  slot mapping uses the default artwork or the component fallback.
- Browser evidence: FileInput's default glyph changes, so real-browser visual
  evidence MUST show both FileInput modes rendering the upload artwork with
  unchanged geometry in the shipped themes. ChatSendButton's default needs none
  because its artwork and geometry do not change; resolver and component tests
  cover slot precedence and fallback.

## Current-state impact

Current `main` renders the shared `arrowUp` icon directly for both roles:

| Owner                       | Instance override | Theme control                | Default                  |
| --------------------------- | ----------------- | ---------------------------- | ------------------------ |
| FileInput upload affordance | none              | `icons.upload`               | default `upload` artwork |
| ChatSendButton send state   | `sendIcon`        | `chat-send-button-send` slot | `arrowUp`                |

FileInput's default glyph changes from a directional arrow to the upload
artwork; its size, placement, color, and accessible behavior stay the same.
FileInput stops following a theme's `arrowUp` artwork: a theme restyles it
through `upload`, and a theme without `upload` artwork shows the default upload
artwork there. ChatSendButton keeps its default artwork and resolves its own
slot once that slot is implemented. Every Astryx-shipped registry gains an
`upload` entry, and complete registries require `upload` (FR6).

## Verification

| Contract | Verification                                                                                                                           | Representative states                                                        | Mutation or failure expectation                                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Icon public-type and registry tests; rendered FileInput tests                                                                          | default registry, theme `icons.upload`, input and dropzone modes             | `upload` missing from `IconName`, FileInput reading another name, or theme `upload` artwork not reaching FileInput fails.                   |
| FR2–FR3  | component-slot type and resolver tests; rendered ChatSendButton precedence tests                                                       | default theme, mapped name, explicit `null`, explicit `sendIcon`             | A missing or misspelled slot, direct `arrowUp` lookup, ignored mapping, or a theme overriding caller content fails.                         |
| FR4      | registry resolution tests with independent theme overrides                                                                             | theme drawing only `upload`; theme mapping only the send slot                | Theme `upload` artwork that changes `arrowUp` or another name, or a send mapping that changes `upload`, fails.                              |
| FR5      | focused FileInput and ChatSendButton tests; existing Table tests; real-browser visual evidence                                         | unthemed and shipped themes; light and dark; input, dropzone, send, and sort | Changed geometry or accessible output, an `upload` default identical to `arrowUp`, or any changed `arrowUp` consumer fails.                 |
| FR6      | public-type tests; registry completeness tests over the default registry, bundled themes, and CLI theme templates; theme fallback test | complete registry; theme without `upload` artwork                            | A shipped registry without `upload`, a complete registry without `upload` that compiles, or an omitted `upload` that renders nothing fails. |
| IR1      | `pnpm check:knowledge`, focused docs/source consistency assertions                                                                     | shared icon-name lists, component docs, current contracts, public types      | A stale owner surface or an undocumented shared name blocks the implementation.                                                             |

## Decision log

### DEC-1 — Send is a ChatSendButton role

**Reference:** `spec:AST-032/DEC-1`
**Decider:** `cixzhang`, `2026-09-22`; amended `2026-10-05`

ChatSendButton's send action is a component-owned role. It receives the
`chat-send-button-send` slot under the current component icon architecture,
with `arrowUp` as the compatibility fallback, and the existing `sendIcon` prop
remains the highest-precedence choice.

Rejected: continuing to read `arrowUp` directly, because themes could not then
choose the send icon without repainting every `arrowUp`.

### DEC-2 — Upload is a shared icon

**Reference:** `spec:AST-032/DEC-2`
**Decider:** `cixzhang`, `2026-10-05`

Uploading is a general action with a conventional glyph distinct from
directional arrows. As a shared name, `upload` is drawn once per theme in that
theme's style, and every surface that uploads renders the same theme-drawn
glyph. A shared name is permanent public vocabulary, so one is added on the
owner's design direction rather than on a count of current consumers. `upload`
meets that bar: designers need to draw a real upload glyph, and no existing
shared name can carry it.

Rejected: a `file-input-upload` component slot, because a slot maps only to an
existing shared name and so cannot give upload artwork of its own.

### DEC-3 — Complete registries require upload

**Reference:** `spec:AST-032/DEC-3`
**Decider:** `cixzhang`, `2026-10-05`

A complete registry lists every shared name, so `IconRegistry` requires
`upload` like the rest: a complete theme registry that type-checks draws upload
in its own style instead of silently borrowing the default artwork.

Rejected: a permanently optional `upload`, because it would be the only shared
name a complete registry could leave out.

## Deprecation and cleanup records

### DEP-0012 — Deprecate complete `IconRegistry` types that omit `upload`

| Field            | Value                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| id               | `DEP-0012`                                                                                                    |
| cleanup          | `CLN-0021`                                                                                                    |
| package          | `@astryxdesign/core`                                                                                          |
| surface          | The public `IconRegistry` type accepting a complete registry that omits `upload`                              |
| old contract     | A complete registry typed as `IconRegistry` may omit `upload`; the omitted entry resolves the default artwork |
| replacement      | Add an `upload` entry in the registry's own style; `IconRegistry` already accepts it                          |
| direct authority | FR6 and DEC-3. Owners: `spec:AST-032`: `cixzhang`, `imdreamrunner`                                            |
| warning          | Consumer docs and the release notes name `DEP-0012`. No runtime warning (`spec:AST-017` FR29)                 |
| migration        | Non-mechanical: draw `upload` artwork in the registry's style                                                 |
| codemod          | None: icon artwork is bespoke to each theme and cannot be synthesized                                         |
| downstream       | The default registry, every bundled theme, and every CLI theme template supply `upload`                       |
| transition       | no prior transition                                                                                           |
| state            | `deprecated`                                                                                                  |
| open decision    | None beyond listing `CLN-0021` in the minor plan                                                              |
| target plan      | `CLN-0021` in the next minor release, as FR6 schedules                                                        |

### CLN-0021 — `IconRegistry` requires `upload`

| Field     | Value                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| id        | `CLN-0021`                                                                                                   |
| lifecycle | `DEP-0012`                                                                                                   |
| delta     | `IconRegistry` is `Record<IconName, ReactNode>`: a complete registry that omits `upload` fails to type-check |
| rollback  | Restore the transitional optional `upload` from the final-patch baseline                                     |
| state     | `pending` — lands in a declared minor with its `[breaking]` Changeset                                        |

## Open questions

None.
