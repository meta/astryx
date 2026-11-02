// Copyright (c) Meta Platforms, Inc. and affiliates.

/* eslint-disable @astryx/no-hover-on-disabled -- Every hover branch is
 * nested beneath ENABLED below. Keeping that shared guard outside the media
 * branch is what gives hover and active matching generated specificity. */

/**
 * @file Shared hover and pressed overlay states
 * @input Uses StyleX and the semantic interaction-overlay color tokens
 * @output Exports reusable background-color and background-image state styles,
 *   the touch press's registered strength variable (`pressVars`) and its
 *   clocks (`pressConsts`)
 * @position Internal styling utility for interactive core surfaces
 *
 * Every surface that paints a press composes one of these (or carries its own
 * `:active` rule in the same shape), so a change to how the system answers a
 * press is made here once. `pressedBackgroundColor` is the press without the
 * hover, for controls whose hover is a colour or nothing. `pressedAlpha` is the
 * touch press's strength alone, for an owner whose pressed paint lives on a
 * descendant or a pseudo-element.
 *
 * Keep the enabled guard outside the individual states. StyleX assigns an
 * extra priority bucket (and generated selector specificity) to media-nested
 * rules. Repeating `:active` inside the hover-capable branch gives hover and
 * press the same generated specificity; StyleX's native pseudo-state ordering
 * then emits `:active` last.
 *
 * TWO POINTERS, TWO PRESS MODELS. A mouse keeps `:active`. A finger does not:
 * on iOS Safari `:active` paints on the touch itself and can outlive the start
 * of a scroll, so under `@media (pointer: coarse)` the bare `:active` arm is
 * dropped and the press is written by the touch press controller
 * (`utils/pressFeedback.ts`) as `data-astryx-press="on"` once the press is
 * believed (150 ms, no travel, no scroll) and `data-astryx-press="fading"` for the
 * 200 ms release. The query reads the PRIMARY pointer, so on a phone or tablet
 * a mouse, trackpad or Space-key press loses `:active` too; the controller
 * writes the same attribute for those, at once. The two arms paint those
 * through ONE number:
 *
 *  - `--astryx-press-alpha` is the press's strength, 0 to 1. It is a
 *    registered custom property (`@property`, syntax `<number>`, declared once
 *    in the shipped stylesheet by {@link pressVars}), which is what lets it
 *    animate: the overlay itself is a gradient layer, and gradients do not
 *    interpolate, but a registered number does, and every declaration that
 *    reads it is re-resolved on each frame. The touch paint is the pressed
 *    token at that strength — `color-mix(in srgb, pressed calc(alpha * 100%),
 *    transparent)` — declared once here as `--_press-paint` and painted as a
 *    background IMAGE: an image change is discrete, so a composer's colour
 *    transition cannot fade the onset in.
 *  - `[data-astryx-press="on"]` sets the strength to 1 and paints, on the
 *    first frame. Nothing transitions a custom property a composer never named.
 *  - `[data-astryx-press="fading"]` keeps the same paint and runs the release
 *    animation, strength 1 → 0 over {@link PRESS_RELEASE_DURATION} (UIKit's
 *    deselect crossfade; the controller removes the attribute when the same
 *    clock runs out, and by then the paint is gone). It fades to nothing, not
 *    to the hover strength: under a finger there is no hover to land on.
 *
 * WHY AN ANIMATION AND NOT A TRANSITION. Two reasons, both about composers.
 * StyleX is last-wins per property, and composers own their `transition-*`
 * longhands (Button, Item, Tab, Link, ...): the utility can neither append the
 * strength to their transition list nor set one of its own without taking the
 * whole property from them. No composer sets `animation-*` on the element that
 * composes these, so those longhands are free. And a transition needs the
 * declared value to change at the style change, which would make the release
 * arm declare strength 0; every property reading the strength would then
 * change computed value at the lift, and a composer that transitions
 * `background-image` (Button, Token, TreeListItem — Chromium interpolates
 * same-shape gradients) would start its own, shorter fade over this one. With
 * keyframes owning both ends the release arm declares 1 like the on arm, so at
 * the lift nothing a composer transitions changes; only the animation moves.
 *
 * Browser support: Chromium 111+, Safari 16.4+ and Firefox 128+ register the
 * property and interpolate. An engine without `@property` ignores the rule,
 * animates the unregistered value discretely (the paint holds for half the
 * release, then goes) — a step, no worse than the arm before this one.
 *
 * Composers must not set `backgroundImage` of their own on the colour variants
 * (none do): the touch arms own it. Composers must not set `animation-*` on
 * the element that composes any of these (none do): StyleX would drop either
 * the release animation or theirs.
 *
 * SYNC: When modified, update pressFeedback.ts, pressGesture.ts (the fade
 * clock), hooks/usePressFeedback.doc.mjs, the components that paint the touch
 * press off an ancestor scope or a pseudo-element (Switch, Tab,
 * CheckboxInput, RadioListItem, ClickableCard, SelectableCard, Thumbnail)
 * and scripts/build-css.test.mjs.
 */

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
 * (`spec:AST-108` FR4, `component:Button` FR15) up to 1.5, its maximum. The
 * controller's timer reads the same property.
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
 */
const PRESSED_ON = '[data-astryx-press="on"]';
/** Written by the touch press controller for the release's exit. */
const PRESSED_FADING = '[data-astryx-press="fading"]';

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
 * writes to. Every variant below carries both, as `[PRESS_ALPHA]:
 * pressStrength` and `...pressReleaseAnimation`; `pressedAlpha` is the pair
 * alone.
 *
 * Both objects are written with literal keys, and the strength's own key is
 * spelled inside each variant rather than here, on purpose. StyleX reads a
 * `stylex.create` call from the raw AST, so a computed key written inside
 * the call is still a computed key when it evaluates it. An object hoisted
 * out of the call has been through every other Babel plugin by the time the
 * spread is resolved, and a preset that lowers ES2015 (`next/babel` under
 * the default browserslist: apps/sandbox, and a consumer's source build) has
 * rewritten its computed keys into `_defineProperty` helper calls the
 * evaluator cannot follow, failing the build with "Referenced constant is
 * not defined". Literal keys survive the lowering; `PRESS_ALPHA` cannot be
 * one, since the variable's name is generated, so it stays at each use. The
 * literal keys equal PRESSED_ON and PRESSED_FADING above.
 */
const pressStrength = {
  default: null,
  '[data-astryx-press="on"]': 1,
  '[data-astryx-press="fading"]': 1,
};
const pressReleaseAnimation = {
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
