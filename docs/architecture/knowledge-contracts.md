---
schema_version: 1
template_version: 1
kind: architecture
id: architecture:knowledge-contracts
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-08-30
owners: [cixzhang]
applies_to: [AGENTS.md, .github/PULL_REQUEST_TEMPLATE/, docs/, packages/]
verified_by:
  [
    scripts/check-knowledge.test.mjs,
    scripts/specs-for-file.test.mjs,
    .github/scripts/change-scope.test.mjs,
    .github/scripts/component-design-decisions.test.mjs,
    .github/scripts/lib/classify-visual.test.mjs,
    .github/scripts/review-clear-workflow.test.mjs,
    .github/scripts/review-signal-decision.test.mjs,
    .github/scripts/review-signal-workflow.test.mjs,
    .github/scripts/spec-owner-decision.test.mjs,
  ]
deciding_specs: []
---

# Knowledge contracts and decisions

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "specification": [
      "INV9",
      "INV11",
      "INV14",
      "INV16",
      "INV18",
      "INV20",
      "INV21",
      "INV25",
      "INV26",
      "DEC-9",
      "INV27",
      "DEC-10",
      "DEC-12",
      "DEC-13"
    ]
  }
}
```

## Purpose

A reviewer should be able to answer two questions without rereading old pull
requests:

1. What behavior has a human already decided?
2. Is this pull request making a new decision that needs a human?

## System model

Astryx keeps different facts in different places:

- Component contracts describe aggregate behavior one component promises.
- Module contracts describe an independently contractible public hook, plugin,
  utility, or subsystem owned by one component. Private implementation helpers do
  not require records.
- An optional `Design decisions` table inside a component or module contract
  records durable visual intent local to that owner. It does not hold exact pixel
  tuning or rules shared across components.
- Family contracts describe behavior sibling components share.
- Design specs record human-owned visual and interaction decisions, including the
  cross-theme accessibility and contrast methodology used to judge token/color
  pairings.
- Theme specs record one package theme's intent, inherited base, selected token
  and palette mappings, required pairings/states, theme-specific exceptions,
  measured receipts, known gaps, compatibility, and artifacts.
- System specs record decisions that cross components or themes or change architecture.
- Consumer docs explain props, examples, and usage.
- Audit records hold current evidence and findings. The operational store is the
  automated wiki `component-scores.json`, which supplies the current post-fix score
  and unresolved findings to the sandbox. The bootstrap reserved colocated
  `<PublicName>.audit.json` files, but no schema or records activated that path; it is
  not an audit datastore or current migration target.

The reviewer starts with the changed code and the nearest current component or
module contract. They follow only the links needed for the question:

```text
changed code or theme source
  → nearest current component, module, or theme contract
  → relevant family or design requirement
  → architecture or system decision only when referenced
  → mapped tests and audit evidence
```

A lookup can also start from any repository path. `pnpm specs:for <path>`
lists every current record linked to that path, the system specs that decided
those records, and the global claims the path's component triggers route. It
follows only links that records and files declare:

- placement: the record itself, the component, module, or theme record whose
  canonical location contains the path;
- path fields: `applies_to`, `verified_by`, and `path-applicability:v1` patterns;
- names: family `members`, design `components`, and `affects_consumer_docs` ids
  naming the path's component or consumer-doc topic;
- citations: a system-spec number such as `AST-030` written in the file;
- inheritance: the references a linked record relies on.

A current record may cite a previous human decision. When the new case is within
that decision's stated scope, the reviewer applies it without asking again.

Theme records sit between shared theming architecture and downstream records.
Cross-theme API, vocabulary, inheritance, validation, compiler behavior, and
artifact policy remain in architecture or system specs. Cross-theme human visual
and accessibility methodology for contrast belongs in a current design record;
shared measurement/tool implementation belongs to architecture or tooling. One
theme's selected token/palette mappings, required pairings and states,
exceptions, measured receipts, known gaps, migration, and artifacts belong in
its package-local theme record. Components and families continue to own
observable behavior; consumer docs continue to own supported syntax and examples.

Every record is either:

- `draft`: useful for review, but not a rule;
- `current`: explicitly approved and safe to rely on;
- `archived`: retained for history and linked to its replacement when one exists.

## Boundaries and invariants

- **INV1 — Current means approved.** Only `current` records guide implementation
  and review.
- **INV2 — One fact has one owner.** A component or theme record does not copy
  family, design, system, consumer, audit, or tooling content. Cross-theme API and
  compiler behavior stay in architecture/system records; human contrast
  methodology stays in design; shared measurement implementation stays in
  architecture/tooling; theme-specific mappings, states, exceptions, receipts,
  and gaps stay in the package-local theme record; aggregate observable component
  behavior stays in component/family records; independently contractible public
  component-module behavior stays in module records; consumer syntax stays in
  consumer docs.
- **INV3 — Existing decisions are reusable.** A reviewer cites an applicable
  decision and proceeds without asking the human again.
- **INV4 — New judgment is explicit.** A reviewer asks a human when no current
  decision applies, existing decisions conflict, or the choice is deliberately
  human-owned.
- **INV5 — Blank forms are not policy.** Templates only create drafts. Search
  and review never present template text as an approved Astryx decision.
- **INV6 — Required structure changes per kind.** Template wording may change
  without touching existing records. Adding a new kind does not migrate unrelated
  kinds. Adding or removing a required field or section from an existing kind
  creates a later schema definition for that kind and migrates every active record
  of that kind in the same pull request.
- **INV7 — Only pure spec changes use lightweight CI.** Every changed file must
  be a component, module, family, design, theme, or system spec. A change to code,
  architecture, guidance, templates, schemas, audits, or any unknown path runs
  normal CI.
- **INV8 — Private operations stay private.** Public records never name or link
  private release or automation systems.
- **INV9 — Current records have no implicit precedence.** A newer, narrower, or
  more local current record does not silently override another current record.
- **INV10 — Records describe ideal behavior, not pull-request verdicts.** A current
  record states durable requirements, prohibitions, compatibility, ownership, and
  evidence independently of any one implementation change. It never exists to
  approve a pull request and never approves, rejects, classifies, designates, or
  authorizes a specific one. Pull requests and issues are not standing content:
  a record states the fact a change established, not the change, and remains
  complete without any pull request or issue it once cited. Research that
  supports a decision — a survey, an options comparison, a benchmark, a test's
  design or scores — is an artifact linked from the pull request, not record
  content; the record keeps the conclusion inside the decision that rests on
  it. A fact owned elsewhere is delegated by linking the record that owns it.
  The reviewer owns each change's disposition against current authority.
- **INV11 — Every public delta has an authority result.** Every public API update
  and every public behavior change is matched to current committed authority
  before acceptance. Package-export shape is not the only trigger: reachable
  supporting types, context members, hook returns, defaults, and observable
  behavior participate too.
- **INV12 — Audit state has one automated datastore.** Wiki
  `component-scores.json` is the operational source for current scores and
  unresolved findings. The unactivated `<PublicName>.audit.json` convention is
  retired. A future storage change requires an explicit system decision, versioned
  data contract, automated migration and reconciliation, sandbox-reader cutover,
  and rollback evidence; it MUST NOT create per-component shadow ledgers by
  convention.
- **INV13 — Authors search before creating authority.** Before creating or
  materially expanding a record, search current records and open pull requests by
  proposed canonical owner/id, affected paths and exported symbols, and semantic
  behavior terms. Extend or project the existing canonical owner by default. A new
  record requires a distinct fact boundary and an explicit explanation of why no
  existing owner can contain it. Open pull requests coordinate overlapping work;
  they remain non-authoritative evidence.
- **INV14 — Current authority is claim-scoped.** `authority: current` approves the
  explicit claims inside a record's stated ownership boundary. It does not promise
  that every behavior of the named component, module, family, or code path has been
  specified. Review MUST NOT expand one narrow decision into adjacent uncontracted
  behavior unless the pull request's exact delta depends on that behavior.
- **INV15 — Review contracts toward one landing-ready intent.** Authors identify one
  primary intent and reviewers classify each observable delta separately. A
  separable delta that violates current authority or requires a new human decision
  is removed or split before review asks the primary change to carry new authority.
  A specification is the path for an intentional durable decision, not the default
  remedy for unrelated scope discovered during review.
- **INV16 — Specs govern; generated review context only informs.** Committed current
  component, module, family, design, theme, architecture, and system records own
  intended product behavior. Reviewer-generated summaries, sections, checklists,
  tests, screenshots, measurements, and recommendations are context or evidence
  only. They may prove conformance, contradiction, or an implementation defect;
  they MUST NOT invent direction, authorize a delta, reverse a human hold, or
  upgrade the authority result.
- **INV17 — Missing review context stays problem-bound.** Review reads the pull
  request and current authority first, then fills only missing context. It traces
  why the problem occurs, why it harms the affected task, and why the harm matters;
  maps the proposed solution and each primary or supporting delta back to that
  problem; and identifies independently removable tagalongs. Product impact remains
  owned by the applicable product record. Review may explain who is affected, in
  what supported state, and what the change enables or prevents, but that generated
  explanation remains context until a current canonical owner records the behavior.
- **INV18 — Product contracts preserve implementation freedom.** Component, module,
  family, design, theme, and system specifications own observable inputs, outputs,
  states, guarantees, failures, compatibility, and caller-visible ownership. A new
  or materially amended requirement MUST NOT prescribe internal modules, files,
  function names, algorithms, data structures, storage layouts, manifests,
  journals, locks, transaction protocols, or CI job/workflow topology unless that
  exact mechanism is itself an intentional public contract. Internal ownership,
  seams, and mechanisms belong in an architecture record. A verification map names
  evidence sufficient to prove a claim; it does not authorize the implementation or
  CI structure that produces it. Existing current records continue to govern their
  explicit claims until their human owner deliberately migrates them; this invariant
  does not silently invalidate or reinterpret those records.
- **INV19 — Automated spec review informs a human decision.** A pull request whose
  primary intent creates, amends, adopts, or supersedes a product contract receives
  written advisory analysis before the named human owner decides it. The analysis
  identifies the canonical knowledge owner, applicable current claims, overlapping
  current and open work, ownership collisions or missing owners, claim-scope gaps,
  behavior-versus-architecture leakage, and exact claims to keep, remove, move, or
  clarify. Automation may report contradictions, evidence gaps, and proposed edits;
  it MUST NOT approve, adopt, ratify, or make the contract current. A human approval
  remains required even when the advisory analysis finds no defect.
- **INV20 — Global review routing is explicit and claim-scoped.** A cross-cutting
  baseline participates without a component backlink only when its
  `review-applicability:v1` block declares `scope: "global"` and maps a semantic
  trigger to exact claim ids in that same record. Review loads matching current
  global claims before narrower records, then resolves the direct component,
  module, or family owner first when it governs the delta. The marker never makes
  the whole record, adjacent claims, drafts, or proposed-head authority govern.
  Every routed match records the base authority commit, record digest, record id,
  path, trigger, claim id, claim title, and deterministic match reason.
- **INV21 — Component-local visual intent stays local and durable.** The optional
  `### Design decisions` table under `## Design relationships` belongs only to
  component- or module-local appearance intent that a future redesign must
  reconsider. Authors cite, reuse, or amend stable `DD1`, `DD2`, … rows before
  adding one. Exact pixel tuning normally remains in code and visual evidence;
  shared or cross-component rules remain in `docs/design/`. Team design owners
  may commit a row with the pixels and evidence in one atomic appearance-only
  pull request. External contributors follow the normal contribution flow and
  MUST NOT be asked to author specifications; maintainers own any missing
  authority. A human request supplies intent but becomes committed current
  authority only through exact-head owner approval.

### Review evidence placement

- **INV22 — One-off evidence stays with the change.** Ad-hoc screenshots,
  recordings, measurements, sensor receipts, and run logs are attached or linked
  from the pull request that uses them, not committed to `main` as disposable
  assets under `docs/pr-assets/` or another source directory. Public GitHub
  attachments are the preferred home for manually published one-off evidence.
  Standing records keep durable conclusions and verification relationships, not
  individual run inventories. Accepted visual baselines, reusable stories and
  test fixtures, shipped documentation media, and repository-owned receipts
  explicitly permitted by their current owner remain versioned with the code.
- **INV23 — Cleanup preserves historical evidence.** Removing disposable assets
  from the current tree MUST NOT rewrite history or break existing commit-pinned
  evidence links. Before deletion, every removed file has a verified public
  retained copy. A linked commit outside retained `main` history needs a durable
  retention anchor at that exact commit; a commit hash or a temporary branch
  alone is insufficient. An immutable non-release `evidence/` tag may retain
  historical Git-hosted evidence when attachment publication is unavailable.
  Its name stays outside release-tag conventions and automated pruning, and it
  MUST NOT be moved or removed while the evidence is referenced. Cleanup verifies
  the remote anchor, exact bytes, and existing links before removing source files.
- **INV24 — Storage does not change proof or authority.** The pull request's text
  states the claim, tested build, relevant state, observed result, and evidence
  links; an image or expiring artifact is not the only record of the conclusion.
  Attachments remain evidence under INV16, not authority. Owner-specific receipt
  requirements, operational audit stores, and CI artifact lifetimes remain with
  their current owners. [AST-009](../specs/AST-009/spec.md) owns real-AT receipts;
  INV12 owns the operational audit datastore. [AST-029](../specs/AST-029/spec.md)
  FR5 and FR10 own the audit pull request's evidence receipt and exact-head
  eligibility report. [AST-030](../specs/AST-030/spec.md) FR12 owns shared
  visual-regression execution and baseline adoption. This placement rule does
  not add a capture owner or require permanent archiving of every CI run.

### Path discovery

- **INV25 — Every current record is reachable from a path.** Each current record
  is linked from at least one repository path that is not itself a knowledge
  record, through placement, a path field, a name, a citation, inheritance, or
  a deciding link. A path-first lookup reports a path with no linked record as
  unrouted. It never infers a link from a file name, extension, or directory
  name.
- **INV26 — Path applicability locates a record; claims still decide.** A record
  whose rules apply to paths that no other link reaches declares them in one
  `path-applicability:v1` block. A matching path lists the record. The match
  does not widen any claim beyond its stated scope (INV14), does not make the
  record outrank a narrower owner (INV9), and does not require behavior to live
  in the named files (INV18). Every pattern matches at least one tracked file.

### Record coverage

- **INV27 — Every specification in the repository is a knowledge record.** A
  specification, a file that states what any part of the system must do as
  opposed to consumer docs, guides, and READMEs that explain how to use it, is
  a record of a kind this record names, in any package that exists today or is
  added later. It carries
  that kind's frontmatter, follows that kind's template in
  `docs/templates/knowledge/`, and sits at that kind's canonical location
  (Owning code). No package defines its own spec format, template, or location.
  Discovery treats every tracked Markdown file named `*.spec.md`, and every
  tracked Markdown file under a directory named `specs`, as a record candidate,
  and a candidate that is not a valid record fails `pnpm check:knowledge`.
  `README.md` index files, `plan.md` implementation plans, and the paths
  discovery already ignores are not candidates.

## Path applicability

Use this optional block when a record governs paths that its placement, path
fields, names, and inherited links do not reach. A record that is already
reached from every path it governs stays unmarked.

<!-- path-applicability-example:v1 -->

```json
{
  "paths": ["apps/docsite/**", "packages/**/*.doc.mjs"]
}
```

In an opted-in record, replace the example marker with `path-applicability:v1`.
Patterns are repository-relative and case-sensitive. `**` is a whole segment
that spans any number of segments, `*` matches within one segment, and `?`
matches one character within a segment. Patterns use only letters, digits,
`_ . @ - /`, and those wildcards. A bare `**` is rejected. The checked-in
validator rejects malformed blocks, unsafe or repeated patterns, and patterns
that match no tracked file.

## Global review applicability

Use this optional block only when named claims apply across otherwise unrelated
component owners. Ordinary component, module, family, design, architecture, theme,
and system records remain unmarked.

<!-- review-applicability-example:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "public-api": ["FR1", "DEC-2"],
    "accessibility": ["AR1"]
  }
}
```

In an opted-in record, replace the example marker with
`review-applicability:v1`. Trigger names use this closed vocabulary:
`accessibility`, `behavior`, `compatibility`, `component-slots`, `docsite`,
`interaction`, `layering`, `layout`, `motion`, `navigation`, `platform`,
`public-api`, `react-runtime`, `responsive`, `scrolling`, `specification`,
`styling`, `testing`, `theming`, `tokens`, and `visual`. Every trigger has a
non-empty list of unique claim ids, and each id resolves to an explicit numbered
claim in that record. The checked-in validator rejects unsupported triggers,
malformed blocks, missing or duplicate claims, and empty routing.
`scripts/review-global-baselines.mjs` requires both the exact reviewed head and
its full base authority commit, verifies that commit is the head's `origin/main`
merge base, and emits deterministically sorted match rows. It therefore cannot
read a proposed head as its own authority. Consumers load those rows before narrow lookup, preserve their
provenance in a review receipt, and apply only the cited claim after the direct
owner has been resolved.

## Writing specifications and contracts

These rules preserve semantic fidelity while putting the decisions a reader needs
first. They are authoring guidance, not a quantified claim about human readability.
They apply prospectively to new or materially revised architecture, component, and
module specifications; they do not require historical rewrites.

Before writing:

1. Search current records for the behavior, public symbols, affected paths, and
   proposed canonical owner/id.
2. Search open pull requests for the same owner path, symbols, and semantic terms.
3. Update the canonical owner or coordinate with the overlapping work. Create a
   new record only when the fact has a distinct owner and explain that boundary in
   the pull-request summary.

Begin each component or module contract with this reader-first projection after its
title:

| Area                    | Contract                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | State the exact public API, concept, or syntax delta; write `None` when none changes.                                           |
| Behavior                | State the observable governing behavior, including the decisive default, boundary, or precedence rule.                          |
| End-user impact         | Name who is affected, in what state, and what improves, worsens, or remains unchanged.                                          |
| Builder impact          | Name migration work and every new caller choice; write `None` when there is no new burden.                                      |
| Compatibility/readiness | State default compatibility, additive/breaking status, authority and implementation state, and material evidence still pending. |
| Review checks           | List the few concrete conditions that make an implementation or proposal rejectable under this contract.                        |
| Governing rules         | Link the canonical owner and only the current clauses needed to justify the projection.                                         |

Architecture records use the same position and footer with architecture-specific
rows:

| Area                    | Contract                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Governing contract      | Name the observable current decisions this architecture serves; write `None` when no product contract changes.                 |
| System behavior         | State shipped system behavior, including the decisive invariant, boundary, or precedence rule.                                 |
| End-user impact         | Name who is affected, in what state, and what improves, worsens, or remains unchanged.                                         |
| Builder impact          | Name the implementation decisions, coordination work, or workarounds this architecture removes or adds.                        |
| Compatibility/readiness | State compatibility effect, authority and implementation state, and material evidence still pending.                           |
| Review checks           | List boundary violations, product-API mechanism leaks, or lost invariants/evidence distinctions that make a change rejectable. |
| Governing rules         | Link the deciding specs and only the current clauses needed to justify the projection.                                         |

The table is a review projection; the body remains authoritative. The projection
itself does not make a record shorter. Size falls only when authors remove true
duplication from the body without dropping contract semantics. `Review checks`
project settled requirements and boundaries from the body; they do not invent
policy or reopen a decision. When citing a list-item clause such as an AST-002 FR,
use its exact visible label and canonical file link. Do not invent a fragment URL
for a clause that has no stable heading or explicit anchor.

Then write the authoritative body:

- Describe the system in the present tense, not the project that produced it.
  `docs/contributing/spec-writing.md` turns this rule and INV10 into a rubric;
  a pull request that creates or changes a record reports that rubric's results
  in its description before review.
- Use familiar words and short, direct sentences.
- State each rule fully once, beside the conditions and exceptions that control it.
  Later sections cite its ID or canonical owner instead of restating the prose.
- Contract only the semantic slice being decided. Name adjacent behavior as a
  non-goal or uncontracted gap; do not fill it merely to make the record `current`.
- Do not duplicate consumer prop tables, usage recipes, shared-system mechanics,
  current audit dumps, or implementation steps. Link their canonical owners.
- Use readable tables for branches or state matrices when they improve scanning.
  Never remove contract content merely to shorten a record.

For routine local appearance intent, a component or module record may include the
optional versioned `Design decisions` table under `Design relationships`. Each row
uses a stable, unique `DD` id and states the decision, its intent or reason, where
it applies, and allowed variation. Add a row only when the intent is durable enough
that a future redesign must reconsider it. Reuse or amend an existing row first.
Do not copy exact pixel tuning out of code/evidence or shared rules out of
`docs/design/`. A header-only table is valid in a template; an authored block has
at least one complete row.

Plain language must preserve normative force, predicates, cardinality, defaults,
compatibility, authority, owners, IDs, evidence state, and decision status. Do not
delete, weaken, merge, or hide distinct normative content. Replace a local fact
with a link only when this record's ownership rules assign that fact to another
canonical owner.

Qualifiers and authority verbs are contract semantics, not polish. Words such as
`only`, `every`, `consistently`, `current`, `records`, `owns`, `delegates`, and
`inherits` MUST NOT be dropped, generalized, weakened, or upgraded during a
rewrite. When reshaping a rule, keep its action, activating conditions,
exceptions or non-goals, owner, and evidence state in the same row or bullet as
the claim they limit.

Do not optimize for a line, word, byte, or percentage-reduction target. First
remove true duplication, shorten prose without changing meaning, use readable
tables or lists, and link genuinely shared authority as INV2 requires. Keep every
load-bearing condition, qualifier, boundary, decision, and evidence distinction
that remains. Human scanability and semantic fidelity win over size.

### Same rule, plainer form

Dense:

> When `items` contains exactly one visible item, the component MUST announce that
> item exactly once; when `items` contains zero or more than one visible item, it
> MUST NOT announce an item, and consumers that omit `items` MUST retain the
> existing silent behavior.

Plain:

| Condition                           | Required behavior                       |
| ----------------------------------- | --------------------------------------- |
| `items` is omitted                  | MUST keep the existing silent behavior. |
| Exactly one visible item is present | MUST announce that item exactly once.   |
| Zero or more than one is present    | MUST NOT announce an item.              |

The plain version changes the shape, not the meaning.

### Before review

- [ ] Compare the edited text with its source and confirm that every contract
      property named above remains explicit.
- [ ] Confirm each rule's action, conditions, qualifiers, exceptions or non-goals,
      owner, authority verb, and evidence state remain explicit and adjacent to the
      claim they limit.
- [ ] Confirm the projection states the public delta, behavior, end-user and builder
      impact, compatibility/readiness, rejection checks, and governing rules without
      replacing or contradicting the authoritative body.
- [ ] Confirm tables and lists improve scanning without hiding content, and no
      content was removed merely to meet a size target.

### When current records disagree

1. A draft is context only and cannot conflict with current policy.
2. Identify the canonical owner from the fact's scope: aggregate component
   behavior, independent public module behavior, family behavior, design
   representation, one theme's semantics/mappings, cross-theme architecture,
   consumer usage, or audit evidence.
3. If two current records make different claims, review stops. Do not choose by
   recency, path proximity, or specificity; record a `novel-human` gap.
4. Resolve the gap by changing the canonical owner and removing the copied claim.
   A deliberate exception is recorded by that owner; affected records link to
   it instead of restating it.
5. A system-spec decision may authorize the change, but the current owning
   contract must change in the same pull request before reviewers rely on it.

## Change coupling

A document does not stay current by convention alone.

Before any component, module, family, design, theme, or architecture record becomes
`current`, the repository must support this flow:

1. The record names the code surface that can affect it and the checks that
   verify it.
2. A pull request touching that surface triggers a focused contract review.
3. Review starts from the pull request's declared primary intent and classifies
   each public delta independently as one of five results:
   - `preserves`: the exact delta restores or retains current authority without
     adding public API or behavior beyond it;
   - `settled`: an existing current human decision covers the exact delta and is
     cited;
   - `violates`: the exact delta contradicts current authority;
   - `novel-human`: no current authority settles the exact public API, behavior,
     ownership, compatibility, or design delta; or
   - `out-of-scope`: another component, module, family, system, or product owns it.
4. `preserves` and `settled` enter normal correctness review. They are eligible
   for approval only when the implementation and evidence also pass.
5. `violates` receives request-changes with the smallest conforming remedy:
   change or remove the violating delta. Review does not recommend a specification
   merely to rescue contradictory implementation; an owner may separately choose
   to propose a policy change.
6. A separable `novel-human` tagalong is removed or split from the primary intent.
   Review may request that contraction without deciding the tagalong's semantics,
   then continue reviewing the remaining change. A `novel-human` delta enters a
   private human hold only when it is the primary intent, is inseparable from it,
   or the author or owner explicitly chooses to pursue it.
7. A bug fix is `preserves` only when it restores existing current authority
   without changing public API or public behavior beyond that contract. Any
   separable API, visual, layout, or interaction tagalong follows step 5 or 6
   rather than making the restoration wait for a broader specification.
8. A visual correction may be `preserves` or `settled` when current component,
   family, design, theme, or objective accessibility authority covers its exact
   outcome. Real rendered evidence must prove the affected state and representative
   unchanged states. A new visual representation remains `novel-human`; calling it
   an improvement does not settle it.
9. Audit freshness is computed from the same code and test relationship, so a
   relevant code change cannot leave an audit looking current.

Audit-storage migration is a separate contract change. It requires a versioned
data contract, automated conversion and reconciliation of existing wiki rows, a
named source of truth during transition, sandbox-reader cutover, and rollback
evidence. Repository-local per-component files are not a migration plan by
themselves.

### Contract before escalation

Review and build should converge on the smallest ideal change that can land:

1. State the pull request's primary intent and partition its observable deltas.
2. Apply current authority to each delta. Existing design and objective standards
   can settle a visual correction even when a component record does not enumerate
   its exact paint.
3. For a contradiction, conform or remove it. Do not propose changing the
   specification unless changing policy is itself an intentional, separately
   reviewable goal.
4. For an unsettled but separable delta, remove or split it. Continue the primary
   change without asking the contributor to solve adjacent system design.
5. Escalate only a surviving, intentional `novel-human` delta. Record only the
   exact decision needed for that delta; adjacent module behavior may stay
   uncontracted.

The actionable review result names the acceptance criteria for that landing-ready
contraction. It does not merely report that authority is missing.

### Recording a new human decision

1. A contributor explains the intended behavior and primary intent in normal
   pull-request language and responds to review. External contributors keep the
   normal contribution flow: they are never asked to author or update a
   specification.
2. A reviewer or agent applies the contraction path above. Only a surviving,
   intentional `novel-human` question proceeds; the contributor does not invent
   the answer or specify unrelated adjacent behavior.
3. An authorized owner answers in the pull-request review.
4. A maintainer or agent records that ruling in the canonical owning record.
   - Prefer a commit in the same pull request when maintainers can update the
     branch.
   - If they cannot update the contributor branch, open a small linked spec pull
     request below it and rebase the implementation after that decision lands.
   - If the direction is accepted, the contributor updates the code when needed.
   - If the direction is rejected, the rejected implementation is removed or
     changed. Record the rejected alternative only when the boundary is
     consequential and likely to come up again.
5. The final commits invalidate prior approval. The owner approves the exact
   heads after the record and implementation agree.

If no implementation direction is accepted, close the contributor pull request.
The maintainer-owned spec pull request remains only when the ruling is useful
independently.

Review comments are evidence of the conversation; the checked-in record is the
canonical decision.

Record the durable outcome, not the review transcript. A ruling belongs in a
canonical record when at least one is true:

- it changes or clarifies an owning component, module, family, or system boundary;
- it establishes a requirement or prohibition future work must preserve; or
- it rejects an alternative that is consequential and likely to recur.

A prop name, implementation mechanism, or failed visual experiment from an
abandoned pull request stays in review history unless that detail itself passes
this test.

Use a separate lower spec pull request only when the ruling changes a shared
contract beyond the contributor change and should land or be reused
independently. The implementation pull request then rebases onto that decision.

Examples:

- NumberInput changes its stepping math. Its current contract says the final
  operation clamps to `min`/`max`, and the mapped tests still pass. Result:
  `preserves`; continue to normal correctness review with no human question.
- A new NumberInput path uses the same previously approved transformation order.
  Result: `settled`; cite that `DEC` and continue to normal correctness review.
- A package-exported context changes a required function parameter while its
  current contract preserves the earlier operation shape. Result: `violates`;
  request the smallest conforming change. A new compatibility policy is a separate
  proposal, not the default repair.
- A scroll-overflow fix also introduces a new hover disclosure. The overflow
  restoration proceeds under its current layout authority. If disclosure lacks
  authority, remove or split that separable visual tagalong; do not require the bug
  fix to specify the whole interaction module.
- Selector removes empty indicator space as its primary intent, but no current
  decision says whether option labels must stay aligned. Result: `novel-human`;
  hold privately while the owner decides the exact alignment contract.
- A product requests a one-off width prop for a family-owned input layout rule.
  Result: `out-of-scope`; route the change to the family contract rather than
  creating a component-specific API.

A draft record cannot clear a review gap. Only a verified `current` contract or
an applicable decision can produce `preserves` or `settled`.

The bootstrap does not mark any component, module, or family record current until
this flow passes the historical review benchmark and is enforced on pull requests.

## Owning code

- `AGENTS.md` points reviewers to the narrowest relevant record.
- `docs/templates/knowledge/` contains the only authoring forms; a package keeps
  no template of its own (INV27).
- Component records are direct `<PublicName>.spec.md` children of a component
  root. Component roots are the component directories of Core
  (`packages/core/src/`) and Lab (`packages/lab/src/`), the source roots of the
  flat component packages `scripts/component-packages.cjs` registers (Charts,
  RichText, and Vega keep their records directly in `src/`), and the component
  directories of every platform implementation package, such as
  `packages/native/apple/Sources/Astryx/` for Swift. A platform implementation's record has the id
  `component:<language>/<PublicName>` (for example `component:swift/Button`),
  names its core component in `platform_of` (`component:<PublicName>`), and
  states only what that platform adds or must do differently; the core record
  keeps the shared contract (INV2). Until the core component has its own
  record, its public source and documentation stand in as that contract. The public name normally matches the root; a parent/member
  exception requires an exact top-level or full inline consumer-doc entry in
  that root. Public semantic module records are nested at least one directory
  beneath the same root as `<PublicName>.spec.md`; the parent component's
  `modules` list and the module's `parent_component` field must agree. Hidden,
  fixture, test, generated, build-output, coverage, dependency, and
  `*.generated.spec.md` paths are ignored consistently by discovery and PR
  routing.
- Wiki `component-scores.json` is the current operational audit datastore. The
  historical `<PublicName>.audit.json` reservation never received a schema or active
  records and is retired by INV12.
- A record governing one package's cross-component rules lives under that
  package's `specs/` directory as `<slug>.spec.md`, with kind `architecture`
  and an id of `architecture:` followed by the package name, each directory
  between `specs/` and the file, and the slug, joined by hyphens. For example,
  `packages/native/specs/swift/accessibility.spec.md` is
  `architecture:native-swift-accessibility`. Repository-wide architecture
  stays in `docs/architecture/`.
- `packages/themes/<theme>/<theme>.spec.md` contains that package theme's
  canonical record; `docs/themes/README.md` is guidance and an index only.
- `docs/schemas/knowledge/` defines required structure.
- `scripts/check-knowledge.mjs` validates templates, records, approval metadata,
  optional component/module design-decision tables, `path-applicability:v1`
  blocks, and INV25 reachability.
- `scripts/specs-for-file.mjs` (`pnpm specs:for`) resolves the records linked to
  a path. `--unrouted` lists tracked paths with no linked current record;
  `--unreached` lists current records no path reaches.
- `.github/scripts/component-design-decisions.cjs` classifies current
  component/module changes as no DD change, DD-only, or mixed from trusted base
  and head bytes. DD-only requires unchanged path, kind, authority, and every byte
  outside a valid optional block.
- `.github/scripts/change-scope.cjs` identifies pure spec-record changes.
- `.github/workflows/spec-owner-gate.yml` binds approval to the exact pull
  request head. Approval for every record kind derives from `.github/ENGOWNERS`;
  current design and theme records, normative design assets, and DD-only current
  component/module changes additionally accept `.github/DESIGNOWNERS`. A mixed
  DD plus other component/module edit requires both groups. Record metadata never
  self-authorizes. The workflow enables auto-merge only for pure spec changes.
- `.github/workflows/review-signal.yml` lets a DESIGNOWNER author bypass the
  engineering gate only when trusted-base code verifies every changed Core line
  against the fetched base/head source bytes as a conservative declaration inside
  a real `stylex.create` call, and no other code reason applies. The classifier
  also rejects direct interaction, operability, and scroll-control
  declarations—including hit testing, touch behavior, selection, resize,
  cursor, visibility, overflow, snapping, and scrollbar affordance—on either
  diff side. Contributors and mixed or behavioral changes remain gated.
  Safe-space classification considers both current and previous paths: only
  changes whose every path is safe are excluded, and any rename crossing that
  boundary is an engineering reason.
  Engineering and design reviews count only when their `commit_id` equals the
  current pull-request head. The direct reconciler clears only a current-head
  gate already owned by `review-signal`; an effective ENGOWNER
  `CHANGES_REQUESTED` or `DISMISSED` state first restores the hard status gate to
  pending, then restores its advisory label. A failed status write performs no
  preceding label mutation.
  Approval, withdrawal, and dismissal all recheck the head immediately before
  mutation, and an ungated head never acquires a gate from review state alone.
  For an author whose live repository permission is write or admin, the
  review app named in the `REVIEW_APP` repository variable also satisfies the
  engineering gate under DEC-11. Only that app's latest `APPROVED`,
  `CHANGES_REQUESTED`, or `DISMISSED` review whose `commit_id` equals the current
  head counts. Both workflows read the author's permission at every evaluation
  and publish the status with their own Actions token.

## Deciding specs

### DEC-1 — Current-record conflicts do not resolve by precedence

**Reference:** `architecture:knowledge-contracts/DEC-1`
**Decider:** `cixzhang`, `2026-08-30`

A current record does not override another by being newer, narrower, or closer
to the code. Review stops, identifies the canonical owner, and resolves the
conflict there. Other records link to the owning decision rather than copying
it.

Rejected: silently choosing the newest or most specific record, because that
turns documentation order into unreviewed system policy.

### DEC-2 — New rulings normally stay in the contributor pull request

**Reference:** `architecture:knowledge-contracts/DEC-2`
**Decider:** `cixzhang`, `2026-08-30`

A human ruling is normally discussed in the pull request that exposed the gap.
The contributor is responsible for explaining intent and changing their code;
maintainers and review agents are responsible for the spec system. They record
the ruling in the same branch when possible, or in a small linked lower spec PR
when the contributor branch cannot be updated. Rejected implementation is
removed or changed; a rejected alternative is recorded only when it protects a
consequential boundary from being debated again. Final exact-head approval
attests that the decision and implementation agree.

Rejected: requiring the owner to open a second pull request for every ruling,
because it separates the answer from the change and adds unnecessary review
work.

### DEC-3 — Search overlapping authority before writing

**Reference:** `architecture:knowledge-contracts/DEC-3`
**Decider:** `cixzhang`, `2026-09-07`

Before drafting a new record or materially expanding one, search current records
and open pull requests using more than the proposed title: canonical owner/id,
affected paths, exported symbols, and semantic behavior terms. Extend or project
the canonical owner when the fact already belongs there. Create a new record only
for a distinct fact boundary and explain why the existing owner cannot contain it.

Rejected: searching only filenames or landed records. Semantic overlap may use a
different title, and open work may already be changing the same owner before it
lands. Open pull requests coordinate work and provide evidence; they do not become
authority.

### DEC-4 — Contraction precedes new authority

**Reference:** `architecture:knowledge-contracts/DEC-4`
**Decider:** `cixzhang`, `2026-09-11`

When an otherwise reviewable change carries a separable contradiction or unsettled
decision, remove or split that delta and keep the primary intent moving. Recommend
a specification only when the surviving delta is intentionally pursued as durable
behavior, not because review discovered adjacent incompleteness.

Rejected: turning every uncontracted tagalong into a specification project, because
that makes a narrow repair absorb unrelated design work and leaves the contributor
without a landing-ready path.

### DEC-5 — Current approval is claim-scoped

**Reference:** `architecture:knowledge-contracts/DEC-5`
**Decider:** `cixzhang`, `2026-09-11`

A current record authorizes only its explicit claims within its stated ownership
boundary. It may deliberately leave adjacent behavior uncontracted. Reviewers do
not treat `current` as certification that a whole component or public module is
fully specified, and do not demand unrelated coverage before applying a narrow
approved decision.

Rejected: requiring a narrow visual or behavior decision to contract every API,
composition, accessibility, and implementation fact of the named module.

### DEC-6 — Product specs govern; generated review context informs

**Reference:** `architecture:knowledge-contracts/DEC-6`
**Decider:** `cixzhang`, `2026-09-12`

Committed current product records decide intended behavior. A review begins with
those claims and uses generated context, checklists, tests, screenshots,
measurements, and recommendations only to prove conformance, contradiction, or a
concrete defect. Generated completeness and green checks never create authority or
upgrade the authority result.

When the pull request or current record leaves context implicit, review may fill the
gap by tracing the problem through three why questions, mapping the solution back to
that problem, and naming tagalongs. It may also explain affected users, supported
states, enabled or prevented behavior, and caller burden. Those explanations remain
context unless the canonical product owner records them as current behavior.

Rejected: treating a complete review form, persuasive impact story, or passing
validation matrix as an alternative source of product direction.

### DEC-7 — Product specs contract behavior, not internal architecture

**Reference:** `architecture:knowledge-contracts/DEC-7`
**Decider:** `cixzhang`, `2026-09-12`

A new or materially amended product specification states the observable contract a
conforming implementation must satisfy and leaves equivalent internal implementations
free. It names an exact mechanism only when callers or interoperating systems
intentionally depend on that mechanism as public behavior. Otherwise, internal
ownership and seams belong in an architecture record, and verification remains
evidence rather than a prescribed CI or test topology.

This authoring rule is prospective. Existing current records retain their explicit
authority until the named human owner migrates them; adding this rule cannot silently
void a requirement such as a legacy implementation constraint. When an amendment
touches such a requirement, the owner either demonstrates that the mechanism is
publicly observable or moves it to the applicable architecture record.

Rejected: promoting a successful prototype's module graph, algorithm, manifest,
journal, lock, transaction design, filesystem layout, or CI job into product
requirements merely because that implementation supplied the decision evidence.

### DEC-8 — Spec review is advisory analysis for the human owner

**Reference:** `architecture:knowledge-contracts/DEC-8`
**Decider:** `cixzhang`, `2026-09-12`

Automated review of a specification does not stop at routing the change to a human.
It first produces written, evidence-backed feedback about the canonical owner,
existing and overlapping claims, ownership collisions, claim scope, misplaced
architecture, and exact contract edits. That analysis helps the human owner inspect
the decision; it never substitutes for the owner's approval or becomes authority.

Rejected: automatically approving a specification because its checks are green, or
returning only “needs human” without giving the owner the contract and ownership
analysis already available to the reviewer.

### DEC-9 — Global applicability routes exact claims, not whole records

**Reference:** `architecture:knowledge-contracts/DEC-9`
**Decider:** `cixzhang`, `2026-09-19`

A cross-cutting rule is discoverable without a component backlink only through a
validated `review-applicability:v1` block. Each semantic trigger names exact local
claim ids. Reviewers load matching current claims from the base authority commit
before narrower records, preserve match provenance, and then resolve the direct
owner first when it governs the delta.

Rejected: treating a `global` marker as authority for every statement in a file,
because that would erase claim boundaries and let unrelated or draft material
silently govern a change.

### DEC-10 — Routine visual intent lives with its component or module

**Reference:** `architecture:knowledge-contracts/DEC-10`
**Decider:** `cixzhang`, `2026-09-23`

A small structured `Design decisions` table in the owning component or module
spec records only durable local visual intent. One row may cover a coherent local
direction; tiny visual tuning does not create one decision record per tweak.
Existing rows are cited, reused, or amended before new rows are added. Exact
pixels remain in code and evidence, while shared and cross-component direction
remains in `docs/design/`.

A team DESIGNOWNER may include the local decision, implementation, and evidence
in one atomic appearance-only pull request. DD-only current-record changes route
to design approval; mixing a DD edit with another component/module contract edit
requires both design and engineering. A DESIGNOWNER's exact-head ready transition
may satisfy the design group. The Core code gate is bypassed only when trusted-base
classification proves an existing-file declaration-only appearance diff and no
other code reason applies. Any uncertainty, contributor-authored change, behavior,
JSX, API, package, barrel, new component, or unknown runtime path fails closed to
engineering review.

External contributors explain intent and supply normal evidence; maintainers own
specification work and never require contributors to author it. A request or
conversation is decision input, not committed authority. The edited current
record becomes reusable only after exact-head owner approval.

Rejected: sidecar records or one design record per pixel tweak, because they split
routine intent from its owner; treating a design request as authority before
exact-head approval, because reviewable intent is not yet committed policy.

### DEC-11 — A review-app approval clears the code gate for write-access authors

**Reference:** `architecture:knowledge-contracts/DEC-11`
**Decider:** `cixzhang`, `2026-10-15`

An author with write or admin permission on the repository is an internal
contributor, whether or not they are an engineering or design owner; designers
and partners with write access are included. For those authors, the latest
exact-head verdict of the configured review app decides the engineering gate: an
approval clears it, and a later request for changes, a dismissal, or a new
commit makes it pending again. An effective ENGOWNER request for changes on the
exact head keeps the gate pending over an app approval, and an ENGOWNER approval
still clears the gate for every author.

Authors without write permission, including read-only members and fork
contributors, keep ENGOWNER approval as the only way to clear the gate. The
permission comes from the repository's collaborator permission at evaluation
time, not from owner lists, organization membership, or author association. An
unset `REVIEW_APP`, an unreadable permission, or any lower permission leaves the
app's reviews without effect. The status is published by the workflow's own
identity, never by a person's account.

Rejected: counting any app approval on the pull request, because an approval of
an earlier head or one followed by a request for changes would keep the gate
clear.

### DEC-12 — Records declare the paths they govern in an optional overlay

**Reference:** `architecture:knowledge-contracts/DEC-12`
**Decider:** `cixzhang`, `2026-10-21`

A record that governs paths no other link reaches declares glob patterns in an
optional `path-applicability:v1` block, beside `review-applicability:v1`. The
overlay is independently versioned, so opting in does not change a record
kind's required shape or migrate other records. A path-first lookup lists a
matched record; claim scope, precedence, and implementation freedom are
unchanged.

Rejected: a required `applies_to` field on every kind, because it would migrate
every active record to declare paths most already reach through placement or
inheritance. Rejected: regular expressions, because a reviewer cannot read
their reach at a glance and they over-match silently.

### DEC-13 — Every spec is a knowledge record, wherever it lives

**Reference:** `architecture:knowledge-contracts/DEC-13`
**Decider:** `cixzhang`, `2026-10-23`

Specification records in any package, including packages added later, use the
record kinds, frontmatter, templates, and placement this record defines, and
discovery fails a spec-shaped file that is not a valid record. A platform
implementation's component record is a `component` record with a
language-qualified id that names its core component, so the core record keeps
the shared contract and the platform record holds only the platform's part.
Until the core component has its own record, its public source and
documentation stand in as that contract.

Rejected: package-local spec formats, because their records skip structure
checks, the owner gate, and path routing.

## Verification

| Invariant                         | Evidence                                                                                                                                                                                                     | Failure signal                                                                                                                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INV1, INV6                        | `scripts/check-knowledge.test.mjs`                                                                                                                                                                           | An unapproved current record or unmigrated active record passes                                                                                                                                                                                               |
| INV5, INV7                        | `.github/scripts/change-scope.test.mjs`                                                                                                                                                                      | A template, schema, guidance, architecture, code change, unsafe rename, or truncated list qualifies as spec-only                                                                                                                                              |
| Approval follows the current head | `.github/scripts/spec-owner-decision.test.mjs`                                                                                                                                                               | An approval for another commit clears the gate, a self-declared owner becomes an approver, or the wrong owner group approves a current record                                                                                                                 |
| INV3, INV4, INV11                 | Blinded historical review benchmark                                                                                                                                                                          | Reviewer re-asks a settled decision, invents a new one, approves an unsettled public delta, or treats a contradiction as preserves                                                                                                                            |
| INV10                             | Record-content and review-disposition fixtures                                                                                                                                                               | A spec assigns a PR verdict, or a reviewer treats a PR link as authority                                                                                                                                                                                      |
| INV13                             | Blinded spec-authorship fixture plus overlap-search receipt                                                                                                                                                  | An author creates parallel authority, searches only landed records or filenames, misses open work on the canonical owner, or treats an open PR as authority                                                                                                   |
| INV14, INV15                      | Narrow-decision and mixed-intent review fixtures                                                                                                                                                             | A current visual slice is forced to contract its whole module, a separable tagalong blocks a repair, or review reports a gap without a landing-ready remedy                                                                                                   |
| INV16, INV17                      | Spec-first review and missing-context fixtures                                                                                                                                                               | Generated checklist completeness overrides authority, review invents product direction, restates supplied context, or fails to identify an unrelated tagalong or affected caller state                                                                        |
| INV18                             | Spec-review mechanism analysis plus owner migration receipt                                                                                                                                                  | A new/amended product spec requires a private mechanism without proving it is public, silently invalidates an existing current record, or leaves touched architecture wording in the product contract                                                         |
| INV19                             | Spec-review ownership-collision receipt and human decision                                                                                                                                                   | Automated review approves a product contract, omits current/open owner overlap, misses a collision or architecture leak, or returns only a human hold without actionable written analysis                                                                     |
| INV20, DEC-9                      | `scripts/check-knowledge.test.mjs` and `scripts/review-global-baselines.mjs`                                                                                                                                 | A matching review misses a current global claim, loads a draft/nonmatching claim, loses base-commit provenance, or treats the rest of a routed record as authority                                                                                            |
| INV21, DEC-10                     | `.github/scripts/component-design-decisions.test.mjs`, `.github/scripts/review-signal-decision.test.mjs`, `.github/scripts/spec-owner-decision.test.mjs`, and `.github/scripts/lib/classify-visual.test.mjs` | A malformed/local DD escapes validation, stale approval clears a new head, owner routing loses mixed-change gates, or executable/API/unknown runtime code is misclassified as appearance-only                                                                 |
| DEC-11                            | `.github/scripts/review-signal-decision.test.mjs`, `.github/scripts/review-clear-workflow.test.mjs`, and `.github/scripts/review-signal-workflow.test.mjs`                                                   | An app approval clears a read-only or fork author or an earlier head; a later app request for changes or dismissal leaves the gate clear; an app approval overrides an ENGOWNER request for changes; or an unset app or unreadable permission clears the gate |

| Invariant            | Evidence                                                                                                                                 | Failure signal                                                                                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INV22–INV24          | Contributor/reviewer evidence inventory; public-link and byte verification; retained remote refs; unchanged fixture/baseline/media paths | Disposable captures enter the source tree, cleanup loses a referenced image, a temporary branch is called durable, or storage changes overwrite an owner's proof or retention contract                           |
| INV25, INV26, DEC-12 | `scripts/specs-for-file.test.mjs`, `scripts/check-knowledge.test.mjs`, and `pnpm check:knowledge`                                        | A current record is reached by no tracked non-record path, a lookup infers a link from a name, a pattern matches nothing or the whole repository, or a pattern match widens a claim or outranks a narrower owner |
| INV27, DEC-13        | `scripts/check-knowledge.test.mjs` and `pnpm check:knowledge`                                                                            | A `*.spec.md` file or a Markdown file under a `specs` directory without valid record frontmatter, outside its kind's location, or following a package-local template passes                                      |

Evidence placement is enforced by contributors and reviewers. The local
`docs/pr-assets/` ignore prevents accidental staging; it is not a blocking CI
check and does not prevent force-added evidence elsewhere.

Current enforcement gap: discovery does not yet read record candidates outside
registered component packages, themes, and `docs/`; component records have no
`platform_of` field until the next schema version; and the component id
pattern does not yet accept a language-qualified id such as
`component:swift/Button`. Until all three land, records under
`packages/native/` are checked only by review.

Current enforcement gap: no checked-in gate yet proves the open-pull-request
search. Until one exists, the pull-request summary records the search terms,
canonical owner/path, and overlapping open work inspected.
