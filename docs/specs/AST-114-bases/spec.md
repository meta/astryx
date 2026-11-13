---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-114
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
affects_consumer_docs: [cli, authoring]
---

# Bases, base adapters, and command requirements system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

An agent runs the Astryx CLI in a project built on a component library: Core,
or another library that ships as an Astryx integration and stands in for Core,
such as a React Native library. Every command works the same way on every
base: the CLI owns its name, options, JSON shape, receipts, errors, and writes.
Only the few steps that depend on the platform, such as compiling a theme or
rendering a page, come from the base, as an adapter the base declares. The CLI
uses the active base's adapter with no flag. A command whose step the base
does not serve is hidden from help but still recognized, and running it fails
at once with one line that names what is missing, never with "unknown command"
and never with an answer read from a library the project does not use.

This record owns what a base is and how a run picks one (FR1, FR2), how a base
declares the adapters it serves (FR3, FR4), what a command declares it needs
(FR5), the one check (FR6), help and manifest visibility (FR7), the refusal
(FR8), and how an integration declares the base it builds on (FR9).

## Non-goals

- Which release answers a folder, and the carried Core outside a project:
  `spec:AST-081` FR2 and FR3. This record changes only which base those rules
  read (FR2).
- What a command does outside a project: `spec:AST-081` FR4. The two
  declarations are independent; FR6 fixes the order of their checks.
- What each adapter step computes for a given platform: the base that ships
  the adapter owns that.
- React Native platform commands: `spec:AST-112` FR13. This record adds no
  command extension point; `spec:AST-112` OQ5 decides the `commands`
  contribution.
- Equivalent internal implementations remain valid when they satisfy this
  contract.

## Requirements

In this record, a **base** is the package that provides the component library
a run reads. `@astryxdesign/core` is a base. Any other package is a base when
its integration manifest declares `base` (FR3). The **active base** is the one
base a run reads (FR2). An **adapter** is a module a base ships that performs
the platform steps of one capability. A **step** is one function an adapter
exports, named `<capability>.<step>`, from the closed list in FR4.

- **FR1 — Every run reads exactly one base.** A run MUST resolve one active
  base before any command body runs, and every command, discovery read,
  adapter call, check, hint, and agent text in that run MUST read that base
  and no other. In a run whose active base is not Core, the CLI MUST NOT read
  Core's components, hooks, templates, topic docs, themes, codemods, or icons.
  Content the CLI ships for Core belongs to Core and appears only when Core
  is the active base. Content that describes the CLI itself appears with any
  base. Content reads never need an adapter: a base's components, hooks,
  templates, codemods, and docs come from the roots in its manifest
  (`spec:AST-039`), and a base that ships none of a kind gives an empty
  answer, not a refusal.

  FR1 gap: in a run whose active base is not Core, `build` still names
  Core's layout components in its frame, the `hook --list` and
  `swizzle --list` envelopes name `@astryxdesign/core` as their package, and
  `doctor` reports Core and Core's themes as missing, and
  `upgrade --from` reads Core's installed version as its target, so it
  fails with `ERR_VERSION_DETECT` when the project installs no Core. The integration
  manifest has no hooks root, so a base cannot ship hook descriptors.

  FR1 gap: a copied template treats React, React DOM, StyleX, and the
  `@astryxdesign/` packages as installed and gets a DOM icon placeholder, and
  icon meanings are counted from Core's templates, whatever the active base.

- **FR2 — The active base comes from the caller, then the project, then
  Core.** The CLI MUST resolve the active base in this order:
  1. `--base <package>`, a global option. The package MUST be Core, or an
     integration the run loads that declares `base`: one the project
     installs, the package set serving the run holds, or the computer
     installs. Otherwise the run fails with `ERR_BASE_NOT_FOUND` before any
     work, naming the package and which condition failed.
  2. In an integration package, the base the package is or builds on (FR9).
  3. In a project, Core when the project installs it.
  4. In a project that installs no Core, the one installed integration that
     declares `base`. Two or more such integrations and no Core fail with
     `ERR_BASE_AMBIGUOUS` before any work, naming each and the `--base` that
     picks it.
  5. Otherwise Core, as `spec:AST-081` FR3 provides it, carried Core included.
     The CLI MUST NOT fetch or read the carried Core in a run whose active
     base is not Core.

  In a run whose active base is not Core, every success envelope's
  `meta.answeredBy` MUST carry `base: {name, version}` and `core: null`.
  `astryx --version --json` answers before any project loads, so it reads no
  base and names none. A
  run on Core keeps the `answeredBy` shape `spec:AST-081` FR5 defines, where
  `core` names the base.

  FR2 gap: `spec:AST-081` counts a folder as a project only when its
  package.json declares an `@astryxdesign/` package, so a project that
  installs a non-Core base and no Astryx CLI reads as outside a project, and
  the who-answered line names the carried Core.

- **FR3 — A base declares its adapters in one place.** An integration
  manifest MAY carry `base: {adapters: {<capability>: <module path>, …}}`.
  The presence of `base` makes the package a base; `base: {}` declares a base
  that serves content only. The steps a base serves are exactly the
  functions each declared adapter module exports from FR4's list. This one
  declaration is both what the base serves and how the CLI reaches it; no
  other declaration says either. A capability the CLI does not know is
  ignored, so a base written for a newer CLI still loads. Core is a base
  declared the same way: the CLI holds Core's declaration and performs Core's
  steps with its own code, so Core needs no integration manifest.
  `@astryxdesign/cli/authoring` MUST publish the capability and step names and
  one type per adapter. An adapter:
  - receives typed inputs from the CLI and returns data, source text, or a
    typed failure;
  - MUST NOT write files, print, read stdin, or exit; the CLI does every write
    under its confinement rules (`architecture:cli-surface` INV10) and every
    output;
  - loads only in a run whose command needs one of its steps. Listing,
    discovery, help, and the manifest never load it (`spec:AST-039` FR6);
  - is imported by its path inside the package, with Node's own loader: no
    `exports` resolution, no conditions, and no TypeScript, so it is a
    JavaScript module the package ships.

  `astryx doctor integration validate` MUST warn about an adapter path that
  does not resolve, a module that fails its type, a capability not on FR4's
  list, and an export that is not a step of its capability.

  FR3 gap: `@astryxdesign/cli/authoring` publishes the capability and step
  names but no per-step input and output types, and `doctor integration
validate` does not check `base`.

- **FR4 — The step list is closed and append-only.** The CLI owns the list.
  A step, once shipped, keeps its inputs, outputs, and meaning; a new step or
  a new optional input is additive.

  | Step                       | What the base computes                                             |
  | -------------------------- | ------------------------------------------------------------------ |
  | `themes.targets`           | the theming targets a theme may override                           |
  | `themes.compile`           | compiled theme output from a theme source                          |
  | `themes.appModule`         | the source of the module an app imports to apply its added themes  |
  | `themes.template`          | the annotated theme source a project starts from                   |
  | `themes.scaffold`          | a new theme's source inside an integration package                 |
  | `themes.checks`            | findings about a project's theme setup, in `doctor`'s issue format |
  | `templates.skeleton`       | a template's layout skeleton with spatial annotations              |
  | `templates.standalonePage` | a self-contained page that loads the base without a build          |
  | `render.page`              | a document rendered from a page module                             |
  | `render.reverse`           | a page module recovered from a rendered document                   |
  | `icons.appModule`          | the source that registers the project's icon sets with the base    |
  | `setup.guide`              | the steps that make an app use the base: imports, root wrapper     |

  FR4 gap: Core's `setup.guide` is written into `init`, `build`,
  `postinstall`, and the agent text instead of coming from one step, so in a
  run on another base they write Core's web setup.

- **FR5 — A command works on any base unless it declares a step.** A command,
  option, or argument value that declares nothing works on every base. One
  that cannot run without a platform step MUST declare `requires` in its
  command doc, listing only the steps it cannot run without: `requires:
[<step>, …]` on the command or the option, and `requires: {<value>:
[<step>, …]}` on an argument whose values differ, as `integration add
theme` differs from `integration add component`. A step a command can do
  without, it treats as optional: it runs without it and says what it left
  out, as `doctor` skips its theme checks when `themes.checks` is absent and
  `build` omits setup guidance when `setup.guide` is absent. A command that
  only groups subcommands declares nothing; it is available when any of its
  subcommands is. A requirement names a step, never a package: no command
  requires Core.

  | Command or part                                 | Requires                           |
  | ----------------------------------------------- | ---------------------------------- |
  | `template --skeleton`                           | `templates.skeleton`               |
  | `template --cdn`                                | `templates.standalonePage`         |
  | `integration add theme`                         | `themes.scaffold`                  |
  | `theme targets`                                 | `themes.targets`                   |
  | `theme template`                                | `themes.template`                  |
  | `theme build`                                   | `themes.compile`                   |
  | `theme add`, `use`, `remove`                    | `themes.appModule`                 |
  | `experimental render`                           | `render.page`                      |
  | `experimental render --reverse`                 | `render.reverse`                   |
  | `experimental theme compile`                    | `themes.compile`                   |
  | `experimental theme add`, `use`, `remove`       | `themes.appModule`                 |
  | `experimental theme template`                   | `themes.template`                  |
  | `experimental theme targets`                    | `themes.targets`                   |
  | `experimental theme editor new`, `editor set`   | `themes.targets`, `themes.compile` |
  | `experimental theme editor undo`, `editor show` | `themes.compile`                   |
  | `experimental theme editor how`                 | `themes.targets`                   |
  | `experimental theme preview add`                | `themes.appModule`                 |
  | `experimental theme preview app`                | `setup.guide`, `themes.appModule`  |

  Every other command and option declares nothing.

- **FR6 — One check, before any command body.** The CLI MUST check every
  run's command, options, and argument values against the active base's
  declaration in one place, after release choice and JSON mode are set and
  before any command body, discovery read, or write. No command checks its
  own requirement. The checks run in this order, and the first that fails
  ends the run: `ERR_BASE_NOT_FOUND` and `ERR_BASE_AMBIGUOUS` (FR2); the
  command's `requires`; each given option's `requires`; each given argument
  value's `requires`. A command's `spec:AST-081` FR4 `refuse` comes before
  them all: in a folder no project encloses, the check leaves a `refuse`
  command to its own refusal. A usage error, such as a missing
  required argument, fails before the check. A step passes when the base declares its
  capability's adapter, the module loads, and it exports the step. The check
  passes the loaded adapters to the command, so the command calls the active
  base's adapter with no flag and no lookup of its own.

  FR6 gap: no command calls an adapter step, so a base other than Core serves
  no step whatever its adapters declare: help hides every command and option
  that declares one, and a run of one refuses with `reason: "not-declared"`.

- **FR7 — Help shows what works; the manifest shows everything.** `astryx
help`, `astryx --help`, and a group's help MUST list only the commands,
  subcommands, and options the active base serves, and only the examples that
  name them. When any are hidden, help MUST end with one line that counts
  them and names the active base. The help of a hidden command, such as
  `astryx theme build --help`, MUST print with one first line naming the step
  it needs. `astryx manifest` MUST list every command with its `requires`,
  each option and argument with theirs, and `available` for the active base,
  and MUST carry the active base and the steps it serves. "Did you mean"
  suggestions, next-step hints (`architecture:cli-surface` INV27), `doctor`
  fixes, and agent text MUST name only available commands. Help MUST NOT
  load an adapter: it reads the declared capabilities, so a command whose
  capability the base declares is listed, and a run whose adapter lacks the
  step refuses it (FR8).

  FR7 gap: next-step hints, `doctor` fixes, and agent text, the block `init`
  writes included, name commands without reading the active base.

- **FR8 — A command the base cannot serve refuses with one line.** A command,
  option, or argument value that fails FR6's `requires` check MUST write
  nothing, MUST exit 1 in text and JSON (`architecture:cli-surface` INV8),
  and MUST fail with `ERR_BASE_CAPABILITY`. The text is one line on standard
  error that names the command or part, the step, and the active base:

      Error: astryx theme build needs the themes.compile step; the active base @acme/native-ui does not provide it.

  The JSON is the error envelope (`architecture:cli-surface` INV2) with one
  additive member:

      {
        "apiVersion": 1,
        "error": "astryx theme build needs the themes.compile step; the active base @acme/native-ui does not provide it.",
        "code": "ERR_BASE_CAPABILITY",
        "requirement": {
          "command": "theme build",
          "option": null,
          "argument": null,
          "requires": ["themes.compile"],
          "missing": ["themes.compile"],
          "reason": "not-declared",
          "base": {"name": "@acme/native-ui", "version": "2.1.0"}
        }
      }

  `option` names the long flag and `argument` the `{name, value}` when that
  part declared the step. `reason` is `not-declared` when the base declares
  no adapter that exports the step, or `failed-to-load` when it declares one
  that does not load; then the line and a `module` member name the module. A
  typed name that matches a hidden command MUST fail this way and MUST NOT
  fail with `ERR_UNKNOWN_COMMAND`.

- **FR9 — An integration builds on the bases it lists as peers.** An
  integration builds on each base its `package.json` lists in
  `peerDependencies`; one that lists no base builds on Core, unless it is
  itself a base, which then builds on no base. Only `peerDependencies` counts; other dependency fields
  do not. An integration
  contributes to a run only when it builds on that run's active base, or is
  itself that base. One that does not is left out of the run, and `discover`
  and `doctor` list it with the bases it builds on. Integration authoring
  commands (`integration add`, `integration check`, `integration verify`, and
  `doctor integration`) treat the package's own base, the one it builds on or
  the one it is, as the active base, and judge component names, template
  imports, and replacements against that base.

  FR9 gap: `discover` and `doctor` do not list the integrations a run leaves
  out, and the authoring commands judge component names, template imports,
  and replacements against Core.

### `--base` on every command

`--base` is global (`spec:AST-017` FR15): it names the one base every
command reads (FR1), and every command shares its failure, `ERR_BASE_NOT_FOUND`
before any work when the package is not a base the run can read (FR2).

| Commands                                                                                                                                                                                                                                                                                                                               | Effect of `--base`                                                                                                         | Verification                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `theme build`, `add`, `use`, `remove`, `targets`, `template`; `experimental theme` `compile`, `add`, `use`, `remove`, `targets`, `template`, `editor new`, `set`, `undo`, `show`, `how`, `preview add`, `preview app`; `experimental render`; `integration add theme`; `template --skeleton`, `--cdn`; `experimental render --reverse` | Runs with the named base's adapter, or refuses with `ERR_BASE_CAPABILITY` when the base does not serve the step (FR5, FR8) | Refusal tests under a fixture base |
| `component`, `hook`, `swizzle`, `docs`, `search`, `template`, `build`, `upgrade`, `gap-report`                                                                                                                                                                                                                                         | Reads the named base's content and none of Core's (FR1)                                                                    | FR1 tests under a fixture base     |
| `discover`, `doctor`, `doctor integration *`, `integration add`, `check`, `verify`, `pack`                                                                                                                                                                                                                                             | Judges and lists integrations against the named base, and lists the ones that do not build on it (FR9)                     | Integration loading tests          |
| `theme list`, `eject`, `palette generate`; `experimental theme list`, `eject`, `palette generate`, `preview list`, `preview remove`; `experimental icon` and its subcommands                                                                                                                                                           | Lists and changes what the named base's integrations ship                                                                  | Fixture-base runs                  |
| `init`, `postinstall`                                                                                                                                                                                                                                                                                                                  | Writes setup steps from the named base's `setup.guide`, or leaves them out (FR5)                                           | Fixture-base runs                  |
| `help`, `--help`, `manifest`, `blog`                                                                                                                                                                                                                                                                                                   | Lists what the named base serves (FR7); every answer's `meta.answeredBy` names the base (FR2)                              | Help and manifest tests            |

### Platform support

- Supported feature/engine floor: every operating system, shell, and package
  manager the CLI supports.
- Unsupported behavior: a base whose adapter cannot load refuses only the
  commands that need it, with `reason: "failed-to-load"`; every other command
  runs.
- Browser evidence: not applicable; the contract is CLI output, exit status,
  and file changes.

## Current-state impact

- `architecture:cli-surface`: the run's system model gains a requirement
  check between dispatch and work that hands the command its adapters (FR6);
  INV7 lists `requires` among the command-doc fields the manifest publishes;
  INV2 names the `requirement` member of the `ERR_BASE_CAPABILITY` envelope;
  INV3 registers `ERR_BASE_CAPABILITY`, `ERR_BASE_NOT_FOUND`, and
  `ERR_BASE_AMBIGUOUS`; INV21's adapter seam reaches a base adapter only
  through the check; INV30's package set holds the active base in Core's
  place.
- `spec:AST-017`: FR14's commands and options appear in help unless the
  active base does not serve them, and the manifest lists them all with
  `available` (FR7); `--base` meets FR15 with the matrix above.
- `spec:AST-081`: FR3's carried Core applies only when the active base is
  Core (FR2 step 5); FR5's `meta.answeredBy` carries `base` in a run on
  another base; a project whose base is not Core is answered by FR2 as a
  project with no Core.
- `spec:AST-039`: the manifest schema gains `base` (FR3); FR9's peer rule
  decides which installed integrations contribute; adapters join the payloads
  FR6 keeps out of discovery.
- `contributing:cli-conventions`: a new command declares `requires` only for
  a step it cannot run without; a new platform step is added to FR4's list.
- Consumer docs: the CLI reference documents `--base`, `requires`, and the
  three codes; the integration authoring guide documents `base`, each adapter
  type, and FR9.

## Verification

| Contract | Verification                                                                                                                 | Representative states                                                                                                              | Mutation or failure expectation                                                                                                                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Every command example run in a fixture project whose only base is a non-Core base                                            | text and JSON; a base with no hooks or codemods; Core installed beside it under `--base`                                           | Any output names a Core item or import path, or an empty content kind refuses                                                                                                                              |
| FR2      | Base resolution tests                                                                                                        | `--base` installed, missing, and not a base; an integration package; Core only; one non-Core base; two; neither, outside a project | A step resolves out of order, the carried Core is fetched for a non-Core base, or `answeredBy` omits `base` on a non-Core run                                                                              |
| FR3      | A fixture base with one adapter per capability, run through every command that calls it; `doctor integration validate` tests | an adapter that writes, prints, or throws; a bad path; an unknown capability; an extra export                                      | The CLI writes anything an adapter returned without its confinement, an adapter's own write or print reaches the disk or stdout, discovery or help loads an adapter, or a bad declaration draws no warning |
| FR4      | Adapter type tests over the published authoring types                                                                        | each step; a missing optional input                                                                                                | A shipped step's type changes incompatibly                                                                                                                                                                 |
| FR5      | Declaration check over every command doc                                                                                     | a command with no `requires`; an option-level step; an argument value; a group; an optional step absent                            | A `requires` names a package or a step off the list, the table and the docs disagree, or a command refuses for a step it lists as optional                                                                 |
| FR6      | A command run under a base that lacks its step, with the command body observed                                               | each check in FR6's order failing; an adapter that fails to load                                                                   | The body runs, a file changes, a later check's code wins, or the command reaches an adapter other than the active base's                                                                                   |
| FR7      | Help and manifest output under Core and under a non-Core base                                                                | a hidden group; a hidden option; a hidden command's own help; examples                                                             | A hidden command, option, or example is listed, the count line is missing or wrong, the manifest drops a command, help loads an adapter, or a hint names a hidden command                                  |
| FR8      | Refusal tests                                                                                                                | text and JSON; each `reason`; an option; an argument value; a hidden name typed                                                    | The exit differs from 1, the code differs, the line is not one line, `requirement` is missing, or a hidden name reads as unknown                                                                           |
| FR9      | Integration loading tests                                                                                                    | peers on Core only, on another base only, on both, on none                                                                         | An integration that does not build on the active base contributes, or `discover` omits it                                                                                                                  |

## Decision log

### DEC-1 — One declaration says what a base serves and how to reach it

**Reference:** `spec:AST-114/DEC-1`
**Decider:** `josephfarina`, `2026-11-10`

A base names one adapter module per capability, and the steps that module
exports are what it serves. Availability, help, the refusal, and the call
the command makes all read that one declaration, so they cannot disagree.
Core is declared the same way, so no command has a Core branch.
Rejected: a capability list and a separate adapter registry, which can claim
a step no adapter performs.

### DEC-2 — Commands are the CLI's; only platform steps are the base's

**Reference:** `spec:AST-114/DEC-2`
**Decider:** `josephfarina`, `2026-11-10`

A command's name, options, JSON shape, receipts, errors, and writes are one
contract an agent learns once. A base supplies only the step its platform
changes and returns data, so every base gets the same command, the same
confinement, and the same output, and an adapter stays small.
Rejected: a base replacing a whole command, whose output and writes the CLI
could then not keep to its own contract.

### DEC-3 — Any base by default; requirements name steps, never Core

**Reference:** `spec:AST-114/DEC-3`
**Decider:** `josephfarina`, `2026-11-10`

A command that reads content works on any base, and a missing kind is an
empty answer. Only a step a command cannot run without is a requirement, and
it names the step, so a base that ships that step serves the command.
Rejected: a "Core only" requirement, which no other base could ever meet.

### DEC-4 — Hidden from help, recognized when run

**Reference:** `spec:AST-114/DEC-4`
**Decider:** `josephfarina`, `2026-11-10`

An agent reads help to learn what to run, so help lists only what works. An
agent also runs commands it read about elsewhere, so a hidden command still
answers with the step it needs, instead of "unknown command", which reads as
a typo.

### DEC-5 — Core answers when a project installs Core and another base

**Reference:** `spec:AST-114/DEC-5`
**Decider:** `josephfarina`, `2026-11-10`

A project that installs Core answers from Core, as it did before bases, and
reaches another installed base only through `--base`. Every existing project
keeps its answers, and a mixed web and native repository needs no new
configuration for its web half.
Rejected: refusing with `ERR_BASE_AMBIGUOUS`, which would make every command
in such a project need `--base`.

### DEC-6 — The CLI holds Core's declaration

**Reference:** `spec:AST-114/DEC-6`
**Decider:** `josephfarina`, `2026-11-10`

Core's declaration and steps live in the CLI beside the Core templates, topic
docs, and codemods the CLI already ships, so the Core package does not change
and every existing project keeps reading Core the way it does.
Rejected: Core shipping its own integration manifest with `base`, which
changes the Core package and how the CLI finds Core's components.

## Open questions

None.
