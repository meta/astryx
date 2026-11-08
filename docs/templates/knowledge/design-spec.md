---
schema_version: 1
template_version: 2
kind: design
id: design:<surface>
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [<design-owner>]
review_triggers: [visual, interaction]
verified_by: [<story-or-check>]
architecture: [architecture:<surface>]
components: [component:<Name>]
families: [family:<family-name>]
deciding_specs: [spec:AST-000/DEC-0]
---

# <Surface> design specification

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## User intent

<!-- Who is affected, in which state, and what they should understand or do. -->

## Design principles

- **DR1 — `<principle>`.** `<The experience MUST …>`

## Anatomy and hierarchy

<!-- Name stable visual/interaction roles, not DOM structure. -->

| Role     | Purpose     | Required relationship |
| -------- | ----------- | --------------------- |
| `<role>` | `<purpose>` | `<relationship>`      |

## State representation

| State     | Required representation          | Allowed variation                   |
| --------- | -------------------------------- | ----------------------------------- |
| `<state>` | `<what must remain perceivable>` | `<what themes/components may vary>` |

## Responsive and input behavior

- **DR2 — `<contract>`.** `<At this constraint/input mode, the experience MUST …>`

## Accessibility intent

<!-- Human intent that complements, but does not duplicate, the technical accessibility contract. -->

## Representative examples

<!-- Public-safe design artifacts or repo-owned examples. -->

## Visual references

<!-- Public-safe normative images live in docs/design/assets/<design-id>/. -->

| Asset                             | State     | Theme or mode | Viewport        | What it demonstrates | Alt text        |
| --------------------------------- | --------- | ------------- | --------------- | -------------------- | --------------- |
| `./assets/<design-id>/<file>.png` | `<state>` | `<mode>`      | `<size or n/a>` | `<decision>`         | `<description>` |

## Component contract links

- `component:<Name>/FR1` implements `design:<surface>/DR1`.

## Decision log

### DEC-1 — `<human design decision>`

**Reference:** `design:<surface>/DEC-1`
**Decider:** `<person>`, `<YYYY-MM-DD>`

`<Reason and user impact.>`

## Open questions

- **OQ1 — `<human design question>`**

## Content boundary

This file does not define prop syntax, implementation structure, current audit
scores, or consumer examples. It links to those owners.
