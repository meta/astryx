// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * A continuous integration setup flow in the third wizard shape: every step
 * stays stacked in one column and expands in place inside a vertical Stepper,
 * instead of swapping a panel out for the next one. It is the only one of the
 * wizard templates that uses Step's `children`.
 *
 * The flow has three movements. Two steps of human setup name the repository
 * and choose what runs. Three steps then run themselves — connect, inspect,
 * trial run — each advancing to the next without being asked. Review at the
 * end is human again.
 *
 * That middle stretch is why this content was put in this shape. An automatic
 * step has one thing to say while it works and a different thing to say once
 * it is done, and a column that keeps every step on screen lets the whole
 * chain be read at once: the runner picked in step two, the package manager
 * found in step four, and the job that just died because of the first one.
 * A swapping panel shows one of those three at a time, which is the wrong
 * trade when the point is that they are related.
 *
 * The failure is reachable, not decorative. End-to-end tests ask for 4 GB and
 * the small runner has 2 GB, so turning that job on without sizing the runner
 * up kills the trial run. That is the accordion earning its keep: the step
 * that caused it is four rows up, still legible, one click from being fixed.
 *
 * Nothing here needs a core change. `Step` already takes any ReactNode as its
 * `indicator`, so a running step puts a Spinner there, and auto-advance is
 * just this component moving `activeStep` on a timer.
 *
 * The cost is vertical space and a moving target: expanding a step pushes
 * everything below it down, and here the flow does that to itself three times
 * without being touched. Prefer this when steps are few and short and the
 * relationship between them matters. Prefer the swapping panel when any single
 * step is longer than a screen.
 *
 * Because the content lives in the step, the primary action does too. There is
 * no page footer — each step confirms itself, which keeps the button next to
 * the fields it commits.
 *
 * ## Extending this template
 *
 * **A collapsed step must summarise, not label.** `summaryFor` renders what
 * the step produced — "pnpm 11 · Vitest · 1,284 tests" rather than "Done". A
 * collapsed step that says nothing is a row of wasted height, and the summary
 * is the entire reason to choose this shape.
 *
 * **An automatic step summarises what it found, not that it ran.** "Connected"
 * is the weakest thing the connect step could say once it has a webhook id and
 * a permission scope to report. The machine steps are the ones most likely to
 * be written as status words, and they are the ones with the most to say.
 *
 * **Auto-advance is a chain, and a failed link has to break it.** `runNext`
 * only schedules the next step on a pass. A flow that keeps going past a
 * failure buries it under the steps that follow, and every one of those is
 * running against a premise that no longer holds.
 *
 * **A machine result is only valid for the inputs that produced it.**
 * `goToStep` resets every automatic step from the target onwards, so editing
 * the runner throws away the trial run that used the old one. Leaving a stale
 * green check above an edited field is how a wizard ends up lying.
 *
 * **Announce the hand-off; do not chase it with focus.** Auto-advance moves
 * the expanded step on a timer. Moving focus with it would yank the caret out
 * from under anyone still reading, so the flow reports itself through a polite
 * live region instead. This is the case live regions are for — a handful of
 * discrete state changes, not a running commentary.
 *
 * **Gate the content slot on the active step.** Passing children
 * unconditionally renders every form at once and turns the stepper into a long
 * form with decorative numbers. `index === active && (...)` is what makes it a
 * wizard.
 *
 * **Keep each step under a screen.** The expanded step should not push its own
 * confirm button out of view. If a step needs a scroll, split it or move to the
 * side-rail layout.
 *
 * **Editing is re-entry, not a separate mode.** `onStepClick` reopens a
 * completed step with its values intact, running the same code path as
 * first-time entry. `endContent` only labels that row-wide action; it stays
 * text so the Step's button does not contain another button. Never build a
 * read-only summary with a parallel edit form — two renderings of the same
 * data drift.
 */

import {useEffect, useMemo, useState} from 'react';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {CheckboxList, CheckboxListItem} from '@astryxdesign/core/CheckboxList';
import {FieldStatus} from '@astryxdesign/core/FieldStatus';
import {FormLayout} from '@astryxdesign/core/FormLayout';
import {Icon} from '@astryxdesign/core/Icon';
import {Layout, LayoutContent, LayoutHeader} from '@astryxdesign/core/Layout';
import {MetadataList, MetadataListItem} from '@astryxdesign/core/MetadataList';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {Selector} from '@astryxdesign/core/Selector';
import {Spinner} from '@astryxdesign/core/Spinner';
import {HStack, StackItem, VStack} from '@astryxdesign/core/Stack';
import {Step, Stepper} from '@astryxdesign/core/Stepper';
import {Switch} from '@astryxdesign/core/Switch';
import {useToast} from '@astryxdesign/core/Toast';
import {Heading, Text} from '@astryxdesign/core/Text';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';
import {
  BeakerIcon,
  BoltIcon,
  CpuChipIcon,
  CubeIcon,
} from '@heroicons/react/24/outline';

// ── Data ──────────────────────────────────────────────────────────────────────

// What the inspect step "discovers" is really just this table, keyed off the
// repository picked in step one. Keeping it here rather than inside the check
// means the review summary and the collapsed step read the same source.
const REPOS = [
  {
    id: 'web',
    name: 'northwind/web',
    branch: 'main',
    packageManager: 'pnpm 11',
    lockfile: 'pnpm-lock.yaml',
    testRunner: 'Vitest',
    testCount: 1284,
    description: 'Marketing site and the signed-in dashboard.',
  },
  {
    id: 'api',
    name: 'northwind/api',
    branch: 'main',
    packageManager: 'npm 10',
    lockfile: 'package-lock.json',
    testRunner: 'Jest',
    testCount: 862,
    description: 'GraphQL gateway and the billing workers.',
  },
  {
    id: 'design',
    name: 'northwind/design-system',
    branch: 'trunk',
    packageManager: 'pnpm 11',
    lockfile: 'pnpm-lock.yaml',
    testRunner: 'Vitest',
    testCount: 431,
    description: 'Component library published to the internal registry.',
  },
];

const TRIGGERS = [
  {
    id: 'pr',
    label: 'Pull requests',
    description: 'Every push to a branch with an open pull request.',
  },
  {
    id: 'push',
    label: 'Pushes to the default branch',
    description: 'Direct commits and merges, after the fact.',
  },
  {
    id: 'tag',
    label: 'Release tags',
    description: 'Tags matching v*, so a release is verified before it ships.',
  },
];

// `memoryGB` is the whole reason the trial run can fail. It is on the job
// rather than hard-coded into the check so the message can name both numbers.
const JOBS = [
  {
    id: 'lint',
    label: 'Lint',
    description: 'ESLint and Prettier over the changed files. Needs 1 GB.',
    memoryGB: 1,
    seconds: 74,
  },
  {
    id: 'unit',
    label: 'Unit tests',
    description:
      'The full suite, sharded across the available cores. Needs 2 GB.',
    memoryGB: 2,
    seconds: 203,
  },
  {
    id: 'build',
    label: 'Production build',
    description:
      'The build that would ship, with bundle size reported. Needs 2 GB.',
    memoryGB: 2,
    seconds: 126,
  },
  {
    id: 'e2e',
    label: 'End-to-end tests',
    description: 'Playwright against a preview deployment. Needs 4 GB.',
    memoryGB: 4,
    seconds: 391,
  },
];

const RUNNERS = [
  {id: 'small', label: 'Small', memoryGB: 2, cores: 2, rate: '$0.008'},
  {id: 'medium', label: 'Medium', memoryGB: 4, cores: 4, rate: '$0.016'},
  {id: 'large', label: 'Large', memoryGB: 8, cores: 8, rate: '$0.032'},
];

const NODE_VERSIONS = [
  {value: '22', label: 'Node 22 · Active LTS'},
  {value: '20', label: 'Node 20 · Maintenance'},
  {value: '24', label: 'Node 24 · Current'},
];

// Steps 2, 3 and 4 run themselves. `kind` is what the render branches on, so
// adding a fourth automatic step is a matter of this table plus a case in
// `checksFor`.
//
// Label only, no blurb. A step that has not run has nothing to report, and the
// one step that is open is explaining itself at full size directly underneath —
// so a line of standing description would only ever be read in the moment it
// was least needed. The trailing text on a row is therefore always a result.
const STEP_META = [
  {kind: 'human', label: 'Repository'},
  {kind: 'human', label: 'Pipeline'},
  {kind: 'auto', label: 'Connect'},
  {kind: 'auto', label: 'Inspect the project'},
  {kind: 'auto', label: 'Trial run'},
  {kind: 'human', label: 'Review and enable'},
] as const;

const AUTO_STEPS = [2, 3, 4];

// The one raw style in the file, and the only effect here with no prop to ask
// for it. A Step indents its content slot by the indicator gutter — 16px of
// indicator plus the 8px gap — so that a paragraph lines up with the label
// rather than the badge. A nested Stepper inherits that indent and starts its
// own track 24px in, which reads as a second column that happens to be nearby
// instead of a branch off the step above.
//
// The sub-steps run `on-track`, so the line passes through their indicators
// and it is the indicator centre that has to land under the parent's. That
// centre sits 12px past the content edge, the content edge is the 24px gutter
// past the parent indicator's leading edge, and the parent's own centre is 8px
// in from that: 24 + 12 - 8. Logical, not `left`, so it mirrors under RTL with
// everything else.
const NESTED_RAIL_PULL = -28;

// One sub-check per tick, then a beat on the last one before handing over. The
// tick clears a full turn of the Spinner — 730ms at the default motion scale —
// because a check that resolves mid-rotation reads as a stutter rather than as
// work that finished. The settle is deliberately shorter: it is the pause on a
// result, not another check, and the step collapses out of it.
const TICK_MS = 800;
const SETTLE_MS = 560;

type AutoStatus = 'idle' | 'passed' | 'failed';
type AutoState = {status: AutoStatus; done: number};

const IDLE: AutoState = {status: 'idle', done: 0};
const INITIAL_AUTO: Record<number, AutoState> = {2: IDLE, 3: IDLE, 4: IDLE};

/** "3m 12s" — trial run timings are summed from the jobs that ran. */
const duration = (seconds: number) =>
  seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;

export default function FormWizardInlinePage() {
  // `active === STEP_META.length` means every step is settled and the flow
  // shows its review card instead.
  const showToast = useToast();

  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState<Record<number, AutoState>>(INITIAL_AUTO);

  const [repoId, setRepoId] = useState('web');
  const [triggers, setTriggers] = useState<string[]>(['pr']);

  const [jobs, setJobs] = useState<string[]>(['lint', 'unit', 'build']);
  const [runnerId, setRunnerId] = useState('small');
  const [nodeVersion, setNodeVersion] = useState('22');

  const [strictBranches, setStrictBranches] = useState(true);

  const repo = REPOS.find(r => r.id === repoId) ?? REPOS[0];
  const runner = RUNNERS.find(r => r.id === runnerId) ?? RUNNERS[0];
  const selectedTriggers = TRIGGERS.filter(t => triggers.includes(t.id));
  const isDone = active >= STEP_META.length;

  // Memoised because the check list is built from it and the timer effect
  // depends on that list. A fresh array every render would tear down and
  // restart the in-flight timer on any unrelated re-render.
  const selectedJobs = useMemo(
    () => JOBS.filter(j => jobs.includes(j.id)),
    [jobs],
  );

  // The one thing the trial run can trip over: a job that wants more memory
  // than the runner has. Derived rather than stored, so changing either side
  // of it changes the outcome without a second source of truth.
  const starvedJob = selectedJobs.find(j => j.memoryGB > runner.memoryGB);

  const trialSeconds =
    38 + selectedJobs.reduce((total, job) => total + job.seconds, 0);

  const triggerSummary =
    selectedTriggers.length === 0
      ? 'nothing yet'
      : selectedTriggers
          .map(t => t.label.toLowerCase())
          .join(' and ')
          .replace('pushes to the default branch', `pushes to ${repo.branch}`);

  // What each automatic step actually does, as a list its expanded body can
  // tick through. `fails` marks the row the chain stops on; only the trial run
  // ever sets it, and only when the pipeline above it is oversized.
  const checksFor = useMemo<Record<number, Array<{id: string; label: string}>>>(
    () => ({
      2: [
        {id: 'auth', label: 'Authenticating as the Northwind CI app'},
        {id: 'perms', label: `Confirming write access to ${repo.name}`},
        {id: 'hook', label: `Registering a webhook for ${triggerSummary}`},
      ],
      3: [
        {id: 'manifest', label: 'Reading package.json'},
        {id: 'pm', label: 'Detecting the package manager'},
        {id: 'runner', label: 'Locating the test runner'},
        {id: 'cache', label: `Hashing ${repo.lockfile} for the cache key`},
      ],
      4: [
        {
          id: 'provision',
          label: `Provisioning the ${runner.label.toLowerCase()} runner`,
        },
        {id: 'install', label: 'Restoring the cache and installing'},
        ...selectedJobs.map(job => ({
          id: job.id,
          label: `Running ${job.label.toLowerCase()}`,
        })),
      ],
    }),
    [repo.name, repo.lockfile, runner.label, selectedJobs, triggerSummary],
  );

  // The whole auto-advance mechanism, and one timer at a time: tick a
  // sub-check, or — once they are all through — settle the step and hand on to
  // the next. A failing sub-check settles as `failed` and schedules nothing,
  // which is what breaks the chain.
  useEffect(() => {
    if (!AUTO_STEPS.includes(active)) {
      return undefined;
    }
    const state = auto[active];
    if (state.status !== 'idle') {
      return undefined;
    }

    const checks = checksFor[active];

    if (state.done >= checks.length) {
      const timer = setTimeout(() => {
        setAuto(s => ({...s, [active]: {...s[active], status: 'passed'}}));
        setActive(a => a + 1);
      }, SETTLE_MS);
      return () => clearTimeout(timer);
    }

    // The only sub-check that can fail is the oversized job, and only on the
    // trial run. Derived here rather than stored, so the outcome always
    // reflects the pipeline as it stands right now.
    const failingIndex =
      starvedJob == null
        ? -1
        : checks.findIndex(check => check.id === starvedJob.id);

    const timer = setTimeout(() => {
      setAuto(s =>
        state.done === failingIndex
          ? {...s, [active]: {...s[active], status: 'failed'}}
          : {...s, [active]: {...s[active], done: s[active].done + 1}},
      );
    }, TICK_MS);
    return () => clearTimeout(timer);
  }, [active, auto, checksFor, starvedJob]);

  // Re-entering a step invalidates every automatic result from there on: they
  // were computed against inputs that are now open for editing. Throwing them
  // away is the honest move — a green check above an edited field is a lie.
  const goToStep = (index: number) => {
    setActive(index);
    setAuto(s => {
      const next = {...s};
      for (const step of AUTO_STEPS) {
        if (step >= index) {
          next[step] = IDLE;
        }
      }
      return next;
    });
  };

  // What a collapsed step shows instead of its generic description. Reads the
  // same state the expanded step wrote, so it can never disagree with it.
  const summaryFor = (index: number): string | undefined => {
    if (index >= active) {
      return undefined;
    }
    switch (index) {
      case 0:
        return `${repo.name} · ${triggerSummary}`;
      case 1:
        return `${selectedJobs.length} ${
          selectedJobs.length === 1 ? 'job' : 'jobs'
        } · ${runner.label.toLowerCase()} runner, ${runner.memoryGB} GB · Node ${nodeVersion}`;
      case 2:
        return `Connected · webhook #4471 · write access confirmed`;
      case 3:
        return `${repo.packageManager} · ${repo.testRunner} · ${repo.testCount.toLocaleString()} tests found`;
      case 4:
        return `${selectedJobs.length} ${
          selectedJobs.length === 1 ? 'job' : 'jobs'
        } passed in ${duration(trialSeconds)}`;
      case 5:
        return `Enabled · ${selectedJobs.length} ${
          selectedJobs.length === 1 ? 'job' : 'jobs'
        } gate every merge`;
      default:
        return undefined;
    }
  };

  // One rule set for the two human steps, keyed by step and then by field. The
  // Step tint, the confirm row, and the field messages all read this — there is
  // no second copy of the rules to drift. Unlike the swapping wizards there is
  // no `attempted` set: an expanded step is on screen with its own fields, so a
  // message can point at the field it belongs to as soon as it is true.
  const errorsByStep = useMemo<Array<Record<string, string>>>(() => {
    const repository: Record<string, string> = {};
    if (triggers.length === 0) {
      repository.triggers =
        'Pick at least one event, or nothing would ever start a run.';
    }

    const pipeline: Record<string, string> = {};
    if (jobs.length === 0) {
      pipeline.jobs = 'Pick at least one job for the pipeline to run.';
    }

    // One entry per step, so the index lines up with STEP_META. The three
    // automatic steps in the middle have no fields to get wrong, and the
    // review step only confirms.
    return [repository, pipeline, {}, {}, {}, {}];
  }, [triggers.length, jobs.length]);

  const currentErrors = isDone ? {} : errorsByStep[active];
  const isStepBroken = (index: number) =>
    Object.keys(errorsByStep[index]).length > 0;

  const confirmStep = () => {
    if (Object.keys(currentErrors).length !== 0) {
      return;
    }
    // Confirming the last step is the one moment in the flow that produces no
    // new screen to look at, so it is the one that needs saying out loud. A
    // toast rather than a banner because the durable record is already being
    // written a few pixels away — the step collapses to "Enabled · …" and
    // stays there — and a permanent block repeating it would be the third
    // copy of facts the rows above already carry.
    if (active === STEP_META.length - 1) {
      showToast({
        body: 'Continuous integration is on',
        uniqueID: 'ci-enabled',
      });
    }
    setActive(a => a + 1);
  };

  const hasFailure = AUTO_STEPS.some(step => auto[step].status === 'failed');

  /** The status of a step, folding progress and the automatic result together. */
  const phaseOf = (index: number) => {
    if (STEP_META[index].kind === 'human') {
      return index < active ? 'passed' : 'pending';
    }
    if (auto[index].status === 'failed') {
      return 'failed';
    }
    if (auto[index].status === 'passed') {
      return 'passed';
    }
    return index === active ? 'running' : 'pending';
  };

  /** The confirm row every expanded human step ends with. */
  const stepActions = (label: string, index: number) => {
    const count = Object.keys(currentErrors).length;
    return (
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Button label={label} variant="primary" onClick={confirmStep} />
        {index > 0 && (
          <Button
            label="Back"
            variant="ghost"
            onClick={() => goToStep(index - 1)}
          />
        )}
        {/* A count, not a copy of the message. Every error here is already
            printed under the field it belongs to, a few rows up. */}
        {count > 0 && (
          <FieldStatus
            type="error"
            variant="detached"
            message={
              count === 1
                ? 'One problem above needs fixing first.'
                : `${count} problems above need fixing first.`
            }
          />
        )}
      </HStack>
    );
  };

  /** The body of an automatic step: its sub-checks, ticking through. */
  const autoBody = (index: number) => {
    const checks = checksFor[index];
    const state = auto[index];
    const failed = state.status === 'failed';

    return (
      <VStack gap={4}>
        {/* A Stepper inside a Step. The sub-checks are a sequence with a
            position in it, which is the thing Stepper draws, and nesting one
            gets the connector line growing from check to check for free —
            `activeStep` is just how many have landed. The outer track cannot
            do this: its fill is per-step and binary, so a step in progress is
            an empty segment until the whole step is done. A ProgressBar here
            would have said the same thing in a second visual language, right
            next to a line already built to say it.

            `on-track` where the parent is separated, because these two lines
            are saying different things. The parent's rail marks how far down
            the form you are; this one is the run itself, threading through
            each check as it lands, and a thread should pass through its
            beads. It also collapses the two columns a separated nested
            stepper would add beside the parent's into one. */}
        <Stepper
          activeStep={state.done}
          orientation="vertical"
          density="compact"
          indicatorPosition="on-track"
          label={`${STEP_META[index].label} checks`}
          style={{marginInlineStart: NESTED_RAIL_PULL}}>
          {checks.map((check, i) => {
            const isPast = i < state.done;
            const isCurrent = i === state.done;
            return (
              <Step
                key={check.id}
                step={i}
                label={check.label}
                status={
                  isPast ? 'success' : isCurrent && failed ? 'error' : undefined
                }
                indicator={
                  isCurrent && failed ? (
                    <Icon icon="error" size="sm" />
                  ) : isCurrent ? (
                    <Spinner size="sm" shade="inherit" />
                  ) : (
                    'auto'
                  )
                }
              />
            );
          })}
        </Stepper>

        {failed && starvedJob != null && (
          // The recovery, not just the diagnosis. The step that caused this is
          // still on screen above, so the primary action is a trip back to it
          // rather than a retry of a run that would fail the same way.
          <Banner
            status="error"
            title={`${starvedJob.label} ran out of memory`}
            description={`The job asked for ${starvedJob.memoryGB} GB and the ${runner.label.toLowerCase()} runner has ${runner.memoryGB} GB. Size the runner up, or drop the job from the pipeline.`}
            // One action, and not a retry. Both fixes the description offers
            // live on the pipeline step, and running the same pipeline on the
            // same runner a second time has only one possible outcome.
            endContent={
              <Button
                label="Back to the pipeline"
                variant="secondary"
                size="sm"
                onClick={() => goToStep(1)}
              />
            }
          />
        )}
      </VStack>
    );
  };

  return (
    <Layout
      height="fill"
      contentWidth={800}
      // One inset owner: padding declared here reaches the header and the
      // body, so the title and the stepper rail start on the same line.
      padding={5}
      header={
        <LayoutHeader hasDivider={false}>
          <HStack gap={3} vAlign="center">
            <StackItem size="fill">
              <VStack gap={0.5}>
                <Heading level={1}>Set up continuous integration</Heading>
                <Text type="supporting" color="secondary">
                  Answer the first two steps and the rest check themselves.
                </Text>
              </VStack>
            </StackItem>
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent>
          <VStack gap={6}>
            {/* The automatic steps advance on a timer, which is a change of
                context nobody asked for. Focus deliberately stays where it is;
                this reports the hand-off instead. Polite, and only on the few
                transitions that matter — a live region that fires constantly
                is worse than none. */}
            <VisuallyHidden as="div" aria-live="polite">
              {isDone
                ? 'All checks passed. Ready to review and enable.'
                : STEP_META[active].kind === 'auto'
                  ? `${STEP_META[active].label}: ${
                      phaseOf(active) === 'failed' ? 'failed' : 'running'
                    }`
                  : ''}
            </VisuallyHidden>

            {/* Completed rows are the way back into settled steps. The
                Stepper's `onStepClick` owns that row-wide action; `endContent`
                below only labels it with Edit or Run again, and deliberately
                stays text so the Step's button never contains another button. */}
            <Stepper
              activeStep={active}
              orientation="vertical"
              label="Continuous integration setup progress"
              density="compact"
              // The whole row is the way back into a step. Stepper offers free
              // navigation in both directions, but a wizard whose later steps
              // are derived from its earlier ones cannot honour a jump forward
              // — so every step past the current one is disabled here, which
              // is also what stops it taking a pointer and a focus stop.
              onStepClick={goToStep}>
              {STEP_META.map((meta, index) => {
                const phase = phaseOf(index);
                return (
                  <Step
                    key={meta.label}
                    step={index}
                    label={meta.label}
                    // No `description`: it renders on a line of its own, and
                    // six steps each two lines tall push the expanded one off
                    // the screen. The same words go in `endContent` below, on
                    // the label's line, which keeps a collapsed step one row.
                    status={
                      phase === 'failed' || isStepBroken(index)
                        ? 'error'
                        : phase === 'passed'
                          ? 'success'
                          : undefined
                    }
                    // A Spinner is the documented use of a custom indicator
                    // node, and `inherit` lets it take the step's own tint the
                    // way the number and the check already do. `sm` because the
                    // indicator slot is 16px and a Spinner renders its diameter
                    // plus two borders — 14px here, where `md` would come out
                    // at 20px and sit proud of the check it stands in for.
                    // The failed step swaps in the same glyph FieldStatus uses,
                    // left uncoloured so `status` tints it rather than saying
                    // "error" twice.
                    indicator={
                      phase === 'running' ? (
                        <Spinner size="sm" shade="inherit" />
                      ) : phase === 'failed' ? (
                        <Icon icon="error" size="sm" />
                      ) : (
                        'auto'
                      )
                    }
                    isDisabled={index > active}
                    // The whole trailing half of the row: what the step
                    // settled, and the affordance for going back into it. Text
                    // rather than a Button, because a clickable Step renders
                    // its label row as a <button>, and a control nested inside
                    // one is neither valid HTML nor separately pressable. The
                    // row is the control; this only has to look like the thing
                    // being pressed. Same trip back either way — only the word
                    // differs, because "Edit" is wrong for a step with nothing
                    // to edit and "Run again" is wrong for one that never ran.
                    endContent={
                      // `summaryFor` returns nothing until a step has run, so
                      // this is present exactly on the rows that have a result
                      // — which is also exactly the set that can be gone back
                      // into, hence no second condition on the link.
                      summaryFor(index) ? (
                        <StackItem size="fill">
                          <HStack gap={3} vAlign="center" hAlign="end">
                            {/* The summary is the only part of the row that
                                may not fit, so it is the only part allowed to
                                give. `size="fill"` carries the flex min-width
                                reset a bare Text would not have, which is what
                                lets `maxLines` clip instead of the row growing
                                a second line; `justify="end"` keeps it against
                                the link the way `hAlign` did before it started
                                filling. Truncated text keeps its full string
                                in the DOM, so the row's accessible name and
                                the hover tooltip both still read in full. */}
                            <StackItem size="fill">
                              <Text
                                type="supporting"
                                color="secondary"
                                justify="end"
                                maxLines={1}>
                                {summaryFor(index)}
                              </Text>
                            </StackItem>
                            {/* Two or three words that are the same on every
                                row: wrapping them would cost the row a line to
                                save a few pixels the summary can give up. */}
                            <Text
                              type="supporting"
                              color="accent"
                              weight="medium"
                              textWrap="nowrap">
                              {meta.kind === 'auto' ? 'Run again' : 'Edit'}
                            </Text>
                          </HStack>
                        </StackItem>
                      ) : undefined
                    }>
                    {/* Gating on the active index is what makes this a wizard
                        rather than one long form with numbered headings. */}
                    {index === active && (
                      // The stack carries both container jobs: a width budget
                      // for the expanded step, and the block padding that sets
                      // it off from the collapsed rows above and below. Not a
                      // Section — Section bleeds out of its parent's inset, and
                      // the inset here is the stepper's indicator column, which
                      // is exactly what the fields need to line up with.
                      <VStack paddingBlockEnd={2}>
                        {index === 0 && (
                          // FormLayout owns field spacing, and its
                          // `defaultOptionality` fixes one convention for the
                          // whole flow: unmarked means optional, so only the
                          // genuinely required fields carry an indicator.
                          <FormLayout defaultOptionality="optional">
                            <Selector
                              label="Repository"
                              options={REPOS.map(r => ({
                                value: r.id,
                                label: r.name,
                              }))}
                              value={repoId}
                              onChange={setRepoId}
                              description={`${repo.description} Default branch is ${repo.branch}.`}
                            />
                            <CheckboxList
                              label="Run the pipeline on"
                              description="Every event you pick costs build minutes, so start with the one that gates a merge."
                              value={triggers}
                              onChange={setTriggers}
                              density="compact"
                              status={
                                currentErrors.triggers
                                  ? {
                                      type: 'error',
                                      message: currentErrors.triggers,
                                    }
                                  : undefined
                              }>
                              {TRIGGERS.map(t => (
                                <CheckboxListItem
                                  key={t.id}
                                  value={t.id}
                                  label={t.label}
                                  description={t.description}
                                />
                              ))}
                            </CheckboxList>
                            {stepActions('Continue', index)}
                          </FormLayout>
                        )}

                        {index === 1 && (
                          <FormLayout defaultOptionality="optional">
                            <CheckboxList
                              label="Jobs"
                              description="They run in parallel on one machine, so the largest appetite sets the size you need."
                              value={jobs}
                              onChange={setJobs}
                              density="compact"
                              status={
                                currentErrors.jobs
                                  ? {
                                      type: 'error',
                                      message: currentErrors.jobs,
                                    }
                                  : undefined
                              }>
                              {JOBS.map(job => (
                                <CheckboxListItem
                                  key={job.id}
                                  value={job.id}
                                  label={job.label}
                                  description={job.description}
                                />
                              ))}
                            </CheckboxList>
                            {/* One runner, so radios — SelectableCard is a
                                checkbox underneath and a grid of them would
                                announce three independent toggles for a choice
                                that only ever has one answer. Stacking them
                                also puts the three memory figures in a column,
                                which is the comparison that matters here: it
                                is the number the trial run will judge. */}
                            <RadioList
                              label="Runner"
                              description="Charged per minute while a job is running."
                              value={runnerId}
                              onChange={setRunnerId}>
                              {RUNNERS.map(r => (
                                <RadioListItem
                                  key={r.id}
                                  value={r.id}
                                  label={`${r.label} · ${r.memoryGB} GB`}
                                  description={`${r.cores} cores, ${r.rate} per minute.`}
                                />
                              ))}
                            </RadioList>
                            <Selector
                              label="Node version"
                              options={NODE_VERSIONS}
                              value={nodeVersion}
                              onChange={setNodeVersion}
                              description="Used for every job unless a job overrides it."
                            />
                            {stepActions('Start checks', index)}
                          </FormLayout>
                        )}

                        {index === 5 && (
                          <FormLayout defaultOptionality="optional">
                            {/* Card, not Section: Section bleeds out of its
                                parent's inset, and the inset here is the
                                stepper's indicator column — the thing the rest
                                of the fields line up against. Muted because it
                                is the one block on the step that asks nothing
                                of the reader. The five rows above each hold a
                                fragment of this; laid out together they are
                                the configuration as one object, which is what
                                there is to review before turning it on. */}
                            <Card variant="muted" padding={4}>
                              {/* One column, labels alongside. Two columns
                                  would put the labels above their values and
                                  give each a half-width to wrap in, which is
                                  two concessions for a list of four rows that
                                  fits either way. Stacked, the values line up
                                  in a single column the eye can run down. */}
                              <MetadataList orientation="vertical">
                                <MetadataListItem
                                  label="Repository"
                                  icon={<Icon icon={CubeIcon} size="sm" />}>
                                  {repo.name}
                                </MetadataListItem>
                                <MetadataListItem
                                  label="Triggers"
                                  icon={<Icon icon={BoltIcon} size="sm" />}>
                                  {triggerSummary}
                                </MetadataListItem>
                                <MetadataListItem
                                  label="Runner"
                                  icon={<Icon icon={CpuChipIcon} size="sm" />}>
                                  {`${runner.label}, ${runner.memoryGB} GB · Node ${nodeVersion}`}
                                </MetadataListItem>
                                <MetadataListItem
                                  label="Toolchain"
                                  icon={<Icon icon={BeakerIcon} size="sm" />}>
                                  {`${repo.packageManager} · ${repo.testRunner}, ${repo.testCount.toLocaleString()} tests`}
                                </MetadataListItem>
                              </MetadataList>
                            </Card>
                            <Switch
                              label="Require branches to be up to date before merging"
                              value={strictBranches}
                              onChange={setStrictBranches}
                              labelPosition="start"
                              labelSpacing="spread"
                            />
                            {stepActions(
                              'Enable continuous integration',
                              index,
                            )}
                          </FormLayout>
                        )}

                        {meta.kind === 'auto' && autoBody(index)}
                      </VStack>
                    )}
                  </Step>
                );
              })}
            </Stepper>

            {/* The chain broke, so the flow never reaches the review step. Say
                so where the eye already is — at the bottom of the column —
                rather than leaving the page looking merely unfinished. */}
            {hasFailure && (
              <Text type="supporting" color="secondary">
                Setup is paused at the failed step above. Fix what it found and
                the remaining checks will pick up from there.
              </Text>
            )}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
