---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-142
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
phase: proposed
owners: [imdreamrunner]
affects_architecture: [architecture:cli-surface]
affects_families: []
affects_contributing: []
affects_consumer_docs: [cli]
---

# React Native commands system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

A developer or an agent creates, checks, and runs a React Native app on Astryx
with the Astryx CLI. `@astryxdesign/react-native`, the package of
`spec:AST-112`, contributes one command group, `astryx rn`. Its commands write
a new app, generate or check the app's native projects, write the declarations
its capabilities need into projects the app keeps, and put the app on a
simulator, an emulator, or a device. They follow the CLI's rules, so an agent
learns one help, one output, and one error-code contract, and they release
with the package.

## Non-goals

- The package, its native code, and how an app links it belong to
  `spec:AST-112`.
- Equivalent internal implementations remain valid when they satisfy this
  contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.

## Requirements

- **FR1 — React Native commands are one `astryx rn` group.** The React
  Native extension of the Astryx CLI (`@astryxdesign/cli`) contributes one
  command group, `rn`, and a developer or an agent runs its commands as
  `astryx rn <command>`. In an app, that is `npx astryx rn <command>`, or the
  package manager's runner, such as `pnpm exec astryx rn <command>`, because
  the app installs the CLI (below). The record, the package's docs, its
  templates, and its agent text write each command bare, as
  `astryx rn <command>`, and the CLI prints it with the app's runner prefix.
  `@astryxdesign/cli` holds no React Native command; the group reaches the
  CLI through the CLI's command extension point (OQ1).
  - The package is a base (`spec:AST-114` FR3): its integration manifest
    declares `base`. In an app that installs it and no Core, every run reads
    it with no flag (`spec:AST-114` FR2). In a project that installs both,
    `astryx rn` reads the package as its base, and the shared commands below
    take `--base @astryxdesign/react-native`.
  - An app installs `@astryxdesign/cli` as a development dependency. The
    package declares `@astryxdesign/cli` as an optional peer dependency whose
    lowest version is the first release that runs the group, and
    `astryx rn create` writes the CLI into the new app's `devDependencies` at
    that range. An app that adopts the package without `astryx rn create`
    installs both packages.
  - The group's commands, each with the one job it does:

    | Command                                      | Its one job                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
    | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
    | `astryx rn create <path>`                    | Writes a new React Native app into an empty folder from an app template (`--template <name>`, default `starter`; `--list` lists the templates). With `--install-deps` it also installs the dependencies; otherwise it prints the install command for the app's package manager. `astryx rn run` generates the native projects when they are missing.                                                                                                                                                                                                                                                         |
    | `astryx rn shell`                            | Writes the app's generated `ios/` and `android/` projects from `astryx.shell` in its `package.json`. `--check` compares instead of writing, `--ensure` writes a platform that has no generated files and checks the others (`--check` and `--ensure` together fail with `ERR_INVALID_OPTION`), `--entry-only` writes only the generated entry files and touches no native folder, and `--profile <name>` applies a profile of the configuration. `astryx rn shell save-lock` keeps the iOS pod lock for the next generation.                                                                                 |
    | `astryx rn apply`                            | Writes the capability opt-in (`spec:AST-112/FR3`) and the host declarations (`spec:AST-112/FR4`) into the native projects of an app that keeps its own, with no `astryx.shell`. `--check` compares instead of writing.                                                                                                                                                                                                                                                                                                                                                                                       |
    | `astryx rn run ios`, `astryx rn run android` | Puts the app on a simulator, an emulator, or a device. The steps of its plan are: generate or check the native project, check the machine, build, start the dev server for a debug build, install, and launch. `--target <name\|id>` names the simulator, emulator, or connected device, by name or identifier (default: the booted one, else the newest). `--release` builds the release configuration, `--with-dev-server` and `--skip-dev-server` change the dev-server default (together they fail with `ERR_INVALID_OPTION`), `--skip-launch` stops after the install, and `--dry-run` prints the plan. |
    | `astryx rn doctor`                           | An alias that runs the shared `astryx doctor` with the package as its base.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

    No command passes arguments through to another tool.

  - Two commands stay shared, outside the group:
    - `astryx doctor` keeps its job. In a run on the package, its report
      includes the toolchain (Xcode, CocoaPods, the JDK, the Android SDK, the
      dev-server port) and the app (generated projects, the pod lock, applied
      declarations).
    - `astryx docs react-native` prints the package's docs topic.
  - Each command of the group is a thin layer over one function that the
    package's `./commands` entry exports (`spec:AST-042` FR1). The group
    is one new top-level command, `rn`, and it meets `spec:AST-042` FR4: it
    answers "how do I build, check, and run a React Native app on Astryx?",
    which no existing command answers, because `init`, `build`, and
    `experimental theme preview app` work on web projects and pages; its one
    job is the React Native app's lifecycle; and its results are data. Each
    subcommand stays inside that job:

    | Subcommand        | The question it answers                                                             | Why an option on another subcommand cannot answer it                                                                                                                                                      | Function                        | Its result as data                                    |
    | ----------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------- |
    | `create`          | How do I start a React Native app on Astryx?                                        | Every other subcommand needs an app that exists.                                                                                                                                                          | `create`                        | The app's folder, its files, and the next commands    |
    | `shell`           | Are this app's generated native projects what its configuration generates?          | `apply` changes files the app owns, in place; `shell` replaces generated projects whole.                                                                                                                  | `shell`                         | The written or differing paths                        |
    | `shell save-lock` | Should the next generation keep this app's current iOS pod lock?                    | `shell` writes projects and `save-lock` writes nothing else, so an option on `shell` would make one run do two jobs.                                                                                      | `shellSaveLock`                 | The saved lock path                                   |
    | `apply`           | Do the native projects this app keeps carry the declarations its capabilities need? | `shell` owns generated projects only.                                                                                                                                                                     | `apply`                         | The changed or differing files                        |
    | `run`             | How do I see this app on a simulator, an emulator, or a device?                     | No other subcommand builds or launches.                                                                                                                                                                   | `run`                           | The plan, each step's result, and the launched target |
    | `doctor`          | Is this machine and this app ready to build and run a React Native app?             | It is an alias, not a new job: it runs `astryx doctor` with the package as its base, so `astryx doctor --base @astryxdesign/react-native` answers the same and the group keeps the question in one place. | `doctor` (the shared command's) | `doctor`'s issue report                               |

  - `./commands` is the package's Node-only entry (`spec:AST-112/FR5`). It
    exports one function per command of the group, with its reference docs
    and tests (`spec:AST-042` FR2), and it runs only in the Astryx CLI: no
    other entry of the package and no app's runtime imports it, and
    `@astryxdesign/cli` never depends on the package.
  - Flags keep the Astryx CLI's names and meanings (`spec:AST-042` FR5).
    `--json` and `--base` are the CLI's global flags. `astryx rn shell`,
    `astryx rn apply`, and `astryx doctor` act on every platform the app has
    unless `--platform ios|android` names one, and `astryx rn run` takes its
    platform as its argument. `--check` compares instead of writing.
    `--dry-run` prints the plan and changes nothing. `--dev-server-port <n>`
    names the port of the dev server a command starts or probes.
    `astryx rn create --display-name <words>` is the app's name on the home
    screen.
    `astryx rn create --package-spec <version|tarball>` names what the app
    depends on. The app is the project that encloses the working folder; no
    command takes a folder option for it, because the run's release and base
    come from that folder (`spec:AST-081` FR2, `spec:AST-114` FR2).
  - The commands read no Astryx-owned environment variable
    (`spec:AST-017` FR14). Every setting is an option or a `package.json`
    field. React Native's own variables, such as `RCT_METRO_PORT`, keep their
    meaning.
  - Every command follows `architecture:cli-surface`. It asks no question
    (INV1). With `--json` it prints one envelope (INV2). Its text output is
    plain text (INV4). It exits 0 or 1, the same in text and JSON (INV8), and
    its outcomes differ by `code` (INV3):

    | Outcome                                                                                               | Code                                                                 |
    | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
    | A wrong or missing argument or option                                                                 | `ERR_INVALID_ARGUMENT`, `ERR_INVALID_OPTION`, `ERR_MISSING_ARGUMENT` |
    | No app encloses the working folder                                                                    | `ERR_PROJECT_REQUIRED`                                               |
    | A tool the command needs is missing: Xcode, CocoaPods, the JDK, or the Android SDK                    | `ERR_DEP_MISSING`                                                    |
    | `astryx rn create` names a folder that is not empty                                                   | `ERR_FILE_EXISTS`                                                    |
    | `astryx rn create --template` names no app template                                                   | `ERR_UNKNOWN_TEMPLATE`                                               |
    | `astryx rn run --target` names no simulator, emulator, or device                                      | `ERR_NOT_FOUND`                                                      |
    | The dev-server port a command starts on is in use                                                     | `ERR_DEV_SERVER_PORT_IN_USE`                                         |
    | A download fails                                                                                      | `ERR_FETCH_FAILED`                                                   |
    | `astryx rn shell --check` or `--ensure` finds generated files that differ                             | `ERR_SHELL_STALE`                                                    |
    | `astryx rn apply --check` finds files to change                                                       | `ERR_APPLY_STALE`                                                    |
    | A build or an install step fails; the envelope's `log` member holds the log's path and its last lines | `ERR_RUN_BUILD_FAILED`                                               |
    | `astryx rn` runs where the React Native package is not installed                                      | `ERR_BASE_COMMAND`                                                   |

  - A command that keeps running (`astryx rn run` while it holds the dev
    server) says so in its summary, so help and the manifest carry it. It
    writes its result once, when it is ready, and then closes standard
    output; under `--json` that result is one envelope with `running`
    (whether the process stays) and the process's `pid`, `port`, and `url`
    where it has them. Progress and the output of every process it starts go
    to standard error. Stopping it with SIGINT or SIGTERM exits 0.
  - The commands' own writes stay inside the app (INV10), with one exception:
    `astryx rn create` writes the new app's folder inside the working folder.
    The tools a command starts (Xcode, Gradle, CocoaPods) keep their own
    caches.
  - `astryx rn create` runs before any project installs the package. After a
    computer install of both packages,
    `npm install -g @astryxdesign/cli @astryxdesign/react-native`, the
    command `astryx rn create my-app` runs in a folder outside any project.
    Inside a project, the project installs `@astryxdesign/react-native` first,
    and `astryx rn create` then needs no computer install. A one-off package
    runner without a computer install is OQ2.
  - `rn` is the one name the CLI reserves for the group. Where the package is
    not installed, `astryx rn` is hidden from help and still recognized, as
    `spec:AST-114` FR7 and FR8 do for a step. Running any `astryx rn` command
    there writes nothing, exits 1 with `ERR_BASE_COMMAND`, and prints one
    line:

        Error: astryx rn is the React Native command group from @astryxdesign/react-native, which this project does not install.

    Outside a project the line ends "which is not installed on this
    computer". The suggestion is the install command for that place: the
    project's package manager inside a project, and
    `npm install -g @astryxdesign/cli @astryxdesign/react-native` outside
    one. `astryx rn --help` prints the same
    line and exits 1, and `astryx manifest` lists `rn` by name with
    `available: false`.

  - An integration that builds on the package (`spec:AST-114` FR9) adds
    commands to the `rn` group the same way the package adds its own.
  - The commands start and stream long-running processes (the dev server,
    Xcode and Gradle). They write many files, binary files included
    (generated native projects, template images and fonts). The extension
    point that OQ1 shapes carries each of these, and it also carries the
    commands' `CommandDoc`s, their error codes, their JSON response types,
    their output blocks (INV23), their write confinement (INV10), and their
    `outsideProject` values (`spec:AST-081` FR4).
  - `astryx doctor`'s React Native items come from one step that the
    package's adapter serves, appended to `spec:AST-114` FR4's list as
    `setup.checks`: findings in `doctor`'s issue format, with the statuses
    `pass`, `warn`, `fail`, and `info`. `astryx doctor` takes
    `--platform ios|android` and `--dev-server-port <n>`; each declares
    `requires: [setup.checks]` (`spec:AST-114` FR5).
  - No command writes a key into `astryx.config`. `@astryxdesign/cli`
    contains no React Native command code, so a web project installs nothing
    for these commands.

  FR1 gap: the CLI has no command extension point, so `astryx rn` does not
  exist, and the package carries a command of its own,
  `astryx-react-native <command>`.

### Platform support

- Supported feature/engine floor: the commands run where the Astryx CLI runs,
  and the apps they create and run follow `spec:AST-112`'s Platform support.
- Unsupported behavior: where the React Native package is not installed,
  `astryx rn` refuses with `ERR_BASE_COMMAND` and writes nothing (FR1).
- Browser evidence: none. CLI contract tests prove the commands, and the apps
  they run are checked on the Simulator, the emulator, and devices
  (`spec:AST-112/FR15`).

## Current-state impact

- `@astryxdesign/cli` runs the commands that `@astryxdesign/react-native` and
  the integrations that build on it add under `astryx rn` (FR1) through the
  mechanism OQ1 settles, and `architecture:cli-surface` gains that mechanism. The CLI
  holds no React Native command code.
- `spec:AST-114` reads the package as a base. Its FR4 list gains the
  `setup.checks` step, and its FR5 table gains `doctor`'s `--platform` and
  `--dev-server-port`, each requiring that step (FR1).
- `spec:AST-114` FR2's resolution order gains one rule for the reserved `rn`
  group: `astryx rn` reads `@astryxdesign/react-native` as its base as if
  `--base` named it where FR2 may read it: inside a project, only the
  project's own install, a project that also installs Core included, as
  `spec:AST-081` FR12 allows; outside a project, the package set that serves
  the run or the computer's install. Where neither has the package,
  `astryx rn` refuses with `ERR_BASE_COMMAND`. Its DEC-5, which reaches a base other than
  Core only through `--base`, gains that exception (FR1).
- `spec:AST-114` FR6's check, FR7's help and manifest, and FR8's refusal also
  cover the reserved `rn` group: `ERR_BASE_COMMAND`, checked after
  `ERR_BASE_NOT_FOUND` and `ERR_BASE_AMBIGUOUS` and before any `requires`.
  The CLI reserves the name `rn`, so it needs no list of React Native command
  names.
- `spec:AST-042` FR1 and FR2 extend to the functions that any package or
  integration exports for the commands it adds under `astryx rn` (FR1),
  with their docs and tests, and FR4's admission covers FR1's one new
  top-level command, `rn`, and its subcommands.
- `architecture:cli-surface`: INV3 registers FR1's new codes,
  `ERR_BASE_COMMAND` included; INV2 and INV9 admit a command that keeps
  running, writes its one result, and closes standard output; INV2's error
  envelope gains the `log` member of `ERR_RUN_BUILD_FAILED`; INV10 gains the new app's folder as a write root.

## Verification

| Contract | Verification                                                                                                                                                                                                                                                                         | Representative states                                                                                                                                                                                                                                                                                                                                          | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | CLI contract tests of each `astryx rn` command, run as `astryx rn <command>`: JSON envelopes, exit codes, each code in FR1's table, the refusal where the package is not installed; a source check for Astryx-owned environment variables; a dependency check of `@astryxdesign/cli` | each command; `astryx rn doctor` beside `astryx doctor --base @astryxdesign/react-native`; a long-running command stopped by SIGINT; `astryx rn create` after a computer install; `astryx rn create` inside a project that installs Core; a web project; a project that installs Core and the package; a project without the package on a computer that has it | An exit code that depends on `--json` or is neither 0 nor 1, a question asked, output on standard output after a long-running command's result, an Astryx-owned environment variable read, `astryx rn` in a web project read as unknown, `astryx rn doctor` and `astryx doctor` that report differently, `astryx rn` that reads a computer install inside a project, or `@astryxdesign/cli` that contains or depends on React Native command code |

## Decision log

### DEC-1 — React Native commands are one `astryx rn` group

**Reference:** `spec:AST-142/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

An agent learns one command, one help, and one output and error-code
contract, so the package's commands run as `astryx rn <command>` under the
CLI's rules. One reserved group name keeps them apart from the web commands
(`init`, `build`, `doctor`) and says, in the command itself, that the work is
React Native's. The package ships them, so a web project installs nothing for
them, and they release with the package.

## Open questions

- **OQ1 — How is the CLI's command extension point shaped?**
  (`human-api`; owners: imdreamrunner and josephfarina) `spec:AST-114`
  resolves the active base and checks each command against it before any
  command body runs (FR2, FR6). It adds no way for a package to add a
  command, and its adapters return data only (FR3). FR1 fixes where the
  commands go, `astryx rn`, and their names, options, and outcomes. Options:
  - **A `commands` contribution.** The integration manifest declares the
    group and each command with its `CommandDoc`, and the CLI calls the
    package's function under its output, exit-code, and write rules. The
    manifest's `cliCommand` key names the printed command prefix only.
  - **Platform steps.** The CLI owns the `rn` group, and `spec:AST-114` FR4's
    list gains steps for its platform work. The steps then start and stream
    processes, run until stopped, write many and binary files, and run before
    a project installs the package, which FR3's adapter rules do not allow.
- **OQ2 — Does a one-off package runner run `astryx rn create`?** (`human-api`;
  owners: imdreamrunner and josephfarina) `spec:AST-081` FR12 does not count a
  package runner's temporary install as an install root, and `spec:AST-114`
  FR2 reads `--base` only from the project, the package set that serves the
  run, or the computer. So
  `npx -p @astryxdesign/cli -p @astryxdesign/react-native astryx rn create my-app`
  finds no React Native base and fails. Inside a project that installs Core
  and not the package, `astryx rn create apps/mobile` has the same need. Options:
  - **The group's package resolves from the runner's install.** The package
    that `astryx rn` names, like a package that `--base` names, also resolves
    from the install root of the copy that answers, a package runner's
    temporary install included. The caller named
    the package, so the run reads only what it asked for.
  - **The computer install stays the route.** `astryx rn create` needs both
    packages installed for the computer, or the project's own install.
