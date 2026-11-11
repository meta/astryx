# Vibe eval

The vibe eval asks one question: **when a fresh coding agent builds a small UI
with Astryx, does the result work as often as when it builds the same UI with
shadcn/ui?**

The eval measures the delivered result in a real browser. It does not score
code style, unlike the static scores of the older nightly pipeline in `../src`.

A run starts one fresh agent per task, arm and repetition, grades each result
with a deterministic grader, and reports pass rates with intervals under a hard
cost cap. `--self-test` proves the grader on every task without an agent.

## Arms

Each arm is a committed starter app under `arms/`. The library's own setup
generated it, with exact versions in a lockfile.

- `astryx-vite`: `create-vite` (React + TypeScript), then the published
  `@astryxdesign/core`, `@astryxdesign/theme-neutral` and `@astryxdesign/cli`,
  then `astryx init` and `astryx theme add neutral`, as the getting-started
  guide says. Authored StyleX compiles through `@stylexjs/unplugin`.
- `shadcn-vite`: `shadcn init --template vite --base radix --preset nova`, then
  `shadcn add --all`.

Both arms use the same TypeScript, Vite and React versions, the same `strict`
type check (`tsc -b`) and the same build (`vite build`). Both start from the
same empty `src/App.tsx`, and neither has a README or lint and format tooling.

## Controls

Before it grades anything, the grader installs each arm with `npm ci` in a
folder outside the repository and checks itself:

- A negative-control file, with a missing module and an unknown prop, must fail
  the type check with at least two errors and must fail the build.
- The empty starter must pass both.

If any control is wrong, the run stops.

## Agents

Each run copies the arm into a new folder outside the repository and starts one
fresh agent there. The agent gets the same prompt in every arm. Only the library
name changes. The probes, the reference solutions and other runs are outside
its folder. The agent is not sandboxed, so the runner audits it instead (below).

- Harness: Claude Code in bare mode (`claude -p --bare`). It loads no user
  settings, plugins, hooks, MCP servers or memory files. Web tools and
  sub-agents are off.
- Model: one model for every arm, given with `--model` and recorded in
  `meta.json`. A session that starts on another model is stopped at once and
  listed as an `agent-error`. A finished run whose usage does not include the
  pinned model fails as `model-mismatch`.
- Project instructions: bare mode reads no memory files, so the runner passes
  the arm's root `AGENTS.md` or `CLAUDE.md`, if the arm's own setup wrote one.
  Today only `astryx init` writes one.

After the agent stops, the runner reads its transcript. These fail the run as
`integrity`: a path inside the home folder, the repository or any run under the
run root; a recursive read of one of those roots, or of a folder that holds one,
by `grep -r`, `rg`, `ag`, `ack`, `find -exec`, `find | xargs` or the Grep tool;
and any use of a web tool or a sub-agent. Paths in shell commands resolve from
the folder the agent's shell is in, which persists between commands. Heredoc
bodies that are file content are skipped; shell heredocs are audited as shell
text, and other interpreter heredocs are scanned for path literals. The agent's
own session folder, where it saves long tool output, is allowed. Any other
outside path, including a root named by another command, is a warning, and
`report.md` lists every run with warnings for a person to review. When the agent exits or times out, the runner kills its whole process
group, so a server it started does not keep running.

A run where the agent fails before its first turn, writes no result, or cannot
start is an `agent-error`. It says nothing about the library, so the report
lists it but leaves it out of the pass rates.

## Grading

The grader is deterministic and has no LLM judge. It checks behavior that a
browser can observe: roles, names, text, focus and real input. Visual details in
a prompt, such as a destructive button style, are not graded; the screenshots
and axe counts show them. A result passes only if all four checks hold:

- `tsc -b` exits 0. The arm's own command decides this, not a parsed log.
- `vite build` exits 0 and writes `dist/index.html`.
- The task probe passes in headless Chromium against the built app, served from
  127.0.0.1. Requests and WebSockets to other hosts are blocked, except font
  files from Google Fonts (with a 3-second limit), so each arm renders with its
  own theme font.
- The page throws no uncaught error, at desktop or phone size.

The grader also records screenshots (desktop 1280×800 before and after the
probe, phone 390×844), axe WCAG 2 A/AA counts and console errors. Those are
evidence only and never change pass or fail.

## Statistics and cost

Each task runs `--reps` times per arm (default 3). The report gives each arm's
pass rate with a 95% Wilson interval, the difference between the arms with a
Newcombe interval, and passes per task. A difference whose interval contains 0
is noise. The intervals treat every run as independent, but runs of one task are
related, so with few tasks the true uncertainty is wider than the report shows.

`--budget-usd` caps the total. A run starts only if the money spent, plus the
per-run cap (`--run-budget-usd`) of every run in flight, plus its own cap, stays
within the total. Otherwise it waits for a run in flight to finish, and it is
recorded as `skipped-budget` only when it cannot fit with nothing in flight. The
agent stops at its per-run cap, but it checks the cap between turns, so one run
can go over its cap by part of a turn.

## Tasks

A task set is a folder under `tasks/`. Each task has three parts:

- `<id>.task.json`: the prompt. Write acceptance criteria as behavior a person
  can observe, and name the roles and labels the probe relies on. Never name a
  component or a library.
- `<id>.probe.mjs`: named steps that use only accessible roles, names, text and
  real keyboard and pointer input. The helpers are in `lib/probe-kit.mjs`. Hold
  keys with `press()`, not `keyboard.press()`: some widgets act on a focus move
  that a timer schedules after keydown, and they check that the key is still
  down.
- `reference/<arm>/<id>.tsx`: a correct solution for every arm.

`renderPrompt` in `lib/tasks.mjs` builds the one prompt every arm gets. Only
the library name changes.

## Running

```bash
# Free: check the controls, probes and references.
node internal/vibe-tests/eval/run.mjs --self-test

# 5 tasks × 2 arms × 3 reps = 30 agent runs. Pass a full model id, not an alias.
node internal/vibe-tests/eval/run.mjs --model <model-id> --budget-usd 15

# Rebuild the report from saved records.
node internal/vibe-tests/eval/run.mjs --report-only <run directory>

# Free: grade saved runs again with the current probes and audit.
node internal/vibe-tests/eval/run.mjs --regrade <run directory>
```

Use `--regrade` after a probe or audit fix. It starts no agent and keeps
each run's cost and transcript.

The run directory must be new or empty. A run writes `meta.json` (inputs, versions, control results), one record per
agent run in `records/`, each run's transcript, final `App.tsx` and screenshots
in `runs/`, and `summary.json`, `report.md` and `report.html`. Set
`VIBE_EVAL_AGENT_BIN` to use another `claude` binary.

## Self-test

`--self-test` grades every reference (each must pass) and the empty starter
(each must fail), in every arm. Run it after you change a task, a probe, an arm
or the grader. It calls no model.

```bash
node internal/vibe-tests/eval/run.mjs --self-test
```

It needs Node 22 or later, npm registry access and a Chromium build. Install
the grader's dependencies with `pnpm install` at the repository root, then a
browser with `pnpm -F @astryxdesign/vibe-tests exec playwright-core install
chromium`. Set `VIBE_EVAL_CHROMIUM` to use another Chromium build. When
`HTTPS_PROXY` is set, the grader uses it to reach the font hosts. The run
directory defaults to a new folder in the system temp folder. It must be
outside the repository.

## Refreshing an arm

Regenerate the arm with the commands above, at the new versions. Keep the empty
`src/App.tsx`, drop the README and the lint and format tooling, and align the TypeScript, Vite and
React versions with the other arm. Then run `--self-test`. A refresh changes
what the eval measures, so compare results only within one arm version.

## Known gaps

- Chromium only. WebKit and real touch devices are not covered.
- The integrity audit reads the commands in the transcript; it is not a
  sandbox. It fails only the forms listed under Agents. A command that reads
  inside a root while naming only the root (`git -C`, `cp -r`, `rsync`,
  `tar -C`, a subshell `cd`, `pushd`, a symlink), a read behind a variable or
  an encoded path, and a script the agent writes and then runs give a warning
  at most. Running each agent in an isolated filesystem would close this.
- One agent harness. Results describe that harness and model, not agents in
  general.
- This folder writes its own record schema (`schemaVersion: 1` in `meta.json`).
  It does not write the execution-provenance sidecars in
  `../docs/execution-provenance.md`, which describe the older pipeline.
- The `pilot` set (5 tasks) only shows that the pipeline works; fresh agents
  pass all of it in both arms. The `v1` set is the fixed comparison set:
  multi-step forms, paged tables with selection, menus, comboboxes, dialogs,
  switches, accordions and announced notifications. Run it with
  `--task-set v1`.
