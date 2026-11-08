---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-050
authority: current
archive_reason: null
superseded_by: null
approved_by: josephfarina
approved_at: 2026-10-05
phase: accepted
owners: [josephfarina]
affects_architecture: [architecture:cli-surface]
affects_families: []
affects_contributing: []
affects_consumer_docs: [theme, authoring, cli]
---

# App themes system spec

## Intent

A builder, a person or a coding agent, wants an app that uses one or more themes:
a first-party theme, a theme from an installed integration package, or a theme
the app makes itself. They want to find a theme, add it, choose the default,
let users switch between themes at runtime, and know that the setup is correct.

A theme that an app copies as source stops receiving its owner's updates, loses
its package identity, and must be built again by the app. It also loses any
stylesheet its package loads beside it, such as its fonts, so it can render in
fallback fonts with no error. An app that uses several themes needs one place
that lists them, one way to switch among them, and a check that proves the
setup.

This record owns how an app finds, declares, imports, switches, and checks its
themes through the CLI. The rule is the same for every theme: an app uses a
theme by importing its built form and passing it to `Theme`, and customizes it
by extending that theme. Copying a theme's source is an explicit author fork.
`theme add` reaches that rule in two lifecycle stages (FR12): an opt-in import
ships beside its deprecated copy default, and the import becomes the default in
a minor an owner schedules. `architecture:theme-application` already supports
several built themes on one page, because built theme CSS is scoped to the
theme's name and switching changes only the active identity. `spec:AST-017` owns
compatibility, lifecycle, and response fields, `spec:AST-042` owns command
admission, `spec:AST-040` owns writes to consumer files, and
`architecture:cli-surface` INV19 and INV24 own how integration items are
described.

## Non-goals

- A Core component for switching themes, and saving a user's choice. The
  generated module gives an app everything a switcher needs; a Core component is
  a separate component decision.
- Loading theme stylesheets lazily.
- Finding themes that are not installed.
- Changing how a theme is authored, compiled, or applied at runtime.
- Merging or renaming the first-party theme packages.
- Making theme source CLI-owned. The generated module only imports and lists the
  app's themes; every theme's source stays with its author.
- How a font stylesheet delivers its fonts. Font files in the package and a font
  service both satisfy FR7; the package chooses.
- Reading the 0.6 theme catalog (`themes/manifest.json`). Packages describe
  themes with typed descriptors, no root holds a catalog file
  (`architecture:cli-surface` INV24), and no theme command reads one.
- Equivalent internal implementations remain valid when they satisfy this
  contract. The generated module's exact text, the discovery code, and the
  receipt field order are implementation.

## Requirements

- **FR1 — Importing a theme adds it to the app.**
  `theme add <slug> --import [--package <package>]` MUST make the theme part of
  the app by adding it to the app's theme record (FR3) and regenerating the
  app's theme module (FR2). It MUST NOT copy theme source into the project and
  MUST NOT edit application code. Importing a theme that is already added
  regenerates the module and reports no change. Importing a slug that is already
  added from a different owner switches it to the new owner and reports that
  change. `--import` with a target path or `--overwrite`, which belong to the
  copy (FR12), MUST fail before writing.
- **FR2 — One generated theme module.** The CLI MUST keep one module that
  imports each added theme's built module and stylesheet. It exports `themes`,
  every added theme keyed by its slug, and `defaultThemeSlug`, the default slug;
  a TypeScript module also exports the type `ThemeSlug`, the union of the added
  slugs. These exports are the module's public contract, and its theme record
  (FR3) is not one of them. The module carries a generated marker, and the CLI
  regenerates the whole module instead of editing it (`spec:AST-040/FR5`). The
  module is TypeScript when the project uses TypeScript and JavaScript
  otherwise. It has one fixed home: `astryx-themes.ts` or `astryx-themes.js` in
  the project's `src` folder when the project has one, and otherwise in the
  project root. A module that already exists stays where it is, even when the
  project gains or loses a `src` folder. No configuration chooses the home
  (`spec:AST-017/FR19`). When the home holds a file the CLI did not generate, or
  more than one generated theme module exists, the command MUST fail before
  writing and name the files.
- **FR3 — The module is the app's theme record.** The theme module records each
  added theme's slug and owner, a package name or the project's local themes
  root, and the default slug, in a form the CLI reads without running the
  module. The importing `theme add`, `theme remove`, and `theme use` read that
  record, change it, and regenerate the module. The default MUST be one of the
  added themes. No `package.json` field, configuration key, or environment
  variable records or selects the app's themes (`spec:AST-017/FR14`,
  `spec:AST-017/FR19`). In a project with a theme module, a command that reads
  the app's default theme reads the module's record; in a project with no theme
  module, an existing `astryx.theme` field keeps its released meaning. The CLI
  does not read `ASTRYX_THEME` (DEC-7).
- **FR4 — The set and the default are managed by command.**
  `theme remove <slug>` removes a theme from the app, and `theme use <slug>`
  makes an added theme the default. Removing the default theme MUST fail and
  name `theme use`; `theme use` on a theme that is not added MUST fail and name
  the import command. Each command regenerates the module (FR2).
- **FR5 — One receipt describes the app's themes.** The importing `theme add`,
  `theme remove`, and `theme use` MUST return the `theme.app` response: every
  added theme with its slug, owner, and the module and stylesheet it imports;
  the default slug; the module path; and the change the command made. Text
  output shows the same facts. The first import in a project also shows the
  one-time wiring: import `themes` and `defaultThemeSlug` from the module and
  pass `themes[defaultThemeSlug]` to `Theme`.
- **FR6 — Ejecting is the author fork.**
  `theme eject <slug> [path] [--overwrite] [--package <package>]` MUST copy a
  theme's complete source directory into the project exactly as the copying
  `theme add` does (FR12), with the same path safety, overwrite rule, and
  rollback. It MUST also copy the theme's same-stem descriptor
  (`architecture:cli-surface` INV24), so the ejected theme is a discoverable
  local theme (FR8). The copy MUST NOT describe itself as maintained by the
  theme's original owner. It returns the copy fields of the `theme.add` response
  as the `theme.eject` response, with the descriptor in its file list.
- **FR7 — A package exposes each theme to import.** A package makes a theme
  importable by exporting its built module at `./themes/<slug>` and its
  stylesheet at `./themes/<slug>.css`. A package that owns exactly one theme MAY
  instead export `./built` and `./theme.css`. When a theme needs fonts that are
  not system fonts, the package SHOULD export a font stylesheet at
  `./themes/<slug>.fonts.css`, or `./fonts.css` for a single theme. The font
  stylesheet owns loading its fonts: it may ship the font files with
  `@font-face` rules or import them from a font service. An import MUST fail,
  naming what is missing, when a theme has no resolvable built module and
  stylesheet; it never falls back to copying or to runtime source.
  `integration add theme` MUST write these exports, and `integration verify`
  MUST fail when an exported theme module, stylesheet, or font stylesheet does
  not resolve from the packed tarball, or when a theme exports both its built
  module and its stylesheet and either one does not match its source. The
  exported module matches its source when it is the module `theme build` writes
  from that source, or when it only loads the theme's own styles (DEC-10): each
  of its statements imports the theme's exported stylesheet or font stylesheet
  for its side effects, except one, which re-exports from the module
  `theme build` writes either everything or only its theme, under the theme's
  export name. A theme
  that exports only part of that pair, or none of it, stays packable when every
  path it exports resolves, and `integration verify` warns about what is missing
  or does not match.
- **FR8 — Local themes are added like package themes.** The project's local
  themes root is `src/themes`: the folder the copying `theme add` writes into
  and the folder `theme eject` copies into by default, also in a project with no
  `src` folder. A theme directory there, with the same shape as an integration
  theme (`architecture:cli-surface` INV19), is listed and imported like a
  package theme. Its built module and stylesheet are the files `theme build`
  writes beside its source, and its font stylesheet, when it has one, is
  `<slug>.fonts.css` beside them. An import MUST fail and name the build command
  when the built module or stylesheet is missing. When a local theme and a
  package theme share a slug, an import adds the local theme unless `--package`
  names the package, and `theme list` shows both with their owners. The copying
  `theme add` resolves bundled and package themes only, as released.
- **FR9 — The module imports built themes only.** The generated module MUST
  import built themes, their stylesheets, and their font stylesheets when the
  package exports one, never theme source for runtime style injection, so every
  added theme is present at first paint and a switch never waits for styles.
- **FR10 — Listing shows the app's themes.** `theme list` MUST mark each theme
  as added or not and as the default or not for the project, and name whether it
  is bundled, from a package, or local. These fields are additive, and local
  themes join the list as additional entries.
- **FR11 — Doctor proves the setup.** In a project with a theme module, doctor
  MUST check, and pass each check only on positive evidence:
  1. every added theme's owner is installed and its module and stylesheet
     resolve from the project;
  2. the theme module exists, carries the CLI's generated marker, and is exactly
     what the CLI generates from the record it carries;
  3. project source imports the theme module (a warning when this cannot be
     shown);
  4. no built theme module is imported without its stylesheet;
  5. every added local theme is built, and its outputs match its source;
  6. no added theme sets a private `--_*` variable directly
     (`architecture:theme-compilation` INV6);
  7. every added theme's `@astryxdesign/core` peer range accepts the installed
     Core;
  8. the default theme is one of the added themes;
  9. every font family an added theme names is a system font or is loaded by a
     font stylesheet the module imports (a warning that names the family when
     this cannot be shown, as when the stylesheet imports its fonts from a font
     service);
  10. no two added themes write different rules outside their own theme scope
      for the same selector, because every added stylesheet loads at once.

  Each failure names the exact command that fixes it.

- **FR12 — The copy default leaves through its lifecycle.** The copying
  `theme add`, its options, and its `theme.add` response are released
  contracts. `theme add` reaches FR1 through its `spec:AST-017` lifecycle:
  1. **The copy default is deprecated.** Without `--import`,
     `theme add <slug> [path] [--overwrite] [--package <package>]` copies the
     theme's source and returns `theme.add` as released. It emits at most one
     stderr warning per invocation, naming `theme eject` for a fork and
     `theme add --import` for using the theme, and its machine result
     carries the deprecation id and the replacement (`spec:AST-017/FR28`,
     `spec:AST-017/FR29`). Its exit status, canonical output, and the rest of
     its machine result are the released ones. `theme add --list` keeps its
     machine result at every stage, and its text names the commands of the
     current stage.
  2. **Cleanup lands in a declared minor.** When `main` declares a minor, a
     `[breaking]` Changeset describing the change (`spec:AST-017/FR31`) lets
     `theme add <slug>` import as FR1 states, with or without `--import`, and
     returns `theme.app`, and `theme add` accepts no target path or
     `--overwrite`, which stay on `theme eject`. That minor carries no other
     delta from this record (`spec:AST-017/FR39`).

  Existing projects migrate as follows (`spec:AST-017/FR8`):
  1. A script that copies with `theme add` runs `theme eject` with the same
     arguments; one that wants the app to use the theme runs
     `theme add --import`, which keeps its meaning after the cleanup. No codemod
     rewrites these calls, because the right replacement depends on which of the
     two the caller meant; the deprecation warning names both.
  2. A theme copied by `theme add` is app source. The CLI MUST NOT move, change,
     or delete it, and the app's imports of it keep working. The copy lacks the
     theme's descriptor, so `astryx upgrade` MUST supply a project codemod that
     writes the missing descriptor beside each such copy in the local themes
     root, marked as not maintained, which makes the copy a local theme (FR8).
     The codemod changes nothing else, and a second run changes nothing
     (`spec:AST-040`).
  3. Until that codemod runs, a folder in the local themes root that holds a
     theme source without a descriptor MUST NOT fail a theme command or doctor.
     `theme list` and doctor name it as an unmigrated copy, with the upgrade
     command, and it is not listed or imported as a theme. For the local themes
     root only, this replaces the rule that such a folder fails discovery
     (`architecture:cli-surface` INV19).
  4. A project with no theme module keeps working as it is. Doctor reports that
     the CLI manages none of its themes and names the import command; the FR11
     checks apply once a theme module exists.
  5. A caller that sets `ASTRYX_THEME` chooses the default with `theme use`, or
     with `astryx.theme` in a project with no theme module.

- **FR13 — Every builder-facing surface agrees.** The theme guide, the
  integration guide, the generated agent docs, and `init`'s next steps MUST
  describe the same workflow: import themes, wire the module once, switch
  through the exported themes, extend a theme to customize it, and eject only to
  fork. They name `theme add --import` while the copy default is deprecated and
  `theme add` once it is removed. No surface teaches copying as the way to use a
  theme.
- **FR14 — Search finds the themes the list shows.** `astryx search` MUST index
  each theme `theme list` shows as a `theme` result, which `--type theme`
  selects. A theme result MUST carry its slug as `name`, its display name, its
  description, the package that ships it, and the `theme add` command for the
  CLI's FR12 stage: `theme add <slug>` in a CLI without `--import`,
  `theme add --import <slug>` while the copy default is deprecated, and
  `theme add <slug>` after the cleanup (FR13). A theme's slug and display name
  are its names, and its description is prose (DEC-9): a query word the theme
  shares only through its description ranks it as a description mention, never
  as a name or keyword match, so that word alone never ranks the theme above a
  result that matches it by name, title, or keyword. Searching themes MUST NOT
  need `@astryxdesign/core`, because listing them does not, so an open search
  outside an app includes them (DEC-8). Help, the manifest, and the API
  reference MUST list the `theme` domain and its result fields.

### Platform support

- Supported floor: every runtime and package manager the CLI supports, and every
  toolchain that imports CSS from a JavaScript module.
- Unsupported behavior: a toolchain that cannot import CSS from a module loads
  each added theme's stylesheet itself; the module still exports the themes, and
  doctor check 4 names the stylesheets to load.
- Browser evidence: a consumer app built for production imports a first-party,
  an integration, and a local theme, renders the default on first paint, and
  switches among all three.

## Current-state impact

- `theme add` gains `--import`; its copy default and `theme.add` response are
  deprecated and leave `theme add` in a scheduled minor (FR12); `theme eject`,
  `theme remove`, and `theme use` join the `theme` command; `theme list` gains
  its app fields and lists local themes;
- `astryx search` finds the themes `theme list` shows, as the `theme` domain,
  and ranks a word found only in a theme's description as prose (FR14);
- `architecture:cli-surface` INV19: integration themes are importable packages,
  and editable source is an explicit eject;
- `integration add theme` writes theme exports, and `integration verify` checks
  them;
- doctor's theme check is FR11 in a project with a theme module, and the FR12
  report in a project without one;
- `astryx upgrade` carries the codemod that gives copies their descriptors
  (FR12);
- the CLI stops reading `ASTRYX_THEME` (DEC-7);
- the theme guide, the integration guide, agent docs, and `init` next steps
  describe the FR13 workflow.

`architecture:theme-application` and `architecture:theme-compilation` are
unchanged.

## Verification

| Contract | Verification                                                                                        | Representative states                                                                                                                                                                                                                                                                                            | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1, FR2 | Theme command tests and a real consumer                                                             | first import; repeat import; a slug imported again from another owner; the module's exports; `--import` with a target path or `--overwrite`; hand-written file at the module home; no TypeScript; no `src` folder; `src` added later                                                                             | Source is copied, app code changes, a repeat import changes files, a second owner's import keeps the old owner, `--import` with a copy option writes anything, an export is missing or renamed, the theme record is exported, a user file is replaced, or an existing module moves                                                                                                                                                                                                     |
| FR3, FR4 | Theme record tests                                                                                  | import, remove, use; removing the default; using a theme not added; a hand-edited module; two modules; no module with `astryx.theme`; `ASTRYX_THEME` set                                                                                                                                                         | The default is not an added theme, a hand-edited or second module is overwritten, theme state is written outside the module, `astryx.theme` stops resolving, or `ASTRYX_THEME` changes which theme a command reads                                                                                                                                                                                                                                                                     |
| FR5      | Response type and text field tests                                                                  | every command; first import                                                                                                                                                                                                                                                                                      | An import emits `theme.add`, a field has no text projection, or the first import shows no wiring                                                                                                                                                                                                                                                                                                                                                                                       |
| FR6      | Eject tests against the copy fixtures                                                               | bundled, integration, and nested-file themes; eject then list                                                                                                                                                                                                                                                    | Copied source bytes or copy receipt fields differ from the copying `theme add`, the descriptor is missing, or the ejected theme is not listed as local                                                                                                                                                                                                                                                                                                                                 |
| FR7, FR8 | Integration verify and real provider-to-consumer tests                                              | multi-theme package; single-theme package; missing export; font stylesheet missing from the tarball; stale build; partial export set; a local theme sharing a package theme's slug; local themes in a project with no `src` folder; a module that loads its own styles; a theme whose name differs from its slug | A theme without a resolvable built module is imported, verify passes a stale complete pair, an unresolved export, or a module that adds more than its own stylesheet imports and a re-export of the built module, verify fails a partial export set whose exports resolve or a module that only loads its own styles, a shared slug imports the package theme without `--package`, the copying `theme add` resolves a local theme, or local themes are looked for outside `src/themes` |
| FR9      | Generated module tests                                                                              | package and local themes                                                                                                                                                                                                                                                                                         | The module imports source                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| FR10     | List tests                                                                                          | added, default, bundled, package, local                                                                                                                                                                                                                                                                          | A listed theme lacks its app fields                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| FR11     | Doctor tests, one planted fault per check                                                           | each of the ten faults; a correct app                                                                                                                                                                                                                                                                            | A check passes on its fault, or passes without positive evidence                                                                                                                                                                                                                                                                                                                                                                                                                       |
| FR12     | Lifecycle tests against the latest stable CLI, migration tests on a project it made, and docs tests | plain `theme add`; the cleanup build; a copy made by the latest stable `theme add`; the upgrade codemod run twice; no theme module                                                                                                                                                                               | Before the cleanup, plain `theme add` stops copying, changes its exit status, stdout, or `theme.add` fields, omits the deprecation id, or warns more than once; after it, plain `theme add` copies; a theme command or doctor fails on an unmigrated copy; the codemod changes more than the descriptor or changes anything on its second run; a copy is moved or deleted; or doctor fails a project with no theme module                                                              |
| FR13     | Docs and agent-docs tests                                                                           | theme guide, integration guide, agent block, init next steps                                                                                                                                                                                                                                                     | A surface teaches copying as the way to use a theme, or names a different import command than the current lifecycle stage                                                                                                                                                                                                                                                                                                                                                              |
| FR14     | Search tests and CLI runs                                                                           | bundled and integration themes; `--type theme` and an open search outside an app; a word only in a theme's description, such as `focus`; an exact slug or display name; a CLI with and without `--import`; help and the manifest                                                                                 | A theme `theme list` shows is missing from search, a theme result lacks a field or names another command than its FR12 stage, a word only in a theme's description ranks it as a name or keyword match or above a result matching that word by name, title, or keyword, a themes-only search needs Core, or help, the manifest, or the API reference omits the domain                                                                                                                  |

## Decision log

### DEC-1 — Consumers import; copying is an author fork

**Reference:** `spec:AST-050/DEC-1`
**Decider:** `josephfarina`, `2026-09-30`

A theme an app uses is a dependency, like a component library: it keeps its
owner's updates, its identity, and the stylesheets its package loads beside it.
An app customizes a theme by extending it. Copying is how a template starts a
page and how an author forks a theme, not how an app uses one. Consumer
`theme add` therefore imports, and source copying belongs to the explicit author
fork, `theme eject`.

Rejected: keeping `theme add` as a copy and adding a new verb for importing,
which leaves the obvious command doing the wrong thing for most builders.

### DEC-2 — The CLI owns one generated module and never edits app code

**Reference:** `spec:AST-050/DEC-2`
**Decider:** `josephfarina`, `2026-09-30`

An app wires one module once. After that, adding, removing, and choosing themes
changes only files the CLI generates, so no command needs proof that it may
change application source, and a switcher reads every added theme from one
export. The module has one fixed home that never moves, so the app's import
keeps working and nothing has to be set to find it.

Rejected: editing the app's root component on every import, which needs a
source transform for every framework.

Rejected: printing import lines only, which leaves the app to keep the list of
themes by hand.

Rejected: a configurable module path, which `spec:AST-017/FR19` admits only for
a case where the fixed home fails.

### DEC-3 — The generated module is the record

**Reference:** `spec:AST-050/DEC-3`
**Decider:** `josephfarina`, `2026-10-01`

The module already names every added theme, where it comes from, and the
default. A second record elsewhere would duplicate a value the CLI can read from
its own output, which `spec:AST-017/FR19` forbids, and would add a public field
that every app has to keep in step with the module.

Rejected: an `astryx.themes` field in `package.json`, which duplicates the
module as permanent public surface.

Rejected: a key in `astryx.config`, which released CLIs reject as unknown.

Rejected: detecting themes from application source, which cannot tell a theme
an app uses from one it only mentions.

### DEC-4 — Packages expose themes through their exports

**Reference:** `spec:AST-050/DEC-4`
**Decider:** `josephfarina`, `2026-09-30`

A fixed export path lets any app import a theme with any CLI version, or with no
CLI. It adds no descriptor field, so no released CLI meets an unknown field. The
single-theme form keeps the `./built` and `./theme.css` export names that built
theme packages already use, so an existing package can be imported without a
new release.

Rejected: import paths declared in the theme descriptor, which released CLIs
reject as an unknown field.

### DEC-5 — New subcommands under `theme`

**Reference:** `spec:AST-050/DEC-5`
**Decider:** `josephfarina`, `2026-09-30`

Each stays inside the `theme` command's job, managing an app's themes
(`spec:AST-042/FR4`):

- `theme remove` answers "stop using this theme". An option on `add` would give
  it a second job.
- `theme use` answers "start with this theme". An option on `add` could not set
  the default of a theme that is already added.
- `theme eject` answers "give me this theme's source to fork". It is the copy
  `theme add` makes while its copy default is deprecated, plus the descriptor a
  local theme needs (`spec:AST-042/FR6`); once the copy leaves `theme add`, an
  option on `add` would give it two opposite results.

None of them is eligible for the batch contract (`spec:AST-042/FR7`,
`spec:AST-053/FR11`), so each takes one selector:

- `theme remove <slug>` changes the app's themes: it fails E1 and E4.
- `theme use <slug>` changes the app's themes and picks the one default: it
  fails E1, E2, and E4.
- `theme eject <slug> [path]` writes files and takes a positional after the
  slug: it fails E1, E4, and E5.
- `theme add <slug>` changes the app's themes when it imports: it fails E1 and
  E4.

Each has one API function under `spec:AST-042/FR1`.

Rejected: one `theme set` command with flags for each action, which gives a
single command several jobs.

### DEC-6 — The import default arrives in two steps

**Reference:** `spec:AST-050/DEC-6`
**Decider:** `josephfarina`, `2026-10-05`

Every replacement ships first, in a compatible patch: `theme add --import`,
`theme eject`, `theme remove`, `theme use`, the generated module, the package
exports, and doctor, while the copy default keeps working with its warning. The
import default follows in a minor an owner schedules (`spec:AST-017/FR28`,
`spec:AST-017/FR47`), so every builder can reach the import path before it
becomes the default. The opt-in is an option on `theme add`, so the command
builders learn during the deprecation is the command that imports after it.

Rejected: switching the default in one release, which `spec:AST-017/FR48`
refuses while main targets a patch.

Rejected: opting in by the presence of a theme module, which changes what
`theme add` does without a visible control (`spec:AST-017/FR14`).

### DEC-7 — The CLI reads no theme environment variable

**Reference:** `spec:AST-050/DEC-7`
**Decider:** `josephfarina`, `2026-10-05`

`spec:AST-017/FR14` forbids the CLI from defining or reading any Astryx-owned
environment variable, so `ASTRYX_THEME` is not a supported way to choose a
theme, and the CLI does not read it in either step. An app's default theme lives
in its theme module's record (FR3), or in `astryx.theme` in a project with no
theme module.

Rejected: reading `ASTRYX_THEME` with a warning until the minor, which keeps
reading a variable `spec:AST-017/FR14` forbids.

Rejected: warning when `ASTRYX_THEME` is set, which reads the variable to warn.

### DEC-8 — Searching themes needs no Core

**Reference:** `spec:AST-050/DEC-8`
**Decider:** `josephfarina`, `2026-10-06`

`theme list` reads bundled themes without `@astryxdesign/core`, so a search of
themes does too, and an open search outside an app includes them. A builder who
has not set up an app yet can still find a theme by how it looks.

Rejected: requiring Core for every domain but docs, which fails a themes-only
search where `theme list` works.

### DEC-9 — A theme's description is prose

**Reference:** `spec:AST-050/DEC-9`
**Decider:** `cixzhang`, `2026-10-06`

A theme's description is a sentence written for a person choosing a look. Its
words describe a mood, so a word in it is a passing mention, ranked like any
other description, and not a label the theme's author chose for search. A
theme's names are its slug and its display name, and a theme declares no
keywords.

Rejected: reading every description word as a keyword, which ranks a theme first
for any word its description happens to use.

### DEC-10 — A theme module may load its own styles

**Reference:** `spec:AST-050/DEC-10`
**Decider:** `josephfarina`, `2026-10-20`

A package can make importing a theme's module the whole integration: the module
imports the theme's stylesheet and font stylesheet, then re-exports the built
theme, and consumers rely on that import to load the styles. `integration
verify` accepts that module when those imports and one re-export of the built
theme are its only statements. The re-export may give the built theme the
theme's export name, because `theme build` names the built module and its
export after the theme's own name, which can differ from the slug the package
exports it under. The re-exported module is still exactly what `theme build`
writes, and the stylesheet and font stylesheet stay separate exports, so the
generated module imports all three as before and a bundler loads each
stylesheet once.

Rejected: requiring the exported module to be the built module itself, which
makes such a package choose between passing verify and keeping its consumers'
imports working; and accepting any module that exports the theme, which lets
verify pass a module that no longer matches its source.

## Open questions

None.
