---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-000
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
phase: proposed | accepted | implementing | shipped | withdrawn
owners: [<owner>]
affects_architecture: [architecture:<surface>]
affects_families: [family:<family-name>]
affects_contributing: [contributing:<surface>]
affects_consumer_docs: [<doc-id>]
---

# <Change> system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

<!-- State the person/task and the durable observable outcome this spec owns. -->

## Non-goals

- `<adjacent behavior this decision does not settle>`
- Equivalent internal implementations remain valid when they satisfy this contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.

## Requirements

<!-- Contract supported inputs, observable outputs/states, failure or degradation behavior, defaults, exceptions, compatibility, and caller-visible ownership. -->

- **FR1 — `<observable behavior>`.** `<The system MUST expose or preserve …>`

### Platform support

- Supported feature/engine floor: `<matrix or canonical consumer-doc link>`
- Unsupported behavior: `<required fallback, graceful degradation, or prohibition>`
- Browser evidence: `<evidence layer needed to prove the observable claim; do not prescribe a CI job or workflow name>`

## Current-state impact

<!-- Name every architecture, family, contributing, and consumer-doc surface changed when this ships. Link architecture records that own internal seams; do not duplicate their mechanisms here. -->

## Verification

<!-- Verification proves the observable contract. It does not authorize an internal architecture or CI topology. -->

| Contract | Verification         | Representative states | Mutation or failure expectation       |
| -------- | -------------------- | --------------------- | ------------------------------------- |
| FR1      | `<test or evidence>` | `<states>`            | `<removing behavior makes this fail>` |

## Decision log

### DEC-1 — `<behavioral decision>`

**Reference:** `spec:AST-000/DEC-1`
**Decider:** `<person>`, `<YYYY-MM-DD>`

`<Reason, user impact, and observable contract.>`

Rejected: `<consequential behavioral alternative — why>`. Do not record a private
implementation merely because it supplied the evidence.

## Open questions

- **OQ1 — `<question>`** (`checkable | human-design | human-api`)
