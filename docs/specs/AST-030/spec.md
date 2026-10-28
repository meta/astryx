---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-030
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-07
phase: accepted
owners: [cixzhang]
affects_architecture: []
affects_families: []
affects_contributing: []
affects_consumer_docs: []
---

# Positive CI surface routing system spec

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "testing": ["FR7", "FR11"]
  }
}
```

<!-- path-applicability:v1 -->

```json
{
  "paths": [
    ".github/workflows/**",
    ".github/scripts/change-scope.*",
    ".github/scripts/*routing*.test.mjs",
    ".github/scripts/pr-scope-touches.*"
  ]
}
```

## Intent

Route pull-request checks from the repository surfaces a change can affect rather
than from an expanding list of work the change appears not to affect. Contributors
should get the checks that can observe their change, while a narrow operational
Node-tooling change should not wait for unrelated component, browser, Storybook,
or application builds.

The classifier produces a set of touched surfaces. A lane may skip work only when
every changed path is classified from trusted base-branch policy and the selected
checks cover every surface in that set. Mixed, incomplete, or unknown scope uses
the broad lane.

A **lane** is one independently routed logical test or build owner for one
surface. A lane may dispatch multiple workflow jobs or steps and may feed a
historical required-check join. Jobs, workflows, required contexts, and projected
statuses are execution or reporting mechanisms—not additional lanes merely because
they are separately named.

## Non-goals

- Rewrite every CI job or specialize every package lane in one change.
- Add a test-specific or build-specific lane for work already owned by an
  existing surface.
- Apply changed-surface routing to post-merge `main` CI.
- Define compatibility semantics or release-pair delta classes. Those belong to
  [`spec:AST-017`](../AST-017/spec.md); this record routes their checks and owns the
  exact-main release-check execution boundary.
- Remove required check names, branch protection, merge-queue coverage, or
  exact-head owner approval.
- Infer safety from file extensions, directory names, or the absence of a known
  risky path.
- Treat tests, specifications, generated files, or changesets as proof that the
  public or operational surface beside them is untouched.

## Requirements

- **FR1 — Classification is positive and set-based.** Every changed path MUST map
  to one or more named surfaces. Lane selection MUST use the union of those
  surfaces, not exclusion predicates over unrelated paths. A path with no exact
  rule MUST add `shared-or-unknown`.
- **FR2 — The taxonomy follows check ownership.** The classifier MAY name only a
  surface with a concrete check owner and dependency boundary. The initial
  taxonomy and current owners are:

  | Surface             | Positive path ownership                                                                                                            | Current check owners                                                                                                                                 |
  | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `knowledge`         | canonical system, family, design, theme, component, and module records                                                             | knowledge validation and exact-head spec-owner approval                                                                                              |
  | `docsite`           | the docsite application                                                                                                            | docsite generation and tests                                                                                                                         |
  | `node-tooling`      | admitted operational Node tooling whose consumers are covered by Node contract tests                                               | Node Vitest, repository guardrails, and ESLint                                                                                                       |
  | `runtime:<package>` | public source and package contract for Core, Lab, Charts, Rich Text, Vega, CLI, and Build                                          | the package's unit/type checks plus current broad build and downstream consumer checks; Build's owner includes production CSS-layer browser behavior |
  | `theme-build`       | shipped theme packages and theme compilation outputs                                                                               | theme tests, theme package builds, theme-family browser behavior, and stable visual evidence where applicable                                        |
  | `storybook-visual`  | Storybook stories/configuration and visual, accessibility, or RTL audit infrastructure                                             | Storybook build, preview/visual-report publication, and the applicable browser, visual, accessibility, and RTL checks                                |
  | `shared-or-unknown` | shared configuration, dependency graphs, workflows, classifiers, generated ownership, ambiguous paths, and every unclassified path | all applicable pull-request CI checks                                                                                                                |

  A category does not earn a specialized lane merely by existing in this table.
  Until every selected surface has an admitted, complete specialized owner route,
  that surface set uses the broad check set. `shared-or-unknown` always uses the
  broad check set.

- **FR3 — Classification uses trusted base policy.** Pull-request code MUST NOT
  choose its own lane. The workflow MUST load the classifier and every classifier
  dependency from the trusted base ref, then apply that policy to the merge-base
  three-dot path set. Workflow changes use the broad lane unless they are an
  admitted tool's non-PR dispatch workflow. Classifier,
  classifier-dependency, and routing-test changes use the broad lane.
- **FR4 — Uncertainty fails closed.** A missing merge base, missing trusted
  classifier dependency, failed classifier, empty or incomplete file list,
  ambiguous rename, unknown path, or merge-group event without a trusted PR path
  set MUST select the broad lane. No fallback may grant a specialized lane.
- **FR5 — Mixed scope keeps every owner.** A change touching multiple classified
  surfaces MUST run the union of their checks. It MUST NOT run specialized lanes
  for untouched surfaces. A set containing `shared-or-unknown`, a fail-closed
  condition from FR3–FR4, or any selected surface without a complete admitted
  specialized owner route MUST use broad CI. A specification beside runtime code
  does not hide the runtime surface.
- **FR6 — Node-tooling admission is explicit.** A Node program may enter
  `node-tooling` only when dependency analysis proves that package runtime,
  component UI, theme/build output, Storybook/visual evidence, and browser
  behavior are not changed directly, and every operational consumer has a Node
  contract test. Directory-wide admission is allowed only for a directory
  dedicated to non-shipped tooling; other directory- or extension-wide
  admission is prohibited.
- **FR7 — Required check names remain stable.** `test`, `build`, `docsite-test`,
  and `lint` MUST continue to report on every pull request through their existing
  jobs or join jobs. A specialized lane skips owned steps inside those jobs; it
  does not remove historical required contexts. Any owned lane failure MUST fail
  its join. Required lint does not compare main's package declaration with the newest
  stable release; AST-017 assigns prerelease ordering to the canary publisher and keeps
  immutable release merge-back validation in required lint.
- **FR8 — Initial tooling admissions.** `node-tooling` covers
  `scripts/score-ledger.mjs`, `scripts/score-ledger.test.mjs`,
  `internal/scripts/`, and `.github/workflows/crowdin-upload.yml`. It runs the
  Node project and the required lint
  workflow, including repository guardrails. It skips the UI Vitest project,
  component analysis, docsite generation, production package, Storybook and
  Sandbox builds, preview/visual-report publication, and browser/theme/visual/
  a11y/RTL jobs. The trusted post-CI workflow MUST explicitly report that visual
  checks are not applicable and remove stale preview links without enqueueing the preview
  publisher. The Sandbox score-ledger projection MUST have a Node contract test
  for the exports it consumes before this lane can be enabled.
- **FR9 — Routing tests are mutation-sensitive.** Tests MUST prove both the
  intended fast path and the unsafe near misses. At minimum they cover pure
  tooling; pure spec; component spec plus component code; module spec plus Table
  plugin code; tooling plus component code; workflow or classifier self-change;
  unknown paths; shared infrastructure; rename history; incomplete input; and
  public source in every component-bearing package. Removing any fail-closed edge
  MUST make a test fail.
- **FR10 — New surfaces follow one admission convention.** A new surface MUST be
  admitted by an owner-approved amendment to this record before implementation.
  The amendment MUST name its positive path ownership, dependency boundary, test
  commands, one independently routed test owner, build commands and one
  independently routed build owner when a build applies, mixed-scope behavior,
  required-check projection, and mutation-sensitive routing tests. A new suite,
  feature, component, theme family, or test type is not a new surface by itself.
- **FR11 — Each surface owns one test and applicable build lane.** A surface MAY
  define multiple test or build commands, jobs, or steps, but exactly one
  independently routed test lane and, when applicable, one independently routed
  build lane MUST own them. New coverage inside an existing surface MUST join
  those owners and MUST NOT create a separately routed lane or required context.
  Existing historical joins remain stable. A selected surface whose dedicated
  owner is not yet admitted continues through broad CI. The Build package's test
  owner includes its production CSS-layer cascade behavior. Theme-family
  compilation remains `theme-build` and does not become Build merely because both
  behaviors concern CSS.
- **FR12 — Visual regression has one shared pull-request workflow.** Every
  visual-regression test from every surface MUST use the existing Storybook
  framework and the single shared owner in `.github/workflows/ci.yml`
  (`pr-visual`). That workflow MAY use multiple jobs, steps, and artifacts, but
  visual capture and regression comparison MUST NOT run in another workflow,
  including scheduled, post-CI, post-merge, or manual replacement owners.
  Publication of the canonical run's reports is not another test owner: it MUST
  consume that run's artifacts without recapturing or recomparing pixels.
  Explicit full-plan baseline capture MUST remain in `ci.yml`; it is a maintenance
  operation, not a release gate. A reviewed baseline update MUST consume that
  capture, update the versioned repository baseline through a normal pull request,
  and remain separate from automatic merge or release work. GitHub Pages MUST NOT
  be baseline or report storage.
  Release evidence MUST come from an explicit `operation=release-check`
  `workflow_dispatch` in this same workflow, dispatched from `main` and bound to
  its exact event SHA. It MUST run the canonical `pr-visual` (**Stable visual
  regression**), `pr-a11y`, and `pr-rtl` owners with full scope: the closed stable
  visual plan and unfiltered accessibility/RTL component rosters. Changed-file,
  focused, smoke, and no-op paths MUST NOT narrow release checks. PR a11y MUST
  remain scoped to changed components plus fast interaction guards; full a11y
  sweeps, whole-repository spec-test contracts, and their evidence uploads MUST
  run only for `release-check` in this workflow. Missing,
  failed, cancelled, or skipped required work MUST block the release-check join.
  The request and join MUST verify that the checked SHA is the dispatch event SHA
  and remains an ancestor of current remote `main` at the start and completion of
  the run. Release callers MUST fetch and recheck that same ancestry immediately
  before creating the release branch. Later fast-forward movement of `main` does
  not invalidate that receipt: the release MUST cut from the exact checked SHA, and
  later commits remain next-release input. A rewrite or divergence that removes
  the checked SHA from current `main` history invalidates the receipt.
  This replaces constituent-PR-only release gating, not the canonical checks'
  existing finding policies. Release checks MUST NOT run on every push, capture
  baseline candidates, publish baselines, or use a separate daily workflow or
  retroactive acceptance status.
  Deployment, accessibility, RTL, and vibe evidence MAY retain their workflows
  and artifacts when they do not duplicate visual regression. A new or existing
  surface, component, package, theme family, or visual suite MUST join the
  canonical workflow. A repository guard MUST reject independent visual owners
  while preserving legitimate non-visual artifact use.
- **FR13 — Broad CI on a pull request runs what the change reaches.** On a
  `pull_request` event whose trusted classification finds no shared
  infrastructure, broad CI keeps every owner and required context and narrows
  what those owners run. The Vitest test owner runs the tests whose module graph
  reaches a changed file, against the merge commit's base parent, plus every test
  that reads repository sources through the file system, directly or through a
  module it imports; a computed `import()`, a child process, or a library that
  reads sources for it (the TypeScript compiler, a bundler) counts as reading
  sources; and every test that loads a changed workspace package from its build,
  by the package's name or a path into its `dist/`. The visual and RTL
  owners audit one affected set of component folders: the changed components
  and their reverse dependents, the folders of the components, in any package,
  whose built bundle, `import()` targets included, reaches a changed module.
  Visual audits each dependent folder that has a stable story, and runs the
  whole plan when the dependents exceed its focused budget or none has one; RTL
  audits every component each of those folders implements. A Changeset renders nothing and widens no audit. A changed module that no component bundle holds adds none, and without
  a readable build the audits run in full. PR accessibility stays scoped to
  changed components (FR12). Shared infrastructure runs the full suite: root
  dependency manifests and lockfile, root configuration, a package's manifest,
  build or test configuration and test setup, `internal/` (the test harness
  included), `theme-build` paths (tokens and themes), Storybook configuration,
  `node-tooling` paths (FR8 keeps their whole Node project), and every other
  `shared-or-unknown` path except Changesets. Every fail-closed
  condition of FR3–FR4 also runs the full suite. `main`, release branches,
  merge-group entries and `release-check` dispatches always run the full suite,
  and release checks keep FR12's full scope.

### Platform support

- Supported feature/engine floor: GitHub pull-request and merge-group workflows
  on the repository's supported Node and runner versions.
- Unsupported behavior: incomplete or unavailable classification receives no fast
  path and runs broad CI.
- Browser evidence: routing itself has no visual claim; browser checks remain
  mandatory whenever their owning surface is present or scope is uncertain.

## Current-state impact

Current CI has singleton fast paths for canonical specification records, the
docsite, and admitted Node tooling. All other changes run broad Node/UI, build,
browser, and application checks. This accepted record changes no workflow by
itself.

Implementation begins by preserving those existing singleton surface sets and
making their ownership model reusable. Existing package, theme/build, and
Storybook/visual surfaces remain on broad CI until their dedicated owners are
admitted. Within broad CI, a pull request runs what its change reaches (FR13),
while `main`, merge-group entries and release checks run everything. The current
broad workflow may dispatch surface-owned jobs; their names
describe implementation, but they do not receive a specialized route until the
classifier and join contract are complete. New surfaces may add lanes only through
FR10. New coverage joins its current surface owner; visual regression remains in
the shared Storybook PR owner.

## Verification

| Contract | Verification                                                                | Representative states                                                                                    | Mutation or failure expectation                                                                                                                                                    |
| -------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1–FR2  | classifier unit tests expose the surface set                                | knowledge; docsite; admitted tool; Core/Lab/Charts/Rich Text/Vega source; shared config; unknown         | an unclassified path receives a specialized lane or a category has no check owner                                                                                                  |
| FR3–FR4  | workflow contract tests execute an isolated trusted-base classifier         | valid base; missing merge base; missing matcher/registry; classifier self-change; merge group            | PR-controlled policy grants a lane, or missing trust data skips checks                                                                                                             |
| FR5      | mixed-surface and incomplete-owner routing tests                            | spec+component; tooling+component; named surface without admitted lane; docsite+shared                   | one surface hides another owner or a named-but-incomplete surface skips broad CI                                                                                                   |
| FR6–FR8  | Node-tooling dependency, CI workflow, and trusted post-CI workflow tests    | both admitted score-ledger paths; Sandbox projection imports; test/build joins; preview/visual publisher | UI/browser/build work or preview publication runs for the singleton tool set, an operational consumer is untested, a visual status stays pending, or a required context disappears |
| FR9      | mutation-sensitive classifier and workflow fixtures                         | unknown path; rename from unknown; truncated list; package-specific public paths                         | weakening a fail-closed rule leaves the suite green                                                                                                                                |
| FR10     | surface-admission and routing contract tests                                | existing surface; proposed surface with and without the full admission contract                          | a new surface adds lanes without its approved paths, commands, ownership, projections, and routing tests                                                                           |
| FR11     | surface owner, internal-job, and required-join contract tests               | Build package browser behavior; CLI; theme-family broad fallback; mixed Core+CLI                         | a second owner is routed for one surface, an internal job masquerades as a lane, an owned failure misses its join, or an unrelated owner runs                                      |
| FR12     | Storybook visual-plan, canonical workflow, and repository-owner guard tests | PR scope; full-plan maintenance; report-only publication; deployment/a11y/RTL/vibe artifacts             | another workflow captures or compares pixels, a renamed or aliased owner escapes the guard, or legitimate non-visual artifacts are rejected                                        |
| FR13     | classifier, workflow contract, component-analysis and RTL-scope tests       | component change; shared module; Changeset beside code; infrastructure path; incomplete list; no build   | an infrastructure path is scoped, a file-system guard test is skipped, a reverse dependent leaves visual/RTL or enters PR accessibility, or a full-suite event is narrowed         |

## Decision log

### DEC-1 — Surfaces form a union; lanes are projections

**Reference:** `spec:AST-030/DEC-1`
**Decider:** `cixzhang`, `2026-09-07`

A mixed change retains every touched surface and therefore every check owner. A
specialized lane is safe only for an exact surface set whose checks are complete.

Rejected: mutually exclusive labels where `spec-only`, `docs`, or `tooling` can
win over runtime code elsewhere in the same pull request.

### DEC-2 — Unknown and self-modifying scope uses broad CI

**Reference:** `spec:AST-030/DEC-2`
**Decider:** `cixzhang`, `2026-09-07`

Classification policy comes from the base branch, and every inability to prove a
specialized set selects broad CI. This keeps a pull request from weakening the
classifier or its dependencies to skip its own checks.

Rejected: head-branch classification, two-dot fallback, directory heuristics, or
a bootstrap fallback that grants a fast path.

### DEC-3 — Start with one explicit Node-tooling ownership group

**Reference:** `spec:AST-030/DEC-3`
**Decider:** `cixzhang`, `2026-09-07`

The score-ledger program and tests form the first narrow operational tool group.
Its implementation is validated by Node tests, repository guardrails, ESLint, and
a Node contract for the Sandbox projection; unrelated UI, browser, and production
build work does not observe that change.

Rejected: admitting all of `scripts/`, all JavaScript files, or every Node test by
pattern. Those sets contain generators and build/release inputs with different
owners.

### DEC-4 — CI grows only at a surface boundary

**Reference:** `spec:AST-030/DEC-4`
**Decider:** `cixzhang`, `2026-09-12`; clarified `2026-09-15`

Each surface may expose the test and build commands it needs, but pull-request CI
has one independently routed test owner and, when applicable, one independently
routed build owner for that surface. One owner may dispatch multiple jobs or
steps and feed a stable required-check join; those mechanics do not create more
lanes. Existing-surface coverage joins those owners. A genuinely new surface may
add owners only after the complete FR10 admission contract is approved. A named
surface without a complete admitted owner remains on broad CI.

Visual regression is the exception to per-surface routing: every surface
registers its cases with the one shared Storybook-backed PR visual owner in
`ci.yml`. Its jobs, steps, artifacts, and report publication are not additional
visual lanes; a second workflow that captures or compares those pixels is.
The single-workflow wording clarifies the existing shared-system requirement;
it does not admit a new owner.

Build's production CSS-layer cascade is a Build package integration contract, so
it belongs to Build's test owner. Theme-family compilation remains owned by
`theme-build`; sharing CSS concepts does not collapse those surfaces.

Rejected: per-suite, per-component, per-feature, per-theme-family, or separate
PR visual owners; counting internal jobs or required status projections as
lanes; and implicit expansion under an undefined “additional specialized
surface” exception.

### DEC-5 — Release checks reuse the canonical owners on an exact main commit

**Reference:** `spec:AST-030/DEC-5`
**Decider:** `cixzhang`, `2026-09-23`; clarified `2026-10-07`

Run release evidence against an exact commit in current `main` history, not only
constituent PR heads. Use an explicit release-time dispatch in `ci.yml` so full
visual, accessibility, and RTL checks do not run on every main push. Reuse
existing test/build owners, keep their finding policies, and fail closed on
incomplete scope, missing work, or when the checked commit is no longer in
current `main` history. Baseline capture and the reviewed pull request that
versions an accepted candidate remain separate operations.

PR accessibility remains a scoped, fast check: audit only explicitly resolved
changed component owners and retain the fast modal-close, theme-var, and story-play
browser guards. Never widen a PR to the exhaustive accessibility sweep because a
shared path changed or the component set is empty. Missing or approximate analysis
fails the scoped check rather than silently claiming no work. Multi-component
folders expand only to their own canonical component owners or existing umbrella
Storybook routes; an exported name without either route cannot be passed to axe. The full
accessibility roster and the whole-repository spec-test contracts and their
evidence uploads run only on `release-check` in this workflow.
The release path retains the complete suite and cannot substitute a scoped result.

Rejected: a separate workflow, per-push full audits, and treating a maintenance
capture, skipped check, a checked SHA no longer in current `main` history, or
retroactive status as release evidence.

### DEC-6 — Pull requests run what the change reaches; full runs stay where landing is decided

**Reference:** `spec:AST-030/DEC-6`
**Decider:** `cixzhang`, `2026-10-26`

A pull request's Vitest legs and browser audits follow what its change reaches:
the module graph for tests and built-bundle reach for components. Tests that
read sources through the file system run whole, because no import reaches what
they read. Shared infrastructure, uncertainty, `main`, merge-group entries and
release checks run everything, so no landing or release gate narrows.

Rejected: a full run triggered by approval, a label or a draft-to-ready change,
which tests the pull request's head rather than the merged result.

## Open questions

None.
