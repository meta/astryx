# Vibe eval

The vibe eval asks one question: **when a fresh coding agent builds a small UI
with Astryx, does the result work as often as when it builds the same UI with
shadcn/ui?**

The eval measures the delivered result in a real browser. It does not score
code style, unlike the static scores of the older nightly pipeline in `../src`.

This folder has the arms, the tasks and the deterministic grader. It does not
start agents yet. `--self-test` proves the grader on every task.

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
- The `pilot` task set is small. It shows that the pipeline works and gives
  wide intervals. A comparison needs a larger fixed set.
