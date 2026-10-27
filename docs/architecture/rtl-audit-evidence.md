---
schema_version: 1
template_version: 3
kind: architecture
id: architecture:rtl-audit-evidence
authority: current
archive_reason: null
superseded_by: null
approved_by: nynexman4464
approved_at: 2026-10-15
owners: [nynexman4464, cixzhang, imdreamrunner]
applies_to:
  [
    apps/storybook/rtl-audit/,
    scripts/component-packages.cjs,
    .github/workflows/ci.yml,
    .github/workflows/rtl-weekly.yml,
    .github/scripts/rtl-audit-coverage.test.mjs,
    .github/scripts/weekly-rtl-summary.js,
    .github/scripts/rtl-join.mjs,
    .github/scripts/rtl-report-completion.mjs,
    .github/scripts/rtl-shard-scope.mjs,
    .github/scripts/rtl-scorecard-summary.mjs,
    internal/eslint-plugin-astryx/no-physical-properties.js,
  ]
verified_by:
  [
    .github/scripts/rtl-audit-coarse-hit.browser.test.mjs,
    .github/scripts/rtl-audit-coverage.test.mjs,
    .github/scripts/weekly-rtl-summary.test.mjs,
    .github/scripts/rtl-join.test.mjs,
    .github/scripts/rtl-report-completion.test.mjs,
    .github/scripts/rtl-shard-scope.test.mjs,
    internal/eslint-plugin-astryx/no-physical-properties.test.mjs,
  ]
deciding_specs: []
---

# RTL audit evidence architecture

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
      "INV6",
      "INV9",
      "INV10",
      "INV12",
      "INV13",
      "INV14",
      "INV16"
    ]
  }
}
```

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Governing contract      | `design:bidirectionality` owns what correct RTL behavior means; component contracts own local semantics, exceptions, and verification. No product contract changes; this record owns evidence admission and freshness.                                                                                                                                                              |
| System behavior         | Every component in the live roster is accounted for; available in-scope stories are rendered LTR and RTL. Results distinguish measured, verified N/A, coverage gap, and behavior failure. Lint and rendered audit prove different claims.                                                                                                                                           |
| End-user impact         | People reading RTL interfaces are protected by evidence that actually observed mirroring, ordering, placement, geometry, and behavior, rather than by a green report that measured nothing.                                                                                                                                                                                         |
| Builder impact          | A new or changed component must either be measured by an applicable check or carry an explicit gap; behavior failures have no allowlist. Verified-N/A and pre-existing-debt admission await owner decisions (OQ1, OQ2).                                                                                                                                                             |
| Compatibility/readiness | INV12–INV16 specify D1 fixture metadata and stable selection, not shipped enforcement. Component-wide N/A admission, historical debt, and required-check rollout remain unresolved; D7 enforces each configured native target minimum.                                                                                                                                              |
| Review checks           | Reject lint standing in for rendered evidence (INV1); an allowlist that relabels a behavior failure (INV3); all-N/A credited as RTL-ready (INV4); a component dropping from the roster because its story moved (INV5); a new dimension without a red/green mutation receipt (INV9); a D1 exclusion on directional controls/cues or missing review-facing disclosure (INV12, INV16). |
| Governing rules         | No deciding system spec; `architecture:knowledge-contracts` evidence-freshness and human-decision rules apply.                                                                                                                                                                                                                                                                      |

This table is a review projection; the body below is authoritative.

## Purpose

Astryx needs review evidence that distinguishes three claims:

1. a component's direction-sensitive behavior was actually measured;
2. RTL genuinely does not apply to the component; or
3. RTL applicability remains unmeasured debt.

A green lint rule, an all-N/A browser report, or a checked-in exception must not be
credited with proving more than it observed. A reference fixture's dimension-level
non-applicability is distinct from a component-wide verified-N/A declaration.
The former describes one story's semantics; the latter requires evidence for the
whole component.

The global `testing` route supplies shared evidence and exclusion-review claims
when an RTL test, evidence claim, or exemption is relevant to the change. It does
not supply component behavior or visual intent: `design:bidirectionality` owns
those relationships, and component/module contracts own local states and their
verification maps. Matching this route neither requires every component to
implement the audit runner nor imports workflow topology, unresolved N/A/debt
admission, or gate-rollout decisions as universal component rules. Review applies
only the routed claims within their stated evidence scope; draft routes remain
non-authoritative.

## System model

```text
changed component or full-library sweep
  → discover the live component roster across every registered component package
  → render relevant stories LTR and RTL
  → run automatic relationship checks
  → run curated component checks
  → combine results per component
       measured
       verified N/A
       unexplained coverage gap
       optional known debt (unresolved proposal)
  → report behavior failures, stale evidence, and applicability state
```

Lint and rendered audit are complementary:

- lint rejects source patterns whose directional failure can be proved from the
  declarations alone;
- browser checks prove computed geometry, visibility, ordering, hit targets,
  scroll/drag behavior, and composed transforms;
- verified-N/A evidence, if admitted, proves only that reviewed source and stories
  currently expose no direction-sensitive relationship.

## Boundaries and invariants

- **INV1 — Evidence follows the claim.** Source lint MUST NOT stand in for
  computed geometry or interaction. Rendered screenshots MUST NOT stand in for
  keyboard, drag, scroll, or hit-test behavior. A browser relationship check MUST
  NOT claim that every component state was exercised when its stories did not
  render those states.
- **INV2 — RTL is graded as a relationship.** Directional evidence compares LTR
  and RTL outcomes from the same built source. Pixel identity is not the contract;
  semantic mirroring, order, side, geometry, and behavior are.
- **INV3 — Behavior failures have no allowlist.** When an applicable automatic or
  curated dimension shows incorrect mirroring, ordering, placement, geometry, or
  behavior, the result is a finding. Known history does not turn incorrect RTL
  behavior into pass or N/A.
- **INV4 — All-N/A is not measured.** A component for which every dimension is N/A
  has no positive RTL evidence. It is either verified not applicable under an
  admitted evidence policy or remains a coverage gap/debt.
- **INV5 — The live source roster owns coverage.** The roster is every public
  component of every package registered as a component package, not only Core
  and Lab. A component cannot disappear from review merely because it has no
  story or because its story title changed. Missing renderability is itself a
  coverage gap when the component is in scope.
- **INV6 — Automatic and curated coverage compose.** Generic checks cover broadly
  discoverable icon, decoration, and positional relationships. Component-specific
  selectors are used only for semantics generic discovery cannot infer, such as
  order, scroll direction, overlay side, or touch-target ownership.
- **INV7 — CI scope and weekly scope answer different questions.** PR CI checks
  components affected by the change; it may run per package, but the PR result is
  the join of every package scope and cannot pass with one scope missing. The
  scheduled unfiltered audit checks the full live roster and shared regressions.
  Neither silently replaces the other.
- **INV8 — Applicable evidence invalidates N/A.** A new applicable automatic or
  curated dimension MUST make an existing verified-N/A declaration stale. Source-
  and story-byte invalidation is a proposed additional closure requirement, not a
  capability of the current reason-only registry.
- **INV9 — Evidence mutations prove the gate.** A new audit rule or dimension MUST
  demonstrate that the relevant defect passes unnoticed without the rule and is
  detected after the rule. A passing happy path alone does not prove enforcement.
- **INV10 — Touch-target evidence includes size and alignment.** For a coarse-
  pointer target, proving that the target center matches the visible control is
  insufficient. Browser evidence MUST also measure the effective/native target
  against the owning component's stated minimum size. D7 enforces both native
  dimensions alongside centering and hit-testing using each target's configured
  minimum; it does not assign a universal minimum.
- **INV11 — Audit state is not product intent.** This architecture owns evidence
  admission and freshness. The human meaning of correct bidirectional behavior
  belongs in `design:bidirectionality`; component contracts own local semantics,
  exceptions, and verification.
- **INV12 — Fixture applicability follows semantic role.** D1 icon mirroring
  applies to artwork used as a directional control or cue. A reference fixture
  that displays caller-supplied left/right glyph geometry as data may declare D1
  non-applicable. A glyph's shape alone does not make the sample a directional
  control, and an exclusion MUST NOT hide an applicable behavior failure. The
  human review and disclosure requirements in INV16 apply to explicit exclusions.
- **INV13 — Story exclusions are typed, resolved, and fail closed.** The admitted
  story metadata is `rtlAudit.D1` with `applicable: false` and a nonempty `reason`
  explaining INV12. The audit reads resolved Storybook parameters, including normal
  story-over-meta precedence. Missing rendered metadata, malformed parameters,
  unsupported dimension keys, and an exclusion without a rationale MUST produce
  an error rather than silently skip a check. An empty resolved `rtlAudit` object
  means no exclusion; the reason is not a component-wide approval.
- **INV14 — A D1 exclusion changes only D1.** D5 and D6 MUST still scan every
  in-scope story, including D1-excluded reference fixtures. Other component stories
  remain D1 candidates. If every D1 candidate is excluded, D1 reports N/A with the
  excluded stories and reasons; that is not measured evidence and does not close
  a component coverage gap or grant verified N/A.
- **INV15 — D1 selection and completion identities are stable.** The audit orders
  candidates by story source path, source export order, then story id, and selects
  the first candidate not explicitly excluded from D1. Generated-index insertion
  order MUST NOT choose the representative. The planned identity stays constant
  when another candidate runs or every candidate is excluded; the selected story
  is retained separately so the report names what actually ran. Package/shard
  joins MUST reconcile exact planned/completed identities, not merely equal counts.
- **INV16 — Deliberate D1 exemptions are reviewed and visible.** Adding or widening
  an explicit D1 exclusion, or changing an excluded story's semantic role, MUST
  receive human review through the normal pull-request review. Adding a story
  that inherits a meta-level exclusion counts as widening that exclusion. The reviewer
  checks every affected story, including stories inheriting meta-level parameters,
  and rejects an exclusion whose artwork acts as a directional control or cue.
  A nonempty reason proves only valid metadata, not valid non-applicability.
  Review-facing audit output MUST list every declared D1 exclusion in the audited
  scope with its canonical component, story id, dimension, and rationale, including stories not
  selected as the D1 representative. Reports MUST NOT call the absence of a D1
  measurement proof that directional behavior is correct. Automatic N/A because
  no directional icons were found requires no extra human approval; an unchanged
  exemption is not reapproved on every audit run. This rule does not admit
  component-wide verified N/A or historical coverage debt.

## Change coupling

Changes to audit dimensions, component discovery, curated targets, applicability
registries, proposed evidence hashes, workflow scope, summaries, or RTL lint must
review this record.

A new direction-sensitive component contract must map its requirement to executable
evidence or remain an explicit gap. If owners admit verified N/A or known debt with
byte-bound closure, the implementation MUST bind that evidence to the canonical
source, directly owned helpers/styles, and owned stories so relevant changes fail
stale rather than silently retaining their old classification.

Component-wide verified-N/A admission, a historical coverage-debt baseline, and
required-check rollout remain outside the settled claims until an owner decides
those boundaries. They do not prevent claim-scoped approval of the dimension-level
fixture policy. No decision about those broader states is implied by a D1
exclusion.

### Audit dimensions

The audit's `D` identifiers name repository-specific checks, not an external
internationalization standard. Automatic discovery covers D1, D5, and D6; curated
story targets supply the other dimensions.

| ID  | Observed relationship                                                                             |
| --- | ------------------------------------------------------------------------------------------------- |
| D1  | Directional icons mirror or swap once.                                                            |
| D2  | Previous/next controls exchange horizontal order.                                                 |
| D3  | Directional interaction or scroll behavior follows the active direction.                          |
| D4  | An overlay or positioned affordance follows its logical side.                                     |
| D5  | Positioned elements mirror relative to their parent.                                              |
| D6  | Contextual directional decorations receive exactly one bidi treatment.                            |
| D7  | Coarse-pointer native input dimensions, centers, and hit-testing meet the owning target contract. |
| D8  | Logical inline padding resolves to mirrored physical edges.                                       |
| D9  | Grouped corners follow the declared logical inline side.                                          |

D7 retains both the native input box and the visible wrapper box. Its
`minimumTargetSize` width and height come from the curated target's owning
component/composition contract; absent or invalid dimensions produce an error.

## Owning code

- `apps/storybook/rtl-audit/rtl-audit.mjs` — renders and compares LTR/RTL behavior.
- `apps/storybook/rtl-audit/rtl-audit-coverage.mjs` — discovers the live roster and
  combines measured, N/A, and gap states.
- `scripts/component-packages.cjs` — the registry of component packages whose
  public components form the roster.
- `apps/storybook/rtl-audit/targets.json` — curated D2/D3/D4/D7/D8/D9 targets.
- `apps/storybook/rtl-audit/story-parameters.ts` — planned typed D1 fixture
  applicability surface, absent from the base implementation.
- `apps/storybook/.storybook/preview.tsx` — planned resolved story metadata on the
  existing Storybook root, without a wrapper or sibling around the rendered story.
- `apps/storybook/stories/SVGIconRegistry.stories.tsx` — reference glyph data;
  association with the SVGIcon owner and D1 metadata await the fixture-policy
  implementation.
- `apps/storybook/rtl-audit/verified-not-applicable.json` — candidate verified-N/A
  registry; its admission policy is unresolved (OQ1).
- Historical coverage-debt admission is unresolved. No additional debt-baseline
  file forms part of this contract; absent measurements remain visible gaps.
- `.github/workflows/ci.yml` — affected-component PR audit, sharded per component
  package and joined into one result.
- `.github/scripts/rtl-join.mjs`, `rtl-report-completion.mjs`, and
  `rtl-shard-scope.mjs` — exact package/shard scope and completion reconciliation.
- `.github/scripts/rtl-scorecard-summary.mjs` — review-facing scorecard projection;
  report completeness and exclusion visibility remain requirements, not authority
  to suppress findings.
- `.github/workflows/rtl-weekly.yml` — full-roster scheduled audit.
- `internal/eslint-plugin-astryx/no-physical-properties.js` — source-provable
  physical/logical declaration constraints.
- `design:bidirectionality` — human product intent, owned separately.

The shipped RTL mechanics themselves still lack one canonical architecture owner.
A follow-up `architecture:bidirectional-layout` record should own CSS logical
properties, `rtlStyles`, lazy DOM direction reads, centering helpers, and
first-paint/hydration invariants. This evidence record MUST NOT be treated as that
missing implementation contract.

## Deciding specs

No current system spec settles verified-N/A or known-debt admission. The current
knowledge architecture requires evidence freshness and explicit human decisions;
this record narrows the remaining decision to the options below.

## Verification

| Invariant        | Evidence                                                                                              | Failure signal                                                                                                                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| INV1, INV2, INV6 | focused audit fixtures plus real built Storybook mutations                                            | A source-only rule claims rendered correctness, or a relationship defect stays green                                                                                                                                                                   |
| INV3             | automatic/curated failure tests and summary tests                                                     | A known bad RTL outcome is suppressed as expected or N/A                                                                                                                                                                                               |
| INV4, INV5       | coverage fixtures with missing/no-applicable stories                                                  | A component disappears or all-N/A reports as RTL-ready                                                                                                                                                                                                 |
| INV7             | PR workflow scope tests and weekly-summary tests                                                      | A changed component is skipped or full-roster debt is mistaken for PR-only evidence                                                                                                                                                                    |
| INV8             | automatic/curated applicability tests                                                                 | A newly applicable dimension leaves a verified-N/A declaration current                                                                                                                                                                                 |
| INV9             | red/green mutation receipts for each new dimension                                                    | A new dimension has only passing self-confirming tests                                                                                                                                                                                                 |
| INV10            | native width/height mutation fixtures plus D7 center/hit checks in LTR/RTL, sm/md                     | An undersized native target stays green despite conforming wrapper geometry                                                                                                                                                                            |
| INV12–INV16      | candidate fixture-policy tests and built Storybook mutations; not enforced by the base implementation | reordering the generated story index changes D1; malformed/missing metadata silently skips; a fixture opt-out skips D5/D6 or closes a component gap; an exclusion on directional controls/cues survives semantic review or is omitted from the summary |

### Implementation state

The base audit implements the existing automatic/curated checks and component
coverage rollup. INV12–INV16 define the dimension-level fixture policy and stable
selection contract; their metadata transport and focused mutation tests are not
part of the base implementation. They require separate implementation validation.
An owner may approve that intended contract before implementation without calling
its new checks shipped or enforced. Complete exclusion-summary coverage under
INV16 remains implementation work; a passing audit alone is not the required
human review of an added or changed exemption.

### Candidate evidence states

| State                   | Minimum evidence                                                                                   | May clear a new/changed component? | Current decision state            |
| ----------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------- |
| Measured                | At least one applicable relationship or behavior check passes; every applicable check passes       | yes                                | settled by current audit behavior |
| Verified N/A            | Today: human-reviewed reason; proposed: source/helper/story evidence with fail-closed invalidation | unresolved                         | owner decision required           |
| Coverage gap            | No applicable measurement and no admitted current N/A evidence                                     | no                                 | settled                           |
| Known pre-existing debt | Proposed removal-only baseline entry that remains visible and non-failing while unchanged          | unresolved                         | owner decision required           |
| Behavior failure        | An applicable dimension fails                                                                      | no                                 | settled; no suppression           |
| Stale evidence          | Today: an applicable dimension appears; proposed: recorded evidence bytes change                   | no                                 | partially implemented             |

### Current enforcement gaps

- The reason-only verified-N/A registry becomes stale when an automatic/curated
  dimension becomes applicable, but does not yet bind evidence to source/helper/
  story bytes.
- CI summary code still contains an unused `knownNotRtl` label path even though the
  report emits no such allowlist. Remove it so the implementation cannot be read as
  permitting known behavior failures.
- Component/composition records and AST-020 own coarse-pointer minimum target
  sizes. This audit record does not assign a universal pixel minimum.

## Open decisions

### OQ1 — Is verified N/A an admitted closure state?

- **Option A:** Admit verified N/A when one declaration carries a specific reason.
  Before this option can become current, add evidence over the canonical source,
  directly owned helpers/styles and owned stories, plus fail-closed invalidation.
  This recognizes truly direction-neutral components without manufacturing
  meaningless browser tests.
- **Option B:** Require every component to have executable rendered measurement.
  This removes judgment-based N/A but forces artificial checks for components with
  no directional relationship.

### OQ2 — May pre-existing unexplained all-N/A enter removal-only known debt?

- **Option A:** Snapshot existing gaps as visible, non-failing debt while new gaps,
  stale entries, behavior failures, and removals that do not become measured/N/A
  continue to fail. This allows gradual rollout without hiding the inventory.
- **Option B:** Keep every unexplained gap failing. This is simpler and stricter,
  but leaves the audit permanently red until the full historical roster is
  measured or reviewed.

### OQ3 — When does RTL become a required merge check?

The current PR audit is soft-gated. Owners must choose the prerequisite clean
states and stability window before making it required. Regardless of gate status,
reports must remain truthful and behavior failures must not be relabeled.
