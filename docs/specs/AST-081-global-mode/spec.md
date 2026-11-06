---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-081
authority: current
archive_reason: null
superseded_by: null
approved_by: josephfarina
approved_at: 2026-10-19
phase: accepted
owners: [josephfarina]
affects_architecture: [architecture:cli-surface]
affects_families: []
affects_contributing: [contributing:cli-conventions]
affects_consumer_docs: [cli]
---

# Global mode system spec

<!-- Describe the system, not the project: present tense, what it does. No
proposals, history, pull requests, or research in the record; see
docs/contributing/spec-writing.md and report its rubric results in the pull
request. -->

## Intent

A person or an agent installs Astryx once on a computer, as the CLI package
itself, and runs it in any folder. Inside a project, every answer is the one
the release matching the project's Core gives, whichever copy of the CLI
started the run, because a template, a component doc, or an agent instruction
from another release writes code the project's Core rejects, with no error to
say so. Outside a project, the release installed for the computer answers, the
way a new project on it would, so an agent with no project files can learn
Core, its components, and the docs, and a notice says when a newer release is
out.

This record owns which release answers a run (FR1, FR2), what every command does
outside a project (FR3, FR4), how a run names the release that answered and
picks the one command name every printed command starts with (FR5), how a copy
installed for the computer learns of newer releases (FR6), where any run may
write (FR7), what each release carries for use outside a project and how the
computer-level agent text stays installed (FR8), how every copy of the CLI hands
a project's run to the release that answers there (FR9), when a run reminds its
caller to update (FR10), who answers when global and project copies meet
(FR11), and which integrations installed for the computer apply, and where
(FR12).

## Non-goals

- Which project an upgrade works on, which Core it migrates to, and what it
  reports when the CLI is older than that Core: `spec:AST-040` FR9–FR13.
- Which files hold a project's agent docs, and where `init` writes them and
  refuses to: `architecture:cli-surface` INV31.
- The official package list and how discover reads it: `spec:AST-051` FR11.
- How a host's package sets are matched to a project's pins, which
  integrations they serve, and how a run records the packages it resolved:
  `architecture:cli-surface` INV30.
- Classifying a change to released behavior that this record requires:
  `spec:AST-017`, and `architecture:cli-surface` INV10a for a refusal that
  corrects a write outside its confined root.
- What a project starter contains, and the template kind that ships it.
- Equivalent internal implementations remain valid when they satisfy this
  contract.

## Requirements

In this record, a **door** is a way to start the CLI: the `@astryxdesign/cli`
package itself, installed in a project and run through its package manager (the
project's own CLI), installed for the computer, such as with
`npm i -g @astryxdesign/cli`, or run once through a package runner, such as
`npx @astryxdesign/cli`; and a programmatic host through
`@astryxdesign/cli/host`. A **copy** is the `@astryxdesign/cli` a door starts:
the one it installed or fetched, the one a host carries, or a release in the
per-user cache that global mode installed (FR2, FR3, FR6). The **global copy**
is the CLI package installed for the computer: one in npm's global folder (a
`node_modules` whose owner holds no package.json), or in a global folder that a
package manager's own settings name (Bun's `BUN_INSTALL` or `globalDir`, Yarn's
`global-folder`, pnpm's `PNPM_HOME` or `global-dir`, and each one's default),
read the way that package manager reads them. A package kept in pnpm's store
(`<store>/v<N>/links`) is global only when such a pnpm global folder links to
it. A folder's layout alone never makes a copy global, and when the CLI cannot
tell, the copy is not global, so it runs no update check and writes no agent
text.

A folder's **project** is found the way the CLI finds the Core and the CLI it
reads there: the `@astryxdesign/core` installed in the folder or one of the four
folders above it, or a workspace's own Core package; the `@astryxdesign/cli`
installed in the folder or one of the five folders above it, resolved by the
package manager's Plug'n'Play runtime, or a workspace's own CLI package (the
folder itself, or `packages/cli` in it or one of the five folders above it); and
otherwise the nearest `package.json` at or above the folder that declares either
package, searched up to the first folder that holds version-control metadata and
never in the home folder unless the run starts there. A folder deeper than that
nearby look finds the project's Core and its own CLI the same way from that
`package.json`'s folder, as a package runner resolves the project's command from
any depth. A folder is
**outside a project** when none of these exist. A folder inside another
project, such as a repository cloned into it or a nested app, therefore
answers with the enclosing project's release. The project that an upgrade
works on is `spec:AST-040` FR9's.

- **FR1 — One CLI behind thin doors.** All behavior lives in
  `@astryxdesign/cli`. A door that runs that package directly, the project's own
  CLI or a copy installed for the computer or fetched by a package runner, runs
  the CLI itself. A programmatic host carries the `@astryxdesign/core` release
  equal to the CLI release it runs, chooses that release (FR2, FR3, FR6), and
  starts it through the host entry `@astryxdesign/cli/host`, a supported
  programmatic API whose reference doc states each input, its default, the
  result, and the errors (`spec:AST-017` FR14). A door MUST NOT pass anything to
  the CLI through an environment variable, an option, or a configuration key,
  and MUST NOT add a command, an option, or any other behavior.
  - The host entry's inputs are explicit: the arguments; the working folder;
    the command name the door's callers type (FR5); the package sets the door
    may serve, in its order of preference, and the integrations it approves for
    use outside a project, resolved by name from the package set that serves
    the run, in addition to what FR12 finds there (`architecture:cli-surface`
    INV30); the discover sources the door adds; and, when the door found the
    project's own CLI and did not run it, the reason (FR2), as text the host
    defines; this record sets no list of reasons.
  - Discover calls a door's sources after every integration's source and before
    the official list (`spec:AST-051` FR6 and FR11), and names each as the
    door's, never as an integration's.
  - A door makes one call per process. A call takes over the process's working
    folder, arguments, standard streams, and exit, so a second call in the same
    process MUST fail before running anything; calls in separate processes
    share nothing (`spec:AST-017` FR18).
  - Given the same release, Core, folder, arguments, and inputs, a command
    MUST give the same exit status, output, and file changes through every
    door, apart from the command names FR5 sets and the standard-error lines
    FR5, FR6, and FR9 define.
- **FR2 — In a project, the project's own CLI answers; without one, the copy
  that started the run.** In a folder that belongs to a project, one release
  answers every command, reads included, and every template, doc, component
  doc, hint, and agent text comes from that release.
  - When the project installs `@astryxdesign/cli`, that CLI answers, whatever
    its version, as it did before global mode (DEC-10). A run that starts in
    another copy MUST hand the run to it (FR9) before loading anything the
    project provides: its `astryx.config`, its integrations, or its Core.
    `doctor` warns when that CLI and the project's Core are different releases
    and names the command that brings them to one release; from a folder
    inside the project whose `package.json` is not the project's
    (`spec:AST-040` FR9), it says to run from the project's folder instead.
  - When the project installs no CLI, as a project with only Core or a fresh
    clone with nothing installed, the copy that started the run answers, as
    it did before global mode (DEC-10), reading the project's Core as it
    always has. In text mode, after a successful command, at most once a day
    per project and under the same switches as FR10's notices, one line on
    standard error says so when that copy is not the project's Core release:
    `astryx: this project has no Astryx CLI installed; answered by CLI <version> while its Core is <core>. To match, run: <command>`,
    where the command adds `@astryxdesign/cli` at the Core's version with the
    project's package manager. For this advice, the project is the one
    `spec:AST-040` FR9 defines: from a folder inside it whose `package.json`
    is not the project's, the line, `doctor` and the setup reminder say to run
    from that project's folder instead of naming a command, and a folder that
    belongs to no such project gets no project advice, as outside a project. A machine-readable result carries
    `meta.answeredBy.copy` `starting`. `doctor` warns in the same case and
    names the same command, and the setup reminder of a project that has not
    run `init` names it first, then `astryx init`.
  - The release equal to the project's Core (the matched release) is the
    version of the Core the folder reads, else the Core version the project's
    lockfile records, else the newest published release that the Core range
    the project declares allows; a project that records no Core is matched by
    the CLI it locks or declares, in the same order.
  - When the project's own CLI is installed but cannot start, the matched
    release answers: the copy that started the run when it is that release,
    otherwise the release in the per-user cache, installed there through the
    package manager the first time a project needs it; a hosted run takes it
    only from a package set that qualifies under `architecture:cli-surface`
    INV30 and installs nothing, so with no such set the release cannot be
    obtained. The package manager is
    started without a shell, and a declared Core range is read only when it is a
    plain version range, so nothing a project declares reaches a shell. While a
    release installs, or while the run waits for another run installing it, a
    text-mode run prints one line on standard error saying so; a
    machine-readable run prints none. An install that a live run is still making
    is waited for, a lock its run left when it stopped is taken over, and a
    cached release whose files are damaged is installed again. An install that
    has not finished within a generous bound is a release that cannot be
    obtained (below), never a stopped process. No install outlives the run that
    started it: it ends when that run ends, however the run ends, and its record
    of npm's process is removed then, since that number can later name another
    process. A run that takes over a stopped run's lock ends the install that
    lock records only when the process is surely it: its arguments are exactly
    npm, or node running npm's entry file, installing `@astryxdesign/cli` at the
    lock's release, it started after the lock was taken, and the lock is younger
    than any install may take. npm's process title, which the system may report
    as one argument, is read as its arguments. Otherwise it takes the lock over
    and leaves the process alone.
  - `astryx upgrade` follows the same rule: the project's own CLI runs its
    codemods, and `spec:AST-040` FR13 defines what it reports when it is older
    than the installed Core; in a project with no CLI of its own, the copy that
    started the run runs its own codemods, as before global mode.
  - When a door finds the project's own CLI and declines to run it, it passes
    the reason (FR1). The release equal to that CLI's version then answers in
    its place when the door can run it; otherwise the copy that started the
    run answers, announced as for a release that cannot be obtained, and the
    warning names the reason the project's CLI was declined.
  - When the release this requirement names is not installed and cannot be
    obtained (it cannot be fetched, the registry does not have it, no
    published release fits the declared range, or the cache cannot be
    written), the run MUST be answered by the copy that started it, as before
    global mode. It MUST be announced: in text mode one line on standard error,
    `astryx: could not get Astryx <release> to match this project's Core (<reason>); answering with CLI <version> instead`,
    and in a machine-readable result `meta.answeredBy.copy` is `fallback`.
    No other release answers, and nothing falls back while the matched
    release can be obtained. A failed install is recorded in the per-user
    cache, by release, and no copy using that cache starts it again for 2
    minutes after a first failure, or 10 minutes after a second failure in a
    row; a successful install forgets it. So an offline run prints at most one
    line saying it installs, and the warning says when it was last tried.
    `ERR_VERSIONS_UNAVAILABLE` is for a run nothing can answer, such as a
    command that needs Core outside a project that cannot install it (FR3).
- **FR3 — Outside a project, the running release answers as a new project
  would.** Outside a project, every copy answers itself, the global copy
  included (FR6, FR9). The answering release MUST answer as it would in a new
  project that installs only that release of Core, the computer-level
  integrations (FR12), and any integration a programmatic host approves (FR1).
  Outside a project, or in a project with nothing
  installed (FR2's copy that started the run, such as in a fresh clone), every
  command that needs Core answers from the carried Core: the
  `@astryxdesign/core` release equal to the answering CLI, beside it, carried by
  its door (FR1), or kept in the per-user cache, where a copy that carries none
  installs it the first time a command needs it. The global copy also installs
  its own release's Core there in the background, on any run while none is
  beside it or cached (FR6), so commands that read Core work offline after one
  online run. A project's installed Core is always read in its place, from any
  depth. When the carried Core cannot be installed, those commands fail with
  `ERR_VERSIONS_UNAVAILABLE` before any write, and in a project the message says
  the project has no Core installed and to install its dependencies; the
  exception is an open `search`, which answers from the domains that need no
  Core and says what it skipped and why: `meta.partial` in a machine-readable
  result, and one line on standard error in text mode. `doctor`, `swizzle`, and
  `upgrade` judge or change a project and MUST NOT read the carried Core.
  Output outside a project MUST NOT give advice that works only inside one, such
  as a step that sets up, configures, or refreshes a project the folder does not
  have.
- **FR4 — Every command declares what it does outside a project.** Every
  command and subcommand MUST declare one of three values in its command doc,
  and `astryx manifest` MUST publish that value as the command's
  `outsideProject`:
  - `same`: it gives the answer it gives in a new project (FR3).
  - `refuse`: it writes nothing and fails before doing any work, naming what it
    needs, an app project or an integration package.
  - `own`: it does something else outside a project, which its command doc
    states and a test of its own covers.

  A command that only groups subcommands declares nothing. A refusal fails with
  `ERR_PROJECT_REQUIRED`, except that a command whose released versions refuse
  outside a project with another error code keeps that code until a declared
  minor changes it; that change, and any other change to what a released command
  does outside a project, is classified under `spec:AST-017`. `doctor` is `own`:
  outside a project it checks the computer, reporting the Node version, the
  release that answered and the newest release it knows of, and whether the
  computer-level agent text (FR8) is present and current; when that text names
  `astryx` and no `astryx` command is on the search path, apart from a package
  runner's own copy, it says so and names the install step the text records,
  or npm's when it records none;
  and it never fails a check because the folder has no project. `swizzle` is
  `refuse`, even with a carried Core.

- **FR5 — Every answer names who answered, and one picker names every printed
  command.**
  - Every successful machine-readable result MUST carry `meta.answeredBy`:
    `cli`, the answering CLI's version; `core`, the version of the Core the run
    pairs with (the project's installed Core, or the carried Core when the
    project has none or the folder is outside a project), or `null` when there
    is none; and `copy`, which is `project` for the project's own CLI,
    `starting` for the copy that started the run in a project with no CLI of
    its own, `matched` for the release FR2 matches to the project's Core when
    the project's own CLI cannot start, `carried` outside a project, and
    `fallback` when the matched release could not be obtained and the copy that
    started the run answered instead (FR2). A release that
    predates this field answers without it, and no door adds it.
  - In text mode, when `copy` is `matched` or `carried`, the run MUST print one
    line on standard error naming the CLI and Core versions and which copy
    answered; a `fallback` run prints FR2's warning line instead, and a
    `starting` run prints none, only FR2's daily hint. A
    run started in the project's own CLI prints no such line, and a run another
    copy hands to it prints the one line FR9 defines.
  - Every command the CLI prints or writes for its caller to run MUST start
    with the command name that one picker chooses for the folder the command
    runs in. The picker takes the first of these that applies:
    1. the command that the integrations the run loads declare for running the
       CLI, such as `acme astryx` for a company's own command-line tool;
    2. the name passed by the door that started the run (FR1);
    3. the package manager's name: the project's run prefix when the project's
       own CLI answers, `astryx` when the global copy or a release it keeps
       answers outside a project, and otherwise the package runner with the
       CLI package pinned to the answering version, such as
       `npx @astryxdesign/cli@0.7.2`.
  - The computer-level agent text (FR8) belongs to no folder and names no
    release, so its commands start with the name of the door that wrote it,
    and otherwise with `astryx`, the command of the global copy, which answers
    outside a project itself and hands a project's run to that project's
    release (FR9). No integration's `cliCommand` applies
    to it.
  - The picked name takes the place of the command's leading `astryx` and, run
    from that folder, MUST reach the same choice of release (FR2, FR3, FR9). A
    printed command MUST NOT run, through a package runner, the CLI package
    without a version or a package other than the CLI.
  - An integration MAY declare in its manifest, as `cliCommand`, the command
    that runs the CLI for its users: a non-blank single line of at most 120
    characters, with no surrounding spaces and no Astryx agent-docs marker text
    (`ASTRYX:START`, `ASTRYX:END`), that starts the CLI through a door following
    FR1 and FR2. With no declaration, the picker goes on to the door's name.
    Integrations that declare the same command agree. When the integrations the
    run loads declare different commands, the picker takes the package manager's
    name, even when a door started the run, and `doctor` warns, naming each
    integration and the command it declares. A declaration of any other form
    counts as absent, never withdraws the integration's other contributions, and
    `doctor` warns about it; `doctor integration validate` and
    `integration check` report it as a note (`invalid_cli_command`) beside
    their issues, marked `next`: it fails nothing until the next minor release
    (`architecture:cli-surface` INV35).
  - The picker names every command the CLI prints or writes: hints and next
    steps, errors and their suggestions, `doctor` fixes, help, docs moves
    (`spec:AST-047`), recommended commands (`spec:AST-048`), the project's
    agent-docs block, the computer-level agent text (FR8), and the setup
    reminder wherever it is printed. No surface spells a command name of its
    own.
  - Astryx's own docs, guides and agent text, and an integration's agent-doc
    lines, write every CLI command bare, beginning `astryx`, or as a
    `{@command …}` token. An integration's docs write each as a
    `{@command …}` token; a bare one there is a `plain_command` note
    (`architecture:cli-surface` DEC-12). The CLI puts the picked name in
    place of the leading `astryx` when it prints or writes that text. A doc writes a
    package-manager step as a `{@pm …}` token, or as `{@pm-only <manager>
    "<reason>" …}` for a step only that package manager can do, and `{@@…}`
    shows a token as written. The CLI renders each token as it compiles the
    doc: `{@command …}` as the bare command, and `{@pm …}` in the package
    manager of the project it runs in; a host that shows docs to readers of
    every package manager, such as the docsite, picks one. A step that
    installs a door, or starts one by its own name, is not a CLI command and
    stays as written.
  - Machine-readable output, error envelopes included, carries every command
    bare, beginning `astryx`, and never a picked name or an unrendered
    token.
  - A command that finishes work with another release names that release
    (`spec:AST-040` FR13).
- **FR6 — The global copy tells its user about newer releases and installs
  none; projects are never touched.** Outside a project, the global copy
  answers with its own installed release. No door installs a newer release for
  the computer, switches to one, or changes the package manager's installation
  of the global copy; its user upgrades it with the package manager, which
  FR10's notice names.
  - The global copy checks the release the package registry tags `latest` for
    `@astryxdesign/cli`, and the Node range that release declares, at most
    once in any 24 hours, never sooner than 24 hours after its first run, and
    only during a run. The check runs in the background, at most one at a
    time; no command waits for it, fails because of it, or changes its output
    or exit status because of it. It records what it found, and when, in the
    per-user state file (FR7), and installs nothing.
  - On a run while it carries no Core beside it and none is cached for its
    release, the global copy installs that Core into the per-user cache from a
    detached step it starts as the run ends, as FR3 needs: never when `CI` is
    set as below, never blocking or changing a command or holding anything the
    command's caller waits on, and a failure is silent and waits out FR2's
    backoff before a later run's step tries again. It never runs on Windows,
    where a detached process inherits the caller's open pipes; there a command
    that reads Core installs it the first time it needs it. This installs the
    global copy's own release's Core only, never a newer release.
  - No check runs when the environment variable `CI` is set to a value other
    than empty, `0`, or `false`, or when `NO_UPDATE_NOTIFIER` is set to any
    value. Astryx defines neither: `CI` is the platform convention continuous
    integration services set, and `NO_UPDATE_NOTIFIER` the one command-line
    tools share to silence update notices; each is read only for that shared
    meaning (`spec:AST-017` FR14).
  - A release requested by version, such as `npx @astryxdesign/cli@<version>`,
    runs exactly that release outside a project, with no check; inside a
    project, FR2 and FR9 decide which release answers. A copy a package runner
    fetches runs no check.
  - Updates have no other control; the package manager's registry, proxy, and
    offline settings apply to the check.
  - No door updates a project or installs into one. A project's release that is
    behind the newest gets FR10's notice, and `doctor` reports it; neither
    installs anything.
- **FR7 — Writes stay inside named places.** Every file the CLI or a door
  writes MUST land in one of these places; a write anywhere else MUST be
  refused before anything is written (`ERR_PATH_TRAVERSAL`,
  `architecture:cli-surface` INV10):
  - the operation root: the folder the command runs in, or a folder above it
    when the record that owns the command's writes says so, such as the project
    root of an upgrade (`spec:AST-040` FR9), the project that holds the theme
    module (`spec:AST-050` FR2), and the folder where `init` writes agent docs
    (`architecture:cli-surface` INV31);
  - the per-user cache directory of the platform (a cache or configuration
    folder that an environment setting points at counts only when it is an
    absolute path), for saved discover answers (`spec:AST-051` FR8) and for the
    releases global mode installs into a project's run (FR2, FR3);
  - the platform's temporary directory, for scratch work such as building or
    verifying a package;
  - the per-user configuration directory of the platform, for the documented
    settings of the computer-level agent text and the per-user state file,
    `astryx/state.json`, which holds what the update check found and when
    each notice last printed (FR6, FR8, FR10);
  - the computer-level agent text (FR8), its links, and its copy, written by
    `astryx init --user` and by the global copy keeping that text installed,
    in the background, as FR8 states; no other command writes them, and no
    package install script does.

  No run writes a project's agent docs into the home folder or a settings folder
  in it (`architecture:cli-surface` INV31); the computer-level agent text above
  is not a project's agent docs, and INV31 says so. When a door fetches a
  release through the package manager, the package manager's own files follow
  its own settings. `architecture:cli-surface` INV10a classifies a refusal that
  corrects a write a released version made outside these places.

- **FR8 — Everything global ships inside the release.** The agent text, the
  official package list (`spec:AST-051` FR11), and the project starters ship
  inside each CLI release. Each is generated from the repository when the
  release is built and is never fetched at run time or edited by hand, and a
  check MUST fail when a committed copy no longer matches the repository.
  - Every agent text a release prints or writes names only the command name FR5
    picks for its surface. The computer-level text is its own short text: it
    tells an agent that Astryx is on the computer, when it is relevant, and to
    start with `astryx search`; it names no version, no release-specific
    command or prop, and only entry points every release keeps (`search`,
    `docs`, `component`, and the like), so an older copy never misleads.
    It also gives the build route the project agent docs give, through their
    shared workflow wording: work in a project folder, new or existing, adding
    `@astryxdesign/core` and `@astryxdesign/cli`, or, where the project already
    installs Core, the CLI at that Core's version; run `astryx init` there; then
    start from a template, check, and deliver the built project.
    When it names `astryx`, it ends with
    ``If `astryx` is not found, run `<install step>` first.``, where the
    step installs the CLI for the computer with the package manager and folder
    of the global copy that wrote it, without a version; any other copy keeps
    the step the file records, or names npm's when it records none.
  - The computer-level text is one file, `.agents/skills/astryx/SKILL.md` in
    the home folder, which most agent tools read. The computer-level agent
    files table below names each other folder it reaches: a folder link to its
    folder with a relative target, a junction on Windows, or a managed copy
    where a link cannot be made or the tool skips links. A refresh rewrites the
    one file; the links follow it. It is installed with the global copy: on the
    global copy's first run, and on the first run after the global copy's
    installed release changes, as when its user upgrades it, the global copy
    writes or refreshes it in the background, so no command waits for it or
    prints anything about it, and a package's install scripts never write it.
  - `astryx init --user` writes or refreshes it in the foreground, in any
    folder (FR9). `astryx init --user --remove-agents` removes the file, every
    link the CLI made, and every managed copy, and records that the
    computer-level text is not wanted. The global copy honors that choice, and
    writes nothing, until `astryx init --user` runs again.
  - The settings file is `astryx/settings.json` in the per-user configuration
    directory (FR7): `computerAgentText.install`, `true` or `false`, and
    `computerAgentText.links`, the links the CLI made, so removal removes
    exactly those. A missing file means install. No environment variable or
    option changes it.
  - The file and each managed copy record, inside their managed markers, a hash
    of their text. A file whose text no longer matches its recorded hash, or
    that records none, was edited by a person and is never overwritten or
    removed; a file without the markers is never changed; no write follows a
    link in a file's place; and nothing the CLI did not create at a table
    folder is replaced. `init --user` names each such path as kept and why, and
    `doctor` reports it, and any link whose skill folder is missing.
  - Every project starter a release ships scaffolds, installs, and builds with
    that release, and a check MUST prove it for every starter before the
    release ships. A scaffold pins every Astryx package to the release that
    made it and declares the CLI, so the project's own copy answers from then
    on (FR2).

- **FR9 — Every copy hands a project's run to the release that answers there.**
  Every copy of the CLI, whether installed in the project, installed for the
  computer, fetched by a package runner, or carried by a programmatic host, that
  starts a run in a folder belonging to a project MUST hand the run to the
  release FR2 names when it is not that release itself: to the project's own CLI
  when the project installs one, whatever its version, and to the matched
  release when that CLI cannot start. A project with no CLI of its own is
  answered by the copy that started the run, with no hand-off. This holds
  whatever release the copy is and whatever version the command line asked for.
  Outside a project, every copy answers itself (FR3).
  - A copy hands the run off before it loads anything the project provides
    (FR2). It does not hand off when it is itself the release FR2 names, or
    when the door that started it declined the project's CLI (FR2).
  - A command that acts on the computer rather than the folder it runs in,
    `astryx init --user` (FR8) and `astryx docs global` with its pages, the
    docs of global mode itself, is never handed to a project's release: it is
    answered as outside a project wherever it runs, so those docs read the same
    inside a project whose release predates them, and its standard-error line
    says it answered for the computer.
  - `astryx --help` carries one line, and the manifest (FR4) a `globalMode`
    field with `docs` and `summary`, that say what a run may do beyond its
    command, the hand-off, the daily check (FR6), and the agent skill (FR8),
    and point to `astryx docs global` (`spec:AST-017` FR14).
  - A run is handed off at most once. The copy a run is handed to makes the
    same choice and finds itself, so a run never returns to a copy it has
    left.
  - The copy the run is handed to receives what it would receive if started
    directly in that folder: the same arguments, working folder, and standard
    input, output, and error, with nothing added to its environment, options,
    or configuration (FR1). The run ends with that copy's exit status, or the
    signal that ended it. A termination or hangup signal sent to the copy that
    started the run reaches the copy it handed the run to. A SIGINT that
    reaches only the starting copy is forwarded if the handed-off CLI is still
    running 5 seconds later, so an interrupt the whole process group got (a
    terminal's Ctrl-C) reaches a CLI that stops within that time exactly once.
    On Windows the starting copy forwards no interrupt.
  - When the project's own CLI cannot be started, the matched release answers
    (FR2). When the matched release cannot be obtained, the copy that started
    the run answers, announced (FR2).
  - In text mode, a run handed to the project's own CLI prints exactly one
    line on standard error, naming the version of the project's CLI that
    answered and the version of the copy the run started in. A run handed to
    any other release prints exactly one line too: the FR5 line, which the
    release that answers prints, or, for a release that predates it, the copy
    that handed the run over. A machine-readable run prints no such line; its
    `meta.answeredBy` names the release that answered (FR5) when that release
    carries the field.

- **FR10 — A finished command tells its caller about a newer release.** After
  a command finishes with exit status 0, in text mode, the copy that started
  the run prints each notice below that applies on standard error, each at most
  once in any 24 hours. Each notice is two lines, the first naming what is
  newer and the second the exact command that upgrades it:
  `A new release of Astryx is available: <current> → <newest>` and
  `To upgrade, run: <command>`. When the newest release declares a Node range
  the computer's Node does not satisfy, the second line reads
  `To upgrade, install Node <range> (this computer runs Node <version>), then run: <command>`.
  - Outside a project, when the global copy answered and is older than the
    newest release the check found (FR6): the command is that of the package
    manager whose global install holds the global copy, read from where it
    lives: `npm i -g @astryxdesign/cli@latest`,
    `pnpm add -g @astryxdesign/cli@latest`,
    `yarn global add @astryxdesign/cli@latest`,
    `bun add -g @astryxdesign/cli@latest`, or
    `volta install @astryxdesign/cli@latest`, and npm's when none is recognized.
    A copy npm installed under a prefix that is not one of npm's defaults
    (Node's own prefix, `/usr/local`, `/usr`, or `%APPDATA%\npm` on Windows) is
    upgraded into that prefix:
    `npm i -g --prefix <prefix> @astryxdesign/cli@latest`, with `~` for the home
    folder. A global folder a package manager's settings move, such as Bun's
    `BUN_INSTALL` or Yarn's `global-folder`, counts as global (the global copy,
    above), and its plain command reinstalls there, since the package manager
    reads the same settings.
  - Inside a project, when the release that answers it is older than the newest
    release the check found: the command installs `@astryxdesign/core` and
    `@astryxdesign/cli`, so a project that installed only Core gets its own CLI
    too, at the newest release with the project's own package manager, then runs
    `astryx upgrade --from <current> --apply` with the command name FR5 picks
    for that release, as `<install command>, then <upgrade command>`. For this
    notice, the project is the one `spec:AST-040` FR9 defines, as in FR2's
    hint: both commands run in that project's folder, with that project's
    release as `<current>`.
  - In any folder, when the first `astryx` command on the search path is an
    Astryx CLI release that predates the hand-off, so it answers every run
    started through it with its own release: the first line reads
    `The astryx command on this computer runs CLI <version>, which answers every folder itself.`
    and the command upgrades it with the package manager that installed it.
    This notice needs no check.
  - No notice prints in a machine-readable run, after a command that fails,
    or when `CI` or `NO_UPDATE_NOTIFIER` turns the check off (FR6). A notice
    prints whether or not standard error is a terminal. Prerelease and canary
    versions are never reported as behind. No notice changes a command's
    output or exit status.
  - The time each notice last printed is kept in the per-user state file
    (FR7), for the global copy, per project, and for the old command; a time
    that cannot be recorded keeps the notice from printing, and a run handed
    to a release that also prints notices prints no second one.
  - `doctor` reports each: outside a project, the global copy's release beside
    the newest with the same command; in a project, the project's release
    beside the newest with the same commands; and, in every folder, an
    `astryx` command that predates the hand-off.
- **FR11 — Global and project copies meet by these rules.** Every case below
  follows FR2, FR3, FR6, FR9, FR10, and FR12; the table names who answers, what
  the run prints on standard error in text mode, and the test that proves the
  row. A contributor adding a door, an install layout, or a platform adds a row
  and its test. A copy the CLI cannot change, such as a release that predates
  the hand-off, is reported, never worked around. The cases that depend on an
  operating system's own file system run in the test suite for their path rules
  and, on that system, only in the cross-platform smoke workflow, which a
  maintainer starts by hand.
  - `doctor` lists every `astryx` command found on the search path, in order,
    and warns when the first one is not the Astryx CLI or is a release that
    predates the hand-off, naming the command that replaces it.
  - A run that installs a release holds a lock in the per-user cache that
    names its holder and computer, and renews it every 10 seconds while the
    package manager works. A lock whose holder on this computer no longer
    runs is taken over at once; a lock from another computer is taken over
    once a waiting run has seen it go unrenewed for 60 seconds.
  - Paths are compared without regard to letter case on platforms whose file
    systems ignore it, and a project is found from the physical folder, so a
    link to a project folder answers as the folder does.

- **FR12 — Integrations installed for the computer apply outside projects, and
  only there.** A **computer-level integration** is an integration package, one
  that ships exactly one root `astryx.integration.*` manifest, installed in the
  same install root as the CLI installed for the computer: the folder whose
  `node_modules` holds that CLI package, such as a package manager's global
  folder beside a global copy, or the package set a tool installs together and
  runs the CLI from, such as a door's runtime holding the CLI, Core, and an
  integration. When that root has a `package.json`, the packages it declares are
  read; otherwise every package directly in its `node_modules`, scoped ones
  included. A package manager that installs each global package in a folder of
  its own, as pnpm 11 and later do, has every such folder read, provided one of
  them installs that CLI. The CLI and Core packages are never integrations of
  it. A package runner's temporary install and the per-user release cache are
  not install roots. A door needs no host entry input for them (FR1).
  - Outside a project, the copy that answers loads the computer-level
    integrations installed beside it as a project loads its own: their
    components, templates, docs, themes, codemods, discover sources, and
    `cliCommand` (FR5) apply, with the same validation and the same provider
    identity rules. One whose declared peer range for `@astryxdesign/core` or
    `@astryxdesign/cli` excludes the answering release is skipped.
  - Inside a project, only the project's own integrations load: configured,
    installed, or being authored there. A computer-level integration adds no
    component, template, doc, theme, codemod, discover source, or command name
    there, because a printed import or command would name a package the project
    does not install. The only use of them inside a project is a listing:
    `discover` and `doctor` load the manifest of each one the project does not
    install, and nothing it contributes, to list it as available. `discover`
    lists each computer-level integration the project does not install, whose
    peer range admits the release that answers there and whose manifest loads,
    among the packages the project could add, with source
    `installed for this computer` and the project's install command. Those are
    the integrations beside the copy that answers when it was installed outside
    the project, otherwise beside the first `astryx` on the search path that is
    installed for the computer. The command name a door passes still applies
    (FR5).
  - When a project installs the same integration, by package name, the
    project's copy is the only one that loads, inside the project and in any
    folder whose project it is. Outside a project, a folder that loads an
    integration itself, such as that integration's own source, uses its own
    copy.
  - `doctor` outside a project lists each computer-level integration it uses and
    each the folder loads its own copy of, and warns about each it skips or
    cannot load, naming why; inside a project, it lists the ones `discover`
    lists as available, with the project's install command.

### Computer-level agent files

| Folder in the home folder                                                 | Reached by | When                                                  | Agent tool               |
| ------------------------------------------------------------------------- | ---------- | ----------------------------------------------------- | ------------------------ |
| `.agents/skills/astryx`                                                   | the file   | always                                                | most agent tools         |
| `.claude/skills/astryx`                                                   | link       | always                                                | Claude Code              |
| `.kiro/skills/astryx`                                                     | link       | when `.kiro` exists                                   | Kiro                     |
| `.codeium/windsurf/skills/astryx`                                         | link       | when `.codeium/windsurf` exists                       | Windsurf                 |
| `.letta/skills/astryx`                                                    | link       | when `.letta` exists                                  | Letta                    |
| `Library/Developer/Xcode/CodingAssistant/ClaudeAgentConfig/skills/astryx` | link       | when `Library/Developer/Xcode/CodingAssistant` exists | Xcode's coding assistant |
| `.config/agents/skills/astryx`                                            | link       | when `.config/agents/skills` exists                   | Kimi                     |
| `.continue/skills/astryx`                                                 | copy       | when `.continue` exists                               | Continue                 |

The file is a regular file and a skill whose frontmatter is strict YAML and
whose `name` is its folder's name. Each link is a link to the folder, never to
the file, since some tools drop a linked skill file, and its target is
relative, so it survives a moved or synced home folder. A tool that reads the
shared folder and its own lists the skill once. Continue's scanner skips links,
so it gets the one managed copy. The CLI never writes a folder another tool
manages, such as Codex's or Muse's own skill stores, never edits an agent
tool's configuration, and writes no always-on instructions file. A tool that
reads no skill folder, such as Aider, gets nothing; a person who uses an agent
with another skills folder links it to `.agents/skills/astryx` themselves.

### Who answers when global and project copies meet

| Case                                                                                                                         | Who answers                                                                                                                  | What prints (text mode)                                                                                                                                                                                                                                         | Test                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| G1 Global copy newer than the project's own CLI, which matches its Core                                                      | The project's own CLI                                                                                                        | `answered by this project's CLI <p>, handed over from CLI <g>`                                                                                                                                                                                                  | `global-local.test.mjs › G1`                                                                          |
| G2 Global copy older than the project's own CLI                                                                              | The project's own CLI                                                                                                        | The same hand-off line                                                                                                                                                                                                                                          | `› G2`                                                                                                |
| G3 The project's CLI differs from its Core                                                                                   | The project's own CLI (DEC-10)                                                                                               | The hand-off line; `doctor` warns and names the align command                                                                                                                                                                                                   | `› G3`                                                                                                |
| G4 Core only, no CLI                                                                                                         | The copy that started the run                                                                                                | FR2's daily hint when it is not the Core's release; `copy` is `starting`; nothing installed                                                                                                                                                                     | `› G4`                                                                                                |
| G5 Fresh clone: lockfile, nothing installed                                                                                  | The copy that started the run                                                                                                | FR2's daily hint naming the Core the lockfile records; nothing written                                                                                                                                                                                          | `› G5`                                                                                                |
| G6 Lockfile and installed Core disagree, in a project whose own CLI cannot start                                             | The release equal to the installed Core                                                                                      | The matched line                                                                                                                                                                                                                                                | `› G6`                                                                                                |
| G7 Workspace member with its own Core under a root CLI                                                                       | The root CLI, as for any member (DEC-10)                                                                                     | The hand-off line                                                                                                                                                                                                                                               | `› G7`                                                                                                |
| G8 Folder inside another project, such as a nested app or a cloned repository                                                | The enclosing project's release (the released read reach; answering for the folder itself waits for a minor)                 | As for the enclosing project; from a folder whose `package.json` is not that project's (`spec:AST-040` FR9), advice says to run from the project's folder. A folder FR9 does not reach, such as a cloned repository with its own `.git`, gets no project advice | `› G8`                                                                                                |
| G9 Outside a project                                                                                                         | Every copy answers itself, the global copy included                                                                          | `answered by CLI <v> with Core <v>, outside a project`                                                                                                                                                                                                          | `› G9`                                                                                                |
| G10 A version typed on a package runner                                                                                      | Outside a project: exactly that release; in a project: the project's release                                                 | The outside or hand-off line                                                                                                                                                                                                                                    | `› G10`                                                                                               |
| G11 A global copy that predates the hand-off, in a project                                                                   | That old copy, which this record cannot change                                                                               | Nothing from that copy; FR10's reminder from any newer copy, and `doctor`, name `npm i -g @astryxdesign/cli@latest`                                                                                                                                             | `› G11`                                                                                               |
| G12 Two global installs, such as npm and pnpm                                                                                | The first on the search path, which answers itself                                                                           | As for that case; `doctor` lists both                                                                                                                                                                                                                           | `› G12`                                                                                               |
| G13 An `astryx` earlier on the search path that is not the Astryx CLI                                                        | That other program                                                                                                           | `init --user` and `doctor` warn                                                                                                                                                                                                                                 | `› G13`                                                                                               |
| G14 A Node version manager switches Node, so each Node has its own global copy                                               | That Node's own global copy                                                                                                  | As for that case                                                                                                                                                                                                                                                | `› G14`                                                                                               |
| G15 A project whose package manager is pinned through a package manager shim                                                 | As for that project                                                                                                          | As for that project; releases install in the cache folder, never the project                                                                                                                                                                                    | `› G15`                                                                                               |
| G16 Global copy installed with administrator rights, run by a person                                                         | As for that case; nothing is written to the install folder                                                                   | As for that case                                                                                                                                                                                                                                                | `› G16`                                                                                               |
| G17 The per-user cache cannot be written                                                                                     | Outside a project and in a project with only Core: the global copy; in a project whose own CLI cannot start: the global copy | For the last, FR2's warning line naming the cache folder; `copy` is `fallback`                                                                                                                                                                                  | `› G17`                                                                                               |
| G18 Home unset, or cache and configuration folders set by environment                                                        | Unchanged; an absolute folder setting is used, a relative one is ignored                                                     | As for that case                                                                                                                                                                                                                                                | `› G18`                                                                                               |
| G19 Continuous integration (`CI` set) with a fresh home each run                                                             | As for that case; no update check                                                                                            | No notice                                                                                                                                                                                                                                                       | `› G19`                                                                                               |
| G20 A container whose home folder is read-only                                                                               | As for G17; the computer-level text is not written                                                                           | As for G17                                                                                                                                                                                                                                                      | `› G20`                                                                                               |
| G21 A cache shared by several people or computers                                                                            | One install per release at a time; another computer's lock is taken over once it goes unrenewed for 60 seconds               | As for that case                                                                                                                                                                                                                                                | `› G21`                                                                                               |
| G22 The project's release is older than the newest                                                                           | The project's release                                                                                                        | FR10's project notice after the command, once a day per project                                                                                                                                                                                                 | `› G22`                                                                                               |
| G23 The newest release needs a newer Node                                                                                    | The global copy                                                                                                              | FR10's notice, naming the Node first; `doctor` the same                                                                                                                                                                                                         | `› G23`                                                                                               |
| G24 A link to a project folder                                                                                               | As for the folder it links to                                                                                                | As for that folder                                                                                                                                                                                                                                              | `› G24`                                                                                               |
| G25 A file system that ignores letter case                                                                                   | As for the folder, whatever case was typed                                                                                   | As for that folder                                                                                                                                                                                                                                              | `› G25` (path rules); the file system itself: the cross-platform smoke workflow only (macOS, Windows) |
| G26 Windows paths and installs                                                                                               | The same rules; releases install through `npm.cmd` with the time limit                                                       | As for that case                                                                                                                                                                                                                                                | `› G26` (path rules); Windows itself: the cross-platform smoke workflow only                          |
| G27 A package script, which puts the project's own commands first                                                            | The project's own CLI, whatever its version                                                                                  | As for that case                                                                                                                                                                                                                                                | `› G27`                                                                                               |
| G28 A Yarn Plug'n'Play project, whose own CLI Astryx cannot see                                                              | The copy that started the run                                                                                                | FR2's daily hint with Yarn's command                                                                                                                                                                                                                            | `› G28`                                                                                               |
| G29 A package runner that reuses the global install                                                                          | As the global copy                                                                                                           | As for that case                                                                                                                                                                                                                                                | `› G29`                                                                                               |
| G30 `astryx init --user` inside a project                                                                                    | The starting copy, for the computer                                                                                          | `answered by CLI <v> with Core <v>, for this computer`                                                                                                                                                                                                          | `› G30`                                                                                               |
| G31 A cached release a project whose own CLI cannot start needs is damaged or removed                                        | The release, installed again                                                                                                 | As for that case; when it cannot be installed, FR2's warning line and the starting copy                                                                                                                                                                         | `› G31`                                                                                               |
| G32 A workspace whose own CLI package sits beside its own Core package, such as the Astryx repository                        | The workspace's own CLI                                                                                                      | As for that case                                                                                                                                                                                                                                                | `› G32`                                                                                               |
| G33 The global copy is older than the newest release                                                                         | The global copy                                                                                                              | FR10's notice after the command, naming the package manager that installed it, once a day                                                                                                                                                                       | `› G33`                                                                                               |
| G34 `NO_UPDATE_NOTIFIER` or `CI` set                                                                                         | As for that case; no update check                                                                                            | No notice                                                                                                                                                                                                                                                       | `› G34`                                                                                               |
| G35 Outside a project, with an integration installed beside the global copy                                                  | The global copy, with that integration loaded                                                                                | As for that case                                                                                                                                                                                                                                                | `› G35`                                                                                               |
| G36 Inside a project that does not install an integration installed for the computer                                         | The project's release, without it                                                                                            | As for that case; `discover` and `doctor` list it as available with the project's install command                                                                                                                                                               | `› G36`                                                                                               |
| G37 A project that installs the same integration as the computer                                                             | The project's release, with the project's copy only                                                                          | As for that case                                                                                                                                                                                                                                                | `› G37`                                                                                               |
| G38 An integration installed for the computer whose peer range excludes the answering release                                | The global copy, without it                                                                                                  | As for that case; `doctor` warns                                                                                                                                                                                                                                | `› G38`                                                                                               |
| G39 A door's package set: the CLI and an integration installed together in one root                                          | That copy, with the integration loaded outside a project                                                                     | As for that case                                                                                                                                                                                                                                                | `› G39`                                                                                               |
| G40 pnpm global folders: one shared folder, or a folder per package                                                          | The global copy, with the integrations in every such folder loaded outside a project                                         | As for that case                                                                                                                                                                                                                                                | `› G40`                                                                                               |
| G41 Outside a project, in an integration's own source folder                                                                 | That copy, with the folder's own copy of the integration                                                                     | As for that case; `doctor` names the computer's copy as not used, without a warning                                                                                                                                                                             | `› G41`                                                                                               |
| G42 Inside a project, an integration installed for the computer that the project's release excludes, or that fails to load   | The project's release                                                                                                        | As for that case; neither `discover` nor `doctor` offers it                                                                                                                                                                                                     | `› G42`                                                                                               |
| G43 Inside a project with only Core that a door's package set answers                                                        | That copy                                                                                                                    | `copy` is `starting`; its integrations are offered as available                                                                                                                                                                                                 | `› G43`                                                                                               |
| G44 A global copy npm installed under its own prefix, such as `npm i -g --prefix ~/.local`                                   | The global copy                                                                                                              | As for that case; the notice and `doctor` upgrade into that prefix, and integrations installed there apply                                                                                                                                                      | `› G44`                                                                                               |
| G45 The computer-level agent text on the global copy's first run                                                             | The global copy                                                                                                              | As for that case; one file, Claude Code's folder linked to it, a folder the CLI did not create kept and named by `doctor`, and `--remove-agents` removing the file and the link                                                                                 | `› G45`                                                                                               |
| G46 `astryx docs global` inside a project whose release predates it                                                          | The starting copy, for the computer                                                                                          | `astryx: answered by CLI <version> with Core <version>, for this computer`                                                                                                                                                                                      | `› G46`                                                                                               |
| G47 A project whose own CLI is newer than its Core, online or offline                                                        | The project's own CLI; nothing is fetched                                                                                    | The hand-off line; `copy` is `project`                                                                                                                                                                                                                          | `› G47`                                                                                               |
| G48 Offline, a project whose own CLI cannot start                                                                            | The starting copy                                                                                                            | FR2's warning line, once; `copy` is `fallback`                                                                                                                                                                                                                  | `› G48`                                                                                               |
| G49 Offline, a release a project whose own CLI cannot start needs failed to install; run again from the same or another copy | The starting copy                                                                                                            | FR2's warning line, saying when the install was last tried; no install starts for 2 minutes, then 10 after a second failure; a success forgets it                                                                                                               | `› G49`                                                                                               |
| G50 A global copy in a Bun global folder moved with `BUN_INSTALL`; an app in a folder that ends in `install/global`          | The global copy while `BUN_INSTALL` names the folder; the app's own CLI for the app                                          | `bun add -g` reinstalls there; the app is never global                                                                                                                                                                                                          | `› G50`                                                                                               |
| G51 A global copy in a Yarn 1 global folder named by `global-folder`; an app made with `yarn add` alone                      | The global copy while Yarn's settings name the folder; the app's own CLI for the app                                         | `yarn global add` reinstalls there; the app runs no update check and writes no agent text                                                                                                                                                                       | `› G51`                                                                                               |
| G52 The global copy with no Core beside it and none cached (not on Windows)                                                  | The global copy                                                                                                              | A detached step installs its Core into the cache after a run (never in CI or on Windows); offline, the failure waits out the backoff                                                                                                                            | `› G52`                                                                                               |
| G53 pnpm's global virtual store: a project's own CLI kept in the store's `links` folder                                      | The project's own CLI, not a global copy; a copy a pnpm global folder links to is global                                     | The project run starts no update check and writes no agent text                                                                                                                                                                                                 | `› G53`                                                                                               |
| G54 A folder more than five levels deep in a project with its own CLI                                                        | The project's own CLI                                                                                                        | The hand-off line; no hint                                                                                                                                                                                                                                      | `› G54`                                                                                               |
| G55 A `--json` run in a fresh clone while the global copy's Core step runs                                                   | The global copy                                                                                                              | Returns at once with clean JSON; the step starts as the run ends                                                                                                                                                                                                | `› G55`                                                                                               |
| G56 An open `search` outside a project before the release's Core is cached                                                   | The global copy                                                                                                              | Gets the Core as `component` does; when it cannot, `meta.partial` names the skipped domains and the reason, with one standard-error line                                                                                                                        | `› G56`                                                                                               |
| G57 A folder more than four levels deep in a project with only Core                                                          | The copy that started the run                                                                                                | Reads the project's Core, never the carried one; `meta.answeredBy.core` names it                                                                                                                                                                                | `› G57`                                                                                               |
| G58 An interrupt sent to the copy that started a handed-off run alone, or to its whole process group                         | The project's own CLI                                                                                                        | Alone: forwarded once after 5 seconds; group: received once, not forwarded to a CLI that stopped in time; the run ends with that CLI's exit status or signal                                                                                                    | `› G58`                                                                                               |

### Platform support

- Supported feature/engine floor: every operating system, shell, and package
  manager the CLI supports, including the workspaces and install layouts of
  npm, pnpm, Yarn (Plug'n'Play included), and Bun, and the package runner each
  provides.
- Unsupported behavior: a door that cannot obtain the release FR2 names fails
  before any write; a global copy that cannot reach the registry answers as
  always, and prints no notice (FR6). In a Yarn Plug'n'Play project, a
  copy cannot see the project's own CLI without running the project's
  loader, which FR2 forbids before the hand-off, so the release equal to the
  project's Core answers from the per-user cache instead; it is the same
  release whenever the project's CLI matches its Core.
- Browser evidence: not applicable; the contract is CLI output, exit status,
  and file changes.

## Current-state impact

- A CLI installed for the computer answers in every folder, inside projects that
  install their own copy too, and pairs its templates, docs, and agent text with
  the project's Core. A project whose CLI and Core are on different releases
  answers with the CLI's templates and docs and the Core's components. A package
  runner runs a CLI package installed for the computer in place of fetching one,
  at whatever release it was installed, and that copy never updates. A version
  requested on a package runner's command line answers inside a project, and in
  a package with no Astryx inside a project, a package runner fetches the newest
  CLI instead of running the project's. A project with Core and no CLI, and a
  fresh clone with nothing installed, answer with whatever CLI started the run,
  or fail. Outside a project, the commands that need Core fail, hints name the
  CLI package without a version, refusals use several error codes, nothing names
  the release that answered, and no check runs a command outside a project.
  Printed command names come from the package manager alone; many hints, errors,
  `doctor` fixes, docs, and the setup reminder print a fixed name instead; an
  integration has no way to name the command its users run; the computer-level
  agent text is written only when a person runs `astryx init --user`; no run
  tells anyone that a copy or a project is behind; `doctor` does not list the
  `astryx` commands on the search path; and an integration installed for the
  computer applies nowhere. Each of these departs from FR1–FR12.
- The CLI provides FR2–FR9 through the doors that run the CLI package directly.
  The parts that need the programmatic host entry arrive with it: FR1's host
  entry, its inputs, and its one-call rule; FR2's clause for a door that
  declines the project's CLI; FR3's integrations a host approves; the door name
  in FR5's picker; and
  `architecture:cli-surface` INV30. The official list FR8 ships is
  `spec:AST-051` FR11's. The project starters FR8 ships arrive with the template
  kind that ships them.
- Follow-up, next minor release: `invalid_cli_command`, a malformed
  `cliCommand` (FR5), becomes a validate warning, which
  `integration check --strict` fails on. This release reports it as a note
  outside the issues, since `--strict` fails on every warning and a new failure
  code joins only in a minor (`architecture:cli-surface` INV35).
- Follow-up, next minor release, breaking: the release equal to the project's
  Core answers even when the project's own CLI is another release, and answers
  a project with only Core instead of the copy that started the run (DEC-10).
- `architecture:cli-surface` records the release-choice stage before dispatch
  (FR2, FR9), the per-user writes outside a project root in INV10 (FR2, FR7,
  FR8), the run-level standard-error lines in INV12 (FR2, FR5, FR10), the
  computer-level integrations beside INV14's autolinking (FR12),
  `outsideProject` in INV7 (FR4), `ERR_PROJECT_REQUIRED` and
  `ERR_VERSIONS_UNAVAILABLE` in INV3 (FR2, FR4), `meta.answeredBy` in INV2
  (FR5), the picker's command name in INV22's hints (FR5), and the
  computer-level text in INV13's single rendered source (FR8). The host entry's
  inputs (FR1, FR2) are recorded there with the host entry.
- No record lists the integration manifest's fields. `cliCommand` (FR5) is an
  integration-level field, which INV24 allows, and the integration authoring
  reference documents it beside the other fields: its accepted values, its
  place in the picker's order, and what happens when integrations disagree
  (`spec:AST-017` FR14).
- `architecture:cli-surface` INV30 keeps how a host's package sets are
  matched, enumerated, and recorded; which release answers a hosted run, the
  host entry's inputs, and the standard-error lines of a hosted run are FR1,
  FR2, and FR5's.
- `spec:AST-047` FR7 and `spec:AST-048`'s platform support take the command
  name they print from FR5, and `spec:AST-051` FR6 admits a door's sources
  (FR1).
- `contributing:cli-conventions` lists the `outsideProject` declaration in its
  command doc fields and its checklist.
- Consumer docs (`cli`) describe the doors, which release answers a folder,
  what commands do outside a project, the per-user release cache, the update
  check and its notices, and how the computer-level text is installed and
  turned off.
- The response fields this record adds are additive (`spec:AST-017` FR13). A
  new refusal, a moved error code, or a changed exit status outside a project
  is classified under `spec:AST-017` before it ships.

This specification change alters no runtime behavior or published package and
needs no Changeset.

## Verification

| Contract | Verification                                                                                                                                                                                                                  | Representative states                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Door conformance: every command example, run through each door; host entry tests                                                                                                                                              | a project on the current minor and one on the previous minor; an empty folder; text and JSON; a second call in one process; a door source beside project and integration sources                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | A door's exit status, output, or file changes differ beyond FR5's command names and the FR5 and FR6 lines, a door's input reaches the CLI any way but the host entry, a second call in one process runs, or a door's source is called out of order or named as an integration's                                                                                                                                                                                                                                                    |
| FR2      | Release check: every page template scaffolded through a door into a project on the previous release, then typechecked; hand-off probes                                                                                        | a project with its own CLI; a project whose CLI and Core differ, both ways; a project with Core only; a workspace member with its own Core under a root CLI; a fresh clone with a lockfile and with only a declared range; an upgrade with a project CLI older than its Core; a declined project CLI, with its release and with it unavailable (the starting copy answers, announced, naming the reason); an unavailable release                                                                                                                                                                                                                                                    | A template fails where the matched release passes, a release other than the one equal to the project's Core answers, project configuration runs in another copy, or another release answers in place of an unavailable one                                                                                                                                                                                                                                                                                                         |
| FR3      | Empty-folder run of every command example                                                                                                                                                                                     | each command that needs Core; `doctor`, `swizzle`, and `upgrade`; a folder with no `package.json`; a home folder; a copy with no Core                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | A command that needs Core fails beside a carried Core, a project check reads it, or output gives a project step                                                                                                                                                                                                                                                                                                                                                                                                                    |
| FR4      | Declaration check over every command doc, plus the empty-folder run compared with each declaration                                                                                                                            | `same`, `refuse`, and `own`; a command group; a command without a value; a released refusal code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | A command lacks a value, a `refuse` writes or uses an unlisted code, or a command's behavior differs from its value                                                                                                                                                                                                                                                                                                                                                                                                                |
| FR5      | Printed-command check: each command the CLI prints or writes, run from the same folder through the door that printed it; a picker check over every surface that prints a command; a check of shipped text; result-field tests | each door; `project`, `matched`, and `carried`; no declaration, one integration's command, two that agree, two that disagree, and a malformed one; hints, errors, `doctor` fixes, help, docs moves, agent text, and the setup reminder; text and JSON                                                                                                                                                                                                                                                                                                                                                                                                                               | A printed command reaches another door or release, a surface prints a name the picker did not choose, the picker's order changes, a disagreement prints either integration's command or `doctor` stays silent, a malformed declaration withdraws its integration, shipped text writes a CLI command any way but bare or as a `{@command}` token, JSON carries an unrendered token, JSON carries a picked name, `meta.answeredBy` is missing or wrong, or the line prints for the project's own CLI                                                                                              |
| FR6      | Update check tests                                                                                                                                                                                                            | first run; within and after 24 hours; `CI` set to yes and to `false`; `NO_UPDATE_NOTIFIER` set; an unreachable registry; ten runs at once; a requested version; a package runner's copy; inside a project                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | A check runs in the first day, twice in a day, with `CI` or `NO_UPDATE_NOTIFIER` set, or for a fetched copy; a command waits for it or its output changes; or a check installs or switches a release                                                                                                                                                                                                                                                                                                                               |
| FR7      | File-system comparison before and after each command in the empty-folder run and in projects                                                                                                                                  | each command that writes; absolute, traversal, and symlinked paths; a home folder                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | A file lands outside the named places, or a refusal writes first                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| FR8      | Release build, drift checks, a starter build in CI, and computer-level text tests                                                                                                                                             | the official list; the agent text for each door; each starter; the global copy's first run and a switch; `--agent` lists; an opt-out; a file a person edited; a file without markers; a link in a file's place; a strict YAML parse of every skill file                                                                                                                                                                                                                                                                                                                                                                                                                             | A committed copy drifts, a global asset is fetched at run time, the computer-level text names a version, a starter fails to scaffold, install, or build, the global copy writes after an opt-out or into an edited file, a command waits for the text, or a skill's frontmatter does not parse                                                                                                                                                                                                                                     |
| FR9      | Hand-off probes: every command example run through each copy in each folder kind, compared with the release FR2 names run directly in that folder                                                                             | the CLI package installed for the computer on an older and on a newer release than the project's CLI, run directly and run by a package runner in place of a fetch; a package runner's copy, unversioned and with a version requested inside a project, for a read and for `upgrade`; a project with Core but no CLI, through a package runner that fetches the newest release; a package with no Astryx inside a project, which the package runner takes for the project; a project CLI that predates the hand-off and one that hands off itself; a declined project CLI; a project CLI that cannot start; a non-zero exit; piped standard input; outside a project; text and JSON | A release other than the one FR2 names answers in a project, outside the declined case; a project CLI that differs from its Core answers; a requested version answers inside a project; a run is handed off twice or returns to a copy it left; arguments, folder, streams, or exit status differ from a direct run of the project's CLI; outside a project, a release answers that FR3 and FR6 do not name; or the line is missing, prints twice, prints in JSON mode, or prints for a run the project's own CLI answers directly |
| FR10     | Notice tests                                                                                                                                                                                                                  | the global copy behind, for npm, pnpm, Yarn, Bun, and Volta installs; a newest release that needs a newer Node; a project behind, with and without its own CLI; an old `astryx` first on the search path; two runs in one day and a run the next day; a failed command; JSON mode; `CI`; `NO_UPDATE_NOTIFIER`; standard error not a terminal; a prerelease                                                                                                                                                                                                                                                                                                                          | A notice prints in JSON mode, after a failure, twice in a day, with `CI` or `NO_UPDATE_NOTIFIER` set, or before the command's output; it names another package manager's command; or `doctor` omits it                                                                                                                                                                                                                                                                                                                             |
| FR11     | One test per row of the global and project table, with packed CLI copies in each install layout                                                                                                                               | every row of the table                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | A row's answer, line, or test differs from the table, or a row has no test                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| FR12     | Computer-level integration tests and table rows G35–G43                                                                                                                                                                       | npm and pnpm global folders; a door's package set; a runner's temporary install; the release cache; outside a project; inside one with and without the same integration; an incompatible peer range; a manifest that fails                                                                                                                                                                                                                                                                                                                                                                                                                                                          | A computer-level integration contributes inside a project, is missing outside one, loads beside the project's copy, loads with an excluded peer range, or `discover` and `doctor` omit it                                                                                                                                                                                                                                                                                                                                          |

## Decision log

### DEC-1 — One release answers each folder

**Reference:** `spec:AST-081/DEC-1`
**Decider:** `josephfarina`, `2026-10-19`

Two releases in one run write code that fails without an error: one release's
templates and component docs use props another release's Core does not have,
and the same command can import a theme in one release and copy its source in
another, both exiting 0. So one release answers everything in a project: the
project's own CLI, or without one the release equal to its Core (DEC-10). When
that release cannot be obtained, as offline or behind a registry without it,
the copy that started the run answers, as before global mode, and says so on
one line and in `meta.answeredBy`. Failing those runs would
break commands that worked before global mode, and the warning keeps the
mismatch visible; falling back while the matched release can be obtained would
bring the silent mix back, so it never happens.

Rejected: the newest release answering everywhere, which writes code an older
project's Core rejects; failing every run whose matched release cannot be
obtained, which breaks commands that worked before global mode; and falling
back to any other release, or without saying so.

### DEC-2 — Outside a project, answer as a new project would

**Reference:** `spec:AST-081/DEC-2`
**Decider:** `josephfarina`, `2026-10-19`

An agent with no project files still needs Core's components and docs, and a
new project on the release it runs is what it would create. The carried Core
serves only commands that do not judge or change a project, so an empty folder
never passes a project check or receives a component copy whose packages
nobody installed.

Rejected: refusing every command that needs Core outside a project, which
leaves an agent without project files unable to learn Core.

### DEC-3 — Each command declares same, refuse, or own

**Reference:** `spec:AST-081/DEC-3`
**Decider:** `josephfarina`, `2026-10-19`

A declaration in each command doc, published in the manifest, tells a door and
an agent before a run whether a command works outside a project, and lets a
check prove the behavior matches. One shared refusal code lets an agent branch
on "open or start a project first" without learning each command's failure.

Rejected: a project, global, or both scope, which cannot express a command that
does a different job outside a project or has modes of each kind.

### DEC-4 — Who answered is data, and printed commands return through their door

**Reference:** `spec:AST-081/DEC-4`
**Decider:** `josephfarina`, `2026-10-19`

An agent comparing two reads needs to know whether one release gave both; a
field in `meta` tells it without changing an existing field or the envelope. A
printed command that names another door or an unpinned package starts a
different release than the one that printed it.

Rejected: a new top-level envelope field, which changes the envelope every
consumer reads.

### DEC-5 — No door changes a project's versions

**Reference:** `spec:AST-081/DEC-5`
**Decider:** `josephfarina`, `2026-10-19`

A project's versions belong to its owner, so no door installs into a project;
FR10 tells the owner instead, with the exact commands, and `doctor` reports
what is newer.

Rejected: updating a project, or installing into one, from any door.

### DEC-6 — Anything global ships inside the release

**Reference:** `spec:AST-081/DEC-6`
**Decider:** `josephfarina`, `2026-10-19`

A list, a starter, or an agent text fetched at run time can disagree with the
release that reads it, and fails offline. Generated when the release is built,
it is exactly as current as the CLI that uses it.

Rejected: fetching global assets at run time.

### DEC-7 — Doors start the CLI through one entry, and their sources are their own

**Reference:** `spec:AST-081/DEC-7`
**Decider:** `josephfarina`, `2026-10-19`

A door's inputs cannot travel by flag or environment variable, and a call takes
over the process it runs in, so every door uses one documented programmatic
entry, once per process. A catalog a door serves is the door's source, named as
the door's and read after the integrations' sources, so a reader can tell which
catalog listed a package.

Rejected: replacing an integration's discover source under that integration's
name, which reports the door's catalog as the integration's own.

### DEC-8 — One picker names every printed command, and an integration's command comes first

**Reference:** `spec:AST-081/DEC-8`
**Decider:** `josephfarina`, `2026-10-19`

An integration that gives its users a command of its own knows how they reach
the CLI better than a guess from the package manager, and a door's name covers
only the runs that start in that door, so the picker tries the integration's
command, then the door's name, then the package manager's. When integrations
disagree, neither is right for every user of the project, so the picker uses
the package manager's name and `doctor` says why. Text written with a bare
`astryx` that takes the picked name when shown lets one doc serve every door
and stay correct when the door changes, and JSON keeps the one spelling a
program can rely on.

Rejected: settling a disagreement by integration order, which lets load order
choose the command a project's users are told to run.

### DEC-9 — Every copy hands off, so any install route reaches the project's release

**Reference:** `spec:AST-081/DEC-9`
**Decider:** `josephfarina`, `2026-10-19`

The CLI package itself is the common install, for the computer or through a
package runner, and a copy installed for the computer is also what a package
runner runs in place of a fetch. If only a separate launcher package handed a
project's run on, those routes would answer with their own release and bring
back the mix DEC-1 rejects, so the CLI package itself is the global install and
needs no launcher. A hand-off built into every copy makes the
project's pinned release answer wherever a run starts, a typed version
included, and leaves a run outside a project with the copy its caller chose.
One standard-error line keeps a hand-off visible without changing
machine-readable output.

Rejected: global mode only through a separate launcher package, which leaves
the common install routes answering with their own release inside projects and
gives people two packages to choose between.

### DEC-10 — Until the next minor release, a project is answered as it was before global mode

**Reference:** `spec:AST-081/DEC-10`
**Decider:** `josephfarina`, `2026-10-20`

A project's CLI and Core drift apart after a partial upgrade, and in a
workspace an app can install an older Core than the root's CLI. The CLI's
release writes the templates, docs, and agent text, and the Core's release
supplies the components, so a mismatched pair can write code that does not
compile. The Core is what the project's code runs against, so the release equal
to it should answer. But a project that installs its own CLI has always been
answered by that CLI, and one with only Core by whichever copy the person
started; having another release answer either changes what an in-range install
does, which `spec:AST-017` FR12 does not allow under a nonbreaking label. So in
this release the project's own CLI answers whatever its version, a project with
no CLI of its own is answered by the copy that started the run with a daily
hint, `doctor` warns about either mismatch and names the command that aligns
them, and the matched release answers only a project whose own CLI cannot
start. The release equal to the Core answering over a differing project CLI,
and answering a project with only Core, are a breaking change for the next
minor release.

Compatibility with released routes: a project's own CLI run directly, as with
`npx astryx` or a package script, answers as before, and so does a project with
no CLI of its own. The one route that changes is a copy other than the
project's own CLI started inside a project that installs its own CLI of another
release: a global install, `npx @astryxdesign/cli@<version>`, or another package
runner's fetch. Before global mode it answered with its own release and the
project's Core; now it hands the run to the project's CLI (FR9), so it answers
exactly what the project's own command does, and a command newer than the
project's CLI is not reachable that way inside the project. The released docs
name the project's own command inside a project and install the new CLI before
`astryx upgrade`, so no documented route changes, and the JSON shape is the
same; the commands that act on the computer (FR9) still answer from the copy
that started the run.

Rejected for this release: the release equal to the Core answering over the
project's own CLI, or answering a project with only Core, which changes what an
existing install answers in a patch release; and leaving a mismatch silent.

### DEC-11 — The global copy answers with its own installed release

**Reference:** `spec:AST-081/DEC-11`
**Decider:** `josephfarina`, `2026-10-19`

What answers outside a project is what the person installed, so the version
they see is the version the package manager reports, and an upgrade is a step
they take with the tool that installed it (DEC-16). The per-user cache holds
only the releases a project's run needs.

Rejected: answering from releases kept in the per-user cache and switching to
the newest in the background, which changes what answers without the
person's step; and replacing the installed copy, which writes outside FR7's
places and can need administrator rights.

### DEC-12 — The computer-level agent text is one skill file, linked where agents look

**Reference:** `spec:AST-081/DEC-12`
**Decider:** `josephfarina`, `2026-10-19`

A skill loads only when an agent uses Astryx, so it costs nothing in the
sessions that never touch it. One file in the shared skills folder reaches
most agent tools; linking its folder into each folder a tool reads alone
reaches the rest with the same bytes, so a refresh is one write and no copy
drifts. The only copy is for a tool whose scanner skips links.

Rejected: a copy of the file per agent tool, which multiplies writes and lets
copies drift; letting a person pick agents, which adds an option for what
existence of a tool's folder already says; and one always-on instruction file
per agent, which loads in every session and reaches fewer agents.

### DEC-13 — The global copy installs the computer-level text itself, in the background

**Reference:** `spec:AST-081/DEC-13`
**Decider:** `josephfarina`, `2026-10-19`

The text has to be present wherever the CLI is installed for the computer, and
stay matched to the release that answers. A package's install scripts do not run
reliably: several package managers block them by default, and any install can
skip them, so the text would be present on some computers and missing on others
with nothing to say why. The global copy runs on every computer it is installed
on, so it writes the text on its first run and on the first run after it is
upgraded, from a detached background step that no command waits for. Choices
live in a documented settings file, so a person's opt-out survives every update,
and the links the CLI made are recorded there, so removal is exact. A hash in
the markers tells a person's edit from an older rendering, so an edit is never
lost.

Rejected: a package install script, which several package managers block by
default; writing in the foreground of every command, which slows commands and
makes output depend on the computer; and an environment variable or option to
turn it off, which a person has to repeat everywhere and an agent cannot see.

### DEC-14 — Notices name the upgrade, at most once a day, even without a terminal

**Reference:** `spec:AST-081/DEC-14`
**Decider:** `josephfarina`, `2026-10-19`

A copy or a project that falls behind writes code against a release nobody
chose, and nothing else tells its owner. A notice that names both versions
and the exact command turns that into one step. It prints after the command,
so the command's own output comes first; at most once a day per notice, so a
person or an agent running many commands sees it once; never in
machine-readable output, so programs read the same fields; and only after a
check, so a fresh home stays quiet about a newer release. A command that
predates the hand-off answers every folder with its own release, so its
notice needs no check. Unlike `gh`, which prints only to a terminal, a notice
prints when standard error is not one, because agents, the CLI's main
callers, run it without a terminal and would otherwise never learn of a newer
release; `CI` and `NO_UPDATE_NOTIFIER` still silence it.

Rejected: a line on every run, which agents learn to ignore; printing only to
a terminal, which no agent sees; staying silent, which leaves copies and
projects behind indefinitely; and updating a project automatically, which
changes a project's versions without its owner.

### DEC-15 — Every meeting of global and project copies is a table row with a test

**Reference:** `spec:AST-081/DEC-15`
**Decider:** `josephfarina`, `2026-10-19`

Global and project copies meet in many ways, from version managers to links
and shared caches, and each one is easy to get wrong in only one of them. One
table, one row per case, and one test per row lets a contributor see who
answers before changing the hand-off, and makes a missing case visible. A
copy that predates these rules cannot be changed, so it is reported and its
replacement named, never worked around.

Rejected: describing the cases only in prose, which hides the case nobody
listed.

### DEC-16 — Notify, never self-update, as `gh` and the Vercel CLI do

**Reference:** `spec:AST-081/DEC-16`
**Decider:** `josephfarina`, `2026-10-19`

The global copy follows the standard that command-line tools installed through
a package manager share: `gh` checks its newest release once a day and, after
a command, prints `A new release of gh is available` with the upgrade command;
the Vercel CLI and the update-notifier package check once a day in a detached
process, name the install command of the package manager that installed the
tool, and stay silent in continuous integration and under
`NO_UPDATE_NOTIFIER`. Following it means the release that answers is always
the one the person installed, upgrades happen through the package manager's
own installation and permissions, and a person who knows one of these tools
knows this one.

Rejected: installing newer releases into the per-user cache and switching to
them in the background, which kept the CLI current without a step but changed
what answers without the person choosing it; the standard was chosen instead.

### DEC-17 — Integrations installed for the computer apply outside projects only

**Reference:** `spec:AST-081/DEC-17`
**Decider:** `josephfarina`, `2026-10-19`

Integrations change what the CLI answers, so a person who installs one beside
the CLI installed for the computer, or a tool that installs one with the CLI,
expects it to apply wherever no project decides: an agent outside any project
then learns that integration's components and docs too. Inside a project, the
project decides: its output must match what it installs, so a component, a
template, or an import from a package it does not install would be code that
fails to build. Listing the integration as available, with the project's
install command, keeps it findable without changing the project's answers.
Reading the install root itself, instead of a host input, gives every install
route the same rule.

Rejected: computer-level integrations applying inside projects too, which
makes a project's answers depend on the computer and prints imports of
packages the project does not install; and requiring a host entry input for
them, which leaves a global install without them.

## Open questions

None.
