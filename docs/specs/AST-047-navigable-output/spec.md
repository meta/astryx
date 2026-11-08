---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-047
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
phase: implementing
owners: [josephfarina]
affects_architecture: [architecture:cli-surface]
affects_families: []
affects_contributing: []
affects_consumer_docs: [cli]
---

# Navigable CLI output system spec

## Intent

Every read the CLI prints is a node in a graph. A reader who lands anywhere,
from a search hit, a link, or a guess, must see where they are and every move
they can make next, as commands they can run: up to the level the node sits
in, down to its children, across to its neighbors, and out to the nodes it
names. Nobody has to know a route in advance or read a long page to find one
fact: they search, land on the smallest node that answers, and move from there.

This record owns the moves a read offers and how they appear in text and JSON.
`spec:AST-046` owns the docs tree those moves walk first.

## Non-goals

- What the nodes of each command are. The docs tree is `spec:AST-046`'s; each
  command that adopts this record decides its own nodes.
- Interactive navigation. There are no prompts, pagers, or state kept between
  runs; each move is its own command.
- Links out of the CLI, such as docsite URLs.

## Requirements

- **FR1 — A read names where it is.** A read below the top MUST name its
  place: a docs-tree node its breadcrumb, a section its topic, and a search hit
  the path of titles above it (`Astryx CLI › API › Functions › search()`).
- **FR2 — Up.** Every read except the top MUST offer the command that opens the
  level it sits in: for a section, its topic's section list; for a node or a
  topic, the level it sits in (a guide's namespace, or the Guides or Foundations
  level for a flat topic, `spec:AST-046` FR12); for a top-level namespace, the
  topic list.
- **FR3 — Down.** A read that has children MUST list them, each with its
  summary, and give the command that opens one: a namespace its children, a
  topic's index its sections, and the topic list its topics and namespaces. In text,
  a topic with more than one section is read one level at a time: a bare read
  lists its sections, and `--full` prints the whole doc; the dense variant is
  written to be read whole, so `--dense` prints it whole. The JSON contract is
  unchanged: `docs(topic)` and `--json` return the whole doc, and `--index` its
  sections.
- **FR4 — Across.** A read with a place in an ordered level MUST offer the
  commands that open the item before it and the item after it, when they exist:
  a section's neighbors in its topic, and a docs-tree node's neighbors in its
  parent's slot.
- **FR5 — Out.** A read that names another node MUST give the command that
  opens it: a command doc its API function, a function doc its command, and a
  typed doc each doc it lists as related.
- **FR6 — Search lands on nodes.** Each search hit MUST be one node, the
  smallest that answers (`spec:AST-046` FR10), with the command that reads it
  and the command that opens the level above it.
- **FR7 — Moves are commands, and JSON carries them.** In text, each move MUST
  be a whole command that starts with the command name `spec:AST-081` FR5
  picks. In JSON, a read MUST carry its moves as data: `links`, with `up`,
  `previous` and `next` where FR4 applies, and
  `related` where FR5 applies to a typed doc, each an `astryx ...` command; a search hit carries `command` and
  `parent`. `links` MUST be present on every read but the topic list, as a field
  added to each existing response, and the published types MUST type each move
  as an `astryx docs` command. The text view
  MUST stay a projection of the JSON.
- **FR8 — A wrong move says where to go.** A route, topic, or section that does
  not exist MUST fail with a stable error code and suggest the nodes a reader
  can reach from the nearest level that does exist (`spec:AST-046` FR6).
- **FR9 — Moves are derived, not written.** The CLI MUST derive Up, Down, and
  Across from the docs tree and a topic's sections, and Out from a typed doc's
  own fields, so no doc lists its own moves and every provider's docs, from
  Core, the CLI, or an integration, get the same moves. A link from one doc to
  another MUST name its target by doc identity, never by route or title. A bare
  name in a typed field (`fn`, `command`, `related`) names a doc of its own
  provider, so it is a doc identity: it resolves among the kinds its field
  allows, and a name that matches docs of more than one allowed kind is an
  error, never a silent pick. Inside a doc's text, a link MUST be written
  `{@link <target>}` and read as the command that opens its doc; a link that
  names no doc MUST print as written. A topic's section MAY hold a `reference`
  block, which includes the doc it names instead of a copy: a read MUST inline
  it as that doc's content (a schema's content narrowed to the fields its
  projection names), then a line naming that doc and the command that opens
  it, so a read still returns only the stable content blocks. A target, field,
  or projection the block cannot include MUST fail the authoring check.
  `workflow` and `collection` blocks (GraphContentBlock) belong to a namespace
  doc's `blocks`, which a later phase renders. A target without a
  provider names a doc of the provider that wrote the link: in a topic that
  merges sections from several providers, each section resolves against its
  own. A component doc's text fields (`description`, `summary`, `label`, at any
  depth, an example's label included; never code or defaults) and a topic's description and
  summary hold links too, and a component doc's bare target names a doc of
  the component's provider, where a Core component's provider is the CLI's
  docs, which hold Core's guides. A search hit's description reads the same.
  The CLI MUST resolve
  every link when it reads a doc, and Doctor MUST warn on a link that is
  unresolved or ambiguous. A link names a doc identity, not a provider instance,
  so it survives version changes.
- **FR10 — Phase 1 covers docs and search.** `astryx docs` and `astryx search`
  MUST meet FR1–FR9, FR11, and FR12. A command a doc shows as an example, in a code
  block or in prose, is not a link: FR11 keeps it true. Other commands adopt
  this record in later phases, each as its own change.
- **FR11 — Nothing a read shows can go stale.** A move or a cross-link MUST be
  derived when the read is made, never stored in a doc. Every other `astryx`
  command that a doc, a hint line, or the repository's agent prompt shows MUST
  name a real command and only options that command takes, and every
  `astryx docs` command it shows MUST open; a test MUST fail the build
  otherwise. A command a doc shows wrong on purpose, as an error-code example,
  MUST be listed as such, and the list MUST fail when an entry is no longer
  shown.
- **FR12 — Every doc is one walk away.** Every doc a provider ships MUST be
  reachable from `astryx docs` by following the moves reads offer: Down from the
  topic list and each namespace, then Across and Out. Neighbors MUST agree: the
  read an item's Next opens names that item as its Previous. A test MUST walk
  the whole graph from the top and fail on a doc file it cannot reach, a move
  that does not open, or a link that names no doc.

### Platform support

The moves are plain commands that start with the command name `spec:AST-081`
FR5 picks, so they run in any shell the CLI runs in. JSON carries them without
that name.

## Current-state impact

Before this record, only docs-tree namespaces and typed docs offered a way up,
and only in text; a section, a topic, and a topic's index were dead ends.

Phase 1 changes:

- in text, a bare topic read lists the topic's sections when it has more than
  one; `--full` and `--dense` print it whole; `docs(topic)` and `--json` still
  return the whole doc;
- `docs.node`, `docs.index`, `docs.detail`, and `docs.detail.section` carry
  `links`: `up` on every read, and `previous` and `next` on sections and
  docs-tree nodes;
- a section read, a whole-topic read, and a topic's index end with their moves;
- a docs search hit carries `parent` and the path of titles above it;
- links between docs are typed (`{@link <target>}` in text, and the typed
  fields), resolved on every read, and checked by Doctor, which warns; the
  hand-written `astryx docs` links in the CLI's own docs become typed links;
- a test proves every command a doc or hint shows is a real command with real
  options, and every docs command opens;
- a test walks the whole graph from the top and reaches every doc file the CLI
  ships, as FR12 states.

`architecture:cli-surface` INV27 carries this record into the code.

## Verification

| Contract     | Verification                                                                                      | Representative states                                                                                                        | Mutation or failure expectation                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| FR1–FR5, FR7 | `docs()` dispatcher tests, CLI runs, and the graph walk (`packages/cli/test/docs-graph.test.mjs`) | a top-level namespace; a typed doc in the middle of its slot; the first and the last section of a guide; a flat topic, whole | A read with no way up, a move that does not run, or a text move with no `links`                     |
| FR6          | Search tests                                                                                      | a section hit; a docs-tree hit; a topic hit                                                                                  | A hit without `parent`, or a `parent` that does not open the level above                            |
| FR8          | `spec:AST-046` FR6 tests                                                                          | an unknown route, topic, and section                                                                                         | A dead end without suggestions                                                                      |
| FR9          | Link tests, the doctor docs-tree check, and the graph walk                                        | an inline link, a link in a list and a table, and a typed field; a link to another provider; a link in code ticks            | A link that names no doc and still passes, a link resolved by guess, or a stored route              |
| FR11         | The graph walk's shown-commands check                                                             | commands in doc prose and code blocks, CLI hint lines, and the agent prompt; the wrong-on-purpose list                       | A command or option the CLI does not have, a docs command that does not open, or a stale list entry |
| FR12         | The graph walk (`packages/cli/test/docs-graph.test.mjs`)                                          | every tree node; every doc file the CLI ships; Next and Previous on sections, topics, guides, and tree nodes                 | A doc file no walk reaches, a move that does not open, or a Next whose read names another Previous  |

## Decision log

### DEC-1 — A move is a command, not a route

**Reference:** `spec:AST-047/DEC-1`
**Decider:** `josephfarina`, `2026-09-28`

Each move is a whole `astryx ...` command that a reader can run as is.

Rejected: bare routes. They make the reader rebuild the command and know which
argument a section key goes in.

### DEC-2 — Across names the neighbors, not the whole level

**Reference:** `spec:AST-047/DEC-2`
**Decider:** `josephfarina`, `2026-09-28`

FR4 names the item before and the item after; the whole level is one move up.

Rejected: listing every sibling on every read, which makes each leaf as long as
its parent.

### DEC-3 — Adopt per command, docs and search first

**Reference:** `spec:AST-047/DEC-3`
**Decider:** `josephfarina`, `2026-09-28`

Readers get lost in the docs first, and search is how they arrive. Other
commands adopt the moves as their own changes.

Rejected: one change for every command, which is too large to review and
decides every command's nodes at once.

## Open questions

- Which command adopts this record next, and what its nodes are.
- Whether top-level namespaces offer `previous` and `next` among each other.
