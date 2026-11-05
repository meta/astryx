// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file openQuestions.ts
 * @input The project brief, its review comments, and the lab's own findings
 * @output Sequence, gates, open questions, scope rules and risks
 * @position Motion Lab data module; no React, no side effects
 *
 * Named for the open questions because they are the part that blocks: the
 * sequence below is not a schedule but a dependency order, and most of its
 * edges are decisions rather than code. A stage with an unanswered question
 * above it does not start early, it starts twice.
 */

export type Stage = {
  readonly id: string;
  readonly index: number;
  readonly name: string;
  readonly size: string;
  readonly goal: string;
  readonly work: ReadonlyArray<string>;
  /** What has to be true before this stage starts. Decisions count. */
  readonly blockedBy: ReadonlyArray<string>;
};

export const STAGES: ReadonlyArray<Stage> = [
  {
    id: 'spike',
    index: 0,
    name: 'Spike',
    size: '1 week',
    goal: 'Find out whether the presence work is a week or a quarter before committing to either.',
    work: [
      'Prototype layer exit on Tooltip and Popover only — the two ends of the frequency range.',
      'Test @starting-style, transition-behavior: allow-discrete, and top-layer retention in the browsers Astryx supports.',
      'Define the dismissal state machine: what happens to focus return, outside-press and escape while an element is still leaving.',
      'Prototype press feedback on the independent scale property, on Button.',
    ],
    blockedBy: [],
  },
  {
    id: 'foundation',
    index: 1,
    name: 'Foundation',
    size: 'Sequenced in four steps, in this order',
    goal: 'Get a semantic vocabulary in place without changing how anything looks.',
    work: [
      'Semantic tokens as pure ALIASES onto the existing primitives — nothing shifts perceptually, so this lands with no visual review.',
      'Motion lint in warn mode, so the real violation list is the linter\u2019s rather than a script\u2019s.',
      'The token sweep: every hardcoded value becomes a token, still with no perceptual change.',
      'Lint to error. Only then retune the values, as a separate change with its own visual review.',
    ],
    blockedBy: [
      'Springs theme-tunable or not: adding them to the theme contract later is a breaking change.',
      'What --duration-instant is: 0s or 0.01ms. Ten of the measured sites are 0.01s escapes that exist to keep transitionend firing.',
    ],
  },
  {
    id: 'presence',
    index: 2,
    name: 'Presence',
    size: 'The largest single change',
    goal: 'One shared way to animate enter and exit, replacing six patterns.',
    work: [
      'Shared presence primitive; useLayer awaits its exit rather than hiding synchronously.',
      'Eleven layer components inherit it from one change.',
      'Dialog, AlertDialog and CommandPalette, plus the backdrop transition the scrim has never had.',
      'The input-during-exit rule, written into the primitive\u2019s contract.',
    ],
    blockedBy: [
      'Stage 0\u2019s dismissal state machine.',
      'The exit-optional reversal: the published page currently permits the hard cut, so the paragraph rewrite ships in this stack, not in Docs.',
    ],
  },
  {
    id: 'rubric',
    index: 3,
    name: 'Rubric',
    size: 'Publication plus four automated checks',
    goal: 'Motion becomes something a component is measured against rather than reviewed by taste.',
    work: [
      'Publish the criteria beside the accessibility checklist.',
      'Wire criteria 3, 5, 10 and 12 — the mechanical ones — into CI.',
      'Score every core component and track the results as a readiness gate.',
    ],
    blockedBy: [
      'Where the rubric lives: wiki or published docs.',
      'A grandfathering policy, or the rubric blocks unrelated work on day one.',
      'The published-page rewrite: a rubric cannot fail a component for following the docs.',
    ],
  },
  {
    id: 'coverage',
    index: 4,
    name: 'Coverage',
    size: 'Many small changes, individually revertible',
    goal: 'The gaps the audit named, in impact order.',
    work: [
      'Sliding indicators for TabList and SegmentedControl.',
      'Converge the nine disclosure surfaces onto one technique.',
      'SideNav rail collapse; the ADD rows: chips, skeleton swap, Banner, Lightbox, EmptyState.',
    ],
    blockedBy: [
      'Disclosure: grid tracks or height interpolation.',
      'The presence primitive, for anything with an enter and an exit.',
    ],
  },
  {
    id: 'docs',
    index: 5,
    name: 'Docs',
    size: 'Continuous, not a phase',
    goal: 'The published page stops disagreeing with the system.',
    work: [
      'Per-component motion specs and the property-level rules that live only on the wiki.',
      'The library compatibility guide and its conformance test.',
      'An owner and a trigger to revisit, since four months of drift is the status quo this has to break.',
    ],
    blockedBy: [
      'Every decision above — except the two reversal paragraphs, which ship with their code rather than waiting for this stage.',
    ],
  },
];

export type OpenQuestion = {
  readonly id: string;
  readonly question: string;
  /** Who or what has to supply the answer. */
  readonly needs: string;
  readonly blocks: string;
  /** Where in the lab you can look at it rather than argue about it. */
  readonly href: string;
  readonly hrefLabel: string;
  readonly urgency:
    | 'decide first'
    | 'decide before the sweep'
    | 'decide before publishing'
    | 'can run late';
};

export const OPEN_QUESTIONS: ReadonlyArray<OpenQuestion> = [
  {
    id: 'composition',
    question: 'Should Astryx adopt an asChild-style composition prop?',
    needs:
      'A design review at house level. Astryx has deliberately refused polymorphism, and a render-prop shape may fit the conventions better than asChild.',
    blocks:
      'Motion blocker 3, and equally router links and drag-and-drop. It should not be decided on motion\u2019s evidence alone.',
    href: '/pages/motion-lab/library/',
    hrefLabel: 'The three blockers',
    urgency: 'can run late',
  },
  {
    id: 'springs-themeable',
    question: 'Should springs be theme-tunable?',
    needs:
      'A call on whether a theme carries motion personality as well as colour and type.',
    blocks:
      'The token work. Adding springs to the theme contract after it ships is a breaking change, so this is decided before Foundation lands even if no theme overrides them at first.',
    href: '/pages/motion-lab/springs/',
    hrefLabel: 'Tune the four springs',
    urgency: 'decide first',
  },
  {
    id: 'degrade-or-delete',
    question: 'Degrade or delete under reduced motion?',
    needs:
      'A designer and an accessibility sign-off. Note that delete is not the status quo by accident — it is what the published page instructs, so degrading is a policy change.',
    blocks:
      'The 36-file sweep, which writes whichever branch is chosen 36 times, and the reduced-motion hook, which has to return a policy rather than a boolean.',
    href: '/pages/motion-lab/reduced-motion/',
    hrefLabel: 'Both policies, side by side',
    urgency: 'decide before the sweep',
  },
  {
    id: 'transform-strictness',
    question: 'How strict is the no-CSS-transition-on-transform rule?',
    needs:
      'A prototype of press feedback on the independent scale property. The evidence supports the brief: Button transitions transform at Button/Button.tsx:90 and takes scale(0.98) on :active, so it is exactly the conflict the brief describes.',
    blocks:
      'Rubric criterion 12, and the press token. The middle path costs one property name.',
    href: '/pages/motion-lab/library/',
    hrefLabel: 'transform vs scale vs none',
    urgency: 'decide before publishing',
  },
  {
    id: 'rubric-home',
    question: 'Where does the rubric live?',
    needs:
      'A repo-convention call. Wiki keeps the published page clean; it also means reviewers and consumers read different documents, which is part of why the transform-only rule never reached anyone outside the team.',
    blocks:
      'Rubric publication, and whether consumers can self-assess before promotion.',
    href: '/pages/motion-lab/rubric/',
    hrefLabel: 'The bench',
    urgency: 'decide before publishing',
  },
  {
    id: 'disclosure',
    question: 'Disclosure: grid tracks or height interpolation?',
    needs:
      'A bake-off verdict. It probably has no single winner — a table row cannot be a grid container — so the honest answer may be one technique with a documented exception.',
    blocks:
      'Converging nine surfaces, and any new disclosure surface built meanwhile.',
    href: '/pages/motion-lab/previews/',
    hrefLabel: 'The three techniques',
    urgency: 'decide before the sweep',
  },
  {
    id: 'slow-band',
    question:
      'Does the slow band get extended, or is ambient motion out of scope?',
    needs:
      'A ruling. The scale stops at 1300ms, so StatusDot at 2s and Chat at 1.5s bypass it entirely; both are in the hardcoded list because of it.',
    blocks:
      'Those two sites in the sweep, and the definition of --duration-continuous.',
    href: '/pages/motion-lab/tokens/',
    hrefLabel: 'The duration scale',
    urgency: 'decide before the sweep',
  },
  {
    id: 'mobile-tokens',
    question: 'Do we need different semantic motion tokens for mobile?',
    needs:
      'A decision on the shape, not the values. Recommendation: one shared vocabulary, per-platform values — the same names resolving to different numbers, the way the colour tokens already work. Two vocabularies means two rubrics and two docs pages.',
    blocks:
      'Token naming, so it is cheap now and expensive after the sweep. Raised in review on the Semantic motion tokens deliverable.',
    href: '/pages/motion-lab/tokens/',
    hrefLabel: 'The proposed vocabulary',
    urgency: 'decide first',
  },
  {
    id: 'theming-defaults',
    question: 'Do we publish default theming values with the tokens?',
    needs:
      'A call on what the theme contract exposes. The Collapsible reveal already introduced per-component theme-tunable motion, a sixth theming mechanism no doc describes, so the answer affects more than motion.',
    blocks:
      'The docs rewrite, and the springs question above — both are asking what a theme is allowed to retune. Raised in review on Deliverables.',
    href: '/pages/motion-lab/export/',
    hrefLabel: 'What the lab emits',
    urgency: 'decide before publishing',
  },
];

export type Commitment = {
  readonly item: string;
  readonly level: 'committed' | 'stretch';
  readonly why: string;
};

export const COMMITMENTS: ReadonlyArray<Commitment> = [
  {
    item: 'Semantic tokens as aliases + JS mirror',
    level: 'committed',
    why: 'No perceptual change, so it cannot slip on visual review.',
  },
  {
    item: 'Motion lint + the token sweep',
    level: 'committed',
    why: 'Mechanical, and it is what stops the list growing while the rest of the work runs.',
  },
  {
    item: 'Layer exit + shared presence primitive',
    level: 'committed',
    why: 'Four surfaces that genuinely want an exit, blocked by one primitive that cannot express one. The brief counts eleven; the triage on the exit-gap page argues most of those are correct as they are.',
  },
  {
    item: 'Dialog, AlertDialog, CommandPalette exit + backdrop',
    level: 'committed',
    why: 'Same primitive, and the scrim hard-cut is the most visible instance.',
  },
  {
    item: 'Rewrite of the two reversal paragraphs',
    level: 'committed',
    why: 'Ships with the code it contradicts, or the rubric has no authority.',
  },
  {
    item: 'Rubric published + four automated criteria',
    level: 'committed',
    why: 'Criteria 3, 5, 10 and 12 are mechanical; the token linter already exists.',
  },
  {
    item: 'Value retune (the six curves, the eight durations)',
    level: 'stretch',
    why: 'Moves every visual-regression baseline. Worth doing, worth doing alone.',
  },
  {
    item: 'Sliding indicators, disclosure convergence, SideNav rail',
    level: 'stretch',
    why: 'Each is a real component change with its own review; none blocks anything else.',
  },
  {
    item: 'The ADD rows (chips, skeleton swap, Banner, Lightbox, EmptyState)',
    level: 'stretch',
    why: 'Individually small, collectively a quarter. Take them in frequency order.',
  },
  {
    item: 'Conformance test in CI for library compatibility',
    level: 'stretch',
    why: 'Needs the guide first, and the guide needs the composition decision.',
  },
  {
    item: 'Composition prop',
    level: 'stretch',
    why: 'A house-level design decision that motion should inform, not force.',
  },
];

export type Risk = {
  readonly risk: string;
  /** What the lab does about it — or admits it cannot. */
  readonly mitigation: string;
};

export const RISKS: ReadonlyArray<Risk> = [
  {
    risk: 'Retuning easing changes how every existing component feels.',
    mitigation:
      'Tokens ship as pure aliases first, so the retune is a separate and revertible change. The lab is where the curves get agreed before that change is written: the rail\u2019s slow-mo reads a 175ms curve at 8x without moving the token.',
  },
  {
    risk: 'Motion is already fighting the automated gates — two fixes landed this month to stop animation interfering with the a11y audit and the visual-regression capture.',
    mitigation:
      'The lab cannot fix this. It is a policy gap: there is no documented rule for what an animated component does under test. Write one alongside the rubric, or the third fix lands the same way.',
  },
  {
    risk: 'The exit work touches dismissal, which is load-bearing and has its own invariants test.',
    mitigation:
      'That is what stage 0 is for. Keeping an element alive through its exit doubles the state matrix for focus return, outside-press and escape, and the spike exists to size that before anyone commits to the quarter.',
  },
  {
    risk: 'Focus return races the exit: Dialog returns focus to the trigger the moment it closes.',
    mitigation:
      'Visible in the lab\u2019s Dialog rig — the focus ring lands on the trigger while the dialog is still on screen, and the page may scroll under it. The presence contract has to say when focus moves, not just when the element goes.',
  },
  {
    risk: 'The rubric will fail components that ship today.',
    mitigation:
      'The bench scores real components, so the grandfathering list is a measured list rather than a promise. Publish it with the rubric.',
  },
  {
    risk: 'Doc drift is the status quo — the page went four months while a reduced-motion campaign landed underneath it.',
    mitigation:
      'The published-page comparison is a diff against the live text, with quotes verbatim so it can be re-run. Make that a check rather than a page, and drift becomes a failure rather than a discovery.',
  },
];

/** Inconsistencies in the brief itself, found while building the lab. */
export const BRIEF_DEFECTS: ReadonlyArray<{
  readonly defect: string;
  readonly detail: string;
}> = [
  {
    defect:
      'Deliverables says ten graded criteria; the rubric table has twelve.',
    detail:
      'Criteria 11 (cohesion) and 12 (library compatibility) are the two beyond ten. Twelve is the right number — 12 is the one four-of-which-are-automatable claim depends on — so fix the Deliverables line, not the table.',
  },
  {
    defect: 'The timeline has no dates.',
    detail:
      'Five milestones, every Due cell empty. Without dates the sequence above is the only ordering anyone can act on, and "by end of H2" is not a plan for six workstreams.',
  },
  {
    defect: 'The team is one person.',
    detail:
      'Team lists a single name for eleven components of presence work, a package-wide token sweep, a rubric, a docs rewrite and a compatibility guide. The decisions above need a designer and an accessibility reviewer who are not currently on it.',
  },
];
