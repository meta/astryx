# Stepper Collapsed-Summary Naming Vibe Test

**Status:** ad-hoc · run 1 complete · decided
**Related:** [`../README.md`](../README.md) (Checker Protocol), [API Arbitration](https://github.com/meta/astryx/wiki/API-Arbitration), [Designing Vibe Tests](https://github.com/meta/astryx/wiki/Designing-Vibe-Tests), [PR #5659](https://github.com/meta/astryx/pull/5659)

---

## 1. The question

PR #5659 gives `Stepper` a narrow-width collapse: labels drop away, leaving a bare
segmented track, and a row appears beneath it carrying the current step's name and —
when `onStepClick` is set — Previous/Next controls.

Feedback on the PR: on mobile both halves of that row are often redundant, because
consumers already have their own Back/Continue and their own per-step heading. Both
wizard templates in this repo are that shape — `form-wizard` and `checkout-wizard` each
pass `onStepClick` so people can jump backward at full width, and each has footer
buttons and an `<Heading level={2}>` per panel.

So each half needs an off switch. **What should they be called, and should they be two
props or one?**

## 2. Design

Four-ingredient intake per [Designing Vibe Tests](https://github.com/meta/astryx/wiki/Designing-Vibe-Tests).

**Goal & measure.** A naive agent is told what the *page* provides and never told a prop
name. Scored on correctness, hallucination, directness, and confidence calibration.
Tie-break: hallucination, then fewer concepts.

**Prompt battery.** Four prompts in [`prompts.json`](prompts.json), one per cell of the
2×2 over what the surrounding page already has. None name a prop, a value, or the word
"collapse".

| | page already has | correct answer |
| --- | --- | --- |
| p1 | footer Back/Continue | controls off, name kept |
| p2 | a per-step heading | name off, controls kept |
| p3 | both | both off — bare track |
| p4 | neither | **set nothing** (negative control) |

**Arms.** Four conditions, plus a recall probe.

| arm | shape |
| --- | --- |
| `A` | `hasCollapsedControls` / `hasCollapsedLabel`, both default `true` |
| `B` | `hasControls` / `hasLabel`, both default `true` |
| `C` | `hasSummaryControls` / `hasSummaryLabel`, both default `true` |
| `D` | `collapsedSummary?: 'auto' \| 'label' \| 'controls' \| 'none'` |
| `recall` | behavior described, props deliberately unnamed — the agent writes what it expects |

**Orchestration.** One isolated sub-agent per (prompt × arm), spawned fresh with the
wiki's blank-slate preamble, self-reporting but never self-scoring. Five recall samples.
One judge agent with cross-arm visibility. 22 agents total.

### Fairness (Checker Protocol)

| Invariant | How this honors it |
| --- | --- |
| §1 Fair evaluators | One judge, all arms side by side, one rubric. Blinding is impossible here — the arm is legible from the prop names — so the judge was told to score the rubric and not its own taste, and to audit doc parity before reading any result |
| §2 Only the SUT varies | The four arm docs are **machine-generated from one template** ([`gen-docs.mjs`](gen-docs.mjs)); intro, prop-table rows, `Step` description, example 1 and the anti-pattern are byte-identical. 349/349/349/354 words. The prose naming the props is one sentence with the names swapped, so no arm gets a lexical head start |
| §3 Never leak the answer | Ground truth lives in `prompts.json` and never reached a generating agent |
| §4 Representative environment | A skill doc is exactly what a consumer's agent gets |
| §5 Context-free | Fresh sub-agents, explicitly barred from reading the repo, the component source, or each other's docs |

---

## 3. Findings

### 3.1 Recognition is a four-way tie

**16/16 correct. 16/16 free of hallucination.** Every arm put the right configuration on
every prompt, including the p4 negative control, which no arm's agent was tempted into
touching. Directness split on a single result (`c-p2` added an unrequested `<h1>`).

Per the wiki's decision patterns, *all options produce identical code → the difference
doesn't matter, pick the simpler one*. On this battery the naming does not change whether
an agent can use the API. Everything below is the tie-break.

### 3.2 The recall probe is where the arms separate

Five agents were given the behavior with the props deliberately unnamed and asked to
write what they expected.

| sample | controls | name |
| --- | --- | --- |
| 1 | `showCollapsedControls` | `showCollapsedStepLabel` |
| 2 | `showCollapsedControls` | `showCollapsedLabel` |
| 3 | `showNavigation` | `showStepLabel` |
| 4 | `showSummaryControls` | `showSummaryLabel` |
| 5 | `showSummaryControls` | `showSummaryLabel` |

**5/5 produced two independent booleans. Nobody produced an enum.** Every one rejected the
enum unprompted, and converged on the same reason — that it forces you to restate the half
you did not want to change. Sample 5 added the sharpest version: the component's existing
enums (`orientation`, `density`, `indicatorPosition`) are all mutually-exclusive choices,
and this is not one. **Arm D is out on shape**, despite scoring 5.00 on correctness.

**4/5 rejected a bare `Label` because it collides with the existing `label` prop** — the
accessible name of the whole sequence. Sample 3: *"a reader would think it toggles that
string."* Sample 2 flagged the other half too: *"`showControls` alone would sound like it
suppresses `onStepClick`."* **Arm B is out on ambiguity**, and this is a real collision in
the shipping API, not an artifact of the test.

That leaves A and C, 2–2. Two things break it:

- **Both `Summary` choosers started at `Collapsed` and switched**, and both said why:
  the anti-pattern's `data-astryx-stepper-summary` selector looked like the component's
  internal name. Sample 4: *"`showCollapsedControls` was my first instinct … but the data
  attribute pointed at 'summary' as the internal name."* That is a reason to guess the
  implementation, not a reason a consumer would reach for the word.
- **3/5 explicitly rejected `Summary` as internal vocabulary.** Sample 3: *"'summary' is
  internal implementation vocabulary that appears nowhere in the prose or the props
  table."*

### 3.3 The judge picks A, on an effect the scores don't show

> "On p2 and p3, every B and C result stopped to verify the prop wouldn't kill the desktop
> labels (4/4), and no A or D result did (0/4)."

The word `Collapsed` in the name removes a class of doubt about scope. `Summary` does not,
because a reader who does not already know the row is called a summary cannot tell what
the prop reaches.

The judge also caught an inversion hazard specific to the enum: its values name what
*survives*, while every requirement names what to *remove*. `d-p2` walked into it live —
*"my first instinct was to set it to `'none'` … `'none'` is the value that most literally
removes the name"* — and recovered only via an unrelated clause in the prompt.

### 3.4 `show` beats `has` with LLMs, and the convention should still win

**5/5 recall samples produced `show*`**, several rejecting `hide*` explicitly for the
double negative. Astryx has ~30 `has*` booleans in `packages/core/src` and zero `show*`
ones, so the house convention says `has*`.

Take the convention. §3.1 is the evidence that it is free: agents used `has*` correctly
16/16 when the doc said `has*`. The prefix affects what an agent *guesses*, not what it
*does* with a documented API — and a design system's props are always documented.

### 3.5 The finding that outranks the naming

Every arm hit the same wall, and it is a property of the design rather than of any name.
**Nobody could tell whether a collapsed track is still tappable.** `d-p1`:

> "there may be no way to tap back to a finished step at all — the labels are gone and I
> have suppressed the controls … it is the one place where the brief's two phone
> requirements might be in tension."

That is exactly right, and it applies identically to `a-p1`, `b-p1` and `c-p1`. In the
`separated` layout the step click targets go with the labels, so turning the controls off
leaves nothing to press. Addressed in the shipped `hasCollapsedControls` JSDoc, which
names the consequence and the `on-track` exception rather than leaving it to be
discovered. Two further cross-arm findings are recorded in §5 as follow-ups.

---

## 4. Decision

**Ship arm A — `hasCollapsedControls` and `hasCollapsedLabel`, both `@default true`.**

- Two booleans, because the recall probe produced two booleans 5/5 and the four states are
  genuinely independent (§3.2).
- `has*`, because the convention is unanimous in `packages/core/src` and §3.1 shows the
  prefix costs nothing in use (§3.4).
- The `Collapsed` qualifier, because it was the unprompted first instinct in 4/5 recall
  samples, because it measurably removed scope doubt in the judge's read (§3.3), and
  because `Summary` only ever won by leaking an internal name (§3.2).
- Defaults stay `true`: the report is about redundancy, not breakage, and a consumer who
  passes `onStepClick` with no other navigation must not be stranded on a phone.

Implementation note: `Step` needed **no change**. It already gates its summary portal on
`summarySlot != null`, so withholding the slot is the entire implementation of
`hasCollapsedLabel` — and because that row is `aria-hidden` while the `<ol>` keeps every
step's name, both props are purely visual and cannot shorten what a screen reader hears.

---

## 5. Follow-ups this test surfaced (not naming)

1. **No per-step gating.** All 8 results on p1+p3 independently wrote the same
   `index < step` guard around `onStepClick`, because nothing lets a step declare itself
   unreachable. `a-p1` noticed the resulting contradiction: *"my guard makes the future
   steps look interactive and do nothing, which is the same tab-order complaint the
   anti-pattern section raises."* Worth a spec.
2. **The collapse cannot be forced.** All 16 reported being unable to preview or pin the
   collapsed state. That is a testing and Storybook gap, and it is why the unit tests
   here have to redefine `clientWidth` by hand.

---

## 6. Caveats

- **p1 was a giveaway in all four arms.** Example 2 in every doc renders p1's answer
  almost verbatim. Symmetric, so it does not favour an arm, but it means only p2/p3/p4
  carried signal and the 16/16 in §3.1 is easier than it looks. The judge caught this
  independently; a re-run should vary which cell the worked example demonstrates.
- **Both qualifiers were primed, unevenly.** "collapsed" appears 4× in the recall doc (3×
  in prose), "summary" once, inside a CSS selector. `Collapsed` therefore had the larger
  prompt-side advantage — which makes the 2–2 split *favourable* to `Summary` on a naive
  read, and is why §3.2 leans on the switch narratives rather than the raw tally.
- **n=5 on recall, n=4 per arm.** The unanimous results (enum 0/5, two-booleans 5/5,
  `show*` 5/5, the `label` collision 4/5) are wide of sampling noise. The 2–2 qualifier
  split is not, and is decided by §3.3 rather than by count.
- **One battery, one author.** Written by the same person who drafted the candidates.
- **Recall batched three scenarios per agent**, deviating from one-agent-per-prompt.
  Deliberate: naming a coherent *pair* is the realistic act, and splitting it would have
  measured three unrelated guesses instead of one scheme.

---

## 7. Folder layout

```
internal/vibe-tests/stepper-collapse-naming-test/
├── PLAN.md          # this file — design + findings + decision
├── gen-docs.mjs     # generates the 5 arm docs from one template (fairness by construction)
├── docs/            # the generated skill docs, one per arm
├── prompts.json     # the 4-prompt battery + ground truth
└── results/         # (gitignored) 16 generation + 5 recall + JUDGE.md
```

Regenerate the docs with `node internal/vibe-tests/stepper-collapse-naming-test/gen-docs.mjs`.
