// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CheckIndicator.tsx
 * @input Indicator state props
 * @output Exports CheckIndicator — the default single-selection mark
 * @position Decorative check visual used wherever "this one is chosen" is
 *           marked without a control: selector options, menu rows
 *
 * This is the indicator a product replaces to change what "chosen" looks like.
 * `defineTheme({indicators: {check: RadioIndicator}})` turns every
 * single-selection mark into a radio, in one line, without any component
 * knowing it happened.
 *
 * It draws NOTHING when unchecked, which is what makes it the default: a
 * listbox should not show an empty box beside every row. A replacement is free
 * to draw in both states — a radio does — and hosting components render the
 * indicator unconditionally so that works.
 *
 * Unlike the checkbox and radio indicators, this one renders no chrome of its
 * own: it IS the glyph. Two consequences, both deliberate:
 *
 *   - It renders `<Icon>` directly rather than wrapping one, so the class the
 *     host passes (`selector-check`, say) lands on the same element as
 *     `astryx-icon` — one element carrying the mark and its theme target, per
 *     the wrapper reduction in #4838/#4846.
 *   - It adds NO theme target of its own. `astryx-checkbox-indicator` and
 *     `astryx-radio-indicator` exist because those indicators draw chrome that
 *     needs styling; a check is an icon, and `astryx-icon` plus the host's
 *     target already reach it.
 */

import * as stylex from '@stylexjs/stylex';
import type {SVGProps} from 'react';
import {Icon} from '../Icon/Icon';
import {colorVars} from '../theme/tokens.stylex';
import {isRenderable} from '../utils/isRenderable';
import {mergeProps} from '../utils/mergeProps';
import type {IndicatorProps} from './types';

/** The check glyph matches the control sizes the indicator families share. */
const iconSizeForIndicator = {
  sm: 'sm',
  md: 'sm',
} as const;

const styles = stylex.create({
  // The children slot stands where the glyph would, so swapping a Spinner in
  // for the mark does not move the row. 1rem is Icon's `sm` box, which is what
  // `iconSizeForIndicator` resolves to at both indicator sizes.
  slot: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: '1rem',
    height: '1rem',
  },
  // Foreground for an inherit-shade Spinner, matching what the glyph would
  // have painted. The sibling indicators set `color` on their chrome for the
  // same reason.
  enabled: {color: colorVars['--color-accent']},
  // The same token Icon's `color="disabled"` resolves to, so the busy and the
  // glyph paths read identically when the owner is disabled.
  disabled: {color: colorVars['--color-icon-disabled']},
});

/**
 * The default single-selection mark: a checkmark when chosen, nothing when not.
 *
 * Decorative and non-interactive — it renders `aria-hidden` and owns no role,
 * state, or focus behavior; the option or row that hosts it keeps all of that.
 *
 * @example
 * ```
 * <CheckIndicator state={isSelected ? 'checked' : 'unchecked'} size="sm" />
 * ```
 *
 * Swap every single-selection mark for a radio:
 *
 * @example
 * ```
 * import {RadioIndicator} from '@astryxdesign/core/Indicator';
 * defineTheme({name: 'brand', indicators: {check: RadioIndicator}});
 * ```
 */
export function CheckIndicator({
  state,
  size = 'md',
  isDisabled = false,
  children,
  ref,
  className,
  style,
  xstyle,
  ...rest
}: IndicatorProps<'singleSelection'>) {
  const isChecked = state === 'checked';

  // `children` (a pending Spinner, say) replaces the mark but keeps the
  // indicator's place, matching the other indicators' contract. It is checked
  // BEFORE `state`: a host passes a busy visual through in whatever state the
  // row happens to be in, and an unchecked listbox row is the common one.
  //
  // `isRenderable`, not `children != null`: the idiom a host actually writes is
  // `children={isBusy && <Spinner/>}`, which passes `false` when it is not
  // busy. `false` is non-null, so a null check takes this branch, renders
  // nothing inside it, and DELETES the mark on a chosen row (#4893).
  //
  // There is no glyph to hang the caller's props on in this branch, so they go
  // on a span — every one of them, so a `data-testid`, an `id`, a handler or
  // an `xstyle` behaves the same whether or not children are present.
  if (isRenderable(children)) {
    return (
      <span
        // Spread first, as on the glyph path below, so the indicator's own
        // contract (aria-hidden, and the styling it composes) outranks any
        // same-named attribute a caller passed through. The type omits the
        // a11y props, but TypeScript cannot reject a hyphenated JSX attribute,
        // so order is the part that actually holds.
        {...rest}
        ref={ref}
        aria-hidden="true"
        {...mergeProps(
          stylex.props(
            styles.slot,
            isDisabled ? styles.disabled : styles.enabled,
            xstyle,
          ),
          className,
          style,
        )}>
        {children}
      </span>
    );
  }

  // Nothing to draw, and no box to reserve: an unmarked row keeps the layout
  // it would have without this indicator.
  if (!isChecked) {
    return null;
  }

  return (
    <Icon
      // Spread first so the indicator's own contract (below) wins over any
      // same-named DOM attribute a caller passed through.
      //
      // An indicator declares span props (BaseProps<HTMLSpanElement>) while
      // Icon declares SVG ones, so the handler types differ nominally. For a
      // registry icon the element that actually receives these IS a span
      // (IconFromRegistry renders one), so forwarding them is correct at
      // runtime; the cast only reconciles the two declarations.
      {...(rest as Omit<SVGProps<SVGSVGElement>, 'color' | 'ref'>)}
      // After the spread, deliberately. Icon puts its own a11y defaults BEFORE
      // `{...props}` as a documented escape hatch (Icon.tsx), which is right
      // for an icon and wrong for an indicator — this one is decorative by
      // contract, so it re-asserts it here rather than inheriting the hatch.
      aria-hidden="true"
      icon="check"
      size={iconSizeForIndicator[size]}
      color={isDisabled ? 'disabled' : 'accent'}
      // The focus ring rides in through xstyle (composed at resolution), but
      // never paints here: it only activates under an owner's indicatorScope
      // marker, and a listbox row that marks selection takes focus itself
      // rather than marking its indicator.
      xstyle={xstyle}
      // Icon merges className/style with its own rather than shadowing them,
      // so the host's theme target composes with `astryx-icon`.
      className={className}
      style={style}
    />
  );
}

CheckIndicator.displayName = 'CheckIndicator';
