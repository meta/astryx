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
    ".github/actions/test-scope/**",
    ".github/scripts/workflow-paths.test.mjs",
    ".github/actions/heavy-caps/**",
    ".github/scripts/ci-pr-gate.*"
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
- Remove required check names (other than retiring the `spec-owner-approval`
  mirror, FR15), branch protection, merge-queue coverage, or owner approval of
  spec content.
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
  | `knowledge`         | canonical system, family, design, theme, component, and module records                                                             | knowledge validation and spec-owner approval of the current spec content                                                                             |
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
  focused, smoke, and no-op paths MUST NOT narrow release checks. On a pull
  request, the visual (`visual-scout`, `pr-visual`), accessibility (`pr-a11y`
  with its guards and specs) and RTL (`pr-rtl` with its legs) owners MUST run
  only when the pull request carries the `ci:heavy-lanes` label at the event; a
  pull request update without it runs none of them, and no required context
  depends on them. An opted-in PR's a11y MUST remain scoped to changed components
  plus fast interaction guards; full a11y
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
  existing finding policies. A main-push workflow MUST dispatch that
  release-check for every push to `main`, bound to the pushed commit; the
  dispatched checks share one concurrency group that never cancels a running
  check: at most one runs and one waits, and a burst of pushes is checked once,
  at its newest commit. A commit `main` has already moved past leaves its check
  to the newer push. That release-check run is main's result, and a failure is
  fixed forward by an atomic pull request. Main's own fast
  checks still run for every push. Release checks MUST NOT capture
  baseline candidates, publish baselines, or use a separate daily workflow or
  retroactive acceptance status.
  Deployment, accessibility, RTL, and vibe evidence MAY retain their workflows
  and artifacts when they do not duplicate visual regression. A new or existing
  surface, component, package, theme family, or visual suite MUST join the
  canonical workflow. A repository guard MUST reject independent visual owners
  while preserving legitimate non-visual artifact use.
- **FR13 — Broad CI on a pull request runs what the change reaches.** On a
  `pull_request` event whose trusted classification finds no shared
  infrastructure, broad CI keeps every required context and every owner FR12
  routes to a pull request, and narrows what those owners run. The Vitest test owner runs the tests whose module graph
  reaches a changed file, against the merge commit's base parent, plus every test
  that reads repository sources through the file system, directly or through a
  module it imports; a computed `import()`, a child process, or a library that
  reads sources for it (the TypeScript compiler, a bundler) counts as reading
  sources; and every test that loads a changed workspace package from its build,
  by the package's name or a path into its `dist/`. When a pull request runs
  them (FR12: only with the `ci:heavy-lanes` label), the visual and RTL owners
  audit one affected set of component folders: the changed components
  and their reverse dependents, the folders of the components, in any package,
  whose built bundle, `import()` targets included, reaches a changed module.
  Visual audits each dependent folder that has a stable story, and runs the
  whole plan when the dependents exceed its focused budget or none has one; RTL
  audits every component each of those folders implements. A Changeset renders nothing and widens no audit. A changed module that no component bundle holds adds none, and without
  a readable build the audits run in full. PR accessibility, when it runs, stays
  scoped to changed components (FR12). Shared infrastructure runs the full suite of
  the owners the pull request runs (visual, accessibility and RTL only with the
  `ci:heavy-lanes` label, FR12): root
  dependency manifests and lockfile, root configuration, a package's manifest,
  build or test configuration and test setup, `internal/` (the test harness
  included), `theme-build` paths (tokens and themes), Storybook configuration,
  `node-tooling` paths (FR8 keeps their whole Node project), and every other
  `shared-or-unknown` path except Changesets. Every fail-closed
  condition of FR3–FR4 also runs the full suite. `main`, release branches,
  merge-group entries and `release-check` dispatches always run the full suite,
  and release checks keep FR12's full scope.
- **FR14 — Every workflow declares when it runs, as an allowlist.** Each
  workflow in `.github/workflows` states the positive condition that makes it
  relevant, and runs only when that condition holds. A workflow whose push or
  pull-request trigger serves no required context lists the paths that make it
  relevant on that trigger (`paths:`), and those paths name what the workflow
  reads or runs, never everything; a merge-group entry, which cannot filter by
  path, keeps running. A workflow that reports a required context (`build`,
  `test`, `docsite-test`, `lint`, `review-required`, and the
  `spec-owner-approval` mirror while it is required, FR15)
  starts on every pull request and is never path-filtered: the trusted
  classifier's positive surfaces (FR1–FR5) choose the work inside it, and a job
  whose suite does not apply reports success without running it (FR7). A push
  to `main`, a schedule, a manual dispatch, and review, comment, check and
  deployment events are relevance conditions of their own. No workflow uses
  `paths-ignore` or another exclusion list, which would run on any path no one
  thought to exclude.

- **FR15 — One review gate carries code review and spec approval.** The
  review workflow (`review-signal.yml`) and `review-clear.yml` publish
  `review-required`, which carries both the code review and spec-owner approval
  (`architecture:knowledge-contracts` DEC-14); no other workflow publishes a
  review or spec context. `spec-owner-approval` is published only as a mirror of
  the spec half while branch protection still requires it. The spec-owner job
  evaluates pull-request, review, and owner-command comment events, runs
  without cancel-in-progress, and publishes a terminal state for the head it
  read. It skips fork review events, whose tokens are read-only; fork approvals
  use the owner command. Only the review-signal job keeps a per-pull-request
  cancel group. Each writer of `review-required` composes both halves and links
  a spec wait to the spec decision's details. Comments that are not owner
  commands start no runner, and no scheduled job reads approvals.
- **FR16 — One author's pull requests share the heavy suites.** On a pull
  request, the heavy browser suites (the interaction proofs and the Build
  package's browser and fixture-contrast contracts) run only when the pull
  request is among its author's fifteen oldest open non-draft pull requests and
  the author has had at most one hundred heavy runs that UTC day. A heavy run is a
  CI run on one of those pull requests in which a heavy suite ran; a cancelled
  run does not count, and neither does a run whose heavy suites were held.
  Pull requests from the shared agent login count per branch prefix, and that
  login as a whole is also held to its five oldest pull requests and forty
  heavy runs a day. Engineering owners listed in `.github/ENGOWNERS`, as the
  pull request's base commit lists them, are exempt from all of these limits,
  the shared login's included, and so are bot accounts. A held
  suite's check fails with "Queued behind your 15 oldest PRs: runs on a push
  once it is among them, or at the pre-merge re-run.", "Queued behind the
  shared login's 5 oldest PRs: runs on a push once it is among them, or at the
  pre-merge re-run." or "Daily heavy-run cap reached, runs tomorrow or at
  pre-merge.", so no pull request passes the required checks without its heavy
  suites. A re-run, which is the pre-merge restart, is exempt from both limits,
  and when the limits cannot be looked up the suite runs. Merge-queue entries,
  `main`, release checks and the visual, accessibility and RTL owners a
  maintainer opts a pull request into with `ci:heavy-lanes` are unaffected.
- **FR17 — A pull request runs CI when it is ready and a maintainer can vouch
  for it.** A draft pull request runs no CI, and marking it ready for review
  starts its pull-request run, which runs what the change reaches (FR13,
  DEC-6). A pull request runs CI when its head branch lives in this repository,
  which pushing needs write access for, or when it carries the
  maintainer-applied `ci:run` label. The label takes effect on the next push or
  a close and reopen; applying or removing any label starts no run. For a pull
  request that may not run CI, the required contexts (FR7) report failure with
  "Waiting for a maintainer's ci:run label", never success, because a skipped
  required check would count as passing. Events other than a pull request (a
  push to `main`, a merge-group entry, a dispatch) are unaffected, and a fork's
  code never runs with the repository's secrets.

### Platform support

- Supported feature/engine floor: GitHub pull-request and merge-group workflows
  on the repository's supported Node and runner versions.
- Unsupported behavior: incomplete or unavailable classification receives no fast
  path and runs broad CI.
- Browser evidence: routing itself has no visual claim; the browser checks FR12
  routes to a pull request remain mandatory whenever their owning surface is
  present or scope is uncertain, and visual, accessibility and RTL run on `main`
  and release checks (FR12).

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

Outside the classifier-routed workflows, the Internal Registry dependency check,
the CLI smoke test and the hardening-issue opener run only when the paths they
read change (FR14).

## Verification

| Contract | Verification                                                                       | Representative states                                                                                                                                                                                                                                                                                                                        | Mutation or failure expectation                                                                                                                                                                                       |
| -------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1–FR2  | classifier unit tests expose the surface set                                       | knowledge; docsite; admitted tool; Core/Lab/Charts/Rich Text/Vega source; shared config; unknown                                                                                                                                                                                                                                             | an unclassified path receives a specialized lane or a category has no check owner                                                                                                                                     |
| FR3–FR4  | workflow contract tests execute an isolated trusted-base classifier                | valid base; missing merge base; missing matcher/registry; classifier self-change; merge group                                                                                                                                                                                                                                                | PR-controlled policy grants a lane, or missing trust data skips checks                                                                                                                                                |
| FR5      | mixed-surface and incomplete-owner routing tests                                   | spec+component; tooling+component; named surface without admitted lane; docsite+shared                                                                                                                                                                                                                                                       | one surface hides another owner or a named-but-incomplete surface skips broad CI                                                                                                                                      |
| FR6–FR8  | Node-tooling dependency, CI workflow, and trusted post-CI workflow tests           | both admitted score-ledger paths; Sandbox projection imports; test/build joins; preview/visual publisher                                                                                                                                                                                                                                     | UI/browser/build work or preview publication runs for the singleton tool set, an operational consumer is untested, a visual status stays pending, or a required context disappears                                    |
| FR9      | mutation-sensitive classifier and workflow fixtures                                | unknown path; rename from unknown; truncated list; package-specific public paths                                                                                                                                                                                                                                                             | weakening a fail-closed rule leaves the suite green                                                                                                                                                                   |
| FR10     | surface-admission and routing contract tests                                       | existing surface; proposed surface with and without the full admission contract                                                                                                                                                                                                                                                              | a new surface adds lanes without its approved paths, commands, ownership, projections, and routing tests                                                                                                              |
| FR11     | surface owner, internal-job, and required-join contract tests                      | Build package browser behavior; CLI; theme-family broad fallback; mixed Core+CLI                                                                                                                                                                                                                                                             | a second owner is routed for one surface, an internal job masquerades as a lane, an owned failure misses its join, or an unrelated owner runs                                                                         |
| FR12     | Storybook visual-plan, canonical workflow, and repository-owner guard tests        | PR scope; full-plan maintenance; report-only publication; deployment/a11y/RTL/vibe artifacts                                                                                                                                                                                                                                                 | another workflow captures or compares pixels, a renamed or aliased owner escapes the guard, or legitimate non-visual artifacts are rejected                                                                           |
| FR13     | classifier, workflow contract, component-analysis and RTL-scope tests              | component change; shared module; Changeset beside code; infrastructure path; incomplete list; no build                                                                                                                                                                                                                                       | an infrastructure path is scoped, a file-system guard test is skipped, a reverse dependent leaves visual/RTL or enters PR accessibility, or a full-suite event is narrowed                                            |
| FR14     | `workflow-paths.test.mjs` over every workflow                                      | path allowlist; required-context workflow                                                                                                                                                                                                                                                                                                    | a `paths-ignore`, a match-all or exclusion glob, or a path filter on a workflow that reports a required context fails                                                                                                 |
| FR15     | workflow contract and reconciler tests                                             | ENGOWNER spec PR; owner command; other comment; fork review; non-spec PR                                                                                                                                                                                                                                                                     | `review-required` succeeds while spec approval is missing, another workflow publishes a review context, a fork review starts the spec checks, or a non-command comment starts a runner                                |
| FR16     | `heavy-caps-action.test.mjs` cap cases and heavy-job contract                      | sixteenth-oldest PR; 101st heavy run of the day, beside cancelled, light and other-branch runs; agent lane and its five-PR and forty-run backstops; an engineering owner, including the shared login past those backstops, a commented-out or trailing-comment handle and an unreadable roster; bot; the deciding run; re-run; failed lookup | a heavy suite that runs ahead of the author's fifteen oldest PRs, or past the daily cap, a capped job that passes, an engineering owner or a re-run that is held, or a roster read from the pull request's head fails |
| FR17     | `ci-pr-gate.test.mjs` over every `pull_request` workflow and the shared conditions | branch here, fork with and without `ci:run`, another label, draft with the label, ready, push, merge group, dispatch                                                                                                                                                                                                                         | a job that can start on a pull request without the condition, a label trigger, a required job that skips for a pull request that may not run CI, or a draft or unlabelled fork that runs fails                        |

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
visual, accessibility, and RTL checks do not run on every main push (DEC-7
supersedes this sentence: they run after merges to `main`). Reuse existing
test/build owners, keep their finding policies, and fail closed on incomplete
scope, missing work, or when the checked commit is no longer in current `main`
history.
Baseline capture and the reviewed pull request that
versions an accepted candidate remain separate operations.

PR accessibility, when a pull request runs it (DEC-7), is a scoped, fast check:
audit only explicitly resolved changed component owners and retain the fast
modal-close, theme-var, and story-play browser guards. Never widen a PR to the exhaustive accessibility sweep because a
shared path changed or the component set is empty. Missing or approximate analysis
fails the scoped check rather than silently claiming no work. Multi-component
folders expand only to their own canonical component owners or existing umbrella
Storybook routes; an exported name without either route cannot be passed to axe. The full
accessibility roster and the whole-repository spec-test contracts and their
evidence uploads run only on `release-check` in this workflow.
The release path retains the complete suite and cannot substitute a scoped result.

Rejected: a separate workflow, per-push full audits (DEC-7 supersedes this for
pushes to `main`), and treating a maintenance
capture, skipped check, a checked SHA no longer in current `main` history, or
retroactive status as release evidence.

### DEC-7 — Visual, accessibility and RTL run on main, not on pull request updates

**Reference:** `spec:AST-030/DEC-7`
**Decider:** `cixzhang`, `2026-10-28`

Run the visual, accessibility and RTL owners on every push to `main`, through
the same exact-commit `release-check` the release gate uses, and before a cut;
a pull request runs them only when it opts in with the `ci:heavy-lanes` label. Main-push checks are throttled: one runs at a time, a
burst of pushes collapses to its newest commit, and a running check is never
cancelled, so every check that starts finishes.
Pull request updates keep the fast checks and every required context; the
modal-close, theme-var and story-play guards are steps of the accessibility
owner, so they run with it, after merge or on a labelled pull request. A
failure on `main` is repaired forward with an atomic pull request, not reverted
first. This supersedes DEC-5's choice to keep these checks off main pushes:
running the browser suites on every update of every open pull request costs
far more than running them once per merge burst on `main`. The label opts a
pull request into the head-scoped owners FR13 describes; it adds no run of its
own, and the merged result is checked on `main`, so it is not
the label-triggered full run DEC-6 rejects.

Rejected: keeping the suites on every pull request update (spend); a separate
scheduled or daily owner (FR12 keeps one canonical workflow).

### DEC-6 — Pull requests run what the change reaches; full runs stay where landing is decided

**Reference:** `spec:AST-030/DEC-6`
**Decider:** `cixzhang`, `2026-10-26`

A pull request's Vitest legs and browser audits follow what its change reaches:
the module graph for tests and built-bundle reach for components. Tests that
read sources through the file system run whole, because no import reaches what
they read. Shared infrastructure, uncertainty, `main`, merge-group entries and
release checks run everything, so no landing or release gate narrows; a pull
request runs the visual, accessibility and RTL owners only with the
`ci:heavy-lanes` label (DEC-7).

Rejected: a full run triggered by approval, a label or a draft-to-ready change,
which tests the pull request's head rather than the merged result.

### DEC-8 — A workflow states what makes it run, never what does not

**Reference:** `spec:AST-030/DEC-8`
**Decider:** `cixzhang`, `2026-10-28`

Every workflow names the positive condition that makes it relevant: the paths it
reads or runs, the classifier surfaces inside a required context, or the event
it answers. An exclusion list (`paths-ignore`) runs on every new directory,
package or root file no one remembered to exclude, so unrelated changes keep
paying for it; an allowlist misses only what its owner did not name. Required
contexts stay unfiltered so a pull request never waits on a check that never
starts.

Rejected: `paths-ignore` lists (they run on whatever is new); path-filtering a
required context (its check would never report).

### DEC-9 — Spec-owner approval runs in the review workflow

**Reference:** `spec:AST-030/DEC-9`
**Decider:** `cixzhang`, `2026-10-28`

The spec-owner gate and the review gate read the same pull-request events, so
they run in one workflow, and a contributor reads one review gate:
`review-required` names whichever review is still missing, code first.
`spec-owner-approval` remains a mirror until branch protection stops requiring
it, so the merge rules change only when an administrator removes it.

Rejected: keeping a separate spec-owner workflow, which split one review state
across two workflows and two visible gates.

## Open questions

None.
