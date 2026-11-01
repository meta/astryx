# Astryx knowledge map

This directory holds maintainer knowledge that must be reviewable with the code
it governs. Consumer documentation remains in component `.doc.mjs` files and
`packages/cli/assets/docs/`.

## Placement

- `architecture/`: the shipped system, its boundaries, and invariants.
- `contributing/`: practical contributor workflows that project current owner records without replacing them.
- `design/`: human-owned visual and interaction specifications.
- `themes/`: guidance and index for package-local theme specifications.
- `families/`: contracts shared by sibling components.
- `specs/`: consequential proposed or shipped system changes and their decisions.
- `templates/knowledge/`: authoring templates. Templates never live among records.
- `schemas/knowledge/`: versioned structural requirements for templates and records.

Component contracts live beside the public component in every component-bearing
package registered by `scripts/component-packages.cjs`:

- directory-layout packages (`core`, `lab`) use
  `packages/<package>/src/<ComponentRoot>/<PublicName>.spec.md`;
- flat packages (`charts`, `richtext`, `vega`) use
  `packages/<package>/src/<PublicName>.spec.md`.

In a directory-layout package, `<PublicName>` normally matches the root directory;
a public member such as `NavMenu/NavHeadingMenu.spec.md` is valid only when an
exact top-level or full inline consumer-doc entry in that root declares the same
public name. In a flat package, the public named export and matching TSX module
define the component boundary.

Independently contractible public hooks, plugins, utilities, and subsystems use
`kind: module` records named `<PublicName>.spec.md` at least one directory below
the same component root. Their canonical id is
`module:<ParentComponent>/<PublicName>`; the module's `parent_component` and the
parent component's `modules` list must agree. Private transform helpers do not
require records.

Component-local discovery and PR routing ignore hidden path segments,
`*.generated.spec.md`, and fixture, test, generated, build-output, coverage, and
`node_modules` directories. Those files are not knowledge records or spec-only
changes. Theme contracts live beside the package as
`packages/themes/<theme>/<theme>.spec.md`.

## Authority

Every knowledge record declares `authority: draft | current | archived`.

- `draft` documents are not policy; unresolved evidence and owner decisions are
  recorded as blockers inside the document.
- Initial promotion to `current` requires explicit owner approval recorded in
  the document metadata. Any current `.github/ENGOWNERS` member may approve every
  record kind; current design and theme records and normative design assets also
  accept current `.github/DESIGNOWNERS` members. Legacy v1 `owners` metadata is
  descriptive and does not grant approval rights.
- Pull requests that create, change, or archive a `current` record wait on the
  review gate, `review-required`, until an owner approves their content with
  `/approve-spec <full-sha>` or a review (`architecture:knowledge-contracts`
  DEC-14). Draft-only records need no owner approval.
- Only `current` documents guide implementation and review.
- A specification describes durable ideal behavior independently of any one pull
  request. Pull requests and issues may appear only as clearly non-authoritative
  examples, historical evidence, or references. A specification never exists to
  approve, reject, classify, designate, or authorize a particular pull request.
- Before creating or materially expanding a record, search current records and
  open pull requests by canonical owner/id, affected paths and exported symbols,
  and semantic behavior terms. Extend or project the existing canonical owner by
  default; create a new record only for a distinct fact boundary and explain why.
- Current records rely only on other current records. `modules` and
  `parent_component` are structural ownership links, so they may connect active
  draft/current records without making draft behavior authoritative. Other draft
  relationships are listed on the candidate record; promotion updates affected
  backlinks under owner review.
- `archived` documents declare `archive_reason` (`superseded`, `withdrawn`, or
  `historical`) and link `superseded_by` when a replacement exists.

## Templates and schemas

Templates create documents; schemas keep existing documents structurally
aligned. They are intentionally separate:

- `template_version` records the authoring form used to create a document.
- `schema_version` records the contract the document must satisfy.
- Editorial template changes may increment only `template_version`.
- Adding or changing required metadata or sections creates a new
  `schema_version`; published schema files are immutable.
- Every active record (`draft` or `current`) must use the latest schema that
  defines its kind. Adding a new kind does not migrate unrelated records;
  structurally changing an existing kind migrates only active records of that
  kind. Archived records may retain an older schema that remains checked in.

Published schema versions may extend an earlier schema. The checker composes the
chain and tracks the latest version that defines each record kind. A new kind is
therefore additive; changing an existing kind migrates only that kind.

An optional `review-applicability:v1` JSON block can route selected claims from a
record as cross-cutting review baselines. This is an independently versioned
metadata overlay, like `anatomy-theming:v1`, so adding it does not change a
record kind's required shape or migrate records that do not opt in. The block
must declare `scope: "global"` and map each semantic trigger to one or more exact
claim ids from the same record. Validation rejects malformed, empty, duplicate,
or stale claim routes. Routing requires the reviewed head, verifies the supplied
base authority commit is its `origin/main` merge base, includes only
`authority: current` records, and returns only the matched claims; draft records
and nonmatching routes are omitted.

An optional `path-applicability:v1` JSON block lists the repository paths a
record governs when no placement, path field, name, or inherited link reaches
them: `{"paths": ["apps/docsite/**"]}`. Patterns are repository-relative globs:
`**` is a whole segment spanning any depth, `*` matches within one segment, and
`?` matches one character. Like `review-applicability:v1`, it is an
independently versioned overlay, so opting in does not migrate a record kind.
A pattern must start with a literal path segment. Validation rejects
malformed, unsafe, repeated, whole-repository, and no-match patterns. A match only locates the record for a path; claim scope and
precedence are unchanged. `pnpm check:knowledge` also fails when a current record
is reached from no tracked path that is not itself a record
(`architecture:knowledge-contracts` INV25 and INV26).

New record kinds should prefer one typed relationship list over parallel fields.
If `system-spec` receives a future schema revision, replace its legacy
`affects_*` fields with one typed `affects` list containing ids such as
`architecture:*`, `family:*`, `theme:*`, and `contributing:*`; this PR does not
change the v1 system-spec shape.

Run `pnpm specs:for <path>` to list the current records linked to any repository
path: the record's own placement, `applies_to` and `verified_by` entries, family
and design membership, `affects_consumer_docs` ids, system-spec numbers the file
cites in its text (not inside a record path), and the references those records
inherit. Only visible records are followed, so a draft never adds a link unless
`--include-draft` is passed. A reference scoped to one claim or
decision (`spec:AST-NNN/FR3`) lists that claim, not the whole record. The specs that
decided a linked record are listed separately, as are the global claims the
matched component and module triggers route (the same selection as
`review-global-baselines.mjs`). A path with no linked record is reported as
such. Records are read from the working tree, so on a pull-request branch the
result includes that branch's proposed records and is not review authority.
`pnpm specs:for --unrouted` lists tracked files with no governing record;
`--unreached` lists current records that no other path reaches.

Run `pnpm check:knowledge` to validate templates and records. Pure spec-record
pull requests do not add Changesets because they do not publish package changes.

## Visibility

This repository and its wiki are public. Internal operations, credentials,
services, routing, schedules, and private recovery procedures stay in an
access-controlled private home and must not be named or linked here.
