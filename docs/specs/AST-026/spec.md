---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-026
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
phase: implementing
owners: [cixzhang, josephfarina]
affects_architecture: [architecture:public-component-api]
affects_families: []
affects_contributing: [contributing:templates]
affects_consumer_docs: [shadcn-compatibility, templates, components]
---

# shadcn Registry compatibility system spec

## Intent

Let builders install Astryx components, component showcases, example blocks, and
page templates through the standard shadcn Registry protocol without making
Astryx a shadcn-based library or copying Astryx component implementations into
consumer repositories.

The compatibility layer meets builders inside an existing shadcn workflow. The
Astryx CLI remains the primary, richer interface for discovery, composition,
integrations, themes, validation, and upgrades.

This record governs the approved compatibility foundation. The implementation
may merge behind the canary docsite while copied-composition upgrades remain the
launch gate for the production endpoint and announcement.

## Non-goals

- Replacing the Astryx CLI with the shadcn CLI.
- Defining a second, Astryx-only registry format.
- Copying Core or Lab component implementation source during a normal install.
- Treating generated examples, blocks, or pages as byte-stable public API.
- Publishing an unsupported service-level agreement or making copied
  compositions package-controlled implementation source.
- Changing the explicit `astryx swizzle` escape hatch for deep customization.

## Requirements

- **FR1 — Standard protocol.** Every registry item MUST validate against the
  standard shadcn Registry schema and use a standard registry item type. A
  standard shadcn client MUST NOT need Astryx-specific code to read or install
  the item.
- **FR2 — Preserve the package boundary.** A component install MUST add the
  published Astryx package dependency and create only consumer-facing import or
  re-export source. It MUST NOT copy the component implementation, private
  helpers, or uncompiled StyleX source.
- **FR3 — Complete requested catalog.** The experiment MUST cover every public
  component or hook, every component showcase and example block, every other
  block, and every ready page template available from the same catalog the CLI
  and docsite use.
- **FR4 — Editable compositions.** Showcase, example, block, and page items MAY
  copy application-level composition source. That source MUST import Astryx
  through published package paths, declare all non-React package dependencies,
  and contain no relative import that escapes the copied item.
- **FR5 — Deterministic, stable identity.** Item names, organized URL paths,
  target paths, dependency lists, and JSON output MUST be deterministic and
  collision-free. Identity MUST derive from stable doc/catalog fields, not
  display labels or source filenames. Display-name changes MUST NOT change
  install URLs. Published renames MUST preserve prior routes as aliases.
- **FR6 — One catalog, two clients.** The shadcn client consumes standard fields.
  The Astryx CLI MAY read optional `astryx` metadata from the raw JSON for
  integration, provenance, and upgrade guidance. Standard clients may discard
  that metadata without changing the install.
- **FR7 — Discoverable compatibility.** The public docsite MUST describe the
  compatibility boundary and show a secondary copyable install command at the
  end of each applicable component, example, block, and page surface. The
  normal Astryx documentation remains the human browse experience; raw
  `/shadcn/` paths remain machine endpoints.
- **FR8 — Staged launch.** Preview builds MUST serve the full registry from their
  own `/shadcn` origin with `@canary` package dependencies. Production MUST use
  exact released package versions and remain disabled until copied-composition
  upgrades are ready.
- **FR9 — Upgrade-safe copied compositions.** Every copied showcase, example,
  block, and page MUST install an adjacent machine-readable receipt containing
  the stable item route, the copied target, the exact installed bytes, and their
  hash. `astryx upgrade` MUST only apply a canonical item that matches the
  installed Astryx release, auto-update an unchanged file, three-way merge
  edits, leave the original untouched when edits conflict, and never recreate a
  deleted or moved file.
- **FR10 — Required full-catalog CI.** Required pull-request CI MUST generate
  the complete preview catalog, reject production output before launch, install
  every canonical item through the pinned shadcn client, verify every route and
  exact written file, and compile every installed source against the current
  Astryx package exports.
- **IR1 — Generated from current sources.** Registry output MUST come from the
  existing docsite and CLI catalogs, never a parallel handwritten item list.
- **IR2 — Build-time static output.** The docsite build MUST generate static JSON
  under one registry root. Generated JSON MUST NOT be committed when a clean
  build can reproduce it.
- **IR3 — Failure is loud.** Missing source, duplicate names, invalid schemas,
  unresolved package versions, escaping relative imports, and stale generated
  output MUST fail generation or verification.
- **IR4 — End-to-end evidence.** Required verification MUST install every
  canonical component, hook, showcase, example, block, and page into a clean
  shadcn-style app through the pinned stock client, verify exact written bytes
  and declared dependencies, and compile every written source file. Alias
  routes MUST resolve to the same canonical item bytes.
- **IR5 — Stable route contract.** Generated item names and canonical paths MUST
  match the reviewed route lock. Display-name edits MUST NOT change them. An
  intentional rename MUST retain old paths through `registry.aliases` unless a
  separately reviewed breaking change approves removal.

### Platform support

- Supported feature/engine floor: the current Astryx Node floor and the pinned
  shadcn version used by the experiment.
- Unsupported behavior: copying Astryx implementation source without an
  explicit `astryx swizzle` action; installing hidden, incomplete, or
  non-resolvable catalog entries.
- Browser evidence: a representative installed page MUST render in real Chrome
  in both light and dark modes before publication is proposed.

## Current-state impact

The CLI already ships components, hundreds of examples and showcases, and page
templates. The docsite generator already discovers components, individual
showcases and examples, blocks, pages, package versions, and source. The
compatibility layer adds a serializer over that existing catalog rather than a
second discovery system.

The current catalog generates 970 items. Its 700 copied compositions each carry
an adjacent receipt whose base matches the exact bytes stock shadcn writes.
Required CI installs all 970 entries through shadcn 4.19.0 into one clean
consumer, verifies all 1,670 written source and receipt files, and compiles all
970 source entry points. Fourteen compositions that author local StyleX are
precompiled to compiler-free JSX during generation; all other composition
source stays typed TSX. Component implementation copying failed because private
imports and uncompiled StyleX crossed the package boundary; FR2 avoids that
path by installing the package and creating a public re-export only.

## Verification

| Contract  | Verification                                                        | Representative states                           | Mutation or failure expectation                            |
| --------- | ------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| FR1, FR5  | shadcn schema validation and deterministic snapshot                 | component, showcase, example, block, page       | Unknown type, duplicate name, or unstable output fails     |
| FR2       | clean consumer install plus source inspection                       | Core component, hook, non-Core package          | Implementation source or private import fails              |
| FR3, IR1  | reconcile registry counts and names with generated docsite catalogs | visible and hidden entries, grouped families    | Missing or extra catalog entry fails                       |
| FR4, IR3  | dependency extraction and relative-import audit                     | heroicons, recharts, StyleX import, page source | Escaping import or undeclared package fails                |
| FR6       | raw JSON and shadcn parse tests                                     | optional `astryx` metadata present              | shadcn install changes or Astryx metadata becomes required |
| FR7       | docsite tests and copy-button interaction                           | component, block, page, compatibility guide     | Command is absent, stale, or misstates copy behavior       |
| FR8       | canary preview plus production-target assertion                     | preview and released package dependencies       | Production enables before the upgrade gate passes          |
| FR9       | receipt mutation tests plus stock ShadCN install                    | pristine, edited, conflicting, missing, aliased | User source is overwritten or an old route stops resolving |
| FR10, IR4 | required full-catalog clean-consumer install and build              | every canonical item, route, dependency, target | Any item fails to install, match its receipt, or compile   |

## Decision log

### DEC-1 — Use shadcn as a compatibility protocol, not an Astryx foundation

**Reference:** `spec:AST-026/DEC-1`
**Decider:** `josephfarina`, `2026-09-02`

Generate standard registry JSON so an existing shadcn user can install Astryx
without changing tools. Keep the Astryx CLI as the primary product and the
source of richer knowledge and maintenance behavior.

Rejected: a custom Astryx registry format. It gives third-party clients no
interoperability and requires Astryx adoption before Astryx can be discovered.

### DEC-2 — Copy composition, not component implementation

**Reference:** `spec:AST-026/DEC-2`
**Decider:** `josephfarina`, `2026-09-02`

A normal install keeps `@astryxdesign/core` or the owning Astryx package as a
real dependency. Component items create a public re-export; showcases, blocks,
and pages copy editable composition code that imports the package.

Rejected: copying Core implementation source. It breaks package-controlled
upgrades and crosses private-import and uncompiled-StyleX boundaries.

### DEC-3 — Stage the launch behind the canary docsite

**Reference:** `spec:AST-026/DEC-3`
**Decider:** `josephfarina`, `2026-09-09`

Merge the compatibility foundation after end-to-end verification, but keep the
production registry and broad announcement disabled until copied-composition
upgrades are ready.

### DEC-4 — Derive stable IDs from docs and organize URLs by item kind

**Reference:** `spec:AST-026/DEC-4`
**Decider:** `josephfarina`, `2026-09-03`

Treat registry names and paths as public API before publication. Derive them
from stable component/hook names, block `name` plus `exampleFor`, and the
existing template slug. Keep `displayName` editorial. Use these path families:
`components`, `hooks`, `showcases/<component>`, `examples/<component>`,
`blocks`, and `templates`. A block without `exampleFor` is standalone under
`blocks`; a block with component ownership is an example or showcase.

Allow a doc to override its leaf with `registry.slug` and retain old relative
paths with `registry.aliases`. Check all names and paths against a reviewed lock
so a rename cannot silently break existing install commands.

Every item is also served at `<name>.json` in the registry root with its
canonical bytes. Standard clients build that address from the index name, in
search results and in `@namespace/<name>` installs. Each alias path also keeps
the name it stood for, so a renamed item still installs by its old name.

### DEC-5 — Use `/shadcn`, exact releases, and canary previews

**Reference:** `spec:AST-026/DEC-5`
**Decider:** `josephfarina`, `2026-09-09`

Use `https://astryx.atmeta.com/shadcn` as the canonical production root and
reserve `/r` for a future Astryx-native protocol. Production items pin exact
released Astryx package versions; preview items use the matching preview origin
and `@canary` dependencies.

### DEC-6 — Install adjacent receipts and reconcile from the canonical registry

**Reference:** `spec:AST-026/DEC-6`
**Decider:** `josephfarina`, `2026-09-10`

Each copied composition carries a unique JSON receipt beside its source. The
receipt stores the installed base bytes and hash; the stable item route resolves
the release's compiled source. `astryx upgrade --registry` refuses a registry
item that does not match the installed Astryx release, then updates pristine
files or performs a real three-way merge without treating editable application
code as package-owned implementation. Conflicts are written to a separate
artifact and never replace the user's file. Deleted or moved files stay deleted
or moved.

Rejected: hash-only receipts. They cannot reconstruct the merge base after a
user edits the file. Also rejected: rebuilding the latest composition from raw
CLI template assets at upgrade time. StyleX-precompiled registry items require
the registry's compiled bytes.

### DEC-7 — Gate every registry item through one clean consumer

**Reference:** `spec:AST-026/DEC-7`
**Decider:** `josephfarina`, `2026-09-10`

Required pull-request CI proves the release-channel selector removes compatibility
output for production, then passes every canonical preview item to the pinned
shadcn client in one clean consumer. The consumer replaces Astryx package pins
with the current local package builds so a new component can prove its exports
before that version exists on npm; all third-party dependencies retain the
versions declared by the generated catalog. CI compares every written file with
its registry bytes and compiles every source while resolving Astryx package
exports.

Rejected: one client process per item. It repeats dependency installation
hundreds of times without adding protocol coverage. Also rejected: validating
only representative items. A source or target defect can be unique to any one
of the generated compositions.

## Open questions

- **OQ1 — Catalog visibility.** (`human-design`) Should hidden or not-ready
  catalog entries stay addressable by URL, or be omitted entirely?
