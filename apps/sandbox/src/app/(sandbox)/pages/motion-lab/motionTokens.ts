// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file motionTokens.ts
 * @input Real token defaults from @astryxdesign/core/theme/tokens.stylex
 * @output The proposed semantic motion layer, as data the lab renders and tunes
 * @position Motion Lab data module; no React, no side effects
 *
 * The primitive scale and `--ease-standard` below are the values core ships
 * today, copied so the lab can show today beside the proposal without
 * importing StyleX vars it would not be able to read back as numbers.
 * `scripts/generate-motion-audit.mjs` verifies the rest of the audit; these
 * nine durations and one curve are asserted by `motionTokens.test.ts`.
 */

export type SemanticEase = {
  readonly name: string;
  readonly value: string;
  readonly job: string;
  readonly rationale: string;
  /** Where the codebase already reaches for this curve without a token. */
  readonly evidence?: string;
};

export type SemanticDuration = {
  readonly name: string;
  readonly ms: number;
  /** The primitive it aliases, so a theme retunes it for free. */
  readonly primitive: string | null;
  readonly job: string;
  readonly budget: readonly [number, number] | null;
  readonly note?: string;
};

// --- what core ships today -------------------------------------------------

export const PRIMITIVE_DURATIONS: ReadonlyArray<readonly [string, number]> = [
  ['--duration-fast-min', 130],
  ['--duration-fast', 175],
  ['--duration-fast-max', 230],
  ['--duration-medium-min', 310],
  ['--duration-medium', 410],
  ['--duration-medium-max', 550],
  ['--duration-slow-min', 730],
  ['--duration-slow', 975],
  ['--duration-slow-max', 1300],
];

/** The one easing token core has. It covers entry, exit and state at once. */
export const CURRENT_EASE = {
  name: '--ease-standard',
  value: 'cubic-bezier(0.24, 1, 0.4, 1)',
} as const;

// --- the proposal ----------------------------------------------------------

export const SEMANTIC_EASES: ReadonlyArray<SemanticEase> = [
  {
    name: '--ease-entry',
    value: 'cubic-bezier(0.23, 1, 0.32, 1)',
    job: 'Things arriving. Decelerates hard.',
    rationale:
      'Within a hair of the current --ease-standard, so this is a rename with a nudge and almost nothing shifts.',
  },
  {
    name: '--ease-exit',
    value: 'cubic-bezier(0.3, 0, 0.6, 0.6)',
    job: 'Things leaving. Accelerates away.',
    rationale:
      'Not a proposal so much as a promotion: the sheet already authors this curve locally, with a comment measuring why the standard one would not do.',
    evidence: 'BottomSheet/BottomSheetPanel.tsx:172',
  },
  {
    name: '--ease-move',
    value: 'cubic-bezier(0.77, 0, 0.175, 1)',
    job: 'Movement on screen: sliding indicators, morphing surfaces, reorder.',
    rationale:
      'Symmetric in-out. The thing is already on screen, so it needs no arrival accent — only a legible path.',
  },
  {
    name: '--ease-state',
    value: 'ease',
    job: 'Hover, colour, selection.',
    rationale:
      'Symmetric and cheap. The sites that declare a duration and no curve are silently getting this already, so naming it changes nothing except that it becomes reviewable.',
    evidence: 'DURATION_WITHOUT_CURVE in the audit',
  },
  {
    name: '--ease-linear',
    value: 'linear',
    job: 'Progress, spinners, marquees, scroll-linked motion.',
    rationale:
      'Correct behaviour, wrong provenance: several sites hardcode it and most of them are right to. A token makes them lintable.',
    evidence: 'Spinner, DateInput wheel, BottomSheet scrim, Stepper',
  },
  {
    name: '--ease-drawer',
    value: 'cubic-bezier(0.32, 0.72, 0, 1)',
    job: 'Sheet and drawer travel.',
    rationale:
      'The iOS curve. Matches what BottomSheet and MobileNav are reaching for when they hand-tune sheet travel.',
  },
];

export const SEMANTIC_DURATIONS: ReadonlyArray<SemanticDuration> = [
  {
    name: '--duration-instant',
    ms: 0,
    primitive: null,
    job: 'Reduced motion and deliberate discrete flips.',
    budget: null,
    note: 'Replaces the spellings in use today. The 0.01s form is the common one and it is not arbitrary — a zero duration fires no transitionend, so anything sequencing off that event breaks. Decide 0 vs 0.01ms before the sweep.',
  },
  {
    name: '--duration-press',
    ms: 130,
    primitive: '--duration-fast-min',
    job: 'Press and active feedback.',
    budget: [100, 160],
  },
  {
    name: '--duration-state',
    ms: 175,
    primitive: '--duration-fast',
    job: 'Hover, colour, selection, focus ring.',
    budget: [100, 250],
  },
  {
    name: '--duration-enter',
    ms: 230,
    primitive: '--duration-fast-max',
    job: 'Popovers, tooltips, menus arriving.',
    budget: [125, 250],
  },
  {
    name: '--duration-exit',
    ms: 175,
    primitive: '--duration-fast',
    job: 'Dismissal.',
    budget: [100, 250],
    note: 'Shorter than enter, which beUI states plainly — old content should leave faster than new arrives. Treat it as a default rather than a law: Emil scopes asymmetric timing to system responses versus deliberate actions, and a dismissal the user chose and is watching may want the full enter duration. Nothing cited supports the ratio as a universal rule.',
  },
  {
    name: '--duration-reveal',
    ms: 310,
    primitive: '--duration-medium-min',
    job: 'Disclosure, collapse, expand.',
    budget: [200, 350],
  },
  {
    name: '--duration-overlay',
    ms: 410,
    primitive: '--duration-medium',
    job: 'Dialogs, drawers, sheets.',
    budget: [200, 500],
  },
  {
    name: '--duration-continuous',
    ms: 975,
    primitive: '--duration-slow',
    job: 'Spinners, progress, ambient loops.',
    budget: null,
    note: 'Does not reach the loops that actually exist: StatusDot runs 2s and Chat 1.5s, both outside a scale that stops at 1300ms.',
  },
];

export const STAGGERS: ReadonlyArray<readonly [string, number, string]> = [
  ['--stagger-tight', 30, 'Dense lists, small items.'],
  ['--stagger-base', 50, 'Default group entrance.'],
  ['--stagger-loose', 80, 'Few large items. Longer than this feels slow.'],
];

export type SpringSpec = {
  readonly name: string;
  readonly duration: number;
  readonly bounce: number;
  readonly use: string;
  /** The CSS pair a component should use for the same gesture. */
  readonly cssCounterpart: readonly [string, string];
};

export const SPRINGS: ReadonlyArray<SpringSpec> = [
  {
    name: 'press',
    duration: 0.3,
    bounce: 0.1,
    use: 'Pressable surfaces',
    cssCounterpart: ['--duration-press', '--ease-entry'],
  },
  {
    name: 'swap',
    duration: 0.4,
    bounce: 0.15,
    use: 'Content trading places inside a control',
    cssCounterpart: ['--duration-enter', '--ease-move'],
  },
  {
    name: 'panel',
    duration: 0.5,
    bounce: 0.2,
    use: 'Overlay entrances, sheet travel',
    cssCounterpart: ['--duration-overlay', '--ease-drawer'],
  },
  {
    name: 'layout',
    duration: 0.5,
    bounce: 0.15,
    use: 'Sliding indicators, morphing surfaces, reorder',
    cssCounterpart: ['--duration-overlay', '--ease-move'],
  },
];

/** Every tunable custom property, so the store can reset in one pass. */
export const ALL_TUNABLE_TOKENS: ReadonlyArray<string> = [
  ...SEMANTIC_EASES.map(e => e.name),
  ...SEMANTIC_DURATIONS.map(d => d.name),
  ...STAGGERS.map(([name]) => name),
];

export const DEFAULT_TOKEN_VALUES: Readonly<Record<string, string>> = {
  ...Object.fromEntries(SEMANTIC_EASES.map(e => [e.name, e.value])),
  ...Object.fromEntries(SEMANTIC_DURATIONS.map(d => [d.name, `${d.ms}ms`])),
  ...Object.fromEntries(STAGGERS.map(([name, ms]) => [name, `${ms}ms`])),
};
