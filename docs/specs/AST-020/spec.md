---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-020
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-03
phase: accepted
owners: [cixzhang]
affects_architecture: []
affects_families: []
affects_contributing: []
affects_consumer_docs: []
---

# Accessibility spec-test authoring system spec

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "accessibility": ["FR1", "FR2", "FR6", "FR15"]
  }
}
```

## Intent

People using Astryx components should get the keyboard, focus, meaning, and state
promised by [WCAG 2.2](https://www.w3.org/TR/WCAG22/) and the
[WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/) widget pattern
Astryx adopts. Reusable accessibility spec tests turn those promises into
reviewable contracts instead of requiring each component author to reinterpret
the standards.

A spec test states one user-observable requirement, cites its source, names the
evidence layer that can prove it, and runs unchanged against every conforming
binding. The test suite complements axe, browser checks, and assistive-technology
review. It does not claim that one automated pass proves complete accessibility.

## Non-goals

- Implementing the spec-test package or CI jobs in this specification pull request.
- Defining how existing component tests migrate; that is owned by
  [AST-021](../AST-021/spec.md).
- Publishing the first implementation as a supported package.
- Reimplementing axe rules or replacing browser, visual, manual, or real-AT
  verification.
- Treating WAI-ARIA Authoring Practices as a substitute for WCAG conformance.
- Using the WCAG 3.0 working draft as a pass/fail baseline before it is ready.
- Encoding page-owned requirements in an isolated component contract when the
  component cannot satisfy them.

## Requirements

### Normative basis and scope

- **FR1 — WCAG 2.2 A and AA are the conformance baseline.** Every WCAG
  conformance expectation MUST cite an applicable WCAG 2.2 Level A or AA success
  criterion. A pattern expectation MAY instead cite an exact APG requirement when
  APG supplies the interaction detail. In that case it MUST identify the WCAG 2.2
  user outcome it supports without inventing a success-criterion mapping. WCAG 3.0
  principles MAY inform plain-language intent, user needs, and future research, but
  a WCAG 3.0 draft requirement MUST NOT create or clear a pass/fail check without a
  later current Astryx record.
- **FR2 — APG defines an adopted widget pattern, not universal conformance.** When
  Astryx adopts a WAI-ARIA APG pattern, the pattern contract MUST cite the exact APG
  roles, states, properties, or keyboard interaction it adopts and the WCAG 2.2
  outcome those mechanics support. A component MAY use another standards-valid
  model only when its current component, family, or system contract records that
  choice; the spec test MUST follow the owning contract rather than forcing an APG
  example mechanically.
- **FR3 — Contracts have two layers.** Every pattern review MUST consider both:
  broad component-owned requirements that apply across patterns, and
  pattern-specific role, state, relationship, keyboard, and focus requirements.
  A component part may bind to more than one pattern. A whole component MUST NOT be
  forced into one pattern when its parts have distinct roles.
- **FR15 — Adoption follows the role a component already plays.** Where a
  component part already plays an APG pattern's role, Astryx adopts that pattern's
  required parts for it: the role, the accessible name, the state and relationship
  properties, and activation by Tab plus Enter or Space. The pattern's optional
  keyboard extras — arrow-key movement between parts, Home and End — are adopted
  only where the component already acts as one composite control; a set of
  independently focusable controls does not gain them. The owning component record
  names the parts it adopts, any required part it does not adopt with the reason,
  and any extra it adopts beyond this rule as a named exception.

### Expectation contract

- **FR4 — Every expectation is traceable.** An expectation MUST have a stable id,
  a short user outcome, an exact normative source (WCAG 2.2 success criterion, APG
  requirement, current Astryx contract, or an applicable combination),
  applicability conditions, an evidence layer, and an enforcement class. The test
  name and failure output MUST expose the expectation id and source reference so a
  failure can be understood without opening the runner implementation.
- **FR5 — Applicability is explicit.** For every checklist dimension, an author
  MUST either encode an applicable expectation or record why the dimension is not
  owned by this pattern, binding, or evidence layer. Silence is not an exemption.
  An exemption MUST name the actual owner or verification method; it MUST NOT be a
  generic “not applicable” escape hatch.
- **FR6 — Evidence layers keep distinct proof boundaries.** Expectations are
  classified as unit, DOM, accessibility-tree, axe, real-browser, visual, lint,
  manual, or real-AT checks. A lower layer MUST NOT claim a result only a higher
  layer observes. Announcement wording or timing, virtual-cursor entry, and known
  AT/browser divergence follow [AST-009](../AST-009/spec.md); an accessibility-tree
  snapshot does not prove spoken output.
- **FR7 — Contracts assert outcomes, not Astryx internals.** A reusable expectation
  MUST query and act through public semantics and observable behavior. It MUST NOT
  depend on Astryx class names, private DOM wrappers, implementation callbacks, or
  source layout unless an owning current record makes that structure contractual.
  Component-specific API effects remain in component tests.
- **FR8 — Interactive expectations prove the complete transition.** Keyboard,
  pointer, state, and focus expectations MUST exercise the relevant starting state,
  action, resulting state, and reverse or dismissal path when the pattern supports
  one. Merely finding a role or proving one direction of a toggle is insufficient.
- **FR9 — Enforcement is separate from severity and tool coverage.** A directly
  applicable WCAG 2.2 Level A or AA expectation is `required`. An APG or
  Astryx-specific expectation is `required` only when a current Astryx record adopts
  that outcome. `Advisory` expectations report best practice, an unsettled choice,
  or an outcome not yet adopted as an Astryx contract. `Advisory` expectations
  report only; `required` expectations gate new or changed behavior at a layer that
  can objectively verify them. A coverage score, tool capability, or ease of
  automation MUST NOT promote or demote either class.
  WCAG 2.5.2 (pointer cancellation) is met by cancelling a press that slides
  off its control before the lift, with one narrow exception: an instantly
  reversible single-step toggle, where a second activation undoes the first,
  may complete on a lift after the pointer slid off, meeting 2.5.2 through its
  undo path. The exception covers Switch, Checkbox, and CheckboxListItem. It
  does not cover Radio, SegmentedControl, DropdownMenuCheckboxItem (whose menu
  rows act on nothing after a lift off the row), SelectableCard, or any
  control that selects rather than toggles; other controls join only by a
  later decision, and every other control that activates on a lift keeps
  slide-off cancelling (DEC-5).

### Completeness and review

- **FR10 — Every pattern uses one completeness review.** The review starts with
  the source map below, then adds applicable WCAG 2.2 component outcomes such as
  focus not obscured, status messages, target size, contrast, forced colors, and
  the pattern's APG interactions. Page-owned rows are considered only for fixtures
  or surfaces that own a page. Every row follows FR5 and FR6 rather than being
  forced into the reusable runtime contract.

| WCAG 2.2 source                     | Outcome to consider                                                                        | Usual ownership                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------- |
| 1.1.1 Non-text Content              | Informative non-text content has an equivalent alternative; decorative content is ignored. | Component or content                  |
| 1.3.1 Info and Relationships        | Visual structure and relationships are programmatically available.                         | Component or composition              |
| 1.3.2 Meaningful Sequence           | Programmatic reading sequence preserves meaning.                                           | Component or composition              |
| 1.4.1 Use of Color                  | Color is not the only way to convey information or state.                                  | Component, theme, and caller content  |
| 1.4.3 Contrast (Minimum)            | Text and images of text meet the required contrast.                                        | Component and theme                   |
| 1.4.11 Non-text Contrast            | Controls, states, and meaningful graphics meet non-text contrast.                          | Component and theme                   |
| 2.1.1 Keyboard                      | Every component-owned function is operable by keyboard.                                    | Component                             |
| 2.1.2 No Keyboard Trap              | Keyboard focus can leave any component unless the user has a documented exit.              | Component or composition              |
| 2.4.2 Page Titled                   | A page has a descriptive title.                                                            | Page only                             |
| 2.4.3 Focus Order                   | Sequential focus preserves meaning and operation.                                          | Component or composition              |
| 2.4.4 Link Purpose (In Context)     | A link's purpose is determinable.                                                          | Component and caller content          |
| 2.4.6 Headings and Labels           | Headings and labels describe their topic or purpose.                                       | Component and caller content          |
| 2.4.7 Focus Visible                 | Keyboard focus has a visible indicator.                                                    | Component and theme                   |
| 2.4.11 Focus Not Obscured (Minimum) | Focused content is not entirely hidden by author-created content.                          | Component or composition              |
| 2.5.8 Target Size (Minimum)         | Pointer targets meet the minimum size or an allowed exception.                             | Component or composition              |
| 3.1.1 Language of Page              | The page language is programmatically available.                                           | Page only                             |
| 3.2.4 Consistent Identification     | Repeated functions are identified consistently.                                            | System, component, and caller content |
| 3.3.2 Labels or Instructions        | Inputs have persistent labels or needed instructions.                                      | Component and caller content          |
| 4.1.2 Name, Role, Value             | Name, role, state, value, and changes are programmatically available.                      | Component                             |
| 4.1.3 Status Messages               | Status changes are exposed without moving focus.                                           | Component or composition              |

- **FR11 — The contract itself has positive and negative proof.** Each expectation
  MUST pass against a minimally conforming fixture or binding and fail when its
  required outcome is deliberately removed. Pattern-level tests MUST distinguish a
  real violation from an unsupported harness operation or fixture error.
- **FR12 — Completion requires an independent accessibility review.** A pattern is
  complete only when every checklist dimension is encoded or explicitly assigned
  elsewhere, all expectations are traceable, representative bindings pass or expose
  exact known gaps, mutation evidence proves required expectations can fail, and an
  accessibility subject-matter reviewer finds no unaccounted contract-encodable
  requirement.
- **FR13 — The pull request describes the spec test in readable form.** A new or
  materially changed pattern pull request MUST state who is affected, the adopted
  pattern and scope, the expectation table with source and evidence layer, explicit
  exemptions, representative bindings and states, known component gaps, and the
  mutations or failures that prove the contract. The description is the readable
  specification of the test; the executable contract remains the checked source of
  truth.
- **FR14 — Stable ids survive refactors.** Renaming files, helpers, or harnesses MUST
  preserve expectation ids. Splitting, combining, narrowing, or changing the user
  outcome creates an explicit contract change and migration for every binding and
  known-gap record that refers to the affected ids.

### Platform support

- Supported feature/engine floor: the affected component's current browser-support
  contract under [AST-013](../AST-013/spec.md).
- Unsupported behavior: a harness that cannot observe an assigned evidence layer
  reports that limitation; it does not pass, skip silently, or substitute a lower
  layer.
- Browser evidence: browser-class expectations run in a real shipping engine. A
  DOM emulator cannot prove focus navigation, native top-layer behavior, computed
  accessibility-tree exposure, contrast, target geometry, or forced-color paint.

## Current-state impact

[Issue #4112](https://github.com/facebook/astryx/issues/4112) established the
reusable pattern-contract direction. The closed
[Switch prototype](https://github.com/facebook/astryx/pull/4113) demonstrated one
contract running through jsdom and Chromium bindings, source-linked expectation ids,
and exact known failures. It also showed why axe and pattern contracts are
complementary: axe finds broad markup violations, while the contract verifies the
state and interaction that make a switch behave as a switch.

The prototype is evidence, not current policy. Its package name, scoring model,
priority names, and harness shape remain implementation choices unless this or
another current record adopts them. This spec keeps the proven contract boundary
while correcting two risks before scale-out: a numeric score must not stand in for
conformance, and each expectation must name the evidence layer that can actually
observe its outcome.

The completeness review incorporates recurrent component-owned failures such as
text alternatives, semantic relationships and order, focus order and visibility,
descriptive labels and links, consistent identification, persistent instructions,
and name/role/value/state. It updates that review to WCAG 2.2 and keeps page-owned,
browser-owned, and real-AT-owned checks outside a component runtime contract when
that is the honest boundary.

This accepted spec creates no tests, package, CLI documentation, component behavior,
or CI gate. Those changes follow in implementation work governed by this record.

## Verification

| Contract  | Verification                                                                  | Representative states                                                                                                                                                                                                 | Mutation or failure expectation                                                                                                                                                                                                        |
| --------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1–FR3   | Source and ownership review against WCAG 2.2, APG, and current Astryx records | component-owned A/AA criterion; page-owned criterion; one component with multiple parts                                                                                                                               | A draft WCAG 3.0 statement gates CI, an APG example is treated as universal WCAG, or one component is forced into one pattern                                                                                                          |
| FR4–FR9   | Contract schema and runner self-tests                                         | required/advisory; unit/DOM/tree/axe/browser/manual/AT; toggle round trip; component-specific callback; a slide-off lift on Switch, Checkbox, CheckboxListItem, Radio, SegmentedControl, and DropdownMenuCheckboxItem | A check lacks a source or layer, passes from an unsupported harness, depends on private markup, or one-way behavior hides a reverse-path failure, a slide-off lift that completes a lift-activated control outside the exception fails |
| FR10–FR12 | Completed checklist, positive/negative fixture suite, and independent review  | simple control; composite widget; overlay; page-owned criterion                                                                                                                                                       | A dimension disappears silently, a mutation still passes, or review finds an unrecorded contract-encodable requirement                                                                                                                 |
| FR15      | Adoption review against the component's current role claims                   | a disclosure set adopting required parts only; a composite control adopting arrow keys; a named exception                                                                                                             | A required part is skipped without the owning record's reason, or arrow keys are added to independently focusable controls without a named exception                                                                                   |
| FR13–FR14 | Pull-request template check plus id migration tests                           | new pattern; narrowed expectation; file-only refactor                                                                                                                                                                 | Reviewers cannot understand the test from the PR, or an id change orphans bindings and gaps                                                                                                                                            |
| Platform  | Real-browser and AST-009 evidence-boundary checks                             | focus navigation; accessibility tree; forced colors; announcement timing                                                                                                                                              | jsdom or a tree snapshot is credited with pixels, browser behavior, or spoken output it cannot observe                                                                                                                                 |

### Completion criteria

This spec moves from `accepted` to `shipped` only when:

- the reusable contract schema enforces FR4–FR6 and FR9;
- the authoring guide and pull-request template implement FR10–FR13;
- contract self-tests include conforming and deliberately violating fixtures under
  FR11;
- at least one pattern runs against representative jsdom and browser bindings
  without relying on Astryx-private structure;
- unsupported harness capabilities fail honestly rather than passing or skipping;
- no aggregate coverage score is presented as proof of conformance; and
- the shipped guide links AST-009 for real-AT claims and AST-021 for migration.

## Decision log

### DEC-1 — Use WCAG 2.2 for conformance and WCAG 3.0 only for forward-looking intent

**Reference:** `spec:AST-020/DEC-1`
**Decider:** `cixzhang`, `2026-09-03`

WCAG 2.2 Level A and AA provide the current testable baseline. WCAG 3.0 may help
frame user needs, assistive-technology experience, and future evaluation, but its
working draft does not decide current pass/fail results.

Rejected: waiting for WCAG 3.0 or treating a draft outcome as a current conformance
requirement.

### DEC-2 — Author one reusable outcome contract per adopted pattern

**Reference:** `spec:AST-020/DEC-2`
**Decider:** `cixzhang`, `2026-09-03`

Separate the standards-derived pattern contract from component bindings. This lets
multiple components share one interpretation while allowing a component's parts to
bind to different patterns and keeping component-specific API behavior local.

Rejected: copying APG assertions into every component test or forcing all
accessibility checks into one global scanner.

### DEC-3 — Make the pull request a readable specification of the executable test

**Reference:** `spec:AST-020/DEC-3`
**Decider:** `cixzhang`, `2026-09-03`

A reviewer must be able to judge the user outcome, standards basis, evidence layer,
exemptions, bindings, and mutation proof without reverse-engineering runner code.
The checked contract remains executable truth; the pull request makes that truth
reviewable by accessibility specialists and maintainers.

Rejected: code-only review or a generic accessibility checklist with no exact
mapping to executable expectations.

### DEC-4 — Adopt what the component already is

**Reference:** `spec:AST-020/DEC-4`
**Decider:** `cixzhang`, `2026-10-13`

A pattern's required parts belong to any component part that already plays the
pattern's role, because a user who meets that role expects its name, state, and
activation. Its optional keyboard extras belong only to one composite control,
because arrow keys and Home/End move within one widget; independent controls keep
the page Tab order. A component that already ships an extra records it as a named
exception rather than losing it.

Rejected: adopting every part of a pattern wherever its role appears (arrow keys on
independent controls); adopting nothing until a component matches an APG example in
full.

### DEC-5 — Reversible toggles may complete after a slide-off

**Reference:** `spec:AST-020/DEC-5`
**Decider:** `cixzhang`, `2026-10-26`

A Switch or Checkbox that completes on a lift after the finger slid off can be
undone by activating it again, which WCAG 2.5.2 accepts, and it matches
UIKit's UISwitch. The exception names its kinds so it cannot widen without a
decision; controls that select, such as Radio and SegmentedControl, keep
slide-off cancelling because a second activation does not undo them.

Rejected: slide-off cancelling for every control without exception.

## Open questions

None.
