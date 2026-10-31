# Pull requests: one primary intent

A pull request should make one reviewable change for one reason. Choose the template that matches its primary intent; supporting tests and docs belong with that intent, but unrelated API, visual, layout, behavior, or policy changes do not.

GitHub uses the default template automatically. To choose another, add `?template=<file>.md` to the new-pull-request URL, or copy the matching file from `.github/PULL_REQUEST_TEMPLATE/` into the description.

Any pull request that creates or changes a knowledge record — a `docs/specs/<id>/spec.md`, a family, design, theme, or architecture record, or a colocated `<Name>.spec.md` — reports the results of the rubric in [Writing specification records](spec-writing.md) in its description, whichever template it uses. `specification.md` carries the `## Writing rubric results` section; copy it into another template when that pull request also touches a record.

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
3. If a delta is unsettled but separable, remove or split it and keep reviewing the primary intent.
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

## Public repository boundary

Descriptions, screenshots, commits, tests, and specification records are public. Do not include internal links, identifiers, hostnames, tools, or operational context.
