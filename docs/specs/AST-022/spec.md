---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-022
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
phase: proposed
owners: [rubyycheung]
affects_architecture:
  [
    architecture:cli-surface,
    architecture:theme-authoring-contract,
    architecture:theme-compilation,
  ]
affects_families: []
affects_contributing: []
affects_consumer_docs: [theme]
---

# Theme ownership, inheritance, and materialization system spec

## Intent

Theme authors need to know whether a theme follows another theme or merely uses
it as a starting point. `defineTheme({extends})` intentionally keeps a source
dependency on a resolved base theme. That is useful when an author wants fixes,
new component coverage, and other updates from the base, but it can also change
the child theme when the dependency is upgraded.

Astryx should therefore support two explicit workflows:

- **Follow:** retain `extends` and continue adopting changes from the base theme.
- **Own:** resolve the current authoring inputs into reviewable local source that
  no longer depends on the selected base theme or on mutable generation formulas.

Materialization is the shared technical operation behind taking a fully owned
snapshot.
It resolves inherited and generated theme-authoring values, previews the exact
change, and writes an equivalent local theme only through a separate explicit write
invocation, not a prompt or read from stdin.

## Non-goals

- Change the current meaning or precedence of `defineTheme({extends})`.
- Remove `extends`, typography, motion, radius, or color configuration in this
  specification pull request.
- Define tonal palette generation, accepted palette validation, semantic color
  recommendations, or contextual contrast analysis.
- Define how authors create new typography, spacing, motion, or radius values
  beyond Astryx's built-in scales. Theme-local scale extension is owned by the
  separate AST-023 proposal.
- Promise that a snapshot freezes component implementations across Astryx package
  upgrades. It freezes theme-authoring inputs, not the library code that consumes
  them.
- Serialize arbitrary executable React nodes or functions as if they were plain
  data.
- Update, overwrite, or detach a theme without an author-visible preview and an
  explicit write decision.

## Terms

- **Following theme:** source with an `extends` relationship. Re-resolving it may
  adopt changes from the selected base theme.
- **Fully owned snapshot:** local theme source containing every resolved value
  exposed by the public theme-authoring contract. Reproducing it does not require
  the selected base theme or mutable scale-generation behavior.
- **Materialize:** resolve inherited and generated authoring inputs into explicit,
  reviewable local source.
- **Detach:** materialize a following theme and remove its `extends` relationship.
- **Freeze:** materialize selected generated scales while retaining any intended
  inheritance relationship.
- **Lineage-bound local token:** a theme-local name whose declaration and use are
  valid only through the enrolled exact `extends` lineage that owns it.
- **Unresolved executable value:** an inherited icon, indicator, syntax definition,
  or other value that tooling cannot safely express as generated source.

## Ownership

| Owner                      | Contract                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| AST-022                    | Follow-versus-own choice, materialization behavior, preview, writes, and equivalence evidence. |
| Theme author               | The selected lifecycle, committed output, retained dependencies, and accepted visual changes.  |
| `defineTheme` architecture | Current normalization, precedence, inheritance, and supported authoring surfaces.              |
| CLI authoring surface      | Discovery, preview, source generation, receipts, safe writes, and actionable failures.         |
| Palette specifications     | Palette generation, accepted palette ownership, and exact palette-reference behavior.          |

## Choosing a lifecycle

The choice controls who is responsible for future theme changes. Neither option is
universally better, so authoring tools must explain both before writing.

| Choice                       | Benefits                                                                                                                                             | Tradeoffs                                                                                                                                      | Best fit                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Follow a base with `extends` | Smaller source; receives reviewed fixes, new theme coverage, and coordinated updates from the base; convenient for related variants.                 | Upgrading the base may change the child theme; reviewers must consider inherited changes; reproducing the source requires the base dependency. | A variant that intentionally stays aligned with another theme, especially when both are maintained together. |
| Take a fully owned snapshot  | Every public theme value is explicit and locally reviewable; base and Core default changes do not alter saved values; the author can diverge freely. | Larger source; the author maintains copied values; later fixes and new coverage from the former base are not adopted automatically.            | A product or application theme that prioritizes control and visual stability.                                |
| Detach an existing theme     | Preserves the theme's current resolved values, name, and imports while ending a previously chosen base relationship.                                 | Produces a larger change to review; future base improvements require an explicit comparison and adoption.                                      | A following theme whose author later decides to own its current appearance.                                  |
| Freeze selected generators   | Makes chosen generated values explicit without requiring a complete detach.                                                                          | Retained base and generator dependencies can still change other values; the result is partial materialization, not full ownership.             | A theme that wants control over one scale while intentionally continuing to follow elsewhere.                |

The CLI MUST describe the selected result in these terms. It MUST NOT use
“self-contained,” “detached,” or “fully owned” for output that still depends on an
unreported base or mutable generator.

## Requirements

### Explicit lifecycle choice

- **FR1 — Following and owning are different promises.** Tooling that starts a new
  theme from an existing theme MUST present following the base and taking a fully
  owned starting point as explicit choices. It MUST explain that following receives
  later base changes while ownership accepts local maintenance, and MUST require an
  explicit option selecting one before writing. When the option is absent, the CLI
  MUST return the available choices without writing or reading stdin. Tooling MAY
  recommend one choice from the author's stated goal, but MUST NOT silently select
  it or describe `extends` as a fully independent copy.
- **FR2 — Following preserves current `extends` semantics.** A following theme
  retains its base dependency and may adopt the base's resolved token, component,
  media-surface, icon, indicator, syntax, and local-token changes after an
  intentional dependency update. The resulting `DefinedTheme` remains flattened
  for consumption, but flattening at runtime or build time MUST NOT be presented as
  source independence.
- **FR3 — An owned start writes local source.** Choosing a base only as a starting
  point MUST create a fully owned snapshot. Subsequent changes to the selected base
  or Core theme defaults MUST NOT alter its saved theme values unless the author
  explicitly runs a migration or comparison workflow.

### Materialization boundary

- **FR4 — Materialization covers configurable theme surfaces.** The operation MUST
  account for inherited values and for values generated by current typography,
  motion, radius, and color configuration. It MUST preserve explicit-token and
  explicit-component precedence. It MUST also inventory local tokens, `onDark`,
  `onLight`, syntax, icons, and indicators rather than silently dropping them.
- **FR4a — Detach cannot copy lineage-bound local tokens unchanged.** Before
  removing `extends`, tooling MUST inspect inherited local-token declarations,
  owner metadata, and every reachable reference. An inherited name is valid only
  through its exact enrolled base lineage; copying that name into the detached
  theme would make it a foreign declaration and fail the current validator.
  Detach MUST therefore stop before writing and require an explicit local-token
  migration that is reviewed under the owning theme specifications. That migration
  MUST map affected names into the detached theme's namespace, rewrite every
  reachable declaration and reference, and preserve any compatibility alias
  required by the released token contract. If the author does not choose such a
  migration, tooling MUST retain `extends`, report the lineage dependency, and MUST
  NOT describe the result as detached or fully owned.
- **FR5 — Materialization produces authoring source, not only compiled output.** A
  CSS or JavaScript build artifact alone is insufficient because it does not give
  the author an editable theme definition. Output MUST be suitable for committing,
  reviewing, and rebuilding with the supported theme toolchain.
- **FR5a — Full ownership includes all resolved public theme values.** A fully owned
  snapshot MUST write every value exposed by the public theme-authoring contract,
  including values currently equal to Core defaults. Output that records only
  differences remains dependent on future Core defaults and MUST NOT be labeled
  fully owned.
- **FR5b — Authoring projection is separate from runtime representation.**
  Materialization MAY produce a larger, fully explicit source projection so an
  author can read, edit, review, and rebuild every resolved value. That projection
  MUST NOT by itself force the shipped theme to carry the same expanded data.
- **FR5c — Preview shows the size tradeoff.** Before writing, the preview MUST show
  the source projection and the equivalent compiled/runtime output, including the
  resulting CSS, JavaScript, and package-size impact compared with the current
  theme. Inspecting or editing a resolved view MUST NOT be described as free of
  runtime cost when the selected ownership choice would increase it.
- **FR5d — Receipts and authoring metadata stay out of runtime artifacts.** Receipts,
  provenance, comparison evidence, and authoring-only metadata MUST remain in
  sidecar or development output and MUST NOT be bundled into runtime CSS,
  JavaScript, or package exports. Equivalent runtime output MUST retain the
  existing compact representation or use an equivalent deduplicated form. Detach
  MAY accept a real size increase only as an explicit, previewed ownership tradeoff.
- **FR6 — Theme ownership has an honest boundary.** Materialization freezes the
  theme values expressible through the current public authoring contract. It MUST
  state the Astryx version used and MUST NOT claim to freeze internal component
  markup, default styles outside the theme contract, browser rendering, or future
  package behavior.
- **FR7 — Theme-owned palette references remain owned.** A reference to an exact
  value in the same theme's committed palette file remains a reference by default;
  it does not need to be replaced with a copied hex value. When a palette belongs
  to another package, tooling MUST require an explicit option to retain that visible
  dependency or copy the current value locally.

### Executable values and failure behavior

- **FR8 — Executable values require source-preserving handling.** Generated source
  MAY preserve an icon, indicator, syntax definition, or other executable value
  through an explicit import only when the author intentionally retains and reports
  that dependency. A fully owned snapshot MUST replace a value inherited from the
  selected base with equivalent owned local source or an author-supplied local
  reference that does not import the former base. When tooling cannot safely
  construct or validate that source, the operation MUST report the exact field and
  stop before writing. If the author instead retains the base import, the preview
  and receipt MUST report it and the result MUST NOT be labeled fully owned or
  source-independent. Tooling MUST NOT stringify, omit, or replace executable
  values with placeholders.
- **FR9 — Writes are atomic and opt-in.** Preview is the default. Writing requires
  an explicit author action, uses a temporary destination, validates the complete
  result, and replaces target files only after success. Existing modified output
  MUST NOT be overwritten without a separate explicit overwrite option. Detach
  updates the selected existing theme by adding its resolved values and removing
  `extends`; it does not create a second theme or require callers to change imports.
- **FR10 — Partial materialization is explicit.** An author MAY choose to freeze only
  selected generated scales while continuing to follow a base. The preview and
  receipt MUST identify every retained dependency. A partial operation MUST NOT be
  labeled detached or owned.

### Equivalence and review

- **FR11 — Before and after resolve equivalently.** A successful full
  materialization MUST compare the original and proposed themes under the same
  Astryx version. Tokens, component overrides, media-surface overrides, local-token
  declarations, local-token owner and lineage metadata, and registry selections
  MUST match. A difference blocks the write unless the author explicitly chooses a
  separate migration that records the intended change. For a local-token migration,
  equivalence evidence MUST additionally show the old-to-new name mapping, every
  rewritten reference, equivalent resolved behavior after applying that mapping,
  and any required compatibility alias. Compiled differences MUST be limited to the
  recorded renames and aliases and included in the preview and size comparison; an
  unaccounted foreign or undeclared name blocks the write.
- **FR12 — The preview explains consequences.** Before writing, tooling MUST show
  the removed base or generator dependencies, files to be created or changed,
  unresolved executable values, retained dependencies, and an exact semantic
  summary. Visual comparison MAY supplement this evidence but MUST NOT replace the
  structural comparison.
- **FR13 — Every write has a receipt.** The receipt MUST include the tool and
  Astryx versions, source theme identity, original base identity and version when
  applicable, selected operation and surfaces, input and output digests, retained
  dependencies, generated file paths, and verification result. It MUST NOT be
  required at runtime.
- **FR14 — Repeated output is stable.** With the same source, versions, options,
  and environment-independent inputs, materialization MUST produce byte-identical
  generated files and receipts except for an explicitly excluded invocation time.
- **FR14a — Future comparison is read-only.** A fully owned snapshot MAY later compare
  itself with a newer release of its former base using receipt metadata. The
  comparison MUST be explicitly requested, MUST show the proposed structural and
  visual differences, and MUST NOT update the owned source or recreate inheritance
  automatically.

### Compatibility and migration

- **FR15 — Existing convenience APIs remain stable until migration exists.** The
  implementation behind an existing `defineTheme` typography, motion, radius, or
  color configuration MUST NOT silently adopt incompatible generation behavior.
  Versioning, deprecation, or replacement requires a supported comparison and
  materialization path first. `defineTheme({color})` MUST NOT be marked deprecated
  until the supported palette generator, explicit mapping workflow, visual
  comparison, migration command, documentation, and compatibility fixtures are
  available. Removal requires a later breaking release.
- **FR16 — Legacy color migration is explicit.** Migrating
  `defineTheme({color})` to an author-owned tonal palette MUST use the current
  supported palette generator, produce a reviewable palette and token mapping, and
  present the resulting visual and structural delta. It MUST NOT swap the legacy
  HCT implementation for a new recipe underneath unchanged source.
- **FR17 — Lifecycle commands use plain language.** The CLI MAY expose distinct
  `detach` and `freeze` commands or another reviewed vocabulary. Help and output
  MUST explain the outcome in terms of following updates versus owning a snapshot.
  Commands MUST remain non-interactive: choices and write approval use explicit
  options or separate preview and write invocations, never prompts or stdin. The
  internal term `materialize` alone is insufficient user guidance.
- **FR18 — No current palette work is blocked.** AST-022 governs later lifecycle
  tooling. It MUST NOT delay accepted-palette, palette-generation, validation, or
  theme-adoption work that preserves the current `defineTheme` boundary.

## Proposed author flow

### Start a theme

```text
Choose Neutral as a base
            |
            +-- Follow Neutral
            |      Keep extends; receive reviewed Neutral changes on upgrade
            |
            +-- Use as a starting point
                   Generate owned local source; no Neutral theme dependency
```

### Change an existing theme

```text
Inspect dependencies
        |
        +-- Detach from a base
        |      Inspect inherited local-token lineage
        |      Migrate lineage-bound names or stop
        |      Resolve inheritance and remove extends
        |
        +-- Freeze generated values
               Replace selected scale config with explicit local values

Preview -> verify equivalence -> explicit write invocation -> atomic write -> receipt
```

The exact command names remain an implementation decision. A possible split is
`astryx theme detach` for inheritance and `astryx theme freeze` for generated
scales, both backed by the same materialization engine.

## Current-state impact

Today, `defineTheme({extends})` correctly flattens a base into the resolved
`DefinedTheme`, which lets runtime and static builds consume one self-contained
result. Source authors nevertheless retain a dependency on the imported base.
Updating that package and rebuilding may therefore change inherited theme values.

Typography, motion, radius, and legacy color helpers also generate values during
normalization. Their concise intent is useful and remains supported, but changing a
formula under unchanged source can change output. This spec introduces no such
change. It defines the future escape hatch that lets an author keep the concise
configuration or freeze its current result deliberately.

The CLI has theme templates and build output, but it does not currently provide a
general operation that removes `extends`, expands every supported generated scale,
preserves source-level registry references, and verifies equivalent authoring
source. That implementation follows this proposed contract. Creating new values
beyond built-in scales is related authoring work but is specified independently by
AST-023.

## Verification

| Contract  | Verification                                                                                                                   | Representative failure                                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1–FR3   | CLI option and source-output fixtures for follow and owned-start choices                                                       | A missing choice prompts or writes, a copied theme still imports its selected base, or a following theme is described as independent.                    |
| FR4–FR7   | Full-surface fixtures covering generators, inheritance, local tokens, media surfaces, and palette references                   | A supported surface disappears, precedence changes, or a theme-owned palette reference is needlessly severed.                                            |
| FR4a      | Neutral-derived detach fixtures with inherited declarations and references, with and without an explicit local-token migration | `extends` is removed while Neutral-owned names remain foreign, or the operation claims ownership while retaining an unreported lineage dependency.       |
| FR5b–FR5d | Source/runtime projection fixtures, compiled-size comparisons, and artifact-boundary checks                                    | Reviewing a resolved theme inflates runtime output, or receipts and authoring metadata ship to consumers.                                                |
| FR8–FR10  | Executable-registry ownership and base-upgrade fixtures, overwrite, partial-freeze, and injected-failure tests                 | An owned icon changes after the former base upgrades, an import dependency is hidden, a target is partly overwritten, or retained inheritance is hidden. |
| FR11–FR14 | Normalized-theme equivalence, deterministic snapshots, receipt schema, and preview tests                                       | Before and after differ silently, output changes across identical runs, or a receipt omits a dependency.                                                 |
| FR15–FR18 | Compatibility fixtures and legacy-color migration comparison                                                                   | An unchanged convenience config renders differently, migration hides a color delta, or lifecycle work blocks palette foundations.                        |

### Completion criteria

This spec moves from `proposed` to `shipped` only when:

- theme creation offers an explicit follow-versus-owned-start choice;
- the supported detach/freeze surface is documented with non-destructive defaults;
- full and partial materialization account for every current `DefineThemeInput`
  surface;
- detach fixtures prove that lineage-bound local tokens either receive an explicit,
  validated migration or block removal of `extends` before any write;
- authoring projections are separate from compact runtime artifacts, and previews
  show the source and compiled/package-size consequences;
- unrepresentable executable values fail before writes with actionable guidance;
- fully owned executable-registry fixtures remain unchanged when the former base is
  upgraded, while intentionally retained imports are reported as dependencies and
  prevent a fully owned claim;
- before/after structural equivalence is tested under one pinned Astryx version;
- generated source and receipts are deterministic;
- legacy color migration uses the supported palette generator without silently
  changing existing `defineTheme({color})` behavior; and
- consumer guidance clearly distinguishes theme-source ownership from freezing the
  Astryx component library itself.

## Open questions

- **Should the CLI expose `detach`, `freeze`, or both?** Detach removes a base-theme
  relationship; freeze converts selected generated scales into explicit values.
  They use the same materialization engine but communicate different outcomes. Is
  one guided command clearer, or do separate verbs make the consequences safer?
- **How should large component maps be represented?** One generated theme file is
  easy to import but difficult to review. Splitting tokens, component overrides,
  media surfaces, and registries into deterministic modules is clearer but creates
  more files. Which source shape best balances reviewability and faithful rebuilds?
- **What counts as equivalent?** A palette reference and its current hex value may
  render identically today while having different future behavior. The same is true
  of a `calc()` expression and its current computed result. Should equivalence
  require identical authoring intent, identical normalized theme data, identical
  compiled output, or a documented combination?

## Decision log

### DEC-1 — Let authors explicitly choose whether to follow or own

**Reference:** `spec:AST-022/DEC-1`
**Decider:** `rubyycheung`, `2026-09-04`

The palette remains owned by its theme regardless of the theme's inheritance
choice. A theme author may reasonably prefer independent source or continuing base
updates, so tooling explains both consequences and requires a selection. It may
recommend a choice based on the stated goal, but does not choose silently.

### DEC-2 — Use one materialization engine for inheritance and generated scales

**Reference:** `spec:AST-022/DEC-2`
**Decider:** pending

Base-theme detachment and scale freezing both convert resolved authoring behavior
into explicit source. One engine provides consistent preview, equivalence, write,
and receipt guarantees even if the CLI uses different user-facing verbs.

### DEC-3 — Preserve existing generator behavior until migration is reviewable

**Reference:** `spec:AST-022/DEC-3`
**Decider:** `rubyycheung`, `2026-09-04`

Replacing a formula behind unchanged theme source is a visual compatibility break.
Existing helpers remain stable until authors can compare, materialize, and accept a
replacement explicitly.

### DEC-4 — Own inherited executable values or report retained dependencies

**Reference:** `spec:AST-022/DEC-4`
**Decider:** `rubyycheung`, `2026-09-04`

Stable icon, indicator, and syntax imports remain explicit only for dependencies the
author intentionally retains. A fully owned snapshot cannot import an executable
value from its former base because a later base upgrade could change that value.
Tooling instead writes equivalent owned local source or requires the author to
supply a local reference on a later invocation. Retaining the base import is a
reported dependency and prevents the result from being described as fully owned.

### DEC-5 — Preserve locally owned palette references

**Reference:** `spec:AST-022/DEC-5`
**Decider:** `rubyycheung`, `2026-09-04`

A reference to the same theme's committed palette maintains one owned source of
truth and remains a reference by default. External palette dependencies require an
explicit keep-or-copy choice.

### DEC-6 — Compare future bases only on request

**Reference:** `spec:AST-022/DEC-6`
**Decider:** `rubyycheung`, `2026-09-04`

Receipts retain the former base identity and version so an author may request a
future comparison. Comparison does not update the theme or recreate inheritance.

### DEC-7 — Detach updates the existing theme

**Reference:** `spec:AST-022/DEC-7`
**Decider:** `rubyycheung`, `2026-09-04`

Detach exists only as an exit from a previously chosen `extends` relationship. It
adds the resolved values to the selected theme and removes `extends`, preserving the
theme name and caller imports. Version control and the required preview provide the
before/after comparison; the operation does not create a second theme.

### DEC-8 — Full ownership includes every public theme value

**Reference:** `spec:AST-022/DEC-8`
**Decider:** `rubyycheung`, `2026-09-04`

A differences-only file still inherits unspecified Core defaults and therefore is
not fully owned. A fully owned snapshot includes every resolved value available
through the public theme-authoring contract, even when that output is larger.

### DEC-9 — Detach requires an explicit migration for inherited local tokens

**Reference:** `spec:AST-022/DEC-9`
**Decider:** `rubyycheung`, `2026-09-05`

Materialization cannot make a lineage-bound local token portable by copying its
name. Removing the exact base lineage would make that declaration foreign under the
current validator. Detach therefore stops for a reviewed local-token migration; if
the author retains the lineage instead, the result continues to follow that base
and is not fully owned.
