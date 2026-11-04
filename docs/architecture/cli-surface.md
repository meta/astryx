---
schema_version: 1
template_version: 1
kind: architecture
id: architecture:cli-surface
authority: current
archive_reason: null
superseded_by: null
approved_by: josephfarina
approved_at: 2026-10-20
owners: [josephfarina]
applies_to: [packages/cli]
verified_by:
  [
    pnpm check:cli-structure,
    clients/cli/commands/json-contract.test.mjs,
    clients/cli/commands/interactive-guard.test.mjs,
    clients/cli/cli-exit-codes.test.mjs,
    clients/cli/error-envelope-code.test.mjs,
    foundation/response/error-codes.test.mjs,
    foundation/agent-docs/agent-docs.test.mjs,
    foundation/agent-docs/agent-docs.path-safety.test.mjs,
    clients/cli/commands/init.behavior.test.mjs,
    api/init/remove/remove.test.mjs,
    foundation/integrations/autolink.test.mjs,
    foundation/runtime/package-set.test.mjs,
    foundation/runtime/hosted-runtime.test.mjs,
    foundation/integrations/manifest-writer.test.mjs,
    foundation/integrations/contribution-inventory.test.mjs,
    foundation/discovery/theme-discovery.test.mjs,
    authoring/doctypes/doctypes-new.test.mjs,
    scripts/check-cli-theme-bundle.test.mjs,
    clients/cli/commands/integration-authoring.test.mjs,
    clients/cli/commands/integration-real-world.test.mjs,
    api/integration/add-contribution.test.mjs,
    api/integration/pack-check.test.mjs,
    api/integration/validate-integration.test.mjs,
    foundation/integrations/cli-peer-version.test.mjs,
    api/theme/integration-themes.test.mjs,
    clients/cli/commands/upgrade.integration-policy.test.mjs,
    clients/cli/formatters/index.test.mjs,
  ]
deciding_specs: [spec:AST-017/DEC-4, spec:AST-042/DEC-1, spec:AST-042/DEC-2]
---

# CLI surface architecture

## Purpose

The Astryx CLI is how an agent reaches Astryx. Everything an agent needs while
building with the design system — what exists, what it does, how to use it,
what is wrong with the code in front of it — is reachable through one command
surface, in one predictable shape, with no person in the loop.

The CLI has one audience: an agent running it in a subprocess. A person at a
terminal is a supported reader of the output, never the caller the design
serves. Every rule below follows from that one fact.

This record describes the shipped surface: how a command is invoked, what it
may emit, how it fails, and where its code lives. It does not describe what
the commands do.

## System model

A run has five stages, and each one is a place where the surface is enforced
rather than left to the command author.

1. **Preflight.** `clients/cli/bin/astryx.mjs` gates the Node version using
   only built-ins, before importing anything that could fail on an old
   runtime. The gate honours `--json` with a hand-rolled envelope carrying
   `ERR_NODE_VERSION`.
2. **Release choice.** `foundation/release/handoff.mjs` chooses the release
   that answers the folder (`spec:AST-081` FR2) before anything the project
   provides loads. When that release is not this copy, the run is handed to
   it once, with the same arguments, folder, and standard streams, and ends
   with its exit status (`spec:AST-081` FR9); a release that cannot run fails
   the run with `ERR_VERSIONS_UNAVAILABLE` before any write.
3. **Dispatch.** `clients/cli/index.mjs` parses with Commander, sets JSON mode
   in `preAction` before any command body runs, and rejects a command that
   cannot support `--json` before any side effect.
4. **Work.** The command parses its arguments and calls a function in `api/`.
   The command is a thin wrapper: parse, call, render. The API function is the
   unit that is scriptable and typed, and it is the source of truth for the
   `type` discriminator on its own envelope. `spec:AST-042` FR1 makes this the
   contract; INV20–INV22 fix where each part lives.
5. **Render.** Exactly one of two paths. In `--json` mode, `jsonOut` writes a
   single envelope. Otherwise the formatters render the same values as text,
   from a closed set of blocks (INV23). Nothing else may write to stdout.

Discovery of components, templates, themes, codemods and docs is not per-command. It
goes through the `Project` seam in `foundation/config`, which resolves the
integrations named in `astryx.config` and then autolinks any DECLARED dependency
that ships a root `astryx.integration.*` manifest — a config entry is how a
project pins an integration, not how the CLI finds one. Each integration is
loaded independently. A manifest load failure withdraws that package. An error
in one contribution kind does not hide other valid kinds, and invalid template
or component files do not hide valid siblings.

A programmatic host (`spec:AST-081` FR1) can serve the CLI from package sets it
keeps elsewhere: package roots whose `node_modules` each hold a CLI, the Core
equal to it, and the integrations the host installs with them. The host entry,
`@astryxdesign/cli/host`, activates the root that serves a run in-process,
through the package-private implementation in `foundation/runtime`. The working
folder stays the caller's: the project, its config, local themes, and the
package being authored resolve as they do without a host, and no write lands in
a package root. Core lookups, and integration lookups outside a project, consult
the active root only after the project's own resolution misses. With no active
set, every lookup behaves exactly as it does without the seam (INV30). Which
release answers a hosted run, the host entry's inputs, and the lines a hosted
run prints are `spec:AST-081`'s.

AST-017 DEC-4 owns stable response-entry fields and requires their complete type,
test, applicable text, and consumer-documentation projections. A `template.list`
entry can carry optional `replaces`, naming the Core id that a winning
integration template supersedes; the Core entry is omitted from the default list
and remains available through explicit Core package selection.

## Boundaries and invariants

- **INV1 — The CLI never asks a question.** No prompt, no TTY detection, no
  read of stdin for control flow. A non-TTY environment is the only supported
  condition, not a fallback. A command with nothing to do exits with a result,
  never a question.
- **INV2 — Every `--json` emission is one valid envelope.** Success is
  `{apiVersion, type, data}` plus optional `package` (INV28) and `meta`, which
  carries `answeredBy` on every success (`spec:AST-081` FR5). Failure is
  `{apiVersion, error, code}` plus optional `suggestions`. There is no third
  shape, no partial write, and no raw stack trace: an uncaught throw becomes an
  envelope at the bin error boundary.
- **INV3 — The code is the contract; the prose is not.** `code` is stable and
  append-only. Once shipped, a code's meaning never changes and the code is
  never removed. The `error` string may be reworded at any time. A consumer branches on `code`.
  `ERR_PROJECT_REQUIRED` and `ERR_VERSIONS_UNAVAILABLE` carry the refusals and
  failures `spec:AST-081` FR2 and FR4 define.
- **INV4 — Human output is a projection of the JSON, produced only by the
  formatters.** `emit` accepts a renderer-produced `Block` and nothing else, so
  a stray string cannot reach stdout. Output is plain ASCII: no colour, no TTY
  detection, no width wrapping, byte-for-byte identical printed or piped.
- **INV5 — Text field names mirror JSON keys one to one.** The two views cannot
  drift, and every field stays greppable.
- **INV6 — One command, one file.** A command is
  `clients/cli/commands/<name>.mjs`, or `clients/cli/commands/<name>/index.mjs`
  when it is a group, with a sibling `<name>.doc.mjs`. A subcommand's doc is
  `<parent>-<child>.doc.mjs`.
- **INV7 — Every command ships a `CommandDoc`, and the generated surfaces come
  from it.** Help text, the README command and error-code tables, and the
  manifest are generated. None of them is written by hand. Every command and
  subcommand's `CommandDoc` declares `outsideProject`, which the manifest
  publishes (`spec:AST-081` FR4).
- **INV8 — Exit codes do not depend on the output mode.** The same condition
  exits the same way with and without `--json`, so a command works as a gate
  without parsing stdout.
- **INV32 — Warnings fail a command only under `--strict`.** Without
  `--strict`, a command exits 1 for an error, never for a finding it reports
  as a warning, so a warning cannot turn a passing build red. A condition a
  command's own mode exists to detect, such as stale outputs under
  `theme build --check`, is an error, not a warning. A command that can gate a
  build on its warnings offers `--strict`, which changes only how the same
  findings end the run: it reads exactly the data the default run reports and
  adds no check, reports each warning, and each check that did not run, as an
  error in the command's own issue format with the finding's own code, and
  exits 1, the same way in text and JSON (INV8). A command offers `--strict`
  only through a record that names it; `astryx integration check`
  (`spec:AST-039` FR14) is the one that does (DEC-4).
- **INV33 — Documented component props agree with the source.**
  `astryx doctor integration components` MUST compare every prop table a
  component descriptor documents with the props of the export it describes, read
  with the TypeScript the project installs. It MUST warn about a documented prop
  the code lacks, a prop the package's own source declares that the table omits,
  a `required` flag the code contradicts, and a documented type that does not
  match the code under the loose comparison the command documents. It MUST NOT
  warn that a table omits `ref`, the React-reserved `key`, the internal and
  styling props the published `ComponentPropDoc` type tells authors to skip
  (`xstyle`, `className`, `style`, and `data-testid`), or a prop its declaration
  marks `@internal`. It MUST list a documented type it cannot judge as unchecked
  rather than report a match or a mismatch. Without the project's TypeScript it
  MUST say that the comparison was skipped and why, and MUST NOT report a pass.
- **INV34 — Every descriptor satisfies its published authoring type.**
  `astryx doctor integration validate` MUST check each descriptor an
  integration's roots hold, and each translation a descriptor carries, against
  the type `@astryxdesign/cli/authoring` publishes for that kind in an
  integration, as the TypeScript the project installs checks a value written
  with that type; a component or hook translation MAY carry `name` and
  `displayName`, which are ignored at render. It MUST warn about every unknown
  field, missing required
  field, and value outside its field's type, naming the field and the change
  that fixes it, including a field the compiler reaches only once an earlier
  unknown field is gone. A value the loader accepts and the CLI reads MUST
  satisfy that type. Where an integration may author more than Core's type for a
  kind allows, such as any template `category`, `@astryxdesign/cli/authoring`
  MUST publish an additional integration type for that kind, and Core's type
  MUST stay unchanged. Without the project's TypeScript it MUST say that the
  descriptors were not type-checked and why, and MUST NOT report a pass.
- **INV37 — Every item source has its descriptor.** `astryx doctor integration
validate` MUST warn on a PascalCase `.tsx` at the top of the components root
  with no same-stem component doc (`source_without_component_doc`), and on a
  `.tsx` at the top of the templates root with no same-stem template doc
  (`source_without_template_doc`). Test, spec and story files (`.test`,
  `.spec` and `.stories` stems) and subfolders are skipped, and a helper
  belongs in a subfolder.
- **INV35 — One command checks an integration, and can gate its build.** The
  `astryx integration check` command, which takes no package argument, MUST run
  the `validate`, `components`, `templates`, and `docs` checks against the
  integration package in the current folder, report each check's own result and
  a summary, and exit 1 exactly when one of those checks would exit 1 on its
  own. With `--strict` it MUST also exit 1 on any warning and on any check, or
  comparison within a check, that did not run, such as a package with no
  integration manifest or a comparison that needs the project's TypeScript,
  reporting each as an error from the same findings the default run reports
  (INV32). An item a comparison lists as unchecked,
  such as a prop type it cannot read, does not fail `--strict`. `--strict` also
  fails on three doc faults the `docs` check finds in prose (DEC-8): a
  copied passage, where two topics repeat 10 or more words word for word (a
  run of mostly function words, or one that three or more topics share, is not
  a copy); fluff, a listed padding phrase or a topic whose share of content
  words is under the published floor; and a stray pointer, a code span that is
  exactly `astryx docs <name>`, or a `{@command docs <name>}` token in a code
  span or not (DEC-12), for a doc that exists, in a topic's prose,
  description or summary or a component doc's text, where a `{@link}` to that
  doc would be checked. It also fails on doc structure a reader silently
  drops: a prop documented twice, an overlay key that names no prop, two
  sections with one key, an overlay beside no topic, and an empty section.
  Its exit codes and JSON shape are a compatibility
  contract for the builds that run it, from the first stable release that
  ships `integration check`: from then on, a new check, or a new failure code,
  MAY join it only in a minor release that names the addition, and a change
  that can fail a build that passes, including a stricter rule for an existing
  finding, MAY ship only in a minor release that names it. Before that
  release, its checks and failure codes MAY change in any release. A failure
  code that fires only for a package declaring an experimental manifest key
  (`spec:AST-017/FR27`, `spec:AST-084`) MAY join in a patch release, since a
  package without the key never sees it. A name a
  patch release adds to Core or the CLI (a component, template, or topic) MAY
  raise a conflict with a package's own name. Each `doctor integration`
  subcommand MUST keep its exit codes, and its JSON MAY change only by
  additions. Because builds fail on its findings, it MUST NOT report a finding
  the package's code does not contradict, other than the doc faults of DEC-8,
  the doc-syntax findings of DEC-12 and the example findings of DEC-13:
  a check that cannot judge an item lists it as not checked instead (DEC-7).
  A finding that would newly fail a build MUST first ship as a note marked
  `next` in `validate`'s `data.notes`, which fails nothing by default:
  `--next` counts those notes as warnings, so `--strict --next` fails on them
  today, and every run reports how many there are and names that command. The
  next minor release counts them by default (DEC-11).
  When the running CLI is outside a package's `@astryxdesign/cli` peer range,
  `astryx doctor integration validate` and `integration check` MUST list a
  `cli_peer_version` note, which fails nothing, `--strict` included, and
  `integration verify` does not report it: below the range it names the
  project's commands to install a newer Core and CLI together and run
  `upgrade --apply`, and above it, it asks for a release of the package that
  supports this CLI or, for the package in the current folder, to test with
  this CLI and widen the range.
- **INV36 — The person filing a gap report chooses where it goes.**
  `astryx gap-report` MUST send a report to the configured report handlers, or
  with none to the owning package's `issuesUrl` (`spec:AST-031` FR8), unless
  the caller names a destination with `--to <package>`. A destination is a
  loaded integration whose manifest sets `issuesUrl`. With `--to`, the report
  goes only to that `issuesUrl`, the way the zero-handler fallback sends it: a
  GitHub issues URL is filed only with `--confirm-public` and reports
  `consent_required` without it, and any other URL comes back as
  `routed_only`. A `--to` that names no destination MUST fail with
  `ERR_UNKNOWN_PACKAGE` before anything is sent, listing the destinations it
  accepts. While at least one destination exists, the categories listing and
  the receipt of a run without `--to` MUST list the default and every
  destination, in text and JSON, and MUST tell the agent to ask the person
  where to file and to pass the person's choice with `--to`. The command's
  docs and agent guidance MUST say the same: an agent asks the person, never
  picks a package destination on its own, and leaves out `--to` when the person
  does not choose (DEC-9).
- **INV9 — A command that cannot support `--json` is rejected before any side
  effect**, not part-way through the work.
- **INV10 — Every write is confined.** Output paths pass `assertWithin`, which
  canonicalises symlinks and rejects a NUL byte; an escape is
  `ERR_PATH_TRAVERSAL`. Bounded inputs are capped rather than trusted. The only
  writes outside a project or output folder are the per-user ones
  `spec:AST-081` FR7 lists: releases and records in the per-user cache, the
  settings and state files, and the computer-level skill file with its links or
  copy in the home folder. None follows a link in its place, and none replaces
  anything the CLI did not create.
- **INV10a — Refusing a write outside its confined root is a compatible fix.**
  When a current record already confines the writes of a CLI operation (a
  command or its programmatic API) to a root, a change that makes the operation
  refuse a write outside that root, before writing anything, is a compatible
  `[fix]` and patch-eligible under the `spec:AST-017` release process. This
  holds for every route the write takes (a traversal segment, an absolute path,
  a symlink, or a default location derived from an input outside the root), and
  even when the latest stable release accepted the input and its documentation
  did not forbid the write: a write outside the confined root is not a supported
  workflow, so a caller that relied on it is not a released victim. The
  Changeset cites the confinement rule the released behavior violated, names
  each input that is now refused and how it fails, and gives the migration.
  Inputs whose writes stay inside the root keep working. Refusing one of them,
  moving outputs instead of refusing, or confining an operation that no current
  record confines is classified like any other change.
- **INV10b — An upgrade acts on the project it runs in; a folder below that
  project is never a separate root.** `astryx upgrade` operates on the project
  `spec:AST-040` FR9 finds: the nearest folder at or above where it runs whose
  `package.json` declares an Astryx package, or that an Astryx workspace lists.
  A folder that installs `@astryxdesign/core` but declares no Astryx package
  and is not a listed workspace member is not a supported upgrade root: an
  upgrade run there that migrates only that folder leaves the rest of the
  project on the old release, so a caller who relied on it is not a released
  victim (`spec:AST-017` FR54). Acting on the project above such a folder is a
  compatible `[fix]` and patch-eligible. A folder that declares an Astryx
  package is its own project, so a run there operates on that folder.
- **INV11 — A broken integration degrades a command run, it does not fail
  it.** The `Project` seam loads each integration independently and records
  the failure, and the command's own work proceeds without that integration's
  contributions. The diagnostic command is the exception by purpose (INV29).
- **INV29 — `astryx doctor` fails on a configured integration that cannot
  load.** An integration named in `astryx.config` that is not installed, has
  no manifest, or whose manifest throws or fails its schema is a failed
  `configured-integrations` check, so `doctor` exits 1; an `astryx.config`
  that imports but from which the CLI cannot load the project is a failed
  `config` check with the same exit. What counts as configured is every name
  `astryx.config` lists, including a package set aside for a provider-ID
  conflict and the package being authored when its own config names it (its
  load error is the outcome that counts). An installed integration the config
  does not name stays informational. This invariant covers loading only; what
  `doctor` reports about the contributions of an integration that loads is
  owned by the checks that read them.
- **INV12 — Human chatter never touches stdout in JSON mode.** `humanLog` and
  `humanWarn` are the only chatter primitives, and both are no-ops under
  `--json`. The run-level lines `spec:AST-081` defines, which print before or
  after a command (who answered, the fallback warning, install progress, and
  update notices), go to standard error and print nothing under `--json`.
- **INV13 — Agent docs have one rendered source of truth.** Init and upgrade
  render configured integration `agentDocs` through the existing `Project`
  seam. Upgrade compares complete block bytes even when Core is unchanged and,
  when codemods or hooks run, writes the prepared block only after they succeed.
  The computer-level agent text that `astryx init --user` writes renders from
  the same source (`spec:AST-081` FR8).
- **INV31 — Agent docs reach every agent from the project's own files.** By
  default, init writes the agent-docs block so that every agent CLI reads at
  least one copy, whether it starts at the project root or in a folder below
  it, from files the project commits (DEC-2). `--agent` and `--agent-docs-path`
  name the files instead; an `--agent` preset still never leaves a copy in both
  Claude Code files, except as the ignored-root rule below says.
  - `AGENTS.md` at the project root holds the block. Init creates it when it is
    missing.
  - The project's Claude Code file holds a full copy: root `CLAUDE.md`, else
    `.claude/CLAUDE.md`. It holds the copy even when it imports `AGENTS.md`,
    because Claude Code does not follow an import of a file above the folder it
    starts in. While root `CLAUDE.md` holds a copy, `.claude/CLAUDE.md` holds
    none, except while root `CLAUDE.md` is untracked and ignored by the
    repository's ignore rules, including its local exclude file and configured
    excludes: then a `.claude/CLAUDE.md` the project commits (tracked, or not
    ignored) holds a copy too, as it does when the repository cannot say, in
    the default layout and with the `claude` and `all` presets, so a fresh
    clone still gives Claude Code one.
    Init creates no Claude Code file, and a Claude Code file that is
    `AGENTS.md` under another name holds no second copy.
  - `GEMINI.md` holds a one-line managed import of `AGENTS.md`. Init creates
    it when it is missing, and adds no import to a `GEMINI.md` that already
    imports `AGENTS.md` the way Gemini CLI reads imports. Settings that point
    Gemini CLI at `AGENTS.md` do not replace the import, because Gemini CLI
    reads a project's settings only when it starts at the project root.
  - Every other agent file the project has holds a full copy, unless it imports
    `AGENTS.md`. When an agent file imports an agent file other than
    `AGENTS.md`, or two agent files are one file, the project keeps its own
    layout: every agent file that imports no other agent file holds a copy.
  - A managed import counts as a copy only while `AGENTS.md` holds the block.
    Doctor fails when it does not.
  - Init writes at the project root: the nearest folder at or above the
    working folder whose `package.json` declares an `@astryxdesign` package,
    else the nearest folder with a `package.json`, else the working folder.
    The search stops at a repository root and never counts the home folder. A
    path given with `--agent-docs-path` stays relative to the working folder.
  - No mode writes agent docs into the home folder, or into a settings folder
    in it, a folder of the home folder whose name starts with a dot, outside a
    project. A folder inside a settings folder belongs to a project when it,
    or a folder above it below the settings folder, has a `package.json`; the
    settings folder itself never does. Init reports the folder it refused and
    still succeeds, and removing a block there stays allowed. The
    computer-level skill file `spec:AST-081` FR8 writes
    (`~/.agents/skills/astryx/SKILL.md`, with its folder links or copy in other
    agents' skill folders) is not a project's agent docs: only
    `astryx init --user` and the global copy's background step write it, as
    INV10 and FR8 state.
  - Upgrade refreshes every copy where it is and moves none.
  - The managed block is Astryx-owned: `spec:AST-040`'s protections cover
    consumer-owned content, not the block; INV10 still confines every write.
  - `--remove-agents` removes the block at the project root and in the working
    folder. Every file it would change resolves inside its own folder, or it
    changes nothing.
- **INV14 — An installed integration is discoverable without configuration, and
  autolinking it can only add.** A dependency the project DECLARES in
  package.json, and that ships a root `astryx.integration.*` manifest, is
  loaded; `node_modules` is never walked, so nothing the project did not declare
  can contribute. Enumeration reads only the dependency KEY, never its value, so
  an npm alias or a non-semver protocol resolves like any other. A config entry
  keeps precedence over the same package autolinked, and a dependency whose
  manifest fails to load is dropped rather than raised as the consuming
  project's issue. Outside a project, a hosted run also loads each integration
  its host approves, by name, from the package root that serves it (INV30).
  Integrations installed for the computer (`spec:AST-081` FR12) contribute
  only outside a project, from the packages installed beside the global copy.
  Inside a project they contribute nothing: `discover` and `doctor` load the
  manifest of each one the project does not install only to list as available
  the ones whose peer range admits the answering release and whose manifest
  loads.
- **INV15 — Integration authoring writes one complete, discoverable contribution.**
  `integration add <kind> <name>` and its typed per-kind APIs share one receipt
  contract. A dry run reports the same planned paths without writing. A real run
  refuses to clobber authored files, stages related writes atomically, declares
  a contribution root only with valid bytes behind it, and verifies visibility
  through the same discovery seam consumers use.
- **INV16 — Authoring preserves package policy and local source wins while it is
  being edited.** Writers never create `files` or `exports`; when either field
  already exists, they add only the required manifest, root, or public subpath
  and preserve every author-owned entry. Generated component and template export
  keys are extensionless public subpaths even when they target authored `.ts` or
  `.tsx` source. The integration beside the current package.json replaces the
  same installed package in place, preserving its configured order while making
  working bytes authoritative.
- **INV17 — Pack verification examines the artifact consumers receive.**
  `integration verify` runs the package lifecycle through `npm pack`,
  compares the required file inventory with the actual tarball, extracts that
  tarball into a scratch consumer, and reruns contribution discovery. It rejects
  advertised component imports ending in `.ts` or `.tsx`, resolves every exact
  advertised component and inferred template import through Node's package
  resolver, and fails when the packed artifact has no usable public export. This
  contract does not require project-local TypeScript or promise validation under
  TypeScript's Node16 or bundler resolution modes.
- **INV18 — Integration diagnostics are read-only and contribution-specific.**
  Doctor reports malformed or unreachable roots and contribution conflicts
  without rewriting the package. A manifest load failure withdraws the package.
  A contribution-kind error remains visible without hiding other valid kinds.
  Invalid template and component files do not hide valid siblings. A
  package-scoped theme lookup still surfaces that package's blocking catalog
  error instead of misreporting the theme as unknown.
- **INV19 — Integration themes are importable packages; editable source is an
  explicit eject.** The manifest's `themes` root contains one directory per slug.
  Every theme source has a mandatory same-stem, strongly typed `ThemeDoc`; there
  is no root item catalog. Discovery derives the source entry and required named
  export from the shared stem, parses source without executing it, and rejects
  escaped local imports and missing or type-only exports. The theme directory is
  the recursive copy and pack boundary; dot entries and files npm never publishes
  belong to no theme. A dot-folder, or a folder holding neither a descriptor nor
  a `<name>Theme` source, is not a theme and is neither read nor packed, and doctor
  warns about one that looks like a theme; a folder with a theme source and no
  descriptor fails. The one exception is the project's local `src/themes` root:
  a source copy made by the released `theme add` without its descriptor is
  reported as unmigrated, skipped without failing theme commands, and remains
  unmanaged until upgrade adds its missing descriptor. `integration add theme`
  creates public built-module and stylesheet exports and keeps CSS side effectful.
  A package may also export a font stylesheet. `integration verify` rebuilds
  source, compares the local built module and stylesheet, and proves every
  declared theme export resolves from the packed package. `theme list` retains
  package ownership, and `theme add --import` records that owner and imports only built
  outputs. The deprecated plain `theme add` keeps copying source until its scheduled
  cleanup. `theme eject` is the explicit source fork; it copies the complete
  theme directory and same-stem descriptor, with the local descriptor marked as
  not maintained by the package owner.
- **INV20 — A command's API subject has one layout.** A command's behavior lives
  in `api/<subject>/`. `<subject>.mjs` is the subject's entry, and `api/index.mjs`
  re-exports what it exports. A subject with more than one operation puts each in
  a leaf, `<leaf>/<leaf>.mjs`, and the entry dispatches to the leaves. Every
  exported function has a colocated `FunctionDoc` — `<subject>.doc.mjs` for the
  entry function, `<function>.doc.mjs` for any other — and response typedefs in a
  `*.type.mjs` file. Tests sit beside the module they cover as
  `<module>.test.mjs`. A private helper is an underscore-prefixed file, such as
  `_site.mjs`. `api/blog` is the reference layout.
- **INV21 — An API subject reaches the environment only through its adapter.**
  Within `api/<subject>/`, reading or writing files, network requests,
  subprocesses, loading the project or its modules, and discovery that reads the
  disk happen in the subject's adapter: `_adapter.mjs` and any underscore-prefixed
  helper that only it imports. The adapter may call foundation seams such as the
  `Project` seam and `assertWithin`. The entry and the leaves shape inputs and
  results and call the adapter; they do not import filesystem, network, or
  subprocess modules, the `Project` seam, or discovery and loader functions. A
  subject that needs no environment access has no adapter.
  `api/blog/_adapter.mjs` is the reference adapter.
- **INV22 — A command handler parses, calls, and renders.** A handler in
  `clients/cli/commands/` registers through `defineCommand` with its
  `CommandDoc`, and an executable command's `CommandDoc` names in `fn` the API
  function it calls. The handler parses its arguments, calls that function, and
  renders the result through `jsonOut` or the formatter kit. It reads no files,
  loads no project, runs no discovery, and starts no subprocess or network
  request; it may phrase hints with the command name `spec:AST-081` FR5's picker
  chooses. Only command handlers, their `CommandDoc` files, and
  their tests live in that directory. `clients/cli/commands/blog.mjs` is the
  reference handler.
- **INV23 — The formatter kit is closed.** Text output is built only from the
  block constructors in `clients/cli/formatters/index.mjs` — `section`, `text`,
  `list`, `record`, `records`, and `code` — and printed through `emit`. A handler
  does not pad strings to a width, align columns, or draw tables, and it defines
  no renderer of its own; it maps its data onto records, lists, and sections. A
  block kind is added to the kit, with its tests and its line in the help
  "Output format" list, only as `spec:AST-042` FR3 allows.
- **INV24 — Every discoverable integration item owns one typed descriptor.** New
  authoring emits `<source-stem>.doc.mjs`, annotated with its public type from
  `@astryxdesign/cli/authoring`, beside the source or payload it describes. The
  descriptor is the sole per-item metadata authority; `astryx.integration.*`
  locates roots and integration-level capabilities but never catalogs items:
  there is no catalog file under a root and no per-item map or list in the
  manifest (`spec:AST-039/FR11`). A released alternate reader is an isolated
  compatibility path, not a second authoring convention. A component
  descriptor's `name` is the runtime export it documents: discovery records
  the component under that name when its same-stem source exports it and not
  the stem, and records each full entry a descriptor lists in `components`
  under its own name when the module the descriptor imports exports it
  (`spec:AST-039/FR4`). A name recorded only this way never takes an unscoped
  lookup that Core, a legacy docs package, or a component named after its
  source answers: that owner keeps it unless a declared replacement claims it.
- **INV25 — Every CLI doc names the group that reads it.** Each command, API
  function, schema, and enum doc the CLI ships declares a `namespace`. The docs
  tree adopts `cli/commands` and `cli/api` docs, one route each under
  `cli/commands` and `cli/api/<kind>s`; `authoring` docs are sections of the
  field reference, `astryx docs authoring/field-reference`, and appear in its
  list; `astryx docs authoring <name>` reads one. `astryx doctor` fails when a
  CLI doc has no namespace, names one nothing reads, or disagrees with the
  authoring list, so every doc the CLI ships stays readable from the CLI.
- **INV26 — The docs tree gives each doc one home (`spec:AST-046`).** The tree
  is compiled in `foundation/doc-compiler/tree.mjs` from namespace docs, the
  guides they place, and the typed docs they adopt; the CLI's own tree files
  live in `assets/docs/tree/`. A namespace never lists or scans its children.
  `astryx docs <route>` reads it one level at a time, and `astryx doctor` warns
  on any tree error diagnostic or unplaced CLI doc.
  An integration's namespace docs and placed guides join the same tree, named
  by its provider id; the CLI's own docs keep a contested route.
  Every flat topic sits in the generated level for its category, Guides or
  Foundations, under its own name, so every doc has a named home in the tree.
  Everything an integration author reads lives under `authoring`.
- **INV27 — Every read says where to go next (`spec:AST-047`).** A read names
  its place and ends with its moves (up, down, across, and out) as runnable
  commands, and its JSON carries the same moves as `links`; a search hit
  carries `parent`. Nothing a read shows can go stale: moves are derived, and a
  test proves every command a doc shows is real. `astryx docs` and
  `astryx search` meet it first.
  A link between docs names its target by doc identity and is resolved on
  every read; Doctor warns on one that names no doc.
- **INV28 — Every result names the package each artifact comes from.** A
  `--json` result about one artifact (a component, doc, template, or hook)
  carries `package` in its envelope, directly after `type`. A result
  that lists artifacts gives each listed artifact its own `package`, and a
  doc's sections each name the package that wrote them. Core's components,
  hooks, templates, and codemods name `@astryxdesign/core`; the docs the CLI
  ships name `@astryxdesign/cli`; an integration's artifacts name the
  integration's package, with nothing written for it by the integration's
  author. Two lists of plain names, `hook --list` and `swizzle --list`, hold
  only Core's artifacts and name `package` once, in the envelope; `build`'s
  `frame` and `foundation` are fixed lists of Core component names. Text
  output names the same package. Verbatim source output (`--source`,
  `--showcase`, and a template's source) keeps stdout to the source alone, so
  it pipes byte for byte, and names the package on stderr.

- **INV30 — A host's package set fills only what the project leaves open, from
  one root.** A package set is a package root whose `node_modules` holds a CLI,
  the Core equal to it, and the integrations installed with them. A programmatic
  host passes its package sets, in its order of preference, through the host
  entry (`spec:AST-081` FR1); which release answers a hosted run, and every line
  a hosted run prints, are `spec:AST-081` FR2, FR3, FR5, and FR9's. Only the
  host entry activates a package set: no CLI flag, environment variable, config
  key, or command does, and no `foundation/runtime` module is exported.
  - A project's installed packages always resolve from the project. Inside a
    project, a root fills only the `@astryxdesign/*` packages the project leaves
    uninstalled whose copy in the root ships no integration manifest, so it
    contributes no integration (`spec:AST-081` FR12). A run resolves from at
    most one root, so a CLI never pairs with a Core or an integration from
    another set. A run handed to the project's own CLI (`spec:AST-081` FR9) uses
    no root.
  - Whenever the copy that started the run answers, outside a project, in a
    project that installs no CLI of its own, as the release `spec:AST-081` FR2
    names, or as FR2's fallback, the root that holds that copy serves the run.
  - When `spec:AST-081` FR2 has a hosted run in a project answered by a named
    release other than the copy that started the run, the matched release or the
    release of a project CLI the host declined, a root qualifies only when its
    CLI is that release and it holds, for every package the project declares
    that a root may fill, the version the project would install: the valid
    lockfile version, else a published version that satisfies the declared
    range. A declared value that is not a version range, such as a path or a
    protocol, matches only through its lockfile version, and an unrequested
    prerelease does not satisfy a range. The first root in the host's order that
    qualifies serves.
  - A hosted run installs nothing: a release `spec:AST-081` FR2 names comes only
    from the copy that started the run, when it is that release, or from a root
    that qualifies; when neither does, that release cannot be obtained and FR2's
    fallback applies.
  - Outside a project, each integration the host approves resolves by name from
    the root that serves the run, in addition to what `spec:AST-081` FR12 finds
    there, and loads with FR12's validation, peer-range check, and provider
    identity rules. An approved name that root does not hold is left out.
  - Enumeration through a root reads only the packages INV14 or `spec:AST-081`
    FR12 name, and a root's own config is never read.
  - Every run a package set serves records, for each package it resolves, its
    name, version, and whether it comes from the project or the package set, and
    the host entry returns that record with the run's result (`spec:AST-081`
    FR1); results still name each artifact's package (INV28).
  - Project health APIs (`doctor` and its integration checks) judge only the
    project's own install: a package set never satisfies or fails a project
    check, and `spec:AST-081` FR12 decides what they list as available.

Some modules predate INV20–INV23 and do not meet them yet; `spec:AST-042` lists
the known gaps.

## Change coupling

A change to any of the following requires this record to be re-read, and
updated in the same pull request when it moves an invariant:

- adding, removing, or renaming a command or subcommand;
- adding an error code, or changing what an existing code means;
- a change to a stable JSON envelope or discriminated response-entry field
  follows `spec:AST-017/DEC-4`;
- adding a formatter or block kind (INV23, `spec:AST-042` FR3), or writing to
  stdout from anywhere other than `emit` and `jsonOut`;
- changing the file layout under `clients/cli/commands`;
- adding an API subject, leaf, adapter, or exported function, or giving an API
  module access to the environment (INV20–INV21);
- adding a command, API function, schema, or enum doc, or a namespace a CLI
  doc may declare (INV25);
- adding a docs-tree namespace or guide, or changing how a doc gets its home or
  its route (INV26);
- adding a read that offers no moves, or changing how a move is spelled in text
  or JSON (INV27);
- changing an integration writer's receipt, no-clobber/rollback behavior,
  package.json mutation policy, or public subpath spelling;
- changing what `integration verify` executes, resolves, or proves about
  the tarball;
- adding `--strict`, or any other way to fail on warnings, to a command
  (INV32);
- changing local, configured, or autolinked integration precedence;
- changing how a host's package set is matched to a project, which
  integrations it contributes, what a run it serves records, or which lookups
  consult it (INV30);
- changing an integration item descriptor, the theme directory boundary, or the consumer copy contract;
- changing which files hold the agent-docs block, how init finds the project
  root, where it refuses to write agent docs, or where it removes them (INV31);
- adding a kind of gap-report destination, or changing who chooses one
  (INV36).

`pnpm check:cli-structure` enforces the layout. The contract tests listed in
`verified_by` enforce the envelope, the exit codes, the error codes, and the
non-interactive guarantee.

## Owning code

- `clients/cli/bin/astryx.mjs` — Node floor gate and the error boundary that
  converts an uncaught throw into an envelope.
- `foundation/release` — the release choice, the per-user release cache, the
  hand-off, `meta.answeredBy`, and the update check and its notices
  (`spec:AST-081`).
- `clients/cli/index.mjs` — Commander wiring, JSON-mode gate, dispatch.
- `clients/cli/commands/<name>.mjs` — one command: parse, call the API, render.
- `clients/cli/commands/<name>.doc.mjs` — the `CommandDoc` that generates help
  and the published tables.
- `clients/cli/formatters/index.mjs` — `Block`, `emit`, `section`, `text`,
  `list`, `record`, `records`, `code`, and the shared ASCII vocabulary.
- `foundation/response/json.mjs` — `API_VERSION`, `jsonOut`, `jsonError`,
  `toErrorEnvelope`, `humanLog`, `humanWarn`, the JSON-mode flag.
- `foundation/response/error-codes.mjs` — the frozen, append-only code set.
- `foundation/config` — the `Project` discovery seam and integration precedence.
- `host/index.mjs` and `host/index.d.ts` — the supported programmatic host
  entry, `@astryxdesign/cli/host` (`spec:AST-081` FR1).
- `foundation/runtime` — the package-private package-set implementation: the
  active set and the lookups that consult it (`package-root.mjs`), matching a
  project to a root, the approved integrations, and provenance
  (`package-set.mjs`), and lockfile pins (`locked-versions.mjs`).
- `foundation/integrations/manifest-writer.mjs` — safe manifest-root patching,
  verification, and rollback.
- `foundation/integrations/contribution-inventory.mjs` — the shared local and
  packed contribution identity/file contract.
- `api/integration` — contribution writers, diagnostics, and packed-artifact
  verification.
- `foundation/discovery/theme-discovery.mjs` and `api/theme` — typed integration
  theme descriptor discovery, package-aware selection, source copy, and build.
- `foundation/agent-docs` — the shared expected-block renderer and managed-file
  writer used by init and upgrade, and the layout that decides which files hold
  the block (INV31).
- `api/index.mjs` — the public programmatic API, `@astryxdesign/cli/api`, which
  re-exports every subject's functions.
- `api/<subject>/…` — the scriptable functions the commands wrap, laid out as
  INV20 describes; each owns the `type` on its own envelope.
- `api/<subject>/_adapter.mjs` — the subject's only access to the environment
  (INV21).

## Deciding specs

- `spec:AST-017/DEC-4` — stable response fields and their complete projections
  are current compatibility authority.
- `spec:AST-042/DEC-1` — every command is a thin layer over one programmatic
  function.
- `spec:AST-042/DEC-2` — every command's text output uses one shared block
  vocabulary.
- `spec:AST-081` — which release answers a run, the hand-off, what every
  command does outside a project, and `meta.answeredBy`.

### DEC-1 — Doctor is the one command a broken configured integration fails

**Decider:** `cixzhang`, `2026-10-12`

A project owner who names an integration in `astryx.config` and then cannot
load it — not installed, no manifest, a manifest that throws or fails its
schema — gets a red `doctor` run that names the package and the reason,
instead of a green one while every command silently runs without that
integration's components, templates, and docs. Command runs keep degrading
(INV11): a broken integration must never take a build or a read down with it,
and `doctor` exists to say what is wrong. Rejected: `doctor` warns and exits 0
(the owner's CI stays green over a misconfigured project); every command fails
on a broken integration (a read or a build stops for a problem it can work
around); counting only the integrations that happened to load (a package set
aside or replaced by the package being authored would vanish from the count).

### DEC-2 — Every agent gets the agent docs, and an extra copy beats none

**Decider:** `josephfarina`, `2026-10-14`

Agent CLIs read different files. Codex CLI reads only `AGENTS.md`; Claude Code
reads its own files, and `AGENTS.md` only when the project has none; Gemini CLI
reads `GEMINI.md`; Copilot CLI reads `AGENTS.md`, `CLAUDE.md` and `GEMINI.md`
together. No placement gives every agent exactly one copy in every project, so
the agent docs give each agent at least one, from files the project commits,
and accept extra copies where agents share files (INV31). Rejected: keeping
the Claude Code copy only in `.claude/CLAUDE.md`, which many projects keep out
of version control, so that a fresh clone has none.

### DEC-3 — Refusing a write outside its confined root is a fix

**Decider:** `josephfarina`, `2026-10-15`

A write outside the confined root lands wherever its path points, with the
caller's file permissions, and can replace a file the caller never named as an
output: source, configuration, or another project's files. Agents run the CLI
unattended and pass generated paths, so one wrong path loses work with nothing
to undo. Holding the refusal for a minor, or warning while the write still
happens, keeps that exposure open to protect a use the confinement already
forbids, so the refusal ships as a `[fix]` (INV10a). The boundary is narrow:
the confinement is already current, the refusal comes before any write, the
Changeset names each refused input and its migration, and writes inside the
root keep working.

Rejected: a patch warning with the refusal held for a minor (the warning prints
after the file is replaced); and letting every current invariant outrank
released documentation (any correction could then claim the patch tier).

### DEC-4 — A command fails on warnings only when its caller asks, with `--strict`

**Decider:** `josephfarina`, `2026-10-16`

A warning that changes an exit code turns every build that runs the command
red as soon as a release adds a check or a finding, so no command fails on a
warning by default. A package that wants its build held to its warnings asks
for it with `--strict`, which reports the same findings as errors in the
format its failures already use: a strict run never knows something the
default run does not, and reading a strict failure needs nothing new.
Rejected: a command that fails on warnings by default (a CLI upgrade turns
green builds red); a gate flag or command with another name for each case
(each one a new contract to keep).

### DEC-5 — Integration doc checks are command contracts

**Decider:** `josephfarina`, `2026-10-18`

INV33, INV34 and INV35 state the prop and descriptor-type checks that
`doctor integration` runs and the `integration check` command that builds run.
They are command contracts beside INV32, so this record governs them, and
`spec:AST-039` FR12, FR13 and FR14 point here.
Rejected: governing them only from `spec:AST-039` (a draft record does not
govern).

### DEC-6 — Integration authoring guidance requires the strict check in every build

**Decider:** `josephfarina`, `2026-10-19`

Integration authoring guidance requires each integration package to run
`astryx integration check --strict` in its own build; the CLI flag stays
opt-in (DEC-4).
Rejected: guidance that leaves the check optional (packages ship drift their
users find first).

### DEC-7 — The integration check reports only what the code contradicts

**Decider:** `josephfarina`, `2026-10-19`

Every integration runs `integration check --strict` in its build (DEC-6), so a
false finding fails a package for a fault it does not have, and its only way
out, dropping `--strict`, also drops the check for every real fault. A check
that cannot tell whether the code contradicts a doc lists the item as not
checked, which `--strict` does not fail. The exceptions are the doc-quality
findings of DEC-8, the doc-syntax findings of DEC-12 and the example findings
of DEC-13.
Rejected: reporting a doubtful item as a warning (`--strict` fails it).

### DEC-8 — The strict check fails on copied passages, fluff and stray pointers in docs

**Decider:** `josephfarina`, `2026-10-20`

People and agents read integration docs on a budget. A fact written in two
topics goes stale in one of them at the next edit, and padding costs every
reader. So these doc-quality findings fail `--strict` by owner decision, as
an exception to DEC-7, beside DEC-12's doc-syntax findings and DEC-13's
example findings. A copied passage (a run of identical words, after
the filters for function-word runs and for boilerplate that three or more
topics share) and a listed padding phrase (outside code and quotes) are exact
matches. The density floor is a threshold, not a contradiction, and a section
with no content is fluff, its limiting case. Doc structure a reader silently
drops fails `--strict` as doc quality too: a prop documented twice, an overlay
key that names no prop, two sections with one key, and an overlay beside no
topic. The phrase
list and the floor are published in the check's docs, and every finding
names the phrase, or the measured density and the floor, so its fix is
mechanical. A stray pointer (a code span that is exactly
`astryx docs <name>`, or a `{@command docs <name>}` token in a code span or
not (DEC-12), for a doc that exists, in a topic's prose, description or
summary or a component doc's text) is exact as well: the `{@link}`
that replaces it prints the command that opens the doc, and doctor's link
check then fails it when the doc goes away. A command with more words, or one
in a code block, is a walkthrough, not a pointer. Each is a warning, so `integration check --strict` fails on it and
an agent that runs the build fixes it, while `doctor integration docs` keeps
exit 0. `integration check` first ships with these rules, so no build that
passed before can newly fail.
Rejected: listing them as information only, which an agent treats as optional.

### DEC-9 — The person chooses where a gap report goes

**Decider:** `josephfarina`, `2026-10-20`

Report handlers usually feed one shared place, while an integration names its
own tracker in `issuesUrl`. Which place should get a report is a judgment about
the gap, so the person decides: the CLI lists the places, the agent asks, and
`--to` carries the answer. Without a choice the report goes to the shared
default.
Rejected: copying every report to the integration's own `issuesUrl`
automatically (reports land in places nobody picked); letting the agent pick
the destination.

### DEC-10 — An upgrade migrates the whole project it runs in

**Decider:** `josephfarina`, `2026-10-21`

An upgrade that acts on one folder of a project reads none of the project's
configuration, refreshes none of its agent docs, and migrates only part of
its source, leaving the project half on each release with nothing to say so.
`spec:AST-040` FR9 makes the project the unit of an upgrade, and a folder that
installs Core without declaring it is a hoisted install or a stray
`node_modules`, not an app of its own, so following FR9 there is a `[fix]`
(INV10b). The boundary is narrow: a folder that declares an Astryx package
keeps its own upgrade.

Rejected: treating every folder with an installed Core as a project (a
workspace member then migrates against a Core its workspace does not use).

### DEC-11 — A new failing check ships under `--next` first

**Decider:** `josephfarina`, `2026-10-21`

A check that would newly fail `integration check --strict` reaches packages
as a `next` note first, so each package can run `integration check --strict
--next`, fix what it finds, and stay ahead of the minor release that turns the
notes into warnings. The default run names the count and the command, because
every package's build runs it.

Rejected: shipping a new failing check only in a minor release (packages
learn of it when their build breaks), and a separate draft per check (the
next minor's changes then live in many places).

### DEC-12 — Doc-syntax findings are listed now and fail in the next minor

**Decider:** `josephfarina`, `2026-10-21`

Docs write commands with the tokens of `spec:AST-081` FR5 so every reader
sees their own runner and package manager. `validate` lists each command a
topic writes for one package manager (`package_manager_command`), bare
(`plain_command`) or with a runner (`runner_command`), and each token that
does not parse or names no command (`doc_token`), as `next` notes with the
token to write: `integration check --strict --next` fails on them now, and
`--strict` from the next minor release (DEC-11). They are doc faults the
package's code does not contradict, the second exception to DEC-7 after
DEC-8.

Rejected: failing `--strict` on them in a patch (packages already running the
check would break on an update), and leaving them unchecked (docs drift back
to one package manager).

### DEC-13 — A package's examples are checked, listed now and failing in the next minor

**Decider:** `josephfarina`, `2026-10-21`

Template lists, docs pages and catalog cards show a package through its
examples, each block alone and from the packed package, so a package must ship
what they need, as Core does. `validate` lists, as `next` notes with the fix
to paste: a published component no block template shows with `exampleFor` and
`isShowcase: true` or names in `alsoShowcaseFor` (`component_without_example`; hidden docs, family members,
`isHiddenFromOverview` docs and `Utility` components are exempt), a template
category written as a path such as `components/X` (`template_category`; INV34
still lets a package author any category, and this note only names a
`"<Group> - <Variant>"` one), a showcase that imports server-only code or
reads `process.env` past `NODE_ENV` (`showcase_not_standalone`; live data
through the app is fine), and an asset loaded with `new URL(…,
import.meta.url)` that is missing or that `npm pack --dry-run` leaves out
(`template_asset_not_packed`; when npm cannot answer, one no `files` entry
can reach is still reported and any other is listed as not checked, INV35). Each fails `--strict --next` now and `--strict`
from the next minor release (DEC-11). The CLI finds a component's showcase by
`exampleFor` first, then by folder and `componentsUsed`.

Rejected: failing them in a patch (packages already running the check would
break on an update), and per-package special cases (a package that needs one
is a package the checks should cover).

## Verification

| Invariant | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Failure signal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INV1      | `clients/cli/commands/interactive-guard.test.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                          | The subprocess hangs: `signal === 'SIGTERM'` and `status === null`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| INV2      | `clients/cli/commands/json-contract.test.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                              | `--json` stdout does not parse, or parses to a shape outside the two.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| INV3      | `foundation/response/error-codes.test.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                 | A shipped code disappears, or an envelope carries an unregistered one.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| INV4      | `clients/cli/formatters/index.test.mjs`, type tests                                                                                                                                                                                                                                                                                                                                                                                                                        | `emit` accepts a bare string, or output varies between pipe and TTY.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| INV6      | `pnpm check:cli-structure`                                                                                                                                                                                                                                                                                                                                                                                                                                                 | A command's file or its doc is missing, or sits at the wrong path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| INV8      | `clients/cli/cli-exit-codes.test.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                      | The same condition exits differently with and without `--json`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| INV10b    | `api/upgrade/run/run.test.mjs` (a folder that installs Core without declaring it upgrades the project above it; a member its workspace lists and one that declares Astryx keep their own), `clients/cli/commands/upgrade.subfolder-path.test.mjs`                                                                                                                                                                                                                          | A folder that installs Core without declaring Astryx upgrades only itself, or a declaring folder or a listed member upgrades the project above it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| INV14     | `foundation/integrations/autolink.test.mjs`, `foundation/config/project.test.mjs`                                                                                                                                                                                                                                                                                                                                                                                          | An undeclared package contributes, or configured/local precedence changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| INV15     | `api/integration/add-contribution.test.mjs`, `clients/cli/commands/integration-authoring.test.mjs`                                                                                                                                                                                                                                                                                                                                                                         | Dry-run/write paths differ, a writer clobbers bytes, or the new contribution is not discoverable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| INV16     | `foundation/integrations/manifest-writer.test.mjs`, `api/integration/add-contribution.test.mjs`                                                                                                                                                                                                                                                                                                                                                                            | A writer invents package policy, replaces an author entry, or local bytes lose precedence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| INV17     | `api/integration/pack-check.test.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                      | Lifecycle output, packed files, identities, or public imports diverge without failing the gate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| INV18     | `api/integration/validate-integration.test.mjs`, `api/theme/integration-themes.test.mjs`                                                                                                                                                                                                                                                                                                                                                                                   | Diagnostics mutate files, or a selected broken theme package is reported as merely unknown.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| INV19     | `clients/cli/commands/integration-real-world.test.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                     | A CLI-authored theme, nested palette, or guides fail across pack, install, list, add, and build.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| INV20     | `pnpm check:cli-structure` checks that each subject has a `FunctionDoc`, typedefs, and a test; per-function coverage and leaf layout are checked in review                                                                                                                                                                                                                                                                                                                 | A subject or exported function lacks its `FunctionDoc`, typedefs, or tests, or an operation sits outside its subject.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| INV21     | Review of imports under `api/**`; no mechanical check yet                                                                                                                                                                                                                                                                                                                                                                                                                  | A module other than a subject's adapter reads or writes files, contacts the network, starts a subprocess, loads the project, or runs discovery.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| INV22     | Review of imports under `clients/cli/commands/**`; the docs drift harness checks each `CommandDoc` against the live command                                                                                                                                                                                                                                                                                                                                                | A handler reaches the environment itself, an executable command's `CommandDoc` names no `fn`, or a non-command file sits in the directory.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| INV23     | `clients/cli/formatters/index.test.mjs` for the kit; review of handlers; no mechanical check yet                                                                                                                                                                                                                                                                                                                                                                           | A handler pads, aligns, or draws text itself, or a block kind is missing from the help "Output format" list.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| INV24     | `api/integration/add-contribution.test.mjs`, `api/integration/add-theme.test.mjs`, `foundation/discovery/theme-discovery.test.mjs`                                                                                                                                                                                                                                                                                                                                         | New authoring emits an untyped or non-`.doc.mjs` item, adding one item edits a shared file, or an item catalog becomes authoritative.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| INV25     | `foundation/discovery/cli-self-docs.test.mjs`, `api/doctor/doctor.test.mjs`                                                                                                                                                                                                                                                                                                                                                                                                | A CLI doc with no namespace, a namespace no topic reads, or no section in its topic passes doctor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| INV28     | `test/inv28-package-provenance.test.mjs`, `clients/cli/commands/text-json-parity.test.mjs`, `cli-api-types-verify`                                                                                                                                                                                                                                                                                                                                                         | A result about one artifact has no envelope `package`, a listed artifact has no `package`, or text omits the package the envelope names.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| INV29     | `api/doctor/doctor.test.mjs` (configured-integrations: not installed, no manifest, manifest throws; self-named authored package, direct and through a symlinked `node_modules` or `cwd`; provider-conflict set-aside; an astryx.config that imports but cannot load the project → failed `config` check)                                                                                                                                                                   | A configured integration that cannot load leaves `doctor` at exit 0, or an installed-but-unnamed one fails it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| INV30     | `foundation/runtime/package-set.test.mjs`, `foundation/runtime/hosted-runtime.test.mjs`                                                                                                                                                                                                                                                                                                                                                                                    | A run resolves from two roots; a root contributes an integration inside a project, including an `@astryxdesign/*` package that ships an integration manifest; a run the starting copy answers resolves from a root other than the one that holds it, or is announced as a fallback when that copy is the release `spec:AST-081` FR2 names; a run another named release answers resolves from a root whose CLI is not that release, from one that lacks a version the project would install, or from a later root when an earlier one qualifies; a hosted run installs a release, or a named-release run with no qualifying root does not fall back as FR2 says; a lookup consults a root before the project's own install, or with no set active; an approved integration resolves from another root or skips its validation; a root's config is read; a run writes into a package root or outside the places `spec:AST-081` FR7 names; the host entry's result lacks a resolved package or its source; or a project check judges the package set. |
| INV31     | `foundation/agent-docs/agent-docs.test.mjs`, `foundation/agent-docs/agent-docs.path-safety.test.mjs`, `clients/cli/commands/init.behavior.test.mjs`, `api/init/remove/remove.test.mjs`, `clients/cli/commands/doctor.test.mjs`                                                                                                                                                                                                                                             | A layout test finds the block missing from a file INV31 names or present in a file it excludes, a managed import of a block-less `AGENTS.md` passes doctor, agent docs land in the home folder or in a settings folder outside a project, or `--remove-agents` leaves a block at the project root or in the working folder.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| INV32     | `test/cli-strict-guard.test.mjs` lists every command offering `--strict` and every command whose exit depends on warnings; `api/integration/check/check.test.mjs` compares a strict run with the default run                                                                                                                                                                                                                                                               | A second command offers `--strict`, a command exits 1 on a warning alone without `--strict`, or a strict run reports a finding the default run does not or outside the command's issue format.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| INV33     | `foundation/discovery/prop-drift.test.mjs`, `foundation/discovery/doc-consistency.test.mjs`, `foundation/discovery/type-text.test.mjs`, `clients/cli/commands/doctor-integration.test.mjs`, `test/core-prop-docs.test.mjs`                                                                                                                                                                                                                                                 | A removed or renamed prop or a changed union passes unreported, a missing compiler reads as a pass, or a table that leaves out `ref`, `key`, `xstyle`, `className`, `style`, `data-testid`, or an `@internal` prop draws a warning.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| INV34     | `foundation/discovery/doc-types.test.mjs`, `foundation/discovery/doc-consistency.test.mjs`, `clients/cli/commands/doctor-integration.test.mjs`, `test/core-doc-types.test.mjs`                                                                                                                                                                                                                                                                                             | An unknown, missing, or mistyped field passes unreported, or a missing compiler reads as a pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| INV35     | `api/integration/check/check.test.mjs`, `clients/cli/commands/integration-check.test.mjs`, `test/integration-check-failures.test.mjs`, `api/search/search.integration-check.test.mjs`, `foundation/discovery/prop-drift.test.mjs`, `foundation/discovery/type-match.test.mjs`, `foundation/discovery/doc-types.test.mjs`, `api/integration/authoring-checks.test.mjs`, `foundation/discovery/stray-pointers.test.mjs`, `foundation/integrations/cli-peer-version.test.mjs` | The default exit differs from a check's own, a warning or a skipped comparison passes `--strict`, text and JSON exit differently, a new failing finding is added without the list changing, a search for ci does not find the command first, a finding is reported on a doc the code does not contradict (for a type, one TypeScript accepts), or a copied passage or a fluff finding passes `--strict`, or a function-word run or shared boilerplate is reported as a copy, or a CLI outside a package's `@astryxdesign/cli` peer range is reported as a warning, fails `--strict`, reaches `integration verify`, or goes unlisted, or a `next` note fails `--strict` without `--next`, passes `--strict --next`, or goes unreported in the default run.                                                                                                                                                                                                                                                                                                                                                                                                               |
| INV36     | `api/gap-report/gap-report.test.mjs`, `clients/cli/commands/gap-report.test.mjs`                                                                                                                                                                                                                                                                                                                                                                                           | A run without `--to` reaches an `issuesUrl` the handlers did not choose, `--to` runs a handler or files on GitHub without `--confirm-public`, an unknown `--to` sends anything, or the destinations list or its line telling the agent to ask the person is missing while a destination exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| INV37     | `api/integration/validate-integration.test.mjs`, `api/integration/validate-integration-fixes.test.mjs`, `api/integration/pack-check.test.mjs`                                                                                                                                                                                                                                                                                                                              | A top-level source with no doc passes `--strict` (a dotted template id such as `landing.page` included), or a test, spec or story file or a subfolder helper is flagged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Open questions

- **OQ1 — Should the envelope's `meta` carry the resolved integration set?**
  (`human-api`) An agent cannot currently tell from the output whether a thin
  result means "nothing matches" or "an integration failed to load".
