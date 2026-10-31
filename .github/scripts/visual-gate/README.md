# Storybook visual regression

Every visual-regression test uses the shared Storybook framework and
`.github/workflows/ci.yml` → `pr-visual` (**Stable visual regression**). It runs
in `release-check`, which `main-heavy-lanes.yml` dispatches after merges to
`main` (a burst is checked once, at its newest commit) and the release gate dispatches before a cut; a pull request runs it only
with the `ci:heavy-lanes` label (AST-030 FR12, DEC-7).
[AST-030 FR12](../../../docs/specs/AST-030/spec.md) owns this requirement.
Add coverage to that owner, not to a new component, package, theme, scheduled,
post-CI, or post-merge workflow.

## Explicit release checks

Dispatch **CI** from `main` with `operation=release-check`. The event SHA is
immutable for the run; the request and final `release-check` join reject a
non-main ref or a SHA that is not an ancestor of current main. Later fast-forward
commits do not invalidate an earlier green run; a rewrite or divergence that
removes the checked SHA requires a new dispatch.

The existing Storybook build feeds the same **Stable visual regression**
(`pr-visual`), `pr-a11y`, and `pr-rtl` owners. Release scope is the closed full
stable visual plan, unfiltered accessibility roster, and all five unfiltered RTL
package shards. No changed-file, focused-component, or smoke scope applies.
`release-check` requires every owner and setup job to succeed; failed, missing,
cancelled, and skipped work is not release evidence.

This changes when and where release evidence runs, not finding policy: visual
`changed` still requires review, a11y fails on new baseline violations, and RTL
findings remain soft while report completeness is mandatory. The dispatch does
not capture baseline candidates, promote baselines, or publish previews. `visual-release-report` holds
the visual evidence for that exact run/attempt.

PR accessibility is intentionally smaller: explicit changed-component axe scope
(including grouped-folder owners), plus the fast modal-close, theme-var, and
story-play guards. Empty/shared scope never falls back to all stories, and
missing or approximate analysis fails rather than granting an empty scope.
The full axe roster, whole-repository accessibility spec-test contracts and their
pixel/evidence uploads run only during `release-check`.

Release callers must bind the CI run/attempt and all three job outcomes to its
exact main SHA, and confirm that SHA remains an ancestor of current main before
release mutation. The public
[Release Process](https://github.com/meta/astryx/wiki/Release-Process) uses
the same checked-SHA boundary; later fast-forward commits are next-release input.

## Coverage and results

Stable Core components use representative stories and explicitly tagged stories.
Shipped theme changes use their relevant accepted matrix. Shared stable scope
uses the full canonical plan in the same CI owner, rather than delegating to a
daily workflow. Packages with `astryx.canaryOnly: true` have no stable visual
baseline; their existing unit, Storybook, accessibility, and RTL checks remain.

Story tags declare additional coverage next to the example:

```tsx
export const CustomSeparator: Story = {
  tags: ['visual-baseline'],
  render: () => /* ... */,
};
```

The representative story needs no tag. `visual-baseline` adds a default-theme
contract; `visual-theme-matrix` opts the story into every accepted theme.
Behavioral/audit-only fixtures need no visual tag. `no-visual` excludes unstable
stories. Ordinary focused PR plans use existing baseline keys; adding or pruning
keys requires explicit full-plan baseline maintenance.

- `pass`: the compared frames did not change.
- `changed`: review the before/after/diff report and record whether the rendering
  is intentional. A change is not automatically a regression.
- `failed`: capture or comparison failed. Missing evidence is not passing evidence.
- `skipped`: no comparison was performed; the reason is explicit. It does not
  imply a separate workflow covered the change.

The `visual-pr-report` artifact belongs to the exact CI run. A rerun of only
the failed jobs keeps the artifacts of the jobs that passed, so the report can
come from an earlier attempt of that run, never a later one.
`pr-comment.yml` only publishes its report: it checks identity, bounds JSON and
image sizes, re-encodes PNGs, and renders escaped HTML from default-branch code.
It does not execute artifact HTML, run a browser, compare pixels again, change
a baseline, or create another visual status. Its only status is `PR Comment` on
the pull request head, which says whether a report step failed.

Deployment previews and `vibe-screenshots.yml` remain separate because they do
not run visual regression.

## Explicit baseline maintenance

Maintenance uses **CI**, not another workflow. Dispatch from `main`:

1. Choose `operation=capture`. The same `pr-visual` owner builds Storybook on the
   pinned Linux runner and captures the full canonical plan: representative and
   tagged Core stories in Neutral plus generated Probe coverage.
2. Review that run's report and capture. A browser-version mismatch can make the
   comparison fail while still producing a complete candidate capture; inspect
   the rendering rather than accepting it merely to clear a check.
3. Download that exact run/attempt's validated candidate artifact. In a dedicated
   branch, run `gate.mjs accept` with the checked-in baseline, candidate directory,
   reviewed keys (or `all`), and an explicit reason; use `--prune` only when the
   full-plan removal checks permit it. Open a normal pull request containing only
   the reviewed baseline delta.

The pull request is the publication and decision record. `gate.mjs accept`
revalidates the candidate verdict and hashes before writing the compact index and
selected PNGs. It never recaptures, promotes automatically after merge, or writes
to GitHub Pages. Partial captures cannot become complete baseline candidates.
Bootstrap, coverage changes, and browser refreshes use this same path; none is a
release gate.

The shared promotion boundary accepts `pass` or `changed`. A failed comparison
is eligible only for the validated browser-only refresh: every baseline and
captured key is selected, platform and viewport match, every PNG matches its
manifest hash, and there are no capture failures or removals. Missing, unreadable,
skipped, unknown, partial, or otherwise failed evidence is refused before writes.

## Local debugging

```bash
pnpm build && pnpm -F @astryxdesign/storybook build
pnpm visual:plan
pnpm visual:check --baseline .github/visual-baseline --out .visual-run
open .visual-run/report/index.html
```

CLI exit codes: `0` clean, `1` crashed, `2` changed. `gate.mjs release` selects the
closed full canonical plan used by broad PRs, release checks, and maintenance.
`gate.mjs accept` is an explicit local write. A reviewed baseline refresh is
committed through a normal pull request; local captures must not overwrite the
checked-in baseline without that review because platform and browser differences
can make them incomparable.

## Determinism and storage

Capture fixes the viewport, scale, clock, timezone, fonts, and animation end
state, and blocks off-origin requests. Storybook's channel selects theme and
color mode. Each story starts in the default light theme before switching
variants. Canonical PNG encoding avoids treating encoding metadata as pixels.

The baseline is versioned at `.github/visual-baseline/`. Its move into the
repository and removal of the old branch writer belong in one change: splitting
that ownership transfer would temporarily leave either two authoritative write
paths or no durable comparison oracle. Pull-request reports, including their
before/after/diff images, remain GitHub Actions artifacts for 30 days. The
release check and baseline-candidate artifacts retain their existing independent
lifetimes. GitHub Pages is not evidence storage.

## Drift guard

`pnpm check:visual-owner` runs inside `pnpm check:repo` and the existing lint lane.
It rejects independent visual-regression commands, known visual runners,
package-script aliases, named visual-regression jobs, and visual artifact
producers outside `ci.yml`'s owner. It deliberately permits report-only downloads,
Storybook deployment artifacts, accessibility/RTL reports, and vibe screenshots.
This is a narrow ownership tripwire, not a shell interpreter or a blanket ban on
Playwright, screenshots, or artifact actions.
