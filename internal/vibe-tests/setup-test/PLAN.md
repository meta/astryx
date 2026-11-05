# Setup test — zero-damage Astryx adoption in established apps

**Status:** integrated preparation and measurement harness. No executor runs or model findings are committed here.

## Goal and hard stop

The goal is zero unintended host damage. Installing Astryx alone must not change any existing host radius, color, typography or font metric, spacing, shadow, border, geometry, color-mode behavior, or layer order. A requested insertion or replacement may change only that explicitly named surface.

`cosmetic-drift` remains a useful diagnostic label, but it is a failed run. The iteration loop may use failures and per-dimension deltas to refine candidate instructions; it does not authorize shipping. Candidate instructions stop and ship only after a separate final confirmation has **100% valid runs classified `clean` with task-specific success** across every supported fixture × prompt × harness/model bundle × repetition. The final confirmation permits no broken, noisy, silent-damage, or cosmetic outcomes; missing probes; visible variable, contrast, layer, overlay, or geometry regressions; escape hatches; or post-run manual edits.

A classified stochastic infrastructure failure may be rerun only under the preregistered policy in `matrix.json`. The failed attempt remains recorded. A real agent failure is a valid failing run and may not be retried away. The configured Codex bundle is blocked by an upstream empty-turn issue, so final confirmation cannot start or claim all configured bundles until that blocker clears.

Damage in the directed `direct` control is a product gap. It blocks candidate-instruction shipping; it is not an accepted limitation or a documentation result.

## Canonical fixtures

Every run starts from the shared immutable fixtures in `../fixtures/`:

- `tailwind-v4-control` — a plain React, Vite, and Tailwind v4 app with only background/foreground semantics.
- `shadcn-tailwind-v4-established` — an established shadcn-style Tailwind v4 token vocabulary and card/form/table/status surface plus a portal dialog with independently controlled tooltip and menu portals.
- `enterprise-scoped-synthetic` — an original dense app with explicit light/dark control, non-shadcn tokens, a guest design-system subtree, and a guest-scoped portal dialog whose nested menu crosses the host boundary.

`run-setup.mjs` validates each fixture recipe and hash manifest, copies the fixture into a run sandbox, and never writes to committed fixture source. Tailwind v3 remains explicitly deferred until the v4 controls and measures separate.

## Tasks

The basic setup tasks remain: install-only proof (`s0`), button insertion (`s1`), status replacement (`s2`), and selector replacement (`s3`). `s0` deliberately measures the new proof component separately from every pre-existing host probe.

The two composition tasks run on different established fixtures:

- `s4`: an Astryx tooltip and selector popup inside the existing Tailwind/shadcn dialog;
- `s5`: the existing Tailwind menu inside a new Astryx dialog in the scoped enterprise fixture.

Each task declares stable task-owned `data-vibe-result` markers. They are measurement hooks, not implementation hints. The evaluator uses them to verify exact presence, task completion, keyboard reachability, visibility, clipping, center hit-testing, stack order, and—where host surfaces move into an Astryx dialog—baseline host-token styling. Fixture-owned `data-vibe-probe` markers remain the host baseline and may not be repurposed. Container text protection compares full normalized text from unmarked host descendants while excluding nested probe, result, and replacement subtrees. Each intentional replacement names exactly one fixture probe, requires the original probe to be absent afterward, and names a result that preserves its host text. Other allowances are fixture- and field-specific: a host allowance may permit only exact position coordinates, the block-axis growth a mandated insertion causes, and—declared separately as `textInsertionOnly`—text a container _gains_, never text it loses or rewrites; an overlay allowance may permit only exact bounds. They never exempt host or overlay computed styles, a container's width, or an entire neighboring probe.

## Controls

`conditions.json` defines four ordered controls. Astryx is preinstalled in none of them.

| Condition   | Purpose                                                                             |
| ----------- | ----------------------------------------------------------------------------------- |
| `floor`     | Task only; no added setup pointer.                                                  |
| `current`   | A pointer to the current public CLI documentation.                                  |
| `candidate` | Current pointer plus proposed existing-app guidance.                                |
| `direct`    | Exact installation edits; any residue identifies a product gap and blocks shipping. |

Guidance is committed into the sandbox baseline before execution, so the resulting diff contains only executor work.

## Established-app strategy pilot

Two further conditions explore strategies for an application that already has an established visual language. They are additive and opt-in: the four controls above, their evidence, and their cell identities are untouched — every pre-existing stage keeps its exact expansion count and its exact cell ids, and a strategy is reachable only from the new stages that name it — and no default, core, or greenfield behavior changes as part of this pilot. Normal greenfield Astryx adoption is exactly what it was.

| Condition         | Strategy                                                                                                                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `host-aligned`    | The established host stays authoritative. The app owns a theme extending neutral instead of importing a stock theme stylesheet, matching host body/heading/code fonts and host semantic color and mode pairs, built deterministically by the app's own build. |
| `guest-contained` | The host keeps global preflight and tokens. The reset is not imported and the provider wraps only the new or migrated subtree, so the design system stays inside that region.                                                                                 |

Each strategy condition carries the discovery pointer plus its own self-contained strategy document. A strategy is deliberately **not** combined with `patch:existing-app`: the two strategies disagree with parts of that generic recipe — `host-aligned` replaces the stock theme stylesheet and `guest-contained` withholds the reset — and combining them would hand the executor contradictory instructions and make the measurement unreadable.

The two are not product equals, and the neutrality this pilot maintains is methodological rather than positional. `host-aligned` is the normal objective for an established app: the host stays authoritative, the whole recipe runs on supported public API, and its cost is maintenance — an app-owned theme that has to track the host's own tokens, and the stock visual identity given up. `guest-contained` is the exceptional mechanism, for an application whose global ownership cannot move and where containing the design system to one nested sub-scope is a hard requirement of the work. It has no fully supported path today: scoping to a subtree depends on suppressing a root attribute sync no public API exposes, and it pays the portal cost described below. It therefore runs as much as a probe of those two product gaps as it does a recipe to follow, and it is not an equal default. What stays neutral is the measurement: the pilot characterizes both strategies per failure category, emits no combined score, and does not rank them.

### Product gaps this pilot surfaces

Two findings, both recorded rather than accommodated. The evaluator is not relaxed for either of them: the affected canonical cases fail acceptance, and that failure is the result.

**1. A theme cannot opt out of bare-element rules.** Every built theme emits a prose block — `h1`–`h6`, `p`, `small`, `code`/`pre`, covering family, size, weight, line height, and color, plus an `hr` rule that replaces the host's border — into `@layer reset`, `@scope`'d on the theme-name attribute. This is emitted regardless of which tokens the theme overrides; a theme that changes only a single color still carries the full typographic scale. `host-aligned` additionally requires the theme attribute at document scope before first paint, so the design system's scale necessarily reaches the established host's bare elements. On a host whose bare elements differ from that scale, the result is host damage that no supported configuration avoids. Matching the host exactly would require the theme to reproduce the host's entire type scale, which is only possible when the host's scale is known and static.

**2. A provider cannot be prevented from claiming document scope.** A provider with no provider above it is a root provider, and a root provider synchronizes `data-theme` and `data-astryx-theme` onto the document element. Because theme CSS is `@scope`'d on that attribute, the sync is what lets theme tokens reach content portaled outside the provider's subtree. The provider's public props are `theme`, `mode`, and `children`; none opts out. The strongest mechanism available today is removing the attribute after mount and keeping it removed with a `MutationObserver` — a workaround, not a configuration — and it costs theming for body-portaled surfaces. The canonical `guest-contained` implementation carries that workaround, labels it as one, and documents the tradeoff at the callsite.

Gap 1 is the most serious: it means "the established host stays authoritative over typography" is not currently achievable through supported configuration whenever the host renders bare prose elements. It is now the only thing keeping `host-aligned` from acceptance, and it is a real product gap rather than an evaluator artifact. `guest-contained` does reach acceptance, at the portal cost in gap 2 — but acceptance is the measurement's verdict on host damage, not a product recommendation: it is reached by way of the unsupported workaround in gap 2, so the reading is that gap 1 blocks the supported strategy while gap 2 is the price of the exceptional one.

### The evaluator defect this pilot found, corrected here

`astryx theme build` emits, for any theme with `light-dark()` values, `:root { color-scheme: light dark; }` paired with `html[data-theme="light"] { color-scheme: light; }` and its dark twin. Those rules implement mode support, but the `dark-mode-disabled` escape hatch matched a bare `color-scheme: light` lexically, so any app shipping a built theme tripped the check — as did an established host that merely re-indented its own light arm. That is an evaluator defect rather than a product gap, so it is fixed rather than recorded.

`color-scheme` is now read semantically. A single-mode declaration is exempt only as a **paired mode arm**: its own selectors and at-rules scope it to exactly one mode, its value is that same mode, and the complementary arm exists at the same scope in the same file. Generated files are not ignored as a class — a file claiming an `@generated by astryx theme build` header is checked against that claim (the declared source must be a relative path inside the sandbox that still exists, and the artifact must sit where that build writes it), a file that lost a mode line in the same change gets no exemption at all, and every other escape hatch is scanned inside generated artifacts exactly as before. Forcing a host to one fixed scheme, rewriting one arm of a pair, dropping an arm, and pinning `:root` beside a real pair all still fail. No other stage's evaluator behavior changes.

### What the first pilot run found, corrected here

The first operator run (10 of the 80 cells: one bundle, one repetition) exposed five more evaluator defects and one instruction defect. All six are corrected here; none of them relaxes what the evaluator considers host damage.

**1. `hardcoded-important` read prose as code.** The check matched `/!\s*important/i` against every added line of a host source file. Three of the ten cells failed on a JSDoc comment — the `guest-contained` guidance tells an executor not to paper over the portal tradeoff with `!important`, the executor wrote that reasoning down beside the workaround it chose instead, and the check failed the run for saying it. The flag is now found by parsing rather than by matching: stylesheets go through postcss, where `Declaration.important` is the parser's own answer and a comment is a `Comment` node; scripts go through the TypeScript parser, where comments are trivia and only string and template literals are examined; HTML, Vue, and Svelte are split into their `<style>` blocks, `style` attributes, and `<script>` blocks. Ignoring comments and prose does not open a way through: a literal counts when it contains a declaration carrying the flag, when it is the value of a real CSS property (taken from `CSSStyleDeclaration` rather than a hand-written list), or when it is the priority argument of `setProperty`, which the old scan could not see at all. An unparsable stylesheet falls back to a scanner that skips only comments and quoted strings. Mutation proofs cover a style object, a JSX inline style, a CSS-in-JS template, an interpolated declaration, an injected stylesheet string, a `cssText` write, a runtime `setProperty`, and an override written directly beneath — and on the same line as — the comment that disclaims it.

**2. The `s5` contract had no allowance for the insertion the task mandates.** `s5` requires a new Astryx dialog, so the executor must put a trigger for it in the host page. Both `s5` cells added a block to the host shell and both reported the identical eight regressions — `height`, `geometry.height`, `geometry.bottom`, and `text`, in light and dark — for doing what the task said. The contract now allows exactly those, on exactly that probe: the shell's height and the two geometry fields height moves, plus text the shell _gains_. `textInsertionOnly` is deliberately not the same as putting `text` in `fields`: every baseline word must still be present in its original order, so a container that may grow still cannot lose or rewrite the host's own copy. Nothing else moves — the shell's position, its width, every computed style on it, and every other probe stay exact, and `text` has been removed from the exemptible host fields entirely so no contract can ever wave the comparison through. Canonical browser cases prove the mandated reflow passes, and mutation proofs over that same measured run prove a nearby color, font, radius, shadow, or padding, the shell's own width or position, another probe's geometry or color, and any lost host copy all still fail.

The same gap existed one container in. `s5` mandates exactly one visible `astryx-dialog-trigger`, and this fixture declares a guest subtree for guest design-system content, so that is where the trigger belongs — and where two independent reps put it. Both grew `guest-boundary` from 296px to 409px, moving its height and the two geometry fields height moves, in both schemes. That is the insertion's own geometry, so the contract now allows those three fields on that probe too. It is narrower than the shell's: the trigger is task-owned, so the boundary's protected text already excludes it and the allowance names no text exemption at all. The boundary's width, its position, its every computed style, and every other probe stay exact, proved the same way — a canonical browser case that inserts the trigger into the guest subtree and measures the real app, and mutation proofs over that measured run for a color, a font, the boundary's width, the boundary moving, a neighboring probe's height, and host copy the boundary either gains or loses.

**3. `gitignore-modified` was right; the instruction was wrong.** Two `host-aligned` cells added the generated theme artifacts to `.gitignore` and failed the escape hatch. The hatch is not weakened, here or anywhere: an executor may not rewrite ignore rules after the execution baseline. What was missing is the instruction. The guidance said the theme is built deterministically and never said the output is a tracked file, while this app's own history commits its generated theme artifacts. `host-aligned` guidance now requires committing both the theme source and everything the build writes from it, forbids adding that output to `.gitignore`, and answers the argument both executors actually made — that a regenerated file need not be tracked. Those two cells remain failures: they are an instruction failure and an agent failure, not an evaluator defect, and they have to be rerun under the corrected guidance rather than rescored.

**4. Measuring mutated the sandbox it measured.** _Historical: the fault is real and stands, but the fix described here was **superseded by item 5 below** before any of it shipped. The link-mirrored `node_modules` is not the current construction — read item 5 for what the build root actually does._ The measurer ran `pnpm build` inside the agent's own sandbox. That tree is the attested artifact — the runner digested those bytes, integrity reads them, and any re-measurement or recovery has to read them again — and the build overwrote it: `prebuild` regenerates the app-owned theme over the executor's copy, `vite build` writes `dist/`, the CLI appends to its invocation log, and the bundler caches into `node_modules`. A failed build leaves the same debris, so a measured cell no longer hashed to its own digest and its evidence could not be re-derived. The build now runs in a disposable copy. Symlinks are reproduced as symlinks so resolution is unchanged, and — in this first cut, since superseded — `node_modules` was mirrored with one link per package rather than copied or hardlinked, on the reasoning that a hardlinked file rewritten by a build writes through to the original inode while a mirrored directory catches the write in the copy. The build root is removed on every path out, including a thrown measurement. Tests take a full byte-and-mtime manifest of the sandbox before and after a real measurement and require it identical for a successful build, a failing build, and a thrown one; a mutation proof runs the old in-place build and shows the manifest reports it. Measurement output is unchanged: stable fixture ids, no private paths, and the build root redacted alongside them. Tests take a full byte-and-mtime manifest of the sandbox before and after a real measurement and require it identical for a successful build, a failing build, and a thrown one; a mutation proof runs the old in-place build and shows the manifest reports it. Measurement output is unchanged: stable fixture ids, no private paths, and the build root redacted alongside them.

**5. The build root mirrored the virtual store instead of copying it.** The first cut of the build root symlinked each `node_modules` entry to the original, which for a pnpm install means `.pnpm` — the virtual store holding every real package tree — was a link back into the sandbox. Writing through a symlink writes to its target, so an install or a rebuild in the copy rewrote the sandbox's own store, and the top-level package links resolved into it as well. The copy is now a real copy: files are copied with `cp -a --reflink=auto`, which shares extents copy-on-write where the filesystem supports it and byte-copies where it does not, and never hardlinks — a hardlinked file rewritten in the copy rewrites the original inode. Symlinks keep their target text, so `is-odd -> .pnpm/is-odd@3.0.1/node_modules/is-odd` and every dependency link inside the store now resolve within the copy; an absolute link that would reach into the sandbox is retargeted onto the copy, while one pointing at a workspace package elsewhere is left alone. `verifyWorkspaceIsolation` re-derives the claim from the finished copy — every symlink resolved, and inodes compared against the original — and the measurer runs it before any build. Tests build the fixture with a real `pnpm install`, then require the sandbox's full manifest, virtual store included, to be byte-identical after a successful build, a failing build, and an install in the copy that deletes and recreates `.pnpm` entirely; the pure-Node copier is exercised the same way. The mutation restores the old mirroring and shows the sandbox is written through and the isolation check names it, and a hardlinked copy is caught by the same check.

**6. The report spelled four different failures the same way.** `verdict` collapses measured host damage, an escape hatch, a task failure, and a broken measurement into `silent-damage`, which is right for a gate and useless in a report: an `!important` misread from a comment and a repainted host arrived as the same word. The score now also carries a failure breakdown — `hostDamage`, `runtime`, `integrity`, `task`, `telemetry` — and the per-cell table names the cause beside the verdict. Separately, a strategy is never called cleaner on the strength of a run its executor did not complete. `host-aligned` measured `clean` on an `s4` cell that was an agent failure, because nothing damaged the host once the work stopped; those runs are now reported as not completed, excluded from the clean and comparable counts, and named as cells needing a rerun.

### What the four remaining pilot failures were, and what each one is

Ten cells ran; six were accepted. The four that were not have been analyzed
against their patches, measurements, task contracts, and the cells that passed
beside them. They are four different things, and only one of them is the host
actually changing.

**1. `guest-contained` / `enterprise-scoped-synthetic` / `s1` — measurement.**
Two host-text regressions on `guest-boundary`, both schemes: the container's
protected text gained `Roll out the selected services`. That string is the
`tooltip` on the mandated Astryx `Button`. Astryx renders a `Button`'s tooltip
as a `display: none` sibling — hoisted out of the button, because a button
cannot legally contain it — linked back by `aria-describedby`. The container's
text excludes `data-vibe-*` subtrees, so it could not see a task-owned overlay
sitting outside the task-owned element, and counted the mandated control's own
unrendered tooltip as host copy. Nothing on screen changed. `protectedText` now
counts only text the browser renders. This is not a hole: removing, rewriting,
or hiding host copy all still change the string, and only invisible _additions_
stop counting. Proven both ways in `setup-measure.browser.test.mjs`, and the
sandbox re-measures with zero differences against its baseline.

**2. `guest-contained` / `shadcn-tailwind-v4-established` / `s4` — measurement.**
One colour regression on `primary-action`, dark scheme:
`oklch(0.985 0 0)` became `oklab(0.985 0 0)`. Those are the same colour; only
the spelling differs. The fixture's button carries `transition-colors`, the
harness's own interaction clicks that button to open the host dialog, and
probes were read immediately afterwards — inside the 150 ms transition window,
where `getComputedStyle` returns the interpolated value serialized in the
interpolation colour space. Reading the built app at rest returns `oklch` in
both schemes; reading it straight after the click returns `oklab` with one
running animation. It reproduced in four independent measurement passes because
the window is decided by how long the app's own bundle takes to respond, which
is stable per app — deterministic for one app and never for another, which is
worse than flaky. Probes are now read after running CSS transitions settle.
Only `CSSTransition` is awaited, so an infinite decorative animation cannot
hang a measurement.

**3. `host-aligned` / `shadcn-tailwind-v4-established` / `s1` — never tested.**
Zero measured damage, task complete, blocked solely on `gitignore-modified`.
The rule against ignoring generated theme output was already written, and the
question was why the executor missed it. It did not miss it: **the rule is
absent from every one of the five host-aligned sandboxes the pilot produced.**
It was written into the guidance after those runs. Each run records a digest of
the guidance it was handed, and the digest recorded for these cells does not
match the digest recomputed from the current text. So this is not instruction
ambiguity and not an agent failure — the instruction has never actually been
delivered to an executor, and the rerun is its first test rather than a second
attempt. The rule is unchanged in substance; it is now also stated before the
reasoning, where a reader meets it first.

**4. `host-aligned` / `enterprise-scoped-synthetic` / `s5` — instruction.**
`gitignore-modified` as above, plus a genuine finding:
`host-menu-surface:host-style` in both schemes. The host menu, composed inside
the Astryx dialog the task mandates, lost the host's violet palette —
background, all four border colours, and text colour fell back to the app's
global values. This is not Astryx repainting anything. The fixture scopes that
palette to `[data-guest-design-system]`, the baseline menu is a descendant of
that region, and the relocated menu is not; `popover` promotes it to the top
layer, which changes where it paints and not where it inherits from. It is
reproducibly avoidable: the `guest-contained` cell on the same fixture, the
same prompt, and the same contract matched the host surface exactly, by putting
that scoping attribute on the relocated element. `host-aligned` guidance now
covers host markup composed inside a design-system overlay. The same hazard
exists under `guest-contained`, where it was solved by discovery rather than by
instruction; that document is deliberately left alone here.

Nothing above weakens acceptance. No zero-damage rule is relaxed, no field is
blanket-allowed, no contract gained an exemption, and `gitignore-modified`
stands exactly as it was. Two of the four are corrections to how the host was
measured; two are about what the executor was told.

### One thing the pilot measured that is not a failure and is not fixed here

Every one of the ten cells, under both strategies, newly defines `--color-*`
custom properties on the document root that the baseline did not define. The
measurement records this as `variablesCaptured`, which is reported and
deliberately does not gate.

It reads differently per strategy, and both readings are worth keeping in view:

- Under `host-aligned` the values are the host's own — `#2457d6` where the
  enterprise fixture's accent is `#2457d6`, `oklch(20.5% 0 0)` where shadcn's
  primary is `oklch(20.5% 0 0)`. The app-owned theme is doing exactly what the
  strategy asks of it.
- Under `guest-contained` they are Astryx's stock defaults — `#0064e0` and its
  neighbours — sitting in the host's root scope in a strategy whose whole claim
  is that it does not put design-system values there. Containment holds for the
  `@scope`'d theme rules, which is what the `data-astryx-theme` workaround is
  for, and does not hold for the Tailwind token layer, which is emitted at
  `:root` unscoped and is not covered by the workaround at all.

No cell was damaged by it: none of the three fixtures has a host element
resolving `var(--color-accent)` at root, because each defines its own token
names. A host that did would be repainted, and neither strategy document
currently says so. Deciding what to do about it — measure it as damage, scope
the token layer, or document it as a bound on the guest-contained claim — is a
larger question than the four cells this iteration reruns, so it is recorded
here and left open rather than answered by widening a gate.

### Rerunning those four cells without moving the pilot

The pilot's ten cells keep their ids, their measurements, and their verdicts. A
rerun under the same ids would overwrite the very evidence that justified these
changes, so the reruns carry new condition ids — `guest-contained-r2` and
`host-aligned-r2`, each declaring what it revises and what changed — and land
in their own `strategy-iteration` stage. Stage cell identity is
`stage__condition__fixture__prompt__bundle__rep`, so no rerun can collide with a
pilot cell, and tests hold every earlier stage's expansion at its exact count.

The stage carries an explicit four-cell allowlist rather than a cross product,
which for two conditions over two fixtures would be eight. `comparisonMapping`
pairs each rerun with the pilot cell it reruns, the finding it addresses, and
whether guidance, measurement, or delivery changed for it. A rerun that passes
retires that finding; a rerun that fails leaves the pilot's failure standing and
says the correction was wrong.

### What the first iteration run found

Two of the four reruns passed, which retires two findings: the host-text
regression on `guest-boundary` and the dark-mode colour on `primary-action` were
both measurement faults, and with those corrected the cells are clean. The
`gitignore-modified` rule, delivered to a sandbox for the first time, was
followed. Two cells did not pass, for two unrelated reasons.

**1. `guest-contained-r2` / `enterprise-scoped-synthetic` / `s1` — the install
never completed.** Not a host-damage result at all: the build failed, so
nothing about the strategy was measured. `@astryxdesign/core` ships a
`postinstall`, and pnpm 11 refuses to install a dependency with an install
script until that dependency is approved:

```
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @astryxdesign/core@0.5.2
```

The executor wrote `pnpm.ignoredBuiltDependencies` into `package.json`. Verified
directly against pnpm 11.24, the supported mechanism is `pnpm approve-builds`,
which writes an `allowBuilds` map into **`pnpm-workspace.yaml`**:

| Placement                           | Key                         | Result                       |
| ----------------------------------- | --------------------------- | ---------------------------- |
| `pnpm-workspace.yaml`               | `allowBuilds: {pkg: true}`  | installs, `postinstall` runs |
| `pnpm-workspace.yaml`               | `allowBuilds: {pkg: false}` | installs, script skipped     |
| `package.json` → `pnpm.allowBuilds` | same map                    | **ignored**, install fails   |
| either file                         | `ignoredBuiltDependencies`  | **ignored**, install fails   |
| either file                         | `onlyBuiltDependencies`     | **ignored**, install fails   |

Three of the four executors in that run got there unaided, mostly by running
`approve-builds`; one did not. The `guest-contained` document now names the
command, the file, and the two plausible keys that do not work. The shared
discovery pointer is deliberately untouched: adding install mechanics to it
would change what the `current`, `candidate`, and `direct` controls measure, and
`floor` is supposed to receive no guidance at all.

`pnpm-workspace.yaml` is also the neutral place for it. npm and yarn ignore that
file, so approving a pnpm build leaves no pnpm-specific configuration in the
manifest those tools read.

Nothing in this suite caught the hazard because the canonical harness installs
fixture dependencies with `--ignore-scripts`, which sidesteps approval entirely.
There are now canonical cases that install the way an executor does.

**2. `host-aligned-r2` / `enterprise-scoped-synthetic` / `s5` — the boundary
rule was read and misapplied.** The relocation guidance added in the previous
revision was delivered and the executor acted on it: it carried the host's
`fixture-shell` class and `data-mode` attribute onto the relocated menu. Those
are the host's _mode_ hooks. The attribute scoping the _palette_ —
`data-guest-design-system`, which in this fixture sits on the surface element
itself — was dropped, so the menu left the token region and fell back to the
app's global values, exactly as before.

That is an instruction failure rather than an executor failure: "find what
scopes that surface's tokens" was one line in a section far down the document,
and an app having one hook for mode and a different one for a region is common
enough that picking the wrong one is the expected mistake. The rule is now one
of the document's stated non-negotiables, and it carries a procedure — work
backwards from the properties behind the surface's classes, find every rule that
redeclares them, and the non-global one is the boundary — with an explicit
warning not to assume the mode hook is the palette hook.

The measurement was also at fault for being undiagnosable. A dropped boundary
and a genuine repaint are different problems with opposite fixes, and both
arrived as `host-style`. Each measured surface now records which host token
scopes it sits inside, and a mismatch against the reference reports as
`host-boundary`, separately from the colours. Those scopes are declared per
fixture in `probes.json`, because which selector marks a region is a fact about
that host's CSS: an executor is never told it, and the guidance teaches
discovery rather than naming it.

Restating the region's colours on the moved element is explicitly not a fix, and
cannot buy a pass: it produces a surface that matches today and desynchronizes
the next time the host retunes its palette. A mutation proof holds that line —
colours restated to match, boundary still gone, `host-boundary` still reported —
and its converse holds the other, where keeping the boundary does not excuse a
real repaint.

### Two harness faults found alongside those cells

Neither is about a strategy; both distorted or blocked measurement.

**The local file server was bound to one address and fetched at another.**
`server.listen(0, …)` with no host binds the wildcard — `::` wherever Node has
IPv6 — while the page fetch was a hardcoded `http://127.0.0.1:<port>`. Those
agree only where the host maps v4-in-v6; where they do not, every page load
fails to connect and the run looks like a broken app. The operator worked around
it by running the whole measurer inside a network namespace with loopback forced
up. Nothing about measuring a built app needs that. The server now binds IPv4
loopback explicitly and the origin is read back from the socket, with a wildcard
rewritten to the loopback of its own family and IPv6 literals bracketed.

**Toolchain preflight verifies a profile shell, which is not what a hosted child
necessarily gets.** The runner invokes measurement through `bash -lc`, a login
shell, which on the machine used here resolves Node 24.20.0 and pnpm 11.24.0
from the user profile. A non-login shell on the same machine resolves a
different Node and no pnpm at all. So a green preflight attests to the profile
shell it ran in, not to the environment of a child process started some other
way. No claim is made here about what Node version a hosted child receives:
that has not been audited, and the two shells demonstrably differ. A runner that
depends on the profile toolchain should invoke a login shell explicitly or pin
the toolchain, rather than assume the preflight covers it.

### Rerunning those two cells

Same rule as before: nothing already recorded moves. The reruns take new
condition ids — `guest-contained-r3` and `host-aligned-r3`, each naming the
revision it supersedes — and land in `strategy-iteration-2`. Revisions chain, so
the lineage of every cell is readable from the conditions file, and tests hold
every earlier stage at its exact count: 48 / 400 / 112 / 80 / 4.

## Measurement and integrity

All conditions use the same evaluator against a pristine copy of the same fixture in light and dark modes:

1. Typecheck and production build.
2. Console, page, and failed-request errors.
3. Exact computed-style comparisons for color/background; per-side border color, width, and style; all four radii; shadow; font family, size, weight, line height, and letter spacing; per-side padding and margin; gaps; dimensions; position; and transform.
4. Exact `getBoundingClientRect()` snapshots after Chromium values are serialized to 1/64 CSS px, the browser's subpixel grid. This is normalization, not a pass tolerance: normalized values must match exactly.
5. WCAG AA contrast regressions, color-mode behavior, emitted cascade order, and visible consequences of changed host variables. Variable changes alone remain diagnostic only when every marked host computed style and geometry snapshot is unchanged.
6. Existing host overlays and both cross-system composition directions: presence, keyboard reachability, visibility, viewport intersection, clipping ancestors, center hit target, top-layer state, and stack order above dialog and backdrop.
7. Task-specific output markers and semantics, kept separate from host baseline probes.
8. The executor's source diff. The evaluator rejects deleted or wholesale-replaced host files, blanket resets, hardcoded `!important`, disabled dark-mode behavior, missing Astryx use, missing requested composition, and changed/deleted host probes or overlays. Replacement is judged on content, not on raw diff lines: lines are compared with their indentation and interior whitespace normalized, so wrapping a component tree in a provider — which re-indents every line under it — deletes nothing, while minifying or rewriting a file still deletes all of it. Disabled dark mode is judged semantically: a single-mode `color-scheme` declaration passes only as one arm of a mode-scoped light/dark pair in the same file, so a built theme is clean while forcing one fixed scheme still fails. A hardcoded `!important` is judged syntactically: the flag is found by parsing the file, so a comment or a prose string that names it is silent while a declaration that carries it fails wherever it is written — in a stylesheet, a style object, a CSS-in-JS value, an inline style, a `cssText` write, or a `setProperty` priority argument.
9. A runner-recorded agent diff digest. The evaluator only measures; it never patches. A missing or mismatched digest is post-run manual intervention and fails acceptance. Measuring never writes to the sandbox either: the agent's tree is the attested artifact, so it is copied into a disposable build root and only the copy is built and served. The copy is copy-on-write where the filesystem allows and a byte copy where it does not, never a hardlink, and every symlink — the package links of a pnpm virtual store above all — resolves inside the copy, so a build's own writes — a regenerated theme artifact, `dist/`, an appended CLI log, a bundler cache — land in the copy. The original's bytes and modification times are unchanged whether the build succeeds or fails, so a cell still hashes to the digest that attested it and can be re-measured or recovered from those same bytes.
10. Public artifact safety. Measurements use stable fixture identifiers instead of local app paths, redact private paths and hosts from diagnostics, normalize provenance usage sources to a generic label, and fail closed before setup or universal aggregate reports can emit private path data.

Verdicts remain `broken-build`, `noisy`, `silent-damage`, `cosmetic-drift`, and `clean`. `passesAcceptance` is true only when the verdict is `clean`, the task contract succeeds, no escape hatch is present, and the measured diff exactly matches the runner's agent-output digest.

The verdict is a gate, not a description. Several unrelated failures reduce to `silent-damage`, so every report also carries the failure kind — `hostDamage`, `runtime`, `integrity`, `task`, `telemetry` — and names it beside the verdict. Only `hostDamage` means the host changed.

## Exploratory iteration rule

The guidance report compares current and candidate runs cell-for-cell and prints candidate-minus-current deltas for every hard dimension: build, runtime, task completion, color, font, radius, border, shadow, geometry, contrast, and layering. It never collapses those results into a weighted score or an automatic advance/reject decision.

The operator reviews the explicit tradeoffs while refining instructions. A large gain with a small regression may be a useful next iteration, while a balanced tradeoff may not be; the harness does not invent a threshold for that judgment. This flexibility applies only to exploratory A/B selection. Final confirmation has no tradeoff allowance: every valid run must pass strict acceptance.

## Matrix and exact counts

Four paired executor bundles remain configured: native/Claude-family, Claude Code/Claude-family, native/GPT-family, and Codex/GPT-family. Exact model versions come from execution provenance.

Prompt applicability produces 14 fixture-prompt pairs: four basic tasks across three fixtures (12), plus one cross-system task on each established fixture (2).

1. **Separation — 48 prepared runs:** `3 fixtures × 2 controls × s1 × 4 bundles × K=2`.
2. **Guidance iteration — 400 additional prepared runs:** the full four-condition matrix has 448 unique cells; reuse the 48 separation cells and prepare the other 400. No control evidence is rerun or double-counted.
3. **Final confirmation — 112 required valid runs:** `14 supported fixture-prompt pairs × candidate × 4 bundles × K=2`.
4. **Strategy pilot — 80 prepared runs:** `5 fixture-prompt pairs × 2 strategies × 4 bundles × K=2`. The five pairs are `s1` on all three fixtures plus one cross-system task on each established fixture (`s4`, `s5`), so the pilot characterizes downstream composition rather than install time alone. Stages 1–3 keep their exact counts and cell identities; a pilot cell can never collide with theirs, because its condition is one of the two strategies and cell identity is `stage__condition__fixture__prompt__bundle__rep`.

The repository prepares tasks and sandboxes but does not launch executors. Missing, blocked, invalid, or omitted cells make the confirmation incomplete; they do not shrink its denominator.

The pilot's acceptance is the same as everywhere else: a valid run passes only when it is `clean` with task-specific success, and the operator report is per strategy and per failure category with no combined score. A run whose executor did not complete is reported as not completed and never counts toward a strategy's clean or comparable totals, whatever its measurement says — a cell that stopped early damaged nothing because no work happened, and that is not evidence for the strategy. The initial operator run may filter that prepared matrix to one bundle and one repetition — 10 of the 80 cells — without changing the matrix itself.

## Commands

```bash
# Validate matrix expansion, evaluators, integrity checks, and provenance.
pnpm vitest run internal/vibe-tests/setup-test --project node

# Prepare one small cell without launching an executor.
node internal/vibe-tests/setup-test/run-setup.mjs \
  --stage separation \
  --fixtures tailwind-v4-control \
  --conditions floor \
  --prompts s1 \
  --bundles native-claude \
  --reps 1 \
  --out /tmp/setup-test

# Immediately after the executor settles, record this command's diffSha256 as
# execution.agentDiffSha256 in the sidecar before measurement.
node internal/vibe-tests/setup-test/setup-integrity.mjs --app <sandbox>

# Measure without modifying source and carry the sidecar forward.
node internal/vibe-tests/setup-test/setup-measure.mjs \
  --app <sandbox> \
  --fixture tailwind-v4-control \
  --provenance <run.provenance.json> \
  --out <measurement.json>
```

### Strategy pilot

The stage prepares all 80 cells. The initial operator run filters that same
matrix to one bundle and one repetition — 10 cells — without changing it:

```bash
node internal/vibe-tests/setup-test/run-setup.mjs \
  --stage strategy-pilot \
  --bundles claude-code-claude \
  --reps 1 \
  --out /tmp/strategy-pilot

# Per-strategy, per-failure-category report. No combined score is emitted.
pnpm tsx internal/vibe-tests/setup-test/setup-aggregate.ts \
  --stage strategy-pilot \
  --dir /tmp/strategy-pilot
```

### Strategy iteration

Reruns the four pilot cells that did not pass. The stage's allowlist already
names exactly those four, so the command needs no filters and prepares four
cells:

```bash
node internal/vibe-tests/setup-test/run-setup.mjs \
  --stage strategy-iteration \
  --out /tmp/strategy-iteration

# Same report, plus the pilot cell each rerun is paired against.
pnpm tsx internal/vibe-tests/setup-test/setup-aggregate.ts \
  --stage strategy-iteration \
  --dir /tmp/strategy-iteration
```

The four prepared cells are:

| Cell                                                                                                 | Reruns                                                                                        | Finding it addresses                                     | Changed           |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------- |
| `strategy-iteration__guest-contained-r2__enterprise-scoped-synthetic__s1__claude-code-claude__r1`    | `strategy-pilot__guest-contained__enterprise-scoped-synthetic__s1__claude-code-claude__r1`    | 2 host-text regressions on `guest-boundary`              | measurement       |
| `strategy-iteration__guest-contained-r2__shadcn-tailwind-v4-established__s4__claude-code-claude__r1` | `strategy-pilot__guest-contained__shadcn-tailwind-v4-established__s4__claude-code-claude__r1` | 1 host colour regression on `primary-action`, dark       | measurement       |
| `strategy-iteration__host-aligned-r2__shadcn-tailwind-v4-established__s1__claude-code-claude__r1`    | `strategy-pilot__host-aligned__shadcn-tailwind-v4-established__s1__claude-code-claude__r1`    | `gitignore-modified`, no measured damage                 | guidance delivery |
| `strategy-iteration__host-aligned-r2__enterprise-scoped-synthetic__s5__claude-code-claude__r1`       | `strategy-pilot__host-aligned__enterprise-scoped-synthetic__s5__claude-code-claude__r1`       | `gitignore-modified` plus `host-menu-surface:host-style` | guidance          |

A single cell can be prepared on its own with the usual filters, for example:

```bash
node internal/vibe-tests/setup-test/run-setup.mjs \
  --stage strategy-iteration \
  --conditions host-aligned-r2 \
  --fixtures enterprise-scoped-synthetic \
  --prompts s5 \
  --out /tmp/strategy-iteration
```

Baselines must be re-measured with the same build as the arms: the measurement
corrections change what a baseline reads too, and a corrected arm compared
against a pilot-era baseline is not a comparison.

### Strategy iteration 2

Reruns the two cells the first iteration did not pass. The stage's allowlist
names exactly those two, so the command needs no filters and prepares two cells:

```bash
node internal/vibe-tests/setup-test/run-setup.mjs \
  --stage strategy-iteration-2 \
  --out /tmp/strategy-iteration-2

# Same report, plus the cell each rerun is paired against.
pnpm tsx internal/vibe-tests/setup-test/setup-aggregate.ts \
  --stage strategy-iteration-2 \
  --dir /tmp/strategy-iteration-2
```

The two prepared cells are:

| Cell                                                                                                | Reruns                                                                                            | Finding it addresses                                       | Changed                |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------- |
| `strategy-iteration-2__guest-contained-r3__enterprise-scoped-synthetic__s1__claude-code-claude__r1` | `strategy-iteration__guest-contained-r2__enterprise-scoped-synthetic__s1__claude-code-claude__r1` | `build-failed` — `ERR_PNPM_IGNORED_BUILDS`; never measured | guidance               |
| `strategy-iteration-2__host-aligned-r3__enterprise-scoped-synthetic__s5__claude-code-claude__r1`    | `strategy-iteration__host-aligned-r2__enterprise-scoped-synthetic__s5__claude-code-claude__r1`    | `host-menu-surface:host-style`, both modes                 | guidance + measurement |

Baselines must be re-measured with the same build as the arms, for the same
reason as the previous iteration.

Measurement no longer needs a network namespace or a loopback shim. If a runner
wraps it in one out of habit, drop the wrapper: the server binds IPv4 loopback
and fetches the address it bound to. Invoke the measurer through a login shell,
or pin Node and pnpm explicitly — the toolchain the preflight verifies is the
profile shell's, and a non-login shell on the same machine resolves a different
one.
