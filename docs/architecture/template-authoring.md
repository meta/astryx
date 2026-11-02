---
schema_version: 1
template_version: 1
kind: architecture
id: architecture:template-authoring
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [josephfarina, cixzhang]
applies_to:
  [
    packages/cli/assets/templates/,
    packages/cli/authoring/doctypes/template/,
    packages/cli/foundation/discovery/template-adapter.mjs,
    packages/cli/foundation/config/project.mjs,
    packages/cli/api/template/,
    apps/docsite/src/components/templateComponents.ts,
    apps/docsite/scripts/generate-data.mjs,
    scripts/sync-templates.js,
  ]
verified_by:
  [
    packages/cli/authoring/doctypes/template/parse.test.mjs,
    packages/cli/foundation/discovery/template-adapter.test.mjs,
    packages/cli/foundation/config/project.test.mjs,
    packages/cli/api/init/init.test.mjs,
    packages/cli/api/template/template.test.mjs,
    packages/cli/api/template/template-integration.test.mjs,
    packages/cli/api/template/template-suffix.test.mjs,
    packages/cli/clients/cli/e2e-smoke.test.mjs,
    apps/docsite/src/__tests__/data-extraction.test.ts,
  ]
deciding_specs: [spec:AST-017/DEC-2]
---

# Template authoring architecture

## Purpose

Astryx templates are copyable starting points. Page templates scaffold complete
content surfaces. Block templates provide focused patterns and component examples.
This record owns their source shapes, catalog identity, validation boundary,
consumer projections, and copy semantics.

It does not copy contributor instructions or internal audit-publication workflow.
The shipped template-quality guide owns the public grading rubric, and the
public contributor guide links to that source.

## System model

### Shipped state

Astryx ships two template kinds. A showcase is a role held by a block, not a third
kind.

| Kind or role         | Current source shape                                                                                           | Current identity and use                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Built-in page        | `pages/<slug>/page.tsx` plus `template.doc.mjs`                                                                | The directory slug is the CLI id. The page is a complete route starting point.        |
| Built-in block       | Paired `<Name>.tsx` and `<Name>.doc.mjs` under `blocks/`                                                       | The file stem is the CLI id. The block is a focused example or reusable pattern.      |
| External block       | The same paired files under a package declared through `astryx.blocks`                                         | The package, type, and file stem identify the entry.                                  |
| Integration template | Paired `<id>.tsx` and `<id>.template.*` or legacy `<id>.doc.*` under a configured integration `templates` root | The package, type, and root-relative id identify the entry. Nested ids are supported. |
| Primary showcase     | A block with `isShowcase: true`                                                                                | Supplies the hero example for its `exampleFor` target.                                |
| Secondary showcase   | A block naming targets in `alsoShowcaseFor`                                                                    | Reuses the same source as the hero example for additional component or hook pages.    |
| Additional example   | A block naming targets in `alsoExampleFor`                                                                     | Reuses the same source in additional Examples sections.                               |

`name` and `displayName` are human-facing labels, not catalog identity. They may
repeat. The resolvable identity is `(package, type, id)`; callers narrow an id that
exists across packages or kinds.

The shipped loaders do not yet share one validation boundary:

- Built-in pages load metadata directly and default some absent values.
- Built-in and external blocks require a paired source file but otherwise load
  metadata directly and default some absent values.
- Integration templates pass through `parseTemplate()` and report missing source,
  load, or envelope errors.

The shipped consumers also collect different sets:

- `discoverAll()` supplies the template API, search, and layout.
- `Project.templates()` independently re-collects integration templates for project
  diagnostics and deduplication.
- `listTemplates()` returns every built-in page directory without reading metadata;
  programmatic `init` uses that list when applying a named starter page.
- The sandbox and docsite generate metadata/source registries independently.
- The docsite overview reads generated metadata, while live page previews depend on
  the separate hand-maintained lazy map in `templateComponents.ts`.

Copying emits source into the adopting project. It does not keep a live relationship
to the catalog, and later template releases do not rewrite copied projects.

### Normalized catalog contract

Before this record can become `current`, every source must normalize into one catalog
entry and pass one validation boundary. That boundary uses these requirements:

| Scope                | Required                                                                                                                 | Optional or conditional                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Every entry          | `id`, `package`, `type`, `name`, `displayName`, non-empty `description`, explicit `isReady`, and an existing source file | `keywords`; source-specific provenance and diagnostics                                |
| Page                 | Everything above; `category` when eligible for the overview                                                              | `scaffold`, `isHiddenFromOverview`; a hidden special-purpose page may omit `category` |
| Block                | Everything above plus `exampleFor`, positive `aspectRatio`, and complete `componentsUsed`                                | `scale`, `isShowcase`, `alsoExampleFor`, `alsoShowcaseFor`                            |
| Primary showcase     | Block requirements plus `isShowcase: true`; at most one resolved primary showcase per `(package, target)`                | The same block may serve additional targets through `alsoShowcaseFor`                 |
| Additional placement | A valid block and a valid target named by `alsoExampleFor` or `alsoShowcaseFor`                                          | Placement does not create another template identity                                   |

Page and block metadata may be authored with richer first-party types or a narrower
integration envelope. Source adapters translate those source-specific shapes into
the common entry. A **projection** is a filtered view of that catalog for one
consumer; it does not discover another membership list.

The converged projections are:

- CLI template and search surfaces select all eligible pages and blocks.
- Layout selects blocks only.
- `init` selects every named built-in page.
- The docsite overview selects ready pages not marked `scaffold` or
  `isHiddenFromOverview`.
- Docsite live previews select the same eligible page entries and import their
  catalog source.
- Component and hook docs select ordinary examples, primary showcases, and explicit
  secondary placements from block metadata.
- Project diagnostics consume the same catalog errors instead of re-collecting
  integration membership.

Invalid required data produces a diagnostic. It is not repaired with an implicit
default or skipped silently. TypeScript checking remains an additional first-party
authoring check; it does not replace runtime catalog validation.

## Boundaries and invariants

- **INV1 — Pages and blocks are the only template kinds.** Showcase and additional
  example placements are block roles, not separate source kinds or identities.
- **INV2 — Identity is separate from labels.** `(package, type, id)` resolves a
  template. `name` and `displayName` may change or repeat without becoming identity.
- **INV3 — Role requirements are explicit.** Every accepted entry satisfies the
  normalized field matrix above. Source pairing and projection metadata are
  validated before a consumer receives the entry.
- **INV4 — Source-specific authoring converges at one boundary.** Built-in, external,
  and integration sources may have different adapters, but none bypasses normalized
  validation.
- **INV5 — One catalog owns membership.** CLI, search, layout, project, `init`,
  sandbox, and docsite differences come from declared projections, not independent
  filesystem scans or hand-maintained membership lists.
- **INV6 — Preview source is shipped source.** A page preview imports the same
  `page.tsx` the catalog serves. A generated lazy-loading map may implement the
  projection, but it does not decide membership.
- **INV7 — Pages remain host-composable.** A normal page owns page content, not the
  host application's global chrome. A page in the explicit `Shell -` category may
  own `AppShell` and global navigation because demonstrating that chrome is its
  purpose. The contributor guide owns the exact root-component recipe.
- **INV8 — Copying is a self-contained snapshot.** The emitted source belongs to the
  adopting project. Repository-only demo assets are replaced during copy so the
  scaffold does not depend on Astryx preview hosting. Later catalog updates do not
  mutate copied projects.
- **INV9 — Catalog values may evolve.** Template ids, labels, metadata, categories,
  example data, and starter source are mutable catalog data under
  `spec:AST-017/DEC-2`.
- **INV10 — The operation surrounding the catalog remains contractual.** The
  `template` command, supported options, exit behavior, and machine-readable
  response schema remain governed by the CLI contract.
- **INV11 — Shared behavior requires a shared contract.** Similar templates do not
  implicitly form a family. Shared states, interactions, responsive behavior, and
  constraints require an approved family, design, or system record.
- **INV12 — Evidence is revision-specific.** A rubric score identifies the exact
  template commit and rubric version it measured. It can support review but cannot
  grant Design approval, implementation approval, or current-record authority.

## Delegated authority

This record does not absorb adjacent facts:

- The shipped `authoring/building-blocks/templates/write-good-templates` guides own the public
  grading rules, rubric version, grade bands, categories, weights, and agent
  workflow. The public
  [Contributing Templates](https://github.com/meta/astryx/wiki/Contributing-Templates)
  guide owns contributor workflow and the score-ledger publication procedure,
  and links to the shipped rubric instead of copying it. Its current statement
  that renaming is breaking is superseded by `spec:AST-017/DEC-2`.
- `design:template-composition` owns shared human visual, hierarchy, responsive, and
  interaction intent. It remains a candidate record while its authority is `draft`.
- Component, module, and family records own the behavior of components composed by a
  template. A good rubric score does not override those contracts.
- `spec:AST-017/DEC-2` owns the compatibility split between mutable catalog values
  and the stable surrounding CLI operation.
- `TemplateDoc` types and `parseTemplate()` implement the authoring envelope. They
  must converge on this record's field requirements; neither silently becomes
  policy when the two disagree.

## Change coupling

- A template source or metadata change re-runs its source adapter, normalized
  validation, and every affected projection check.
- A change to required metadata or a template role updates the TypeScript type,
  runtime parser, contributor field tables, generators, API response, and active
  records together. A material shape change follows the repository's schema-version
  and migration rule.
- A page addition, removal, or projection-flag change updates generated sandbox and
  docsite data and proves live-preview coverage for every admitted page.
- A showcase or example-placement change validates one resolved primary showcase per
  target and regenerates the showcase/example registries.
- A visual or interaction change follows applicable current design, family, and
  component records. One review does not substitute for another.
- A rubric scoring change updates the shipped template-quality guide's version
  and score-ledger contract together. It changes this architecture only when it
  moves a system boundary.
- A proposal to share behavior across several templates updates the relevant family,
  design, or system record rather than inferring a contract from similarity.

## Owning code

- `packages/cli/assets/docs/tree/template-quality.doc.mjs` and its child guides —
  the canonical public rubric and agent grading workflow.
- `scripts/template-score-ledger.mjs` — rubric score persistence; imports the
  canonical version, grade bands, categories, and weights from the guide.
- `packages/cli/assets/templates/` — built-in page and block source plus metadata.
- `packages/cli/authoring/doctypes/template/` — first-party authoring types and the
  runtime template envelope.
- `packages/cli/foundation/discovery/template-adapter.mjs` — current source loaders,
  normalization, projections, and shared template IO.
- `packages/cli/foundation/config/project.mjs` — project diagnostics and current
  integration-template re-collection.
- `packages/cli/api/template/` — list, show, skeleton, and copy operations.
- `scripts/sync-templates.js` — current sandbox registries and preview routes.
- `apps/docsite/scripts/generate-data.mjs` — current docsite page, block, example,
  and showcase registries.
- `apps/docsite/src/components/templateComponents.ts` — current hand-maintained page
  preview loader; its independent membership is a migration gap.

## Deciding specs

- `spec:AST-017/DEC-2` — template identity, metadata, and starter source are mutable
  catalog data; the surrounding CLI operation remains contractual.

## Verification

| Scope                                 | Current evidence                                                              | Missing before `current`                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Source shapes and integration parsing | `parse.test.mjs`, `template-suffix.test.mjs`, `template-integration.test.mjs` | One corpus check that runs every shipped page and block through the normalized boundary         |
| Catalog membership and diagnostics    | `template-adapter.test.mjs`, `project.test.mjs`                               | One catalog implementation; no duplicate collection; every invalid source reported consistently |
| `init` projection                     | `init.test.mjs`                                                               | Selection of every named built-in page from the catalog instead of a directory scan             |
| Docsite and sandbox projections       | `data-extraction.test.ts`, generated registry checks                          | Membership parity and live-preview coverage derived from catalog metadata                       |
| Copy boundary                         | `template.test.mjs`, `template-suffix.test.mjs`                               | Mutation coverage for preview-only asset removal and snapshot independence                      |
| Rubric evidence                       | Versioned scorecards carrying `commit` and `rubricVersion`                    | None for architecture; scores remain audit evidence rather than authority                       |

## Shipped-catalog audit

An exact-source audit at `067b176` found:

- 53 page source/metadata pairs. All pass the current `parseTemplate()` boundary.
  Forty are ready, non-scaffold pages visible in the overview projection. One of
  those, `work-item-detail`, lacks a live-preview loader.
- All forty overview-visible pages preserve the host-chrome boundary. The only
  source-shape exception is the unfinished `messaging-shell`; `blank` is an
  intentional minimal scaffold rather than a gallery page.
- 644 block source/metadata pairs with no orphaned source or metadata files. Every
  block declares `type`, `name`, `displayName`, `isReady`, `exampleFor`, positive
  `aspectRatio`, and non-empty `componentsUsed`. The audit did not prove that every
  array names every component imported by its source; that completeness still needs
  an executable check.
- 158 primary showcase blocks resolve to 158 distinct primary targets. Fourteen
  blocks add secondary showcase targets and twenty add secondary example targets;
  the 174 expanded showcase targets have no collisions.
- Thirty-five primary showcases omit `description`. Current built-in discovery turns
  that into an empty string, while `parseTemplate()` rejects it. This is a metadata
  backfill gap, not an intentional showcase exception.
- Core block file-stem ids are unique. Three pairs share human-facing `name` values;
  that is allowed by INV2 and creates no CLI ambiguity.
- The TypeScript type, runtime parser, and contributor field tables disagree about
  whether `displayName`, `description`, `isReady`, `exampleFor`, `aspectRatio`, and
  `componentsUsed` are required. The parser also accepts `preview`, which the
  TypeScript type does not declare. They must be aligned before this record becomes
  `current`.

## Decision log

### Catalog convergence direction — 2026-09-05

One validated catalog owns template membership. Source-specific authoring shapes may
remain different, but each source normalizes through the same validation boundary.
CLI, `init`, project, sandbox, and docsite behavior become explicit metadata-driven
projections. Parallel collectors and hand-maintained membership are migration gaps.

### Corpus audit — 2026-09-09

Every shipped page and block was enumerated at `067b176`. The audit added the role
matrix above and identified enforcement, metadata, and preview-registration gaps.
Those gaps block promotion to `current`; they do not make the inventory disappear or
turn existing audit scores into architecture authority.

## Open questions

- **OQ1 — Approval routing.** Which repository owners must approve a change that
  crosses both template visual intent and authoring/runtime behavior before this
  record can become `current`?
- **OQ2 — Rubric home.** Should the versioned grading rubric move into its own
  repository record while the wiki becomes a contributor-facing reference, or
  should the wiki remain its authority?
