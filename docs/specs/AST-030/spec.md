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
    "testing": ["FR7", "FR11", "FR30"]
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
    ".github/scripts/ci-pr-gate.*",
    ".github/scripts/perf-*",
    "apps/sandbox/perf/**",
    "playwright.perf.config.ts",
    ".github/scripts/check-public-text.*",
    ".github/public-text-hashes.json"
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
- Remove required check names (other than dropping
  `spec-owner-approval` from them, FR15), branch protection, merge-queue coverage, or owner approval of
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

  | Surface             | Positive path ownership                                                                                                            | Current check owners                                                                                                                                             |
  | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `knowledge`         | canonical system, family, design, theme, component, and module records                                                             | knowledge validation, spec-owner approval of the current spec content, and the Vitest tests that read a changed record, directly or through a module they import |
  | `docsite`           | the docsite application                                                                                                            | docsite generation and tests                                                                                                                                     |
  | `node-tooling`      | admitted operational Node tooling whose consumers are covered by Node contract tests                                               | Node Vitest, repository guardrails, and ESLint                                                                                                                   |
  | `runtime:<package>` | public source and package contract for Core, Lab, Charts, Rich Text, Vega, CLI, and Build                                          | the package's unit/type checks plus current broad build and downstream consumer checks; Build's owner includes production CSS-layer browser behavior             |
  | `theme-build`       | shipped theme packages and theme compilation outputs                                                                               | theme tests, theme package builds, theme-family browser behavior, and stable visual evidence where applicable                                                    |
  | `storybook-visual`  | Storybook stories/configuration and visual, accessibility, or RTL audit infrastructure                                             | Storybook build, preview/visual-report publication, and the applicable browser, visual, accessibility, and RTL checks                                            |
  | `shared-or-unknown` | shared configuration, dependency graphs, workflows, classifiers, generated ownership, ambiguous paths, and every unclassified path | all applicable pull-request CI checks                                                                                                                            |

  A category does not earn a specialized lane merely by existing in this table.
  Until every selected surface has an admitted, complete specialized owner route,
  that surface set uses the broad check set. `shared-or-unknown` always uses the
  broad check set, except a Changeset or a carried Lab component's entry file
  beside a Lab-only change, which keeps the Lab-only route (FR26).

- **FR3 — Classification uses trusted base policy.** Pull-request code MUST NOT
  choose its own lane. The workflow MUST load the classifier and every classifier
  dependency from the trusted base ref, then apply that policy to the merge-base
  three-dot path set. For a Lab component's entry files (FR26), the trusted
  classifier also reads GitHub's patch text for those three files. It reads
  the text as data, matches each line against fixed patterns and never runs
  it, so a pull request supplies only data that the base policy judges, never
  the policy. Workflow changes use the broad lane unless they are an
  admitted tool's non-PR dispatch workflow. Classifier,
  classifier-dependency, and routing-test changes use the broad lane.
- **FR4 — Uncertainty fails closed.** A missing merge base, missing trusted
  classifier dependency, failed classifier, empty or incomplete file list,
  ambiguous rename, unknown path, or merge-group event without a trusted PR path
  set MUST select the broad lane. No fallback may grant a specialized lane.
- **FR5 — Mixed scope keeps every owner.** A change touching multiple classified
  surfaces MUST run the union of their checks. It MUST NOT run specialized lanes
  for untouched surfaces. A set containing `shared-or-unknown` (apart from a
  Changeset or a carried Lab component's entry file beside a Lab-only change,
  FR26), a fail-closed
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
  Existing historical joins remain stable. The default touched-components
  check (FR12) is the visual, accessibility and RTL owners' pull-request
  coverage for the components a change touches: its visual part runs inside
  `pr-visual`, and its accessibility and RTL part runs in one advisory job
  beside them that reports no required context. The touched components'
  browser accessibility contracts (FR12) run in their own parallel job, which
  reports no required context of its own: the existing `test` join waits on
  it and fails with it (FR7), so `test` stays the one required name and it
  routes no new surface lane. A selected surface whose dedicated
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
  with its guards and specs) and RTL (`pr-rtl` with its legs) owners MUST each
  run at their opted-in scope (FR13) only when the pull request carries that
  suite's label at the event:
  `ci:run-visual`, `ci:run-a11y` or `ci:run-rtl`, in each case last applied by
  someone with write, maintain or admin access, and a lookup that cannot
  confirm that runs nothing. A label runs only its own suite. A Lab-only pull
  request (FR26) runs no default touched-components check and no contract
  job; its labels still
  run their suites. Without a label, a pull request update
  runs none of these owners at their opted-in scope, and no required context
  depends on them; it runs one default touched-components check instead:
  visual, accessibility and RTL for only the components the change touches,
  never their reverse dependents, against the pull request's Storybook build
  and within the 15-minute budget. Its visual part is `pr-visual`'s default
  mode, a focused check of the touched Core components that never escalates
  to the release plan, so `pr-visual` stays the one visual owner; its
  accessibility and RTL parts and the per-component record are
  `pr-touched-components`, on one standard runner. A wide change skips it: one
  that touches more than five components, or changes shared styles (themes,
  tokens, or a `.stylex.ts` file in a package's shared `theme`, `utils`,
  `hooks`, `internal` or `Layer` folder); behaviour-only shared code is not a
  wide change. Every change, a wide one included, also gets an
  accessibility audit, new violations only, of each story file it adds or
  changes that no other audit in the pull request covers. Nothing starts a full suite on its own; a wide change's check
  is the full suites behind the labels. No required context depends on the
  touched check, and it records each touched component's pass, fail, changed
  or not-run result per suite, or that the change was wide and how many
  components it touched, for the pull-request comment. Beside the default check, one contract job runs, in Chromium, the
  browser accessibility contracts of the components the change touches. It
  needs only the pull request's Storybook build. First it runs the browser
  accessibility spec files the change adds or modifies, at most four, in path
  order, routed by their own `@pr-a11y` lines read from the merge commit; a
  changed `audit` spec waits for its component-audit pull request. Then, a
  wide change included, it runs the `scoped` and `release-only` spec files that
  each touched component owns, in path order, found by the same `@pr-a11y`
  scope and spec-location mapping the labelled run uses. Then, in the time
  left and for at most one minute of it, it runs the `scoped` and
  `release-only` spec files of the component folders that render a touched
  component through their source value imports, nearest first. It runs no unchanged `audit` or `always` spec. For a shared primitive named in `.github/a11y-shared-primitives.json`, FR12's touched-component rule also runs a dependent-audits leg on every pull-request CI run that includes a change to it: at most three legs, each at most 10 minutes, covering the audits of components that use it. The list starts with Button and IconButton. Layer joins when a Layer change breaks release-check or a dependent audit at release; other additions are a CI & Release and chief-of-staff call. A change to a component's source also runs that component's own audit specs in the same leg, on every pull-request CI run that includes the change, within the same three legs of ten minutes. Audits beyond that budget are listed by name as not yet run, and they run on a later run at the same head, which may use more legs; merge-guard merges only on a run at the exact head that ran every owed audit. When GitHub cannot list a pull request's changed files, every audit is owed and no run at that head is complete, so merge-guard does not merge it; the pull request must be split. A main-only dispatch may run every owed audit at a pull request's exact head, as untrusted code under the same limits as the pull request's own run; merge-guard accepts its record for that head as it accepts the pull request run's. With contracts requested, the same dispatch also runs, at that head, the scoped accessibility contract specs a labelled pull-request run selects; merge-guard accepts its result as that head's opt-in accessibility evidence only when every selected spec ran and passed. The contract job runs in parallel with the unit-test jobs and
  MUST NOT become the pull request's critical path: it starts after the
  Storybook build and MUST finish before the slowest unit-test job, so the
  time until the required `test` join reports does not grow. It stops after
  eight minutes and plans six of them: it starts a file only when that file's
  recorded duration fits what is left of those six, so a runner up to a third
  slower than the plan still finishes every file it starts. A contract file
  that cannot finish within the budget is reported as not run, not split. Each file it does not run, for that budget
  or the four-file limit, is reported as not run in the check's summary and
  annotations, with the label that runs it. A spec that starts and does not
  finish fails. A failing contract fails the required `test` join (FR7) and
  blocks the merge. A not-run file passes the join, so a skip never reads as a
  pass and an overflow never reads as a failure. An opted-in PR's a11y MUST
  remain scoped to changed components plus fast interaction guards, and also
  runs the `release-only` spec files a changed component owns directly, never
  through a shared scope token or an unknown scope; full a11y
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
  existing finding policies. Main's heavy-lane workflow MUST dispatch that
  release-check for `main`'s tip, bound to that commit, on a push to `main` and
  on a quarter-hourly schedule, unless the tip already has one or one was
  dispatched in the last 175 minutes, so the quarter-hourly tick after
  three hours dispatches (DEC-11, FR24). A check replaced while waiting,
  which never ran, does not count. A check covers every merge up to its commit,
  so every merge is covered by the next one. The dispatched checks share one
  concurrency group that cancels a running check only for a release re-check
  (FR23): at most one runs and one waits. A push whose commit `main` has already
  moved past leaves its check to the newer push. That release-check run is
  main's result, and a failure is fixed forward by an atomic pull request.
  Main's own fast checks (typecheck, the package build with its per-commit size
  record, and export sync) still run for every push; its full unit suites run
  about hourly on their own schedule, and with every release-check, as FR21
  says. Release checks MUST NOT
  capture baseline candidates, publish baselines, or use a separate daily
  workflow or retroactive acceptance status. Deployment, accessibility, RTL, and
  vibe evidence MAY retain their workflows and artifacts when they do not
  duplicate visual regression. A new or existing surface, component, package,
  theme family, or visual suite MUST join the canonical workflow. A repository
  guard MUST reject independent visual owners while preserving legitimate
  non-visual artifact use.
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
  them at their opted-in scope (FR12: only with their `ci:run-visual` or
  `ci:run-rtl` label), the visual and RTL owners audit one affected set of
  component folders: the changed components
  and their reverse dependents, the folders of the components, in any package,
  whose built bundle, `import()` targets included, reaches a changed module.
  Visual audits each dependent folder that has a stable story, and runs the
  whole plan when the dependents exceed its focused budget or none has one; RTL
  audits every component each of those folders implements. A Changeset renders nothing and widens no audit. A changed module that no component bundle holds adds none, and without
  a readable build the audits run in full. PR accessibility, when it runs, stays
  scoped to changed components (FR12). Without a label, the default
  touched-components check audits only the touched components, and the
  contract job runs the browser accessibility spec files the change adds or
  modifies, those the touched components own, and, for at most one minute of the time left, those of the component folders that render a touched
  component (FR12, DEC-23); neither
  widens to shared modules or to a full suite. Shared infrastructure runs the full suite of the owners the
  pull request runs (visual, accessibility and RTL only with their `ci:run-*`
  labels, FR12): root
  dependency manifests and lockfile, root configuration, a package's manifest,
  build or test configuration and test setup, `internal/` (the test harness
  included), `theme-build` paths (tokens and themes), Storybook configuration,
  `node-tooling` paths (FR8 keeps their whole Node project), and every other
  `shared-or-unknown` path. Changesets are excepted, and so, in a Lab-only
  change, are a carried Lab component's entry files (FR26), the route lock
  under `internal/` included. The interaction harness
  (`internal/interaction-harness/`) and the repository's lint plugin
  (`internal/eslint-plugin-astryx/`) narrow only the Vitest test owner, to the
  tests whose module graph reaches the change and every test that reads
  repository sources; every other owner runs as for shared infrastructure, all
  interaction proofs and the repository-wide lint included.
  A change with any other shared path runs every Vitest test. Every fail-closed
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
  `test`, `docsite-test`, `lint`, `review-required`)
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
  review or spec context. `spec-owner-approval` carries the spec-owner job's decision,
  which the other writers of `review-required` read; it is not a required
  check. The spec-owner job
  evaluates pull-request, review, and owner-command comment events, runs
  without cancel-in-progress, and publishes a terminal state for the head it
  read. A run that would exceed the job's request budget leaves the gate
  pending, saying the pull request is too large to reconcile automatically; a
  maintainer-dispatched run is exempt from the budget and decides normally. It
  skips fork review events, whose tokens are read-only; fork approvals
  use the owner command. An engineering owner's owner command re-evaluates
  both halves of `review-required` from the head it reads, including the code
  review, so a fork's approval takes effect through it. Only the review-signal
  job keeps a per-pull-request cancel group. Each writer of `review-required`
  composes both halves and links a spec wait to the spec decision's details.
  Comments that are not owner commands start no runner, and no scheduled job
  reads approvals.
- **FR16 — One author's pull requests share the heavy suites.** On a pull
  request, the heavy browser suites (the interaction proofs and the Build
  package's browser and fixture-contrast contracts) run only when the pull
  request is among its author's fifteen oldest open non-draft pull requests and
  the author has had at most one hundred heavy runs that UTC day. A heavy run is
  a CI run on one of those pull requests in which a heavy suite ran; a cancelled
  run does not count, and neither does a run whose heavy suites were held. Pull
  requests from the shared agent login count per branch prefix, and that login
  as a whole is also held to its five oldest pull requests and forty heavy runs
  a day. Engineering owners listed in `.github/ENGOWNERS`, as the pull request's
  base commit lists them, are exempt from all of these limits, the shared
  login's included, and so are bot accounts. A held suite's check fails with
  "Queued behind your 15 oldest PRs: runs on a push once it is among them, or at
  the pre-merge re-run.", "Queued behind the shared login's 5 oldest PRs: runs
  on a push once it is among them, or at the pre-merge re-run." or "Daily
  heavy-run cap reached, runs tomorrow or at pre-merge.", so no pull request
  passes the required checks without its heavy suites. A re-run, which is the
  pre-merge restart, is exempt from both limits, and when the limits cannot be
  looked up the suite runs. Merge-queue entries, `main`, release checks and the
  visual, accessibility and RTL owners a maintainer opts a pull request into
  with their `ci:run-*` labels are unaffected by these per-author limits. Every
  run of the CI and Main workflows, of any event, waits for room before its jobs
  start, except the CI workflow's Storybook build, which starts as soon as there
  is room for it while every job that uses it waits for room for the run: it
  starts once the other active runs' estimated jobs plus its own most fit under
  about ninety, and a pull-request run also waits, for that wait's first
  fifteen minutes, while a `main` full check, release re-check or baseline
  capture is waiting, looking twice on a pull
  request, at once and after twelve minutes, and about every four minutes for
  up to two hours for `main`, whose wait runs on a standard runner (DEC-16); a pull-request run that would fit but waits for a
  `main` check looks again every two minutes while it does, and a run within ten
  jobs of room every four minutes, inside its longest wait. A pull-request run
  that finds no room waits like the others, on its slim runner, until its
  longest wait (12 minutes); waiting runs count only what they run: their
  waiting job and a Storybook build that found room. A pull-request run still without room at its
  longest wait looks once more and starts only if no other pull-request run
  started at its longest wait in the last ten minutes and no run that waited
  longer still waits; otherwise it stops with "CI is full: re-run all jobs or
  push later", and its required checks report the stopped run. A run stopped
  for no room fails its waiting job, so a re-run of its failed jobs waits again
  from the start. A pull request that may not run CI admits nothing, and
  waiting never fails a job, so every required context reports as before. A
  tool that grants CI capacity reads it through the same count admission uses
  (`.github/actions/ci-admission/count.mjs`), with no count of its own. The contributor class of FR29 is granted by the capacity tool before this admission; its runs are then admitted like any pull request run.
- **FR17 — A pull request runs CI when it is ready and a maintainer can vouch
  for it.** A draft pull request runs no CI, and marking it ready for review
  starts its pull-request run, which runs what the change reaches (FR13,
  DEC-6). A pull request runs CI when its head branch lives in this repository,
  which pushing needs write access for, or when it carries the
  maintainer-applied `ci:run` label. Applying or removing a label starts no run by itself; the label takes effect on the next push, a close and reopen, or marking the pull request ready. For a pull
  request that may not run CI, the required contexts (FR7) report failure with
  "Waiting for a maintainer's ci:run label", never success, because a skipped
  required check would count as passing. Events other than a pull request (a
  push to `main`, a merge-group entry, a dispatch) are unaffected, and a fork's
  code never runs with the repository's secrets. The contributor job of FR29 starts a run the same way: the label plus a draft-and-ready toggle.
- **FR18 — Runtime performance has one nightly lane, outside the pull-request
  surfaces.** `perf-nightly.yml` measures a fixed set of Sandbox perf scenes in
  Chromium on every nightly run of `main` and on manual dispatch: mount long
  tasks and layouts, interaction layouts and latency, and the JS heap and event
  listeners left after unmount, as the median of several samples. Its result is
  trend data: it reports no required context and gates no merge or release. A
  nightly or dispatched run on `main` is compared with the median of `main`'s
  recorded runs in the seven days before it, as follows: each run records its
  CPU model and a calibration score; a timing metric (mount long tasks,
  interaction latency) is compared only with those runs recorded on the same
  CPU model, and with fewer than three of them, that metric has no baseline,
  informational and never a pass; a calibration-normalized comparison may be
  shown beside it but gates nothing; count metrics are compared with all of
  them. A metric more than 10% worse, and
  worse by at least that metric's floor, on that run and on the recorded run
  before it opens the one open regression issue or comments on it, naming the
  commits since the last run with no metric over the threshold. A metric over
  the threshold on one run alone is reported as pending. A pull request runs the
  lane only while it carries `ci:run-perf`, last applied by someone with write,
  maintain or admin access, under the same label rule and timing as FR12's suite
  labels and FR17, and only when its paths touch what the scenes measure (FR14);
  a pull request run is compared with the same history and records nothing. The
  lane runs on standard runners within the pull-request job budget. During a
  measured interaction, a scene's driver adds no rendering work whose amount
  depends on the runner's speed.
- **FR19 — A pull request that changes CI states its CI impact.** A pull
  request that changes a workflow, a composite action or a CI script carries
  its CI impact in its description's `CI impact:` line: each changed job's
  runner class (standard GitHub-hosted or non-standard), job-minutes per
  pull-request update before and after, the change in runner-pool usage
  (runner-minutes a day and average concurrent jobs) and time to green. The
  pull-request comment measures these for CI's own workflow (`ci.yml`) from
  its change and recent pull-request runs, without starting a job: a changed job counts as often as
  it ran in those runs, time to green compares with runs that ran the same
  jobs, and another changed workflow, a composite action or a CI script is
  named as not measured.
  A `node-tooling` pull request (FR8) gets no pull-request comment, so its
  description's line stands alone. The comment flags a job moving onto a
  non-standard runner, more than 10% added runner-pool usage, or more than two
  minutes added to time to green. A flag asks the reviewer to weigh the cost;
  it fails no check.

- **FR20 — An agent lane's push runs the fast checks; the heavy suites run when
  it is ready and before merge.** A push to a ready pull request authored by the
  shared agent login, into `main`, in its run's first attempt, runs only
  typecheck in the CI workflow (lint keeps its own workflow), unless its trusted
  classification is spec-only or Lab-only (FR26); the path-filtered workflows
  (FR14) are
  unaffected. Its heavy jobs skip, and the required contexts `test`, `build` and `docsite-test` (FR7)
  report failure with "Heavy CI deferred: runs when marked ready and before
  merge", never success, so nothing merges on that run; the PR report says the
  same. Marking the pull request ready, opening or reopening it, and any later
  attempt of its run (the pre-merge re-run of all jobs) run every suite at that
  head. A release merge-back, a release-branch pull request, every other
  author, the review and spec gates (FR15) and the heavy-suite caps (FR16) are
  unaffected (DEC-14).

- **FR21 — Main's full unit run is about hourly and always finishes.** The
  Main workflow runs its unit suites (every Vitest project of every package,
  never scoped to a change) only in a dispatched run, such as the one main's
  heavy-lane workflow dispatches for `main`'s tip, naming that commit, about
  once an hour on its own schedule: a push
  dispatches it at once when none started in the last 55 minutes, and the
  quarter-hourly schedule picks up the tip a burst left. Every release-check of
  `main`'s tip (FR12), the scheduler's or one a person dispatches such as the
  release owner's own, brings a unit run of that commit while it is still the
  tip; a person may also dispatch the Main workflow beside their check, naming
  the commit as `sha`. A unit run counts only for the commit it names. That run reports one pass or
  fail for that exact commit. It runs to completion: it
  has its own concurrency group, which no push cancels, and a newer dispatch
  queues behind it; only a release re-check replaces it (FR22, DEC-18). A unit run that is skipped, cancelled or otherwise does not
  complete makes the next one dispatch at once and is reported in the
  guardian's issue; a newer run that replaced it, such as a recheck, leaves
  nothing to report. Once main's newest full unit run succeeds, the dispatcher comments on that issue, naming the run and the commit it tested, and closes it; it closes only an issue it opened, and a failed lookup retries on the next tick. A stable release publishes only from a cut commit with
  both a passing release-check and a passing full unit run (DEC-15).

- **FR22 — Main's full unit run finishes in minutes.** The Main workflow runs
  every Vitest leg of `main`'s full unit run at once, with no `max-parallel`
  hold: six UI legs and six Node legs beside the build-and-typecheck lane, each
  inside the fifteen-minute job budget (DEC-17). Node legs, here and on a pull
  request, split the files by their recorded test time rather than by count, so
  the slowest files never share a leg and the slowest single file sets the
  floor; a file with no recorded time counts as the median, and which files run
  never depends on the times. A dispatch may name `sha`, a commit in `main`'s
  history that has the size records the build lane keeps, and every lane checks
  that commit out; without it the run validates `main`'s tip. A person's `sha` run
  waits for no other validation and replaces nothing; like every Main run, it
  waits for room under CI's ceiling (FR16). One full unit run of `main` runs at
  a time and a newer one waits (FR21); a push's fast checks run beside it. Only
  a release re-check, which the workflow token sends with `recheck` and `main`'s
  tip as `sha`, cancels the running unit run, because the re-check validates
  that commit in full itself. Pull-request legs keep their
  shape.

- **FR23 — A release-check finishes in minutes, and the release owner can
  re-check `main`'s tip at once.** A release-check runs its browser owners in
  legs that all start together: six accessibility-audit legs, six contract
  legs, eight visual-scout legs and six Core RTL legs, beside the other RTL
  packages. A contract spec file longer than one leg's share is cut into
  consecutive runs of its tests in different legs, and every listed test runs
  in exactly one leg. Pull requests keep their narrower legs, and every leg
  stays inside the fifteen-minute job budget (DEC-17). An admin or maintainer
  dispatches the release re-check workflow with `main`'s tip. It starts the
  release-check and the Main workflow's full unit run on that commit, and each
  takes its lane at once, cancelling the check running there (DEC-18). With
  `failed-only`, the workflow re-runs only the failed jobs of that commit's
  latest re-check runs. A run whose re-run passes is a full passing check of
  that commit. A fix is a new commit and gets a full re-check.

- **FR24 — Main's release-check runs every three hours, and once before each
  weekday cut.** FR12's release-check of `main`'s tip is dispatched when none
  started in the last 175 minutes, so about every three hours on the
  quarter-hourly schedule, and once each weekday at about 06:30 Pacific time
  whatever the window, as the pre-cut release-evidence run, so a check finishes
  about an hour before the 08:00 release cut. The pre-cut run starts even when
  a monitoring check already ran on the tip: a release cut's evidence is a
  release-check that a person or the release tooling dispatches, or one of the two release-evidence runs the workflows start, the scheduled pre-cut run and the release re-check (FR23), each titled "Release evidence of <sha>". The three-hourly
  monitoring checks are not release evidence. The full unit run keeps its own
  hourly schedule (FR21), and the release cut's own exact-commit checks are
  unchanged (DEC-19).

- **FR26 — A Lab-only pull request runs the Lab tests and the Storybook
  build.** A pull request whose every changed path is in the Lab package
  (`packages/lab/`), beside any Changesets and the entry files of the Lab
  components the change itself carries, runs the Lab package's tests on the
  UI legs, the source-reading guard tests on the UI and Node legs as any scoped
  pull request runs them (FR13), the Storybook build, a typecheck of the Lab package and the
  Storybook stories against the packages that build made, and the
  repository-wide guards: full lint and the UI lane's copyright,
  package-exports, CLI API type, token-docs, Lab readiness and knowledge-schema
  checks. It runs no docsite build or tests (beyond the route-lock check
  below), no full typecheck, no
  Build-package tests, no interaction proofs, no touched-components check,
  and no visual, accessibility or RTL suite unless a maintainer's label runs
  one (FR12), and an agent lane's push defers
  nothing (FR20). The required `build`, `test` and `docsite-test` contexts
  report success with the notice "Lab-only: Lab tests + Storybook build",
  never a skip. A Lab component's entry files are its routes in
  `internal/shadcn-registry/routes.lock.json`, its entry in the Lab package's
  part of `packages/cli/assets/discover/official-packages.json`, and a new
  story `apps/storybook/stories/<Name>.stories.tsx` that imports from
  `@astryxdesign/lab`, for a Lab component named for its own folder, which
  the change touches. A component in a family folder keeps the full suite.
  The classifier reads those files' diffs as data and never runs them; a diff
  it cannot read, or a line naming anything else, makes the change mixed. A
  Lab-only change also runs the CLI official-packages check on the first Node
  leg, and, when its route lock differs from the merge base (or the merge base
  is unknown), the route-lock check: the docsite's data generation at the
  canary target, against the packages the Storybook build made. One that adds
  or changes a story also builds Storybook, which the lane always does. A change to any other path is mixed and runs CI as for any
  pull request: Core (its internal modules included), the CLI, scripts, shared
  or root configuration, the lockfile, a change to an existing story, and a
  story of a component the change does not carry. So does an incomplete file
  list or a base whose classifier has no Lab-only lane. An outside
  contributor's pull request still needs `ci:run` (FR17), and `main` and the
  release-check cover Lab as before (DEC-21). A Lab-only pull request that changes an interaction spec file (`*.interaction.browser.spec.ts`) still runs each changed spec, in its own leg when the scoped legs would not run it; the skip of interaction proofs above covers only Lab source changes.
- **FR27 — Lint fails a pull request whose public text carries an internal
  reference.** Public text is each of the pull request's own commit messages and each line it adds, and the pull request's title and description as they read when the check runs. Generated text that no person writes, the
  lockfile and the digest list, is not read.
  The required Lint job runs the base branch's copy of the check, so a pull
  request cannot change the check that judges it. The check matches generic
  shapes of internal identifiers and hosts, and salted digests of internal
  names; the repository holds no internal name in plain text. A failure names
  the location and the kind of reference, never the matched text, and tells
  the contributor to remove the reference at that location, with a maintainer's
  help when the reference is unclear. A range it cannot read fails the check. A
  maintainer handles a false positive through the normal fix-forward route,
  with no bypass.
- **FR28 — A release interaction check's throwaway pull request runs WebKit's
  release scope.** A release interaction check's throwaway pull request, on an
  `interaction-check/` branch that the release tooling creates for a named
  release attempt, runs WebKit's release scope (DEC-24): the touch and gesture
  subset, or the full WebKit browser spec scope after a failed or stale weekly
  full run and at every minor release. The workflow
  verifies the branch prefix, the creator identity and that the head repository
  is this one, so a pull request that only picks the prefix, or comes from a
  fork, does not qualify. The creator check matches the shared automation
  account, so another automated pull request from that account on an
  `interaction-check/` branch also qualifies; the prefix is reserved for the
  release tooling. Such pull requests stay non-mergeable, and this widens the
  scope of no other pull request (DEC-24).
- **FR29 — A stable contribution runs CI without a maintainer.** A stable contribution from a fork runs CI without a maintainer. An automated job starts CI for a fork pull request without `ci:run` (a branch in another repository, so CI doesn't run on its pushes under FR17) when all of these hold: it isn't a draft; its CLA check passes; its head has had no push for 4 hours; the review bot's (`astracat-bot[bot]`) review at that exact head is APPROVED, or COMMENTED with no finding the review marks as blocking (its body or inline comments contain "**Blocking", "Requesting changes" or "Changes requested"); CHANGES_REQUESTED, or no review at the head, never counts; the link guard passes (merge-guard's `external-links` status at the head is success or absent, and the pull request has no `needs-human:external-link` label); GitHub doesn't report it as conflicting with its base; its last push is no more than 30 days old; and it changes no workflow or CI path (`.github/**`, CI scripts). To start the run, the job adds `ci:run` and marks the pull request draft and then ready again, so the ready event starts a run at that exact head (FR17). The same ready event re-requests a human reviewer whose latest review requested changes, as a maintainer's own toggle does. Once the run has started it removes the label, but only when the latest `ci:run` label event is its own, so a later push runs nothing until it is vetted again. The job starts a head at most once, and a new head becomes eligible when it meets the same conditions. It starts a run only when the capacity tool has no release-check or main-break waiter queued in the capacity tool, and room for one more pull-request run under the CI job ceiling, at most one start per sweep, in a contributor class with its own daily runner-minute budget set by the owner, first in, first out by how long each head has been stable; the run is then admitted under FR16 like any pull request run. A daily report shows the minutes used against the budget, flags eligible heads that waited more than 2 days, and lists eligible-but-stale heads (over 30 days since the last push) for triage as needing a rebase. A maintainer can still start CI by hand: `ci:run` with a draft-and-ready toggle, a push, or a reopen runs it outside the stability conditions and the contributor budget, admitted under FR16; the automated job never removes or re-adds a label a maintainer set. (DEC-26)
- **FR30 — A non-generated release-branch candidate runs broad CI.** The
  generated version pull request keeps its narrow bookkeeping lane only when
  every changed path is one of its generated outputs. Any other pull request to
  a `release/v*` base runs every normal product and test lane and still requires
  the `release-bump` context. That context applies the trusted base branch's
  release validator and may admit only the release test-repair class that
  `spec:AST-017/FR61` defines. An empty, unavailable, or truncated file list
  also runs broad CI and records undecided scope; uncertainty never grants the
  generated lane.
- **FR31 — The Chromium interaction lane runs what the change reaches.** On a
  pull request, the Chromium interaction proofs (`pr-interaction`) MUST run the
  interaction specs of the components the change changes or touches and of
  their dependents, and each interaction spec file the change adds or
  modifies. The touched components come from the trusted classification
  (FR1–FR3) through the same touched-component mapping FR12 uses. A dependent
  is a component folder that renders or imports a changed or touched component
  through its source value imports, as FR12's contract job finds it; a
  type-only import adds none. The lane MUST run the full interaction suite
  when the change touches shared code: a `shared-or-unknown` path (FR2),
  shared infrastructure (FR13), or a shared primitive that
  `.github/a11y-shared-primitives.json` lists (FR12). Release checks and a
  nightly run of `main` MUST run the full interaction suite, as FR13's other
  full-suite events do.
  A changed Storybook story adds the interaction specs of the component
  folders it imports by value, and every interaction spec that opens one of
  its story ids; those folders are not touched, so they add no dependents, and
  a listed primitive among them does not run the full suite. A story that takes
  a package-root name no component folder in that package holds, or a whole
  package, runs the full interaction suite, as does a removed story, a
  spec's templated story id that could name it and that no quoted name fills,
  or a spec that opens a story id no story file makes.
  A shared subpath it imports (theme, hooks, utils) adds nothing. Selection fails closed: when the dependency graph
  cannot be computed, when a changed source path maps to no component, or on
  any fail-closed condition of FR3–FR4, the lane MUST run the full suite.
  For the interaction lanes, a change to a component folder's unit tests
  (`*.test.*`), docs (`*.doc.mjs`, `*.md`) or accessibility specs touches no
  component, unless an interaction spec or proof page imports that file,
  directly or transitively, in the import graph at the pull request's head;
  such an import selects as a touched component, and a graph that cannot be
  computed runs the full suite. FR13's theme sources stay shared.
  Selection changes no required context (FR7) and none of FR16's limits. FR26
  keeps the Lab-only rule, and the WebKit lane keeps its own scope (FR28). An
  escape is a regression in an interaction spec that a selective run did not
  run and that a full run, a release check or `main` then caught. Every escape
  MUST be logged, and the rule MUST be reviewed against that log four weeks
  after the lane starts to run selectively. A replay of a recent set of pull
  requests (the `vjeux` lane's spike set) MUST show that selective runs catch
  every failure the full runs caught (DEC-28). FR31 gap: the selection and its tests have no implementation yet; the lane runs every interaction spec.

- **FR32 — A changed release spec runs in full before merge.** A pull request
  runs a release spec in full, alone (`--workers=1`), on `4-core-ubuntu`, the
  runner class whose release-check timings gate, in one of the release-spec shards, when it adds
  or changes the spec, changes a module the spec imports where the
  touched-component mapping can see it, or changes a component the spec
  visits. A release spec is a `*.release.*.spec.ts` file or a spec tagged
  `@pr-a11y release-only`. A spec visits a component through a story id
  (`core-<component>--…`) or a sandbox path that maps to the component's
  folder; a visit that cannot be resolved runs the spec. A Lab-only pull request (FR26) runs the release specs it triggers. The shards MUST NOT drop a spec as not run, and the `release-specs (changed)` check passes only when every shard passes. Merge-guard requires that check only when a pull request
  triggers it; a missing, skipped, or stale-head result waits and fails
  closed. A timing-budget miss in a shard is a failure, not a flake; it is not
  retried automatically, and a budget question goes to the specification
  owner (DEC-29). FR32 gap: the plan reads visits only from Storybook story
  ids and pages on the served Storybook; it maps no sandbox path to a
  component folder.

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
docsite, admitted Node tooling and the Lab package (FR26). All other changes run broad Node/UI, build,
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
The nightly perf lane is the one scheduled measurement outside them (FR18).

## Verification

| Contract | Verification                                                                                                                                                                                  | Representative states                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR1–FR2  | classifier unit tests expose the surface set; `fs-guard-tests.test.mjs` spec-reader cases                                                                                                     | knowledge; docsite; admitted tool; Core/Lab/Charts/Rich Text/Vega source; shared config; unknown; a spec-only change to a record a test reads                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | an unclassified path receives a specialized lane, a category has no check owner, or a spec-only change skips a test that reads its record                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| FR3–FR4  | workflow contract tests execute an isolated trusted-base classifier                                                                                                                           | valid base; missing merge base; missing matcher/registry; classifier self-change; merge group                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | PR-controlled policy grants a lane, or missing trust data skips checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| FR5      | mixed-surface and incomplete-owner routing tests                                                                                                                                              | spec+component; tooling+component; named surface without admitted lane; docsite+shared                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | one surface hides another owner or a named-but-incomplete surface skips broad CI                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| FR6–FR8  | Node-tooling dependency, CI workflow, and trusted post-CI workflow tests                                                                                                                      | both admitted score-ledger paths; Sandbox projection imports; test/build joins; preview/visual publisher                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | UI/browser/build work or preview publication runs for the singleton tool set, an operational consumer is untested, a visual status stays pending, or a required context disappears                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| FR9      | mutation-sensitive classifier and workflow fixtures                                                                                                                                           | unknown path; rename from unknown; truncated list; package-specific public paths                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | weakening a fail-closed rule leaves the suite green                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| FR10     | surface-admission and routing contract tests                                                                                                                                                  | existing surface; proposed surface with and without the full admission contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | a new surface adds lanes without its approved paths, commands, ownership, projections, and routing tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| FR11     | surface owner, internal-job, and required-join contract tests                                                                                                                                 | Build package browser behavior; CLI; theme-family broad fallback; mixed Core+CLI                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | a second owner is routed for one surface, an internal job masquerades as a lane, an owned failure misses its join, or an unrelated owner runs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| FR12     | Storybook visual-plan, canonical workflow, and repository-owner guard tests                                                                                                                   | PR scope; full-plan maintenance; report-only publication; deployment/a11y/RTL/vibe artifacts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | another workflow captures or compares pixels, a renamed or aliased owner escapes the guard, or legitimate non-visual artifacts are rejected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| FR12     | `touched-components.test.mjs` changed-spec routing; `a11y-pr-contracts.test.mjs` `changedOnly` cases; `a11y-changed-stories.test.mjs` and the touched job's story-audit contract              | a pull request that adds a browser accessibility spec; one that changes an `always` spec; one that changes a `release-only` or an `audit` spec; one that changes more spec files than the limit; a component change with no spec change; a pull request that adds an `a11y/` story no component owns; one that adds a story to an untouched component's story file beside a touched component                                                                                                                                                                                                                                                                                                                                                                                                    | a pull request that adds a browser accessibility spec that fails is not caught on that pull request, a spec of a component that is neither changed, touched nor rendering a touched component runs in the contract job, or an unchanged `audit` spec does, a not-run file reads as passed or fails the join, a failing contract leaves the `test` join green, or a new violation in a changed story no component owns passes the touched check                                                                                                                                                                                                                           |
| FR12     | `a11y-pr-contracts.test.mjs` ownership cases; the CI workflow contract; contract-job and unit-test-job timings on 17 component pull requests                                                  | a pull request that touches one component with an owned `release-only` contract, passing and failing; a contract file that cannot finish within the budget; a wide change; a reverse dependent of the touched component; measured: setup up to about 1.5 minutes plus the 8-minute stop, against the slowest unit-test job finishing 9.9 to 25 minutes after the Storybook build; a wide change touching Spinner (its own specs run); the folders that render a touched component, nearest first, type-only imports left out, within a one-minute share, and one that does not fit (reported as not run)                                                                                                                                                                                         | a touched component's owned `release-only` contract does not run on its pull request, a failing contract leaves the `test` join green, a skipped file is split, does not show as "not run" in the check's summary or fails the join, the contract job finishes after the slowest unit-test job, or a touched component's own spec does not run on a wide change, or a rendering folder's spec runs before an owned one                                                                                                                                                                                                                                                   |
| FR12     | `a11y-dependent-audits.test.mjs` planning cases and the CI workflow contract                                                                                                                  | a Button change; an IconButton change; a test, story or doc change in a primitive's folder; a change to no primitive; the plan's legs and their recorded times                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | a Button change that leaves a dependent component's audit out, plans more than three legs or a leg over ten minutes, or a dependent audit failure the `test` join passes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| FR12     | `a11y-dependent-audits.test.mjs` own-audit and deferral cases; the dependent-audit record                                                                                                     | a component source change; an over-budget set on a first run; a later run at the same head                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | a component source change that leaves its own audits out; an over-budget set whose deferred audits are not listed by name; a head that merges on a run that left an owed audit unrun                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| FR12     | `a11y-dependent-audits.test.mjs` undecided-scope cases; `test-scope-action.test.mjs` truncated-diff case                                                                                      | a diff over GitHub's file-list limit on a first run and on a later run                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | such a diff whose record is complete, that omits the split message, or that merge-guard merges                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| FR12     | `audits-at-head.test.mjs` record contract; merge-guard's exact-head record check                                                                                                              | a dispatch record at the exact head that ran every owed audit; one at another head; one missing an owed audit; with contracts, a complete passing result, and one with a selected spec missing or failing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | merge-guard refuses the first or the complete contracts, or accepts any of the others                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| FR13     | classifier, workflow contract, component-analysis and RTL-scope tests                                                                                                                         | component change; shared module; Changeset beside code; infrastructure path; incomplete list; no build; an interaction-harness or lint-plugin path beside code, alone and with another shared path, and a script or other shared path beside one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | an infrastructure path is scoped, a file-system guard test is skipped, a reverse dependent leaves visual/RTL or enters PR accessibility, or a full-suite event is narrowed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| FR14     | `workflow-paths.test.mjs` over every workflow                                                                                                                                                 | path allowlist; required-context workflow                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | a `paths-ignore`, a match-all or exclusion glob, or a path filter on a workflow that reports a required context fails                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| FR15     | workflow contract and reconciler tests                                                                                                                                                        | ENGOWNER spec PR; owner command; other comment; fork review; non-spec PR; run over the request budget; maintainer dispatch; fork PR, code-only: an owner's exact-head approval plus the owner command clears the code half                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `review-required` succeeds while spec approval is missing, another workflow publishes a review context, a fork review starts the spec checks, a non-command comment starts a runner, an over-budget run decides, or a fork's approved code-only PR stays pending after the owner command                                                                                                                                                                                                                                                                                                                                                                                 |
| FR16     | `heavy-caps-action.test.mjs` cap cases and heavy-job contract; `ci-admission.test.mjs`                                                                                                        | sixteenth-oldest PR; 101st heavy run of the day, beside cancelled, light and other-branch runs; agent lane and its five-PR and forty-run backstops; an engineering owner, including the shared login past those backstops, a commented-out or trailing-comment handle and an unreadable roster; bot; the deciding run; re-run; failed lookup; a run with room, without room, past its longest wait, beside a waiting `main` check, as a draft or unlabelled fork, with opt-in labels, beside small workflows past their measured most, and with the API unreadable; each workflow's most jobs; every required context's rule; a full queue: the capacity tool and admission agree there is no room                                                                                               | a heavy suite that runs ahead of the author's fifteen oldest PRs, or past the daily cap, a capped job that passes, an engineering owner or a re-run that is held, or a roster read from the pull request's head, a run that starts without room before its longest wait, a pull-request run that starts while `main` has waited under fifteen minutes, a job admission could skip, a peak below the jobs its run holds, or a job on a slim runner planned past its fifteen-minute cap fails                                                                                                                                                                              |
| FR16     | `ci-admission.test.mjs` cases for one start at the longest wait at a time and the workflow contract                                                                                           | a pull-request run at its longest wait alone, within ten minutes of another pull-request run's start there and after them, behind a run that waited longer and ahead of a younger one; another run that found room earlier, a fork's stopped run and a `main` run that waited its longest; a `main` run and a merge-queue entry at their longest wait; the rest of a run whose Storybook build found room; ten runs out of time together; the required contexts and ci-full for either wait; a pull-request run that finds ten others waiting and room only for its Storybook build, and one at its longest wait behind more than ten that waited longer; two waiting `main` dispatches, the older and the younger, and two that began in the same second (each counting the other's peak fails) | two pull-request runs start at their longest wait within ten minutes, a younger run starts ahead of a longer waiter, a `main` run or merge-queue entry stops, a run CI is full for builds, or a required context passes or skips                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| FR16     | `ci-admission.test.mjs` re-run case                                                                                                                                                           | a run stopped for no room; a re-run of its failed jobs; a re-run of the second wait alone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | a re-run of the failed jobs that reuses an earlier attempt's room result or clock                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| FR17     | `ci-pr-gate.test.mjs` over every `pull_request` workflow and the shared conditions                                                                                                            | branch here, fork with and without `ci:run`, another label, draft with the label, ready, push, merge group, dispatch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | a job that can start on a pull request without the condition, a label trigger, a required job that skips for a pull request that may not run CI, or a draft or unlabelled fork that runs fails                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| FR18     | `perf-nightly-workflow.test.mjs`, `perf-trend.test.mjs` and `run-labels.test.mjs`                                                                                                             | nightly and dispatch; labelled, unlabelled, draft and unvouched-fork pull requests; write, read and no access; newest label event; failed lookup; 10% boundary; metric floors; seven-day window edges; fewer than three runs; a metric over once, twice in a row, or a different metric before; recorded and pull request runs                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | a run on an unlabelled pull request, a label honoured from read access, a regression called at exactly 10%, under its floor or on one run alone, a run outside the window in the baseline, a pull request run that records, or a second regression issue fails                                                                                                                                                                                                                                                                                                                                                                                                           |
| FR18     | `overlay-churn-settled` on one commit, five samples per run                                                                                                                                   | medians within 1% between a standard run and a `PERF_CPU_THROTTLE=4` run on the same runner (Chromium's CPU slowed four times)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | interaction-layout medians more than 1% apart fail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| FR18     | `perf-trend.test.mjs` same-CPU cases                                                                                                                                                          | a run on a second CPU model whose timing metrics are about 75% higher on the same commit; a timing regression on one CPU model; a count metric across CPU models; a first run, and a run with no CPU model, with no timing baseline                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | a slower CPU model reported as a regression, a same-CPU timing regression missed, a count metric compared on one CPU model only, or a timing metric with no baseline that passes silently fails                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| FR19     | `ci-impact.test.mjs`, `pr-preview.test.mjs` and the maintenance template                                                                                                                      | CI change and non-CI change; standard, non-standard and expression runners; added, removed and changed jobs; trigger change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | a CI change reports no impact, a move onto a non-standard runner or a pool or time-to-green rise past its threshold goes unflagged, or the section names a price                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| FR20     | `ci-heavy-deferral.test.mjs` over ci.yml, lint.yml and pr-comment.yml                                                                                                                         | agent push; marked ready; opened; reopened; re-run; another author; release branch; merge-back; spec-only change; Lab-only change; a release-check and an opt-in label run, where the decision skips; a failed-jobs re-run of a deferred push                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | a heavy job runs on a deferred push, a required context passes or skips on one, a ready, reopened or re-run pull request defers, a spec-only or Lab-only change defers, the report hides the deferral, or a job below the decision skips because it skipped                                                                                                                                                                                                                                                                                                                                                                                                              |
| FR21     | `ci-heavy-lanes.test.mjs` dispatch cases, `main-unit-run.test.mjs` over deploy.yml, `release-check-receipt.test.mjs`                                                                          | push run; dispatched unit run; tip with the scheduler's or a person's release-check, or a person's maintenance capture; unit run cancelled, skipped or timed out; newer recheck or person's run of the tip; a person's validation of an older commit; cut commit with and without a passing unit run                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | a push runs the unit suites, a push cancels a unit run, a release-check comes without a unit run of its commit, an incomplete run goes unreported or waits a window, or a cut publishes without a passing unit run                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| FR21     | `ci-heavy-lanes.test.mjs` issue-closing cases                                                                                                                                                 | a newest unit run that succeeded with the bot's issue open; a person's issue with the same title; no open issue; a newest run that did not complete; a failed lookup; a named run whose event commit differs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | the bot's issue stays open after a success, a person's issue closes, a call runs with no open issue, the issue closes on an incomplete run, a failed lookup fails the dispatcher, or the comment names the event commit                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| FR22     | `main-validation-workflow.test.mjs` over the Main workflow and its commit resolver; `vitest-shard-sequencer.test.mjs` over the recorded Node times                                            | six UI and six Node legs; dispatch without a commit, with a commit in main's history, with a commit outside it and with a malformed one; a re-check from the workflow token and from a person, and one that names `sha`; a `sha` before the size records, and one of only spaces; four and six Node legs over the recorded suite, a file with no recorded time, a project other than `node`                                                                                                                                                                                                                                                                                                                                                                                                      | a hold, a leg past the fifteen-minute budget, a commit outside main's history that validates, a person's dispatch or a person's `sha` run that cancels or replaces a validation of main, a `sha` lane that checks out another commit, or a `sha` run named for main's tip, or two of the slowest Node files in one leg, a file run by no leg or by two, or a split that depends on collection order fails                                                                                                                                                                                                                                                                |
| FR23     | `release-check-shape.test.mjs`, `a11y-contract-shard.test.mjs` and the release-check workflow contract                                                                                        | release-check and pull-request legs; a contract file longer than a leg's share, one it cannot name exactly, and a serial one; the recorded suite; a re-check from an admin, a maintainer and a writer, from another branch, with a short SHA and with an older commit; failed-only beside a passed, a running and a missing run                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | a narrower release-check, a held or over-budget leg, a test selected by no leg or by two, a re-check that a writer can start, that waits for main's running check, or that re-runs jobs of another commit fails                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| FR24     | `ci-heavy-lanes.test.mjs` cadence cases                                                                                                                                                       | release-check 170 and 176 minutes old; the unit lane hourly beside it; weekday 06:37 Pacific inside the window in standard and daylight time; the pre-cut check already started; the tip already checked; a weekend morning; before 06:30 and after 07:30                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | a release-check starts inside the 175-minute window, the pre-cut check is skipped or starts twice, or it runs on a weekend                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| FR24     | `ci-heavy-lanes.test.mjs` release-evidence cases and `release-check-receipt.test.mjs`                                                                                                         | a pre-cut run on a tip a monitoring check already covered; a monitoring check, a person's release-check, and the two release-evidence runs as cut evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | a pre-cut run skipped because a monitoring check ran; a monitoring check counted as release evidence; or a person's release-check, the pre-cut run or a release re-check refused as cut evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| FR26     | `ci-lab-only-routing.test.mjs`, `change-scope.test.mjs` and `test-scope-action.test.mjs` Lab-only cases                                                                                       | a Lab-only change, with and without a Changeset; a new Lab component with its routes, discovery entry and story; Lab beside core, charts, a core Storybook story, a route or discovery entry for another component, an entry-file diff GitHub leaves out, the docsite, the Sandbox, a workflow, the lockfile, root configuration, internal tooling or a spec record; a rename into or out of Lab; an incomplete list; a base classifier without the lane; each required context, its owners, the UI legs' Lab tests, the UI and Node guard tests, the repository guards, the Storybook build and Lab typecheck, the heavy suites with and without a label, lint and an agent push                                                                                                                | a mixed change takes the Lab-only lane; a new Lab component's own entry files make it mixed, or another component's do not; a changed existing story, a story for a component the change does not carry, or a renamed entry file keeps the lane; the CLI official-packages check, the route-lock check when the lock changed, or the Storybook build does not run for one; a required context skips or fails, or passes without its notice; a Lab test, a guard test, a repository guard, the Lab typecheck or the Storybook build does not run; an unlabelled heavy suite, the docsite or the full typecheck runs, or a label's suite cannot audit Lab; lint is skipped |
| FR26     | `test-scope-action.test.mjs` Lab-only interaction spec case; `ci-interaction-lab-specs.test.mjs`                                                                                              | a Lab-only pull request that edits a Lab interaction spec; one that changes only Lab source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | the first runs no interaction proof or runs specs it did not edit, or the second runs any                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| FR27     | `check-public-text.test.mjs` over the check and the Lint workflow step                                                                                                                        | each identifier shape; a hashed name and host made up in the test; ordinary text; a finding in a commit message, an added line and the description; a match before the merge base; an empty range, a bad sha, a missing commit and a missing digest file                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | a reference passes; the output holds the matched text; a match on the base branch fails a later pull request; an unreadable range passes; the step runs the pull request's own copy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| FR27     | `check-public-text.test.mjs` commit-list cases                                                                                                                                                | a pull request whose merge base resolves too far back in a shallow clone; its own commit with an internal reference                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | the check flags the base branch's commits, or passes the pull request's own reference                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| FR28     | `playwright-legs.test.mjs` creator, prefix and head-repository cases ("decides the WebKit scope only for the release tooling's interaction-check/ pull request"); `ci-webkit-weekly.test.mjs` | release interaction-check PRs: the release tooling's pull request; the same prefix from another author or from a fork; the tooling account on another branch. A release run lists the WebKit subset; a release after a failed or stale weekly run, and a minor release, list the full suite; a reproducing weekly failure blocks the next release                                                                                                                                                                                                                                                                                                                                                                                                                                                | A prefix-only, other-author or fork pull request gets WebKit's release scope, or the tooling's interaction-check pull request does not. A release lists the full suite after a green weekly run under 7 days old, or the subset after a failed, stale or missing one or at a minor release                                                                                                                                                                                                                                                                                                                                                                               |
| FR29     | the contributor CI job's rule tests and its dry-run report                                                                                                                                    | an eligible fork pull request; each condition failing alone (including a conflict with the base and a last push over 30 days old); a second sweep on the same head; a new stable head                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | the eligible pull request does not get `ci:run` once, a single failing condition still adds the label, a second sweep on the same head adds anything, or a new stable head is not labelled                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| FR29     | the contributor CI job's rule tests and its dry-run report                                                                                                                                    | an eligible head when the day's contributor budget is spent; the daily report                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | the head runs before the next day's budget, or the report does not list the minutes used against the budget or flag eligible heads that waited more than 2 days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| FR29     | the contributor CI job's rule tests and its dry-run report                                                                                                                                    | every write the job makes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | the job adds any other label or merges                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| FR29     | the contributor CI job's rule tests and its dry-run report                                                                                                                                    | a manual `ci:run` with a ready toggle on an ineligible pull request                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | it does not run, it is counted against the contributor budget, or the job removes or re-adds it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| FR29     | the contributor CI job's rule tests and its dry-run report                                                                                                                                    | An eligible-but-stale head (over 30 days since the last push)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | it does not appear in the daily report's triage list                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| FR29     | the contributor CI job's rule tests and its dry-run report                                                                                                                                    | the job's own label after its run starts; a later push to that pull request                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | the job removes a label it did not set, keeps its own label after the run starts, or a later push runs CI                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| FR29     | the contributor CI job's rule tests and its dry-run report                                                                                                                                    | A branch in this repository, or a fork pull request that already carries `ci:run`, is never started by the job (CI already runs on its pushes)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | the job starts it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| FR29     | the contributor CI job's rule tests and its dry-run report                                                                                                                                    | A contributor head while a release-check or main-break waiter is queued in the capacity tool, or without room for one more pull-request run under the CI job ceiling, does not start; at most one starts per sweep                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | it starts, or more than one starts in a sweep                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| FR29     | the contributor CI job's rule tests and its dry-run report                                                                                                                                    | Of two eligible heads, the one stable longer starts first                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | the one stable for less time starts first                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| FR30     | `test-scope-action.test.mjs` release-branch cases and the required release-validator contract                                                                                                 | generated outputs only; one test-repair path; mixed or product paths; empty, failed, and truncated file lists                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | a non-generated release candidate gets the narrow lane, uncertainty skips broad CI, or the required release validator disappears                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| FR31     | Chromium interaction selection cases in `playwright-legs.test.mjs` and the CI workflow contract                                                                                               | a change to one component; a component that another component's folder renders; a type-only importer; a changed interaction spec file; a `shared-or-unknown` path; a listed shared primitive; a changed source path in no component folder; a dependency graph that cannot be computed; a release check, a nightly run of `main` and a merge-group entry                                                                                                                                                                                                                                                                                                                                                                                                                                         | a dependent's spec is left out, a type-only importer's spec runs, a shared, unmapped or fail-closed change runs less than the full suite, or a full-suite event is narrowed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| FR31     | `playwright-legs.test.mjs` story-mapping cases and the Chromium selection                                                                                                                     | a story that imports a component; a package-root name no folder in its package holds; a whole-package import; a shared subpath; a removed story; a story whose meta names no id; a spec that opens a story id no story file makes; an inline meta and a data row's title; an unfilled template whose whole prefix could name the story; the `ChatVirtualizer` story; a `TextInput` story change and the spec in `Field` that opens it                                                                                                                                                                                                                                                                                                                                                            | a changed story that runs the full suite when its scope resolves, misses its components' or openers' specs, or adds a shared subpath                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| FR31     | a replay of the `vjeux` lane's spike set: each selective plan against its full run's failures. FR31 gap: the replay validation has no committed record yet                                    | every failure a full run caught in that set                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | a failure that a full run caught is outside the selective plan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| FR32     | workflow contract tests for the `release-specs (changed)` job                                                                                                                                 | an added, a changed, and an unchanged release spec; a changed module a release spec imports; a spec tagged `@pr-a11y release-only`; a changed component a spec visits by story id or sandbox path, and an unresolvable visit; a Lab-only pull request; merge-guard's required-when-triggered check with a missing, skipped, and stale-head result                                                                                                                                                                                                                                                                                                                                                                                                                                                | a changed release spec not run, a skipped or stale result that passes, or a timing miss retried automatically                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

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
The default touched-components check (FR12) is the visual, accessibility and
RTL owners' own pull-request coverage of touched components: its visual part
is `pr-visual`'s default mode, and its advisory accessibility and RTL job feeds
no required context, so it is not a new lane.

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

PR accessibility, when a pull request runs it at its opted-in scope (DEC-7), is
a scoped, fast check: audit only explicitly resolved changed component owners
and retain the fast modal-close, theme-var, and story-play browser guards. The
default touched-components check (FR12) audits the touched components' stories
without the guards, which run with the accessibility owner. Never widen a PR to the exhaustive accessibility sweep because a
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

### DEC-7 — Full visual, accessibility and RTL suites run on main; pull request updates check only touched components

**Reference:** `spec:AST-030/DEC-7`
**Decider:** `cixzhang`, `2026-10-28`
**Superseded in part by:** `spec:AST-030/DEC-11` (main is checked about hourly,
not on every push); `spec:AST-030/DEC-18` (a release re-check cancels the check
running in main's lane); `spec:AST-030/DEC-22` (a touched component's own
accessibility contracts run, and block, on its pull request)

Run the visual, accessibility and RTL owners on every push to `main`, through
the same exact-commit `release-check` the release gate uses, and before a cut;
a pull request runs each at its opted-in scope only when it opts in with that
suite's `ci:run-visual`, `ci:run-a11y` or `ci:run-rtl` label, and otherwise
only the touched-components check (FR12). Main-push checks are throttled: one runs at a time, a
burst of pushes collapses to its newest commit, and a running check is never
cancelled, so every check that starts finishes.
Pull request updates keep the fast checks and every required context, and add
the touched-components check (FR12), which audits only what the change touches,
its visual part in `pr-visual`'s default mode and its accessibility and RTL
parts in one standard-runner job, so each update spends few runner-minutes
while the full
suites stay behind their labels; the
modal-close, theme-var and story-play guards are steps of the accessibility
owner, so they run with it, after merge or on a labelled pull request. A
browser accessibility spec file a pull request adds or modifies, and every
`scoped` or `release-only` spec file a touched component owns, runs in its
own job, in parallel with the unit-test jobs, so a component's own contracts
are checked on its own pull request rather than first on `main`'s release
check; an `audit` spec still first runs on its audit pull request. A failing
contract blocks the merge through the `test` join (DEC-22). A
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
release checks run everything, except where FR13 narrows the Vitest owner for
the interaction harness and the lint plugin, so no landing or release gate
narrows; a pull
request runs the visual, accessibility and RTL owners at their opted-in scope
only with the suite's `ci:run-*` label, and otherwise only the
touched-components check for the components it touches (DEC-7).

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
`spec-owner-approval` stays as the spec-owner job's decision record, which the
other writers read; it is not a required check, so a contributor waits on
`review-required` alone.

Rejected: keeping a separate spec-owner workflow, which split one review state
across two workflows and two visible gates.

### DEC-10 — Runtime performance is a nightly trend on main

**Reference:** `spec:AST-030/DEC-10`
**Decider:** `cixzhang`, `2026-10-31`

Runtime cost (long tasks, forced layouts, interaction latency, what an unmount
leaves behind) shows only in a real browser and drifts in small steps, so one
nightly measurement of fixed scenes on `main`, compared with its own recent
median, finds a regression within two days and names its commit range.
Standard runners differ in CPU model, and a timing metric can double from one
model to another, so timing compares only runs on the same model (FR18). On one
model a runner's speed still varies by about a fifth, more than the threshold,
so a regression counts only when two recorded runs in a row show it. It belongs to no surface's test owner: it reads composites across
components, it judges a trend rather than a pass or fail, and it reports no
required context, so FR11's rule against new lanes inside a surface does not
reach it. The history travels between recorded runs as a workflow artifact, so
the lane needs no write access to the repository's contents. A pull request opts
in with `ci:run-perf` on the same terms as the CI suite labels.

Rejected: measuring on every pull request (noise and runner time for a signal that needs a trend).

### DEC-11 — Main's release-check runs about once an hour

**Reference:** `spec:AST-030/DEC-11`
**Decider:** `cixzhang`
**Superseded in part by:** `spec:AST-030/DEC-19` (every three hours, with a
pre-cut check)

Dispatched on every push, main's release-check ran back to back through busy
hours, about 65 full runs a day of roughly 165 runner-minutes each. A check
covers every merge up to its commit, so one check about an hour keeps every
merge covered with about a third of the runs. A push after a quiet hour is
checked at once; in a burst, the next check starts at most 55 minutes after
the last one, plus up to 15 minutes for the schedule to notice, so a failing
merge is reported within about two hours of landing instead of about one and a
quarter. A release cut dispatches its own exact-commit check, which this does
not affect.

Rejected: waiting for main to be quiet for some minutes (busy hours never go
quiet, so the check would starve); holding a runner to wait out each push (it
is billed while it waits); a daily check (main's result would lag a whole
day).

### DEC-14 — Agent lanes run the heavy suites when ready and before merge

**Reference:** `spec:AST-030/DEC-14`
**Decider:** `cixzhang`

Most pull-request runs come from the shared agent login, and an agent pushes
many times while it works; each push ran every heavy suite on a head that was
replaced minutes later. The heavy suites now run at the two heads that decide
a merge: the one that becomes ready and the one re-run before merge. Between
them lint and typecheck give fast feedback. A deferred required context fails
with its reason rather than passing as skipped, because a skipped required
check counts as passing (FR17's rule), so a deferred head cannot merge.

Rejected: leaving the required contexts pending (a commit status beside the
job's check run of the same name is ambiguous to branch protection); deferring
spec-only changes (their heavy jobs already do nothing, and every push would
then need a re-run to merge).

### DEC-15 — Main's unit suites run about hourly, in full, to completion

**Reference:** `spec:AST-030/DEC-15`
**Decider:** `cixzhang`

Main ran both unit suites after every push, about a hundred full runs a day,
to catch the rare break two pull requests that pass alone make together. One
full run about an hour, beside the release-check of the same commit, catches
that break within about an hour and a half. The run is never scoped, and no push
cancels it; one that does not finish is run again at once and reported, unless
a release re-check replaced it (DEC-18), so every merge is covered by a unit
run that completed. The fast checks that
pull requests rely on, typecheck and the build with its size record, stay on
every push.

Rejected: running the unit suites on main's push cadence with a scope (a
scoped run on main would miss the cross-change break it exists for);
cancelling an older unit run for a newer push (a run that never finishes
covers nothing).

### DEC-17 — Main's full runs spend runner-minutes to finish in minutes

**Reference:** `spec:AST-030/DEC-17`
**Decider:** `cixzhang`, `2026-10-31`

A full check of `main` may cost more runner-minutes if it finishes sooner: the
release train can then fix and re-check within minutes, and pull requests, which
run far more often, carry the per-update cost. A full run starts every
leg at once, with no `max-parallel` hold, on standard runners, and gets as many
legs as shorten its slowest lane. Legs stop growing where one indivisible piece
of work sets the floor, such as the longest test file. Pull requests keep their
shape, which bounds the spend of each update.

Rejected: larger runners for these lanes (measured no faster than the standard
four-core runners); keeping four unit legs, whose slowest leg took about eight
minutes.

### DEC-16 — CI holds itself to about ninety jobs, and main fits first

**Reference:** `spec:AST-030/DEC-16`
**Decider:** `cixzhang`, `2026-10-31`

GitHub offers no repository-wide limit on concurrent jobs: a `concurrency` group
serializes runs and does not count jobs. So every run of the CI and Main
workflows waits at its start until the other active runs' estimated jobs plus
its own fit under ninety. Small workflows that are not admitted (linting, review
bookkeeping, report publishing) always count at least eighteen jobs, so the room
they can take stays free. Over a day's runs they peaked at twenty jobs at once,
and rose by at most fourteen within two minutes in ninety-nine looks of a
hundred (seventeen at most), so a margin over the jobs they run at a look would
not hold the ceiling, and eighteen covers all but the rarest rises without
lengthening every run's wait. Each CI or Main run counts its live jobs: a
pull-request run still waiting counts the jobs it runs, the job that waits and a
Storybook build that found room, so waiting runs hold each other back by no more
than they use, and a run admitted in the last forty-five seconds, before its
jobs appear, counts at least its planned most. A run GitHub still lists as
active but has not updated in two hours holds no runner and counts nothing. A
look reads the active runs and each CI or Main run's jobs once, so it costs two
run listings plus one call per active CI or Main run. A pull request spends at
most two looks, at once and after twelve minutes; a look that finds it within
ten jobs of room spends none, and the next comes four minutes later, so a nearly
full CI admits it within minutes of the room freeing. A run starts rather than
spend a low API budget. A `main` full check, release re-check or baseline
capture (every dispatch of the CI workflow) goes first: while one waits,
pull-request runs wait too, their Storybook builds included. A pull-request run
that would fit and waits only for a `main` check looks again every two minutes
until it starts. It yields that way only during the `main` check's first fifteen minutes of waiting. A longer `main` wait still counts its whole peak, so a pull-request run starts only when it fits beside that peak. While `main` waits, the pull-request runs that do not fit start one per ten minutes at their longest wait and the rest stop with "CI is full", for up to the two-hour wait. The extra looks happen only while
CI is near full or `main` waits. Every pull-request job ends within its
fifteen-minute budget, so `main` usually fits within fifteen minutes. A `main`
run still waits until there is room, up to two hours, and its waiting job runs
on a standard runner: a slim runner stops a job at fifteen minutes and so cancels the whole run. Waiting
`main` runs queue by when they began waiting, both read on GitHub's clock and a
tie going to the lower run id: to a `main` run, another that began waiting after
it counts only its waiting job, so of two waiting `main` runs exactly one counts
the other's peak. Nothing is
reserved for `main` outside its wait. A pull-request run that finds no room
waits like the others, on its slim runner, until its longest wait: a waiting slim
job costs less than a stopped run that someone has to start again. A
pull-request run still without room at its longest wait looks once more, at a
cost of one more look plus one call for its own jobs, and starts only if no
other pull-request run started at its longest wait in the last ten minutes,
about the time one run takes, and no run that waited longer still waits;
otherwise it stops the same way. A run counts as started there once its
admission job succeeded, and any run that waited out about its whole longest
wait counts, room on its last look or not; until then it ranks as a waiter. Runs that wait out the same burst then start
one at a time instead of together. A `main` run is never stopped.

CI can still pass ninety in five bounded ways, the first three rare:

- A run that has waited its longest (two hours for `main`, twelve minutes for
  a pull request) starts whatever the load, even while a `main` check waits, at
  most one pull-request run in ten minutes. That happens when a job outlives
  its budget, such as the thirty-minute macOS Swift job, or when a `main` check
  held the waiting runs until their longest waits; CI is over by at most one
  pull-request run's jobs, and each `main` run's, until they end.
- Runs that look within the same few seconds can each see room. A random
  0–20 s on every later look spreads them, and the excess is at most one run's
  jobs until its next look.
- A run starts when the GitHub API cannot be read, a rate limit included. It is
  over by at most its own jobs.
- A waiting run's own waiting job starts before it finds room; its Storybook
  build starts only once there is room for it. CI is over by at most one
  waiting job per waiting run, pull requests, merge-queue entries and `main`
  runs alike, with no limit on how many wait, for at most a wait (twelve
  minutes for a pull request, two hours for `main`).
- Small workflows can run more jobs at once than the eighteen counted for them:
  they peaked at twenty in a day's runs, two over, while their jobs ran.

Rejected: a fixed reserve for `main` (it left about half the ceiling idle and
stalled the pull-request queue); starting `main`'s checks at once (a burst would
pass ninety); a check in every job (it spent the shared API budget); admitting
the small workflows too (one or two slim jobs a run do not repay two API calls
each).

### DEC-18 — A release re-check takes main's lanes

**Reference:** `spec:AST-030/DEC-18`
**Decider:** `cixzhang`, `2026-10-31`

`main` holds one full release-check and one full unit run at a time. A release
re-check uses the same lanes and cancels whatever is running there instead of
waiting behind it. It checks `main`'s tip in full, so the cancelled run's
commits stay covered, and the release owner waits only for the re-check itself.
Re-running only failed jobs is allowed at the same commit, because that run's
passing jobs already checked it. This narrows DEC-7's never-cancel rule to every
check other than a release re-check.

Rejected: a separate lane for re-checks (`main` would run two full checks at
once and need room for both); re-running only failed legs after a fix (a fix can
break a leg that passed before).

### DEC-19 — Main's release-check every three hours, with a pre-cut run

**Reference:** `spec:AST-030/DEC-19`
**Decider:** `cixzhang`

Main's visual, accessibility and RTL check is its longest run. Checked about
hourly, it still ran about twenty times a day, though a check covers every
merge before it and the guardian repairs `main` forward. Every three hours
keeps every merge covered with about a third of the runs. The weekday cut
needs a fresh check, so one starts at about 06:30 Pacific and finishes about
an hour before the 08:00 cut. A visual, accessibility or RTL break is then
reported within about three and a half hours of landing. The full unit run
keeps its own hourly schedule (FR21).

Rejected: a check only at the cut (main's result would lag a whole day);
keeping it hourly (the run is the largest share of main's runner use).

### DEC-21 — A Lab-only change runs only what checks Lab

**Reference:** `spec:AST-030/DEC-21`
**Decider:** `cixzhang`, `2026-11-01`

The Lab package is published only to npm's `canary` dist-tag, never as a
stable release, so no user of a stable release can be affected by a Lab
change, and its changes merge without the spec gates. The
decider's words: "Lab can just merge since its not shipped"; "Lab could
likely skip a lot of CI"; "LAb-only updates at least. Maybe it only runs the
lab tests"; "Theymight need storybook". A Lab-only pull request therefore
runs the Lab tests and the Storybook build, which holds Lab's stories and the
pull request's preview.

The repository-wide guards, the source-reading guard tests and the Lab
typecheck are an addition to those words. The guards and guard tests read the
whole repository on every pull request, and the full typecheck checks Lab's
tests, docs and stories, so a Lab change that broke one would turn every later
pull request red until `main` was repaired. They cost about half of what the
lane would otherwise save.

The docsite and the Sandbox import Lab, and their checks do not run on a
Lab-only pull request; the CLI's tests that load Lab or read its files run
with the guard tests. A Lab change that breaks the docsite or Sandbox build
shows as a failing preview deployment on its own pull request and on `main`'s
production deployment. One that breaks a docsite test fails only the next
pull request's `docsite-test`: `main` runs no docsite tests. A Lab break that
lands also reaches the `canary` dist-tag until the next canary
replaces it. That is the accepted cost: about one pull-request run in a
hundred is Lab-only, and each skips most of a full run's work.

Rejected: keeping full CI for Lab (it spends shipped-surface checks on a
package no stable release includes); Lab tests alone, without the
repository-wide guards (a landed guard break blocks everyone else's pull
requests); counting a story under `apps/storybook/stories/` as Lab-only by its
path alone (stories share the visual surface, and a path cannot tell a Lab
story from a core one). FR26 admits only a carried Lab component's new story,
and only after the trusted classifier reads the story's patch text as data
(FR3).

### DEC-22 — A touched component's own accessibility contracts run, and block, on its pull request

**Reference:** `spec:AST-030/DEC-22`
**Decider:** `cixzhang`, `2026-11-02`

A Switch change merged with every required check green while its own
aborted-press contract failed: a press released away from the switch still
turned it on (WCAG 2.5.2). The contract was `release-only`, so no pull request
ran it. Main's release check found the failure, and the release waited for a
fix-forward. About fifty spec files across about thirty components are
`release-only`, so no pull request runs them.

The decider chose to run each touched component's own `scoped` and
`release-only` contracts on its pull request, and to let a failure block the
merge, on one condition: the work runs in parallel with the tests, so the time
to green does not grow. One contract job therefore runs them, with the spec
files the change edits, in parallel with the unit-test jobs: it needs only the
Storybook build, stops after eight minutes, and finishes before the slowest
unit-test job. The required `test` check waits on it, so a failure blocks the
merge and no new required name appears.

The result reports what happened. A file that the budget or a limit leaves out
is "not run" in the check's summary and annotations, with the label that runs
it, and is never split; it never reads as a pass and never fails the join. Shared modules keep their scope (DEC-23 covers wide changes and the folders
that render a touched component), `audit` bindings
still first run on their audit pull request, and the release check still runs
every contract.

Rejected: an advisory result (a red advisory check does not stop a merge when
the required checks are green, so it would not have stopped the Switch change);
release-check-only owned contracts (each miss holds a release until a
fix-forward lands).

### DEC-23 — The contract job also runs for a wide change, and for the folders that render a touched component

**Reference:** `spec:AST-030/DEC-23`
**Decider:** chief of staff with the release owner, `2026-11-05`
**Superseded in part by:** `spec:AST-030/DEC-25` (a changed component runs its
own `audit` specs, and a shared primitive's change runs the `audit` specs of
the components that use it)

A wide refactor that changed Spinner's behavior (its role and its shared
announcement, across eight components) merged without Spinner's own motion
contract running: a wide change ran only the spec files it edited. A consumer's
contract that rendered the changed Spinner did not run either. Main's release
check found both failures, and the release waited a day for fix-forwards.

The decider chose, for the contract job only, to run each touched component's
own `scoped` and `release-only` contracts for a wide change too, and then, in
the time left, those of the component folders that render a touched component
through their source value imports, nearest first, for at most one minute.
The job keeps its eight-minute budget, so a wide change cannot make it slower
or the critical path; each file that does not fit is reported as not run with
the label that runs it. The one-minute share holds the added runner time to about 360 minutes a day: the owned contracts are the proven catch, and the
rendering folders' share widens only if it catches failures the owned
contracts miss. The default touched-components check keeps its wide-change skip, and
unchanged `audit` and `always` specs still do not run on a pull request, except
a changed component's own audits and the dependent audits of a shared primitive
(DEC-25).

Rejected: dropping the five-component limit for every audit (the visual,
accessibility and RTL audits of a wide change do not fit the default check's
time).

### DEC-24 — Release WebKit runs the touch and gesture subset, with a weekly full run

**Reference:** `spec:AST-030/DEC-24`
**Decider:** the Chief with the release owner, `2026-11-06`

A release runs WebKit's touch and gesture subset, the same subset a pull
request runs. WebKit's full interaction suite runs weekly on main. A release
runs the full WebKit suite instead when the last full weekly run failed or is
more than 7 days old (age is the time since the last green full run completed
at a recorded commit on main), and every minor release (for example 0.8.0)
runs it at its exact commit. A reproducing failure in a weekly full run blocks
the next release until it is fixed forward. The visual, accessibility and
right-to-left release gates are unchanged.

A release interaction check's throwaway pull request (FR28) qualifies only
when its head branch starts with `interaction-check/`, the release tooling's
account opened it, and its head repository is this repository. Such pull
requests stay non-mergeable, and the rule widens the scope of no other pull
request.

Rejected: any pull request on the prefix (a prefix alone is spoofable).

Amended 2026-11-08 by the chief of staff with CI & Release and the release
owner: per-release WebKit runs the touch and gesture subset; the full suite
moves to a weekly run on main, with the fallbacks above. CI & Release reviews
escaped WebKit defects on 2026-12-06.

### DEC-25 — A shared primitive's change runs its dependents' audits

**Reference:** `spec:AST-030/DEC-25`
**Decider:** the chief of staff with CI & Release, `2026-11-07`

A change to shared Button's disabled state passed every pull-request check and
then failed the release check in a Chat component's `audit` spec, which no
pull request runs. A change to a shared primitive that
`.github/a11y-shared-primitives.json` lists now runs the `audit` specs of the
components that use it, on every pull-request CI run that includes the
change, in at most three legs of about ten minutes each (FR12). The list starts
with Button and IconButton. A Button change runs about 20 audit spec files in
two legs of about five minutes each, about 11 runner-minutes a run. The legs
start after the Storybook build and end before the slowest unit-test job, so
the time until the required `test` join reports does not grow. Pull-request runs are
every run a merge rests on: the merge queue has not run since 2026-03-04, and
a merge rests on the pull request's own run at its exact head. Layer,
which nearly every audited component uses, joins only when a Layer change
breaks the release check or a dependent audit at release.

Extended 2026-11-07 (19:40) by the chief of staff with CI & Release: a
component's own audits join the leg. A first run fits what it can into the same
three legs and lists the rest by name; a later run at the same head runs every
owed audit, and merge-guard merges only on a run that ran them all.

Rejected: running the audits only when the pull request is marked ready and on
a re-run (a push after ready merges without them); every audit spec on every
Layer change (about 37 minutes of recorded time on a change that lands about
four times a day).

### DEC-26 — A stable contribution runs CI from a contributor budget

**Reference:** `spec:AST-030/DEC-26`
**Decider:** `cixzhang`, `2026-11-09`

The owner asked for "some system that will activate ci:run on contribution PRs that are stable", "Or we have some contrib lane that runs off a budget", and "plus ci:run to override?" (FR29). She approved the budget with "Ok 600": The owner set the budget at 600 runner-minutes per UTC day; unused minutes don't carry over.

### DEC-27 — A release test repair runs every ordinary pull-request lane

**Reference:** `spec:AST-030/DEC-27`
**Decider:** the Chief with the release owner, `2026-11-09`

The generated release pull request is the only release-branch change that gets
its narrow bookkeeping lane. A later test-repair candidate runs broad CI while
the trusted release validator proves the narrower admission rule (FR30 and
`spec:AST-017/FR61`). This makes a green required check evidence of the amended
rule, not a skipped or manually overridden check.

Rejected: treating every release-branch pull request as generated, or letting
the head branch choose its own scope or validator.

### DEC-28 — The Chromium interaction lane runs selectively

**Reference:** `spec:AST-030/DEC-28`
**Decider:** Chief of staff (delegated CI authority), `2026-11-09`

The chief ruling 11/09 22:24 makes the Chromium interaction lane run the specs
of the changed and touched components and their dependents on a pull request
(FR31), because a full interaction run on every pull request spends runner
time and time to green on specs the change cannot reach, while shared code,
release checks and a nightly run of `main` keep the full suite.

Rejected: running the full interaction suite on every pull request.

Amended by the same delegated authority (chief ruling 11/09 22:24, refined 11/09 23:19): a component folder's unit tests, docs and accessibility specs select nothing for the interaction lanes unless an interaction spec or proof page imports them.

### DEC-29 — A changed release spec runs in full on its pull request

**Reference:** `spec:AST-030/DEC-29`
**Decider:** Chief of staff (delegated CI authority), `2026-11-10`

A pull request that adds or changes a release spec runs it in full, alone, on `4-core-ubuntu` (FR32). This extends DEC-28's
rule that a changed spec always runs to release specs, because FR12's
contract plan can drop a changed release spec as not run, so the spec first
runs at a release check after it merged. Running alone on `4-core-ubuntu`, the runner class whose release-check timings gate, keeps other specs' load out of its timings; a spec whose record needs the same isolation in the release check names it there.

Rejected: keeping changed release specs inside the contract plan (it can drop
them), and running them only at release checks (a broken release spec then
reaches `main`).

Amended by the same delegated authority (chief ruling 11/10 10:09): FR32
also covers specs tagged `@pr-a11y release-only` and runs a release spec when
a pull request changes a component it visits, because a release spec that
renders a component through a page imports none of it; a visit that cannot be
resolved runs the spec.

## Open questions

None.
