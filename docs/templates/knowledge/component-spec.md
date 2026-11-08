---
schema_version: 3
template_version: 7
kind: component
id: component:<Name>
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [<owner>]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by: [<test-or-check>]
modules: [module:<Name>/<PublicModule>]
families: [family:<family-name>]
design_specs: [design:<surface>]
architecture: [architecture:<surface>]
contributing: [contributing:<surface>]
system_specs: [spec:AST-000/DEC-0]
---

# <Name> component contract

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

<!-- Why this component exists and the system-level job it owns. Consumer usage belongs in <Name>.doc.mjs. -->

## Compatibility and migration

- Released default preserved: `<yes, no, or not yet released>`
- Compatibility class: `<state the compatibility effect>`
- Controlled/uncontrolled behavior: `<unchanged or stated transition>`
- Migration decision: `<component DEC or system spec link>`

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- `<responsibility>`

**Does not own / non-goals**

- `<responsibility>` — owned by `family:<family>` / `component:<Other>` / product callsite.

## Public concepts

<!--
Concepts, not a prop table. Consumer syntax/defaults remain in <Name>.doc.mjs.
Record only component-local semantic concepts, additions, and exceptions; inherit
current family rules. When a public hook, plugin, utility, or subsystem has an
independent contract, list its `module:<Name>/<PublicName>` record in `modules`
and keep its API, behavior, accessibility, precedence, and evidence there.
Follow spec:AST-002 without copying system rules.
-->

| Concept     | Closed values or states | Meaning     | Availability by variant/orientation/state | Default     | Owner              | Stability                  | Invalid-value behavior          |
| ----------- | ----------------------- | ----------- | ----------------------------------------- | ----------- | ------------------ | -------------------------- | ------------------------------- |
| `<concept>` | `<values>`              | `<meaning>` | `<where emitted>`                         | `<default>` | `component:<Name>` | `<stable or experimental>` | `<reject, ignore, or fallback>` |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant      | Basis                                                                         | Draft review state                     |
| --- | ------------------------ | ----------------------------------------------------------------------------- | -------------------------------------- |
| FR1 | `<The component MUST …>` | `<existing DEC, documented promise, standard, current behavior, or proposal>` | `<settled, verify, or human decision>` |

### Allowed variation

- **AV1 — `<dimension>`.** `<What may vary without becoming a regression.>`

### Representative states

| State     | Required invariant | Allowed variation |
| --------- | ------------------ | ----------------- |
| `<state>` | `<invariant>`      | `<variation>`     |

### Transformation and precedence order

- **ORD1 — `<pipeline>`.** `<The final invariant and the required order, such as snap → round → clamp.>`

### Performance and resources

- **PR1 — `<constraint>`.** `<Measurement, render, listener, observer, or initialization behavior that MUST remain true.>`

Current measurements belong in the audit record; this subsection owns only
durable constraints and their verification target.

## Accessibility contract

- **AR1 — `<obligation>`.** `<The component MUST …>`

## Design relationships

| Anatomy or state | Design requirement     | Representation authority                     | Hierarchy role              | Component contract  |
| ---------------- | ---------------------- | -------------------------------------------- | --------------------------- | ------------------- |
| `<role/state>`   | `design:<surface>/DR1` | `<prescribed, human-selected, or unsettled>` | `<prominent or supporting>` | `<FR/AR reference>` |

The component implements design requirements without copying their rationale.
An `unsettled` representation remains a human decision; principles do not let an
agent invent the answer.

Use the optional table below only for durable component-local visual intent that
a future redesign must reconsider. Reuse or amend an existing row before adding
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
Optional during migration. When present, this block must map every exact English
anatomy name from <Name>.doc.mjs to one disposition. It is maintainer metadata:
do not copy it into ComponentDoc, generated docsite data, CLI/MCP output, or
consumer prose. Target names omit the `astryx-` prefix. Put only non-obvious
rationale or exceptions in prose below the block. `none` is factual: its reason
must start with `intentional:`, `reachability-gap:`, or `unsettled:` so absence of
current reachability never silently decides future themeability.
-->

<!-- anatomy-theming:v1 -->

```json
{
  "<root part>": {"target": "<target>"},
  "<inherited part>": {"inherits": "<parent-or-root-target>"},
  "<delegated part>": {
    "delegatesTo": {"owner": "component:<Owner>", "target": "<target>"}
  },
  "<currently unreachable part>": {
    "none": {
      "reason": "<intentional | reachability-gap | unsettled>: <required factual reason>"
    }
  }
}
```

## Family and system relationships

Frontmatter lists structural `modules` links plus only `current` family, design,
architecture, and system relationships. A module backlink may name an active
draft because it records ownership rather than adopting draft behavior. Candidate
family or design records list proposed members on the candidate itself; do not
edit an existing component contract merely to backlink to those drafts.

- `module:<Name>/<PublicName>` owns `<independent public module contract>`; this component owns aggregate module protocol, ordering, and composition.
- `family:<family-name>` owns `<shared concept>`; this component `<adopts or deliberately differs>`.

## Verification map

| Contract | Verification                 | Representative states | Mutation or failure expectation                 | Audit section            |
| -------- | ---------------------------- | --------------------- | ----------------------------------------------- | ------------------------ |
| FR1      | `<test or browser evidence>` | `<states>`            | `<removing behavior makes this fail because …>` | `audit:<Name>/<section>` |

## Decision log

<!-- Record the boundary or requirement, not how it was reached. A rejected alternative is at most one line here, kept only when it is consequential and likely to recur. -->

### DEC-1 — `<component-local decision>`

**Reference:** `component:<Name>/DEC-1`
**Decider:** `<person>`, `<YYYY-MM-DD>`

`<Reason and user impact.>`

Rejected: `<include only when the alternative is consequential and likely to recur; otherwise delete this line>`.

## Open questions

- **OQ1 — `<question>`** (`checkable | human-design | human-api`)

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
