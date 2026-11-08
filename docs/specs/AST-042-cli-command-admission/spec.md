---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-042
authority: current
archive_reason: null
superseded_by: null
approved_by: josephfarina
approved_at: 2026-09-24
phase: accepted
owners: [josephfarina]
affects_architecture: [architecture:cli-surface]
affects_families: []
affects_contributing: [contributing:cli-conventions]
affects_consumer_docs: []
---

# CLI command admission and programmatic parity system spec

<!-- path-applicability:v1 -->

```json
{
  "paths": ["packages/cli/clients/cli/**", "packages/cli/api/**"]
}
```

## Intent

Agents learn the Astryx CLI from its help, its manifest, and their own notes, and
they script the same operations through the programmatic API. Each command,
subcommand, and option that ships becomes surface that agents depend on, and
removing one is a breaking change. Before writing code, a contributor needs to
know whether new behavior belongs in an existing command, a new option, a new
subcommand, or a new top-level command, and what each of those needs.

This record owns what each kind of CLI surface needs before it is added, the rule
that every command is a thin layer over one documented and tested programmatic
function, and the vocabulary that human-readable output may use.

## Non-goals

- Where command, API, adapter, and formatter code lives, and which modules may
  read the environment. `architecture:cli-surface` INV20–INV23 own that
  structure.
- Discoverability, environment variables, global options, and configuration.
  `spec:AST-017` FR14–FR20 own those rules.
- Classifying a removal, rename, behavior change, deprecation, or incompatible fix.
  [`spec:AST-017`](../AST-017/spec.md) owns compatibility and release lifecycle.
- The JSON envelope, error codes, and generated help. `architecture:cli-surface`
  INV2, INV3, and INV7 own them.
- Equivalent internal implementations remain valid when they satisfy this contract.

## Requirements

- **FR1 — Every command is a thin layer over one programmatic function.** Every
  command or subcommand that performs an operation MUST perform it by calling one
  function exported from `@astryxdesign/cli/api`. Called with the same inputs,
  that function MUST perform the same operation and return the same result that
  the command emits under `--json`. The command adds only argument parsing,
  rendering, and exit status; rendering MAY use how the CLI was invoked, such as
  the package manager's run prefix, to phrase hints. It MUST NOT read project
  state, change files, contact the network, or produce a result field or effect
  that the function does not produce. A command that only groups subcommands is exempt, and so is a
  command that only describes the CLI itself, such as help, the version, or the
  capability manifest. This requirement names `@astryxdesign/cli/api` because
  automation depends on it under `spec:AST-017` FR14.
- **FR2 — The programmatic API is documented and tested.** Every function
  exported from `@astryxdesign/cli/api` MUST have reference documentation that
  states its parameters, each option and its default, its result types, the error
  codes it can return, and at least one example. Tests MUST exercise each
  documented option, each result type, and each documented error code, and MUST
  fail when that behavior is removed. Every command MUST also have tests that run
  the CLI and check its `--json` result, its human-readable output, and its exit
  status, for at least one success and one failure.
- **FR3 — Human-readable output uses one shared vocabulary.** Human-readable
  output MUST use only the block kinds that generated help documents: Record,
  Section, List, Text, and Code. A Text block carries prose. Items and field
  values MUST use Record, Section, or List blocks, never columns or tables that a
  command builds from characters itself. Content authored in a documentation
  source, such as a heading or a table in a reference doc, follows the same rule.
  A command MUST NOT define an output format of its own. When no existing block
  can express an output without losing information a reader needs, such as a
  table too large to read as records, the answer is a new shared block kind, not
  a command-specific renderer. A new block kind changes the output of every
  command, so it MUST be justified by that evidence, MUST be available to every
  command, and MUST appear in generated help in the same change.
- **FR4 — New surface is admitted by tier.** Each addition MUST pass the test for
  its tier before it merges.
  - **Top-level command.** A new `astryx <command>` MUST cite a current system
    specification that authorizes it, approved by an approval owner (an owner listed in the knowledge schema's `approvalOwners`). That specification MUST state the
    question a consumer or agent has that no existing command answers; the
    existing command closest to answering it, and why extending that command is
    wrong; the one job the command does, stated without "and"; why its result is
    data rather than prose, which belongs in a docs topic; and the function that
    FR1 requires.
  - **Subcommand.** A new subcommand MUST stay inside its parent command's one
    job. Its pull request MUST state the question it answers, why an option on
    the parent or on an existing subcommand cannot answer it, and the function
    that FR1 requires. A code owner of the CLI package MUST approve it.
  - **Option.** A new option on an existing command MUST meet FR5 and
    `spec:AST-017` FR14–FR15. Normal review is enough.

  Behavior that fails the test for its tier is not admitted at that tier. It
  becomes an option, a subcommand, a docs topic, or an improvement to an existing
  command instead.

- **FR5 — Options change what a command produces, predictably.** An option MUST
  narrow or redirect work that its command already does, and MUST NOT give the
  command a second job. Its default MUST be the right result for most callers. A
  boolean option MUST default to off; behavior that is on by default gets a named
  opt-out, not a flag that defaults to true. An option that changes only how the
  same result is presented is a global presentation option and MUST meet
  `spec:AST-017` FR15. An option name MUST mean the same thing, spelled the same
  way, on every command that has it, and no command must carry an option because
  a sibling has it. An option MUST NOT exist to work around a defect. Every pair
  of options on a command MUST have a decided result: they compose and a test
  proves it, they are refused together with a stable error code, or another rule
  already prevents the pair.
- **FR6 — Moving surface is an admission.** Renaming a command, moving behavior
  into a new command, or promoting a subcommand to a top-level command is an
  admission at the new tier and MUST pass that tier's test. Removal and renaming
  also follow `spec:AST-017` FR1–FR8 and FR31: a removal lands in a declared minor
  with its `[breaking]` Changeset, and when the next release is a patch the command is
  deprecated first (FR28).
- **FR7 — Exact-lookup admission classifies batching first.** Before code is written,
  every new command or subcommand with an exact selector position MUST classify that
  position against `spec:AST-053` FR11 E1-E5. An eligible surface MUST use AST-053's
  batch contract in its first public release. An ineligible top-level command MUST cite
  a current command-owning record that names the failed condition; a draft does not
  admit the exclusion. An ineligible subcommand MUST name the condition in its
  admitting pull request and still follows FR4's code-owner approval bar. After typed
  admission metadata lands, its CommandDoc MUST retain the same classification.
  Existing eligible commands follow AST-053's incremental migration rule. A hidden
  option MUST NOT make batching opt-in or bypass this classification.

### Platform support

- Supported feature/engine floor: every supported CLI runtime.
- Unsupported behavior: none.
- Browser evidence: not applicable.

## Current-state impact

`architecture:cli-surface` INV20–INV23 carry FR1–FR3 into the code: the layout of
an API subject, the adapter as a subject's only access to the environment, thin
command handlers, and the closed formatter kit. `contributing:cli-conventions`
restates FR4 and FR5 for contributors. It does not yet restate FR7, and CommandDoc
has no typed AST-053 eligibility field; projecting the rule there and adding the
repository check are known enforcement gaps that land separately.

The CLI has 17 top-level commands. The command docs of 28 commands and
subcommands name the function they call. Known gaps, for which this record does
not assign migrations:

- the component, discover, layout, search, template, and theme handlers read
  project state or files themselves (FR1);
- the theme handler draws its target table from characters, and the docs
  handler renders authored headings and tables with its own code (FR3); both
  are candidates for one shared block kind under FR3, not two command
  renderers;
- several API subjects read or write the environment outside an adapter, and the
  `integration` subject keeps flat modules without leaves
  (`architecture:cli-surface` INV20–INV21);
- the reference docs of 14 exported functions, most of them in the
  `integration` subject, do not state the error codes they can return (FR2);
- the structure check confirms that each API subject has at least one reference
  doc, typedef file, and test, but not that each exported function or command is
  covered (FR2).

No mechanical check enforces FR1, the per-function part of FR2, FR3, FR4, FR5,
FR7, `architecture:cli-surface` INV21, or most of INV22 and INV23 yet. Review
applies them to every new change; until mechanical checks land, a new violation
fails only in review. The checks and the closure of the gaps above land as separate
changes.

This specification change alters no runtime behavior or published package and
needs no Changeset.

## Verification

| Contract | Verification                                                                                                          | Representative states                                                                        | Mutation or failure expectation                                                                                                  |
| -------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Command inventory from the manifest, matched to `@astryxdesign/cli/api` exports; paired CLI and API runs on one input | each executable command and subcommand; a group; the manifest                                | A command has no exported function, or emits a field or effect that its function does not                                        |
| FR2      | Reference-doc inventory for every export; per-function tests; command-level CLI tests                                 | each option, result type, and documented error code; one success and one failure per command | Removing a documented behavior leaves every test passing                                                                         |
| FR3      | Text-output snapshots per command; the help snapshot                                                                  | each block kind; a list of items; a result shaped like a table                               | A command prints a layout outside the documented blocks, or a new block kind is missing from help                                |
| FR4, FR6 | The admitting pull request and the authority it cites                                                                 | top-level command, subcommand, option, rename, promotion                                     | A top-level command lands without a current specification, or a subcommand lands without its stated case and code-owner approval |
| FR5      | Option composition tests per command                                                                                  | each option pair; a boolean default; a shared option name                                    | A pair has no decided result, a boolean defaults to on, or one name has two meanings                                             |
| FR7      | Admission review against AST-053 E1-E5 and the evidence for its tier                                                  | eligible new lookup; top-level and subcommand exclusions; draft                              | An eligible surface is single-only, or an exclusion lacks the evidence its tier requires                                         |

## Decision log

### DEC-1 — Commands are thin layers over the programmatic API

**Reference:** `spec:AST-042/DEC-1`
**Decider:** `josephfarina`, `2026-09-24`

One function owns each operation. An agent that runs the command and an agent
that scripts the API get the same result, and the behavior is tested once, where
it lives. The command only turns arguments into a call and a result into output.

Rejected: behavior implemented in the command handler, and features that only the
command offers. Both drift from the API, and automation cannot reach them.

### DEC-2 — One output vocabulary for every command

**Reference:** `spec:AST-042/DEC-2`
**Decider:** `josephfarina`, `2026-09-24`

Agents grep the text output and people read it. One small set of blocks keeps
every command's output predictable and keeps it a view of the JSON result.

Rejected: per-command renderers and tables drawn from characters. They drift from
the JSON result and from each other, and each one is a format that agents must
learn separately.

### DEC-3 — Admission bars scale with permanence

**Reference:** `spec:AST-042/DEC-3`
**Decider:** `josephfarina`, `2026-09-24`

A top-level command is a permanent concept in every agent's working set, so it
needs a current specification from an approval owner. A subcommand lives inside
one command's job, so a stated case and a code owner's approval are enough. An
option narrows work a command already does, so the option rules and normal review
are enough.

Rejected: one bar for every addition, which either blocks small options or lets
top-level commands in too easily; and adding a top-level command to make behavior
easier to find, because help and docs make behavior discoverable under
`spec:AST-017` FR14.

### DEC-4 — Exact lookups classify batching during admission

**Reference:** `spec:AST-042/DEC-4`
**Decider:** `josephfarina`, `2026-10-01`

Batch shape is part of a lookup's public surface, so admission applies AST-053 E1-E5
before implementation. The evidence still follows DEC-3's permanence tiers: a
current record for a top-level command, and the pull request plus code-owner approval
for a subcommand; CommandDoc retains the result after typed metadata lands.

Rejected: letting each eligible command remain single-only or hide batching behind an
option, which gives equivalent read-only lookups different automation contracts; and
requiring a new system record for every subcommand exclusion, which defeats the tiered
bar.

## Deprecation and cleanup descriptions

These tables describe deprecations and removals for readers; the gate for a removal
is the declared minor and its `[breaking]` Changeset (`spec:AST-017` FR31).

### DEP-0006 — Deprecate the `astryx layout` command group

| Field            | Value                                                                                                                                                                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id               | `DEP-0006`                                                                                                                                                                                                                                                     |
| cleanup          | `CLN-0006`                                                                                                                                                                                                                                                     |
| package          | `@astryxdesign/cli`                                                                                                                                                                                                                                            |
| surface          | CLI command group: `astryx layout` (`expand`, `check`, `grammar`), its three JSON response types (`layout.expand`, `layout.check`, `layout.grammar`), and the programmatic API exports `layoutExpand`, `layoutCheck`, `layoutGrammar` from `@astryxdesign/cli` |
| old contract     | Compressed XLE/XLO expressions parsed, validated, and expanded into XDS TSX; expression validation with canonical-surface echo; grammar cheatsheet with alias table                                                                                            |
| replacement      | `astryx build` chooses the closest template to start from. `astryx template <name> <path>` scaffolds it. `astryx docs layout` teaches the layout principles (scaffold, structure, spacing, breakpoints).                                                       |
| warning          | Human mode: one stderr line per invocation naming DEP-0006 and the replacement commands. JSON mode: `meta.deprecations` array in the response envelope, each entry `{id, replacements}`, matching the documented envelope schema.                              |
| migration        | Non-mechanical. The XLE/XLO expression language has no source-level equivalent in the replacement commands. Use `astryx build` to find the right template, `astryx template <name>` to scaffold it, and edit the scaffolded code directly.                     |
| codemod          | None — vacuous: expressions are ad-hoc input, not persisted source that a codemod can rewrite.                                                                                                                                                                 |
| downstream       | Maintained agent-docs teach `build` as the front door. The layout guide (`astryx docs layout`) is unaffected.                                                                                                                                                  |
| direct authority | `spec:AST-042` (CLI command admission and programmatic parity)                                                                                                                                                                                                 |
| state            | `deprecated`                                                                                                                                                                                                                                                   |

### CLN-0006 — Remove the `astryx layout` command group

| Field     | Value                                                                                                                                                            |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id        | `CLN-0006`                                                                                                                                                       |
| lifecycle | `DEP-0006`                                                                                                                                                       |
| delta     | Remove command registration, API exports (`layoutExpand`, `layoutCheck`, `layoutGrammar`), CLI bindings, command docs, tests, and the `layout.*` response types. |
| rollback  | Re-register the command group with the same API, response types, and tests from the final-patch baseline.                                                        |
| state     | `pending` — lands in the declared minor with its `[breaking]` Changeset                                                                                          |

## Open questions

None.
