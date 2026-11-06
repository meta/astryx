---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-039
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
phase: implementing
owners: [josephfarina]
affects_architecture: [architecture:cli-surface]
affects_families: []
affects_contributing: [contributing:cli-conventions]
affects_consumer_docs: [authoring]
---

# Integration contribution descriptor system spec

## Intent

Every discoverable item that an Astryx integration contributes has one local,
strongly typed description beside the item it describes. A contributor can
understand, author, validate, move, and package one item without editing a
second catalog elsewhere in the package.

The canonical descriptor is `<source-stem>.doc.mjs`. It is the only source of
per-item metadata. The integration manifest locates contribution roots and
holds integration-level capabilities; it does not catalog the items below a
root. There is no central catalog of items anywhere, in any form (FR11): 0.6
shipped one for themes by mistake, and it had to be removed as a breaking
change.

## Non-goals

- Remove a released compatibility reader before the normal breaking-change and
  migration process permits it.
- Make runtime integration features such as `debug` or `gapReport` into item
  contributions. Their typed named-export contract remains owned by
  `spec:AST-031`.
- Put build receipts, generated output manifests, or consumer runtime data into
  authoring descriptors.
- Require a separate executable source file for a reference doc whose
  `.doc.mjs` is itself the complete payload.
- Execute contributed source during discovery to learn its metadata.

## Requirements

- **FR1 — Every discoverable item owns one canonical descriptor.** A new or
  newly authored component, template, theme, doc topic, codemod, or future item
  contribution MUST have exactly one `<source-stem>.doc.mjs` descriptor. When
  the item has a primary source or payload file, the descriptor MUST be beside
  it and MUST use the same stem. A reference doc is both descriptor and payload.
- **FR2 — Descriptors are strongly typed authoring modules.** Every descriptor
  kind MUST export a public TypeScript type from
  `@astryxdesign/cli/authoring`, use that type in a JSDoc annotation, and
  expose its value through the kind's canonical export (the stamped default
  export for a new descriptor kind). Discovery MUST parse the loaded value through the kind's public authoring parser at the load
  boundary. A new kind is incomplete without its type, parser, self-doc, and
  parser tests.
- **FR3 — The descriptor is the sole item-metadata authority.** Per-item names,
  labels, descriptions, readiness or maintenance state, source relationship,
  and copy metadata MUST NOT be duplicated in a root JSON catalog, an array in
  `astryx.integration.*`, or another package-level registry. The integration
  manifest MAY locate roots and declare integration-level metadata or runtime
  capabilities. It MUST NOT enumerate the items under a root. Per-item options,
  such as `replaces` and `extends`, belong in the item's own descriptor.
- **FR4 — Pair identity is structural.** Discovery MUST derive the primary
  source path and any source-bound runtime export identity from the shared
  descriptor/source stem when that relationship is structural. The descriptor
  owns the stable public item identity. A component descriptor's `name` is the
  runtime export it documents: when the same-stem source has no runtime export
  named after the stem, that `name` MAY name another runtime export of the
  source, and discovery records the component under that name. Each full entry a
  component descriptor lists in `components` is a component under its own name
  when the module the descriptor's import names exports it. When the pack
  lifecycle writes the file that import names, `integration verify` compares
  that descriptor's members as discovery lists them after the pack. Every
  surface (FR7) lists, finds, and verifies these components by those names, and
  a source that exports its stem keeps the stem. A name discovery records only
  this way MUST NOT take an exact unscoped lookup that Core, a legacy docs
  package, or a component named after its source answers, and the stem of a
  descriptor recorded under another name yields the same way to Core and to a
  component named after its source: such a lookup returns that owner's component
  unless a declared replacement claims the name, a lookup scoped to the package
  returns the package's component, and Doctor reports a recorded name Core
  shares. An exact name, including one discovery records this way, takes
  precedence over Core's keyword fallback. Discovery MUST reject a missing
  source, more than one eligible same-stem source, an invalid inferred export
  name, or a descriptor whose authored identity conflicts with its required
  directory identity. A template answers to its display name too when that
  name holds every word of the component it shows; a variant label alone does
  not.
- **FR5 — Multi-file items have one confined ownership boundary.** A kind whose
  item needs nested source, token, palette, asset, or receipt files MUST define
  one item-local copy and pack boundary. Discovery and authoring MUST enumerate
  that boundary without a second catalog, keep every path inside it, and copy
  the complete owned set. A missing local dependency, an escaped path, and an
  unexpected symlink target MUST fail before consumer writes.
- **FR6 — Discovery does not execute contributed payload source.** Loading a
  descriptor follows the established doc-module boundary. Executable component,
  theme, template, and codemod payloads MUST be inspected or resolved without
  running them during discovery. Static validation MUST reject type-only or
  missing runtime exports where a runtime binding is part of the contract.
- **FR7 — One discovery seam serves every downstream surface.** Listing,
  package ownership, ambiguity handling, authoring verification, Doctor,
  package inventory, packed-consumer verification, and materialization MUST
  consume the same normalized discovered record. A writer MUST verify its output
  through that seam rather than reimplementing the format.
- **FR8 — Authoring emits only the canonical form.** `astryx integration add`
  and its typed APIs MUST write `.doc.mjs`, the public JSDoc type annotation,
  and the conventional export. They MUST NOT create a new legacy alias, central
  item catalog, untyped object, or duplicated metadata source.
- **FR9 — Released aliases are compatibility inputs, not authoring precedent.**
  Readers MAY retain a released alternate suffix or combined module while the
  compatibility policy requires it. New writers and examples MUST use the
  canonical descriptor. Each retained alias MUST be isolated, tested as a
  compatibility path, and excluded from the design of new contribution kinds.
  Canary-only formats have no compatibility claim.
- **FR10 — Theme registration is the first clean application.** A theme root
  contains one directory per lower-kebab slug. That directory contains a theme
  source and mandatory same-stem `.doc.mjs`. `ThemeDoc` owns `name`,
  `displayName`, `description`, and `maintained`; the source entry and named
  runtime export come from the shared stem. The directory is the recursive copy
  and pack boundary. `themes/manifest.json` MUST NOT remain as a fallback
  reader. The catalog shipped in stable `0.6.3`, so its removal is a breaking
  change: it ships in a minor release with a codemod that turns each catalog
  entry into that theme's descriptor, and a themes root that still holds the
  catalog fails with a message that names the migration.
- **FR11 — Never catalog items centrally.** No change MAY add, for any kind, a
  file under a root that lists that root's items (`themes/manifest.json`, a
  `components/index.json`, or similar), a per-item map or list in
  `astryx.integration.*` (for example a map of template replacements or a list
  of themes), or a registry that authors keep in sync by hand. Adding one item
  MUST NOT change a file its siblings share; only the integration manifest and
  `package.json` may change, to declare a new root. Review MUST reject a change
  that adds a central catalog, and writer tests MUST fail on one.
- **FR12 — Documented component props agree with the source.** Governed by
  `architecture:cli-surface` INV33.
- **FR13 — Every descriptor satisfies its published authoring type.** Governed by
  `architecture:cli-surface` INV34.
- **FR14 — One command checks an integration, and can gate its build.** Governed by
  `architecture:cli-surface` INV35.

### Compatibility transition

The final rule applies to every kind. Existing released inputs move to it
without pretending they were never released:

- components and reference docs already use `.doc.*`; new authoring narrows to
  strongly typed `.doc.mjs` while released suffixes remain readable;
- templates keep their released `.template.*` reader, but new authoring and
  examples use the already-supported `.doc.mjs` pair;
- themes replace the JSON catalog, released in `0.6.3`, as a breaking change:
  no dual reader, and a codemod converts each package;
- combined codemod modules and inline `agentDocs` remain released compatibility
  inputs until their paired-descriptor migrations ship; they do not permit
  another contribution kind to omit a descriptor.

## Current-state impact

This specification owns a distinct boundary that no current system spec covered.
`spec:AST-031` explicitly excludes default-manifest item contributions, while
`architecture:cli-surface` describes the implementation but cannot authorize a
new cross-kind authoring rule.

This specification replaces the catalog claim in
`architecture:cli-surface/INV19` with one mandatory per-theme descriptor. It
adds a general descriptor invariant to the CLI architecture and contributor
checklist. The theme change updates public authoring types, discovery, bundled
assets, integration authoring, package inventory, pack verification, consumer
docs, and real provider-to-consumer tests.

The contract does not change `DefineThemeInput` or `DefinedTheme`. Theme package
metadata stays outside Core runtime authoring, consistent with
`architecture:theme-authoring-contract/INV11`.

## Verification

| Contract | Verification                                                                                                                       | Representative states                                                                                                                                      | Mutation or failure expectation                                                                                                                                                                                                                |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1–FR4  | authoring parser, discovery, and writer tests                                                                                      | valid pair; missing/duplicate source; bad identity; malformed/missing doc                                                                                  | a source without its typed same-stem descriptor becomes visible, or duplicated metadata can win                                                                                                                                                |
| FR4      | discovery, lookup, search, Doctor, and pack-check tests                                                                            | a doc naming another export of its file; a file exporting its stem; a family member the import exports; one it does not; a recorded name Core also has     | one surface misses a component's name, a doc named after its file reads differently, or an unscoped lookup Core answers returns another package's component                                                                                    |
| FR5–FR7  | contribution inventory, pack-check, materialization, and real-world integration tests                                              | nested files; symlink/escape; missing import; local vs packed; duplicate package slug                                                                      | a nested file is omitted, an escaped file is copied, or two surfaces disagree on ownership                                                                                                                                                     |
| FR6      | static source-graph and runtime-export tests                                                                                       | direct export; re-export; type-only export; source side effect                                                                                             | discovery executes source or accepts no runtime binding                                                                                                                                                                                        |
| FR8–FR9  | integration-add snapshots and compatibility fixtures                                                                               | new writer output; released template/codemod/agent guidance input                                                                                          | a writer emits an untyped or non-`.doc.mjs` item, or a compatibility reader becomes the new canonical form                                                                                                                                     |
| FR10     | bundled-theme, integration-theme, and provider-to-consumer tests                                                                   | all bundled themes; multi-theme package; list/add/build; no JSON catalog                                                                                   | removing a theme doc still passes, or restoring `manifest.json` becomes necessary                                                                                                                                                              |
| FR11     | integration-add writer tests; catalog codemod tests                                                                                | second item of a kind; leftover 0.6 catalog                                                                                                                | adding an item writes a shared file, or a leftover catalog is read instead of refused                                                                                                                                                          |
| FR12     | prop-drift unit tests; `doctor integration components` tests; a repository test over every shipped component descriptor            | each finding kind; a type written differently but equal; props declared in another package; no TypeScript installed                                        | a removed or renamed prop or a changed union passes unreported, or a missing compiler reads as a pass                                                                                                                                          |
| FR13     | doc type unit tests; `doctor integration validate` tests; a repository test over every shipped descriptor and translation          | each finding kind; a field hidden behind an unknown field; a descriptor in another kind's root; an annotation naming another type; no TypeScript installed | an unknown, missing, or mistyped field passes unreported, or a missing compiler reads as a pass                                                                                                                                                |
| FR14     | `integration check` text and JSON tests, with and without `--strict`; a test that lists every finding that fails it; a search test | a clean package; a warning only; an error in one check; no manifest; a skipped comparison; a search for ci                                                 | the default exit differs from a check's own, a warning or a skipped comparison passes `--strict`, text and JSON exit differently, a new failing finding is added without the list changing, or a search for ci does not find the command first |

## Decision log

### DEC-1 — Use one typed same-stem descriptor per contribution item

**Reference:** `spec:AST-039/DEC-1`
**Decider:** `joeyfarina`, `2026-09-12`

A contribution's description belongs beside the source or payload it describes.
One typed module gives editors and the CLI the same contract, makes the item
movable as a unit, and prevents a root catalog from drifting away from source.
The integration manifest remains a root locator and integration-capability
boundary.

Rejected: a central JSON catalog. It creates a theme-only authoring language,
duplicates source identity, and allowed the CLI to accept a format that does not
follow the repository's `.doc.mjs` convention.

Rejected: an optional descriptor layered over the JSON catalog. Two metadata
sources need precedence and drift rules and preserve the design defect.

### DEC-2 — Infer theme source identity and own the whole theme directory

**Reference:** `spec:AST-039/DEC-2`
**Decider:** `joeyfarina`, `2026-09-12`

A theme source and descriptor share one stem. That stem identifies the entry and
required named runtime export. The lower-kebab parent directory and `ThemeDoc.name`
agree on the CLI slug. The complete theme directory, including its descriptor, is
the copy and pack boundary, so nested files do not require an authored
allowlist.

Rejected: carrying `entry`, `exportName`, and `files` forward into `ThemeDoc`.
Those fields restate structure that discovery can prove directly and recreate
the catalog inside each file.

### DEC-3 — Preserve released readers without weakening new authoring

**Reference:** `spec:AST-039/DEC-3`
**Decider:** `joeyfarina`, `2026-09-12`

Stable `0.6.0` already reads template, codemod, and inline agent-guidance forms
that predate this rule. Compatibility readers remain until their normal
migration path permits removal. All new writers and new contribution kinds use
the canonical descriptor immediately. The theme catalog, which shipped in stable
`0.6.3` by mistake, receives no compatibility reader; it is removed as a
breaking change with a codemod (DEC-4).

Rejected: treating every historical form as a permanent equal convention. A
reader kept for compatibility does not define what the authoring system should
create next.

### DEC-4 — No central catalog or manifest map, for any kind

**Reference:** `spec:AST-039/DEC-4`
**Decider:** `joeyfarina`, `2026-09-24`

The theme catalog that `integration add theme` wrote in 0.6 was a bug: it put
per-item details in one central file, against the rule every other kind
follows. It reached stable `0.6.3` before anyone caught it. It is removed as a
breaking change, with a codemod that converts each package, and FR11 now
forbids the pattern outright so that no kind repeats it.

This supersedes `spec:AST-035/DEC-1`, a draft that keeps template replacements
as a map in the integration manifest: a template's `replaces` belongs in its own
descriptor.

Rejected: a manifest map for replacements only. It is the same central catalog,
one field at a time.

## Open questions

None.
