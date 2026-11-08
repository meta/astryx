// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file publishedGuidance.ts
 * @input The published Motion foundation page (astryx.atmeta.com/docs/motion)
 * @output Where the proposal contradicts what Astryx tells people today
 * @position Motion Lab data module; no React, no side effects
 *
 * The brief reads the exit gap as drift — "the difference between those two
 * lists is largely historical rather than deliberate". For eleven of those
 * components that is not what happened. The published Movement Principles
 * tell component authors, in as many words, that tooltips, hover cards and
 * dropdown menus may disappear instantly. The components followed the docs.
 *
 * Two of the proposals here are genuine reversals — the docs and the proposal
 * cannot both stand, and a human has to pick. But the exit rule is a third
 * thing, and worth separating from them: checked against the sources the brief
 * itself cites, the published paragraph is the better-supported statement and
 * the proposal is the one that overreached. See SOURCES below. That is not a
 * decision to be made; it is a claim to be narrowed.
 *
 * Quotes are verbatim from the page as published, so they can be diffed
 * against it later.
 */

export type GuidanceConflict = {
  readonly id: string;
  /** The heading it sits under on the published page. */
  readonly section: string;
  /** Verbatim, so this file can be checked against the live page. */
  readonly published: string;
  readonly proposed: string;
  readonly reading: string;
  /** What has to happen for the proposal to be legitimate. */
  readonly resolution: string;
  /**
   * reversal  — docs and proposal conflict; a human picks one.
   * overreach — the proposal claims more than its own sources support, and the
   *             published text is closer to them. Narrow the proposal.
   * extension — the proposal adds something the page leaves out.
   * aligned   — same rule, said twice.
   */
  readonly severity: 'reversal' | 'overreach' | 'extension' | 'aligned';
  /** Where in the lab you can look at the two side by side. */
  readonly href: string;
};

export const PUBLISHED_PAGE_URL = 'https://astryx.atmeta.com/docs/motion';

/**
 * Where the exit rules actually come from.
 *
 * The brief cites Emil Kowalski's animation guidance and beUI as its
 * references, so they are the standard it can be held to. Read against them,
 * the two halves of "exit" come apart: direction is unanimous, timing is not.
 */
export const SOURCES: ReadonlyArray<{
  readonly claim: string;
  readonly support: ReadonlyArray<{
    readonly source: string;
    readonly says: string;
  }>;
  readonly verdict: string;
}> = [
  {
    claim: 'An exit should retrace the entrance path.',
    support: [
      {
        source: 'Astryx, Movement Principles',
        says: 'When you do animate exit, match the entrance. A panel that slides in from the right should slide back out to the right.',
      },
      {
        source: 'Emil Kowalski, animation guidance',
        says: 'Exit the way it entered.',
      },
    ],
    verdict:
      'Unanimous, and the published page already says it. This half of the rule is safe to enforce.',
  },
  {
    claim: 'An exit should be shorter than its entrance.',
    support: [
      {
        source: 'beUI, motion guidance',
        says: 'Let old content leave faster than new content arrives.',
      },
      {
        source: 'Emil Kowalski, animation guidance',
        says: 'Asymmetric timing, argued around deliberate actions versus system responses — not as a universal rule.',
      },
    ],
    verdict:
      'One source states it plainly; the other scopes it to a distinction the brief drops. Nothing supports it as a law that applies to every exit, which is how the token mapping encodes it.',
  },
  {
    claim: 'Every presence surface should animate out.',
    support: [
      {
        source: 'Emil Kowalski, animation guidance',
        says: 'High-frequency UI often should not animate its exit at all.',
      },
      {
        source: 'Astryx, Movement Principles',
        says: 'Elements the user is moving away from \u2014 tooltips, hover cards, and dropdown menus \u2014 can disappear instantly. The user has already shifted their attention.',
      },
    ],
    verdict:
      'Both sources say the opposite of the proposal, and one of them is the brief\u2019s own reference. Criterion 7 as written is not supported by anything cited.',
  },
];

/**
 * The rule the sources actually support, as opposed to the one the brief
 * proposes. This is what criterion 7 should be narrowed to.
 */
export const CORRECTED_EXIT_RULE =
  'Animate an exit only when it aids orientation. When it is animated, its direction is spatially consistent with the entrance. Timing may be shorter when the dismissal is a system response, but is chosen by purpose and frequency rather than applied universally.';

export const GUIDANCE_CONFLICTS: ReadonlyArray<GuidanceConflict> = [
  {
    id: 'exit-optional',
    section: 'Movement Principles',
    published:
      'Not everything needs an animated exit. Elements the user is moving away from, such as tooltips, hover cards, and dropdown menus, can disappear instantly. The user has already shifted their attention. Animate the exit only when it helps orient the user, like a panel closing or a dialog dismissing to reveal what\u2019s underneath.',
    proposed:
      'Presence surfaces animate both directions. A surface that animates in and vanishes out fails. (Rubric criterion 7, Blocker for overlays.)',
    reading:
      'The eleven layer components are not drift. They are the published guidance, correctly followed — and it names tooltips, hover cards and dropdown menus specifically, which is most of the list. This is also the one conflict the sources settle: Emil\u2019s guidance, which the brief cites as a reference, says high-frequency UI often should not animate its exit at all. Both sources agree with the page; neither supports the criterion.',
    resolution:
      'Narrow the criterion rather than rewrite the paragraph. An exit is warranted when it aids orientation — a panel closing, a dialog revealing what was underneath — and is not warranted on a surface the user has already looked away from. The published paragraph mostly stands; what it lacks is the direction rule, which is the next conflict.',
    severity: 'overreach',
    href: '/pages/motion-lab/exit-gap/',
  },
  {
    id: 'exit-shorter',
    section: 'Movement Principles',
    published:
      'The page says nothing about exit duration. It asks only that the exit match the entrance.',
    proposed:
      '--duration-exit is 175ms against --duration-enter at 230ms: every exit is shorter than every entrance, by construction.',
    reading:
      'The token mapping encodes a universal law and the sources do not carry one. beUI states it plainly — "let old content leave faster than new content arrives" — but Emil argues asymmetric timing around deliberate actions versus system responses, a distinction the brief drops. A dismissal the user deliberately triggered and is watching is not the same as one the system performs on their behalf, and only the second clearly wants to be quick.',
    resolution:
      'Keep both tokens — the values are good defaults — but stop asserting the ratio as a rule. Name which dismissals are system responses (a toast expiring, a menu closing after a pick) and which are deliberate (a dialog the user chose to close), and let the second kind reach for --duration-enter without failing a review.',
    severity: 'overreach',
    href: '/pages/motion-lab/tokens/',
  },
  {
    id: 'reduced-motion-delete',
    section: 'Respecting User Preferences',
    published:
      'When it\u2019s enabled, replace animations with instant state changes.',
    proposed:
      'Honoured, and degraded rather than deleted. Keep opacity and colour, drop movement and position change. (Rubric criterion 10, Blocker.)',
    reading:
      'Deleting motion is not an oversight in the components either — it is what the page instructs. The open question in the brief already asks degrade-or-delete; what the brief does not say is that "delete" is the currently published answer, so degrading is a change of policy rather than a fix.',
    resolution:
      'Needs a designer and accessibility sign-off, then a rewrite of this paragraph. The 39-file sweep writes whichever branch is chosen 39 times, so it cannot start first.',
    severity: 'reversal',
    href: '/pages/motion-lab/reduced-motion/',
  },
  {
    id: 'exit-matches-entrance',
    section: 'Movement Principles',
    published:
      'When you do animate exit, match the entrance. A panel that slides in from the right should slide back out to the right.',
    proposed:
      'The exit retraces the entry path and is no slower than it, on the exit curve rather than the entry curve.',
    reading:
      'The strongest rule in the proposal, and the only exit claim both sources state outright — the page says match the entrance, Emil says exit the way it entered. It survives the narrowing criterion 7 needs: whenever an exit IS animated, this governs it. The proposal adds the part the page leaves out, the curve — matching the entrance exactly is what produced the sheet\u2019s measured problem, where a decelerate curve spent the travel in the first 59ms of a 410ms close.',
    resolution:
      'Extend the paragraph rather than replace it: same path, opposite curve. Leave duration out of it — see the exit-timing conflict.',
    severity: 'extension',
    href: '/pages/motion-lab/tokens/',
  },
  {
    id: 'trigger-anchored',
    section: 'Movement Principles',
    published:
      'Contextual UI should feel connected to its trigger. A dropdown should expand from the button that opened it. A popover should appear near the element it describes. This doesn\u2019t apply to global UI like command palettes or toasts, which have their own fixed positions.',
    proposed:
      'Trigger-anchored surfaces scale from their trigger, not their centre. Modals are exempt. (Rubric criterion 8.)',
    reading:
      'The same rule, and the page already carries the exemption the rubric needs. Criterion 8 can cite this paragraph instead of re-arguing it.',
    resolution: 'No change needed. Cite the published text in the rubric.',
    severity: 'aligned',
    href: '/pages/motion-lab/rubric/',
  },
  {
    id: 'frequency',
    section: 'Where Motion Hurts',
    published:
      'Table row hovers. List item highlights. Anything the user does dozens of times per minute. Adding perceptible duration to these interactions makes the interface feel like it\u2019s catching up to the cursor.',
    proposed:
      'Motion is scaled to how often it is seen. Keyboard-initiated and 100+/day actions get none. (Rubric criterion 2, Blocker.)',
    reading:
      'Aligned, and the page is the stronger statement of the two because it names the surfaces. Worth noting against the nine hardcoded 150ms values in Table: those are on exactly the interaction this paragraph is about, so the sweep should ask whether they want a token or want deleting.',
    resolution:
      'No change needed. The rubric formalises what the page already says.',
    severity: 'aligned',
    href: '/pages/motion-lab/violations/',
  },
  {
    id: 'direction',
    section: 'Movement Principles',
    published:
      'Direction should match the action. Navigating deeper into content should feel like moving forward. Going back should feel like returning. This keeps the user oriented in the structure of the application.',
    proposed: 'Nothing in the twelve criteria covers directionality.',
    reading:
      'A published principle the rubric drops on the floor. It is the rule Pagination and Calendar month-change would be measured against, and both are listed as gaps in the audit with no criterion to fail.',
    resolution:
      'Add a directionality criterion, or fold it into criterion 4 (semantic correctness) so the rubric is a superset of the published guidance rather than a divergent list.',
    severity: 'extension',
    href: '/pages/motion-lab/rubric/',
  },
  {
    id: 'blocking',
    section: 'Where Motion Hurts',
    published:
      'Animations that block interaction are worse. If a user has to wait for a panel to finish sliding before they can click something inside it, the animation has become an obstacle.',
    proposed:
      'Stagger must never block interaction; and useLayer awaits its exit transition rather than hiding synchronously.',
    reading:
      'This is the paragraph the exit work has to be careful about. Keeping an element alive through its exit is exactly the shape of thing this warns against, and the answer has to be that the surface stops accepting input the moment dismissal starts, not when the animation ends.',
    resolution:
      'Write the input-during-exit rule into the presence primitive\u2019s contract, and cite this paragraph when doing it.',
    severity: 'extension',
    href: '/pages/motion-lab/exit-gap/',
  },
];

/** Everything the published page says today, as the lab\u2019s "before" for docs. */
export const PUBLISHED_SECTIONS: ReadonlyArray<{
  readonly title: string;
  readonly summary: string;
  readonly stale: string | null;
}> = [
  {
    title: 'Overview',
    summary: 'Why motion, in two sentences: comprehension and craft.',
    stale: null,
  },
  {
    title: 'Duration',
    summary:
      'The nine primitives, as a table of token and value. Three bands, min/max derived from base x ratio.',
    stale:
      'Accurate, and it is the whole of what the page says about choosing one. No job is named against any token, which is the gap the semantic layer fills.',
  },
  {
    title: 'Easing',
    summary: 'One row: --ease-standard, cubic-bezier(0.24, 1, 0.4, 1).',
    stale:
      'Accurate. The page cannot say what the curve is for, because it is for everything.',
  },
  {
    title: 'Where Motion Helps / Hurts',
    summary:
      'Prose guidance on which surfaces earn motion and which are hurt by it.',
    stale: null,
  },
  {
    title: 'Movement Principles',
    summary:
      'Four bullets: exits are optional, match the entrance, direction matches the action, contextual UI connects to its trigger.',
    stale:
      'Bullet one is the reason for eleven of the audit\u2019s findings. Rewriting it is the load-bearing doc change in this project.',
  },
  {
    title: 'Respecting User Preferences',
    summary: 'Honour the OS setting; replace animations with instant changes.',
    stale:
      'Says delete. The proposal says degrade. One of the two has to move.',
  },
  {
    title: 'Usage',
    summary: 'A StyleX snippet applying durationVars and easeVars.',
    stale:
      'Still correct, and worth keeping verbatim: it is the shape the lint rule will enforce.',
  },
  {
    title: 'Best Practices',
    summary: 'Three dos and three donts.',
    stale:
      'No mention of the transform-only rule, the compositor cost, or interruptibility — all of which live only on the wiki today.',
  },
];
