---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-040
authority: current
archive_reason: null
superseded_by: null
approved_by: josephfarina
approved_at: 2026-10-20
phase: accepted
owners: [josephfarina]
affects_architecture: [architecture:cli-surface]
affects_families: []
affects_contributing: [contributing:cli-conventions]
affects_consumer_docs: [authoring]
---

# Evidence-based consumer file modification system spec

## Intent

People run Astryx commands such as `astryx upgrade --apply` on projects they
own. Those commands edit existing files in place. A consumer must be able to
trust that each edit targets content Astryx can prove it may change, that
generated, vendored, and dependency content is regenerated rather than edited,
and that anything Astryx could not change is reported instead of hidden.

This record owns what an operation may modify in an existing consumer file, what
counts as evidence, and how skipped or blocked changes are reported. It applies
to every operation that modifies or replaces an existing file in a consumer
project, including core, integration, and configuration codemods. For
`astryx upgrade`, it also owns which project the operation works on, which
installed Core it migrates to, how its result names files, and how it reports a
CLI too old to finish the migration.

## Non-goals

- Creating new files, such as template copies or scaffolding. Their write
  confinement stays with `architecture:cli-surface`, and template copy behavior
  stays with `spec:AST-028`.
- Defining individual migrations or their mappings. The
  [Release compatibility and versioning spec](../AST-017/spec.md) owns when a
  deprecation, planned cleanup, or incompatible fix requires migration evidence;
  this record owns how a consumer-file transform edits safely.
- Choosing a command for inspecting effective settings; `spec:AST-017` FR20
  requires one.
- Where other commands look for the project, including where `init` writes
  agent docs. FR9–FR13 govern `astryx upgrade` only.
- Equivalent internal implementations remain valid when they satisfy this contract.

## Requirements

- **FR1 — Every edit needs affirmative evidence.** An operation MUST modify
  existing consumer content only when the file is not protected (FR2–FR4) and the
  edited construct is proven in scope. For a source transform, proof is a
  resolved binding to the migrated export: a named, aliased, default, or
  namespace import, or a re-export, that is not shadowed at the edit site. A
  type-only import proves only type positions and never authorizes an edit to a
  runtime value. A matching name, string, or shape alone is not proof, and a
  file-level import does not authorize edits elsewhere in the file. When proof is
  missing, the content MUST stay unchanged and the candidate MUST be reported
  under FR7.
- **FR2 — Generated, vendored, and dependency content is protected.** An
  operation MUST NOT modify a file that is inside an installed dependency or
  version-control metadata, is outside the operation root, is reached through a
  symbolic link, is marked generated or vendored by a recognized convention
  (FR3), or is excluded by the project's ignore rules. A file or directory name
  alone neither protects nor unprotects a file.
- **FR3 — Recognized conventions are read from the checkout.** The CLI MUST
  recognize these declarations from files present in the working tree, without
  running a version-control program:
  - `linguist-generated` and `linguist-vendored` in `.gitattributes` files,
    including nested files;
  - a generated marker in the file's leading comment block: `@generated`,
    `@partially-generated`, or a line matching the standard
    `Code generated … DO NOT EDIT.` form. A marker after authored code does not
    protect the file, and `@partially-generated` protects the whole file;
  - exclusions in `.gitignore` files and in `.hgignore`.

  Each convention uses its own standard semantics, including later-rule
  precedence, explicit unset or false attribute values, and ignore-rule negation.
  The effective result for the file decides protection; Astryx configuration and
  integration contributions can only add protection to it (FR4). The result MUST
  be the same in Git, Sapling, and Mercurial checkouts and in a directory with no
  version control. The recognized set is public and discoverable under
  `spec:AST-017` FR14. It grows by amendment when a convention is established
  across ecosystems.

- **FR4 — Protection is additive and fails closed.** Project configuration and
  integration contributions MAY add protection under `spec:AST-017` FR19 and
  FR20. A protection setting requires a reproduced case that FR3 conventions
  miss. No configuration or contribution can remove protection established by
  FR2, FR3, or another source. When a protection source cannot be read or
  parsed, the operation MUST fail before writing, with a stable error that names
  the source.
- **FR5 — Generated output is regenerated, not edited.** When a required change
  would alter a protected generated file, the operation MUST leave that file
  unchanged, complete the in-scope edits to owned sources, and then run the
  regeneration the project declares. The CLI MUST regenerate output of its own
  generators itself, or report the exact command that does. After regeneration,
  it MUST evaluate the protected files again.
- **FR6 — A blocked required change is an incomplete result.** If a protected
  file still requires a change after FR5, the operation MUST exit nonzero with a
  stable error code and list every such file with the declaration that protects
  it. Completed edits to owned files remain. A protected file that needs no
  change never blocks. Running the same operation again after the project
  regenerates MUST NOT apply a completed edit twice. A dry run MUST report the
  same classification without writing.
- **FR7 — Every skipped candidate is reported.** The machine-readable result
  MUST list modified files, protected files that required a change (FR6), and
  candidates declined for lack of proof (FR1) with their location and reason.
  Human-readable output MUST show the same facts. Declined candidates are
  reported as needing manual review; they do not by themselves fail the
  operation. A result MUST NOT look complete while a required change is blocked.
- **FR8 — Every modification path follows this contract.** Core, integration,
  and configuration codemods, and any other operation that modifies existing
  consumer files, MUST apply FR1–FR7 identically. A new modification path cannot
  opt out, consistent with `spec:AST-017` FR16. The managed agent-docs block is
  governed by `architecture:cli-surface` INV31.
- **FR9 — An upgrade works on its project.** `astryx upgrade` MUST operate on
  the project of the folder it runs in: the nearest folder at or above that
  folder whose `package.json` declares an Astryx package, or that its workspace
  lists as a member when the workspace root's `package.json` declares one. A
  `package.json` declares an Astryx package when any of its dependency fields,
  peer dependencies included, names an `@astryxdesign/*` package or a legacy
  `@xds/*` one. A folder's workspace root is the one `spec:AST-048` FR15 finds
  from it, and the workspace lists the folder when a pattern in the root
  `package.json` `workspaces` field or in `pnpm-workspace.yaml` `packages`
  matches the folder and no exclusion pattern removes it. A folder that installs
  Core but qualifies neither way is not a project: an upgrade run there works on
  the project above it, if any. The search MUST NOT continue past a folder that
  holds version-control metadata, and MUST end at the home folder without
  counting it as a project or as a workspace root. The project root is the
  operation root (FR2): the upgrade reads the project's configuration, agent
  docs, and protection sources (FR3, FR4) there. When no folder qualifies, the
  folder the command runs in is the operation root.
- **FR10 — A named source folder is read where the command runs.** By default,
  an upgrade MUST scan the `src` folder of the operation root. A source folder
  the caller names MUST be resolved from the folder the command runs in, and
  MUST be inside the operation root; one outside it fails with
  `ERR_PATH_TRAVERSAL` before any write.
- **FR11 — A workspace member migrates to the Core its workspace installs.**
  The version an upgrade migrates to MUST be that of the Core
  (`@astryxdesign/core`, or the legacy `@xds/core`) the project installs: in the
  `node_modules` of the project root; for a member its workspace lists, in the
  nearest `node_modules` from the project root up to the workspace root; and for
  a project installed without `node_modules`, the copy its package manager
  resolves for it. A Core above a project that no workspace lists MUST NOT
  count. When no folder qualifies under FR9, the target is the Core in the
  `node_modules` of the folder the command runs in. With no installed Core, the
  upgrade fails with `ERR_VERSION_DETECT` before any write.
- **FR12 — The result names files from where the command runs.** The
  machine-readable result of an upgrade MUST name its modified, protected, and
  declined files (FR7), the files its errors name, its agent-doc files, and the
  files of its copied-composition summary by paths relative to the folder the
  command runs in, so each resolves from there. When the command runs at the
  operation root, the copied-composition summary instead names its files
  relative to the source folder the upgrade scanned. When the operation root is
  another folder, the human-readable output MUST name it.
- **FR13 — A CLI older than the installed Core reports an incomplete upgrade.**
  When the installed `@astryxdesign/core` is newer than both the running CLI and
  the version the upgrade starts from, the upgrade MUST run the codemods the
  running CLI has for the range, and its human-readable output MUST report the
  upgrade as incomplete and MUST NOT say the code is up to date. The
  machine-readable result MUST carry the optional `cliBehindCore` field, present
  only in this case, with the running CLI's version and one command that
  finishes the upgrade with the CLI release matching the installed Core. That
  command MUST work from any folder it is run in, upgrading the same project; it
  MUST repeat the run's options, MUST name the source folder the run scanned,
  and MUST quote each argument for the shell it targets. The human-readable
  output MUST print the command on a line of its own, and MUST name that shell
  unless it is a POSIX shell. This case does not change the exit status, or what
  `complete` and `errorCode` report under FR6.

### Platform support

- Supported feature/engine floor: every supported CLI runtime on Linux, macOS,
  and Windows; Git, Sapling, and Mercurial checkouts; directories with no
  version control; and the workspaces and install layouts of npm, pnpm, Yarn
  (Plug'n'Play included), and Bun.
- Unsupported behavior: a version-control declaration that exists only in
  repository metadata outside the working tree is not read; the project adds
  protection under FR4 when a reproduced case needs it.
- Browser evidence: not applicable.

## Current-state impact

Current codemod scanners skip a fixed list of directory names and never follow
symbolic links. They read no generated markers, attributes, or ignore files, so a
codemod can edit a generated file. Some transforms treat a file-level import as
permission to edit matching literals anywhere in that file. Both behaviors are
non-conforming with FR1–FR3; this record does not choose their implementation.

Post-codemod hooks already exist and serve as the declared regeneration for FR5.
The `authoring` guides and the codemod authoring guidance must
explain protection, how to mark generated files, and how transforms prove scope.

This specification-only change alters no runtime behavior or published package
and needs no Changeset.

## Verification

| Contract | Verification                                               | Representative states                                                                                                                                                                                                                | Mutation or failure expectation                                                                                                  |
| -------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Transform fixtures                                         | named, aliased, default, namespace, re-exported, type-only in a type position and a value position, shadowed, wrong-package, unrelated literal                                                                                       | A same-named local or unrelated literal changes, or a proven usage is not edited                                                 |
| FR2–FR4  | Protection fixtures in each checkout kind                  | nested attributes, unset or false attribute, negated ignore, marker after code, partial marker, ignored path, symlink, config and integration additions, attempted removal, bad source                                               | A protected file changes, a result differs by version control, or a bad source allows writes                                     |
| FR5–FR6  | Upgrade runs with a generated file and a regeneration hook | hook succeeds, hook fails, dry run, second run                                                                                                                                                                                       | Protected bytes change, exit is zero with a blocked change, or a second run edits twice                                          |
| FR7      | Result snapshots in JSON and text                          | modified, blocked, declined                                                                                                                                                                                                          | A blocked or declined candidate is missing from either output                                                                    |
| FR8      | Inventory of every operation that modifies existing files  | core, integration, config codemods, new path                                                                                                                                                                                         | A path bypasses FR1–FR7                                                                                                          |
| FR9      | Upgrade runs from folders inside and around projects       | a subfolder; a listed and an unlisted workspace member; a folder whose `package.json` declares no Astryx package; a folder with no `package.json` inside a home folder that installs Astryx; a nested checkout; no qualifying folder | The upgrade operates on another project, the home folder, or a folder past version-control metadata                              |
| FR10     | Upgrade runs with a named source folder                    | the default from a subfolder; one folder named from a subfolder in each spelling; a folder outside the operation root                                                                                                                | A named folder read from another folder than the one the command runs in, or a folder outside the operation root that is scanned |
| FR11     | Upgrade target detection                                   | a member whose workspace forces Core, or that declares another range or only a peer range; an unlisted project below an installed Core; a Core in a parent folder; an install without `node_modules`; no qualifying folder           | A member that misses the Core its workspace installs, or a Core above an unlisted project that counts                            |
| FR12     | Result snapshots from a subfolder and from the root        | modified, protected, declined, error, agent-doc, and copied-composition paths                                                                                                                                                        | A path that does not resolve from the folder the command runs in, or a root run whose copied-composition paths change            |
| FR13     | Upgrade runs with a CLI older than the installed Core      | no codemods left; part of the range covered; each option; the printed command run inside the project, above it, and in an unrelated folder; a folder name with shell metacharacters in each targeted shell                           | An up-to-date or complete report, a dropped option, a command that misses the project elsewhere, or an unnamed non-POSIX shell   |

## Decision log

### DEC-1 — Edit only with affirmative evidence

**Reference:** `spec:AST-040/DEC-1`
**Decider:** `josephfarina`, `2026-09-23`

An upgrade rewrites a person's source without review of each edit, so every
edit needs proof. A resolved binding shows that the construct is the export being
migrated. Uncertain candidates are left alone and reported.

Rejected: matching by name, string, or shape, and treating a file-level import as
permission for the whole file. Both rewrite unrelated code silently.

### DEC-2 — Use established, VCS-neutral conventions

**Reference:** `spec:AST-040/DEC-2`
**Decider:** `josephfarina`, `2026-09-23`

Projects already mark generated and vendored content through attributes, file
headers, and ignore files. Reading those from the working tree gives the same
answer in any checkout and needs no new annotation.

Rejected: an Astryx-only marker, a skip flag as the main mechanism, running a
version-control program, filename conventions, and configuration without a
reproduced gap.

### DEC-3 — Regenerate, then report what remains

**Reference:** `spec:AST-040/DEC-3`
**Decider:** `josephfarina`, `2026-09-23`

Generated files follow their sources, so the operation edits sources, runs the
declared regeneration, and checks again. Anything still blocked makes the result
incomplete and names each file.

Rejected: editing generated output, silently skipping it, and stopping before
any edit, because regeneration needs the source edits.

## Open questions

None.
