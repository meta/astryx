// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file libraryCompat.ts
 * @input The project brief's compatibility section, checked against the audit
 * @output The three blockers, the cheap wins, and what already works
 * @position Motion Lab data module; no React, no side effects
 *
 * The recommendation is not "adopt Motion" but "be compatible with it": a
 * ~34KB runtime on every consumer buys nothing the CSS path is failing at,
 * and the two systems already coexist by construction because StyleX emits
 * atomic classes and Motion writes inline styles.
 *
 * Numbers here are deliberately absent: where a claim is countable the page
 * reads it from __generated__/motionAudit.ts instead. Worth knowing why that
 * matters — the brief's figure for this section ("20+ components") was
 * doubted by two earlier versions of the audit script and turned out to be
 * right. A generated number is only as good as its generator.
 */

import {
  HARDCODED_SITES,
  TRANSFORM_TRANSITIONS,
  type SiteRef,
} from './__generated__/motionAudit';

export const MOTION_BUNDLE_KB = 34;

export type Blocker = {
  readonly id: string;
  readonly title: string;
  /** What breaks, from the consumer's side. */
  readonly symptom: string;
  /** Why it breaks, in the code rather than in the abstract. */
  readonly cause: string;
  readonly fix: string;
  /** The Astryx-side work, sized. */
  readonly cost: string;
  readonly severity: 'blocker' | 'friction';
};

export const BLOCKERS: ReadonlyArray<Blocker> = [
  {
    id: 'overlay-exit',
    title: 'Overlays cannot exit-animate',
    symptom:
      'A consumer wraps a Dialog or a Popover in AnimatePresence, writes an exit variant, and sees nothing. The enter animation works, so the failure looks like their mistake.',
    cause:
      'Dialog is built on the native <dialog> element and every layer rides the Popover API. Both hard-remove the element from the top layer the moment it closes, so the exit animation runs against a box that is no longer painted. This is the same root cause as the CSS exit gap — one mechanism, failing two ways.',
    fix: 'A keepMounted escape hatch: the consumer owns unmount, Astryx stops removing the element the frame the state flips. This is the pattern Motion documents for Base UI, so it is a shape consumers already recognise.',
    cost: 'Shares its fix with the presence work. Doing them separately means solving top-layer retention twice.',
    severity: 'blocker',
  },
  {
    id: 'transform-transitions',
    title: 'CSS transitions on transform',
    symptom:
      'Springs never settle and drags rubber-band. The consumer is writing a value every frame and Astryx is re-easing every one of those writes.',
    cause:
      'Motion performs all layout animation by writing transform on each frame. A CSS transition on transform turns every one of those writes into the start of a new 175ms ease, so the element chases the value it was already given.',
    fix: 'Drop transform from the transition list where it only carries press or chevron feedback, or move that feedback onto the independent scale property, which no longer collides with a library writing transform.',
    cost: 'Small and mechanical, and materially smaller than the brief budgets for.',
    severity: 'blocker',
  },
  {
    id: 'composition',
    title: 'No composition escape hatch',
    symptom:
      'motion.create() needs an element to attach to. Without one, the consumer wraps the component root in a motion.div and animates a box around the component rather than the component.',
    cause:
      'Astryx has deliberately refused polymorphism, so there is no asChild-style prop. Wrapping works for a root; it is unavailable for every compound part whose element Astryx owns internally — a DropdownMenu item, a Tab, a TableRow.',
    fix: 'A composition prop, or a render-prop shape that fits the house conventions better. This is a design review rather than a fix, and it is the one blocker that cannot be closed inside the motion project.',
    cost: 'Unsized. It unblocks router links and drag-and-drop as well, so it should not be argued on motion alone.',
    severity: 'blocker',
  },
];

export type CheapWin = {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  /** Empty when the audit does not measure it. */
  readonly evidence: string | null;
};

export const CHEAP_WINS: ReadonlyArray<CheapWin> = [
  {
    id: 'refs',
    title: 'Add ref to the overlay components that lack it',
    detail:
      'A component a library cannot get a DOM node out of cannot be animated by it at all. Everything else on this page is moot for those components.',
    evidence: null,
  },
  {
    id: 'drop-transform',
    title: 'Drop the transform transitions',
    detail:
      'Closes blocker 2 for every consumer, and removes a transition nobody outside a press interaction is asking for.',
    evidence: `${TRANSFORM_TRANSITIONS.length} sites across ${new Set(TRANSFORM_TRANSITIONS.map(s => s.component)).size} components`,
  },
  {
    id: 'js-mirror',
    title: 'Ship the JS token mirror',
    detail:
      'Motion takes seconds as a number and easing as a four-number array. It cannot resolve var(--duration-fast), so today a consumer either reads computed style or invents its own timing.',
    evidence:
      'Already a brief deliverable; the lab has it at /motion/js-mirror',
  },
  {
    id: 'reduced-motion-hook',
    title: 'Export a reduced-motion hook',
    detail:
      'An app with its own reduce-motion setting can flip Motion but cannot flip a CSS media query, so the two halves of one interface disagree. A shared hook is the only way the CSS half and the JS half can be told the same thing.',
    evidence:
      'Blocked on degrade-or-delete: the hook has to return a policy, not a boolean',
  },
];

/** The part of the brief that measurement agreed with. */
export const ALREADY_RIGHT: ReadonlyArray<{
  readonly title: string;
  readonly detail: string;
}> = [
  {
    title: 'Refs are React-19 native',
    detail: 'No forwardRef ceremony for the components that pass one through.',
  },
  {
    title: 'className and style pass through, consumer last',
    detail:
      'The consumer wins the merge, which is what a library needs to write to an element.',
  },
  {
    title: 'No runtime CSS-in-JS',
    detail:
      'Nothing is recomputing styles underneath a library that is writing them.',
  },
  {
    title: 'StyleX loses the specificity contest by construction',
    detail:
      'Atomic classes versus inline styles: Motion wins every time, without a single !important. This is the compatibility that matters most and it already works.',
  },
];

/** The transform sites, grouped, so the page can list real file:line evidence. */
export function transformSitesByComponent(): ReadonlyArray<
  readonly [string, ReadonlyArray<SiteRef>]
> {
  const byComponent = new Map<string, SiteRef[]>();
  for (const site of TRANSFORM_TRANSITIONS) {
    const existing = byComponent.get(site.component);
    if (existing == null) {
      byComponent.set(site.component, [site]);
    } else {
      existing.push(site);
    }
  }
  return [...byComponent.entries()].sort((a, b) => b[1].length - a[1].length);
}

/**
 * The brief calls Button "the worst case because it is the most-wrapped
 * component". The measurement disagrees, so the page has to check rather than
 * repeat it.
 */
export function buttonFindings(): {
  readonly transformSites: ReadonlyArray<SiteRef>;
  readonly hardcoded: ReadonlyArray<{
    readonly file: string;
    readonly line: number;
    readonly value: string;
    readonly prop: string;
  }>;
} {
  return {
    transformSites: TRANSFORM_TRANSITIONS.filter(
      site => site.component === 'Button',
    ),
    hardcoded: HARDCODED_SITES.filter(site => site.component === 'Button').map(
      site => ({
        file: site.file,
        line: site.line,
        value: site.value,
        prop: site.prop,
      }),
    ),
  };
}
