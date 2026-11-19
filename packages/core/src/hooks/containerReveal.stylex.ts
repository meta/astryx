// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file containerReveal.stylex.ts
 * @input Uses StyleX, theme tokens
 * @output The container style that publishes the reveal state, the suspended
 *   and hover-delay container variants, and the four content style blocks
 *   (reveal / conceal, each with a layout-preserved variant) that read it.
 * @position Internal to useContainerReveal.
 *
 * HOW THE SCOPING WORKS: the container declares its own reveal state as
 * inherited custom properties on itself, and content reads them. Because a
 * nested container re-declares the same properties on itself, its subtree sees
 * the inner value and never the ancestor's — nesting isolation falls out of the
 * cascade, with one static style block for any number of containers.
 *
 * SYNC: When the block shape changes, update useContainerReveal.ts.
 */

import * as stylex from '@stylexjs/stylex';
import {durationVars, easeVars} from '../theme/tokens.stylex';

const REST_DELAY = '0s, ' + durationVars['--duration-fast'];

// The hover-intent gate: how long the pointer must dwell before the hover
// branch takes effect. Declared on every container so a nested one never
// inherits its ancestor's dwell.
const HOVER_DELAY = 'var(--_hover-delay, 0s)';

// The touch branch keys on the primary pointer (TOUCH_QUERY). A touchscreen
// laptop used with a mouse or trackpad can hover, so it keeps the hover reveal.
export const styles = stylex.create({
  container: {
    '--_hover-delay': '0s',
    '--_reveal-opacity': {
      default: 0,
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': 1,
      },
      ':focus-within': 1,
      '@media (pointer: coarse)': 1,
    },
    '--_reveal-position': {
      default: 'absolute',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': 'static',
      },
      ':focus-within': 'static',
      '@media (pointer: coarse)': 'static',
    },
    // The position flip is discrete, so it transitions with allow-discrete and
    // a state-conditional delay: the dwell on entry (flips into flow when the
    // gate opens, then fades in) and the fade duration on exit (stays in flow
    // until the fade finishes, then snaps out) — without the exit half the
    // content would snap out of flow at full opacity and flicker.
    '--_reveal-delay': {
      default: REST_DELAY,
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': HOVER_DELAY + ', ' + HOVER_DELAY,
      },
      ':focus-within': '0s, 0s',
      '@media (pointer: coarse)': '0s, 0s',
    },
    // Reduced motion drops the exit sequencing (there is no fade left to wait
    // for) but keeps the dwell: an intent gate is timing, not motion.
    '--_reveal-delay-reduced': {
      default: '0s, 0s',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': HOVER_DELAY + ', ' + HOVER_DELAY,
      },
      ':focus-within': '0s, 0s',
      '@media (pointer: coarse)': '0s, 0s',
    },
    // Conceal is a mouse-only visual swap, so it reads hover alone: no
    // :focus-within (a keyboard user must never watch content vanish) and no
    // coarse-pointer branch (it stays visible on touch).
    '--_conceal-opacity': {
      default: 1,
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': 0,
      },
    },
    // Single-value dwell for the opacity-only blocks, which have no discrete
    // position to sequence.
    '--_fade-delay': {
      default: '0s',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': HOVER_DELAY,
      },
      ':focus-within': '0s',
      '@media (pointer: coarse)': '0s',
    },
  },
  // stateInactive is `container` with the hover branch pinned to its rest
  // value, so the pointer stops driving the reveal while a caller holds the
  // container inactive. Keyboard focus and coarse pointers keep their branches:
  // an inactive container must never hide content from a keyboard or touch
  // user. Every property repeats the full condition shape of `container` —
  // StyleX replaces styles per property AND condition, so a plain `default`
  // here would lose to the earlier block's `:hover` rule.
  stateInactive: {
    '--_reveal-opacity': {
      default: 0,
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': 0,
      },
      ':focus-within': 1,
      '@media (pointer: coarse)': 1,
    },
    '--_reveal-position': {
      default: 'absolute',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': 'absolute',
      },
      ':focus-within': 'static',
      '@media (pointer: coarse)': 'static',
    },
    '--_reveal-delay': {
      default: REST_DELAY,
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': REST_DELAY,
      },
      ':focus-within': '0s, 0s',
      '@media (pointer: coarse)': '0s, 0s',
    },
    '--_reveal-delay-reduced': {
      default: '0s, 0s',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': '0s, 0s',
      },
      ':focus-within': '0s, 0s',
      '@media (pointer: coarse)': '0s, 0s',
    },
    '--_conceal-opacity': {
      default: 1,
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': 1,
      },
    },
    '--_fade-delay': {
      default: '0s',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': '0s',
      },
      ':focus-within': '0s',
      '@media (pointer: coarse)': '0s',
    },
  },
  // stateActive pins the other end: every branch reads as pointed-at, so
  // revealed content stays in and inverted content stays out, with no dwell to
  // wait through.
  stateActive: {
    '--_reveal-opacity': {
      default: 1,
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': 1,
      },
      ':focus-within': 1,
      '@media (pointer: coarse)': 1,
    },
    '--_reveal-position': {
      default: 'static',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': 'static',
      },
      ':focus-within': 'static',
      '@media (pointer: coarse)': 'static',
    },
    '--_reveal-delay': {
      default: '0s, 0s',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': '0s, 0s',
      },
      ':focus-within': '0s, 0s',
      '@media (pointer: coarse)': '0s, 0s',
    },
    '--_reveal-delay-reduced': {
      default: '0s, 0s',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': '0s, 0s',
      },
      ':focus-within': '0s, 0s',
      '@media (pointer: coarse)': '0s, 0s',
    },
    '--_conceal-opacity': {
      default: 0,
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': 0,
      },
    },
    '--_fade-delay': {
      default: '0s',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': '0s',
      },
      ':focus-within': '0s',
      '@media (pointer: coarse)': '0s',
    },
  },
  hoverDelay: (delay: string) => ({'--_hover-delay': delay}),
  // The fallbacks make content spread outside a reveal container fail visible
  // rather than invisible.
  reveal: {
    transitionProperty: 'opacity, position',
    transitionDuration: {
      default: durationVars['--duration-fast'] + ', 0s',
      '@media (prefers-reduced-motion: reduce)': '0s, 0s',
    },
    transitionTimingFunction: easeVars['--ease-standard'],
    transitionBehavior: 'allow-discrete',
    transitionDelay: {
      default: 'var(--_reveal-delay, 0s, 0s)',
      '@media (prefers-reduced-motion: reduce)':
        'var(--_reveal-delay-reduced, 0s, 0s)',
    },
    opacity: 'var(--_reveal-opacity, 1)',
    position: 'var(--_reveal-position, static)',
  },
  revealLayoutPreserved: {
    transitionProperty: 'opacity',
    transitionDuration: {
      default: durationVars['--duration-fast'],
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    transitionTimingFunction: easeVars['--ease-standard'],
    transitionDelay: 'var(--_fade-delay, 0s)',
    opacity: 'var(--_reveal-opacity, 1)',
  },
  conceal: {
    transitionProperty: 'opacity',
    transitionDuration: {
      default: durationVars['--duration-fast'],
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    transitionTimingFunction: easeVars['--ease-standard'],
    transitionDelay: 'var(--_fade-delay, 0s)',
    opacity: 'var(--_conceal-opacity, 1)',
  },
  concealLayoutPreserved: {
    transitionProperty: 'opacity',
    transitionDuration: {
      default: durationVars['--duration-fast'],
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    transitionTimingFunction: easeVars['--ease-standard'],
    transitionDelay: 'var(--_fade-delay, 0s)',
    opacity: 'var(--_conceal-opacity, 1)',
  },
  // Per-element overrides. These read no container state at all — they are the
  // caller saying what THIS element looks like, whatever the container is
  // doing, so they are plain values rather than custom properties.
  contentShown: {
    opacity: 1,
    position: 'static',
    transitionDelay: '0s',
  },
  // Hidden yields to focus: a forced-hidden element is still mounted and still
  // tabbable, so it has to reappear when focus lands inside it — otherwise a
  // keyboard user tabs into something they cannot see.
  contentHidden: {
    opacity: {default: 0, ':focus-within': 1},
    position: {default: 'absolute', ':focus-within': 'static'},
    transitionDelay: '0s',
  },
  // Layout-preserved content has no discrete position to flip, so its hidden
  // variant is opacity alone.
  contentHiddenLayoutPreserved: {
    opacity: {default: 0, ':focus-within': 1},
    transitionDelay: '0s',
  },
});
