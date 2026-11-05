---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-048
authority: current
archive_reason: null
superseded_by: null
approved_by: josephfarina
approved_at: 2026-10-09
phase: accepted
owners: [josephfarina]
affects_architecture: [architecture:cli-surface]
affects_families: []
affects_contributing: []
affects_consumer_docs: [cli]
---

# Build recommendation system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

A builder, a person or a coding agent, describes the UI they want in words and
asks `astryx build` where to begin. A page template already carries the frame,
the spacing, and the section rhythm the system decided on; a page composed from
components has to rediscover all of that. So build's answer always starts from
a template: it names one page template to scaffold, the command that scaffolds
exactly that template, the next best templates, and the blocks and components
that fill it.

A scaffolded template builds only when the project has what its source needs. So
the `template.copy` receipt from `astryx template`, and the start and each
alternative build recommends, also state that template's scaffold readiness: the
packages its source imports that the project does not declare, one command that
installs them, and whether the project lacks a StyleX compiler the source needs.
Scaffold readiness is separate from a template's ready mark (FR1, FR4): a ready
template can still need packages a project lacks.

This record owns what build recommends, how the recommendation reads in text
and JSON, and the scaffold readiness that the scaffold receipt and build's
recommended templates report. `spec:AST-017` owns compatibility and
response-field rules, `spec:AST-042` owns command admission, search owns its
own ranking and output, and template owners own what each template is.

## Non-goals

- How candidates are ranked. Word matching, weights, thresholds, and the
  ranking algorithm are implementation; this record states what the
  recommendation must be and how a reader can act on it.
- Which templates exist, how they look, or what they import.
- Writing files. Build recommends; `astryx template` scaffolds. This record
  owns only what the scaffold receipt says the project lacks.
- Installing packages or setting up a compiler. Readiness names what is
  missing and how to install it; neither command installs or configures
  anything.
- New commands, options, flags, or exit codes for build or template;
  readiness never sets an exit status (FR22).
- Equivalent internal implementations remain valid when they satisfy this
  contract.

## Requirements

- **FR1 — Always one start.** A build that can return pages MUST name exactly
  one page template to start from, chosen among the ready page templates the
  project can scaffold, including the ones its integrations provide. A build
  narrowed to components or hooks names no start, and neither does a project
  that offers no page template.
- **FR2 — A shell when nothing leads.** When no template has the evidence to
  lead, the start MUST be the neutral app shell, or a blank page template when
  the project has no shell. The start never falls back to "compose from
  components".
- **FR3 — A part starts where it lives.** A request for a part of a page (a
  control, a state, a widget, a section) MUST start from the page template the
  request places that part in, when the request gives that page, and from the
  app shell (FR2) when it gives no page. The blocks and components in the kit
  carry the part itself. A request that changes a page the builder already has
  starts from the app shell (FR2): the page is the builder's to keep (FR9), and
  no template scaffolds it.
- **FR4 — Never an unready start.** A template marked not ready MUST NOT be the
  start or an alternative. When search matches one directly, the start's
  reason MUST name it and say the start is the closest ready template or the
  app shell instead.
- **FR5 — The start is exact and runnable.** The start and every alternative
  MUST carry the scaffold command that selects exactly that template in the
  project where build ran. A template an integration provides in place of a
  Core one is selected the way `astryx template` addresses it, and the command
  names the page kind so a block with the same id cannot make it ambiguous.
- **FR6 — The start says why.** The start MUST carry a basis and a one-line
  reason. The basis is `direct` when the start is also search's direct match,
  `closest` when no template is exactly this page, and `fallback` for the
  shell.
- **FR7 — The builder can overrule.** Beside every start, build MUST offer the
  next best page templates, at most two, each with its scaffold command.
- **FR8 — The kit fills the template.** Build MUST list the blocks that fill
  the start before the components, and name the always-on frame and
  foundation components. The order of the listed blocks follows
  `spec:AST-083`.
- **FR9 — An existing page is kept.** Build's text output MUST tell a builder
  who is changing a page they already have to keep it and use only the blocks
  and components.
- **FR10 — The recommendation is data.** The JSON response MUST carry the
  recommendation itself (the start with its name, command, basis, reason, and
  alternatives), so no caller derives it from other fields.
- **FR11 — Additive JSON.** Changes to the recommendation MUST keep the build
  JSON additive under `spec:AST-017`: new data arrives as new fields, and
  every existing field keeps its shape and meaning. A ranking change may move
  values (which templates, blocks, or components appear, and in what order);
  it does not change a field's shape or meaning.
- **FR12 — Text leads with the start.** Build's text output MUST lead with the
  start, then the alternatives, then the blocks, then the components. Every
  response field keeps a text projection as `spec:AST-017` requires: short by
  default, and whole under `--verbose`.
- **FR13 — Every agent-facing surface agrees.** The build playbook, the
  generated agent docs, and the consumer guides that describe building a page
  MUST describe the same workflow: scaffold the named template, fill it with
  blocks, and compose only what is left. No surface tells builders to compose
  a page from primitives first.
- **FR14 — The written source names what it needs.** The packages a template
  needs MUST be the packages named by the imports in the source the command
  writes: its import declarations, type-only ones included, its export-from
  declarations, and its `import()` and `require()` calls. An import that sits
  inside a comment, a string, or a template literal is text and names nothing. A
  bare specifier names one package, by its scope and name (`@scope/name`) or by
  its first segment; a Node built-in module, a relative or absolute path, a `#`
  subpath import, and a URL name none.
- **FR15 — The project declares what its package.json files list.** The packages
  a project declares MUST be the union of the `dependencies`, `devDependencies`,
  `peerDependencies`, and `optionalDependencies` of every package.json from the
  target directory up to the workspace root. The target directory is the
  directory the command writes into, or for build the directory where it ran
  (FR21). The workspace root is the nearest directory at or above the target
  directory that declares a workspace, by a `pnpm-workspace.yaml` or a
  package.json `workspaces` field; outside a workspace it is the directory of
  the nearest package.json, and with no package.json the project declares
  nothing. `missingPackages` MUST list each needed package (FR14) that the
  project does not declare, once, and is empty when none is missing.
- **FR16 — Astryx packages count like any other.** An Astryx package MUST count
  under FR14 and FR15 like any other package: a source that imports one the
  project does not declare lists it in `missingPackages`, and in the install
  command when there is one (FR17). No package is exempt by name.
- **FR17 — One install command, in the project's package manager.** When
  `missingPackages` is not empty and the package manager is not ambiguous
  (FR19), `installCommand` MUST be one command that installs every missing
  package with the project's package manager; otherwise it is null. The nearest
  directory, from the target directory up to the workspace root, that has a
  package.json `packageManager` field or a lockfile decides the package manager.
  The field names it. Without the field, the lockfiles name the package manager
  they belong to; when they belong to several, the directory names the one of
  those that its files read by only one package manager (such as
  `pnpm-workspace.yaml` or `.yarnrc.yml`) point to, when they point to exactly
  one of them. When no directory there has a field or a lockfile, the project's
  package manager is npm, which ships with Node.
- **FR18 — The command runs as printed.** Each package in the install command
  MUST carry the version range declared for it by the package that ships the
  template's source file, which is not always the package the receipt names as
  the template's owner: its `peerDependencies` range, else its `dependencies`,
  `optionalDependencies`, or `devDependencies` range, in that order. The
  shipping package itself, when the source imports it, carries the version the
  template was read from. Any other package it declares no version range for, by
  declaring nothing or only a protocol value such as `workspace:` or `catalog:`,
  is named without a range. Run as printed, from the directory where the command
  ran, in any common shell (Platform support), the command MUST hand every
  argument to the package manager unchanged and MUST add every missing package
  to the package.json nearest the target directory, so FR15 then finds it
  declared.
- **FR19 — No command when the package manager is ambiguous.** When the
  directory that decides the package manager (FR17) has no `packageManager`
  field and holds lockfiles of several package managers, and its files read by
  only one package manager point to none of those or to more than one, the
  package manager is ambiguous. `installCommand` MUST then be null,
  `missingPackages` still lists every missing package, and `notes` MUST name
  them and say why there is no command: the directory and the lockfiles that
  disagree.
- **FR20 — A missing StyleX compiler gets a note.** When the source imports
  StyleX (`@stylexjs/stylex`) by an import that is not type-only, and no package
  the project declares (FR15) is a StyleX compiler, a package that compiles
  StyleX at build time, `notes` MUST say that the project needs a StyleX
  compiler and name the docs that set one up. The compiler stays out of
  `missingPackages` and the install command, because setting it up takes
  configuration as well as a package.
- **FR21 — Every recommended template carries the same readiness.** The
  `template.copy` receipt MUST carry `notes`, `missingPackages`, and
  `installCommand`, and build's start and each alternative MUST carry the same
  fields, with the values the receipt carries when that template is scaffolded
  into the directory where build ran, from the source its scaffold command (FR5)
  writes. `notes` holds one line for each thing the project lacks: the missing
  packages with their install command or the reason there is none (FR19), and a
  missing StyleX compiler (FR20); the receipt's `notes` is empty when the
  project lacks nothing. One exception keeps build's response additive (FR22):
  on build's start and alternatives, `notes` is present only when it holds a
  line. Text shows each template's readiness beside it, as FR12 and
  `spec:AST-017/FR13` require.
- **FR22 — Readiness reports and never fails.** Readiness MUST NOT change either
  command's exit status: with packages or a compiler missing, `astryx template`
  writes its file and `astryx build` returns its recommendation, each with the
  exit status it has without them. JSON changes MUST stay additive under
  `spec:AST-017`: every existing field keeps its name and type, and new data
  arrives as new fields. FR14–FR21 decide the values that `notes`,
  `missingPackages`, and `installCommand` carry (which packages, which ranges,
  and whether there is a command), as ranking decides values under FR11;
  `spec:AST-017` classifies a change in those values.

### Platform support

- Supported floor: every shell and package manager the CLI already supports.
  Commands are printed in text with the command name `spec:AST-081` FR5
  picks, and without it in JSON, as the CLI does for every command it prints;
  the install command
  (FR17) is the package manager's own and reads the same in both. The common
  shells an install command runs in as printed (FR18) are sh-compatible shells
  such as bash and zsh, fish, PowerShell (Windows PowerShell 5.1 and PowerShell
  7), and the Windows command prompt.
- Unsupported behavior: none; build writes nothing, and readiness only reports
  (FR22), so there is nothing to degrade. An ambiguous package manager gets a
  note instead of a command (FR19).
- Browser evidence: not applicable; the recommendation and the receipt are CLI
  output.

## Current-state impact

This record changes these surfaces:

- the `build.kit` response carries the start, with its command, basis, reason,
  and alternatives; every existing field keeps its shape and meaning;
- build's text leads with the start and the alternatives, then the blocks and
  the components;
- the build playbook, the generated agent docs, and the consumer guides that
  describe building a page start from a template;
- the `template.copy` receipt reports scaffold readiness as FR14–FR20 state,
  and build's start and each alternative carry the same fields (FR21);
- the canonical response types and the response docs for `template.copy` and
  `build.kit` describe `notes`, `missingPackages`, and `installCommand` as
  FR14–FR22 state.

`architecture:cli-surface` keeps the command envelope and its rules unchanged.

## Verification

| Contract   | Verification                                    | Representative states                                                                                                                                                                                                        | Mutation or failure expectation                                                                                                                                        |
| ---------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1, FR2   | Build kit tests                                 | a request that names a template; a loose request; a request no template fits                                                                                                                                                 | A page build with no start, or a start that is not a page template                                                                                                     |
| FR3        | Build kit tests                                 | a part placed in a page; a part with no page; a change to an existing page                                                                                                                                                   | A part with no page starting from a page template, or a change to an existing page starting from that page's template                                                  |
| FR4        | Build kit tests                                 | search's direct match is not ready                                                                                                                                                                                           | An unready template as the start or an alternative, or a reason that hides it                                                                                          |
| FR5        | Template integration tests                      | an integration template that replaces a Core one; a block sharing a page template's id                                                                                                                                       | A start or alternative command that selects another template, or none                                                                                                  |
| FR6, FR7   | Build kit tests                                 | direct, closest, and fallback starts                                                                                                                                                                                         | A start without a basis or reason, or without its alternatives                                                                                                         |
| FR8, FR12  | Text field tests                                | default and `--verbose` text for a build with every field populated                                                                                                                                                          | A response field the text never shows, or text out of the required order                                                                                               |
| FR9        | CLI text tests                                  | any page build                                                                                                                                                                                                               | Text without the keep-your-page line                                                                                                                                   |
| FR10, FR11 | Response type and build tests                   | the canonical response type, the response docs, and existing fields on a page build                                                                                                                                          | A missing recommendation field, or an existing field whose shape changes                                                                                               |
| FR13       | Playbook and agent docs tests                   | the playbook steps and the generated agent docs block                                                                                                                                                                        | A surface that tells builders to compose a page from primitives before a template                                                                                      |
| FR14       | Readiness fixture tests                         | every import form, a type-only import, and a scoped subpath; an import inside a comment, a string, and a template literal; a Node built-in, a relative path, and a URL                                                       | An import inside a comment or a string that counts, or a real import that does not                                                                                     |
| FR15       | Readiness fixture tests                         | a package declared only at the workspace root; one in each dependency field; a target in a nested package; a package.json above the workspace root; no package.json                                                          | A declared package reported missing, or a package.json above the workspace root that counts                                                                            |
| FR16       | Readiness fixture tests                         | a source that imports an Astryx package and a framework package the project does not declare                                                                                                                                 | An undeclared package left out of `missingPackages` because of its name                                                                                                |
| FR17       | Readiness fixture tests                         | a lockfile only at the workspace root; a `packageManager` field beside another lockfile; two lockfiles and a workspace file; no lockfile                                                                                     | A command in a package manager the deciding directory does not name                                                                                                    |
| FR18       | Readiness fixture tests and shell quoting tests | ranges with spaces, a caret, comparison operators, a wildcard, and a union; a protocol value; a template an integration ships that imports its own package; a command run outside the target's package                       | A range the shipping package does not declare, an argument a common shell splits, expands, or redirects, or a package not added to the package.json nearest the target |
| FR19       | Readiness fixture tests                         | two lockfiles in one directory: with and without a `packageManager` field, with one file only one package manager reads, with two such files for different package managers, and with only a package.json `workspaces` field | A command printed for an ambiguous package manager, or a note that names no lockfile                                                                                   |
| FR20       | Readiness fixture tests                         | a source that imports StyleX at run time and one that imports only its types, with and without a declared compiler                                                                                                           | A missing compiler with no note, a note beside a declared compiler or for a type-only import, or a compiler in the install command                                     |
| FR21       | Build kit and template copy tests               | the start and each alternative against the receipt for the same template and directory; default and `--verbose` text                                                                                                         | A recommended template without the fields, a value the receipt would not carry, an empty `notes` on a build entry, or a field the text never shows                     |
| FR22       | CLI exit-code and response type tests           | a scaffold and a build with packages and a compiler missing                                                                                                                                                                  | A changed exit status, or an existing field whose name or type changes                                                                                                 |

## Decision log

### DEC-1 — Start from a template, always

**Reference:** `spec:AST-048/DEC-1`
**Decider:** `josephfarina`, `2026-09-28`

Templates carry the spacing judgment and a kit of loose parts does not, so the
recommendation is always a full page template, and blocks and components fill
it.

Rejected: naming a template only on an exact match and a layout reference
otherwise, which leaves most builders composing from primitives.

### DEC-2 — A shell when nothing leads

**Reference:** `spec:AST-048/DEC-2`
**Decider:** `josephfarina`, `2026-09-28`

When no template has the evidence to lead, the start is a neutral app shell,
so even an unusual request starts from a frame the system decided.

Rejected: no start at all, which hands the builder primitives; and the best
weak match, which lets one incidental word pick the page.

### DEC-3 — The builder can overrule the pick

**Reference:** `spec:AST-048/DEC-3`
**Decider:** `josephfarina`, `2026-09-28`

The builder judges meaning better than word matching does, so every start
comes with the next best templates and their commands.

Rejected: a single pick with no alternatives.

### DEC-4 — A part starts where it lives

**Reference:** `spec:AST-048/DEC-4`
**Decider:** `josephfarina`, `2026-10-01`

A part is built inside a page. When the request gives that page, its template
is where the part goes; when it gives none, the app shell is the frame, and the
blocks and components carry the part. A change to an existing page is the same
case: the page is the builder's own, so no template is its start.

Rejected: starting a part from whichever page template shares a word with it,
which scaffolds an unrelated page for a single control; and giving a part no
start, which breaks DEC-1.

### DEC-5 — The response stays additive

**Reference:** `spec:AST-048/DEC-5`
**Decider:** `josephfarina`, `2026-09-29`

Callers read build's JSON, so the recommendation arrives as new data beside
the existing fields, and ranking changes move values rather than shapes. Text
may change with the recommendation.

Rejected: replacing existing fields with the recommendation, which breaks JSON
callers for a policy change they did not ask for.

### DEC-6 — The source and the workspace say what is missing

**Reference:** `spec:AST-048/DEC-6`
**Decider:** `josephfarina`, `2026-10-09`

The source a command writes is the only authority on what it imports, and the
package.json files from the target directory up to the workspace root are the
authority on what the project declares; a workspace keeps shared packages at
its root, so they count for every package below it. What is missing is the
difference, and no package is exempt by name, because an exemption hides a
missing package exactly when the project lacks it. A source that uses StyleX
also needs a compiler, which takes configuration as well as a package, so the
compiler gets a note and stays out of the install command.

Rejected: a list of packages assumed installed, Astryx or framework packages
among them, which hides what a fresh project lacks; and matching text that
looks like an import, which counts imports inside comments and strings.

### DEC-7 — One runnable command, or none

**Reference:** `spec:AST-048/DEC-7`
**Decider:** `josephfarina`, `2026-10-09`

A builder or an agent copies the install command and runs it, so it is one
command in the project's own package manager that reaches that package manager
unchanged from every common shell and leaves nothing missing. Its versions are
the ranges the package that ships the template declares, with that package
itself at the version the template came from, and a peer range comes first
because it states what that package supports beside the project's code.
Installing with the wrong package manager writes a second lockfile and a second
dependency tree, so when the project's package manager is ambiguous the receipt
names what to install and why there is no command, and the builder picks the
tool.

Rejected: falling back to npm when lockfiles disagree, which deepens the
conflict the receipt reports.

### DEC-8 — Every recommended template says what it needs

**Reference:** `spec:AST-048/DEC-8`
**Decider:** `josephfarina`, `2026-10-09`

The builder chooses among the start and its alternatives (DEC-3), and what a
template needs is part of that choice, so each one carries the receipt's fields
with the values its scaffold would report.

Rejected: readiness on the start only, which hides what an alternative needs
until it is scaffolded.

### DEC-9 — Readiness reports and never fails

**Reference:** `spec:AST-048/DEC-9`
**Decider:** `josephfarina`, `2026-10-09`

A missing package is the next step after a scaffold, not a failure of it, so
neither command's exit status depends on readiness, and callers keep reading
the existing fields as they are (DEC-5).

Rejected: failing the scaffold when a package is missing, which blocks a
builder who installs afterwards.

## Open questions

- **OQ1 — How recommendation quality is measured.** Whether changes to what
  build recommends must report their effect on a checked-in set of
  representative requests with accepted templates, separately for requests
  that describe a whole page and requests that describe a part of one.
  (`human-design`)
