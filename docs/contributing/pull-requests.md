# Pull requests: one primary intent

A pull request should make one reviewable change for one reason. Choose the template that matches its primary intent; supporting tests and docs belong with that intent, but unrelated API, visual, layout, behavior, or policy changes do not.

GitHub uses the default template automatically. To choose another, add `?template=<file>.md` to the new-pull-request URL, or copy the matching file from `.github/PULL_REQUEST_TEMPLATE/` into the description.

Any pull request that creates or changes a knowledge record — a `docs/specs/<id>/spec.md`, a family, design, theme, or architecture record, or a component or module record under `docs/specs/components/` — reports the results of the rubric in [Writing specification records](spec-writing.md) in its description, whichever template it uses. `specification.md` carries the `## Writing rubric results` section; copy it into another template when that pull request also touches a record.

| Primary intent                                       | Template           | Minimum evidence                                                                                                                 |
| ---------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Restore broken behavior                              | `bug-fix.md`       | reproduction, expected authority, before/after result, unchanged representative path                                             |
| Correct or intentionally change appearance           | `visual-update.md` | current visual authority or owner decision, real-browser before/after pixels, relevant state matrix                              |
| Add a capability                                     | `new-feature.md`   | user need, current specification, complete public delta, behavior and compatibility evidence                                     |
| Correct contributor or consumer documentation        | `documentation.md` | reader impact, source of truth, rendered or generated result                                                                     |
| Record a durable decision                            | `specification.md` | exact unresolved claim, existing authority searched, decision, rejected alternatives, explicit non-goals, writing rubric results |
| Change tooling, tests, CI, or repository maintenance | `maintenance.md`   | operational problem, failure proof, success proof, unchanged product behavior                                                    |
| Anything else                                        | `other.md`         | primary intent, user or maintainer impact, authority, evidence                                                                   |

## Explain only what authority does not already say

The pull request and current records are the first source for context. Do not copy
them into another summary. Fill only what is missing:

- Trace the problem through three why questions: why it occurs, why it harms the
  affected task, and why that harm matters.
- Map the proposed solution and every primary or supporting delta back to that
  problem. Remove or split a tagalong that does not clearly contribute.
- State who is affected, in what supported state, and what behavior the change
  enables or prevents.
- When public API changes, show representative before and after callsites,
  defaults and compatibility, and every additional decision the caller must make.

These explanations help reviewers apply current authority; they do not create it.
Product behavior remains owned by the applicable current component, module,
family, design, theme, architecture, or system record. API caller burden follows
`spec:AST-002`.

Reviews also load any `current` cross-cutting claims whose machine-readable global
route matches the change's semantic triggers. The direct component, module, or
family owner still resolves the exact delta first; a global route contributes only
its listed claim and never grants authority to the rest of that record. Review
receipts identify the matched record, claim, trigger, and reason.

## Keep the intent atomic

Before requesting review, partition every observable delta:

- **Primary:** the reason this pull request exists.
- **Supporting:** evidence or documentation required to make the primary change complete.
- **Tagalong:** independently removable behavior, visual, API, layout, policy, or cleanup.

Remove or split tagalongs. A bug fix does not become a feature because a nearby affordance could also improve. A feature does not absorb unrelated cleanup because the same file is open.

## Reviews contract scope; they do not expand it

The opening primary intent sets the scope ceiling. The first submitted
implementation is a baseline for detecting later review-driven growth, not approval
for its tagalongs. A review request may make that intent correct and safe, require
evidence it needs, or remove/split a delta already in the pull request. It must not make a narrow
change absorb adjacent policy, migrations, sibling conformance, new API, or cleanup
merely because review discovered them.

If an earlier review caused the pull request to grow, the next pass should unwind or
split those additions rather than treating them as the new primary intent. Broader
work stays only when the original change cannot be correct or safe without it; then
request the smallest safe correction or a narrower mechanism.

## Use specifications last, not first

Review should produce the smallest ideal change that can land:

1. Apply current component, module, family, design, theme, architecture, and system authority to each delta.
2. If a delta violates current authority, conform or remove it. Do not propose changing the specification merely to rescue the implementation.
3. If a delta is unsettled but separable, remove or split it and keep reviewing the primary intent, except an undeclared public API row, which goes to human review for an owner's decision rather than being removed or split (`architecture:knowledge-contracts` change coupling step 6).
4. Propose a specification only for a surviving, intentional durable decision the team wants to pursue.

A current record governs only its explicit claims inside its ownership boundary. It does not imply that the whole named component or module is fully specified.

## Visual corrections

A visual change does not automatically need a new specification. It may proceed as a correction when current component, family, design, theme, or objective accessibility authority already settles the exact outcome. Show that authority and verify the affected state with real-browser pixels, plus representative unchanged states.

For routine component-local or module-local intent, cite and reuse an existing
`DD` row when one applies. A team DESIGNOWNER may amend or add the optional
`Design decisions` table in the component/module spec in the same atomic
appearance-only pull request as the pixels and evidence. Add a row only for
stable intent a future redesign must reconsider; exact pixel tuning stays in
code and evidence, and shared or cross-component rules stay in `docs/design/`.

External contributors keep the normal contribution flow and are never asked to
author specifications. If authority is missing, a maintainer records the owner
ruling. A human request supplies intent, but it becomes current committed
authority only after an owner approves its content.

A new visual representation, subjective direction, or interaction model remains a design decision. Put a shared decision in its own design specification; keep a durable component-local decision in the owning component/module table.

## Review evidence

[Knowledge contracts: review evidence placement](../architecture/knowledge-contracts.md#review-evidence-placement)
owns where one-off evidence lives and how cleanup preserves historical links.
Attach manual screenshots and their receipts to the pull request, or link a
public retained copy outside the implementation branch. Keep reusable fixtures,
accepted baselines, and media used by public documentation in their owning source
paths. Evidence storage does not relax the matching template's evidence bar.

## Review your change before you ask for review

Review reads each pull request against the current records and the checklist
below. Run the same pass first. Each finding you fix before review saves a
review round.

### Run the pre-review report

```bash
pnpm review:pre                       # the working tree against origin/main
pnpm review:pre --base upstream/main  # a fork whose main remote is upstream
pnpm review:pre --head HEAD           # committed work only
pnpm review:pre --json                # the same report as JSON
pnpm review:pre --body-file body.md   # also read the description for item h
pnpm review:pre --pr 1234             # read the description with gh
```

The report reads only the local repository, and the description when you pass
one. It prints:

- each changed file and its class: record, owner-gated record, API report,
  published package code, other package file, Lab, or repository;
- the current records that govern those files, and the claims that the files
  cite or that the added lines route;
- the global baseline claims that the linked components' review triggers route,
  read at the merge base;
- the authored line count, and whether the change merges into the base;
- the findings for items h to l, each with its file and line, the rule, and
  the fix;
- the checklist items that apply to this change, each with its reason.

The report is a lookup. The records decide acceptance, not the report. A
finding is a lead to check, not a verdict.

### Find the governing records by hand

| Command                                                                                                            | What it answers                                                                           |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `pnpm specs:for <path>`                                                                                            | The records linked to one path, the specs that decided them, and the routed global claims |
| `pnpm specs:for --diff origin/main`                                                                                | The same for every changed file, with the claims that the added lines route first         |
| `node scripts/review-global-baselines.mjs --authority-commit <base-sha> --review-head <head-sha> --triggers <a,b>` | The current global claims for the review triggers, read at the merge base                 |
| `pnpm check:knowledge`                                                                                             | Whether records and templates are valid after you edit one                                |
| `git diff --name-only origin/main... \| node .github/scripts/change-scope.cjs --classify-paths`                    | Which changed paths are spec records, and which need a spec owner's approval              |

### Pre-review checklist

First apply the protocol above: one primary intent, no tagalongs, and
specifications last. Then check each item that the report lists. Item d applies
to every pull request. The report checks items h to l automatically and lists
each finding at its file and line.

- **a. API delta.** A current record decides each added or changed row of a
  package's `api-report.md`. The record is current at the merge base or changes
  in the same pull request. After a public API change, run `pnpm api:report`
  and commit the report. A row that no record decides goes to an owner for a
  decision; review does not ask you to remove it
  ([`architecture:public-component-api`](../architecture/public-component-api.md#boundaries-and-invariants)
  INV24 and INV25).
- **b. Behavior.** Each observable behavior change in a published package
  cites the current record and clause that settle it. If nothing changes
  behavior, write "No behavior change" in the description. A clause settles
  only what its text states. A clause that only names a prop, key, or slot, or
  a general baseline such as a WCAG level, does not settle the wording, default,
  fallback, or result that ships. Catalogs, Changesets, stories, and comments
  are not records. An unsettled behavior goes to an owner. Lab is not a stable
  public promise, so a Lab-only change skips this item
  ([Authority](../../AGENTS.md#authority);
  [`architecture:knowledge-contracts` contract before escalation](../architecture/knowledge-contracts.md#contract-before-escalation)).
- **c. Behavior props.** A prop that chooses how a component responds to input
  is named `<thing>Behavior` and takes a closed union of behavior names. Its
  name holds no input word (press, touch, tap, hover, mouse, click) when its
  values can name the behavior. One behavior is one prop. When the behavior
  differs by device, the prop offers `'adaptive'` or `'adaptive-<target>'`. A
  new behavior prop defaults to the shipped behavior. An `is…` or `has…`
  boolean names only a true on/off
  ([`architecture:public-component-api`](../architecture/public-component-api.md#boundaries-and-invariants)
  INV2 and INV3).
- **d. Public boundary.** No internal or private context in source, tests,
  fixtures, Changesets, commit messages, branch names, or pull request text
  ([Public repository boundary](#public-repository-boundary)).
- **e. New public hook.** Each public hook has a minimal, runnable example: a
  live template block that names the hook in `exampleFor` or `alsoExampleFor`.
  A public hook is a hook that a package's API report lists, so a new Hooks row
  or a new export from a published entry point makes one. Motion and gesture
  hooks count. A public hook without a conforming example is a docs gap that an
  issue tracks
  ([`architecture:knowledge-contracts`](../architecture/knowledge-contracts.md#consumer-docs)
  INV28 and DEC-16).
- **f. Comments.** New or changed comments in `packages/*/src/**`, Lab
  included, explain only a reason, a constraint, an invariant, or a platform
  quirk. They do not narrate the code, restate names, or cite pull requests,
  issues, dates, or records. They follow ASD-STE100 Simplified Technical
  English: at most 20 words in an instruction and 25 in a description, one
  topic per sentence, and active voice. A file header stays within about 12
  lines
  ([`architecture:knowledge-contracts`](../architecture/knowledge-contracts.md#source-comments)
  INV29).
- **g. Records.** A change to an owner-gated path waits on `review-required`
  until a spec owner approves its spec content, with `/approve-spec <sha>` or an
  approving review. Base merges, rebases, and commits to other paths keep that
  approval. A later change to the approved spec text resets it
  ([`architecture:knowledge-contracts`](../architecture/knowledge-contracts.md#dec-14--one-owner-approval-binds-a-pull-requests-spec-content)
  DEC-14). The description also reports `## Writing rubric results`
  ([Writing specification records](spec-writing.md)).
- **h. Size (automatic).** More than 2,000 authored lines, without lockfiles,
  snapshots, or generated files, is a finding. A description line that declares
  a behavior-module pull request and names the module (`Behavior module: <name>`)
  removes the limit. A `Batch:` row raises it to 8,000. For a stacked pull
  request, pass `--base` the branch below it, so the count covers only its own
  lines.
- **i. Shared owners (automatic).** In Core source, an added resize observer,
  document or window listener, module-level warn-once set, or parent walk
  across shadow roots is a finding: call `observeResize`,
  `subscribeInput`, `useDevWarning`, or `parentAcrossShadow`
  ([`architecture:react-component-runtime`](../architecture/react-component-runtime.md#boundaries-and-invariants)
  INV16).
- **j. Effects (automatic).** An added Effect with no comment that names the
  system it syncs, an Effect that only copies a value into a ref, and a DOM node
  in React state are findings
  ([`architecture:react-component-runtime`](../architecture/react-component-runtime.md#boundaries-and-invariants)
  INV1 and INV3).
- **k. Release notes and records (automatic).** A package that ships a change
  with no Changeset, a `[fix]`, `[feat]`, or `[perf]` Changeset for a package
  where nothing that ships changes, such as a change to tests or tooling only,
  and a gap row left in a record for a claim this change builds are findings.
- **l. Mergeable (automatic).** A conflict with the base branch is a finding.
  For the working tree, the check merges the last commit. It writes nothing to
  the repository.

### Use a fresh session for an agent's change

The author of a change reads intent into it. A reviewer reads only the diff.
When an agent wrote the change:

1. Start a new agent session that has no memory of writing the change. Check
   out the pull request branch.
2. Run `pnpm review:pre`.
3. Read every record and claim that the report lists.
4. Apply the protocol above and each listed checklist item to the diff.
5. Fix each finding, or split it out. Run `pnpm review:pre` again.
6. Request review when no finding is left.

## Public repository boundary

Descriptions, screenshots, commits, tests, and specification records are public. Do not include internal links, identifiers, hostnames, tools, or operational context.
