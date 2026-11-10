# Rust clone of the Astryx CLI: lane contract

This is an experiment. It is not published and it is not merged.

## The goal

The Rust binary (`astryx`, built from this crate) is a drop-in clone of the
JavaScript CLI in `packages/cli`. For every command and subcommand, for every
case in the conformance suite, these must be equal between the two:

1. stdout, byte for byte;
2. stderr, byte for byte;
3. the exit code;
4. every file the run creates, changes or deletes (path and bytes).

The only normalization: the CLI package root of each binary is written as
`<cli>`, because the two binaries live in different folders. Nothing else is
normalized. A case passes only when all four are equal.

"Input accurate" means the clone accepts exactly what the JS CLI accepts and
rejects exactly what it rejects, with the same messages: unknown commands,
unknown flags, missing arguments, bad values, `--help` everywhere.

## Hard rules

- **Rust only.** The binary never runs `node` or any other JS runtime as a
  subprocess, and never embeds the JS CLI's own code to run it. User-authored
  JS/TS modules (`*.doc.mjs`, `*.doc.ts`, `astryx.config.*`, integration
  manifests) are evaluated in-process by `crate::js` (Boa, a JavaScript engine
  written in Rust, plus oxc to strip TypeScript and JSX). The JS CLI runs those
  files too, so the clone must as well.
- Data files (JSON, Markdown, CSS, template `.tsx` sources) are read from the
  CLI package's `assets/` at run time, as the JS CLI reads them. The clone's
  CLI root is `packages/cli` beside this crate.
- The CLI's OWN `.mjs` data (CommandDocs, `assets/docs`, template and theme
  docs that ship inside `packages/cli`) may be compiled ahead of time into a
  JSON file the binary embeds, for start-up speed. The generator lives in
  `scripts/`, its output is committed, and a test fails when the output is
  stale. Anything from the user's project or `node_modules` is always loaded
  at run time through `crate::js`.
- **Never edit `packages/cli` or the goldens** to make a case pass. If a golden
  looks wrong or nondeterministic, report it to the lead.
- Copy JavaScript semantics where output depends on them: string length and
  slicing in UTF-16 code units; `Array#sort` (stable; default order compares
  UTF-16 code units); `String#localeCompare` (ICU root collation: use
  `icu_collator` or prove an equal order); JS regular expressions (use the
  `regress` crate, the JS regex engine Boa uses); number printing
  (`json::js_number_to_string`, `toFixed`); JSON output (`json::stringify`,
  which matches `JSON.stringify`, including JS object key order).
- Public repo text: no internal links, names or identifiers in code, comments
  or commit messages.

## Layout and ownership

| Path                   | Owner lane          | What                                                                                                                        |
| ---------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `conformance/`         | harness             | cases, fixtures, golden recorder, runner, report                                                                            |
| `src/json.rs`          | shell               | JS-exact JSON (shared; small fixes by anyone, say so)                                                                       |
| `src/cli/`             | shell               | Commander-exact parsing, help, errors, envelopes, text formatters, dispatch, `manifest`, root `--version`/`--help`/`--json` |
| `src/js/`              | jsengine            | module loading (Boa + oxc), Node-style resolution                                                                           |
| `src/discovery/`       | discovery           | packages, docs, doc compiler, config, integrations                                                                          |
| `src/commands/<name>/` | that command's lane | the command: its API logic and its terminal output                                                                          |

A lane edits only its own paths, plus one registration line in
`src/commands/mod.rs` and its dependency lines in `Cargo.toml` (one crate per
line, kept alphabetical). Need a change in someone else's path? Make the
smallest change, keep it in a separate commit, and say so in your report.

### Who owns which JS module (port it once, in the owner's lane)

| JS source | Rust home | Lane |
| --- | --- | --- |
| foundation/release (choose, run-context, project, notices, global-state), response, debug; clients/cli/index, program, run, lib/*, formatters | `src/cli/` | shell |
| foundation/env (package-manager, getCliInvocation, formatCliCommand, semver, search-path), fs (paths, findCoreDir, findInstalledPackage, listing-cache), config, doc-compiler, integrations (read), discovery/* except the three below, docs/template/theme/icon-set discovery, Project.load | `src/discovery/` | discovery |
| module loading (jiti/native import) | `src/js/` | jsengine |
| discovery/component-discovery, component-replacement, hook-discovery; foundation/text; api/docs linkComponentDoc; lib/resolve-theme | `src/discovery/{component_discovery,component_replacement,hook_discovery}.rs`, `src/text/`, `src/commands/component/` | component+hook |
| foundation/route (classify, runTree) | `src/route.rs` | build |
| api/search (searchCore, stem, STOPWORDS, SYNONYMS, coverage) | `src/commands/search/` | search |
| api/integration validate-integration, authoring-checks | `src/commands/doctor/integration/` | doctor |
| foundation/agent-docs (incl. agent-doc-state) | `src/commands/init/` | init+swizzle |
| api/docs (rest), api/blog | `src/commands/docs/`, `blog/` | docs+blog |
| api/template, api/theme (not build/palette) | `src/commands/template/`, `theme/` | template+theme |
| api/theme/build, palette | `src/commands/theme_build/` | theme-build |
| upgrade, assets/codemods | `src/commands/upgrade/` | upgrade |
| api/integration (rest), integrations write side | `src/commands/integration/` | integration |
| api/discover | `src/commands/discover/` | discover |
| api/build | `src/commands/build/` | build |
| gap-report | `src/commands/gap_report/` | gap-report |
| conformance suite | `conformance/` | harness |
| experimental icon + render, foundation/render | `src/commands/experimental/` | not started yet (lead assigns) |

Until an owner's piece lands, write the smallest local version in your own
module, mark it `// TEMP: replace with <owner path>`, and swap it when it
lands..

The shell lane publishes the command interface in `src/cli/command.rs`. Until
it lands, write your command's logic as plain functions (parsed options in,
`json::Value` for `--json` and `String` for text out) with unit tests.

## How to work

- Your worktree and branch: `lane/<name>`, created from `experiment/rust-cli`.
  Merge `experiment/rust-cli` into your branch often to pick up the shell,
  engine and discovery work. The lead merges finished lane work back.
- Build with your own target dir and a share of the cores:
  `CARGO_TARGET_DIR=<worktree>/target nice -n 10 cargo build --release -j 24`.
- Test: `cargo test`, then
  `node conformance/run.mjs --bin <worktree>/target/release/astryx --command <name>`.
  It prints pass/total per command and the first diffs.
- Commit small and often, with a plain message. Report pass/total per command
  in every report.
- Done means 100% of your command's cases pass with the real module loader.
  Then widen the cases for your command (more flags, more inputs, bad input)
  with the harness's case format, and record their goldens from the JS CLI.
