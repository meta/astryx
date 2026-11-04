---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-046
authority: current
archive_reason: null
superseded_by: null
approved_by: josephfarina
approved_at: 2026-10-22
phase: implementing
owners: [josephfarina]
affects_architecture: [architecture:cli-surface]
affects_families: []
affects_contributing: []
affects_consumer_docs: [authoring, guides, foundations]
---

# Documentation tree system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

A reader who opens the Astryx docs should find every doc in one tree and move
through it one level at a time: `astryx docs cli` lists the CLI's guides and
reference, `astryx docs cli/api` lists the API's functions, schemas, and enums,
and `astryx docs cli/api/functions/search` prints one function. Each doc keeps
its own file and becomes one node with one route. The compiler builds the tree
from the typed docs that already exist; no one keeps a list of children by hand.
Search leads into the same tree: a hit names the smallest part that answers, so
a reader never reads a whole guide to find one fact.

The tree is the backbone of one docs graph. Every provider's docs are its nodes,
each with one home in the tree; the links between docs (a command and its API
function, a token reference, a replacement) are its other edges, named by doc
identity. Phase 1 builds the backbone for the CLI's own docs and each
integration's, and `spec:AST-047` turns the edges into moves a reader can
follow.

This record owns how a doc gets its one home in the tree, how a route is formed,
how `astryx docs` reads the tree, and what `astryx doctor` checks. It rolls out
in phases: phase 1 places the CLI's own docs and the namespace docs and guides
each integration ships, and gives every other doc a home in a generated
level named for its category, Guides or Foundations; later phases may move
those docs into real sections.

A long flat topic can become a namespace of short guides, so a reader loads only
the guide that answers. The split keeps the unambiguous reads a released
command makes inside the topic's own package: the name, each section read by
its key or by a title only one guide matches, each reference, and each address
on the docsite still lead to the same content (FR13, FR6, FR14). A title
fragment that matches sections in two guides asks instead of guessing (FR6),
and references from other packages are an open question (OQ2).

## Non-goals

- How a docsite page looks, and how the docsite shows flat topics. FR14 states
  which page holds a namespace's content and where each of its addresses leads;
  the page design is the docsite's.
- A top-level browse of every provider. It is a later phase.
- Aliases and audiences. `aliases` and `audience` stay reserved fields that a
  doc may not set.
- Rendering `collection` blocks. A topic that uses one fails to load.
- Equivalent internal implementations remain valid when they satisfy this
  contract. The compiler's modules, the docsite's build scripts, and the files
  a split creates are implementation.

## Requirements

- **FR1 — Identity is separate from the route.** A node with an authored doc
  MUST be identified by that doc's identity: its DocId, as the provider-identity
  contract defines it, built from its provider's ProviderId (which can differ from its
  package name), its kind, and its name. The identity MUST NOT change when the node
  moves. A generated level has no authored doc and no identity: its `id` is
  `null`. A node's route is its parent's route, `/`, and its own segment; a
  top-level namespace's route is its name, and a flat topic keeps its own name
  (FR12). A segment is the node's name as
  lowercase letters and digits joined by single hyphens. The route is the
  readable name; `docs.node` carries both.
- **FR2 — Each doc has one home, decided in a fixed order.** A doc's home MUST
  be decided once, in this order: its explicit `placement`; otherwise the one
  adoption rule in its own package that matches its discovery group and kind;
  otherwise, for a reference topic, the generated level for its category (FR12). A placement MUST name a namespace of the doc's own package
  (`namespace:<name>`), a slot that namespace declares, and a slot that accepts
  the doc's kind. A placement that fails MUST withdraw the doc with a
  diagnostic; it MUST NOT fall back to adoption. A doc that two rules adopt MUST
  be withdrawn with a diagnostic that names both namespaces.
  The one exception is a CLI namespace marked `stability: 'experimental'`,
  which MAY adopt a doc group from every package with `source.packages: 'all'`
  (`spec:AST-084/DEC-7`); it applies only to the experimental icon sets behind
  the project's opt-in, and every stable namespace keeps one adoption rule per
  package with unchanged output.
- **FR3 — Namespaces never list or scan their children.** A namespace doc
  declares its slots and its adoption rules. It MUST NOT enumerate its
  children, and the compiler MUST NOT infer a parent from a folder. A child
  names its parent with `placement`, or a namespace adopts a discovery group: a
  CLI typed doc's group is the `namespace` it declares (`cli/commands`,
  `cli/api`). An adoption rule with `groupBy: 'kind'` MUST add one generated
  namespace per kind (`functions`, `schemas`, `enums`), in the order the rule
  lists the kinds.
- **FR4 — Routes are unique.** Two nodes MUST NOT share a route. When they
  would, the compiler MUST keep one by a deterministic order and withdraw the
  other with a diagnostic that names both. The same inputs MUST build the same
  tree, whatever order they arrive in. Children sort by `placement.order`, then
  title, then identity.
- **FR5 — `astryx docs` reads the tree one level at a time.** `astryx docs
<route>` MUST resolve a flat topic first, then a tree route, except that a
  topic whose route the tree gives to another doc (FR11) opens that doc. A namespace MUST
  print its title, its summary, and each slot's children one level down, each
  with its summary and the command to open it; it MUST NOT inline its
  grandchildren. When a child's title is not its route name
  (`assertResponse()`, `search()`), the text view MUST show the title before
  the summary. A typed doc MUST print its content. Both MUST end with the way
  back up. A guide the tree places MUST read like a topic, by
  its route (`spec:AST-047` FR3). `--json` MUST return `docs.node` for a
  namespace or typed doc: its identity, route, kind, package, title, summary,
  breadcrumb, and either its slots with their children or its content.
- **FR6 — A section read names one section.** A section argument on a typed
  doc MUST fail with `ERR_UNKNOWN_SECTION` and name the doc. On a namespace,
  the read `astryx docs <namespace> <section>` MUST take, from each guide below
  the namespace at any depth, the section that guide's own section read
  returns for the query; within one guide, that read decides between the
  guide's sections, as it does on any topic. Across guides the read MUST then
  decide in two steps: when the section returned by exactly one guide has the
  query as its key (its `id`, or the key its title derives), that section
  answers, even when other guides return a section too; otherwise, when
  exactly one guide returns a section, that section answers. The response MUST
  be the one a section read of that guide returns (`docs.detail.section`), so
  an unambiguous section read that worked on a topic before it became a
  namespace (FR13) returns the same section in the same shape. When no guide
  returns a section, or more than one does at the step that decides, the read
  MUST fail with `ERR_UNKNOWN_SECTION`, the error a topic's unknown section
  gives; its suggestions MUST name the route of each guide that returned a
  section, or of every guide below the namespace when none did. An unknown
  route MUST fail with `ERR_UNKNOWN_TOPIC` and suggest the children of the
  deepest namespace the route reaches.
- **FR7 — The topic list names the tree.** `astryx docs --json` MUST list each
  top-level namespace in `meta.namespaces`, so `data` stays the topic list, and
  every entry in it reads as a topic. The text view MUST show the namespaces first,
  under their own heading, because that is where the CLI's own docs start. A
  package whose docs did not load MUST be named, in `meta.notLoaded` and under
  its own heading in text, so its author knows why its docs are missing.
- **FR8 — Doctor proves the tree.** `astryx doctor` MUST warn when the tree has
  an error diagnostic, when a CLI typed doc whose group the tree reads has no
  route, and when a link between docs names no doc (`spec:AST-047` FR9). These
  checks warn, so a project that passed without them keeps passing. The progressive-disclosure check MUST hold each guide the tree
  places to the same size budget as every topic.
- **FR9 — Phase 1 places the CLI's own docs.** The CLI MUST ship the `cli`
  namespace with the `commands` and `api` namespaces under it, and the
  `authoring` namespace, the one home for integration authors. Every command
  doc MUST have a route under `cli/commands`, and every function, schema, and
  enum doc in the `cli/api` group a route under `cli/api/<kind>s`. The
  integration guides MUST live under `authoring`, one short guide per task,
  beside the field reference whose sections `astryx docs authoring <name>`
  reads, and no flat topic is named `cli-integrations` or `authoring`. An old
  `cli/integrations` route MUST stay unknown, and its not-found error MUST name
  the guide's new route under `authoring`. Under `spec:AST-017/FR45`, a CLI route or name MAY
  change like this when every reference changes with it: links name docs by
  identity (`spec:AST-047` FR9), and the graph walk fails on a reference
  left behind (`spec:AST-047` FR11, FR12).
- **FR10 — Search finds the smallest part that answers.** `astryx search` MUST
  index each section of each topic and placed guide, and each namespace and
  typed doc of the tree. A section result MUST carry `section`, and its command
  MUST read only that section. A tree result's command MUST read its route. A
  topic result's command MUST list the topic's sections when it has more than
  one. A typed doc MUST also match by its own name, and a doc part by each
  identifier it defines or names in code (`assertResponse`,
  `ERR_UNKNOWN_SECTION`). A docs-only search (`--type doc`) MUST NOT need
  `@astryxdesign/core`, because `astryx docs` does not.
- **FR11 — Integrations join the tree.** A configured integration MAY ship
  namespace docs, and guides with `placement`, in its docs directory. The tree
  MUST read them beside the CLI's own, identify each node by the integration's
  provider id (FR1) and name its `package` by the integration's npm name, and
  hold them to FR2–FR8. A placed guide MUST NOT also `replaces` or `extends` a
  topic. A flat topic MAY name a placed guide by its route, or by a route it
  moved from, in `replaces` or `extends`; this claims no route, so the guide
  keeps its place and route, and a read of a moved route still fails as FR9
  states. A replacement MUST be read at that route as its own package's doc,
  and an extension's sections MUST merge onto the guide as they merge onto a
  topic; docs that name one guide by its old and its new route apply in
  configured order. An extension's section MAY set `before` or `after` to the
  key of a section of the doc it extends, and MUST be placed there, in
  authored order; with neither, or with a key that names no section, it MUST
  be added at the end, and neither field is read back. A replaced topic or
  guide MUST name the package it replaced as `replacedPackage`, beside
  `replaces`. A `replaces` or `extends` that names no topic and no guide,
  such as a namespace, changes nothing.
  When two providers claim one route, the CLI's own docs MUST keep it,
  including its flat topics' names and the generated topic levels, then integrations
  in configured order; between integrations a namespace keeps its route over a
  topic, and a name a topic answers to through `replaces` is that topic's route.
  The claim that loses MUST be a `duplicate_route` diagnostic filed against the
  provider that lost it, and the topic list, reads, and search MUST agree with
  the tree. `astryx doctor integration docs` MUST run the
  same tree and link checks on one integration's docs, so an author finds a
  broken placement or link before the package ships. It MUST fail on a tree
  error diagnostic filed against the package, since that hides a doc, and warn
  on a link that names no doc; `astryx doctor` keeps FR8's warnings. And
  `astryx integration add doc <name> --parent <namespace>` MUST write a guide
  placed in that namespace, found by its name, and the namespace doc when the
  package has none. A CLI release that does not read the docs tree can hide every doc topic of a
  package that ships a namespace doc or a placed guide, with nothing saying
  why, so such a package MUST declare a `@astryxdesign/cli` peer
  range that admits only CLIs that read it: `integration add doc --parent` MUST declare it,
  and `astryx integration verify` MUST fail without it. The same check
  covers a template that sets `replaces` (`spec:AST-035`), a doc section that
  sets `id`, and a theme, whose typed descriptor an older CLI rejects along
  with the package's doc topics; `integration add theme` declares the peer.
  A doc section that sets `before` or `after` needs the same range from the
  CLI that reads those fields; `integration verify` warns without it. A topic
  or placed guide whose text writes a doc token (`{@command …}`, `{@pm …}`,
  `{@pm-only …}`; an escaped `{@@…}` is not one) needs the range from the
  first CLI that renders tokens, since an older one shows them as written;
  `integration verify` warns without it (`doc_tokens_need_cli`). Component
  docs, template docs and `agentDocs.append` lines are not yet covered by
  that warning.
- **FR12 — Every doc has a named home.** Every flat topic, the CLI's and
  each integration's, MUST sit in the generated level for its category, in the
  order the topic list reads: `foundations` (Foundations) for a foundations
  topic, and `guides` (Guides) for any other. A level has no authored doc, so
  its `id` is `null`, and it lists its topics one level down with the command
  that opens each. A topic keeps its own name as its route, so no name
  changes; a read of it offers Up to its level and Previous and Next among its
  level's topics, as any tree node does. Placing a topic in a real section
  takes it out of its level. Every flat topic the CLI ships MUST declare the
  `guide` or `foundations` category, and the repository's tests MUST fail on
  one that does not.
- **FR13 — A flat topic becomes a namespace without breaking an unambiguous
  read.** A
  provider's flat topic MAY become a namespace of guides only when every rule
  below holds for the result:
  - The namespace takes the topic's name, so its route and `astryx docs <name>`
    are unchanged, and no flat topic keeps the name, so the name has one owner
    (FR4).
  - Every section of the topic lands in exactly one guide, with its title, its
    `id`, and the key a reader addresses it by unchanged; when regrouping would
    change a section's derived key, the section's `id` pins the old key. No
    section is dropped, merged into another, or copied into two guides. No
    guide below the namespace shares a key with one of the topic's own
    sections, so every section read that worked on the topic still names one
    guide (FR6). Guides placed below the namespace from elsewhere MAY share
    other keys with each other; a namespace read of such a key fails as FR6
    states and names those guides.
  - Each guide answers one task or one decision a reader brings, and its title
    and summary name it. A guide is not a fragment cut at a size, and each
    meets the size budget of FR8.
  - Every link, `{@link}` target, and token reference the provider's docs make
    to the topic still resolves: each names the namespace, or the guide that
    holds what it pointed at, and the graph walk fails on one left behind
    (`spec:AST-047` FR11). A token reference that names the namespace reads its
    guides as one topic, their sections in tree order.
  - A read in another language (`--dense`, `--zh`) of a guide, or of one of its
    sections, returns the text the topic's read in that language returned for
    each section the guide holds.
  - Each piece of content appears once: the topic list names the namespace in
    `meta.namespaces` and no topic in `data` by that name (FR7), search returns
    each section once, from the guide that holds it (FR10), and no flat topic
    keeps a copy of guide content for references or pages to read.
- **FR14 — The docsite shows a root namespace as one page.** The docsite MUST
  read the tree through the CLI's public docs API. A root namespace with a
  guide below it MUST be one page at the namespace's slug: the namespace's own
  content, then every guide below it in tree order, as the read
  `astryx docs <namespace> --depth all --detail full` returns it. A nested
  namespace's own content opens its guides on that page, and typed docs below
  the namespace open only in `astryx docs`. A topic that becomes a namespace (FR13) therefore keeps its
  address, its sidebar group, and its text. The slug of each guide and nested
  namespace below it (its route with `/` as `-`) MUST be a temporary redirect
  to where its text starts on the page. A root namespace whose slug is a
  package's page (`cli` is the CLI package's page) keeps one page per guide,
  at the guide's slug, and has no namespace page. A namespace page's sidebar
  group MUST be the namespace's own `category`; without one, `foundations`
  when every guide below it is a foundations doc, and `guide` otherwise. A
  namespace with no guide below it, such as a generated topic level (FR12), has
  no page. The docsite build MUST fail when a slug is both a page and a
  redirect, or both a flat topic and a namespace page.

### Platform support

- Supported feature/engine floor: every supported CLI runtime.
- Unsupported behavior: none.
- Browser evidence: none beyond the docsite's page and redirect tests (FR14);
  the record makes no browser-specific claim.

## Current-state impact

Phase 1 changes these surfaces:

- the CLI ships its namespace docs and the guides they place in
  `assets/docs/tree/`, each named after its doc; the flat topic list does not
  read that directory;
- the compiler builds the tree from those files and the CLI's typed docs, and
  `collectDocInputs` lists the tree files as a `tree` root;
- the four tree diagnostics (`invalid_namespace`, `invalid_placement`,
  `overlapping_adoption`, `duplicate_route`) join the compiler's codes;
- `astryx docs`, `docs()`, and `astryx doctor` read the tree as FR5–FR8 state,
  and a section read on a namespace resolves through its guides (FR6);
- `astryx search` finds sections and tree nodes, as FR10 states;
- an integration's namespace docs and placed guides join the tree, and
  `astryx doctor integration docs` checks them, as FR11 states;
- `cli-integrations` moves to `cli/integrations`, and every reference moves
  with it;
- the integration guides then move from `cli/integrations` to `authoring`,
  beside the field reference, and every reference moves with them; an old
  route's not-found error names its new one (FR9);
- every flat topic sits in the generated level for its category, Guides or
  Foundations, as FR12 states;
- a flat topic that becomes a namespace keeps its unambiguous reads inside
  its own package, as FR13 and FR6 state;
- the docsite reads the tree through `docs()`: each root namespace is one page
  and its guides' slugs redirect into it (FR14); the `cli` namespace's guides
  keep their own pages, and `/docs/cli-integrations`, every
  `/docs/cli-integrations-…` guide slug, and `/docs/cli-writing-docs` redirect
  into `/docs/authoring`.

`architecture:cli-surface` INV25 and INV26 carry this record into the code.

## Verification

| Contract      | Verification                                                                  | Representative states                                                                                                                                                                                                          | Mutation or failure expectation                                                                                                                                                                             |
| ------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1, FR3, FR4 | Tree builder fixture tests                                                    | three authored levels; adoption with and without `groupBy`; reversed input order; order and title sort                                                                                                                         | A route that ignores the parent, a folder that implies a parent, or a tree that depends on input order                                                                                                      |
| FR2           | Tree builder failure fixtures                                                 | no slot; unknown slot; a slot that refuses the kind; another package's parent; not a reference; two adopters; a cycle                                                                                                          | A failed placement that falls back to adoption, or a failure without a diagnostic                                                                                                                           |
| FR5, FR6, FR7 | `docs()` dispatcher tests and CLI runs                                        | `cli`, `cli/api`, one function, the placed guide and its sections, the old name, a typo route; a section on a namespace that one guide, no guide, and two guides hold                                                          | A namespace that inlines grandchildren, a lost section read, a section read that picks one of two guides, or a wrong error code                                                                             |
| FR8           | Doctor tests                                                                  | this repo; a fixture tree with a broken placement                                                                                                                                                                              | A broken tree or an unplaced CLI doc that passes                                                                                                                                                            |
| FR9           | Real-tree tests and the route inventory                                       | every command, function, schema, and enum doc; every exported API function                                                                                                                                                     | A CLI typed doc without its route, or a route inventory row the tree contradicts                                                                                                                            |
| FR10          | Search tests and CLI runs                                                     | a guide section; a typed doc by its own name; an error code; a topic hit; no core installed                                                                                                                                    | A section hit whose command reads the whole topic, or a docs-only search that needs core                                                                                                                    |
| FR11          | Integration tree tests; guide route target tests                              | a namespace and two placed guides from a package whose provider id differs from its name; a broken link; a claim on the `cli` route; a flat topic that replaces or extends a CLI guide by its route, with `before` and `after` | A node named by the package name, a broken link that passes either doctor, an integration that takes a CLI route, a replaced guide or added section that names the wrong package, or a section out of place |
| FR12          | `docs()` tests, the graph walk, and search tests                              | the level and its children in list order; a topic's Up, Previous, and Next; a flat topic hit's parent; an integration's flat topic                                                                                             | A flat topic without a home, a topic whose name changes, or a level that lists a placed guide                                                                                                               |
| FR13          | Split tests over the topic before and after, the graph walk, and search tests | each old section key read through the namespace; a link and a token reference to the old topic; a `--dense` read; the topic list and a search for one section                                                                  | A dropped, merged, or copied section; a changed title or `id`; a reference left on the old identity; a name listed twice; a section found twice                                                             |
| FR14          | Docsite page-generation and route-resolution tests                            | a split namespace; a nested namespace; a package-page namespace; a namespace with a `category`, and one whose guides are all foundations docs; a generated topic level                                                         | An old address that stops resolving or lands in another sidebar group, a permanent guide redirect, a guide page on a non-package namespace, or a slug that is both a page and a redirect                    |

## Decision log

### DEC-1 — Roll out the tree in phases, CLI first

**Reference:** `spec:AST-046/DEC-1`
**Decider:** `josephfarina`, `2026-09-22`

The compiler, the CLI reader, and Doctor come first; the docsite follows the
tree only as far as FR14 states, and every current docsite address keeps
working. Starting with the CLI's own docs tests the contract on docs one team owns.

Rejected: one change that moves every doc and the docsite at once. It is too
large to review, and every route changes before the contract is proven.

### DEC-2 — A CLI typed doc's `namespace` is its adoption group

**Reference:** `spec:AST-046/DEC-2`
**Decider:** `josephfarina`, `2026-09-24`

Every CLI typed doc already declares the `namespace` that reads it, and Doctor
already enforces it. The tree adopts by that group, so a new command or
function appears in the tree with no other edit.

Rejected: a second field for the tree, and a list of children in each namespace.
Both repeat what the doc already says and drift from it.

### DEC-3 — Rename, and move every reference with it

**Reference:** `spec:AST-046/DEC-3`
**Decider:** `josephfarina`, `2026-09-28`

`cli-integrations` becomes `cli/integrations`, with no alias. A CLI name or
route may change when every reference changes with it: links name docs by
identity, so they follow the doc, and the graph walk fails on any reference
left behind. An alias would keep a second name for one doc.

Rejected: keeping `cli-integrations` as an alias, and removing it before typed
links and the graph walk could prove no reference was left.

### DEC-4 — Integrations join the tree in the first phase

**Reference:** `spec:AST-046/DEC-4`
**Decider:** `josephfarina`, `2026-09-28`

The tree, its moves, and its checks work the same for every provider. Holding
integrations back would leave their docs on a weaker path and delay the checks
their authors need, so an integration's namespace docs and placed guides join
the tree in the same change as the CLI's.

Rejected: a later phase for integration namespaces.

### DEC-5 — A split keeps the topic's name and its unambiguous reads

**Reference:** `spec:AST-046/DEC-5`
**Decider:** `josephfarina`, `2026-10-08`

A long topic gets short guides without a breaking change. The `docs` command's
response schemas are a contract (`spec:AST-017/FR45`), and a split moves no
content, so it keeps the topic's unambiguous released reads working inside its
own package, even where FR45 would let a route stop resolving. The one
deliberate exception is a title fragment that matches sections in two guides,
which asks instead of guessing (DEC-6); references from other packages are an
open question (OQ2). The namespace takes the topic's name, so its
route and every command that opens it stay the same;
sections keep their titles and ids, so section reads and links keep resolving;
each piece of content appears once, so a reader never weighs two copies. A
guide is shaped by the task or decision it answers, which is what search and a
reader's next step look for.

Rejected: keeping the flat topic beside the namespace, as an alias or a data
copy; the name has two owners and lists and search show the content twice.

### DEC-6 — A section read on a namespace resolves through its guides

**Reference:** `spec:AST-046/DEC-6`
**Decider:** `josephfarina`, `2026-10-08`

A released `astryx docs <topic> <section>` command keeps working after its
topic becomes a namespace when its section is unambiguous: its exact key, or a
title fragment that only one guide's read matches. Each guide's own read
decides between that guide's sections, as a topic's read does. Any other case fails with the error an unknown section already
gives, naming the guides, so the reader is one step from the answer.

Rejected: failing every section argument on a namespace; it breaks released
section reads of each split topic.
Rejected: the first match in tree order; it picks a guide silently when two
match.

### DEC-7 — The docsite shows a root namespace as one page

**Reference:** `spec:AST-046/DEC-7`
**Decider:** `josephfarina`, `2026-10-08`

A person reading the docsite keeps one full page per topic, at the same address
and in the same sidebar group, however the CLI splits it; an agent reads the
guides one at a time. Guide addresses redirect temporarily, so a later site
version can give guides their own pages without breaking a saved link. A
namespace whose slug is a package's page keeps one page per guide, because that
slug already belongs to the package.

Rejected: one docsite page per guide; it moves each split topic's address and
thins its page.

### DEC-8 — Authoring owns integration authoring, and every doc has a named home

**Reference:** `spec:AST-046/DEC-8`
**Decider:** `josephfarina`, `2026-10-21`

Maintainer decision: everything an integration author reads lives under one
top-level home, `authoring`, which holds the integration guides and the field
reference. No doc sits in a catch-all:
a flat topic's home is named for what it is, Guides or Foundations, after the
docsite's sidebar groups. Routes move with every reference, as DEC-3 allows,
and topic names do not change.

Rejected: keeping the integration guides under `cli` beside a separate
reference, which gave authors two top-level homes; and a generated level a
reader sees as "Unorganized".

## Open questions

- **OQ2 — What another provider's doc reads when it links to, extends, or
  replaces a topic that becomes a namespace.** (`human-api`) FR13 moves every
  reference inside the topic's own provider; a reference in another package
  cannot move with it.
