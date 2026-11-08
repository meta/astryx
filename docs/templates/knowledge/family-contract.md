---
schema_version: 1
template_version: 2
kind: family
id: family:<family-name>
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [<owner>]
review_triggers: [behavior, layout, theming, accessibility]
verified_by: [<test-or-check>]
members: [component:<Name>]
architecture: [architecture:<surface>]
contributing: [contributing:<surface>]
deciding_specs: [spec:AST-000/DEC-0]
---

# <Family name> contract

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

## Membership rule

`members` is the candidate family's source of proposed membership while this
record is `draft`. Existing component records do not backlink until the family is
`current`.

A component belongs when `<observable responsibility>` is its primary purpose
and it must follow `<shared contract>`. List explicit exclusions and collaborating
components that influence members without joining the family.

- **Members:** `<components that satisfy the rule>`
- **Collaborators:** `<layout, grouping, or infrastructure components>`
- **Excluded:** `<nearby components and why they do not satisfy the rule>`

## Shared owner

- `<shared concept>` is owned by `<primitive, hook, or seam>`.

## Canonical concepts

| Concept     | Values or states | Default semantics | Stability                  |
| ----------- | ---------------- | ----------------- | -------------------------- |
| `<concept>` | `<values>`       | `<meaning>`       | `<stable or experimental>` |

## Cross-component invariants

- **FR1 — `<invariant>`.** `<Every member MUST …>`

## Allowed component variation

- **AV1 — `<dimension>`.** `<Members MAY … because …>`

## Representative matrix

| Member and state               | Shared invariant | Deliberate variation |
| ------------------------------ | ---------------- | -------------------- |
| `component:<Name>` / `<state>` | `<invariant>`    | `<variation>`        |

## Adoption and exceptions

| Component          | Adoption      | Exception decision |
| ------------------ | ------------- | ------------------ |
| `component:<Name>` | `<mechanism>` | `none`             |

## Verification map

| Contract | Verification                 | Representative members and states | Mutation or failure expectation               |
| -------- | ---------------------------- | --------------------------------- | --------------------------------------------- |
| FR1      | `<test or browser evidence>` | `<members/states>`                | `<a component-specific fork makes this fail>` |

## Decision links

- `spec:AST-000/DEC-0` — `<shared-system ruling>`

## Open questions

- **OQ1 — `<question>`** (`checkable | human-design | human-api`)

## Content boundary

This file owns only cross-component family behavior. It does not repeat
component-local contracts, consumer docs, current audit results, or system-spec
rationale.
