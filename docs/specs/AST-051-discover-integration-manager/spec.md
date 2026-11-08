---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-051
authority: current
archive_reason: null
superseded_by: null
approved_by: josephfarina
approved_at: 2026-10-20
phase: accepted
owners: [josephfarina]
affects_architecture: [architecture:cli-surface]
affects_families: []
affects_contributing: []
affects_consumer_docs: [authoring]
---

# Discover integration manager system spec

## Intent

A person or agent building an Astryx app wants to know which integrations
exist, what each one adds, which ones the app already has, and which versions
are published, without leaving the terminal. `astryx discover` answers that. It
is the read-only manager for integrations: it lists what the project has, the
official Astryx packages, and what its sources offer, shows each package's
versions and what they add, and searches and filters all of it. The project's
package manager installs, updates, and removes packages.

This record owns what discover shows, where the list of available integrations
comes from, the official list the CLI carries, and what happens when a source
cannot be reached. `spec:AST-031` owns how named-export features compose;
discover sources follow it except where this record says otherwise.

## Non-goals

- Installing, updating, or removing packages. The package manager does that,
  and autolink loads a newly installed integration with no discover step.
- Hosting a catalog. The official list ships inside each CLI release and is
  never fetched (FR11).
- How a source signs in. A source runs as the person running the CLI and uses
  whatever credentials its host already has. The CLI never prompts
  (`architecture:cli-surface` INV1) and reads no Astryx-owned environment
  variable for a source (`spec:AST-017` FR14).
- `astryx search`, which stays on installed content.
- Equivalent internal implementations remain valid when they satisfy this
  contract.

## Requirements

- **FR1 — The list shows what the project has and what it could add.** With no
  query, and with any query in a project that loads no integration and has no
  discover source of its own, discover MUST list every integration the project
  loads, configured or autolinked, and every official package the official list
  supplies (FR11) that the project's own `package.json`, the nearest one above
  the folder discover runs in, declares in `dependencies`, `devDependencies` or
  `optionalDependencies`, under its name or an npm alias, each with its
  version, what it adds as one list per kind, and the latest release a source
  knows. It MUST then list, once per integration, every package its sources
  offer that the project neither loads nor declares as a dependency, each with
  the package-manager command that adds it (FR2), and MUST NOT offer a package
  whose integration the project has under another name. Official packages come
  first in both lists. An integration that failed to load is left out, even an
  official one; the integration-issues warning and Doctor report it.
- **FR2 — A package page shows its versions and what they add.** `discover
<package>` MUST show what the shown version adds, grouped by kind, whether
  the project has the package, its latest release, and its releases newest
  first with their dates and any unreadable status, and MUST count its
  prereleases. `discover <package>@<version>` shows any version, prerelease
  included; the default is the installed version, else the latest release. A
  version no source lists MUST fail with `ERR_NOT_FOUND` and suggest releases.
  For a package the project does not have, discover MUST print the
  package-manager command that adds it, as text, and MUST NOT run it; for an
  alias of a package the project has, it names that package instead. For a
  package the official list supplies, that command pins what FR11 names and
  quotes a range for the shell.
- **FR3 — An item page shows one item.** `discover <package>/<Component>` for an
  installed component keeps printing its doc. Any other item a package adds,
  installed or listed by a source, MUST resolve to its kind, name, package,
  version, and whether the project has it.
- **FR4 — Search covers every kind and every source.** `discover <words>` MUST
  match installed components, the project's other installed items, package
  names and descriptions, and every item a source lists for a package the
  project could add, by name, title, summary, and keywords. It MUST answer with
  the list of matches, even when one name matches exactly or only one item
  matches, so the response type depends on the form of the query and never on
  what the project has. Matches are ranked by how closely the name matches,
  with installed items first among equals. Each match states its kind and
  whether the project has its package. One item opens by its package path
  (FR3).
- **FR5 — Filters follow the CLI's existing options.** `--type <kind>` keeps one
  kind (`component`, `template`, `doc`, `theme`, `codemod`, `agent-doc`): in the
  list, packages that add it; in a search, items of that kind. `--installed`
  and `--available` keep one side and MUST be refused together with
  `ERR_INVALID_OPTION`. `--limit <n>` caps search results (default 20) and the
  response reports the total when it cut the list. An unknown kind or a limit
  that is not a positive integer MUST fail with `ERR_INVALID_OPTION`.
  In a project that sets `experimental.iconSet`, `icon-set` is an additional
  kind (`spec:AST-084/DEC-8`); without it discover keeps the six kinds and
  refuses `--type icon-set` with `ERR_INVALID_OPTION`.
- **FR6 — Sources are functions a project, an integration, or a door
  provides.** A source is an async function that receives
  `{signal, package?, version?}` and resolves to a catalog; `package` asks for
  one package with every version, and `version` asks for that version's items.
  A project MAY set one as the `discover` field of `astryx.config`, each loaded
  integration MAY export one as its `discover` named export, and a door MAY
  pass its own (`spec:AST-081` FR1), which discover names as the door's. Every
  source is called, the project's first, then each integration's in load
  order, then the door's, and the same function runs
  once; discover then reads the official list (FR11).
  A source that throws, exceeds 30 seconds (signalled on `signal`), or
  returns an invalid catalog fails alone: the others still count, and discover
  reports which source failed and why. Sources only read, so `spec:AST-031`'s
  consent gate does not apply to them.
- **FR7 — The catalog shape is versioned.** A catalog is `{schemaVersion: 1,
source, packages}`. `source` has `name`, `generatedAt`, and `complete`. Each
  package has `package`, `integration` (shared by every package name that
  publishes the same integration), `aliases`, an optional `description`,
  `latest`, `versions` (each with `version`, `publishedAt`, `prerelease`, and
  `status`), and the `contributions` of the requested or latest version (each
  with `kind`, `name`, and optional `title`, `summary`, and `keywords`). The CLI
  MUST validate every answer, MUST ignore fields and kinds it does not know,
  MUST refuse any other `schemaVersion`, and MUST show versions newest first by
  publish time whatever order the source returned them in. When two sources
  list the same package, the earlier source's entry is used.
  In a project that sets `experimental.iconSet`, an `icon-set` contribution
  MAY also carry `iconCount` and `definitions` (`spec:AST-084/DEC-8`); without
  it discover ignores `icon-set` entries and those fields as unknown.
- **FR8 — A saved copy covers an unreachable source.** After a source answers,
  discover MUST save that answer, per source and per request, in the per-user
  cache directory of the platform, never in the project. When the source later
  fails, discover MUST use the saved answer for the same request and say when
  it was saved. With no saved answer, the source adds nothing and discover says
  so. Installed integrations always appear, with or without a source.
- **FR9 — JSON stays compatible.** Existing response types and fields keep their
  meaning; new information is additive. `discover.list` `data` lists what the
  project has (FR1), with optional per-kind lists and `latest`;
  `meta.available` lists what the project could add and `meta.sources` reports
  each source, the official list last. `discover.detail` carries
  `installed` and, with a source, `latest`, `aliases`, `source`, `versions`,
  and `install` or `installedAs`. Items other than installed components use the
  `discover.item` type. `discover.search` matches carry `kind` and `installed`,
  `component` holds the item name for every kind, and `data.total` appears when
  `--limit` cut the list. A free-text query returns `discover.search`, never
  `discover.detail.doc` (FR4).
- **FR10 — A package can link its docs site.** An integration manifest MAY
  set `docsiteUrl`, a URL of the package's docs site, so catalogs that list
  the package can link to it. The CLI MUST accept it as a known key, without
  an unknown-key warning, and does nothing else with it.
- **FR11 — The CLI carries the official list.** Each CLI release carries the
  list of official packages: every package that release publishes that adds at
  least one item discover lists. The list is generated from the repository when
  the CLI is built and never edited by hand, and a check fails when it no longer
  matches the repository. It holds no versions. An entry's latest release is the
  newest release the CLI knows: its own version on a release CLI, or the
  project's Core version when that is a newer release. An entry for a package
  that always releases at Core's version lists a release CLI's own version and
  the project's Core version, installed or declared exactly, so either can be
  looked up; its add command pins the project's Core version, else the Core
  range the project declares, else the latest release, and on a canary CLI in a
  project with no Core it pins none. Only a canary CLI lists the canary-only
  packages, as prereleases: at the project's Core version when that is a
  prerelease, at the CLI's own version when the project has no Core, and not
  beside a released Core or a Core declared without an exact version, which they
  cannot be installed with. For a package only the list supplies, a version or
  item the entry does not list fails with `ERR_UNKNOWN_PACKAGE`. Discover reads
  the list after every other source, so a source's entry is used (FR7) for an
  official package it lists and for any official package whose integration it
  publishes under another name; the list adds the official packages no source
  covers. Official packages come first in both lists. An official entry reads
  like any other package, with no section of its own, and names its source
  `Astryx`.

### Platform support

- Supported feature/engine floor: every supported CLI runtime.
- Unsupported behavior: none. What a source needs from its machine is its
  author's responsibility; a source that cannot run there fails under FR6.
- Browser evidence: not applicable.

## Current-state impact

- `astryx discover` listed only configured integrations with a components root
  and matched component names only; its `description` and `displayName` fields
  were never filled. This record replaces that behavior additively (FR9).
- `discover <Name>` opened an installed component's doc when the name matched
  exactly or was the only match. It now lists the matches, and
  `discover <package>/<Name>` opens the doc (FR4, DEC-4).
- `architecture:cli-surface`: the discover adapter calls sources and keeps the
  saved copy (INV21); the saved copy's path passes `assertWithin` under the
  cache directory (INV10).
- `spec:AST-031`: `discover` is a second named-export feature, without the
  consent gate (FR6).
- Consumer docs: `authoring` gains the `discover` named export and config
  field, and `astryx docs authoring` gains the `discover-source` section.
- `astryx discover` with no source configured listed only the project's
  integrations. It also lists the official packages, first, each with the
  command that adds it, and a declared official package the official list
  supplies counts as installed from any folder of the project (FR1, FR11). A
  version or item of a package only the official list supplies that its entry
  does not list fails with `ERR_UNKNOWN_PACKAGE`, the answer for a package no
  source lists (FR11).
  A query in a project that loads no integration and has no source of its own
  answers with the list, as it does without the official list (FR1).
- Release: the CLI build generates the official list from the packages the
  release publishes, and a drift check fails when the committed list is stale
  (FR11). `astryx docs authoring` `discover-source` says the official list comes
  before every source.

## Verification

| Contract | Verification                                                   | Representative states                                                                                                                                                                                                                                                                                         | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | list leaf, catalog view, adapter, command tests                | installed only; available only; both; latest known; alias of an installed package; declared dependency; declared official package; official and other packages together; a query in a project with no integration and no source of its own                                                                    | an available package is missing, an alias or declared package is offered, latest is absent, a declared official package is not installed, an official package does not come first, or that query does not answer with the list                                                                                                                                                                                                                                              |
| FR2      | detail leaf, adapter, and command tests                        | installed; not installed; `@version`; prerelease; unpublished version; alias; official entry with and without Core                                                                                                                                                                                            | a version is dropped, the default is wrong, the add command runs, an alias is offered, or an official entry's add command is not pinned                                                                                                                                                                                                                                                                                                                                     |
| FR3      | item leaf and dispatcher tests                                 | installed component; installed template; listed item; unknown item                                                                                                                                                                                                                                            | an installed component loses its doc, or a listed item is not found                                                                                                                                                                                                                                                                                                                                                                                                         |
| FR4      | search leaf and command tests                                  | components, templates, docs, packages; installed and available; title and summary matches; an exact installed name; a single match                                                                                                                                                                            | a kind is not searched, installed state is wrong, a weak match ranks first, or a free-text query returns a doc instead of the list                                                                                                                                                                                                                                                                                                                                          |
| FR5      | dispatcher, leaf, and command tests                            | each kind; `--installed`; `--available`; both; `--limit`; bad values                                                                                                                                                                                                                                          | a filter is ignored, the pair is accepted, or a bad value passes                                                                                                                                                                                                                                                                                                                                                                                                            |
| FR6      | adapter source tests                                           | project and two integrations, then the official list; a shared function; a throw; a timeout; invalid data                                                                                                                                                                                                     | a failure hides other sources, a function runs twice, order changes, or the signal never aborts                                                                                                                                                                                                                                                                                                                                                                             |
| FR7      | catalog schema tests                                           | unknown field; unknown kind; `schemaVersion: 2`; duplicate package across sources; misordered versions                                                                                                                                                                                                        | an unknown field fails, another version is accepted, the later source wins, or versions keep the source order                                                                                                                                                                                                                                                                                                                                                               |
| FR8      | adapter saved-copy and command tests                           | fresh answer; failure with a saved copy; failure with none; another request                                                                                                                                                                                                                                   | a stale copy hides a fresh answer, the saved date is missing, or a project file is written                                                                                                                                                                                                                                                                                                                                                                                  |
| FR9      | existing discover JSON tests                                   | each response type with and without a source                                                                                                                                                                                                                                                                  | an existing field changes type or meaning                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| FR10     | manifest parser and validate tests                             | no field; a URL; a value that is not a URL                                                                                                                                                                                                                                                                    | the key raises an unknown-key warning, or a valid URL is refused                                                                                                                                                                                                                                                                                                                                                                                                            |
| FR11     | official list generator, drift test, adapter and command tests | stable and canary CLI; Core older and newer than the CLI; Core declared exactly, as a range, and as a path; canary Core; no Core; private package; package that adds nothing; theme folder that does not match its file; empty folder; subfolder; another source lists an official package or its integration | a private or empty package is listed, an unreadable theme package is skipped, the committed list drifts from the repository, latest is older than a release the CLI knows, the project's Core version cannot be looked up, a declared range is not pinned or not quoted, a canary-only package shows on a stable CLI or beside a released Core, an official entry replaces a source's entry for the same integration, or a version it does not list fails with another code |

## Decision log

### DEC-1 — Discover shows; the package manager installs

**Reference:** `spec:AST-051/DEC-1`
**Decider:** `josephfarina`, `2026-09-30`

Installing is the package manager's job, and autolink already loads a newly
installed integration, so discover only reads. For a package the project does
not have, it prints the command that adds it.

Rejected: `discover add`, `update`, and `remove` subcommands; running the
package manager from discover.

### DEC-2 — Other integrations come from sources

**Reference:** `spec:AST-051/DEC-2`
**Decider:** `josephfarina`, `2026-09-30`

Beyond the official list (DEC-5), a project or an integration provides a source
as a function, and discover merges every source. A catalog host that needs
sign-in works through the function, which runs with the credentials its host
already has, and a project can change what its sources list without a CLI
release.

Rejected: a catalog URL built into the CLI, which ties the public CLI to one
host; a source given as a URL for the CLI to fetch, which cannot sign in to a
private host without the CLI handling credentials.

### DEC-3 — Discover has its own search and filters, in the CLI's existing terms

**Reference:** `spec:AST-051/DEC-3`
**Decider:** `josephfarina`, `2026-09-30`

Discover lists, shows one package, version, or item, and searches with filters,
using the option names the CLI already has (`--type`, `--limit`) plus
`--installed` and `--available`. Its responses follow the existing discover
types, so a reader of `--json` learns nothing new to use it.

Rejected: sending discover's searches through `astryx search`, which answers
about installed content only.

### DEC-4 — A free-text query always answers with a list

**Reference:** `spec:AST-051/DEC-4`
**Decider:** `josephfarina`, `2026-09-30`

`discover <words>` is a search, so it lists every match across all packages,
the ones the project has and the ones it could add, even when a component's
name matches exactly or only one item matches. The response type then depends
only on the form of the query. One item opens by its package path.

Rejected: keeping the earlier shortcut, where an exact or only
installed-component match opened that component's doc. The same query then
returned a doc or a list depending on what the project and its sources held.

### DEC-5 — The official list is built into each release and read last

**Reference:** `spec:AST-051/DEC-5`
**Decider:** `josephfarina`, `2026-10-13`

Official packages change only when Astryx releases, so a list built into each
release is as current as the packages that CLI works with. It works offline and
in an empty folder, and it asks for no more trust than the CLI itself. Discover
reads it after every other source, so a project or an integration keeps the
entry its own source gives an official package, and the list fills in the
rest. Official packages still come first in the lists and read as part of them.
An entry keeps the newest release the CLI knows as its latest, so an update
check still sees it, and also lists the version that fits the project, which its
add command pins; both can be looked up.

Rejected: reading the list before the other sources, which replaces the entry
a project's or an integration's source gives; searching the package registry at
run time, which needs the network and cannot tell what a package adds without
running its code.

## Open questions

None.
