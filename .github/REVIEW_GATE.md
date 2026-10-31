# Review gate

How pull requests are gated for review in this repo. The goal: **let the team
move fast in their own domain, require review where risk or unfamiliarity
warrants it, and keep the PR queue readable** (a PR awaiting review shows a
neutral yellow "waiting" signal, not a red failure).

## TL;DR

| Author                            | High-risk code    | Design-affecting change          | Everything else   |
| --------------------------------- | ----------------- | -------------------------------- | ----------------- |
| **Eng owner** (`ENGOWNERS`)       | self-serve        | advisory label only              | self-serve        |
| **Design owner** (`DESIGNOWNERS`) | needs code review | self-serve                       | self-serve        |
| **Contributor** (anyone else)     | needs code review | needs code review + design label | needs code review |
| **Bot** (Dependabot, etc.)        | exempt            | exempt                           | exempt            |

- **Code review is the only hard gate.** It shows up as the `review-required`
  status: `pending` (🟡, blocks the merge) or `success` (🟢).
- **Design review is advisory** — it labels the PR and requests design owners,
  but does not block the merge.
- An entitled owner's **approval clears the gate automatically** (no manual step).
- **Write-access authors can also clear it with the review app.** When the PR
  author has write or admin permission on the repository (internal
  contributors, including designers and partners who are not owners), the
  latest approval from the review app named in the `REVIEW_APP` repository
  variable on the exact current head clears the gate. A later request for
  changes or dismissal from the app, a new commit, or an engineering owner's
  request for changes on that head makes it pending again. Authors without write
  access, including fork contributors, still need an engineering owner's
  approval. If `REVIEW_APP` is unset or the permission cannot be read, the app's
  reviews have no effect.

## Spec records

Any PR that creates, changes, or archives a `current` architecture, component,
family, design, or system spec needs a spec owner's approval of its content
(`architecture:knowledge-contracts` DEC-14), which `review-required` carries
after code review: `pending`, never red, with `⏳ Waiting for human spec
approval: …` naming who can approve. ENGOWNERS approve every record kind;
design and theme records also accept DESIGNOWNERS. Approve with
`/approve-spec <full-sha>` at the start of a comment (the trigger matches the
raw body) or a non-author review; `/revoke-spec` withdraws. The gate's details
give the command to copy and why an approval no longer counts; it posts no
comments. `spec-owner-approval` mirrors the spec half.

The gate never re-decides a merged or closed head. A run that starts after the
merge publishes nothing, and neither does a run yielding to a newer one.
GitHub has no conditional status write, so the window between the last read and
the write cannot be closed; the gate makes it one API call wide by reading the
live pull request last, and if a status still lands on a head that settled
during that window, the run logs the status as unverified.

The gate decides approval only; it never enables auto-merge.

A PR changes only spec records when every changed path is one of:

- `docs/specs/<id>/spec.md` or `plan.md`;
- a family or design spec (excluding indexes, templates, schemas, and assets);
- a colocated Core/Lab `<Name>.spec.md`.

Draft-only spec records can merge after validation without owner approval.
Approval reads the record against the `## Writing rubric results` the author
reports in the pull request description (`docs/contributing/spec-writing.md`);
a record pull request without them is incomplete. That is a review convention,
not a status this gate publishes.
Pure spec-record PRs do not add Changesets because they do not release packages;
CI rejects a PR containing only spec records and `.changeset` entries.
That classification fails closed on an empty or truncated file list and checks
both sides of a rename. Pure spec-record PRs run knowledge validation, skip
runtime/build/visual work with successful required-status acknowledgements.
Mixed code/spec changes keep full CI.

## Sources of truth

| File                             | Meaning                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `.github/ENGOWNERS`              | Engineering team. Self-serve **code** and approve every spec kind.                                                                   |
| `.github/DESIGNOWNERS`           | Design team. Self-serve **design** and approve visual specs. Checked first.                                                          |
| `.github/CODEOWNERS` (`*` line)  | Who can **clear** the code gate (and native review requirement).                                                                     |
| `REVIEW_APP` repository variable | The review app (exact `name[bot]` login) whose exact-head approval clears the code gate for write-access authors. Unset disables it. |

Author bucket is resolved in order: **design owner → eng owner → contributor.**
A handle in `DESIGNOWNERS` is treated as a design owner even if also an eng
owner. Anyone in neither file is a contributor (and gets a quiet `community`
label so the contribution queue is filterable).

## What counts as high-risk / design-affecting

Detection is **deterministic** (no LLM in the enforcement path): code detection
is path-based; design detection combines paths with a deterministic score over
the diff content (`.github/scripts/lib/classify-visual.js`), because most
component styling is an inline `stylex.create` edit in a `.tsx` that no path
pattern can see. `packages/lab/**` is filtered out entirely first — lab is
canary staging, so new components there are expected and never gate.

**High-risk code** (drives the code gate):

- a new package (`packages/<name>/package.json` added)
- a new component/module in a published `src/` (not lab)
- a runtime change under `packages/core/src/**` (incl. styling `.tsx`; excludes
  tests/docs/stories) — core has high blast radius
- a public API surface change (a `src/**/index.ts(x)` barrel or a
  `package.json`)
- **plus:** _any_ PR from a contributor (see policy note below)

**Design-affecting** (drives the advisory design label):

- StyleX styling, theme/token files, template `.tsx`, docsite visual dirs
  (`app`/`components`/`themes`)

**Safe spaces** (never gate): `sandbox`, `storybook`, `lab`.
**Design spaces** (advisory, not blocking): `themes`, `templates`, `docsite`.

## Policy note — contributors

All contributor (non-owner) PRs require code review, not just high-risk ones.
External contributors can't self-merge anyway; this mainly ensures a human on
internal contributors' PRs. Owners still self-serve their own domain.

## The mechanism (two workflows)

```
① PR opened / updated  ──pull_request_target──►  review-signal.yml : flag
     bot? → status success, exempt, stop
     resolve author bucket (DESIGNOWNERS → ENGOWNERS → contributor)
     detect high-risk / design from changed paths (lab filtered out)
     read reviews → codeApproved / designApproved
       (code: ENGOWNER approval, or REVIEW_APP's latest exact-head
        verdict approving when the author has write/admin permission)
     effective gate = detected/contributor gate AND NOT owner AND NOT approved
       → labels: needs:code-review · needs:design-review (advisory) · community
       → request reviewers: CODEOWNERS (code) · DESIGNOWNERS (design)
       → if code-gated: disable auto-merge
       → set commit status "review-required": pending 🟡 (blocks) | success 🟢
       → neutralize any stale action_required "review-required" check run

② approval  ──pull_request_review──►  review-signal runs a tiny "anchor" job
     so the workflow COMPLETES, which fires:
   ┌─────────────────────────────────────────────┐
   │ review-clear.yml  (workflow_run, base token) │  ← works for fork PRs
   └─────────────────────────────────────────────┘
     resolve the PR by the run's head_branch (head_sha points at main here)
     entitled CODEOWNER approved, or REVIEW_APP approved a write-access author?
       → drop needs:code-review · status → success 🟢 · neutralize stale check
     effective changes requested / dismissed (owner, or the app for a
     write-access author), or an app-cleared gate no longer qualifies?
       → status → pending 🟡 · restore needs:code-review

③ branch protection on main
     required status context "review-required": pending blocks, success allows
     ⇒ blocks non-admin merges until the status is success
```

## Enforcement

`review-required` is a **required status check** on `main`; no native
approving-review count is required, so the status alone is the review gate.
Because a required check blocks non-admin merges regardless of write access, a
write-access author who is not an owner still needs an engineering owner's
approval or the review app's exact-head approval. (Repo admins can still
bypass.)

### The mirror

`spec-owner-approval` now only mirrors the spec half of `review-required`.
First re-flag every open, non-draft PR (the blank-`pr` backfill, in batches;
see below) so each `review-required` carries its spec half; then remove the mirror
from the required status checks on `main`. To re-publish a head's statuses, run
`gh workflow run review-signal.yml -f pr=<number>`.

## Why a commit status (not a check run)

The gate is a **commit status**, not a check run, for two reasons:

1. Branch protection requires `review-required` as a **status context**
   ("Expected — waiting for status to be reported"); a check run of the same
   name does not satisfy it.
2. A `pending` status renders as a neutral **yellow** dot ("waiting"), not a red
   failure — so a PR awaiting review does not add red noise to the queue.

PRs gated before this switch may carry a stale `action_required` **check run**;
both workflows neutralize it (a leftover would otherwise drag the status rollup
to failure).

## Recovery / manual re-flag

`review-signal.yml` has a `workflow_dispatch`:

- blank `pr` input → re-flag every open, **non-draft** PR (backfill / mass
  recovery). A draft is re-flagged when it becomes ready for review.
- blank `pr` plus `batch` `k/n` → re-flag only the open, non-draft PRs whose
  number mod n is k−1. One job has 15 minutes, about 100 PRs, so split a large
  backfill: `gh workflow run review-signal.yml -f batch=1/4`, then `2/4`, `3/4`
  and `4/4`. A backfill also stops, failing with where it stopped, before the
  job token's hourly API budget runs low; re-run after the reset it names.
- a PR number → re-flag just that one

Use it if a PR's `review-required` ever gets stuck (e.g. the workflow was added
after the PR was opened, or a stale check run lingers).
