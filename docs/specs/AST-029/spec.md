---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-029
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-07
phase: accepted
owners: [cixzhang]
affects_architecture: [architecture:knowledge-contracts]
affects_families: []
affects_contributing: []
affects_consumer_docs: []
---

# Component audit contract backfill and auto-merge system spec

## Intent

Define only the additional behavior needed to run whole-component audits safely:
which components participate, how an audit proceeds when a component contract is
missing or incomplete, which fixes may travel with the audit, and when a Night
Watch audit may auto-merge.

This spec builds on the existing component-specification system. Component contract
shape, authority, ownership, approval, conflict handling, and semantic API rules
remain owned by:

- [`docs/templates/knowledge/component-spec.md`](../../templates/knowledge/component-spec.md)
  and the matching versioned knowledge schema;
- [`architecture:knowledge-contracts`](../../architecture/knowledge-contracts.md);
- [`spec:AST-002`](../AST-002/spec.md); and
- each component's existing `<Name>.spec.md`.

## Non-goals

- Define a second component-spec format, authoring guide, schema, or approval path.
- Copy component, family, design, architecture, consumer-doc, or audit facts into a
  new record.
- Add, improve, remove, or reinterpret component behavior during observational
  backfill.
- Replace grading, promotion, or review-mode issue and ledger rules.
- Decide the general component-test quality rubric.

## Requirements

- **FR1 — One audit roster.** The audit queue and Component Audits sandbox table
  MUST use one checked-in roster of public components. The target roster includes
  Core, Lab, Charts, Rich Text, and Vega. A package may enter the active audit roster
  only after the existing canonical knowledge system recognizes its component-record
  locations and validates them; audits MUST NOT invent audit-only spec paths.
- **FR2 — Existing component contracts remain canonical.** An audit MUST begin with
  the nearest current component or module contract and follow its links to current
  family, design, architecture, and system authority. The audit MUST use the existing
  component template and schema rather than creating a parallel contract shape.
- **FR3 — Missing contracts use the existing specification flow.** When a component
  contract is missing or incomplete, the auditor MAY prepare or complete a draft
  `<Name>.spec.md` using the existing template, schema, authority rules, and exact-
  head owner approval flow. A missing draft MUST NOT block grading from current
  authority and checkable evidence.
- **FR4 — Backfills are observational only.** An audit-authored component contract
  MUST describe verified shipped behavior and MUST NOT add, improve, remove, or
  reinterpret behavior. Proposed meaning remains an open question or a separate
  owner decision. A draft cannot clear an audit finding as settled policy.
- **FR5 — Audit completeness is recorded outside the component contract.** The audit
  PR MUST carry a closed evidence receipt. Its finite inventory comes from public
  exports and types, documented concepts and variants, states and transitions
  reachable through the public API, and implementation branches reachable from
  those surfaces. Equivalent inputs MAY share a row only when evidence shows they
  have the same observable contract. Each row names the relevant source, existing
  tests, consumer docs, rendered evidence, applicable current authority or objective
  standard, and any conflict or gap. This receipt is audit evidence; it does not add
  a required section to the component-spec schema.
- **FR6 — Existing authority resolves conflicts.** The auditor MUST apply
  `architecture:knowledge-contracts` and `spec:AST-002`. Current shared authority
  and objective standards govern their scope. A conflict between current records,
  or a question requiring new API, compatibility, ownership, or design judgment,
  stops objective remediation and routes to the owner.
- **FR7 — Objective remediation may share the audit PR.** One Night Watch PR MAY
  combine an observational component-contract edit with missing behavior tests,
  stable visual-regression coverage, consumer-doc drift fixes, and implementation
  bugs whose required outcome is already settled. Baseline evidence and each fix's
  before/after proof MUST remain distinct.
- **FR8 — Manual boundaries fail closed.** Public API meaning or shape, defaults,
  compatibility or migration promises, ownership boundaries or conflicts, and
  subjective representation, proportion, density, or interaction-feel decisions
  MUST remain human-reviewed and MUST NOT auto-merge.
- **FR9 — Audit modes remain distinct.** Night Watch retains no ordinary per-finding
  issues and records only its post-fix ledger result. Grading and promotion retain
  their existing per-BLOCK issue and recording procedures. The shared audit prompt
  MUST preserve the selected mode.
- **FR10 — Auto-merge requires an exact-head eligibility report.** The Night Watch
  auditor MUST emit a versioned, machine-readable report containing the component
  and package, audit mode and rubric version, audited repository and component-
  contract heads, FR5 inventory closure, unresolved objective and manual gaps,
  remediations and their before/after evidence, required approval states, required
  check states, and a fail-closed eligibility verdict with reasons. A trusted check
  MUST validate that report against the current PR and head, publish every unmet
  condition in its summary, and project the required `audit-eligibility` status.
  The report MAY live in trusted PR/check metadata; it MUST NOT require a second
  checked-in audit record. Any missing, stale, inconsistent, or ineligible report
  leaves the PR open for human review.
- **FR11 — Activation is separate, explicit, and atomic.** Auto-merge remains
  unavailable until this record is both `authority: current` and `phase: shipped`,
  and the activation change has landed the audit prompt, wiki procedure, canonical
  package/spec coverage, roster consumers, eligibility checks, and focused tests
  together. Approval without that complete activation does not change runtime
  behavior; every audit PR remains manual-review-only. This spec does not require a
  component-template or schema migration because FR5 keeps audit-only evidence
  outside component contracts.

- **FR13 — Audit data follows the existing storage authority.** Durable product
  behavior stays in the component `.spec.md`. Per
  [`architecture:knowledge-contracts`](../../architecture/knowledge-contracts.md),
  automated wiki `component-scores.json` remains the operational datastore for
  current post-fix scores and unresolved findings; unactivated per-component audit
  files are not a migration target. The audit PR stores the reviewable run evidence,
  and the trusted Check Run stores the FR10 exact-head machine report. Any future
  datastore change requires a separate automated migration and cutover contract.

- **FR14 — Scoring uses the assembled applicable contract.** Each audit section MUST
  score the requirements that apply from current global authority and objective
  standards, current family contracts, and current component/module contracts. Each
  requirement maps to one rubric section and one evidence result so one defect is not
  counted twice. `N/A` requirements are excluded; unavailable evidence uses the
  rubric's existing `not_measured` behavior. Existing severities, weights, grade
  bands, and BLOCK ceilings remain unchanged unless the rubric explicitly versions a
  scoring change.
- **FR15 — Authority changes invalidate affected scores, not the global scale.** A
  change to a current component/module contract invalidates that component's audit.
  A current family or global-authority change invalidates every linked applicable
  component. The rubric version changes only when scoring methodology, weights,
  severities, or evidence treatment changes; an authority change alone triggers
  targeted re-audit on the same scale.

### Platform support

- Supported feature/engine floor: repository-supported Node, browsers, and CI.
- Unsupported behavior: an unresolvable component or missing evidence remains an
  explicit audit gap rather than disappearing or passing.
- Browser evidence: visible and interaction claims use the real-browser evidence
  required by the audit rubric and applicable current records.

## Current-state impact

This accepted spec changes no audit automation or component-contract schema.
Follow-up implementation will update the shared audit roster and its sandbox view,
the audit prompt and mode handling, Night Watch procedure, and fail-closed
eligibility checks. Those changes remain separate from this specification PR.

## Verification

| Contract  | Verification                                                           | Representative states                                                                                     | Mutation or failure expectation                                                                                                  |
| --------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| FR1       | Canonical knowledge-path coverage plus roster and sandbox parity tests | all five target packages; unsupported package; new component; private helper                              | A package is audited before its component records are canonical, queue and sandbox diverge, or an eligible component disappears. |
| FR2–FR6   | Audit fixtures using existing component records                        | current; draft; missing; finite public-state inventory; equivalent inputs; local drift; conflict          | Audit invents a second contract shape, omits a reachable public state, draft becomes policy, or a conflict is canonized.         |
| FR7–FR10  | Mode, report-schema, trusted-validation, and eligibility tests         | safe objective fix; API/default/ownership/design boundary; receipt with gap; stale head; missing approval | Unsafe or incomplete work auto-merges, a stale report clears the status, or one mode receives another mode's lifecycle.          |
| FR11      | Authority/phase and activation tests                                   | draft; current/proposed; current/accepted; current/shipped with partial wiring; fully activated           | Auto-merge activates before the explicit state and all required surfaces land together.                                          |
| FR12      | TDD trace and behavior-test review                                     | settled seam; unsettled seam; red failure; minimal green slice; implementation-coupled test               | Production changes precede red, an unsettled seam is invented, or a test passes without observing the contract.                  |
| FR13      | Storage-boundary tests                                                 | wiki ledger; PR evidence; Check Run report; attempted per-component log                                   | Audit data is duplicated, written under the wrong owner, or read from an unapproved datastore.                                   |
| FR14–FR15 | Scoring and freshness tests                                            | global/family/component requirements; N/A; not measured; local and shared authority changes               | A defect is counted twice, a requirement is omitted, or affected scores remain falsely current.                                  |

## Decision log

### DEC-1 — Audits reuse the existing component-specification system

**Reference:** `spec:AST-029/DEC-1`
**Decider:** `cixzhang`, `2026-09-06`

Audit backfills use the existing component template, schema, authority model, and
component records. Audit-only completeness evidence stays in the audit receipt.

Rejected: creating a second component-spec guide or adding audit workflow fields to
every component contract.

### DEC-2 — Backfill and settled remediation may travel together

**Reference:** `spec:AST-029/DEC-2`
**Decider:** `cixzhang`, `2026-09-06`

One audit PR may describe verified shipped behavior and fix objective defects with
before/after proof. New judgment remains outside that automatic path.

Rejected: splitting a safe fix only because the same audit found a missing contract.

### DEC-3 — Auto-merge uses a structured report without a duplicate checked-in record

**Reference:** `spec:AST-029/DEC-3`
**Decider:** `cixzhang`, `2026-09-07`

Night Watch emits the versioned eligibility format in FR10. A trusted check binds it
to the exact PR head, validates it against repository state, and publishes the
required status and reasons. The report lives in trusted PR/check metadata rather
than a second checked-in audit file. Grading and promotion keep their existing issue
and ledger rules.

Rejected: unstructured prose as an auto-merge input, a second repository audit
record, or eligibility based on green CI alone.

### DEC-4 — Audit-authored behavior tests use Matt Pocock's TDD skill

**Reference:** `spec:AST-029/DEC-4`
**Decider:** `cixzhang`, `2026-09-07`

Night Watch uses the pinned public `tdd` skill for behavior-test remediation. Current
contracts or established public interfaces determine the seam; the auditor does not
invent one. Each cycle proves red before production changes and implements one
minimal vertical slice through observable behavior.

Rejected: writing tests after implementation, testing internals, or generating all
tests before learning from the first vertical slice.

### DEC-5 — Audit data remains split by ownership

**Reference:** `spec:AST-029/DEC-5`
**Decider:** `cixzhang`, `2026-09-07`

The automated wiki ledger remains the operational datastore for current component
audit state. The audit PR stores one run's human-reviewable evidence, and the trusted
Check Run stores the exact-head machine decision. Component contracts store durable
product behavior only. Any future datastore change requires an explicit automated
migration and cutover contract.

Rejected: per-component shadow ledgers, storing screenshots or run matrices in
component specs, or treating transient CI artifacts as the only review record.

### DEC-6 — Scoring stays stable while applicable authority is assembled dynamically

**Reference:** `spec:AST-029/DEC-6`
**Decider:** `cixzhang`, `2026-09-07`

The rubric keeps its existing sections, weights, severities, grade bands, and
unmeasured treatment. Each audit fills those sections from applicable current global,
family, component, and module requirements. Authority changes invalidate the linked
component audits; only a scoring-method change versions the rubric scale.

Rejected: copying every local requirement into the wiki rubric, silently changing
weights when a component has more requirements, or treating a spec edit as a global
scoring-version change.

## Open questions

None.
