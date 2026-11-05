---
schema_version: 1
template_version: 1
kind: architecture
id: architecture:component-test-sufficiency
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-08
owners: [cixzhang]
applies_to:
  [
    packages/core/src/,
    packages/lab/src/,
    packages/charts/src/,
    packages/richtext/src/,
    packages/vega/src/,
  ]
verified_by: [component verification maps and their linked test evidence]
deciding_specs: []
---

# Component test sufficiency architecture

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "testing": [
      "INV1",
      "INV2",
      "INV3",
      "INV4",
      "INV5",
      "INV6",
      "INV7",
      "INV10",
      "INV11"
    ]
  }
}
```

## Purpose

Astryx component tests should give maintainers confidence that current promised
behavior will fail clearly when it regresses, without turning every possible input
combination or audit inventory row into a permanent test.

This record defines how current component, module, family, architecture, system,
design, and theme requirements plus applicable objective standards become a rational
observable test plan. It owns test sufficiency and test quality. It does not create
product behavior.

## System model

Test sufficiency starts from applicable authority, not from a universal list of
states every component must implement:

1. Assemble the component's current public behavior from every applicable current
   component, module, family, architecture, system, design, and theme record, plus
   applicable objective standards.
2. Identify the promises whose failure would harm a user, consumer, accessibility
   path, compatibility boundary, or regression-prone integration seam.
3. Partition inputs, states, and boundaries by observable behavior and risk.
4. Check whether existing evidence already fails for the distinct promise and
   partition. If it does, cite that evidence and add no duplicate test.
5. Select the evidence layer that can observe the failure: compile-time, unit/DOM,
   browser behavior, rendered pixels, accessibility tree, real assistive technology,
   documentation/schema validation, or review.
6. Add a new automated test only when no current mutation-sensitive evidence covers
   the promise at that layer.
7. Record the relationship in the owning verification map.

The number of tests follows the number of distinct behaviors and risks. It is not a
fixed target and does not equal the number of public props, source branches, audit
rows, or inventory entries.

## Boundaries and invariants

- **INV1 — Authority and evidence are distinct.** A test may prove behavior
  required by any applicable current component, module, family, architecture,
  system, design, or theme authority, or by an applicable objective standard. Where `spec:AST-029` permits observational audit, a test may
  also prove behavior exposed through an established public interface recorded in
  the audit receipt. That evidence may support a test-sufficiency verdict but MUST
  NOT create or settle product authority. Missing or draft-only authority remains
  a separately reported authority gap.
- **INV2 — Critical promises have regression evidence.** Tests cover every
  applicable critical promise and regression-prone seam named by the owning
  verification map. Critical promises include behavior whose failure breaks the
  primary task, accessibility, a public callback or state contract, compatibility,
  data integrity, cleanup/lifetime, or a documented composition boundary whose
  failure breaks a current consumer outcome or a named regression-prone integration
  seam.
- **INV3 — Previously fixed behavior defects remain protected.** A fix to a
  defect in a current observable behavior includes mutation-sensitive regression
  evidence at a capable layer that reproduces the broken outcome before the fix
  and passes after it. A documentation correction that leaves source, types,
  behavior, and public machine-readable schema unchanged is not a behavior-defect
  fix. Existing regression evidence remains unless authority removes the promise
  or equivalent evidence demonstrably subsumes the case.
- **INV4 — Partitions follow behavior and risk.** Inputs, states, platforms, and
  boundaries MAY share one representative case only when current evidence shows
  they exercise the same observable path and have no distinct regression risk.
  Different behavior, ownership, platform semantics, failure modes, or known
  regression history requires a separate partition.
- **INV5 — Assertions observe the contract.** Tests assert public behavior,
  owner-observable state, rendered user outcomes, accessibility semantics,
  compile-time consumer contracts, or external-system effects through a stable
  seam. A class, attribute, DOM shape, generated type, or source artifact is valid
  evidence when current authority explicitly makes it contractual or an `AST-029`
  receipt records it as the established public interface for this audit. Tests MUST
  NOT rely solely on private call order, private state shape, internal collaborators,
  or incidental structure when the promised outcome can be observed more directly.
- **INV6 — Evidence is mutation-sensitive.** A test counted as sufficient MUST fail
  when its promised behavior is removed, inverted, routed to the wrong owner, or
  otherwise materially broken. An assertion that recomputes the implementation,
  repeats a type/source declaration, checks a constant against itself, or snapshots
  unrelated output does not prove the promise.
- **INV7 — Coverage remains bounded and intentional.** Test volume has a named
  behavioral, evidence-layer, or risk reason. Multiple evidence layers are not
  duplicates when each observes a distinct required contract boundary, such as
  compile-time API, DOM semantics, browser behavior, or assistive-technology
  output. Repeated cases within the same partition, broad defensive matrices,
  exhaustive combinations, and snapshot volume without additional behavioral
  signal MUST NOT be required or credited as sufficiency.
- **INV8 — Verification maps own durable evidence relationships.** Verification
  maps in applicable current component, module, family, architecture, system,
  design, and theme records name the critical contract, representative partitions,
  evidence seam, and mutation or failure signal. When
  no current map exists, the `spec:AST-029` audit receipt records the provisional
  evidence relationship; the missing map is an authority or traceability gap, not
  by itself a test-coverage gap. One test MAY prove several requirements, and one
  requirement MAY need several tests. There is no one-row-to-one-test rule.
- **INV9 — Audit remediation follows its process owner.** Audit-authored behavior-
  test remediation follows `spec:AST-029/DEC-4`: establish the current or
  established public seam, demonstrate the new case red before production changes,
  and implement one minimal observable vertical slice. Store that chronology in
  the pull-request or audit-run evidence. Red/green history is change evidence; it
  is not part of standing suite sufficiency after the change lands.
- **INV10 — Gaps and hardening are distinct.** Missing coverage is a gap only when
  an applicable critical promise or known regression-prone partition lacks
  mutation-sensitive evidence. Additional equivalent inputs, private implementation
  checks, speculative platform combinations, and defensive edge cases without a
  named risk are optional hardening and do not lower the sufficiency verdict.
- **INV11 — New tests require a new proof obligation.** Classify the changed
  claim, not the file edited. A change MUST NOT add a component functional test
  merely because it edits documentation, private styling source, a private or
  generated class name, a private wrapper, or another implementation detail. A
  current public class or target contract is not covered by that exception and
  requires focused contract evidence when changed. New automated evidence is
  required only when the change adds or repairs a distinct current promise or risk
  partition that existing evidence cannot detect at the correct layer. Otherwise
  the change cites existing evidence or uses the applicable non-test proof, such as
  typed documentation validation, source review, or rendered browser evidence.

## Rational partitioning

A partition is defined by a difference that can change the promised outcome or its
risk. Representative dimensions include:

- semantic state or transition;
- controlled, uncontrolled, optimistic, rejected, or interrupted ownership where
  the current contract distinguishes them;
- enabled, disabled, read-only, busy, required, or invalid behavior where
  applicable;
- input modality, direction, browser capability, or platform when the owner or an
  objective standard predicts different behavior;
- zero, one, many, empty, overflow, boundary, or invalid data when the algorithm or
  user outcome changes;
- default, composed, replaceable-part, nested-owner, portal/top-layer, or teardown
  paths when ownership or lifetime changes; and
- exact previously broken inputs and seams.

Inputs are equivalent only when evidence supports the same observable contract,
outcome, owner, and regression risk. A shared implementation path may support that
judgment, but it is neither required nor sufficient. Different literal values do
not require separate cases when none of those dimensions changes.

## When no new test is warranted

A correct change may require **no new automated test**. Reviewers stop adding tests
when existing evidence already detects the affected promise, or when an automated
component test cannot observe the changed claim.

| Change                                                                                                                                    | Required evidence                                                                                         | Do not add                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Consumer-doc prose or example is corrected to match unchanged current source, types, and behavior                                         | Existing doc parser/typecheck/schema validation when applicable, plus review against the canonical source | A component runtime test that repeats the prose, prop name, or example                         |
| A recurring deterministic docs/source relationship is missing a guard                                                                     | One generalized validator at the shared source-of-truth boundary                                          | One component-specific test per corrected document                                             |
| Visual paint or geometry values change while the set of states, selectors, state ownership, timing, and public structure remain unchanged | Real-browser before/after evidence and the applicable stable visual-regression path                       | A jsdom assertion that a private class exists, or a functional test that cannot observe pixels |
| A private class, wrapper, StyleX declaration, or DOM arrangement changes without changing a current structural contract                   | Existing behavior evidence plus rendered evidence when appearance changes                                 | An assertion that freezes the new private implementation                                       |
| Existing mutation-sensitive evidence already covers the same promise and partition                                                        | Link the existing evidence and show why its failure signal covers this change                             | A second test with equivalent setup and assertions                                             |
| A refactor preserves all observable contracts                                                                                             | Run the applicable existing suites and review the unchanged public seams                                  | A test whose only purpose is to restate the refactor's new structure                           |
| A machine-readable public schema, documented public target/class, or compile-time consumer contract changes                               | Focused contract/inventory/type evidence owned by that public surface                                     | A broader functional test when the structural contract check directly detects the failure      |

A visual implementation and its private class can be wrong together. For example,
making a Button red and asserting that the new private class name is present proves
neither the rendered color nor the user's visual outcome. The class assertion is
valid only when current authority makes that exact class a public compatibility
contract; even then, it proves class reachability, not pixels.

Documentation can itself carry a public machine-readable contract. In that case,
test its parsed schema or generated projection at the shared boundary. Do not freeze
ordinary prose word-for-word or duplicate source declarations in component tests.

A documentation correction that exposes an untested behavior defect follows the
behavior rule instead: first identify the current promise and uncovered partition,
then add the smallest observable regression test for that behavior—not for the
wording that revealed it.

## Test-quality exclusions

The following do not establish sufficiency by themselves:

- a type test that merely copies a declaration without exercising the consumer's
  compile-time contract;
- a tautological expected value calculated by the same algorithm as production;
- a test added beside a new private class or StyleX declaration that only asserts
  that exact class or declaration is present;
- a DOM/class assertion used as a substitute for a visual claim such as color,
  spacing, alignment, clipping, or motion;
- a test that freezes ordinary documentation prose or repeats an example already
  validated by the shared documentation/type pipeline;
- assertions against private function calls, hook internals, or implementation
  ordering when public behavior is observable;
- snapshots whose changed bytes do not identify the promised behavior;
- repeated cases with no distinct behavior or risk;
- Cartesian products or adversarial inputs generated without a current promise,
  objective standard, prior defect, or named failure hypothesis;
- tests that only prove rendering did not throw, unless crash-free rendering at that
  named compatibility boundary is the promised observable outcome; and
- tests added after a fix without evidence that the new case could detect the
  original defect.

These tests may support debugging or optional hardening. They are not credited as
the only evidence for a critical promise.

## Missing authority versus missing coverage

Auditors classify the boundary before recommending tests:

- **Current behavior authority, sufficient evidence:** no coverage gap.
- **Current behavior authority, missing or insensitive evidence:** test-coverage
  gap.
- **No current behavior authority:** product-authority gap; route to the canonical
  owner before prescribing expected output.
- **Draft authority only:** private owner hold; a test may preserve current facts
  but cannot make the draft decision current.
- **Objective standard applies independently:** test the required observable
  standard outcome and link the standard owner.
- **Existing evidence covers an equivalent partition:** optional hardening, not a
  gap.

## Verification-map contract

A verification row identifies:

- the current requirement or group of inseparable requirements;
- the stable observable seam and evidence type;
- representative partitions and why they are sufficient; and
- the mutation or failure that must make the evidence fail.

Verification maps do not enumerate every audit inventory row, source branch, prop,
or test file. They point to evidence at the level needed to keep the durable
promise reviewable.

## Future audit-rubric migration handoff

This architecture does not own rubric weights, score computation, versioning
implementation, or wiki editing. It defines the test-sufficiency authority that a
separate rubric activation MUST consume. When this record becomes current, that
separately reviewed activation replaces Component Audit Rubric section 4's generic
product-behavior checklist as follows:

- retire **B1–B16** as product-behavior rule IDs;
- do not reuse those IDs and do not renumber unrelated stable audit IDs;
- preserve the weighted **Behavior** scoring slot;
- populate that slot from every applicable current component, module, family,
  architecture, system, design, and theme behavior requirement plus applicable
  objective standards;
- score the **Behavior** slot from observed conformance to the assembled applicable
  behavior requirements and objective standards;
- score the **Testing** slot from INV1–INV8 and INV10–INV11 evidence sufficiency
  and quality, and retain INV9 as pull-request or audit-run evidence;
- exclude non-applicable requirements and keep the rubric's existing explicit
  unmeasured treatment when required evidence cannot be obtained;
- preserve one-defect/one-section ownership so one missing behavior or test is not
  deducted twice; and
- bump the rubric minor version because replacing B1–B16 changes scoring method and
  comparability.

The future activation maps the former rows as follows:

| Former rows | Future source                                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1–B11      | Every applicable current component/module/family/architecture/system/design/theme behavior requirement and objective standard; no generic replacement behaviors |
| B12         | Already retired in rubric v1.16; keep the ID reserved                                                                                                           |
| B13         | Named risk partitions and documented composition seams from applicable current authority; no open-ended adversarial matrix                                      |
| B14         | Applicable current component/module/family/architecture/system/design/theme contracts and objective standards for the owning behavior layer                     |
| B15         | Current critical promises and regression-prone seams under INV2–INV4; no generic latent-regression catch-all                                                    |
| B16         | Retire from Behavior; preserve the PR-only red/green obligation under `spec:AST-029/DEC-4` and the Testing/review process                                       |

This specification PR does not edit the wiki rubric, scoring code, audit prompt,
tests, or tooling. The replacement activates only after this record is current and
the separately reviewed rubric minor-version change lands.

## Change coupling

Focused test-sufficiency review triggers when a change:

- adds or removes a current behavioral promise;
- changes a verification map or its linked evidence;
- fixes a defect or closes an audit coverage gap;
- claims several inputs/states are equivalent;
- adds a broad matrix, snapshot family, implementation-coupled test layer, or a
  new test for a docs/visual/private-implementation-only change; or
- changes which objective standard or platform distinction applies.

Review evaluates the changed requirement and representative unchanged partitions;
it does not require unrelated full-suite expansion.

## Owning code

- Applicable current component, module, family, architecture, system, design, and
  theme verification maps — promises, representative partitions, evidence, and
  failure expectations.
- Colocated tests and checked browser/accessibility bindings — executable evidence
  linked by those maps.
- This record — shared sufficiency, partitioning, assertion-quality, and gap-
  classification rules.

## Deciding specs

None. `spec:AST-029` continues to own audit backfill, evidence receipts, mode, and
Night Watch operation; it explicitly does not own the general component-test
quality rubric. Applicable current component, module, family, architecture, system,
design, and theme contracts plus objective standards remain the sources of expected
behavior.

## Verification

| Invariant         | Evidence                                                                                                             | Mutation or failure expectation                                                                                                                                                                                                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INV1, INV10–INV11 | Authority-vs-coverage, established-public-interface, and no-new-test decision fixtures                               | Missing product authority is hidden, established public-interface evidence is denied a sufficiency result, optional hardening blocks acceptance, a docs/value-only-visual/private-only change receives a duplicate or non-observing component test, or a current public class/target change is excused as a private implementation detail |
| INV2–INV3         | Critical-promise, behavior-defect, documentation-correction, and historical-regression fixtures                      | A primary, accessibility, callback, compatibility, composition, or previously fixed behavior defect loses its only mutation-sensitive evidence and still passes, or an unchanged prose-only documentation correction is required to add a regression test                                                                                 |
| INV4              | Rational-partition fixtures                                                                                          | Proven-equivalent values require duplicate tests, private implementation identity is required to establish equivalence, or behaviorally different states collapse into one case                                                                                                                                                           |
| INV5              | Public/runtime/compile-time seam replacement fixtures                                                                | Incidental private assertions pass while the promised user or consumer outcome is broken, contractual DOM/type/class/target evidence is incorrectly rejected, a DOM/class assertion is credited for pixels it cannot observe, or selector/state behavior is misclassified as a value-only visual change                                   |
| INV6              | Tautology, declaration-copy, snapshot-noise, and behavior mutations                                                  | An insensitive assertion receives credit, or a meaningful behavior mutation leaves the credited test green                                                                                                                                                                                                                                |
| INV7              | Same-partition duplicates, justified multi-layer evidence, exhaustive Cartesian, and broad defensive matrix fixtures | Distinct required evidence layers are collapsed as duplicates, or volume without a named distinct risk is credited as sufficiency                                                                                                                                                                                                         |
| INV8              | Verification-map relationship fixtures                                                                               | Every audit row mechanically becomes a test, evidence cannot be traced to authority, or one test cannot satisfy inseparable requirements                                                                                                                                                                                                  |
| INV9              | Pull-request and audit-run red/green trace fixtures                                                                  | Audit-authored remediation lacks a failing pre-change case, production remediation precedes the new case, or horizontal test generation replaces one observable vertical slice                                                                                                                                                            |
| B1–B16 migration  | Rubric-version, section-ownership, and Behavior-slot migration fixture                                               | Generic B rules remain product authority, B12 is reactivated or reused, test evidence is double-scored in Behavior and Testing, B16 remains a Behavior check, unrelated IDs are renumbered, the Behavior weight disappears, or scoring changes without a minor-version bump                                                               |
