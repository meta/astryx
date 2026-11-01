# Writing specification records

A specification record describes the system as it is meant to be. It is read by
someone deciding whether an implementation conforms, long after the pull
requests that shaped it are closed. Every sentence in a record has to survive
that reader.

This guide applies to every knowledge record that states what the system does,
wherever it lives in the repository and in any package added later:
`docs/specs/<id>/spec.md`, family, design, theme, and architecture records,
package records under a package's `specs/` directory, and colocated
`<Name>.spec.md` component and module contracts in Core, Lab, the flat
component packages (Charts, RichText, Vega), and platform implementation
packages. Every spec must be a valid knowledge record; one that is not fails
the knowledge check (`architecture:knowledge-contracts` INV27). An implementation
plan (`plan.md`) tracks work and is outside it. It projects
`architecture:knowledge-contracts` (INV2 and INV10) and the templates under
`docs/templates/knowledge/` into a pass an author runs and a reviewer checks. It
does not create policy; when it disagrees with a current record, the record wins
and the guide needs fixing.

## The test

> In six months, when every pull request mentioned in this record is closed and
> forgotten, does this sentence still say something true about the system?

A sentence that passes describes behavior, a boundary, a default, an owner, or a
piece of evidence. A sentence that fails describes the project: what a change
proposed, what the team considered, what the owner ruled against, what used to
be the case. That is narration. It was true the day it was written and it ages
into noise that a future reader has to step around to find the rule.

## The rubric

Run the items in order. The order is how often each one goes wrong, not where it
sits in the template. Each item is a question with a yes-or-no answer that a
reviewer can check by reading the record; a `no` is a pass. Report what the pass
found, not a tick.

| ID  | Question                                                                                                                                                                                              | When the answer is yes                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Does any sentence describe what a change proposed, decided, replaced, ported, or used to do, rather than what the system does? (Scan for `proposes`, `we decided`, `previously`, `a port of`, `now`.) | Rewrite it in the present tense as a statement about the system, or delete it.                                                                                                |
| R2  | Does the record contain research: a survey of other systems, an options comparison, a benchmark run, or a test's design and scores?                                                                   | Delete it from the record. Publish it as an artifact linked from the pull request. Keep the conclusion it supports as one or two sentences inside the decision resting on it. |
| R3  | Does any evidence, basis, or verification cell name a pull request, issue, or commit instead of the fact it established?                                                                              | Replace the reference with the fact: `real-device touch feedback`, `current source`, `WAI-ARIA 1.2 combobox pattern`.                                                         |
| R4  | Is any rejected alternative longer than one line, or recorded anywhere other than inside the decision that rejects it?                                                                                | Collapse it to one `Rejected:` line in that decision. Keep the line only when naming the alternative prevents the mistake recurring; otherwise delete it.                     |
| R5  | Searching for `#` followed by digits, `/pull/`, and `/issues/`: does any pull request or issue remain as standing content?                                                                            | Delete it, or replace it with a link to the record that owns the fact. Links to other records are encouraged; they are canonical owners.                                      |
| R6  | Does any open question whose answer is already recorded still list its options?                                                                                                                       | Collapse the options into the decision. Only an unanswered question keeps its options side by side.                                                                           |

Report one line per item in the pull request description, under
`## Writing rubric results`. State what was found and what was done with it:

```text
R1 narration: Intent opened with the proposal history; rewritten as two present-tense sentences.
R2 research: none in the record; the comparison lives in a linked artifact.
R3 evidence: FR4 basis cited a pull request; now "real-device touch feedback".
R4 rejected alternatives: one, DEC-2, one line.
R5 change references: none.
R6 open questions: OQ1 is unanswered and keeps its two options.
```

A finding is not a defect in the author. "Two found, moved into DEC-3 as one
line" is a clean result. A record whose results all read `none` on the first
pass is rarer than one that found something, and a reviewer reads it with that
in mind.

## Why each item

### R1 — State the system, not the project

A record is a description of behavior that happens to have a history, not a
history that happens to describe behavior. Present tense, declarative, what the
thing does. "The pull request proposes", "we decided to change", "previously
this was", and "a port of" all describe the project. They tell the reader how
the sentence came to exist and nothing about what the system does.

Narration is the most common failure because it is the natural way to write
while the decision is fresh. The fix is mechanical: find the behavior the
sentence is circling and state it.

Narration:

> An open pull request proposed revealing row actions on hover. The owner ruled
> against it, so this record settles that actions are always visible.

The same fact as a record sentence:

> Row actions are always visible. They do not depend on hover or focus.

The second version is shorter, needs no context, and is still true when the pull
request is forgotten.

### R2 — Research is an artifact

A competitive survey, an options comparison, a benchmark, or the design and
scores of a test are how a decision was reached. They are valuable and they
belong somewhere durable, which is an artifact linked from the pull request. A
record states the conclusion the research supports, in a sentence or two inside
the decision that rests on it, with a citation only where a reader might
reasonably doubt the claim.

Research in a record fails the six-month test twice. The comparison stops being
true as the surveyed systems change, and the reader has to find the decision
inside a table of alternatives the decision already closed. A record also reads
as though the decision was always the decision; a survey reads as a debate.

The template's own line about audit data is the same rule applied to
measurements: "Current measurements belong in the audit record; this subsection
owns only durable constraints and their verification target."

### R3 — Evidence cites facts, not changes

An evidence cell answers "how do we know?" A pull request number does not
answer it; it points at a place where the answer once lived. "#NNNN's device
test" tells a future reader nothing once the pull request is closed, and tells
the present reader only that someone tested something somewhere. "Real-device
touch feedback" says what the evidence is.

The same applies to a basis column in a draft requirement table. `proposal` is a
valid basis while a row is unsettled; a pull request number in its place is not,
because the basis of a rule is a reason, and a change is not a reason.

### R4 — Rejected alternatives: one line, inside the decision

The record describes the specific behavior wanted, not every option considered.
A rejected alternative earns one line, inside the decision that rejects it, when
naming it prevents the same mistake from being proposed again. That is a
guardrail, not a history.

A rejected alternative that takes a paragraph is research (R2). A rejected
alternative in the Intent section is narration (R1). A rejected alternative that
no one would propose again is noise; delete it.

> **DEC-2 — Actions are caller-rendered nodes.** The caller supplies the control
> and owns its handler; the component places it and never inspects it.
> Rejected: a declared `{label, icon, onClick}` object, because the component
> would then render a control it does not own.

### R5 — No pull request or issue as standing content

A record outlives every change that touched it. A pull request referenced in
the body is a dependency on something that will close, merge, or be superseded,
and the sentence that references it fails the six-month test by construction.
`architecture:knowledge-contracts` INV10 states the rule: pull requests and
issues are not standing content, a record states the fact a change established
rather than the change, and it never exists to approve, reject, classify, or
authorize one.

Links to other records are the opposite case and are encouraged. A record is a
canonical owner; linking `component:Selector/FR3` or `spec:AST-002/DEC-1`
delegates a fact to the place that owns it, which is exactly what INV2 asks for.

Checking this item is a text search, which is why it is phrased as one.

### R6 — Open questions are the exception

An unanswered question genuinely has options, and the owner needs them side by
side to rule. An open question may therefore list its alternatives, with the
consequence of each. Once ruled, the alternatives collapse: the chosen one
becomes the behavior, and the rejected ones become at most one line inside the
decision (R4). A ruled question that still carries its options is a record
describing a debate that is over.

## Where the pass happens

The author runs the rubric before requesting review and reports the results in
the pull request description. The reviewer reads the record against the
results: an item reported `none` with a finding still in the record is a review
comment, and a record pull request with no results section is incomplete before
review starts. This applies to any pull request that creates or changes a
record, under whichever pull request template it uses; `specification.md`
carries the results section, and other templates add it when they touch a
record.

The templates under `docs/templates/knowledge/` carry a one-line reminder at the
sections where these failures usually land (Intent, evidence, decision log, open
questions) and point here. The reminder reaches an author editing the file; the
results section reaches the reviewer. Neither replaces the other.

## What is checked mechanically

`pnpm check:knowledge` validates record structure: frontmatter, required
sections, schema and template versions, relationship links, and metadata blocks.
It does not check any rubric item, by design:

- Whether a sentence is narration (R1), research (R2), or a ruled question (R6)
  is a judgement about meaning, and a check that guesses at it would be argued
  with and then ignored.
- A pull request reference (R3, R5) is detectable, but records approved before
  this rule carry references that were permitted when they were written, and
  the file cannot tell which of those a future edit is responsible for. A hard
  check would fail every one of them; a grandfather list would drift, which is
  the failure this guide exists to stop. The reviewer's text search is the
  honest check, and the rubric applies to the records a pull request touches.

Rubric results in the pull request description are a convention backed by
review, not a status check.
