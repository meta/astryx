// Copyright (c) Meta Platforms, Inc. and affiliates.

/* eslint-disable @astryx/no-hover-on-disabled -- Every hover branch is
 * nested beneath ENABLED below. Keeping that shared guard outside the media
 * branch is what gives hover and active matching generated specificity. */

/**
 * @file Shared hover and pressed overlay states
 * @input StyleX and the semantic interaction-overlay color tokens
 * @output Reusable background-color and background-image state styles, the
 *   touch press's registered strength variable (`pressVars`) and its clocks
 *   (`pressConsts`)
 * @position Internal styling utility for interactive core surfaces
 *
 * SYNC: When modified, update pressFeedback.ts, pressGesture.ts (the fade
 * clock), hooks/usePressFeedback.doc.mjs, the components that paint the touch
 * press off an ancestor scope or a pseudo-element (Switch, Tab,
 * CheckboxInput, RadioListItem, ClickableCard, SelectableCard, Thumbnail),
 * Button (a tracked action sizes its `:active` image to zero) and
 * scripts/build-css.test.mjs.
 */

// Every surface that paints a press uses one of these styles, so a change to
// the press is made here once.
//
// Keep the enabled guard outside the states. StyleX gives media-nested rules
// a higher priority. With `:active` repeated in the hover branch, hover and
// press get the same specificity, and StyleX emits `:active` last.
//
// A mouse keeps `:active`. A finger does not: on iOS Safari `:active` paints
// on the touch and can outlive the start of a scroll. So under
// `@media (pointer: coarse)` the press controller (pressFeedback.ts) writes
// `data-astryx-press`: `on` when the press is believed, and `fading` for the
// release. The query reads the primary pointer, so on a phone a mouse or
// Space-key press loses `:active` too, and the controller writes the
// attribute at once.
//
// The `on` and `fading` arms paint through `--astryx-press-alpha`, a
// registered `<number>` from 0 to 1. Gradients do not interpolate, but a registered number does.
// The touch paint is the pressed token at that strength, painted as a
// background image, so a composer's color transition cannot fade the onset
// in. `on` sets the strength to 1 on the first frame. `fading` animates it
// from 1 to 0, not to the hover strength, because a finger has no hover. The
// theme's motion tempo scales the release clock (AST-108).
//
// The release is an animation, not a transition. Composers own their
// `transition-*` longhands, and StyleX is last-wins per property. A
// transition would also make the release arm declare 0, so a composer that
// transitions `background-image` would start its own fade. With keyframes,
// both arms declare 1 and only the animation moves. An engine without
// `@property` steps the paint off at half the release.
//
// Composers must not set `backgroundImage` on the color variants, or
// `animation-*` on the element that composes them. The touch arms own both.

import * as stylex from '@stylexjs/stylex';
import {colorVars} from '../theme/tokens.stylex';

/**
 * The touch press's strength on the surface the controller painted, 0 to 1.
 *
 * Registered (`@property --astryx-press-alpha { syntax: "<number>";
 * initial-value: 0 }`) so it interpolates, and inherited, so an owner's
 * strength reaches the descendant that paints for it (a switch's track and
 * thumb, a tab's hover layer) and a card's or an indicator wrapper's
 * `::after`. Read it with `pressVars['--astryx-press-alpha']`, only inside a
 * `data-astryx-press` arm:
 * a pressed row's strength is 1 for everything inside the row.
 */
export const pressVars = stylex.defineVars({
  '--astryx-press-alpha': stylex.types.number(0),
});

/**
 * The touch press's clocks that both the stylesheet and the controller read.
 *
 * `defineConsts`, so the one number is inlined here at build time and is the
 * controller's constant at run time (`PRESS_FADE_MS` in pressGesture.ts):
 * the release animation and the timer that removes the attribute after it
 * cannot drift apart.
 */
export const pressConsts = stylex.defineConsts({
  /** How long the release takes, in ms. UIKit's deselect clock. */
  releaseMs: 200,
});

/**
 * The release's clock as CSS, scaled by the theme's `--_astryx-motion-tempo`
 * up to 1.5, its maximum. The controller's timer reads the same property.
 */
const PRESS_RELEASE_DURATION = `calc(${pressConsts.releaseMs}ms * min(var(--_astryx-motion-tempo, 1), 1.5))`;
/** The same clock under Reduce Motion: a tempo may shorten it, never lengthen it. */
const PRESS_RELEASE_DURATION_REDUCED = `min(${pressConsts.releaseMs}ms, calc(${pressConsts.releaseMs}ms * var(--_astryx-motion-tempo, 1)))`;

const ENABLED = ':where(:not(:disabled,[aria-disabled="true"]))';
const HOVER_HOVER = '@media (hover: hover)';
const COARSE = '@media (pointer: coarse)';
/**
 * Written by the touch press controller while a press is believed. The
 * attribute is the system's own (`data-astryx-*`, like the pressable marker),
 * outside the namespace a theme's state keys generate into (`[data-<state>]`),
 * so a theme state can never collide with it.
 *
 * The press selectors are typed `string`, not as literals. As a computed key,
 * a `string` gives the object an index signature, and StyleX reads the value
 * type from it. See {@link ByAttribute}.
 */
const PRESSED_ON: string = '[data-astryx-press="on"]';
/** Written by the touch press controller for the release's exit. */
const PRESSED_FADING: string = '[data-astryx-press="fading"]';

const PRESS_ALPHA = pressVars['--astryx-press-alpha'];

const hoverImage = `linear-gradient(${colorVars['--color-overlay-hover']}, ${colorVars['--color-overlay-hover']})`;
const pressedImage = `linear-gradient(${colorVars['--color-overlay-pressed']}, ${colorVars['--color-overlay-pressed']})`;
const neutralImage = `linear-gradient(${colorVars['--color-neutral']}, ${colorVars['--color-neutral']})`;

/**
 * The pressed token at the touch press's current strength: the one
 * declaration of the press's paint. Declared as `--_press-paint` on the
 * element the controller writes to (every style below carries it), where the
 * strength is 1 while a press is believed and animates 1 → 0 over the
 * release, so its computed value follows the fade frame by frame and is
 * inherited, resolved, by whatever paints it: the element's own arms, a
 * descendant (a switch's track and thumb, a tab's hover layer), or a `::after`
 * (a card, an indicator owner). Those paint `var(--_press-paint)` or
 * `var(--_press-paint-image)` and never rebuild the expression;
 * pressPaintSource.test.ts holds it to this file.
 */
const pressedOverlayColor = `color-mix(in srgb, ${colorVars['--color-overlay-pressed']} calc(${PRESS_ALPHA} * 100%), transparent)`;
const pressPaint = {
  '--_press-paint': pressedOverlayColor,
  '--_press-paint-image':
    'linear-gradient(var(--_press-paint), var(--_press-paint))',
};
/** The paint, read back off the element: the overlay's gradient layer. */
const pressedOverlayImage = 'var(--_press-paint-image)';

/** Strength 1 → 0; the release arm runs it over {@link PRESS_RELEASE_DURATION}. */
const pressRelease = stylex.keyframes({
  from: {[PRESS_ALPHA]: 1},
  to: {[PRESS_ALPHA]: 0},
});

/**
 * The release's curve: a gentle ease-out that spends the whole clock fading
 * (strength ≈ 0.2 at the midpoint), which is what a deselect crossfade reads
 * as. Not the system's `--ease-standard`: that curve is for things that move,
 * and is so front-loaded (strength 0.05 at the midpoint) that the release
 * would read as half its clock.
 */
const RELEASE_EASE = 'cubic-bezier(0, 0, 0.2, 1)';

/**
 * The touch press's strength and its release, on the element the controller
 * writes to. Every variant below carries both. `pressedAlpha` is the pair
 * alone.
 *
 * The keys are literal on purpose. StyleX reads `stylex.create` from the raw
 * AST. An object hoisted out of the call can first pass through a preset that
 * lowers ES2015, such as `next/babel`. That preset turns computed keys into
 * helper calls, and the build fails with "Referenced constant is not
 * defined". `PRESS_ALPHA` has a generated name, so it stays at each use. The
 * literal keys equal PRESSED_ON and PRESSED_FADING above.
 */
const pressStrength = {
  default: null,
  '[data-astryx-press="on"]': 1,
  '[data-astryx-press="fading"]': 1,
};
/**
 * A value that only attribute selectors choose, such as the press arms.
 *
 * StyleX infers a value's type from its `default`, its `:` and `@`
 * conditions, and an index signature. Literal attribute keys are none of
 * these. For a property whose conditions are all literal attribute keys, it
 * infers `unknown`, and no component's `xstyle` accepts that. This type gives
 * the hoisted press arms an index signature.
 */
type ByAttribute<Value> = Readonly<{
  default: null;
  [attribute: string]: Value | null;
}>;

const pressReleaseAnimation: Readonly<{
  animationName: ByAttribute<string>;
  animationDuration: ByAttribute<
    Readonly<{default: string; [media: `@media ${string}`]: string}>
  >;
  animationTimingFunction: ByAttribute<string>;
  animationFillMode: ByAttribute<'both'>;
}> = {
  animationName: {
    default: null,
    '[data-astryx-press="fading"]': pressRelease,
  },
  animationDuration: {
    default: null,
    '[data-astryx-press="fading"]': {
      default: PRESS_RELEASE_DURATION,
      '@media (prefers-reduced-motion: reduce)': PRESS_RELEASE_DURATION_REDUCED,
    },
  },
  animationTimingFunction: {
    default: null,
    '[data-astryx-press="fading"]': RELEASE_EASE,
  },
  animationFillMode: {default: null, '[data-astryx-press="fading"]': 'both'},
};

export const interactionOverlayStyles = stylex.create({
  backgroundColor: {
    [PRESS_ALPHA]: pressStrength,
    ...pressReleaseAnimation,
    ...pressPaint,
    backgroundColor: {
      default: 'transparent',
      [ENABLED]: {
        default: null,
        ':active': {
          default: colorVars['--color-overlay-pressed'],
          [COARSE]: 'transparent',
        },
        [HOVER_HOVER]: {
          default: null,
          ':hover': colorVars['--color-overlay-hover'],
          ':active': colorVars['--color-overlay-pressed'],
        },
        // While the controller paints, the colour arms yield to the image. A
        // device with a touchscreen beside a mouse matches `:active` and the
        // emulated `:hover` under a finger too, and the press would otherwise
        // paint twice.
        [PRESSED_ON]: 'transparent',
        [PRESSED_FADING]: 'transparent',
      },
    },
    backgroundImage: {
      default: null,
      [ENABLED]: {
        default: null,
        [PRESSED_ON]: pressedOverlayImage,
        [PRESSED_FADING]: pressedOverlayImage,
      },
    },
  },
  backgroundImage: {
    [PRESS_ALPHA]: pressStrength,
    ...pressReleaseAnimation,
    ...pressPaint,
    backgroundImage: {
      default: null,
      [ENABLED]: {
        default: null,
        ':active': {
          default: pressedImage,
          [COARSE]: 'none',
        },
        [HOVER_HOVER]: {
          default: null,
          ':hover': hoverImage,
          ':active': pressedImage,
        },
        [PRESSED_ON]: pressedOverlayImage,
        [PRESSED_FADING]: pressedOverlayImage,
      },
    },
  },
  backgroundImageOnNeutral: {
    [PRESS_ALPHA]: pressStrength,
    ...pressReleaseAnimation,
    ...pressPaint,
    backgroundImage: {
      default: neutralImage,
      [ENABLED]: {
        default: null,
        ':active': {
          default: `${pressedImage}, ${neutralImage}`,
          [COARSE]: neutralImage,
        },
        [HOVER_HOVER]: {
          default: null,
          ':hover': `${hoverImage}, ${neutralImage}`,
          ':active': `${pressedImage}, ${neutralImage}`,
        },
        [PRESSED_ON]: `${pressedOverlayImage}, ${neutralImage}`,
        [PRESSED_FADING]: `${pressedOverlayImage}, ${neutralImage}`,
      },
    },
  },
  /**
   * The pressed arm alone, for a control whose hover answer is its own — a
   * text link changes colour, a disclosure row has none — so a press paints
   * the system's pressed overlay without adding a hover surface the control
   * never had. Same enabled guard and the same two pointers as above.
   */
  pressedBackgroundColor: {
    [PRESS_ALPHA]: pressStrength,
    ...pressReleaseAnimation,
    ...pressPaint,
    backgroundColor: {
      default: null,
      [ENABLED]: {
        default: null,
        ':active': {
          default: colorVars['--color-overlay-pressed'],
          [COARSE]: 'transparent',
        },
        // The mouse arm yields to the image while the controller paints; see
        // the colour variant above.
        [PRESSED_ON]: 'transparent',
        [PRESSED_FADING]: 'transparent',
      },
    },
    backgroundImage: {
      default: null,
      [ENABLED]: {
        default: null,
        [PRESSED_ON]: pressedOverlayImage,
        [PRESSED_FADING]: pressedOverlayImage,
      },
    },
  },
  /**
   * The touch press's strength and release, and no paint of its own, for the
   * element the controller writes to when the pressed paint lives elsewhere:
   * a switch row (its track and thumb paint), a checkbox or radio row (the
   * owner's layer over the indicator paints), a tab (its hover layer paints),
   * a card (its `::after` paints). Those paint `var(--_press-paint)` (or
   * `var(--_press-paint-image)`), which this element declares at its
   * strength, so the owner and the paint fade as one.
   */
  pressedAlpha: {
    [PRESS_ALPHA]: pressStrength,
    ...pressReleaseAnimation,
    ...pressPaint,
  },
});
