// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file focusOutline.stylex.ts
 * @input Uses StyleX and theme color tokens
 * @output Exports shared focus-outline prop builders
 * @position Internal utility for consistent keyboard focus outlines across core components
 *
 * Centralizes the standard Astryx focus outline, shown only for keyboard focus.
 * Every focusable surface drew the same 2px accent ring already; writing it per
 * component meant dozens of identical definitions to keep in step, and they did
 * not stay in step — offsets drifted and one ring was a border-width thick.
 *
 * Every ring in core and lab is drawn from here, with one exception recorded in
 * Switch: its condition is a component-scoped ancestor marker, which cannot be
 * shared without leaking focus state between components. A component may still
 * override the OFFSET (a ring that must sit inset, or clear of a field border);
 * width, style and color are not restated anywhere.
 *
 * Every value comes from the `--focus-outline-*` tokens, which is how a theme
 * restyles the ring: one override reaches every component at once. The
 * `:focus-visible` condition is not themeable and stays here, so a theme can
 * change what the ring looks like but cannot show it to pointer users.
 */

import * as stylex from '@stylexjs/stylex';
import {focusVars} from '../theme/tokens.stylex';

const FOCUS_OUTLINE_WIDTH = focusVars['--focus-outline-width'];
const FOCUS_OUTLINE_STYLE = focusVars['--focus-outline-style'];
const FOCUS_OUTLINE_COLOR = focusVars['--focus-outline-color'];

const FOCUS_OUTLINE_OFFSET = focusVars['--focus-outline-offset'];

/**
 * The ring as a single `outline` value, for reading it at runtime — an
 * assertion, or an element styled imperatively.
 *
 * NOT usable inside another file's `stylex.create`: StyleX resolves imported
 * `defineVars` and nothing else, so a component whose condition
 * {@link focusOutlineStyles} cannot express (Switch, whose ring keys off a
 * component-scoped ancestor marker) has to compose the `focusVars` tokens
 * itself.
 */
export const FOCUS_OUTLINE = `${FOCUS_OUTLINE_WIDTH} ${FOCUS_OUTLINE_STYLE} ${FOCUS_OUTLINE_COLOR}`;

/**
 * Written as longhands rather than the `outline` shorthand.
 *
 * A shorthand resets every longhand it covers, so `outline: 2px solid accent`
 * would clobber a later `outlineColor` no matter the order — which is how
 * destructive buttons silently lost their red ring. With longhands, a variant
 * can re-color the ring and inherit width, style and offset.
 */
const focusOutlineLonghands = {
  outlineWidth: FOCUS_OUTLINE_WIDTH,
  outlineStyle: FOCUS_OUTLINE_STYLE,
  outlineColor: FOCUS_OUTLINE_COLOR,
} as const;

/**
 * The standard focus ring as plain CSS values, for the one case that has to
 * apply it imperatively: a control whose focusable input is visually hidden and
 * whose ring must land on a *themeable indicator* beside it (see
 * `useIndicatorFocusRing`). Everything else should use the styles above.
 *
 * Longhands, not the `outline` shorthand, for the same reason the styles are:
 * a shorthand resets every longhand it covers, so a caller could not re-color
 * the ring without restating its width and style. Split, each part is
 * independently overridable — and every part stays a var, so a theme's
 * `--focus-outline-*` overrides still flow through.
 *
 * NOT usable inside another file's `stylex.create`, for the same reason as
 * {@link FOCUS_OUTLINE}: StyleX compiles each member there to a CSS variable
 * nothing defines. Compose the `focusVars` tokens instead.
 *
 * Keys are camelCase to match `HTMLElement.style`, so this spreads straight
 * onto an element:
 *
 * ```ts
 * Object.assign(el.style, FOCUS_OUTLINE_PARTS);        // draw
 * Object.assign(el.style, FOCUS_OUTLINE_PARTS_NONE);   // clear
 * ```
 */
export const FOCUS_OUTLINE_PARTS = {
  outlineWidth: FOCUS_OUTLINE_WIDTH,
  outlineStyle: FOCUS_OUTLINE_STYLE,
  outlineColor: FOCUS_OUTLINE_COLOR,
  outlineOffset: FOCUS_OUTLINE_OFFSET,
} as const;

/** Clears {@link FOCUS_OUTLINE_PARTS}, one key per part so nothing lingers. */
export const FOCUS_OUTLINE_PARTS_NONE = {
  outlineWidth: '',
  outlineStyle: '',
  outlineColor: '',
  outlineOffset: '',
} as const;

export const focusOutlineStyles = stylex.create({
  focusVisible: {
    outlineWidth: {
      default: '0',
      ':focus-visible': focusOutlineLonghands.outlineWidth,
    },
    outlineStyle: {
      default: 'none',
      ':focus-visible': focusOutlineLonghands.outlineStyle,
    },
    outlineColor: {
      default: null,
      ':focus-visible': focusOutlineLonghands.outlineColor,
    },
    outlineOffset: {default: '0', ':focus-visible': FOCUS_OUTLINE_OFFSET},
  },
  focusWithin: {
    outlineWidth: {
      default: '0',
      ':has(:focus-visible)': focusOutlineLonghands.outlineWidth,
    },
    outlineStyle: {
      default: 'none',
      ':has(:focus-visible)': focusOutlineLonghands.outlineStyle,
    },
    outlineColor: {
      default: null,
      ':has(:focus-visible)': focusOutlineLonghands.outlineColor,
    },
    outlineOffset: {default: '0', ':has(:focus-visible)': FOCUS_OUTLINE_OFFSET},
  },
  /**
   * Like {@link focusOutlineStyles.focusWithin}, but only for the element's
   * FIRST child — for a wrapper that paints the ring on behalf of one primary
   * control while its siblings ring themselves.
   *
   * `focusWithin` matches any descendant, so a row holding more than one tab
   * stop lights the whole row *on top of* the focused control's own ring: two
   * outlines for one tab stop. Scoping to `> :first-child` keeps the ring the
   * primary's, and leaves every sibling control ringing itself.
   *
   * The wrapper owns the coupling: the primary has to be its first child, and
   * the wrapper must not be a tab stop (its own `:focus-visible` would never
   * match). Pair it with {@link focusOutlineStyles.suppressed} on the primary.
   */
  focusWithinFirstChild: {
    outlineWidth: {
      default: '0',
      ':has(> :first-child:focus-visible)': focusOutlineLonghands.outlineWidth,
    },
    outlineStyle: {
      default: 'none',
      ':has(> :first-child:focus-visible)': focusOutlineLonghands.outlineStyle,
    },
    outlineColor: {
      default: null,
      ':has(> :first-child:focus-visible)': focusOutlineLonghands.outlineColor,
    },
    outlineOffset: {
      default: '0',
      ':has(> :first-child:focus-visible)': FOCUS_OUTLINE_OFFSET,
    },
  },
  /**
   * Draws no ring, and keeps the UA's own off — for an element whose ring an
   * ancestor paints.
   *
   * The reset is not optional. Every other style here suppresses the browser
   * default through its `default` branch, so dropping the ring from a control
   * drops that suppression with it, and a bare `<a>` or `<button>` goes back
   * to the UA focus ring — painted *inside* the ancestor's.
   */
  suppressed: {
    outlineWidth: '0',
    outlineStyle: 'none',
    outlineOffset: '0',
  },
  publishFocusVisibleVars: {
    '--_focus-outline': {
      default: 'none',
      ':focus-visible': FOCUS_OUTLINE,
    },
    '--_focus-outline-offset': {
      default: '0',
      ':focus-visible': FOCUS_OUTLINE_OFFSET,
    },
  },
  focusWithinOrPublished: {
    outline: {
      default: 'var(--_focus-outline, none)',
      ':has(:focus-visible)': FOCUS_OUTLINE,
    },
    outlineOffset: {
      default: 'var(--_focus-outline-offset, 0)',
      ':has(:focus-visible)': FOCUS_OUTLINE_OFFSET,
    },
  },
});

// StyleX does not expose a stable public input type for stylex.props();
// keep this helper permissive so it mirrors stylex.props() itself.
type StyleXPropsArg = unknown;

function makeFocusOutlineProps(style: StyleXPropsArg) {
  return (...styles: StyleXPropsArg[]) =>
    // Caller styles LAST, so a component can deliberately re-color its ring —
    // destructive buttons ring in error red, not accent. StyleX is last-wins,
    // and reversing this to protect the ring silently ate that override.
    //
    // The hazard in this direction is the opposite one: a caller whose base
    // style carries `outline: 'none'` wipes the ring out entirely (TreeList
    // did, and shipped a focusable row with no visible focus). Two things
    // guard it — this file states the rule, and the ring is written as
    // LONGHANDS, so an override has to name `outlineStyle`/`outlineWidth`
    // explicitly rather than erasing them through the `outline` shorthand.
    stylex.props(style as never, ...(styles as never[]));
}

export const focusOutlineProps = {
  focusVisible: makeFocusOutlineProps(focusOutlineStyles.focusVisible),
  focusWithin: makeFocusOutlineProps(focusOutlineStyles.focusWithin),
  focusWithinFirstChild: makeFocusOutlineProps(
    focusOutlineStyles.focusWithinFirstChild,
  ),
  suppressed: makeFocusOutlineProps(focusOutlineStyles.suppressed),
  publishFocusVisibleVars: makeFocusOutlineProps(
    focusOutlineStyles.publishFocusVisibleVars,
  ),
  focusWithinOrPublished: makeFocusOutlineProps(
    focusOutlineStyles.focusWithinOrPublished,
  ),
} as const;
