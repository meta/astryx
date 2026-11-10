# Conformance suite

Compares the Rust clone with the JS CLI: stdout, stderr, exit code and every
file a run creates, changes or deletes. The goldens come from the JS CLI.

## Run it

```sh
node packages/cli-rs/conformance/run.mjs --bin <worktree>/target/release/astryx \
  [--command search,docs] [--case <id>[,<id>]] [--jobs 16] [--show-diff] [--max-diffs 50] [--failed]
```

- Prints pass/total per command and the first diffs; writes `conformance/report.json`
  (every failure with want/got). `--failed` reruns only the last report's failures.
- `--command` names a cases file (`cases/<command>.json`); `root` holds the
  bare `astryx`, `--help`, `--version` and unknown-command cases.
- The clone's CLI root is found from the binary path (the `packages/cli` of the
  checkout that holds it); override with `--cli-root`.
- Exit 0 only when every selected case passes.

## Case format

`cases/<command>.json` (generated, rewritten by `gen-cases.mjs`: never edit it) and
`cases/<command>.<name>.json` (hand-written; use one file per lane, e.g.
`cases/docs.docs-lane.json`) are JSON arrays of cases. Ids are unique per command
across its files.

```json
{"id": "component_Button_--json", "args": ["component", "Button", "--json"], "fixture": "app"}
```

| field      | required | meaning                                                                       |
| ---------- | -------- | ----------------------------------------------------------------------------- |
| `id`       | yes      | unique in its file; also the golden's file name                                |
| `args`     | yes      | argv after `astryx`                                                           |
| `fixture`  | no       | project to run in (default `app`), see below                                  |
| `cwd`      | no       | folder to run in, relative to the work root (default: the fixture's folder)   |
| `stdin`    | no       | text written to stdin (default: empty, closed; stdin is never a TTY)           |
| `tty`      | no       | `true`: run under a pseudo-terminal (`script`); stdout and stderr arrive merged in `stdout`, with CRLF |
| `pre`      | no       | list of argv arrays run first with the same binary in the same work tree (output and exit ignored), e.g. `[["theme","add","neutral"]]` before `theme remove neutral` |
| `env`      | no       | extra environment variables, added to the pinned set; `null` unsets one       |
| `timeoutMs`| no       | default 20000 in run.mjs (`--timeout`), 120000 in record.mjs; record.mjs retries a timeout and never keeps one as a golden |
| `gen`      | no       | `true` on generated cases                                                      |

stdout and stderr are regular files (not pipes, not TTYs) unless `tty` is set: Node can exit with pipe
writes pending, which cut long outputs short at random.

To add cases: put them in your own `cases/<command>.<name>.json`, then record
their goldens from the JS CLI: `node record.mjs --command <command> --missing`.
Commit the cases and goldens together.

A golden, `golden/<command>/<id>.json`, holds `stdout`, `stderr`, `exit` and
`files`: `[{path, status: created|changed|deleted, text | base64 | sha256+size | link}]`,
sorted by path. Paths are relative to the work root (`home/...` is `$HOME`).
Files under `tmp/` (`$TMPDIR`) and `home/.npm/` (npm's own cache and logs, from
commands that run `npm pack`) are not compared.

## Environment (identical for both binaries)

- Work root `/tmp/astryx-conformance/work`. Each case runs in a private mount
  and network namespace: the fixtures are a read-only lower layer and the
  case's writes go to its own overlay upper layer. So every case sees the same
  absolute paths, cases (and lanes) run in parallel, and nothing a case does
  touches the shared fixtures or the network.
- Fixtures (`setup.mjs`, materialized at `/tmp/astryx-conformance/fixtures`,
  real copies of the published files of each package):
  - `app`: `@astryxdesign/core` installed; `src/App.tsx`.
  - `empty`: an empty folder, outside any project.
  - `integration`: `app` plus `@acme/kit`, an integration with a component
    (`.doc.mjs` and a TypeScript `.doc.ts`), a block template, a docs topic and a theme.
  - `author`: the cwd is an integration package being authored (`@acme/widgets`).
  - `large`: core plus lab, charts, build and every first-party theme.
  - `nocore`: declares core, not installed. `brokencore`: core's package.json is invalid JSON.
  - `plain`: a project that does not use Astryx.
  - `inputs`: shared input files (`palette.config.json`, `not-json.json`, `page.tsx`).
- Env: only `PATH=<conformance bin>:/usr/bin:/bin` (the bin folder holds `node`),
  `HOME=<work>/home` (empty), `TMPDIR=<work>/tmp`, `USER=astryx`, `LANG=C.UTF-8`,
  `TERM=dumb`, `NO_COLOR=1`, `FORCE_COLOR=0`, `COLUMNS=100`, `TZ=UTC`,
  `NO_UPDATE_NOTIFIER=1` (the CLI's own switch for its latest-version check and
  update notices).
- Wall clock: `LD_PRELOAD` of `shim/fixedtime.c` makes every realtime clock read
  (`clock_gettime(CLOCK_REALTIME)`, `gettimeofday`, `time`) return
  2026-11-10T00:00:00Z, so timestamps the CLI writes (e.g. `notifiedAt` in
  `~/.config/astryx/state.json`) are reproducible. Monotonic clocks are real.
  The clone must read the wall clock through libc (Rust's `SystemTime` does).
- The only normalization: each CLI's package root (and its realpath) is written
  as `<cli>` in stdout, stderr and file contents.

## Scripts

- `setup.mjs`: builds the fixtures (atomic; skipped when the stamp matches).
- `gen-cases.mjs`: regenerates the `gen` cases from `astryx manifest --json`
  (every command and subcommand: `--help`, `-h`, `help <cmd>`, bare, `--json`,
  each documented example, each flag, each choice value, bad and missing values,
  unknown flag, extra arguments, unknown subcommand, other fixtures) plus entity
  sweeps (every component, hook, template, docs topic and section, theme, theme
  target; many search/build/discover queries with typos and several words) and
  TTY/stdin cases.
- `record.mjs [--command x] [--case id] [--missing] [--once] [--jobs n]`: records
  goldens from the JS CLI, running each case twice. A case whose two runs differ
  runs three more times; the most complete output (the JS CLI sometimes cuts
  stderr short when it exits with a write pending) is kept, marked
  `"nondeterministic": true` and listed in `golden/NONDETERMINISTIC.json`.
- `run.mjs`: as above.
