---
schema_version: 3
template_version: 4
kind: module
id: module:<ParentComponent>/<PublicName>
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [<owner>]
review_triggers: [public-api, behavior, theming, accessibility]
verified_by: [<test-or-check>]
parent_component: component:<ParentComponent>
references: [architecture:<surface>, design:<surface>, spec:AST-000/DEC-0]
---

# <PublicName> module contract

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Contract at a glance

| Area                    | Contract                                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `<Exact public API, concept, or syntax delta; write “None” when none changes.>`                                                                    |
| Behavior                | `<Observable governing behavior, including the decisive default, boundary, or precedence rule.>`                                                   |
| End-user impact         | `<Who is affected, in what state, and what improves, worsens, or remains unchanged.>`                                                              |
| Builder impact          | `<Migration and each new caller choice; write “None” when there is no new burden.>`                                                                |
| Compatibility/readiness | `<Default compatibility; additive/breaking status; authority and implementation state; material evidence still pending.>`                          |
| Review checks           | `<Reject specific contradictions, invalid states, wrong-owner APIs, or lost boundaries/precedence/evidence distinctions already forbidden below.>` |
| Governing rules         | `<Canonical owners and only the current clauses needed to justify this projection.>`                                                               |

This table is a review projection; the body below is authoritative.

<!-- Keep each cell compact. Review checks project settled body rules; they do not create policy. Link AST-002 list-item clauses with an exact visible label and the canonical file URL, never an invented fragment. -->

## Intent

<!-- Why this public semantic module exists and the component-local job it owns. Private implementation helpers do not need records. Consumer usage belongs in the module's .doc.mjs. A current module record may contract one named semantic slice; state that boundary and leave adjacent behavior uncontracted rather than filling it for completeness. -->

## Compatibility and migration

- Released default preserved: `<yes, no, or not yet released>`
- Compatibility class: `<state the compatibility effect>`
- Migration decision: `<module DEC or system spec link>`

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- `<the module's public API, generated anatomy, accessibility, precedence, or evidence obligation>`

**Does not own / non-goals**

- Aggregate module protocol, ordering, and composition — owned by `component:<ParentComponent>`.
- `<other responsibility>` — owned by `<record or product callsite>`.

## Public API and concepts

<!-- Concepts, not a duplicated parameter table. Consumer signatures/defaults remain in the module's .doc.mjs. -->

| Concept     | Closed values or states | Meaning     | Default     | Owner                                   | Stability                  |
| ----------- | ----------------------- | ----------- | ----------- | --------------------------------------- | -------------------------- |
| `<concept>` | `<values>`              | `<meaning>` | `<default>` | `module:<ParentComponent>/<PublicName>` | `<stable or experimental>` |

## Behavioral contract

| ID  | Candidate invariant   | Basis                                                                         | Draft review state                     |
| --- | --------------------- | ----------------------------------------------------------------------------- | -------------------------------------- |
| FR1 | `<The module MUST …>` | `<existing DEC, documented promise, standard, current behavior, or proposal>` | `<settled, verify, or human decision>` |

### Transformation and precedence order

- **ORD1 — `<pipeline>`.** `<The required order and which explicit input wins.>`

### Performance and resources

- **PR1 — `<constraint>`.** `<Durable render, listener, observer, or initialization behavior.>`

## Accessibility contract

- **AR1 — `<obligation>`.** `<The module MUST …>`

## Design relationships

| Anatomy or state | Design requirement     | Representation authority                     | Module contract     |
| ---------------- | ---------------------- | -------------------------------------------- | ------------------- |
| `<role/state>`   | `design:<surface>/DR1` | `<prescribed, human-selected, or unsettled>` | `<FR/AR reference>` |

Use the optional table below only for durable module-local visual intent that a
future redesign must reconsider. Reuse or amend an existing row before adding
one. Exact pixel tuning normally stays in code and visual evidence. Put shared or
cross-component rules in `docs/design/` and link them from the relationship table
above. Use `DD1`, `DD2`, and so on; IDs remain stable and unique within this
record.

### Design decisions

<!-- design-decisions:v1 -->

| ID  | Decision | Intent or reason | Applies to | Allowed variation |
| --- | -------- | ---------------- | ---------- | ----------------- |

### Theming anatomy

<!--
Optional during migration. When present, this block maps the exact public anatomy
and targets from this module's own consumer-doc entry. It never falls back to the
parent component's aggregate anatomy or target inventory. Use the same
anatomy-theming:v1 format documented by the component template.
-->

<!-- anatomy-theming:v1 -->

```json
{
  "<module part>": {"target": "<target>"}
}
```

## Parent and system relationships

- `component:<ParentComponent>` owns aggregate module protocol, ordering, and composition.
- This record owns only the independent public module contract stated above; link shared rules instead of copying them.

## Verification map

| Contract | Verification                 | Representative states | Mutation or failure expectation                 |
| -------- | ---------------------------- | --------------------- | ----------------------------------------------- |
| FR1      | `<test or browser evidence>` | `<states>`            | `<removing behavior makes this fail because …>` |

## Decision log

### DEC-1 — `<module-local decision>`

**Reference:** `module:<ParentComponent>/<PublicName>/DEC-1`
**Decider:** `<person>`, `<YYYY-MM-DD>`

`<Reason and user impact.>`

## Open questions

- **OQ1 — `<question>`** (`checkable | human-design | human-api`)

## Content boundary

This record does not duplicate consumer signatures/examples, parent aggregate
protocol or ordering, current audit results, implementation steps, or
family/design/system rules. It links to their canonical owners.
