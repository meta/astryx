# CLI conventions for contributors

This guide turns the CLI surface architecture (`docs/architecture/cli-surface.md`)
and the admission rules (`docs/specs/AST-042-cli-command-admission/spec.md`) into
the steps you follow when you change `packages/cli`. It does not create policy.
Where it disagrees with either record, the record wins.

## Who the CLI is for

The caller is an agent. It runs the CLI in a subprocess, reads `--json`, and
acts on the result without a person watching. A person reading the text output
is a supported reader, never the caller the design serves.

Two things follow, and they settle most arguments before they start:

- **The CLI must not impede the agent's flow.** No prompt, no confirmation, no
  question. A command that cannot finish returns an error with a code the agent
  can branch on and a suggestion it can act on.
- **The output is data first.** `--json` is the source of truth. The text output
  is a projection of the same values, produced by the formatters.

## What the CLI is for

Give an agent access to everything that helps it build with Astryx: what
components and templates exist, what they do, how they are used, what is wrong
with the code in front of it, and the utilities that change that code.

The measure of the CLI is coverage and depth of that surface, not the number of
commands on it. Most valuable work makes an existing command answer better.

## Adding a command

The bar depends on the tier (`spec:AST-042` FR4):

- **A new top-level command** needs a current system spec that authorizes it,
  approved by an approval owner (an owner listed in the knowledge schema's
  `approvalOwners`). Write the spec first.
- **A new subcommand** stays inside its parent's one job. State its case in the
  pull request, and get approval from a code owner of `packages/cli`.
  `.github/CODEOWNERS` is the source of truth for who that is.
- **A new flag** follows the flag rules below and needs no extra approval.

Propose a command before you write it: a command is a permanent concept — it
appears in help, in the manifest, in the README, and in every agent's cheat
sheet, and removing one is a breaking change.

Every command is a thin layer over one exported `api/` function: parse the
arguments, call the function, render the result. The function does the work, so
an agent that scripts the API gets the same result as one that runs the command.

A command earns its place when all four hold:

1. **It answers a question an agent actually has** while building with Astryx —
   not a function the CLI happens to be able to expose.
2. **No existing command can be deepened to answer it.** Deepening is the
   default. Reach for a new command only after naming the command you would
   have extended and saying why extending it is wrong.
3. **It is one job.** If the summary needs an "and", it is two commands.
4. **Its result is worth returning as data.** If the useful output is prose for
   a person, it is a docs topic, not a command.

A command that fails any of these is usually a flag, a subcommand, or a docs
topic.

## Adding a flag

Flags are more forgiving than commands, and they do not need a proposal, but
`spec:AST-042` FR5 makes the rules below binding. They are not free: every flag
is a branch an agent has to know about, and a combination somebody has to keep
working.

A good flag:

- **Narrows or redirects work the command already does.** It never gives the
  command a second job.
- **Has a default that is the right answer most of the time.** A flag exists to
  escape the default, not to reach the useful behaviour. If callers must pass it
  to get a sensible result, the default is wrong.
- **Is boolean-off or has a value.** A boolean flag that defaults to true is a
  mis-named opt-out; name the opt-out instead.
- **Changes what the command produces.** A flag that only changes how the same
  result is presented belongs to the global set (`--json`, `--detail`,
  `--lang`), not to your command.
- **Is not a workaround.** If the flag exists so callers can avoid a defect, fix
  the defect.
- **Has a closed composition matrix.** See below — this is the check people
  skip.

If the flag changes what the command _is_, it is a subcommand.

## The composition matrix

Before you land a flag, pair it with every flag already on that command and
decide each cell. There are only three legal answers, and every cell needs one:

1. **They compose** — and a test proves it.
2. **They are refused together** — with a clear message and a code.
3. **They cannot co-occur** — because another rule already refuses the
   combination that would reach them.

An undecided cell is the defect. It ships as behaviour nobody chose, and an
agent finds it before a person does.

## Flags with the same name

A name is a promise across the whole CLI. Two rules:

- **The same flag name means the same thing everywhere, and is spelled the same
  way.** Nothing else may take a flag name for another idea.
- **No command is forced to carry a flag because a sibling has it.** Alignment is on
  meaning, not on presence.

## Where the code goes

Copy `api/blog` and `clients/cli/commands/blog.mjs`. They are the reference
layout (`cli-surface` INV20–INV22).

- The behavior lives in `api/<subject>/`: an entry `<subject>.mjs`, one leaf
  folder per operation, a `FunctionDoc` and typedefs for each exported function,
  and tests beside the code they cover.
- Anything that touches the environment — files, the network, subprocesses,
  loading the project or running discovery — goes in the subject's
  `_adapter.mjs`. The leaves only shape the result.
- The handler in `clients/cli/commands/` only parses, calls, and renders.

## Output: use the shared functions

Never call `console.log`. Every path is provided:

| You want                    | Use                                                     |
| --------------------------- | ------------------------------------------------------- |
| A machine result            | `jsonOut({type, data, meta?})`                          |
| An error                    | `jsonError(message, suggestions, code)` / `AstryxError` |
| A heading, prose, a list    | `section()`, `text()`, `list()`                         |
| One record, or many         | `record(obj, opts)`, `records(arr, opts)`               |
| A code sample               | `code(source)`                                          |
| To print any of the above   | `emit(...blocks)`                                       |
| Chatter that JSON must hide | `humanLog()`, `humanWarn()`                             |

`emit` accepts only a renderer-produced `Block`, so a bare string will not
compile. Keep text field names identical to the JSON keys — the text output is
a view of the envelope, not a separate design. Do not pad strings, align
columns, or draw tables yourself; map rows onto `records()`. A new block kind
needs the evidence that `spec:AST-042` FR3 asks for.

## Errors: every failure carries a code

Add a code to `foundation/response/error-codes.mjs` when no existing one fits.
Codes are `ERR_<SUBJECT>[_<QUALIFIER>]`, grouped by subject, and **append-only**:
once shipped, a code is never removed and never re-meant. Reword the message
whenever it helps a reader; never make a caller match on it.

Attach `suggestions` where the agent has an obvious next move — a near-miss
name, the command that lists valid values.

## Every command ships a doc

A command is not done without its `CommandDoc` in `<name>.doc.mjs`. Fill in
`summary`, `description`, `args`, `options` (each with a description),
`examples`, `exitCodes`, `related`, and `outsideProject`: what the command does
outside a project. Help text, the README tables, and the
manifest are generated from it, so an undocumented flag is an invisible flag.

Give at least one example that an agent would actually run, including a `--json`
one.

## Global mode: every command works outside a project

People install the CLI once for their computer and run it in any folder
(`spec:AST-081`). So every command also has to work, or explain itself, in a
folder that is not a project, and its docs have to say which.

1. **Declare `outsideProject`** in the command doc: `same` (it answers as it
   would in a new project), `refuse` (it writes nothing and fails before doing
   any work, naming what it needs), or `own` (it does something else). A
   command that only groups subcommands declares nothing.
   `clients/cli/commands/outside-project.test.mjs` runs every command in an
   empty folder and checks what it does against this value, and fails on a
   command without one; an `own` command needs a test of its own there.
2. **Add the note, for readers.** Every `refuse` and every `own` command
   carries one prose note that starts `In global mode:`, says exactly what it
   does outside a project (the error code and message it stops with, or what
   it does instead), and links `{@link namespace:global}`.
   `test/global-mode-notes.test.mjs` fails on a missing note, and
   `test/global-mode-docs.test.mjs` checks that the error code a note names is
   the one the command stops with. An API function whose result depends on
   `cwd` being in a project carries the same sentence in its description.
3. **Add a who-answers row** when a change touches which copy of the CLI
   answers (an install layout, a door, a hand-off rule): one row in the global
   and project table of `spec:AST-081` and its test in
   `packages/cli/test/global-local.test.mjs`, named with the row's number
   (`G12 …`); a test there fails on a gap in the row numbers.
4. **Quote, never paraphrase, what the CLI prints.** A terminal line shown on a
   global-mode page must be one the CLI prints; `test/global-mode-docs.test.mjs`
   builds those lines from the CLI's own strings.

The user-facing explanation lives in `astryx docs global`.

## Every integration item ships a typed doc

A discoverable contribution is not done without a strongly typed
`<source-stem>.doc.mjs` beside its source or payload. Export the descriptor type
from `@astryxdesign/cli/authoring`, annotate the descriptor with that type, and
use the kind's canonical typed export. New descriptor kinds use the stamped
default export. The descriptor is the only place for item metadata. The root
integration manifest points at directories; it does not enumerate the items
inside them.

When an item spans several files, define one confined item-local ownership
boundary and make discovery, materialization, and pack verification enumerate the
same complete set. Never repeat source identity in the descriptor when the
same-stem pair proves it.

Never catalog items centrally, for any kind: no file under a root that lists its
items (like `themes/manifest.json`), and no per-item map or list in the
integration manifest (like a map of template replacements). Per-item options
such as `replaces` go in the item's own `.doc.mjs`. Adding one item changes no
file its siblings share, apart from declaring a new root. 0.6 shipped a theme
catalog and had to remove it as a breaking change; do not repeat it.

Released alternate readers may remain for compatibility, but new writers,
examples, and contribution kinds use `.doc.mjs`. See `spec:AST-039` for the
compatibility transition and the mandatory theme descriptor contract.

## Marking work in progress

Some of the surface is not finished, and today nothing on it says so. Callers
cannot tell a settled command from one still being shaped.

When you land a command or subcommand that is not ready to be depended on, mark
it, and say in the doc what is still expected to change. Treat an unmarked
command as stable: changing its output shape or its flags is then a breaking
change.

## Checklist before you open the pull request

- [ ] For a new top-level command: a current spec authorizes it. For a new
      subcommand: a code owner approved its case.
- [ ] The handler only parses, calls one exported `api/` function, and renders;
      the subject's adapter does any file, network, or project access.
- [ ] One file per command, with its sibling doc file.
- [ ] Every new integration item has a typed, same-stem `.doc.mjs`; the root
      manifest only locates its directory. No catalog file, no per-item map.
- [ ] `--json` returns one envelope; the `type` matches the API function.
- [ ] Every failure path carries a code; new codes are appended, never edited.
- [ ] No `console.log`; all human output goes through the formatters, with no
      hand-padded columns.
- [ ] Text field names match the JSON keys.
- [ ] Exit code is the same with and without `--json`.
- [ ] The composition matrix is closed: every pair composes with a test, is
      refused with a message, or cannot co-occur.
- [ ] Any path you write passes through `assertWithin`.
- [ ] The doc lists the new flag, an example, and the exit codes.
- [ ] The doc declares `outsideProject` (`same`, `refuse`, or `own`), and a test
      run outside a project matches it.
- [ ] Marked as work in progress if it is not ready to be depended on.
- [ ] The command doc declares `outsideProject`; a value other than `same`
      has its `In global mode:` note and a test of what it does outside a
      project.

## Common review smells

- **An item catalog below an integration root, or a per-item map in the
  manifest.** Put metadata and options in the typed, same-stem `.doc.mjs`; the
  root manifest points at the directory.
- **A flag that only a maintainer would pass.** It is a debugging affordance;
  keep it out of the surface.
- **A new command whose summary contains "and".** Two commands.
- **A handler that reads files or loads the project.** That work belongs in the
  API subject's adapter.
- **A flag added because another command has one.** Presence does not have to
  align; meaning does.
- **A composition cell nobody decided.** The most common defect in a flag PR.
- **A code invented at the call site.** Codes live in one frozen table.
- **Text output built with string concatenation.** It will drift from the JSON
  within one release.
- **`--json` output that omits what the text output shows.** The text is the
  projection; it cannot be the richer of the two.
- **An error message that tells the agent to "check your configuration".** Name
  the file, the key, and the expected value, or give a suggestion.
- **A flag whose default is the unhelpful answer.** Agents will not discover it.
