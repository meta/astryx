---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-041
authority: current
archive_reason: null
superseded_by: null
approved_by: josephfarina
approved_at: 2026-10-09
phase: accepted
owners: [josephfarina]
affects_architecture: []
affects_families: []
affects_contributing: []
affects_consumer_docs: [is-my-code-good]
---

# Consumer documentation audience boundary system spec

<!-- path-applicability:v1 -->

```json
{
  "paths": [
    "packages/cli/assets/docs/**",
    "packages/**/*.doc.mjs",
    "packages/**/*.doc.*.mjs"
  ]
}
```

## Intent

Documentation that Astryx ships to callers serves people and agents building
products with Astryx. It reaches them through `astryx docs`, `astryx search`,
component, hook, and template docs, the `--json` API, generated agent guidance,
and the doc site. A caller must be able to act on everything they read there.
Material about building Astryx itself belongs in contributor knowledge.

This record owns the audience boundary for every doc delivered through those
consumer surfaces, including docs that integrations contribute.

## Non-goals

- Contributor documentation, knowledge records, and repository instructions.
- Doc structure, graph identity, and the quality bar for caller docs; the
  documentation contract owns those.
- Equivalent internal implementations remain valid when they satisfy this contract.

## Requirements

- **FR1 — Shipped docs are for callers.** Every section of a shipped doc MUST
  describe something a caller can use or rely on: purpose and alternatives, API
  and defaults, observable behavior and its guarantees, composition, costs and
  obligations the caller inherits, theming seams, migration, or quality criteria
  they can apply to a product surface or artifact they create with Astryx from
  public evidence.
- **FR2 — Maintainer process is excluded.** A shipped doc MUST NOT ask its reader
  to produce evidence for Astryx maintainers, meet Astryx's internal grading or
  promotion criteria, follow Astryx's contribution lifecycle, or run Astryx's own
  test and CI tooling. That material belongs in the contributor surface that owns
  the topic, or in the contributing guide when no specific surface exists. It
  never defaults back to a shipped doc.
- **FR3 — System guarantees stay, as guarantees.** A fact about the system's
  behavior that a caller can rely on MUST stay in shipped docs, stated as a
  guarantee to the caller. For example, "theme targets are stable once
  published" is caller-facing; "reviewers must check that theme targets are
  stable" is not. The fix for maintainer phrasing of a caller fact is a rewrite,
  not a move.
- **FR4 — Distribution audience is not reader role.** A doc's distribution
  audience selects which compiled bundle includes it, such as a public bundle or
  an internal bundle. It MUST NOT admit maintainer-process material into any
  bundle. An internal bundle is still for people building with Astryx.
- **FR5 — Enforcement measures the reader addressed.** An automated check that
  gates FR2 MUST classify content by the reader it addresses, not by the presence
  of a word. Before it gates, it MUST show zero findings on the shipped corpus
  and catch at least one real violation. A caller instruction that contains a
  flagged term, such as "animate transforms to keep compositor promotion", MUST
  pass. Each finding MUST name the doc and section and state where the material
  belongs. The check MUST offer an explicit, reviewable exemption for a
  legitimate caller-facing use.
- **FR6 — Contributed docs follow the same boundary.** Docs that an integration
  contributes to consumer surfaces MUST meet FR1–FR4. The integration authoring
  reference MUST state this rule.
- **FR7 — The shared caller rubric has one owner.** The shipped `is-my-code-good`
  guide MUST own the shared criteria for whether caller-created product code uses
  Astryx well. Specialized rubrics MAY add weights and artifact-specific checks,
  but MUST link to the shared criteria instead of redefining them. A caller rubric
  MUST use public inputs and MUST report missing evidence as uninspected, not as a
  pass.

### Platform support

- Supported feature/engine floor: every consumer doc surface listed in Intent.
- Unsupported behavior: none.
- Browser evidence: not applicable.

## Current-state impact

The shipped topic directory has a README that states the caller-action test,
common signs of maintainer writing, and where that material goes. Repository
instructions state the same audience. FR7 assigns the shared caller-facing
rubric to `is-my-code-good`; its guide and the specialized links are companion
implementation outside this specification-only change. No automated check
enforces the audience boundary yet. The authoring types declare a distribution
audience field with public and internal values for the docs graph; nothing reads
it yet. FR4 keeps that field separate from the reader boundary.

This specification-only change alters no runtime behavior or published package
and needs no Changeset.

## Verification

| Contract | Verification                                        | Representative states                                                                 | Mutation or failure expectation                                                                 |
| -------- | --------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| FR1–FR3  | Review of every shipped doc the compiler enumerates | component, hook, template, topic, agent guidance; caller fact phrased for maintainers | A section addresses maintainers, or a caller guarantee is removed instead of rewritten          |
| FR4      | Compiled public and internal bundle tests           | public doc, internal doc, maintainer material marked internal                         | Maintainer material appears in any bundle                                                       |
| FR5      | Check fixtures and a run over the shipped corpus    | clean corpus, real violation, caller instruction with a flagged term, exemption       | The corpus fails, the violation passes, the caller instruction fails, or an exemption is silent |
| FR6      | Integration doc fixtures                            | contributed topic that addresses maintainers                                          | A contributed doc bypasses the boundary                                                         |
| FR7      | Docs graph and rubric review                        | shared code rubric, specialized template scoring, missing rendered evidence           | Shared criteria have two owners, a specialization does not link, or missing evidence passes     |

## Decision log

### DEC-1 — The caller-action test defines the boundary

**Reference:** `spec:AST-041/DEC-1`
**Decider:** `josephfarina`, `2026-09-23`

Shipped docs reach agents and people who build with Astryx, and each extra
section costs their attention. The test is whether a caller acts on the
content. System guarantees pass that test even when they sound like process, so
they are rewritten for the caller, not moved.

Rejected: keeping maintainer material in shipped docs because it is accurate,
and moving caller guarantees out because they are phrased as process.

### DEC-2 — Enforce by the reader addressed, with measured precision

**Reference:** `spec:AST-041/DEC-2`
**Decider:** `josephfarina`, `2026-09-23`

A noisy check gets suppressed instead of acted on. A gate must show that it
catches real violations and passes caller instructions that share vocabulary
with maintainer process.

Rejected: a bare word list as a gate, and a distribution audience used as a
place for maintainer material.

### DEC-3 — Caller-owned quality review stays in shipped docs

**Reference:** `spec:AST-041/DEC-3`
**Decider:** `josephfarina`, `2026-10-09`

A person or agent building with Astryx can act on public criteria that evaluate
its own product code. The `is-my-code-good` guide owns the shared criteria;
artifact-specific guides link to it and add only their own checks or scoring.
Missing evidence remains visible instead of becoming a pass.

Rejected: treating every quality rubric as maintainer process, and copying the
shared criteria into each artifact-specific guide.

## Open questions

None.
