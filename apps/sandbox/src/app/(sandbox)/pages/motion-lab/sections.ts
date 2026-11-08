// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file sections.ts
 * @input none
 * @output The lab's section registry, used by the rail and the overview
 * @position Motion Lab data module
 *
 * One list, so adding a page means adding a row here rather than editing a
 * rail, an overview grid and a set of prev/next links separately.
 */

export type MotionSection = {
  readonly href: string;
  readonly title: string;
  readonly group: string;
  /** What a reader can decide after spending time on this page. */
  readonly decides: string;
};

export const MOTION_SECTIONS: ReadonlyArray<MotionSection> = [
  {
    href: '/pages/motion-lab/',
    title: 'Overview',
    group: 'Start',
    decides:
      'Whether the audit in the brief matches the code, and which decisions are actually blocking.',
  },
  {
    href: '/pages/motion-lab/published/',
    title: 'Against the published page',
    group: 'Start',
    decides:
      'Which proposals are bug fixes and which are reversals of guidance Astryx publishes today.',
  },
  {
    href: '/pages/motion-lab/tokens/',
    title: 'Semantic tokens',
    group: 'Foundation',
    decides:
      'Whether six easings and eight durations are the right vocabulary, and what each value should be.',
  },
  {
    href: '/pages/motion-lab/springs/',
    title: 'Springs',
    group: 'Foundation',
    decides:
      'Whether the four named springs feel right, and whether they belong in the theme contract.',
  },
  {
    href: '/pages/motion-lab/js-mirror/',
    title: 'JS token mirror',
    group: 'Foundation',
    decides:
      'What the mirror has to expose for charts, canvas and motion libraries.',
  },
  {
    href: '/pages/motion-lab/export/',
    title: 'Export tuning',
    group: 'Foundation',
    decides:
      'Nothing — it emits whatever the rest of the lab has been tuned to.',
  },
  {
    href: '/pages/motion-lab/exit-gap/',
    title: 'The exit gap',
    group: 'Presence',
    decides:
      'Which surfaces earn an animated exit, and what enter and exit cost on the ones that do.',
  },
  {
    href: '/pages/motion-lab/bugs/',
    title: 'Small bugs',
    group: 'Presence',
    decides:
      'Which of the structural findings are real once you look at the code.',
  },
  {
    href: '/pages/motion-lab/violations/',
    title: 'Hardcoded values',
    group: 'Enforcement',
    decides:
      'What each hardcoded site becomes, and whether the swap is visible at all.',
  },
  {
    href: '/pages/motion-lab/rubric/',
    title: 'Rubric bench',
    group: 'Enforcement',
    decides:
      'Whether each criterion is checkable, and what a pass and a fail look like.',
  },
  {
    href: '/pages/motion-lab/reduced-motion/',
    title: 'Reduced motion',
    group: 'Enforcement',
    decides: 'Degrade or delete. The decision the 36-file sweep is waiting on.',
  },
  {
    href: '/pages/motion-lab/previews/',
    title: 'Live previews',
    group: 'Coverage',
    decides:
      'The coverage work: indicators, disclosure, chips, skeletons, lists.',
  },
  {
    href: '/pages/motion-lab/preview-plan/',
    title: 'Preview plan',
    group: 'Coverage',
    decides:
      'What every remaining preview has to show before it is worth building.',
  },
  {
    href: '/pages/motion-lab/library/',
    title: 'Motion library',
    group: 'Compatibility',
    decides:
      'The three blockers, and whether Button keeps its press transition.',
  },
  {
    href: '/pages/motion-lab/plan/',
    title: 'Plan & open questions',
    group: 'Plan',
    decides: 'Sequence, gates, and who has to answer what.',
  },
];
