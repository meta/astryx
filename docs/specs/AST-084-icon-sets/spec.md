---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-084
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
affects_consumer_docs: [cli/experimental]
---

# Icon set integrations system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

An icon set is an experimental integration item: icon components a package
exports, plus one data file that says which icon draws each icon definition.
Astryx ships icon definitions, one typed doc file per thing an icon can stand
for (`close`, `delete`, `rocket`). A set registers its icons against them, and
may add definitions of its own. With a set installed:

- an agent or engineer finds an icon by meaning with
  `astryx experimental icon <words>` and gets the exact import line;
- a template copied into a project that opts in with `experimental.iconSet`
  uses the set's icons for the definitions the template declares; and
- a theme points the shared semantic icon names at the set's artwork.

The CLI encodes no icon library: the author, or the author's agent, picks each
icon, and the CLI verifies it, writes the files, and checks the set.

## Non-goals

- Choose a variant at render time; that belongs to the Icon component
  contract.
- Declare sizes in the data file: icon size is CSS, and the artwork scales
  with its box.
- Grow the shared `IconName` set: the built-in definitions are exactly its
  values.
- Make each icon its own discoverable item: the set is the item.
- Edit, redraw, or bundle artwork: every icon is a component the package
  exports.
- Equivalent internal implementations remain valid when they satisfy this
  contract.

## Requirements

### Experimental placement

- **FR0 — Every icon-set surface is experimental and isolated.** Under
  `spec:AST-017/FR21`–FR27:
  - the commands are `astryx experimental icon` and its subcommands, under the
    `experimental` command group; no stable command gains an icon-set
    subcommand or option value, and the one icon-set kind on a stable command
    is discover's `icon-set`, read only with the opt-in (FR17, DEC-8);
  - `astryx experimental` is a top-level command group admitted here under
    `spec:AST-042/FR4`. It answers one question: where does a CLI control live
    while it may still change in a patch release? No existing command can hold
    such controls, because `spec:AST-017/FR27` keeps experimental controls off
    every stable command and its output; extending `help` or any stable family
    would change that command. Its one job is to group experimental
    commands. It performs no operation itself, so `spec:AST-042/FR1` names no
    function for it; each command under it names its own. It has no result of
    its own: each command under it returns data, a typed JSON response that
    agents and tools act on, while the reasons behind experimental features
    are prose in their docs under `cli/experimental`;
  - configuration is `experimental.iconSet` in `astryx.config`, the project's
    opt-in, and `experimental.iconSets` in the integration manifest;
  - the guides and schemas live under `cli/experimental` (the guide, the
    `icon-set-files` reference of the descriptor, data file, and definition
    schemas, which the stable field reference never lists, and the
    `icon-definitions` namespace); the reference docs of the experimental
    commands and API functions live with every other command and function
    reference (`cli/api/functions/...` and the command docs), listed only in
    the `astryx docs cli` listing, the same exception this requirement makes
    for help; every one of these docs carries `stability: 'experimental'`, and
    API functions and authoring types carry `@experimental`; and
  - every change ships as an `[experimental]` patch Changeset. Promotion to
    stable needs the owner's approval and a `[feat]` Changeset
    (`spec:AST-017/FR23`).

  Without `experimental.iconSet`, help (apart from the marked `experimental`
  group line), `astryx manifest` (apart from that group: its command, and its
  `responseTypes` and `jsonSupported` entries), the `astryx docs cli`
  listings (apart from the marked `experimental` namespace and the
  experimental command and function references), `astryx template`, `astryx discover`, and Doctor,
  its `doctor integration` subcommands for an installed package included,
  give the output they give without this feature, whatever sets are
  installed, and so do `integration check` and `verify` for a package that
  declares no `experimental.iconSets`, with four differences. Two come
  from the manifest key `experimental`, which a CLI without this feature
  does not know. With a package that declares `experimental.iconSets` installed, that CLI
  warns about the key in Doctor's `integration-issues` check and in
  `doctor integration validate <package>`, and in text mode every command
  that prints the integration-issue nudge (`component`,
  `discover`, `search`, `template`, `theme list`, `theme add`, `theme remove`,
  `theme use`, `theme eject`, and `upgrade`) prints "Warning: <package> has 1
  integration issue(s)" to stderr; this CLI does neither. The other two
  apply to a package whose templates declare `icons`, with or without
  `experimental.iconSets`. The third is the `template_icon_undeclared` note
  (FR10): `integration check` lists it, marked `next`, and a CLI without
  this feature does not. The fourth is the `templateIcons` not-checked list
  (FR10): `integration check` lists each template import the check does not
  judge, and its not-checked count is higher by that number; a CLI without
  this feature has neither. The note and the list fail nothing under
  `--strict`.
  Discover refuses
  `--type icon-set` and ignores `icon-set` catalog items and their fields
  exactly as it does any unknown kind or field. With the opt-in, `icon-set`
  is a discover kind (FR17). `astryx search` never reads icon sets, with or
  without the opt-in, and returns no experimental doc. No stable doc names an
  experimental route, an icon set, or an icon definition, and a stable docs
  node's previous and next links skip experimental neighbors; the one stable
  addition is the field reference's `stability` field (FR18), which a search
  for "experimental" finds.

### What a set declares

- **FR1 — One manifest root.** The manifest MAY set `experimental.iconSets`,
  a relative directory. Each lower-kebab directory under it is one set, named
  by the directory; the manifest never lists sets or icons
  (`spec:AST-039/FR11`).
- **FR2 — One typed descriptor.** Each set directory holds `<name>.doc.mjs`, a
  default-exported `IconSetDoc` (`type: 'icon-set'`, `name` equal to the
  directory, `displayName`, `description`, `maintained`, and `license`, an
  SPDX expression for the artwork).
- **FR3 — One data file, read by every icon surface.** Each set directory
  holds `<name>.icons.json` (`schemaVersion: 1`):
  - `module`: the import specifier every export is read from, the package's
    name or one of its `exports` subpaths;
  - `icons`: each with a unique lower-kebab `id`, an `export`, at least one
    search word in `words`, optional `variants` (each a declared variant and
    the export that draws it, at most one export per variant),
    and optional `matches`, reviewed equivalents in other installed sets with
    a confidence of `exact`, `strong`, or `likely`;
  - `map`: icon definition name to icon `id`; one icon MAY draw several
    definitions;
  - optional `variants`, the lower-kebab variant names the set declares, and
    `default.variant`, the one each icon's own `export` draws. A variant is a
    named look the set supplies (for example outline or solid); size comes
    from CSS;
  - optional `source` (the upstream library and version), `exclude` (library
    exports that are not icons, FR13), `generated` (FR13), `adapter` (FR13),
    and `themeMap` (FR12).

  A data file that fails this shape, repeats an `id`, maps a name that is
  neither an Astryx definition nor one of the set's own, maps to a missing
  icon, or names a variant the set does not declare is invalid, and the set
  is withdrawn from every surface.

- **FR4 — Icon definitions are typed doc files in folders.** An
  `IconDefinitionDoc` (`type: 'icon-definition'`) has a camelCase `name`, a
  one-sentence `description`, `words`, and `builtIn: true` exactly for an
  `IconName`. Astryx ships one file per definition in the CLI's definitions
  folder; a set adds its own in `<set>/definitions/<name>.doc.mjs`. The doc
  compiler reads every file in a folder; there is no index. A set's own
  definition needs no change to Astryx and maps only within that set;
  proposing it for every set is a pull request that copies its file into the
  CLI's folder. When names collide, Astryx's wins. The experimental
  `icon-definitions` namespace lists Astryx's definitions and, in a project
  that sets `experimental.iconSet`, each installed set's own.
- **FR5 — The directory is the boundary.** Discovery reads the descriptor,
  data file, and definitions statically, never runs the icon module, and
  rejects a path that escapes the package (`spec:AST-039/FR5`, FR6).

### Finding and choosing

- **FR6 — `astryx experimental icon <words>` ranks icons by meaning.** It
  answers `icon.search`, each match with its `set`, `id`, `package`, `module`,
  `export`, `import` line, `words`, `definitions`, `variants`, `reason`, and
  `score`: 100 for a definition the set maps to the icon, 90 or 80 for an
  exact name or meaning match (the reading most of the searched icons use
  leads), 60 when the query starts one of its words, 40 for a partial match
  (three letters or more inside a word). A word's plural or singular is an
  exact match (`stars` for `star`); a word that only starts with the query
  (`start`) answers only when nothing matches a whole word, and a partial
  match only when nothing scores 60 or more. A query is scored as typed
  first; only when nothing answers it with a whole word are the words that
  only phrase it (`go`, `the`, `icon`) left out of a query of several words,
  so `go home` asks for `home` and `arrow up to line` still names
  `arrow-up-to-line`. An icon also answers to
  the name and words of every definition it draws. Equal scores are ordered by
  set order (FR8), so the project's set leads; then, within a set, an exact
  name match on the whole id, then on its plural or singular, before one on
  an id part, and an exact meaning
  match by its tag position; then by `id`. `--set` keeps one set and `--limit`
  caps the list; `--set` with `--all-icons` and no words lists every icon of
  that set (`icon.setIcons`), and `--definitions` lists every Astryx
  definition (`icon.definitions`), each with `templates`, the number of
  bundled templates whose `icons` name it (FR9). When a set is known (the
  one `--set` names, else the project's main set, else the only set of the
  icon-set package the command runs in), the answer names it as `set` and
  each definition has `mapped`, whether that set's `map` names it.
- **FR7 — One icon and the installed sets.** `<set>/<id>` answers
  `icon.detail` with every variant's import line; `--list` answers `icon.list`
  with each set's coverage of built-in, Astryx, and its own definitions, the
  project's icon-set state, and each withdrawn set. A set is named by its name
  or `<package>/<set>`; a name two packages ship needs the qualified form.
- **FR8 — The project's main set and backups.** `experimental.iconSet` names
  the project's main set (`"<set>"` or `"<package>/<set>"`), or lists the main
  set first and then backup sets in order (`["<main>", "<backup>", ...]`; a
  string is a one-entry list), and opts the project in. `astryx experimental
icon use <main> [--backup <set>]...` writes it: with no `--backup` it writes
  the string, and with backups the list, in the order given. Every set it
  names must be installed and named once; its receipt (`icon.use`) adds
  `backups`, the installed sets the list leaves out (`unlisted`), and the
  command that adds them (`next`). That command, and Doctor's, names every
  set one way: by its name when no other installed set has it, else as
  `<package>/<set>`. Within `astryx experimental icon`, a
  project without the key treats its only installed set as its set; with two
  or more installed and none chosen, `--list` and the refusal of a `use` with
  no set name the command `astryx experimental icon use <main> --backup
<set>`. `--list` adds the project's `order` and each set's `role` (`main`,
  `backup`, or none) and `rank`, and each backup's status. A name two
  installed packages ship names no set. Lookups put the main set first, then
  its backups in list order, then the integration load order. Only the main
  set's theme map feeds the theme (FR12).

### Templates and themes

- **FR9 — Templates declare definitions.** A template or block descriptor
  declares, in `icons`, the definition each imported icon draws (`{TrashIcon:
'delete'}`), keyed by the name a named import reads (`{Trash as TrashIcon}`
  is `Trash`) or by a default import's local name. In a project with a set
  (FR8, opted in), `astryx template` (printed or copied) rewrites each
  declared icon, and each icon another installed set ships, to the icon of
  the first set in the project's list that has one for it: the icon that
  names it in an `exact` or `strong` match, else the icon that set's `map`
  names for the definition. One icon never mixes sets, and the list order
  decides between two sets that both have it. When no set in the list has an
  icon for a declared definition, the template's import of that icon is
  removed and the file declares a local placeholder component once, above
  its first statement that is not an import: `MissingIcon`, or `MissingIcon2`
  and up when the file already uses that name (FR19). Each reference to the
  icon renders the placeholder, with a comment that names the definition
  (`MissingIcon /* missing icon: cut */`). The copied file imports nothing
  new and keeps no import that no set in the list has. Every reference uses the mapped export,
  under an alias when the name is taken; a mapped default import becomes the
  set's named import aliased to its local name. Nothing is guessed from names,
  and a `likely` match is only suggested. One key covers a name imported from
  two modules (outline and solid `TrashIcon`); each keeps its variant when its
  module belongs to an installed set and the chosen set's icon has that
  variant, and otherwise draws the chosen set's default look; a missing look
  never moves an icon to a backup. A mapped or placeholder icon's elements lose the
  library's sizing props (`size`, `strokeWidth`, `absoluteStrokeWidth`): size
  comes from CSS (FR14). Comments on a rewritten import line are kept.
- **FR10 — The template reports every icon.** The result, and the copy
  receipt, gain `icons`: the set state, the list `order` when the project
  lists backups, each icon `mapped` (source, target with the set used, the
  rule, the sizing props `dropped`, and `variant: {asked, used}` when the
  chosen set lacks the look), a `placeholder` (source, the placeholder's local name,
  its `definitions`, and `fixes`: `astryx experimental icon map <definition>
<icon> --set <main>` and `astryx experimental icon use <main> --backup
<set>`), or `kept` (with why, and a `likely` suggestion when one exists),
  and `sets`, each set the mapped icons come from with its license. With a
  set, every declared key is mapped, a placeholder, or kept: a key bound only
  by a namespace import, a type-only import, a re-export, or an import from
  an Astryx package or a set in the list, or by no import at all (`module`
  null), is kept with the reason, and so is an icon that draws no definition
  and has no match; a side-effect import binds nothing. Text output prints a
  line per placeholder that names the definition and both fixes. Printed
  source keeps the report on stderr. Without the opt-in there is no `icons`
  field and no rewrite. `integration check` notes each key a template's
  source never imports (`template_icon_not_imported`), never counted or
  failing, under `--strict` or `--next`. In a package whose templates declare
  `icons`, it notes each icon a template imports but does not declare
  (`template_icon_undeclared`): an import from a module some template in
  the package declares an icon from, which the template renders as a JSX
  element with no children and no icon-choosing prop (`<Scissors />`) or
  passes as a value (`icon={Scissors}`, `[Scissors]`, `{icon: Scissors}`).
  Any other import from that module, such as a type, a function the
  template calls, or a provider with children, is listed as not checked
  (not rendered as an icon), because a declared key makes `astryx template`
  swap it for an icon. An import from another package whose name ends in
  `Icon` matches by name only and is listed as not checked, and a generic
  renderer (a bare `Icon`, or one every use gives an icon prop) is listed as
  not checked. The note is marked `next` (`architecture:cli-surface` DEC-11):
  it fails `--strict --next`, and `--strict` does not fail on it. A package
  whose templates declare no `icons` gets no such note. Every icon a bundled Core template imports is
  declared.
- **FR11 — Search stays stable.** `astryx search` has no icon domain and no
  `--type icon`, and returns no experimental doc, with or without the opt-in.
  Icons join it only at promotion.
- **FR12 — The theme map.** A set exports the map `themeMap` names: one entry
  per built-in definition in `map`, each its icon's artwork, so a theme sets
  `icons: themeIcons`. Each entry is sized to the theme's icon box by CSS
  (`style` width and height `1em`) as well as by attributes, so an icon whose
  component writes its own size attributes still draws at the box's size.

### Authoring

- **FR13 — The CLI writes the set, one verified icon at a time.** Every
  icon command refuses, with `ERR_INVALID_OPTION` and before it writes a
  file, two options it would not both honor: a listing (`--list`,
  `--definitions`, `--all-icons`) with a query, another listing, or an
  option it ignores; a `<set>/<id>` query with `--set` or `--limit`;
  `add --all` with an export name, `--definition`, `--new-definition`,
  `--description`, `--words`, `--default`, or `--id`; `add --definition`
  with `--new-definition`; `add --description` or `--words` without
  `--new-definition`; `map --pairs` with a definition, an icon, or
  `--remove`, and `map --remove` with an icon; and `new-set --exclude`
  without `--from` or `--default-variant` without `--variants`. Every
  command reads modules statically, and its writes are all or nothing: when
  it fails, every file is as it was and the error has a stable code
  (`ERR_WRITE_FAILED` for a write that fails). It writes only the set's own
  files, the manifest root, and the set's root and manifest in an existing
  package.json `files` (architecture:cli-surface INV16); every other change
  the package needs, it names as the exact text to add:
  - `experimental icon new-set <name>` writes the descriptor, an empty data
    file, the generated module (`generated`) with its declaration file and an
    empty theme map, and the manifest root. `--adapter ./<path>#<export>`
    writes the data file's `adapter`; the file must exist in the package
    (`ERR_NOT_FOUND`), and a value of another form is `ERR_INVALID_ARGUMENT`.
    A set with icons takes another adapter only with `--from`
    (`ERR_INVALID_OPTION`). The first `--from` into a set with no icons
    creates them: its receipt has no `refreshed`, and its text says the set
    is created (or would be, in a dry run). `--from <module>` wraps every
    component the module exports, and every data export through the set's
    `adapter`, as `<Name>Icon` exports, filling `map` only where a definition's
    name is an icon's whole `id`, and lists those entries for review. For an
    unmapped definition it returns, never writes, up to three suggestions,
    in this order: an icon whose `id` is the definition's name spelled with or
    without hyphens or with a plural `s` (`light-bulb` for `lightbulb`,
    `languages` for `language`); an icon whose library gives it the
    definition's name as another name; icons whose `id` starts with the
    definition's name as written and whose other words are its words or
    only size, shape, or number it, most of its words first; an icon whose
    `id` is one of its words; an icon whose library gives it one of its
    words as another name; the other icons whose `id` starts with the
    definition's name (`delete-left`, `unlock-pattern`); then two-word ids
    whose first word is a one-word word exactly and whose second word only
    sizes, shapes, or numbers it (`grid-2x2`, `plus-circle`; never
    `card-sim` or `fast-forward`). For the words, a word that another
    Astryx definition also has as its name or a word (`store`, a word of
    `save` and of `shoppingBag`) comes after the words only this definition
    has. A plural
    joins only its own singular, never a longer id (`users` is not
    `user-plus`), and no other ending is taken off (`drafting` is not
    `draft`). Never an icon `map` already uses, one whose `id` is another
    definition's name, a negated form (`lock-open`, `bell-off`), or the
    opposite direction (`ellipsis-vertical` for `moreHorizontal`).
    A library whose export names end in look words (a style, a size, a
    weight: `XOutline24WGHT500Icon`), read from its trailing words that a few
    values fill on nearly every export and that are numbered or include a
    style word, never a direction word (`ArrowUp` and `ArrowDown` are two
    glyphs), gives one icon per glyph, named
    without them (`x`, `XIcon`), in the look the default variant names, else
    the library's usual default (`outline`, `regular`), else the middle of a
    numbered series; the receipt names the looks it found and how many
    exports draw the icons. Reading a module of a thousand exports or more,
    here, on a refresh, and in `add`, prints its progress on stderr in text
    mode, naming the module as given.
    Ids keep a dimension as one word (`Squares2X2Icon` is `squares-2x2`)
    and split a one-letter word from a digit (`CalendarX2` is
    `calendar-x-2`); a shared library prefix is left out of ids and names;
    an icon exported under several names is recorded once, its other names
    as words; `…Provider` and `…Context` components
    are never icons; and `--exclude` adds exports that are not icons to the
    data file's `exclude`, which every refresh honors. An icon whose id
    would start with a digit once the shared prefix comes off keeps the
    prefix (`fa0` is id `fa-0`, exported as `Fa0Icon`), and an id that
    starts with a digit with no prefix to keep is refused with
    `ERR_INVALID_ARGUMENT`. From an installed
    package it records `source` (the library and version), copies the
    library's license notices into the set, and takes the library's license
    for the descriptor; when the library ships none and the set and package
    have none, the receipt names the NOTICE file to add under
    `licenseNoticeMissing`, and nothing is written. Its receipt names, as the exact text to add, the
    entry change that makes the generated module public (an `export *` line
    for an entry file in the package, relative to it; for a package with no
    entry, `index.js`, `index.d.ts`, and their package.json `main`, `types`,
    and `exports`; for a built or CommonJS entry, the line for the source it
    is built from, never the built file), the `react` and optional
    `@types/react` and `@astryxdesign/cli` peers it does not declare, and a
    `typecheck` script running `integration check --strict` when it has
    none. `--variants` and `--default-variant` declare `variants` and
    `default`; `--display-name` and `--description` fill the descriptor.
    Without `--from`, over an existing set, those four options update it in
    place and leave its icons, `map`, and generated module as they are; a
    variant an icon has must stay declared, a set with icons keeps its
    default variant (in a library of looks the refusal names the `--from`
    run that moves it), and the receipt carries `updated`. A set whose
    icons' export names name no looks keeps its default variant on a
    refresh too, since its icons keep their exports; the refusal names the
    `add --variant <name> --from <module> --all --set <set>` run that adds the look. Over an existing set, `--variants` without
    `--default-variant` keeps the set's default variant while it stays
    declared; in a library of looks, it takes the look the icons' exports
    draw, which `--variants` must list. Run again with `--from`, it
    refreshes the icons that module supplies (those the generated
    module re-exports or adapts from it) and keeps `map` entries whose icon
    exists; every other icon (the author's `./` artwork, another library's)
    is kept with its `map` entries and variants, a library icon whose `id`
    or export one of those has is left out and named, and each icon the
    module no longer exports, or that `exclude` now names, is removed and
    named for that reason, with the `map` entries that named it. An existing
    icon is known by the library export its generated module re-exports, then
    by its own export, then by its `id`; one matched this way keeps its export
    unchanged, its `map` entries, and every other field, and an `id` the
    current rule spells differently from the same library name is reported
    under `renamed`
    (`add --variant <name> --all` meets an icon the same way). A refresh
    from a package root also refreshes an icon the generated module reads
    from a file of that package, and each such variant of an icon it
    refreshes, when the root exports the same icon: an export that resolves
    to the same file and binding, or an export of the same name when the
    file export does not resolve. It moves to the root import, keeps its
    id, export, and other fields, and the icon is reported under `moved`.
    It is matched only through that root export, and a root icon with its
    id or export is left out. An export stays on its file, and the receipt
    says so, when another export of the set already reads that root export
    or an earlier move takes it. Every export the refresh does not write
    again stays in the generated module. A refresh
    copies the library's license notices the set lacks, and the run that
    first records `source` takes the library's license for the descriptor
    when its `license` is still the one `new-set` wrote (the package's own,
    or `UNLICENSED`); a `license` the author changed is kept, and the
    receipt names both. Later runs keep the descriptor's `license`. The
    package's own `license` is never written. In a library of looks, a look
    the set already wraps keeps its icon and `id`, so a set wrapped one look
    at a time loses and renames nothing, and a new glyph comes in once; a
    new `--default-variant` moves each glyph's own icon to the look it
    names, and the icon keeps its `id` and export. A new
    `--default-variant` that is none of the library's look words is
    refused, the look words named, and nothing is written.
  - `experimental icon add <Export> --from <module>` verifies the export,
    lists the definitions that fit it, and with `--definition` or
    `--new-definition` adds it and maps it; `--variant <name>` adds it as
    that declared variant of an existing icon, and names a variant the set
    does not declare with the command that declares it, which names the
    set's default variant. Each command it
    lists names the set with `--set` and repeats `--default` and `--id` as
    passed, so it runs as printed. A new definition is named in camelCase or kebab-case and written
    in camelCase. From a library of looks it names the icon by its glyph;
    when the set already exports that glyph's name for another export of the
    library, the export keeps its look words in its id and name, or takes
    its name from `--id`, and when its first look word that differs from
    the wrapped export's is a declared variant other than the default, the
    listing adds the command that adds it as that icon's variant. With
    `--variant <name> --all` and no export, it adds that variant in one
    write for every icon from that module's package whose `id` an export of
    the module has (in a library of looks, the glyph's look of that name),
    and for every icon from another package whose library export the module
    exports under the same name and kind (a library that ships each look as
    its own package). Once one icon of another package matches this way,
    the other icons of that package are matched as icons of the module's
    package, and each one the module has no export for is listed as
    missing: the JSON lists every one, and the text names the first ten and
    how many more. Any other icon from another module is left alone and not
    listed as missing, and a glyph drawn in no look of that name, or whose
    own export is that look, is listed as missing. For a `./`
    file outside package.json `files`, it names the `files` array that
    publishes it.
  - `experimental icon map <definition> <icon>` writes one `map` entry,
    `--remove` removes one, and `--pairs` writes many in one checked write;
    here and in `add --definition` a definition may be named by its kebab
    id. `map` names an icon only by its `id`, its export name in any case,
    or another name its library exports it as (a word it carries that is
    not a part of its `id`); a part of an `id` alone (`glass` for
    `magnifying-glass`) is refused with the icons that carry it;
    `new-definition` writes one of the set's own definitions; `use <set>`
    writes `experimental.iconSet`.
  - After it writes, `new-set` (with or without `--from`), `add` with an
    export name, and `map` (also with `--pairs`) answer `templateMeanings`
    (`{unmapped}`): each definition the bundled templates use (FR9) that the
    set's `map` does not name, as `{definition, templates}`, most templates
    first, then by name; empty when it maps them all. A dry run answers
    none. When the list is not empty, the text receipt ends with one line
    that names how many there are, the first eight with their template
    counts, and the `map` command with `--set`.
  - The generated module re-exports each library component, or wraps a data
    export with the adapter, and rewrites its declaration file and theme map
    with every change. It and its declaration file are read statement by
    statement however a formatter left them, with or without semicolons,
    so a formatted module is
    rewritten and checked like the one the CLI wrote.
- **FR14 — The export contract.** Every icon and variant is a named
  `<Name>Icon` export of the package's public entry: a React component, or an
  adapter call, that takes SVG props, draws with `currentColor`, and fills its
  box. The module, name, and component shape are checked statically; color and
  size are documented with a render test authors can copy.

### Checks and catalogs

- **FR15 — `integration check` proves the set matches the package.** For each
  set it reports, without running the package:

  | Code                              | Severity | When                                                                           |
  | --------------------------------- | -------- | ------------------------------------------------------------------------------ |
  | `invalid_icon_set`                | error    | the descriptor, data file, or a definition file is invalid                     |
  | `icon_builtin_definition_missing` | error    | a built-in definition is not in `map`                                          |
  | `icon_definition_unused`          | warning  | a definition the set declares is not in `map`                                  |
  | `icon_definition_shadowed`        | warning  | a definition the set declares has an Astryx definition's name                  |
  | `icon_module_not_public`          | error    | an icon is read from outside the package's public entry                        |
  | `icon_export_name`                | warning  | an export is not named `<Name>Icon`                                            |
  | `icon_not_component`              | error    | an export is a literal, not a component or adapter call                        |
  | `icon_export_missing`             | error    | an export, the generated module, or the adapter does not exist                 |
  | `icon_module_invalid`             | error    | the set's module, a file it re-exports, or the generated module does not parse |
  | `icon_generated_types_mismatch`   | error    | the generated declaration file is missing or stale                             |
  | `icon_theme_map_mismatch`         | error    | the theme map disagrees with the built-in entries of `map`                     |
  | `icon_source_version_drift`       | warning  | the data names another upstream version than the package depends on            |
  | `icon_license_notice_missing`     | warning  | a set with an upstream ships no license notice                                 |

  A definition finding names the definition's description and words and the
  `icon map` command, with `--set`, that fixes it, and suggests icons by the rule `new-set`
  uses (FR13), never from part of a word. When the package's entry exports
  neither the set's theme map nor any of its icons, one `icon_export_missing`
  names the same entry change the `new-set` receipt names (FR13), in place of
  a finding per icon: for a built entry, the source it is built from, never
  the built file. A CommonJS entry the reader cannot read is listed as not
  checked instead. Errors fail the check; warnings fail under `--strict`.
  Re-exports are followed through relative files and installed packages for
  these checks only, and an export fails only when the reader proves it
  absent. Neither of these is an issue, never counted and
  never failing, even under `--strict` or `--next`, in the validate result's
  additive
  field `iconSets` (each `{set, unmappedDefinitions, suggestions,
unchecked}`): the optional Astryx definitions a set leaves unmapped, printed
  as "Unmapped icon definitions (optional)"; and what a check cannot judge,
  each `{icon}`, `{adapter}`, or `{entry}` with its `reason`, printed under
  "Not checked" (`architecture:cli-surface` INV35, DEC-7): an icon export
  whose module is a package `exports` target not built yet; an icon or adapter
  export the reader cannot prove either way (behind a re-export it cannot
  follow, bound to a default or namespace import, or imported from a package
  that does not resolve); and a theme map or theme-map entry the reader cannot
  read. An export a module the reader fully reads lacks is still
  `icon_export_missing`. Each set's entry also has `templateMeanings`, the
  same list the authoring receipts answer (FR13), printed one line per set
  under "Template icon meanings not mapped"; it is never counted and never
  fails a check, even under `--strict` or `--next`.

- **FR16 — Older CLIs.** Published CLI 0.7.3 refuses `stability` on page and
  block templates, namespace docs, and theme descriptors, and refuses a
  template's `icons`, dropping the descriptor. No integration descriptor this
  feature writes sets `stability` there. For the package being authored, the
  validate result's additive field `olderCliNotes` (each `{file, kind, field,
message}`) names each template or namespace doc that sets `stability`, and
  each template that declares `icons`, while the package's CLI peer range
  admits a release before 0.7.4; a note is never counted and never fails a
  check (DEC-9). A CLI before 0.7.4 also refuses an astryx.config that sets
  `experimental.iconSet` ("Unrecognized key"), so commands that load the
  project configuration, such as `doctor` and `discover`, fail in that
  project, and a CLI before 0.7.12 refuses `experimental.iconSet` written as
  a list. `experimental icon use` adds `warning` to its receipt, printed as a
  `[warn]` line, when the project declares an `@astryxdesign/cli` range (in
  any dependency field) that admits a release that refuses the value it
  wrote; a project that declares no
  range, or a `workspace:`, `file:`, or `link:` one, gets none. A CLI reads a
  set's data file strictly: a key it does not know withdraws the set, naming
  the key (FR17). `exclude` is read only by a CLI whose data-file reference
  lists it, and `new-set` writes it only when `--exclude` is given; a set
  without it is read by every CLI that has `astryx experimental icon`.
- **FR17 — Doctor and discover read sets only with the opt-in.** In a project
  that sets `experimental.iconSet`, each set the list names is one of: valid
  (`selected`), not installed (`missing`), shipped by two packages under that
  name (`ambiguous`), or installed but withdrawn (`withdrawn`: invalid, or
  its module does not resolve, with that reason). Doctor's `icon-sets` check
  fails when the list names a set, main or backup, that is not valid, saying
  which and why, and fails when more than one set is installed and the list
  leaves one out, with the `use` command that adds it; it warns when another
  installed set is withdrawn. Doctor's `icon-placeholders` check reads the
  project's own source (not dependencies or build output) as syntax trees
  for the FR19 declaration in the exact shape the CLI writes, under any
  name, and for its uses; a commented-out or quoted copy never counts. It
  warns while any use remains, naming each file and the definitions its
  uses' comments record, with both fixes, and passes when none remain. The template `icons` report and
  `experimental icon --list` carry the same status and reason, and
  `experimental icon` with `--set` (with words or `--all-icons`) or
  `<set>/<id>`, `experimental icon use`, and `discover <package>/<set>` name a
  withdrawn set as withdrawn, with its reason, rather than as not installed,
  each with `ERR_NOT_FOUND`; `add`, `map`, and `new-definition` name a
  withdrawn set in the package being authored the same way. `astryx discover` reads `icon-set` as
  a kind: `--type icon-set`, catalog entries with `iconCount` and
  `definitions`, and `discover <package>/<set>`; a withdrawn set is not
  listed. Without the opt-in, Doctor has no such check and reports no icon-set
  issue and no placeholder check, `doctor integration` checks an installed package's icon sets only
  with it (the package being authored, read by `doctor integration validate`
  with no package, `integration check`, and `verify`, is always checked), and
  discover treats `icon-set` as an unknown kind and `iconCount` and
  `definitions` as unknown fields before it validates a catalog, so a
  malformed icon-set item never fails a source (`spec:AST-051/FR7`).

### Placeholder and previews

- **FR19 — The local placeholder.** The placeholder that FR9 writes is a
  function component in the copied file, typed by the props of an `<svg>`.
  It draws a dashed square, `1em` wide and high, in `currentColor`, so it
  sizes like the text around it, and CSS or `Icon` sizes it like any icon
  component. It is decorative (`aria-hidden`) unless a use gives it
  `aria-label` or `aria-labelledby`, which makes it `role="img"`; a prop the
  use passes wins. It has no custom data attributes. No package exports it,
  so no Astryx package, route, or dependency changes (DEC-10).
- **FR20 — Docs site previews.** The docs site's build setting
  `DOCSITE_ICON_SET`, experimental, names a main set and optional backups,
  separated by commas. Set, a build-time loader runs each template and block
  preview source through the FR9 rewrite with the sets installed in the docs
  site; a main set that is not usable fails the build. Unset, no loader is
  added and previews keep their templates' icons.

### Supporting pieces

- **FR18 — Additive docs support.** Every doc type except `ThemeDoc` and
  `IconSetDoc`, and every schema field and enum value, accepts
  `stability: 'experimental'`: help shows a marked command as
  `[experimental]`, stable tables leave out a marked field or value, search
  leaves out a marked doc, and Doctor's doc counts leave marked docs out. A
  namespace's `source.packages: 'all'` adopts a doc group from every package
  only on a CLI namespace marked experimental (the icon definitions); DEC-7
  owns that exception to `spec:AST-046/FR2`.

### Platform support

- Supported engines: the CLI's Node floor.
- Unsupported behavior: a set whose module does not resolve does not answer
  lookups, and templates keep their icons.
- Browser evidence: none; every behavior is CLI output, written source, or a
  module's exports.

## Current-state impact

- `architecture:cli-surface`: the `experimental` command group and
  `experimental icon` commands with their response types, the
  `experimental.iconSets` manifest root, the `icon-set` and `icon-definition`
  descriptor kinds, the `cli/experimental` docs namespace, the `icon-sets`
  and `icon-placeholders` Doctor checks, the icon-set checks, the
  `template_icon_undeclared` next note, and the `iconSets` and `olderCliNotes`
  validate fields.
- Docs site: the experimental `DOCSITE_ICON_SET` build setting.
- `contributing:cli-conventions`: `IconSetDoc`, `IconSetData`, and
  `IconDefinitionDoc` join the authoring types.
- Consumer docs: `cli/experimental/icon-sets`,
  `cli/experimental/icon-set-files`, and `cli/experimental/icon-definitions`.
- `spec:AST-051`: discover's `icon-set` kind, read only with the opt-in.

## Verification

| Contract  | Verification                                                                              | Representative states                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Mutation or failure expectation                                                                                                                                                                                                                                 |
| --------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR0, FR11 | experimental-isolation tests against the output of the CLI without the feature            | help; the manifest; every stable docs topic and tree node, the `cli` listings, and every stable `cli` docs node; search for `delete`, `close`, `icon`, `trash can`, `search`, `experimental`, and `icon set`, with no set and with a set opted in; template printed and copied; discover, Doctor, and `doctor integration validate <package>` with a set and no opt-in; stderr of every command that prints the integration-issue nudge, with a set and no opt-in. Goldens hold identities, structure, counts, every `stability`, and every sentence or link that names an experimental surface, an icon set, or an icon definition, not prose | a stable output gains a result, field, section, count, `stability`, or a sentence or link naming an experimental surface that the CLI without the feature lacks (apart from FR18's `stability` field); or a stable command gains an icon-set subcommand or kind |
| FR1–FR5   | descriptor, data-file, and definition parser and discovery tests                          | valid set; invalid data; definitions Astryx and the set both have                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | an invalid set answers, or a definition file is not read                                                                                                                                                                                                        |
| FR6–FR8   | `experimental icon` text and JSON tests                                                   | definition, name, and meaning matches; `<set>/<id>`; `--list` with an order and with two sets and none chosen; `use` with backups; two sets of one name; `--definitions` in an icon-set package, in a project with a main set, with `--set`, and with no set; the `use` fix with a set written as `<package>/<set>` and with a name two packages ship                                                                                                                                                                                                                                                                                          | ranking or tie order changes, or a bare ambiguous name answers                                                                                                                                                                                                  |
| FR9–FR10  | template mapping tests; `integration check` tests; the bundled-template declarations test | mapped by match and by definition; a main set and a backup; one placeholder declaration shared by two meanings, under a free name when `MissingIcon` is taken; a missing look; kept with a suggestion; an undeclared icon; no opt-in                                                                                                                                                                                                                                                                                                                                                                                                           | a name is guessed, an icon keeps a library import no set has, sets mix within one icon, or a project without the opt-in gets a rewrite                                                                                                                          |
| FR12–FR14 | writer and command tests                                                                  | wrap and refresh; adapter; generated types and theme map; a receipt for a set that leaves template meanings unmapped and for one that maps them all; a dry run; the first wrap into a set with no icons; `--adapter` on a new set, on a set with no icons, and malformed or missing; `add --all` with more than ten missing; suggestions for an id with other words, a shared word, and `bank`                                                                                                                                                                                                                                                 | a write is left half done, or the theme map drifts from `map`                                                                                                                                                                                                   |
| FR15      | `integration check` tests, with and without `--strict`                                    | every code; unmapped optional definitions; unmapped template meanings under `--strict`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | an export the module lacks passes, or the optional list fails a check                                                                                                                                                                                           |
| FR16      | validate tests; a scratch project on published CLI 0.7.3                                  | `stability` on a template and namespace doc; template `icons`; peer range from 0.7.4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | a note fails a check, or a dropped descriptor goes unnoted                                                                                                                                                                                                      |
| FR17      | Doctor and discover tests                                                                 | opted in; a placeholder in use, commented out, and quoted; installed set and no opt-in; invalid set and no opt-in                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | a project without the opt-in sees an icon-set check, issue, or kind                                                                                                                                                                                             |
| FR19–FR20 | template mapping tests of the placeholder declaration; docs site loader and config tests  | the declaration's size, color, and labels; no data attributes; setting unset and set; a set that is not installed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | the placeholder is announced without a name, or an unset build changes                                                                                                                                                                                          |
| FR18      | docs tree, help, and search tests                                                         | marked command; stable and experimental namespace with `packages: 'all'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | a stable namespace adopts another package's doc, or a marked doc reaches search                                                                                                                                                                                 |

## Decision log

### DEC-1 — The set is the item; its data file is the payload

**Reference:** `spec:AST-084/DEC-1`
**Decider:** `josephfarina`, `2026-10-20`

One descriptor per set keeps the no-catalog rule, and every surface reads the
one data file, so lookup, templates, and themes agree on what an icon means.

Rejected: one doc file per icon, which thousands of hand-kept files cannot keep in step with a library.

### DEC-2 — Find icons with a dedicated command

**Reference:** `spec:AST-084/DEC-2`
**Decider:** `josephfarina`, `2026-10-20`

An icon answer needs its import line, variants, and definitions, so
`astryx experimental icon` answers with the full record. `astryx search` is a
stable surface the experiment never feeds; icons join it at promotion.

### DEC-3 — An icon no set has becomes a placeholder

**Reference:** `spec:AST-084/DEC-3`
**Decider:** `josephfarina`, `2026-11-09`

A project chooses its icons. An icon from a library the project never chose
is a stray dependency and a mismatched look, so an icon with a meaning that
no set in the project's list has becomes a placeholder, with a note and
the two commands that fix it, and Doctor lists each one left in the
project's code.

Rejected: keeping the template's original library import, which leaves a
dependency and an icon the project did not choose.

### DEC-4 — Astryx owns the definitions; sets map to them

**Reference:** `spec:AST-084/DEC-4`
**Decider:** `josephfarina`, `2026-10-20`

Shared definitions let templates name meanings, not libraries. A set extends
them with its own files, and the CLI never encodes a library.

### DEC-5 — Every icon is a component the package exports

**Reference:** `spec:AST-084/DEC-5`
**Decider:** `josephfarina`, `2026-10-20`

Apps, templates, and theme maps import every icon from the set's package; the
generated module and adapter make data-only libraries work the same way.

### DEC-6 — Icon sets ship experimental

**Reference:** `spec:AST-084/DEC-6`
**Decider:** `josephfarina`, `2026-10-20`

The commands, keys, data file, and output may change in a patch release while
real sets prove the design. Each surface uses its kind's experimental
boundary, and a project that does not opt in sees the output it saw before.

### DEC-7 — Experimental namespaces may adopt docs from every package

**Reference:** `spec:AST-084/DEC-7`
**Decider:** `josephfarina`, `2026-10-20`

A set adds its own icon definitions, and they belong beside the Astryx ones,
so a namespace's `source.packages: 'all'` adopts a doc group from every
package. It is an experimental exception to `spec:AST-046/FR2`, read only on a
CLI namespace marked `stability: 'experimental'`; every stable namespace
adopts only its own package's docs, exactly as `spec:AST-046/FR2` says.

Rejected: placing each set's definitions under its own package, which splits
one vocabulary across as many namespaces as there are sets.

### DEC-8 — `icon-set` is a seventh discover kind, behind the opt-in

**Reference:** `spec:AST-084/DEC-8`
**Decider:** `josephfarina`, `2026-10-20`

A set is an item a package adds, so discover lists it like the six kinds of
`spec:AST-051/FR5`, with the additive catalog fields `iconCount` and
`definitions`. Only a project that sets `experimental.iconSet` reads them.
Without it, `--type icon-set` fails with `ERR_INVALID_OPTION`, unknown-kind
errors list the six kinds, and the kind and its fields are unknown under
`spec:AST-051/FR7`, so the output matches a CLI without icon sets.

### DEC-9 — `olderCliNotes` is additive and never fails

**Reference:** `spec:AST-084/DEC-9`
**Decider:** `josephfarina`, `2026-10-20`

An author whose peer range admits an older CLI needs to know what that CLI
drops, but the package is valid for the CLI that checks it. So validate adds
the field `olderCliNotes`: it is never counted in a summary and never fails a
check, with or without `--strict` or `--next`.

### DEC-10 — The placeholder is local to the copied file

**Reference:** `spec:AST-084/DEC-10`
**Decider:** `josephfarina`, `2026-11-09`

Icon sets are experimental, and a copied file must not depend on an export
that may change in a patch release. So the CLI writes the placeholder into
the file, once, and no package, registry route, or dependency changes.
Doctor finds it reliably because it reads the declaration's exact shape from
the syntax tree, not from text.

Rejected: an experimental Core export, which adds a public component and a
registry route to every Astryx project for a gap marker that lives in a few
copied files.

### DEC-11 — The list decides every icon, one set per icon

**Reference:** `spec:AST-084/DEC-11`
**Decider:** `josephfarina`, `2026-11-09`

A main set and ordered backups let a project fill gaps without mixing looks
within one meaning. Choosing a main set is the opt-in, and it declares the
order, so a project that has not opted in keeps its output whatever sets are
installed. After the opt-in, an installed set left out of the list is a
Doctor failure, because which set a template uses would otherwise depend on
install order.

## Open questions

None.
