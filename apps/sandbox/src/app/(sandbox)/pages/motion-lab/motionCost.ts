// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file motionCost.ts
 * @input Every continuous animation in core, lab, and this lab's own stylesheet
 * @output A cost tier per technique, and the inventory behind it
 * @position Motion Lab data module; no React, no side effects
 *
 * DESIGN.md's hard rule is "aesthetics never outrank performance". This file is
 * the mechanics for the one case where a motion decision keeps costing after
 * the interaction ends: an animation that loops.
 *
 * A one-shot transition costs once. A loop costs every frame it runs, on every
 * page it appears on, for as long as the page is open — including while the
 * user is doing nothing at all. That is a different kind of decision from
 * "which curve", and the rubric did not have a criterion for it.
 *
 * The background is kt-fr88: the working marks' ambient colour fade repainted
 * the FULL DOCUMENT at 60fps on an idle page — 1,591 document paints in 28s
 * with the GPU 78% busy. The property was the whole bug. Fixing it took a 4s
 * idle window from ~1,414 paints to under 100.
 *
 * What the rule asks for, in order of how much it buys:
 *
 *   1. Compositor properties only — opacity and transform. Never animate a
 *      paint-only property (colour, box-shadow, background-position) or a
 *      layout property (width, inset, height) continuously. If something must
 *      move that cannot be expressed as a transform, step it at the lowest
 *      legible cadence with steps(), not per frame.
 *   2. Contain the paint. A loop paints inside its own box: `contain: paint`
 *      plus a deliberate layer (`will-change: transform`), so a repaint cannot
 *      escape into the document.
 *   3. Gate the layer on `prefers-reduced-motion: no-preference`, so a user who
 *      asked for less motion is not charged layer memory for a stilled mark.
 *   4. Every loop has a reduced-motion arm that stills the movement and leaves
 *      the state legible.
 *
 * Evidence: D117309888 — idle paints 1,414 -> 93, raster tasks 12,060 -> 480,
 * style time 543ms -> 155ms, in a 4s window.
 */

/**
 * What a technique costs while nothing is happening.
 *
 * The tiers are about IDLE cost specifically. A one-shot transition can be
 * expensive for 200ms and still be `idle` here, because it stops. That is the
 * point of the distinction: criterion 6 already governs which properties a
 * transition may animate, and this governs what keeps running afterwards.
 */
export type MotionCost = 'idle' | 'low' | 'medium' | 'high';

export const COST_LABEL: Readonly<Record<MotionCost, string>> = {
  idle: 'Idle',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const COST_VARIANT: Readonly<
  Record<MotionCost, 'neutral' | 'success' | 'warning' | 'error'>
> = {
  idle: 'neutral',
  low: 'success',
  medium: 'warning',
  high: 'error',
};

export const COST_TIERS: ReadonlyArray<{
  readonly cost: MotionCost;
  readonly meaning: string;
  readonly gate: string;
}> = [
  {
    cost: 'idle',
    meaning:
      'Nothing runs once the interaction is over. Cost is paid per interaction and bounded by the duration.',
    gate: 'No cost review needed. Criterion 6 still governs which properties it may touch.',
  },
  {
    cost: 'low',
    meaning:
      'Loops, but on compositor properties only, inside its own paint box, with a deliberate layer and a reduced-motion arm.',
    gate: 'Ships. This is the target shape for anything that must run continuously.',
  },
  {
    cost: 'medium',
    meaning:
      'Loops on compositor properties, but the paint is not contained — so a repaint can escape into the document, and the cost scales with how many instances are on screen.',
    gate: 'Ships for a single small instance. Needs containment before it is used in a list, a table, or anywhere it multiplies.',
  },
  {
    cost: 'high',
    meaning:
      'Loops on a paint-only, inherited, or layout property. This is the kt-fr88 shape: it repaints or re-lays-out every frame, forever, on an idle page.',
    gate: 'Blocker. Move it to transform/opacity, or step it with steps() at the lowest legible cadence.',
  },
];

export const COST_RULE =
  'A looping animation runs forever, so it is judged on idle cost, not duration. Compositor properties only; contain the paint and take a deliberate layer; gate the layer on prefers-reduced-motion: no-preference; and give every loop an arm that stills it.';

export const COST_EVIDENCE =
  'kt-fr88: an ambient colour fade repainted the full document at 60fps on an idle page \u2014 1,591 document paints in 28s, GPU 78% busy. D117309888 cut a 4s idle window from 1,414 paints to 93, raster tasks from 12,060 to 480, and style time from 543ms to 155ms.';

/**
 * Every continuous animation in the two published packages and in this lab's
 * own stylesheet, with the property it actually animates.
 *
 * Read off the source rather than assumed, because the property is the whole
 * finding: two loops that look identical on screen can differ by an order of
 * magnitude in what they cost, and the difference is invisible until you read
 * the keyframes.
 */
export type LoopSite = {
  readonly where: 'core' | 'lab' | 'motion-lab';
  readonly component: string;
  readonly file: string;
  /** The property the keyframes actually animate. */
  readonly animates: string;
  readonly compositorSafe: boolean;
  readonly contained: boolean;
  readonly hasLayer: boolean;
  readonly hasReducedMotionArm: boolean;
  readonly cost: MotionCost;
  readonly note: string;
};

export const LOOP_INVENTORY: ReadonlyArray<LoopSite> = [
  // ---------------------------------------------------------------- core ---
  {
    where: 'core',
    component: 'Spinner',
    file: 'core/Spinner/Spinner.tsx',
    animates: 'transform: rotate',
    compositorSafe: true,
    contained: false,
    hasLayer: true,
    hasReducedMotionArm: true,
    cost: 'low',
    note: 'The best-behaved loop in either package, and the only one that takes a deliberate layer. Still not paint-contained, and the layer is unconditional rather than gated on prefers-reduced-motion.',
  },
  {
    where: 'core',
    component: 'Skeleton',
    file: 'core/Skeleton/Skeleton.tsx',
    animates: 'opacity',
    compositorSafe: true,
    contained: false,
    hasLayer: false,
    hasReducedMotionArm: true,
    cost: 'medium',
    note: 'Correct property, and the most-multiplied loop in the system: a loading table is dozens of these at once, each repainting uncontained. This is the strongest containment candidate in core.',
  },
  {
    where: 'core',
    component: 'ProgressBar',
    file: 'core/ProgressBar/ProgressBar.tsx',
    animates: 'transform (indeterminate slide)',
    compositorSafe: true,
    contained: false,
    hasLayer: false,
    hasReducedMotionArm: true,
    cost: 'medium',
    note: 'The indeterminate loop is transform and fine. Separately, line 244 transitions `width` on the determinate fill \u2014 one-shot per data change, so not a loop, but a bar fed by a fast upload ticks often enough to behave like one.',
  },
  {
    where: 'core',
    component: 'StatusDot',
    file: 'core/StatusDot/StatusDot.tsx',
    animates: 'opacity',
    compositorSafe: true,
    contained: false,
    hasLayer: false,
    hasReducedMotionArm: true,
    cost: 'medium',
    note: 'Correct property. Multiplies the same way Skeleton does \u2014 a status column is one of these per row, all pulsing uncontained.',
  },
  {
    where: 'core',
    component: 'Chat (message metadata)',
    file: 'core/Chat/ChatMessageMetadata.tsx',
    animates: 'opacity',
    compositorSafe: true,
    contained: false,
    hasLayer: false,
    hasReducedMotionArm: true,
    cost: 'medium',
    note: 'Correct property, single small instance, so the containment gap is theoretical here rather than urgent.',
  },
  // ----------------------------------------------------------------- lab ---
  {
    where: 'lab',
    component: 'Chat (typing indicator)',
    file: 'lab/Chat/ChatTypingIndicator.tsx',
    animates: 'transform + opacity',
    compositorSafe: true,
    contained: false,
    hasLayer: false,
    hasReducedMotionArm: true,
    cost: 'medium',
    note: 'Correct properties. Three dots, each its own loop, staggered by hardcoded 160ms and 320ms delays.',
  },
  {
    where: 'lab',
    component: 'ChatReasoning',
    file: 'lab/ChatReasoning/ChatReasoning.tsx',
    animates: 'background-position',
    compositorSafe: false,
    contained: false,
    hasLayer: false,
    hasReducedMotionArm: false,
    cost: 'high',
    note: 'The worst loop in either package, and the only one failing on every axis at once: a paint-only property, uncontained, no layer, and no reduced-motion arm \u2014 running for 4s per iteration, forever, behind streaming text the user is already reading.',
  },
  {
    where: 'lab',
    component: 'CircularProgress',
    file: 'lab/CircularProgress/CircularProgress.tsx',
    animates: 'stroke-dasharray + stroke-dashoffset',
    compositorSafe: false,
    contained: false,
    hasLayer: false,
    hasReducedMotionArm: true,
    cost: 'high',
    note: 'SVG geometry, so the path is re-rasterised every frame. The sibling rotation loop on the same component is a clean transform \u2014 the two sit side by side, which makes this the clearest teaching case in the audit. Has no row in the preview plan at all.',
  },
  // ----------------------------------------------------------- this lab ---
  {
    where: 'motion-lab',
    component: 'Loop demo \u2014 spinner',
    file: 'MotionLab.module.css .loopSpinner',
    animates: 'transform: rotate',
    compositorSafe: true,
    contained: true,
    hasLayer: true,
    hasReducedMotionArm: true,
    cost: 'low',
    note: 'Contained after this audit.',
  },
  {
    where: 'motion-lab',
    component: 'Loop demo \u2014 pulse dot',
    file: 'MotionLab.module.css .pulseDot',
    animates: 'box-shadow',
    compositorSafe: false,
    contained: true,
    hasLayer: false,
    hasReducedMotionArm: true,
    cost: 'high',
    note: 'A spreading box-shadow on a colour-mix, per frame \u2014 structurally the kt-fr88 bug. Kept deliberately: it is the demo of what the rule forbids, and it is now paint-contained so the demonstration cannot repaint the page around it.',
  },
  {
    where: 'motion-lab',
    component: 'Loop demo \u2014 shimmer',
    file: 'MotionLab.module.css .shimmer',
    animates: 'background-position',
    compositorSafe: false,
    contained: true,
    hasLayer: false,
    hasReducedMotionArm: true,
    cost: 'high',
    note: 'The skeleton-shimmer idiom, and the same violation as ChatReasoning. Kept as the demo; contained after this audit.',
  },
  {
    where: 'motion-lab',
    component: 'Loop demo \u2014 progress (width)',
    file: 'MotionLab.module.css .progressFillWidth',
    animates: 'inset-inline-start',
    compositorSafe: false,
    contained: true,
    hasLayer: false,
    hasReducedMotionArm: true,
    cost: 'high',
    note: 'A layout property animated continuously \u2014 the most expensive shape available, running layout for its containing block every frame. This is the "before" pane of the compositor demo, so it earns its place, but it was uncontained until this audit.',
  },
  {
    where: 'motion-lab',
    component: 'Loop demo \u2014 progress (transform)',
    file: 'MotionLab.module.css .progressFillTransform',
    animates: 'transform: translateX',
    compositorSafe: true,
    contained: true,
    hasLayer: true,
    hasReducedMotionArm: true,
    cost: 'low',
    note: 'The "after" pane, and already the target shape: transform with a deliberate layer.',
  },
];

/** Rolled up for the summary line, so the counts cannot drift from the table. */
export const LOOP_COUNTS = {
  total: LOOP_INVENTORY.length,
  core: LOOP_INVENTORY.filter(l => l.where === 'core').length,
  lab: LOOP_INVENTORY.filter(l => l.where === 'lab').length,
  motionLab: LOOP_INVENTORY.filter(l => l.where === 'motion-lab').length,
  high: LOOP_INVENTORY.filter(l => l.cost === 'high').length,
  paintOrLayout: LOOP_INVENTORY.filter(l => !l.compositorSafe).length,
  uncontained: LOOP_INVENTORY.filter(l => !l.contained).length,
  missingArm: LOOP_INVENTORY.filter(l => !l.hasReducedMotionArm).length,
  /** Published packages only — what a consumer of Astryx actually pays. */
  publishedUncontained: LOOP_INVENTORY.filter(
    l => l.where !== 'motion-lab' && !l.contained,
  ).length,
} as const;

/**
 * The finding, in one paragraph, for anyone who reads only the summary.
 *
 * Worth stating plainly because it is not the result anyone expected: core is
 * the clean part. Every loop it ships is opacity or transform and every one has
 * a reduced-motion arm. The property discipline is already there.
 */
export const COST_SUMMARY =
  'Core is clean on the part that matters most: all five of its loops animate opacity or transform, and all five have a reduced-motion arm. The two high-cost loops are both in lab \u2014 ChatReasoning animates background-position with no reduced-motion arm at all, and CircularProgress animates SVG stroke geometry. The systemic gap is containment: of the nine loops the two packages publish, exactly one takes a deliberate layer (Spinner) and none are paint-contained, so every loop can repaint beyond its own box. That costs least on a lone spinner and most on Skeleton and StatusDot, which are the two that multiply.';
