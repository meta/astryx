---
schema_version: 2
template_version: 2
kind: theme
id: theme:<package-theme-name>
authority: draft
approved_by: null
approved_at: null
review_triggers: [tokens, component-mappings, contrast, artifacts]
verified_by: [<test-or-evidence>]
package: '@astryxdesign/theme-<name>'
source_theme: packages/themes/<name>/src/<name>Theme.ts
references: [architecture:<surface>, design:<contrast-methodology>]
---

# <Theme name> theme specification

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent and audience

## Inheritance and base

## Portable token overrides

## Theme-local role definitions

<!-- Record factual theme-owned roles and evidence. Public theme API proposals belong in a separate system spec. -->

## Tonal palette definitions

<!-- Record factual palette inventory and evidence. Palette generation or artifact APIs belong in a separate system spec. -->

## Component and state mappings

## Compatibility and migration

## Accessibility and contrast evidence

<!-- Link the current cross-theme design record that owns human visual and
accessibility methodology. This theme owns only its application: selected
foreground/background or graphical-object pairings, required modes and states,
exceptions, measured receipts, and known gaps. Do not copy shared methodology or
measurement-tool implementation here. If no current design record exists, keep
the dependency in Open questions; a current theme record cannot reference a
draft or nonexistent record. -->

## Build and artifact contract

## Verification map

| Theme contract  | Evidence             | Representative states | Failure signal                 |
| --------------- | -------------------- | --------------------- | ------------------------------ |
| `<requirement>` | `<test or artifact>` | `<modes and states>`  | `<what regression looks like>` |

## Decision log

## Open questions

## Content boundary

This record owns this theme's intent, selected token/palette mappings, required
pairings and states, theme-specific exceptions, measured receipts, known gaps,
compatibility, artifacts, and evidence. A current cross-theme design record owns
human contrast methodology; shared measurement/tool implementation belongs to
architecture or tooling. Cross-theme APIs belong to separate architecture or
system specs. Component behavior belongs to component or family records.
Consumer syntax and examples belong to consumer docs.
