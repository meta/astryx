// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file rubric.ts
 * @input The project brief's rubric table, the published Motion page, the audit
 * @output The twelve criteria as data, plus how they are graded and enforced
 * @position Motion Lab data module; no React, no side effects
 *
 * The brief's Deliverables section promises "ten graded criteria" and its own
 * table lists twelve. Twelve is what is written here, because twelve is what
 * the table describes; the count in Deliverables is the thing to fix, and it
 * matters because a number in a deliverable gets quoted in a review.
 *
 * Two criteria contradict guidance Astryx publishes today rather than
 * extending it, so they carry a `guidance` marker: a rubric cannot fail a
 * component for following the docs. See publishedGuidance.ts.
 *
 * Evidence strings are built from the generated audit rather than typed, so a
 * regenerated audit moves the rubric's citations with it.
 */

import {LOOP_COUNTS} from './motionCost';
import {
  AUDIT_COUNTS,
  HARDCODED_SITES,
  TRANSFORM_TRANSITIONS,
} from './__generated__/motionAudit';

const TINT_150 = HARDCODED_SITES.filter(
  site => site.value === '150ms' && site.component === 'Table',
).length;

const INSTANT_ESCAPES = HARDCODED_SITES.filter(
  site => site.value === '0.01s',
).length;

const MULTI_PROPERTY_TRANSFORMS = TRANSFORM_TRANSITIONS.filter(
  site => site.decl?.includes(',') === true,
).length;

export type Severity = 'blocker' | 'should-fix' | 'polish';

/** Whether a checker can decide this today, from source, with no human. */
export type Automatable = 'yes' | 'partly' | 'no';

export type Criterion = {
  readonly n: number;
  readonly id: string;
  readonly title: string;
  readonly severity: Severity;
  /** Set where the severity depends on the surface rather than the finding. */
  readonly severityNote?: string;
  readonly automatable: Automatable;
  /** What a checker reads, or who decides when nothing can. */
  readonly check: string;
  readonly rule: string;
  readonly pass: string;
  readonly fail: string;
  /** Measured, from __generated__/motionAudit.ts. */
  readonly evidence?: string;
  /** How the criterion sits against the published Motion page. */
  readonly guidance?: 'reversal' | 'overreach' | 'aligned';
  readonly guidanceNote?: string;
  /** Another criterion this one pulls against, if any. */
  readonly contradicts?: number;
  readonly contradictionNote?: string;
};

export const SEVERITY_LABEL: Readonly<Record<Severity, string>> = {
  blocker: 'Blocker',
  'should-fix': 'Should fix',
  polish: 'Polish',
};

export const SEVERITY_RULES: ReadonlyArray<{
  readonly severity: Severity;
  readonly meaning: string;
  readonly gate: string;
}> = [
  {
    severity: 'blocker',
    meaning:
      'The motion is wrong in a way that costs comprehension, accessibility or frame rate.',
    gate: 'Open blockers fail the review. No exceptions, no "fix it in the follow-up".',
  },
  {
    severity: 'should-fix',
    meaning: 'The motion works but is not what the system would do.',
    gate: 'Two open items are tolerated. A third fails, so the debt cannot accumulate quietly.',
  },
  {
    severity: 'polish',
    meaning: 'A judgement call about feel, where reasonable people differ.',
    gate: 'Recorded, never blocking. Argue it in the review, not in the gate.',
  },
];

export const PASS_BAR =
  'No open blockers, and at most two open "should fix" items. Polish items are recorded and never block.';

export const RUBRIC_CRITERIA: ReadonlyArray<Criterion> = [
  {
    n: 1,
    id: 'justified',
    title: 'Justified motion',
    severity: 'blocker',
    automatable: 'no',
    check:
      'Reviewer. The justification is written in the diff, not inferred from it.',
    rule: 'Every animation names its purpose: orientation, continuity, feedback or attention.',
    pass: 'The reason survives the question "what breaks if we delete it?".',
    fail: '"It looks good" on an element the user sees dozens of times a day.',
    evidence:
      'Deleting the animation is a valid outcome of this criterion, and on a high-frequency surface it is usually the strongest fix available.',
  },
  {
    n: 2,
    id: 'frequency',
    title: 'Frequency-appropriate',
    severity: 'blocker',
    automatable: 'no',
    check:
      'Reviewer, against how often the surface is actually seen. No tool knows that.',
    rule: 'Motion is scaled to frequency. Keyboard-initiated actions and anything seen 100+ times a day get none.',
    pass: 'A checkbox tick, a table row hover and a menu keyboard traversal are instant.',
    fail: 'A 200ms draw-on tick, on a control used forty times in a form.',
    guidance: 'aligned',
    guidanceNote:
      'The published page already names table row hovers and list item highlights under "Where Motion Hurts". The rubric formalises it; it does not invent it.',
    evidence: `${TINT_150} of the measured hardcoded values are 150ms tints in Table, on exactly the interaction that paragraph warns about.`,
    contradicts: 7,
    contradictionNote:
      'This criterion decides whether a presence surface earns an exit at all. Criterion 7 as the brief wrote it overrode that for anything classed as an overlay, which made Tooltip simultaneously required to have no motion and required to animate out. Criterion 7 has been narrowed so this one wins.',
  },
  {
    n: 3,
    id: 'tokens',
    title: 'Token fidelity',
    severity: 'blocker',
    automatable: 'yes',
    check: 'Lint. Reads the StyleX rule object; no runtime, no reviewer.',
    rule: 'No hardcoded durations, delays or curves. No transitionProperty without a duration. No duration without a declared curve.',
    pass: 'Every value is a token, and the pair is complete.',
    fail: "transitionDuration: '150ms', or a duration with the curve left to the CSS default.",
    evidence: `Every hardcoded duration and curve, every duration with no declared curve, and every transitionProperty with no duration. ${INSTANT_ESCAPES} of the hardcoded values are the 0.01s reduced-motion escape, which needs an allowlist rather than a fix. See /motion/violations for the live counts.`,
  },
  {
    n: 4,
    id: 'semantic',
    title: 'Semantic correctness',
    severity: 'should-fix',
    automatable: 'partly',
    check:
      'Lint can check the pairing once semantic tokens exist. Whether a surface is entering or leaving is a reviewer call.',
    rule: 'Entry decelerates. Exit accelerates. Movement uses the move curve. Continuous motion is linear.',
    pass: '--duration-exit with --ease-exit: the surface leaves and gets out of the way.',
    fail: '--duration-exit with --ease-entry: an exit that spends its travel in the first frames and then hangs.',
  },
  {
    n: 5,
    id: 'budget',
    title: 'Duration budget',
    severity: 'should-fix',
    automatable: 'yes',
    check: 'Lint, against the token values. Arithmetic, not taste.',
    rule: 'Interface motion stays under 300ms. Overlays may reach 500ms.',
    pass: 'Enter at 230ms, overlay at 410ms.',
    fail: 'A 600ms hover, or an 800ms dialog that has to be sat through before the first click.',
  },
  {
    n: 6,
    id: 'compositor',
    title: 'Compositor-only',
    severity: 'blocker',
    severityNote:
      'Blocker on large surfaces — lists, tables, sheets. Should fix on a single small element.',
    automatable: 'partly',
    check:
      'Lint reads the animated property list. Whether the surface is large enough for it to matter is a reviewer call.',
    rule: 'Animate transform and opacity. clip-path is sanctioned; height is tolerated for disclosure only; transition: all is never acceptable.',
    pass: 'A marker that moves with translateY and scaleY, so the list never re-lays-out.',
    fail: 'Animating top and height on a list marker, which runs layout for the whole list every frame.',
    evidence: `transition: all is measured at ${AUDIT_COUNTS.transitionAll} sites today. The rule is a guard against regression, not a cleanup.`,
  },
  {
    n: 7,
    id: 'presence',
    title: 'Enter and exit',
    severity: 'blocker',
    severityNote:
      'Blocker for surfaces whose dismissal reveals content underneath — dialogs, drawers, sheets, lightboxes. Not applicable to surfaces the user has already looked away from.',
    automatable: 'partly',
    check:
      'Lint can see whether a component only ever transitions on mount. Whether the exit retraces the entry needs eyes.',
    rule: 'An exit is animated when it aids orientation — the surface is spatially anchored, or its dismissal reveals what was underneath. When animated it retraces the entry path. A surface the user has already looked away from may dismiss instantly.',
    pass: 'A drawer that slid in from the right slides back out to the right, on the exit curve. A tooltip disappears instantly, because the pointer has already left it.',
    fail: 'A drawer that slides in and is removed on the next frame. Or an exit that leaves by a different edge than it arrived from.',
    guidance: 'overreach',
    guidanceNote:
      'Narrowed from the brief, which failed any surface that animated in and vanished out. That version contradicted the published page and the brief\u2019s own cited source: Emil\u2019s guidance says high-frequency UI often should not animate its exit at all. Orientation is the test, not presence. What survives unchanged is the direction rule, which every source states outright.',
    contradicts: 2,
    contradictionNote:
      'As the brief wrote it, this criterion and criterion 2 could not both be satisfied. Tooltip is the highest-frequency surface in the system, so criterion 2 says give it no motion; it is also an overlay, so criterion 7 made an instant dismissal a blocker. The narrowing resolves it — frequency decides whether an exit is warranted, and this criterion governs only the exits that are.',
  },
  {
    n: 8,
    id: 'origin',
    title: 'Origin and physicality',
    severity: 'should-fix',
    automatable: 'partly',
    check:
      'Lint catches scale(0) and a missing transform-origin. Whether the origin matches the trigger needs eyes.',
    rule: 'Trigger-anchored surfaces scale from their trigger, not their centre. Modals are exempt. Never scale(0): start between 0.9 and 0.97 with opacity.',
    pass: 'A menu growing out of the corner of the button that opened it.',
    fail: 'scale(0) — nothing in the physical world appears from nothing.',
    guidance: 'aligned',
    guidanceNote:
      'The published page already says contextual UI should feel connected to its trigger, and already carries the exemption for global UI. This criterion can cite it rather than re-argue it.',
  },
  {
    n: 9,
    id: 'interruptible',
    title: 'Interruptibility',
    severity: 'should-fix',
    automatable: 'partly',
    check:
      'Lint can flag a keyframe driving a state change. Judging the interrupted feel needs the demo.',
    rule: 'Transitions and springs retarget from the current value. Keyframes restart from zero and fail this.',
    pass: 'Interrupt the travel and the element continues from where it is.',
    fail: 'Interrupt it and the element teleports back to the start before running again.',
  },
  {
    n: 10,
    id: 'reduced-motion',
    title: 'Reduced motion',
    severity: 'blocker',
    automatable: 'yes',
    check:
      'Lint. An animating file with no prefers-reduced-motion branch is mechanically detectable.',
    rule: 'Honoured, and degraded rather than deleted: movement and position change go, opacity and colour stay. Hover motion is gated behind a fine pointer, since touch fires a hover on tap. Continuous loops stop rather than slow down.',
    pass: 'The loop stops and is replaced by a determinate state; the tint still tells you the row is hovered.',
    fail: 'A spinner slowed to 3s, which is still vestibular motion and now also reads as a hang.',
    guidance: 'reversal',
    guidanceNote:
      'The published page says to replace animation with instant state changes — delete, not degrade. Choosing degrade is a change of published policy, and the 36-file sweep writes whichever answer wins 36 times.',
    evidence: `${AUDIT_COUNTS.filesWithoutReducedMotion} of ${AUDIT_COUNTS.animatedFiles} animated files have no reduced-motion branch at all.`,
  },
  {
    n: 11,
    id: 'cohesion',
    title: 'Cohesion',
    severity: 'polish',
    automatable: 'no',
    check:
      'Reviewer, against the rest of the library rather than against a number.',
    rule: 'Motion matches the component\u2019s personality and the library it lives in. Group entrances stagger between 30ms and 80ms.',
    pass: 'A crisp component in a crisp library; a list that enters at 50ms intervals.',
    fail: 'One bouncy component in a library that is otherwise crisp. That is a finding, not a flourish.',
  },
  {
    n: 12,
    id: 'library',
    title: 'Library compatibility',
    severity: 'should-fix',
    automatable: 'yes',
    check:
      'Lint plus a render test: forwarded ref, merged className and style, no CSS transition on transform.',
    rule: 'The root forwards a ref to a real DOM node, merges className and style with the consumer last, and puts no CSS transition on transform.',
    pass: 'Press feedback on the independent scale property, so a motion library can own transform.',
    fail: 'transition: transform on the root — every transform a library writes gets re-eased, so drags lag and springs never settle.',
    evidence: `Transform transitions across the package, including Button. ${MULTI_PROPERTY_TRANSFORMS} of them declare transform inside a longer property list, where a grep for it never looks. The generated audit undercounted this twice before the scanner learned to read wrapped values and nested StyleX rules; the brief\u2019s "20+ components" was right all along.`,
  },
  {
    n: 13,
    id: 'idle-cost',
    title: 'Idle cost',
    severity: 'blocker',
    severityNote:
      'Blocker for anything that loops. Not applicable to one-shot transitions, which criterion 6 already governs.',
    automatable: 'partly',
    check:
      'Lint can read the animated property off an infinite keyframe set and check for a reduced-motion arm. Whether the containment is right, and whether the loop should exist at all, needs a trace.',
    rule: 'A loop animates transform and opacity only, paints inside its own box (contain: paint plus a deliberate layer gated on prefers-reduced-motion: no-preference), and has an arm that stills it. Motion that cannot be a transform is stepped with steps() at the lowest legible cadence, never per frame.',
    pass: 'A spinner that rotates on transform inside a contained box, and stops \u2014 rather than slows \u2014 under reduced motion.',
    fail: 'A shimmer on background-position, a pulse on box-shadow, or a bar on inset. Each repaints or re-lays-out every frame, forever, on a page where nothing is happening.',
    evidence: `${LOOP_COUNTS.total} loops measured across core, lab and this lab. ${LOOP_COUNTS.paintOrLayout} animate a paint-only or layout property; ${LOOP_COUNTS.publishedUncontained} of the ${LOOP_COUNTS.core + LOOP_COUNTS.lab} the packages publish are uncontained, and one has no reduced-motion arm at all.`,
    guidance: 'aligned',
    guidanceNote:
      'The published page already warns that motion the user sees constantly is where motion hurts. This criterion is that warning applied to the one case where the cost does not stop when the user does.',
  },
];

export const AUTOMATABLE_LABEL: Readonly<Record<Automatable, string>> = {
  yes: 'Mechanical today',
  partly: 'Partly — lint narrows it, a human decides',
  no: 'Human judgement',
};

/**
 * Astryx already gates lab-to-core promotion on an accessibility checklist.
 * Motion works the same way or it does not work at all: published, graded per
 * component, tracked. The only real question is what happens to the components
 * that already exist, which is what this table answers.
 */
export const GRANDFATHERING: ReadonlyArray<{
  readonly situation: string;
  readonly rule: string;
  readonly why: string;
}> = [
  {
    situation: 'Lab to core promotion',
    rule: 'The full rubric applies from day one. No baseline, no allowlist.',
    why: 'Promotion is the one moment where the cost of the rubric is already budgeted, and the same gate already exists for accessibility.',
  },
  {
    situation: 'A new core component',
    rule: 'Full rubric, no baseline.',
    why: 'Nothing to grandfather.',
  },
  {
    situation: 'Existing core components',
    rule: 'Scored once, baselined, and allowlisted with a dated remediation task per blocker. The allowlist can only shrink.',
    why: 'A gate that fails 48 animating components on the day it lands gets turned off in a week. A baseline that can only shrink is the same rule with a schedule.',
  },
  {
    situation: 'An unrelated change to a failing component',
    rule: 'Not blocked. The rule is no new violations against the baseline.',
    why: 'Blocking a copy fix on a motion debt nobody in the diff created is how a gate loses its constituency.',
  },
  {
    situation: 'A motion change to a failing component',
    rule: 'Must clear that component\u2019s blockers before it lands.',
    why: 'If you are already in the motion code, this is the cheapest this fix will ever be — and it is the only way the allowlist actually shrinks.',
  },
];

/**
 * A principle the published page carries and the rubric does not. Left as data
 * so the rubric page can show the gap rather than describe it.
 */
export const MISSING_PRINCIPLE = {
  title: 'Direction should match the action',
  published:
    'Navigating deeper into content should feel like moving forward. Going back should feel like returning.',
  gap: 'Nothing in the twelve criteria covers directionality.',
  measuredAgainst:
    'Pagination and Calendar month-change are the surfaces this would be measured against. Both are audit gaps today with no criterion to fail.',
  recommendation:
    'Fold it into criterion 4 as a fourth pairing rule, or add it as a fourteenth criterion \u2014 thirteen is now idle cost. Either way the rubric should be a superset of the published guidance, not a divergent list.',
} as const;
