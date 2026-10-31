---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-002
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-03
phase: accepted
owners: [cixzhang, imdreamrunner]
affects_architecture: []
affects_families: []
affects_contributing: [contributing:api-conventions]
affects_consumer_docs: []
---

# Public API admission and operation shape

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "public-api": [
      "FR4",
      "FR15",
      "DEC-1",
      "DEC-2",
      "DEC-3",
      "DEC-6",
      "DEC-7",
      "DEC-8"
    ]
  }
}
```

## Intent

Keep Astryx public APIs intentional. A public API should represent a distinction
the caller owns, not expose a choice the component can make correctly by itself.
That need is only the first gate. The proposed API must also have clear meaning,
dependable behavior, and promises the component can keep.

Every public prop, hook, utility, and operation becomes a permanent concept that
consumers, documentation, tests, themes, migrations, and reviewers must
understand. The burden is to show why the caller must provide information, not
merely that an API can solve the immediate example.

## Non-goals

- Removing semantic state, controlled-value, accessibility, or composition APIs.
- Preventing utility components from exposing the fine-grained controls that are
  their purpose.
- Replacing existing styling escape hatches with component-specific layout props.
- Rejecting an API only because its implementation is difficult.

## Requirements

A public API proposal is admitted only when it passes both gates:

1. **Need:** the caller owns information the component cannot derive.
2. **Contract:** the API clearly describes a dependable result the component can
   enforce.

- **FR1 — A prop represents caller-owned intent.** A new public prop is justified
  only when two otherwise identical situations require different resolved design
  outcomes and the caller owns which outcome applies.
- **FR2 — Derivable differences stay internal.** Do not add a prop when the
  component can derive the correct outcome from its state, content, measured or
  CSS layout, parent context, platform capability, or another existing public
  concept.
- **FR3 — Implementation choices are not public concepts.** Internal thresholds,
  optical tuning, algorithm choices, and one-off fixes remain internal unless
  FR1 proves that callers need to distinguish semantically identical cases.
- **FR4 — Existing composition and styling seams come first.** A component does
  not add a specialized prop when an existing slot, child contract, theme target,
  `xstyle`, `className`, `style`, or owning layout component already expresses
  caller intent at the correct layer.
- **FR5 — The admission argument is reviewable.** A public-API proposal names the
  two otherwise identical cases, the different required outcomes, why the caller
  knows the difference, and why the component cannot derive it.
- **FR6 — High-level components have a higher threshold.** Opinionated
  compositions prefer internal resolution and composition over accumulating
  low-level tuning props.
- **FR7 — The public concept is understandable.** Its name and values describe
  caller intent without requiring consumers to know the rendering technique that
  implements it.
- **FR8 — The result is predictable.** Each value has a stable, observable effect
  that consumers can explain and tests can verify. A data attribute, theme hook,
  or implementation difference alone is not a public outcome.
- **FR9 — The API can keep its stated promise.** The API shape carries or owns
  the information needed to produce the claimed result. Documentation and review
  arguments do not credit an enum or styling switch with accessibility,
  association, or validation behavior it cannot perform. The contract depends
  only on props, owned children, owned context, and platform facts the component
  can verify.
- **FR10 — Every supported state is independently correct.** Accessibility,
  behavior, and required visual communication do not become valid only when an
  unverified external condition is assumed. Solve the base component problem
  before adding API to select between incomplete solutions.
- **FR11 — One semantic action has one canonical operation.** Within one
  component module, any public or package-internal operations that implement the
  same caller-owned action use one canonical operation name. The public contract
  may expose a narrower option set while the package-internal implementation
  accepts wider semantic options under that same operation. Add another operation
  only for genuinely distinct caller-owned intent with a different contract.
- **FR12 — Mechanical screening does not outrun contract coverage.** Every public
  API addition or semantic behavior change identifies its exact before → after,
  canonical owner, and applicable current record before acceptance. Component-local
  semantics belong in the component spec; family-, architecture-, or system-owned
  semantics update that owner instead. A draft record is valid review context but
  not policy and cannot clear the authority gate. Mechanical review also rejects
  derivable choices, overloaded inputs, hidden conditional precedence, and
  duplicate operations.
- **FR13 — Surviving changes make the semantic delta explicit.** Owner review
  receives a link to the canonical current owner, one sentence stating the semantic
  before → after, the applicable authority result from
  `architecture:knowledge-contracts`, and representative syntax only when public
  syntax changes.
- **FR14 — Contract restorations are preserves.** A fix is `preserves` only when it
  restores a current contract or standard and adds no public API or public behavior
  beyond that authority. It supplies regression evidence. Any additional public
  delta independently follows FR12 even when delivered in a bug-fix pull request.
- **FR15 — Invalid states are prevented where practical.** Public APIs prevent
  bad results when doing so does not make the API harder to understand. Make
  statically knowable invalid combinations unrepresentable where practical;
  otherwise validate or warn, or choose a safe documented fallback. Do not
  silently render a broken state or over-constrain legitimate composition.
- **FR16 — Public inputs keep one semantic responsibility.** Across its full
  value domain and every accepted input shape, each public input has one stable
  semantic responsibility, and its name and type disclose the caller-owned
  meaning. One semantic input may derive several visual details when they form one
  cohesive named outcome, such as a semantic status or variant owning both tone
  and a signifier. Reject an input when its value or shape changes which axis it
  controls, or when consumers need implementation knowledge to predict the
  controlled axes. Independently caller-owned axes use separate inputs with
  invalid and conflicting combinations prevented under FR15; system-owned
  coordination exposes the semantic concept and derives its details instead of
  naming the input after one mechanism. Parallel inputs do not create hidden
  conditional precedence: an override is valid only when its name, type, and
  behavior across every combination form an explicit coherent contract.
- **FR17 — Public module and utility function names disclose one atomic role.**
  Choose a verb from the function's primary caller-observable result and side
  effects, not from an internal implementation step. Distinguish construction,
  inspection, lookup, conversion, registration, and guaranteed state. `define*`
  constructs or normalizes and returns a durable typed value used by a supported
  consumer. It may reuse validation as a precondition, but a function that only
  inspects input or returns the same input unchanged is not `define*`. `validate*`
  and `check*` inspect input and return structured results; their contracts state
  which failures are returned and which conditions throw. If construction,
  validation, registration, or another capability is public, expose it as its own
  callable function rather than hiding two public roles behind one name. A released
  mismatch is deprecated and migrated under the compatibility contract, not
  silently renamed. Other verbs receive rules only when shipped repository
  evidence supports them. Component prop and event naming remains separate. CLI
  command verbs and their programmatic command twins belong to the
  [CLI surface architecture](../../architecture/cli-surface.md) and CLI
  conventions; this requirement does not define their command semantics.
- **FR18 — Public primitives support composition intentionally.** Astryx prefers
  public contracts for stable behavior that product builders must compose,
  coordinate, or build on across callsites. That preference does not promote raw
  implementation machinery. A proposed primitive API names semantic caller intent,
  defines accepted and rejected operations and outcomes, and receives an owning
  current contract before acceptance. Internal focus targets, gesture memory, DOM
  slots, timers, and equivalent mechanisms stay private unless independently
  admitted as durable caller-owned concepts.
- **FR19 — Bug fixes do not smuggle API design.** A bug fix that can restore current
  behavior without changing public API or behavior beyond current authority MUST do
  so. Any additional public delta follows `architecture:knowledge-contracts`
  independently. A separable contradictory or unsettled tagalong MUST be removed or
  split before review asks the repair to carry a new owner decision. Existing current
  authority may settle an intentional remaining delta; only a surviving, intentional
  gap requires owner judgment. Implementation convenience, removal of an internal
  wrapper, or exposure of existing internal fields is not evidence that an API should
  exist.
- **FR20 — Callsite impact and decision burden are explicit.** A public API change
  shows representative before and after callsites, including defaults and
  compatibility, and names every new choice the caller must understand or make. That
  burden is admitted only when FR1 proves the distinction is caller-owned, the
  component cannot derive it under FR2, and the choice has predictable meaning under
  FR7–FR10. Review-generated impact prose is context only; it cannot supply missing
  caller ownership or authorize the API.

### Platform support

- Supported feature/engine floor: the rule applies to every exported component,
  hook, and utility API on every supported renderer.
- Unsupported behavior: a browser or renderer implementation limitation is not
  itself evidence that callers should receive a permanent API.
- Browser evidence: layout-based derivability claims are verified in real
  supported browsers before concluding that public API is necessary.

## Current-state impact

- API review guidance requires both the caller-need argument and the dependable
  current-contract argument before new public API is accepted.
- Every public API addition and public behavior change identifies current committed
  authority, then follows the result and disposition owned by
  `architecture:knowledge-contracts`. This spec does not redefine those outcomes.
- Exact-head owner discussion or approval may supply the decision evidence, but it
  does not become reusable or acceptance-clearing authority until the canonical
  owning record commits that decision as `current`.
- Component specs own component-local semantic API contracts, including public
  hooks and utilities they explicitly co-own. Family, architecture, and system
  records own their respective shared semantics. The component's `.doc.mjs`
  remains the consumer syntax and reference authority.
- `module:Markdown/headingLinks` applies FR18 and DEC-8 to one admitted public
  module: its factory returns an opaque entry for the existing plugin list rather
  than adding a broad Markdown prop. The module record owns the API and behavior;
  this system record owns only that admission result.
- Component specs inherit current family contracts and record only local public
  concepts, additions, and explicit exceptions; they do not copy shared rules.
- Public module and utility function review compares the verb with the function's
  returned value, validation contract, side effects, and supported consumers.
  Component prop/event naming and CLI command semantics keep their separate owners.
  Existing released mismatches remain compatible while an explicit deprecation and
  migration is designed; this rule does not silently rename or change them.

### Current authority dependency

For every public API or public behavior delta, identify the canonical owner and
apply the routing defined by `architecture:knowledge-contracts`. This spec owns
API admission and semantic-shape requirements; the
[Release compatibility and versioning spec](../AST-017/spec.md) owns lifecycle,
classification, deprecation, correction, and release treatment. Neither record copies
review outcomes or pull-request disposition.

A draft record may provide context and route the unresolved question, but it
cannot clear current authority. Exact-head owner discussion supplies decision
evidence; the canonical record must commit an accepted decision as `current`
before implementation acceptance.

This authority dependency does not make public API undesirable. Once current
authority settles the semantic contract, ordinary correctness and evidence review
still determine whether the implementation satisfies it.

- Existing props and operations are not removed automatically. They are evaluated
  when touched, when adjacent API is proposed, or when they cause a concrete
  maintenance or consistency problem.
- The proposed PowerSearch editor-popover maximum width is the motivating case
  for the need gate: its width is an internal resolved design choice rather than
  a caller-owned distinction, so a new public tuning prop does not pass.
- A styling switch cannot be justified by accessibility, association, validation,
  or other behavior its mechanism cannot perform. Solve the component behavior
  first; consider API only when a clear, enforceable caller-owned distinction
  remains.
- [PR #5373](https://github.com/meta/astryx/pull/5373) is evidence that
  parallel public and package-internal operations for one semantic action create
  avoidable surface area. Its particular operation names and options are not
  policy.
- `TableRowStatus.color` is the motivating overloaded-input counterexample. Its
  palette and raw values control tone only, while `success`, `warning`, and
  `error` also select a default themed icon; the optional `icon` then
  conditionally overrides that representation. This shape would be rejected
  under FR16 pending a canonical `component:Table` contract. AST-002 does not
  prescribe the replacement API.
- Implementing the mechanical API gate and its benchmark is follow-up work. This
  policy and template change does not add gate implementation code.

## Verification

| Contract   | Verification                                                                                           | Representative states                                                                              | Mutation or failure expectation                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR1, FR5   | Blinded historical API review benchmark                                                                | recent utility, mid-range, and composition API additions                                           | Reviewer accepts a prop without identifying caller-owned semantic variation                                                                            |
| FR2, FR3   | Component tests and real-browser layout evidence                                                       | content, container, viewport, parent context, and platform variation                               | Public API exposes a value the component can derive reliably                                                                                           |
| FR4, FR6   | API surface review for utility, mid-range, and composition components                                  | existing slot, theme, style, layout, and behavior seams                                            | High-level component accumulates one-off tuning props instead of using its owning layer                                                                |
| FR7, FR8   | Consumer examples and behavior tests                                                                   | default, each public value, composed use, and unsupported use                                      | Meaning depends on implementation knowledge or tests assert only classes/data attributes                                                               |
| FR9, FR10  | Component ownership and accessibility review                                                           | owned content, external sibling content, missing or incorrect context                              | A state is correct only when the caller fulfills a promise the component cannot verify                                                                 |
| FR11       | Public and package-internal operation inventory; PR #5373                                              | one component module and one semantic action                                                       | One semantic action gains parallel operation names distinguished only by implementation needs                                                          |
| FR12, FR13 | Public-delta/canonical-owner check and exact authority routing                                         | missing delta/update; matching, contradictory, draft-only, or absent authority                     | Missing delta/owner update passes, contradiction is accepted, draft becomes policy, or automation decides semantics                                    |
| FR14       | Focused regression tests against the current contract or standard                                      | defect state, representative unchanged states, and any adjacent public delta                       | A restoration invents a new decision, lacks regression evidence, or hides an additional public change under a bug-fix label                            |
| FR15       | Type-level constraints plus runtime validation and behavior tests                                      | invalid values, unsupported combinations, and legitimate composition                               | The API silently renders a broken state or prevents a valid composition                                                                                |
| FR16       | Full value-domain, input-shape, and parallel-combination contract review                               | semantic variants, raw or palette values, explicit overrides, and defaults                         | One value or shape switches the controlled axis, or a parallel input silently changes precedence                                                       |
| FR17       | Public module/utility export inventory plus implementation, test, consumer, and release-history review | construction, inspection, lookup, conversion, registration, hooks, and released compatibility      | A verb hides the returned value or side effect, two public roles are fused, a non-hook utility uses `use*`, or a released mismatch is silently renamed |
| FR20       | Public callsite and caller-burden review                                                               | representative before/after callsites, defaults, compatibility, and every caller-owned choice      | A new caller decision is hidden, derivable, unpredictable, or justified only by review prose                                                           |
| FR18       | Multi-caller composition scenarios plus owning-contract review                                         | shared semantic operation, internal-only mechanism, and two representative consumers               | Product builders cannot compose stable behavior, or implementation fields are exposed without caller-owned semantics                                   |
| FR19       | Bug-fix before/after authority diff plus public-surface and behavior inventory                         | pure restoration, restoration plus separable novel API/visual change, and internal-wrapper removal | A bug-fix label bypasses authority, a removable tagalong forces a broader spec, or internal mechanics become public because exposure is convenient     |
| Burden     | Benchmark classification: allow, correct pause, false block, not applicable                            | recent accepted and rejected API changes                                                           | Clearly justified APIs are repeatedly paused or blocked without surfacing a real decision                                                              |

## Decision log

### DEC-1 — Public props require a non-derivable caller distinction

**Reference:** `spec:AST-002/DEC-1`
**Decider:** `cixzhang`, `2026-08-30`

A new public component prop is appropriate only when otherwise identical
situations need different resolved design decisions and the component cannot
derive the distinction from information available to it. Public props represent
caller-owned intent, not implementation knobs.

Rejected: adding props whenever a consumer asks for a different internal layout
value. That approach duplicates design decisions across callsites and expands the
permanent API without adding semantic information.

### DEC-2 — Caller need does not admit an unclear or unenforceable API

**Reference:** `spec:AST-002/DEC-2`
**Decider:** `cixzhang`, `2026-08-30`

A non-derivable caller distinction passes only the need gate. The proposed prop
must also name an understandable concept, produce a dependable observable result,
and use a mechanism capable of fulfilling the promise used to justify it.

Rejected: admitting a styling switch because review text gives it accessibility,
association, or validation meaning its mechanism cannot provide. Solve the base
component behavior first; consider public API only when a clear, enforceable
caller-owned distinction remains.

### DEC-3 — One semantic action uses one canonical operation name

**Reference:** `spec:AST-002/DEC-3`
**Decider:** `cixzhang`, `2026-08-31`

A component module uses one canonical operation name for one semantic action across
its public and package-internal forms. The public contract may expose a narrower
option set while the package-internal implementation accepts wider semantic
options under that same name. A second operation is admitted only for genuinely
distinct caller-owned intent and contract.

Rejected: creating a parallel operation because one internal call path needs
additional control. That choice exposes internal call-path differences and leaves
maintainers or consumers to distinguish two names for one action.

### DEC-4 — API review separates mechanical evidence from owner judgment

**Reference:** `spec:AST-002/DEC-4`
**Decider:** `cixzhang`, `2026-09-06`

Mechanical review inventories the exact public API and behavior delta, identifies
the canonical owner, and rejects objective API-shape violations such as derivable
choices, overloaded inputs, hidden conditional precedence, or duplicate operation
names for one semantic action. It does not decide unsettled semantics.

When current authority does not settle a surviving proposal, route it privately to
the human owner. The owner accepts, rejects, or refines the semantic contract; the
accepted decision becomes review authority only after it is committed in the
canonical record as `current`.

Rejected: asking owners to discover mechanical defects from implementation code,
treating generated evidence as a semantic decision, or publishing a contributor-
facing verdict before the owner settles an absent contract.

### DEC-5 — Public changes require committed current authority

**Reference:** `spec:AST-002/DEC-5`
**Decider:** `cixzhang`, `2026-09-06`

Every public API addition and public behavior change identifies applicable current
committed authority before implementation acceptance. Draft records provide
context and route questions, but they are not policy and cannot clear the gate.
Exact-head owner discussion or approval is decision evidence, not a substitute for
recording the accepted contract as current.

Missing authority creates the private unsettled path owned by
`architecture:knowledge-contracts`; it is not permission to accept the change and
not an automatic contributor-facing rejection. After the canonical decision is
current, review the implementation's exact head against it.

Rejected: the former staged exception that let one pull request proceed on owner
approval while leaving its reusable contract draft or missing. That path made the
same public behavior acceptable in one review and undiscoverable in the next.

### DEC-6 — Public inputs keep one semantic responsibility

**Reference:** `spec:AST-002/DEC-6`
**Decider:** `cixzhang`, `2026-09-01`

Every public input has one stable semantic responsibility across its full value
domain and every accepted input shape. Its name and type disclose the
caller-owned meaning. One semantic input may derive several visual details when
they form one cohesive named outcome, such as a status or variant owning tone and
a signifier. A property is rejected when its values or shapes change which axis
it controls, or when consumers need implementation knowledge to predict the
controlled axes.

When two axes are independently caller-owned, expose separate inputs and prevent
invalid or conflicting combinations under FR15. When the system owns their
coordination, expose the semantic concept and derive both details rather than
naming the input after one mechanism. Parallel inputs may override one another
only when their names, types, and behavior across every combination define an
explicit coherent contract and prevent invalid or conflicting states.

Rejected: `TableRowStatus.color`, whose palette and raw values mean tone only
while `success`, `warning`, and `error` mean tone plus a default themed icon, with
an optional `icon` that conditionally overrides representation. That shape would
not pass current API review pending a canonical `component:Table` contract. This
decision does not prescribe the replacement API.

### DEC-7 — Public module and utility verbs disclose atomic roles

**Reference:** `spec:AST-002/DEC-7`
**Decider:** `cixzhang`, `2026-09-03`

Choose a public module or utility function's verb from its primary
caller-observable result and side effects, not from an internal implementation
step. Distinguish construction, inspection, lookup, conversion, registration,
and guaranteed state. `define*` constructs or normalizes and returns a durable
typed value used by a supported consumer. Validation may be its precondition, but
inspection or an unchanged identity result alone is not definition. `validate*`
and `check*` inspect input and return structured results; their contracts state
which failures are returned and which conditions throw.

When construction, validation, registration, or another capability is public,
each has its own callable role. A released mismatch follows an explicit
deprecation and migration instead of a silent rename or behavior change. Other
verbs receive repository-wide rules only when shipped evidence supports them.
Component prop and event naming remains separate. CLI command verbs and their
programmatic command twins remain with the CLI surface owner.

Rejected: treating a function that only validates and returns its input as a
`define*` function, returning a bare predicate from a public `validate*` or
`check*` function, using `use*` for a non-hook utility, or hiding separately
public registration inside a constructor without a compatibility plan.

### DEC-8 — Public primitives are intentional semantic contracts

**Reference:** `spec:AST-002/DEC-8`
**Decider:** `cixzhang`, `2026-09-06`

Prefer a public primitive when product builders need to compose stable behavior
across callsites and the contract can name caller intent, operations, outcomes,
and failure behavior without exposing implementation machinery. Record that
contract as current before accepting the public surface.

A bug fix does not create an exception. When it restores current authority, keep
its API and behavior within that contract. Any additional public primitive or
observable behavior follows `architecture:knowledge-contracts`: first conform,
remove, or split a separable contradiction or unsettled tagalong; then reuse an
existing current decision when one settles an intentional surviving delta. Ask the
owner only for a surviving decision the team actually wants to pursue.

Rejected: promoting internal focus targets, gesture memory, DOM slots, timers, or
other existing fields merely because removing an internal wrapper or fixing one
path becomes easier. Existing implementation is evidence of mechanics, not intent
for permanent public API.

### DEC-9 — Caller decision burden must be visible and justified

**Reference:** `spec:AST-002/DEC-9`
**Decider:** `cixzhang`, `2026-09-12`

A public API proposal shows the callsite before and after the change and names each
new decision a caller must make. The decision is admitted only when it represents
caller-owned intent the component cannot derive and its outcome remains predictable
across defaults, combinations, and supported states.

Rejected: treating a shorter implementation, a persuasive user-impact summary, or
a completed review checklist as proof that callers should own another choice.

## Open questions

None.
