---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-035
authority: current
archive_reason: null
superseded_by: null
approved_by: josephfarina
approved_at: 2026-10-09
phase: accepted
owners: [josephfarina, cixzhang]
affects_architecture: [architecture:cli-surface]
affects_families: []
affects_contributing: [contributing:templates, contributing:api-conventions]
affects_consumer_docs: [authoring]
---

# Integration template and component replacement system spec

## Intent

Let an installed integration provide the project-specific implementation of a Core
template or a Core component without making the common lookup ambiguous or removing
access to the Core original.

## Non-goals

- Replacing reference-doc topics. That surface owns its own contract.
- Rewriting template or component source that a consumer already copied into an app.
- Making an integration template or component available when its source or metadata
  is invalid.
- Selecting an integration that the project neither configures nor autolinks.

## Requirements

- **FR1 — A template declares its own replacement.** An integration template MAY
  set `replaces` in its own metadata to an existing Core template id. No
  package-level map declares replacements (`spec:AST-039/FR11`). The field is part
  of the strict template metadata object, so stable CLIs before 0.6.4 reject it;
  an integration that uses it MUST declare an `@astryxdesign/cli` peer range whose
  lowest admitted version is at least 0.6.4, the first stable release that applies
  it (DEC-7).
- **FR2 — A valid replacement owns default discovery.** When one valid declaration
  applies, unqualified template lookup and default template projections MUST use the
  integration template for the Core id. The integration template MUST remain
  addressable by its own id. List, search, build suggestions, Project discovery, and
  block-layout lookup MUST project the same winner.
- **FR3 — Explicit package selection preserves alternatives.** Selecting
  `@astryxdesign/core` MUST address the original Core template. Selecting an
  integration package MUST retain access to its shadowed or rejected template by its
  own id.
- **FR4 — Invalid declarations fail closed.** A missing Core target, template-kind
  mismatch, a declaration on a template that cannot be used, or more than one
  declaration for one target inside a package MUST be an error. An invalid set MUST NOT replace Core. Valid integration
  templates remain available by their own ids when replacement metadata alone is
  invalid.
- **FR5 — Precedence is deterministic.** When multiple explicitly configured
  integrations validly replace one target, the integration configured later wins and
  the CLI reports a warning. An explicitly configured replacement MUST win over an
  autolinked replacement. When only autolinked integrations validly replace one
  target, the dependency listed later in package.json wins with a warning; naming
  the intended package in `astryx.config` makes precedence explicit. Invalid
  autolinked declarations remain reportable but MUST NOT disable a valid explicit
  replacement.
- **FR6 — Omission preserves selection behavior for valid integrations.** Without
  `replaces`, valid template selection and package-aware ambiguity remain
  unchanged. FR9 intentionally changes failure isolation with or without the field.
- **FR7 — Diagnostics preserve the released contract until support begins.**
  Existing same-id conflicts MUST keep the released warning-only response shape
  throughout 0.6.x. Replacement-specific diagnostics MAY be implemented for
  pre-publication validation, but their `relationship`, optional `replaces`, and
  `severity: 'info'` fields do not enter the stable conflict API until 0.7.0.
  Reaching 0.7.0 MUST NOT expand the schema by version alone: one deliberate
  projection change MUST update the response type, generated reference, terminal
  output, consumer documentation, and tests together. From that supported boundary,
  `astryx doctor integration templates` MUST report intentional replacements, missing targets, declarations on templates that cannot
  be used, kind mismatches, and same-package ambiguity. Error findings MUST produce
  exit code 1 and MUST NOT be followed by a false success message.
- **FR8 — Public schema projection is complete at its supported boundary.**
  Effective `template.list` entries MAY include optional `replaces`; adding that
  optional field is nonbreaking. At or after 0.7.0, an explicit projection update
  MUST change the response type, generated inventory, terminal projection, consumer
  documentation, and tests together; a package-version bump alone MUST leave the
  warning-only response unchanged.
- **FR9 — Failure isolation preserves valid contributions.** An error in one
  contribution kind MUST remain reportable without removing the integration's other
  valid contribution kinds. Within template and component discovery, one unusable file
  MUST NOT remove valid siblings. Other kinds keep their existing per-kind atomicity. A
  manifest load failure still withdraws the integration because no contribution roots
  are trustworthy. This rule applies whether or not any template declares `replaces`.
- **FR10 — A component declares its own replacement, and the CLI floor turns it on.**
  An integration component MAY set `replaces` in its own ComponentDoc to the exact
  `name` of a component in the Core component catalog. The replacement applies only
  when the component's package declares a `@astryxdesign/cli` peer range whose lowest
  admitted version is at least the first stable CLI release that applies component
  replacement (`COMPONENT_REPLACES_CLI`). That range is the package's opt-in. Stable
  CLIs before that release accept the field and keep the component under its own name.
- **FR11 — An applied component replacement owns unqualified component lookup.** The
  replacing component answers to the Core component's name in component detail and
  batch selectors, takes the Core component's slot at every component-list detail
  level, is the component search result for that name, is the component an unqualified
  `swizzle <Name>` copies, and is where gap-report routing sends a report for that name. It
  remains addressable by its own name. Every one of those results names the replacing
  component's own package (`architecture:cli-surface` INV28).
- **FR12 — Explicit Core selection preserves the original component.** Selecting
  `@astryxdesign/core` in component detail, batch selectors, and swizzle MUST address
  the original Core component. `swizzle --list` lists Core's components, a replaced one
  included.
- **FR13 — Invalid component declarations fail closed for packages that opt in.** For a
  package with the FR10 range, a `replaces` that names no Core catalog component, a
  value that is not a non-empty string, a component whose own name is a different Core
  component, and more than one declaration for one target inside the package MUST each
  be an error in `astryx doctor integration components`, which then exits 1. An invalid
  set MUST NOT replace Core. Valid components remain available by their own names
  (FR9).
- **FR14 — Component precedence is deterministic.** When several packages with the
  FR10 range validly replace one Core component, the FR5 order decides the winner: an
  explicitly configured package wins over an autolinked one, the package configured
  later wins among configured packages, and the dependency listed later wins among
  autolinked packages. Doctor warns whenever more than one package contends. An invalid
  autolinked declaration MUST NOT disable a valid explicit replacement. An integration
  component from another package whose own name is the replaced Core name is shadowed
  for unqualified lookup, stays addressable through its package, and Doctor warns.
- **FR15 — A package without the floor keeps its released behavior.** Its component
  `replaces` declarations never apply, and an app that loads the package sees no new
  output from them. Every finding about them, including the one that names the FR10
  range, is a warning reported to the package's author by
  `astryx doctor integration components`, so no command's result or exit code changes
  because of them. `integration pack --check` warns, and never fails, when a component
  sets `replaces` and the package's range admits an earlier stable CLI.

### Platform support

- Minimum supported CLI for an integration whose template declares `replaces`:
  `@astryxdesign/cli >=0.6.4`. Earlier stable CLIs parse template metadata strictly:
  they reject the field, print one warning, drop that template, and withhold the
  package's doc topics, while its other templates and its components still load.
- Stable 0.6.x conflict responses retain their warning-only shape. The
  replacement-specific conflict schema becomes eligible for an explicit, complete
  projection update at 0.7.0; version alone does not activate it.
- Component replacement: `@astryxdesign/cli >=0.6.7` is both the minimum supported CLI
  and the opt-in (FR10). Earlier stable CLIs accept a component's `replaces` and keep
  the component under its own name, with the Core component still selected.
- Browser evidence: not applicable to catalog selection. A generated consumer app
  MUST still build or run when its selected template renders integration-owned
  navigation.

## Current-state impact

The template metadata type and parser accept one optional field, `replaces`. Shared
template resolution owns replacement validation, precedence, aliases, and the default
discovery view. Template commands, search/build, Project, layout, Doctor,
response documentation, and the integration-authoring guide project that result.
Project reports invalid contributions while retaining other valid contribution kinds
and valid template or component siblings.

The field is optional, and valid templates keep their selection behavior when it is
absent. Stable releases from 0.6.4 apply a declared replacement, and an integration
package that uses one requires `@astryxdesign/cli >=0.6.4`, a range that excludes
every stable release that rejects the field. Template winners are mutable catalog
data, so replacement selection does not create a released victim. The optional
`TemplateListEntry.replaces` field is additive.

The released `IntegrationTemplateConflict` response is different: existing same-id
conflicts are already stable. Final 0.6.x preserves their warning-only shape. The
required `relationship` field and `severity: 'info'` value remain staged for a
deliberate complete projection update at or after 0.7.0. A package-version bump
alone leaves the warning-only projection in place. Under `spec:AST-017/FR1`, FR2,
FR5, FR7, and FR9–FR13, the capability plus its compatibility gate is a `[feat]`
patch, not a breaking minor.

Component discovery reads `replaces` from each valid component doc, and one resolver
decides component replacement, precedence, and findings. Component detail, batch
selectors, every list detail level, search, swizzle copy, gap-report routing, Project
issues, and `astryx doctor integration components` read its result. Stable CLI
releases before `COMPONENT_REPLACES_CLI` accept a component `replaces` and ignore it. A
package whose range admits one of them keeps its components' names, the Core
components stay selected, an app that loads it sees no new output, and its author sees
warnings in the package checks. A package whose range already starts later, such as
the `>=0.7.0` that earlier `integration add theme` and `integration add doc --parent`
wrote, opts in unchanged; its range excludes every CLI that ignores the field, so no
supported combination changes. Under `spec:AST-017/FR1`, FR5, and FR12, component
replacement is a `[feat]` patch.

## Verification

| Contract   | Verification                                                                             | Representative states                                                                                                 | Mutation or failure expectation                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| FR1, FR6   | Template parser and discovery tests, floor-table test, released-CLI consumer run         | field present, field absent, published 0.6.3 and 0.6.4 CLIs, peer range at and below the floor                        | a replacement is honored from anywhere but the template's own metadata, or verify accepts a range below the floor   |
| FR2, FR3   | Template API/CLI and real consumer-app tests                                             | target id, own id, Core package, integration package                                                                  | lookup becomes ambiguous or the Core original is unreachable                                                        |
| FR4, FR7   | Doctor and discovery tests plus a 0.6.x response-shape fixture                           | missing local/source, missing target, wrong kind, duplicate, same-id rejection, pre-publication replacement           | invalid metadata activates a replacement, Doctor reports success, or a 0.6.x conflict gains staged fields           |
| FR5        | Multi-integration and autolink tests                                                     | configured order, explicit versus autolinked, invalid loser                                                           | file/display order chooses the winner or invalid autolinking disables explicit intent                               |
| FR2, FR8   | List, search/build, Project, layout, response, and generated-doc checks                  | alias plus undeclared exact-id collision, page and block, explicit 0.7 schema projection                              | two projections disagree, a public field is undocumented, or version alone expands the conflict schema              |
| FR9        | Project discovery and issue-order tests                                                  | invalid component/template siblings, valid contribution kinds and siblings                                            | one bad contribution removes unrelated valid output                                                                 |
| FR10, FR15 | Floor-table test, resolver tests, and a published-CLI consumer run                       | range at the floor, no range, lower range; latest stable CLI with the field                                           | a package without the range gets a replacement, an error, or a changed exit code                                    |
| FR11, FR12 | Component, batch, list, search, swizzle, and gap-report tests plus a packed consumer run | target name, own name, Core package selector, every list detail level                                                 | a surface selects a different owner than component detail, a result omits the owner package, or Core is unreachable |
| FR13       | Resolver and `doctor integration components` tests                                       | missing target, invalid value, own name is another Core component, two declarations in one package                    | invalid metadata replaces Core, or Doctor exits 0 with an error finding                                             |
| FR14       | Multi-integration resolver tests                                                         | configured order, explicit versus autolinked, autolinked only, invalid autolinked loser, shadowed same-name component | file or display order chooses the winner, or an invalid autolinked declaration disables explicit intent             |

## Decision log

### DEC-1 — Replacement declarations live on the integration manifest

**Reference:** `spec:AST-035/DEC-1`
**Proposed by:** `josephfarina`, `2026-09-11`
**Superseded by:** `spec:AST-035/DEC-3` and `spec:AST-039/DEC-4`, `2026-09-24`

Use `templateReplacements: Record<integrationTemplateId, coreTemplateId>` on the
integration manifest. This makes intent explicit. CLIs from 0.5.3 onward ignore the
field when it is unknown without rejecting understood contributions; integrations
that use it must not claim compatibility with 0.5.2 or earlier. Supported integration
use starts in 0.7.0; the implementation may ship earlier for forward validation.

Rejected: adding `replaces` directly to `TemplateDoc`. A CLI released before that
field would reject the strict metadata object and make the integration template
unavailable instead of degrading cleanly.

### DEC-2 — Explicit project configuration owns replacement precedence

**Reference:** `spec:AST-035/DEC-2`
**Proposed by:** `josephfarina`, `2026-09-11`

Use configuration order when more than one explicitly configured package replaces a
target, and prefer any explicit replacement over autolinking. This keeps the
consumer-authored config authoritative while making valid conflicts deterministic and
visible.

Rejected: making every cross-package replacement ambiguous. That would prevent a
consumer from intentionally composing integrations in a declared order. Also
rejected: letting autolinking override explicit config merely because it is appended
to discovery later.

### DEC-3 — A template declares its own replacement

**Reference:** `spec:AST-035/DEC-3`
**Proposed by:** `josephfarina`, `2026-09-24`

Put `replaces` in the integration template's own metadata. Every integration item
keeps its per-item metadata in its own descriptor (`spec:AST-039/FR11`), and doc
topics already declare replacement with the same field. The cost: a stable CLI
before 0.6.4 rejects the unknown field, drops that template, and withholds the
package's doc topics, where the manifest map let it fall back to own-id access.
Integration themes, section ids, and namespace docs already need a 0.6.4 CLI, so
this adds no new kind of break; integrations that use `replaces` declare the CLI
floor in DEC-7.

Rejected: `templateReplacements` in the manifest (DEC-1). It is a central catalog of
per-item data, which `spec:AST-039/FR11` forbids for every kind.

### DEC-4 — Pre-publication replacement support is patch-compatible

**Reference:** `spec:AST-035/DEC-4`
**Decider:** `josephfarina`, `2026-09-29`
**Superseded in part by:** `spec:AST-035/DEC-7`, `2026-10-09`

Integration-template replacement is not a fully published API before the supported
0.7.0 integration-package boundary. Shipping its implementation in final 0.6.x is
therefore additive and patch-compatible: there is no valid latest-stable
integration consumer whose supported behavior changes. Template winners are mutable
catalog data, and the optional list field is additive.

This does not relax the stable CLI schema around the unpublished capability. Existing
same-id `IntegrationTemplateConflict` responses keep their warning-only shape through
0.6.x. At or after 0.7.0, replacement-specific `relationship`, `replaces`, and
`severity: 'info'` require one deliberate projection change across runtime, types,
generated reference, terminal output, documentation, and tests; version alone does
not activate them. Integration packages using `replaces` still require
`@astryxdesign/cli >=0.7.0`, protecting older strict metadata readers.

Rejected: calling the unpublished replacement behavior breaking merely because its
future schema differs; exposing the expanded conflict schema in 0.6.x; or gating all
replacement implementation when the supported package boundary and stable-schema
adapter already protect released consumers.

### DEC-5 — A component declares its own replacement, and the CLI floor is the opt-in

**Reference:** `spec:AST-035/DEC-5`
**Decider:** `josephfarina`, `2026-10-07`

A component's `replaces` lives in its own ComponentDoc, as a template's does (DEC-3).
Stable releases before the floor accept the field and document replacement without
applying it, so applying every declaration at once would change selection for packages
whose range admits those releases. The CLI applies a package's component replacements
only when its `@astryxdesign/cli` peer range starts at the first release that applies
them. A package whose range admits an earlier CLI keeps its behavior; a range that
already starts later, such as `>=0.7.0`, excludes every CLI that ignores the field, so
no supported combination changes. New packages get one documented switch they already
manage for other features.

Rejected: applying every declared `replaces` immediately — it changes released selection without the package asking.
Rejected: an app configuration key — the package already states its intent, and `spec:AST-017/FR19` admits configuration only on evidence.

### DEC-6 — Component replacement uses template replacement's precedence and failure rules

**Reference:** `spec:AST-035/DEC-6`
**Decider:** `josephfarina`, `2026-10-07`

One resolver applies FR4, FR5, and FR9 to components with the component-specific
checks of FR13, and every component surface reads its result. An integration author
learns one set of rules for both kinds, and no two component surfaces can disagree
about the winner.

Rejected: per-surface resolution — component, search, and swizzle would drift apart.

### DEC-7 — The template replacement floor is the first release that applies it

**Reference:** `spec:AST-035/DEC-7`
**Decider:** `josephfarina`, `2026-10-09`

An integration whose template sets `replaces` declares an `@astryxdesign/cli` peer
range that starts at 0.6.4, in place of DEC-4's `>=0.7.0`. Published 0.6.4 through
0.6.7 apply FR2 and FR3 to a declared replacement, and published 0.6.3 and earlier
reject the field. A floor that no published release satisfies makes npm leave the
CLI uninstalled in an app that installs the package. From 0.6.4, the `replaces`
declaration, replacement selection, and the optional list projection are published
surfaces under `spec:AST-017/FR24`; the expanded conflict fields stay
pre-publication until the projection change of FR7 and FR8 at or after 0.7.0.

Rejected: keeping `>=0.7.0` until 0.7.0 ships, because npm removes the CLI from apps on 0.6.x that install such a package.

## Open questions

None.
