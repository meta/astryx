// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file PanelSearchInput.tsx
 * @input Uses React, StyleX, Icon, InputClearButton, theme tokens
 * @output Exports PanelSearchInput — the search row that sits at the top of a
 *   dropdown panel
 * @position Shared internal primitive; used by Selector and MultiSelector
 *
 * A dropdown panel is already a bordered, elevated surface. Nesting a bordered
 * TextInput inside it draws a second box within that box, so the field reads as
 * a control dropped into the menu rather than part of it. This row is the
 * seamless alternative — magnifier, borderless input, clear button — separated
 * from the options by a divider the panel owns.
 *
 * The field is shaped like the option rows under it rather than like a form
 * input: same inset from the panel edge, same `--radius-element` corners, same
 * height. The focus ring is drawn on that rounded box, so focus reads as "this
 * row of the panel" — the same visual language as an item's highlight — instead
 * of ringing the whole panel header. It appears for keyboard focus only; see
 * `fieldKeyboardFocus` for why `:focus-visible` alone does not mean that.
 *
 *   ┌─ panel ──────────────────┐
 *   │ ┌──────────────────────┐ │  ← field: rounded, inset, item-sized
 *   │ │ ⌕  Search…         ✕ │ │
 *   │ └──────────────────────┘ │
 *   ├──────────────────────────┤  ← divider (full-bleed)
 *   │ ┌──────────────────────┐ │
 *   │ │ Apple                │ │  ← option row: same box
 *
 * The clear button is the shared `InputClearButton`, so the affordance and its
 * ghost-button behavior match every other input's clear. It renders AFTER the
 * input in DOM order: the selector components' Tab handling depends on that
 * order to keep the popup open while focus moves onto it.
 *
 * Not exported from the package: it is an implementation detail of the panels
 * that use it, not public API.
 */

import {useCallback, useState, type Ref} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {StyleXStyles} from '@stylexjs/stylex';
import {Icon} from '../Icon';
import {InputClearButton} from './InputClearButton';
import {mergeProps} from '../utils';
import {
  getInteractionModality,
  useInteractionModalityTracking,
} from '../utils/interactionModality';
import {
  colorVars,
  durationVars,
  easeVars,
  radiusVars,
  spacingVars,
  typeScaleVars,
  typographyVars,
} from '../theme/tokens.stylex';
import type {BaseProps} from '../BaseProps';

const styles = stylex.create({
  // Gutter only. Matches the option list's own padding so the field below
  // lines up with the option rows rather than with the panel edge.
  wrapper: {
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-1'],
  },
  // The field proper — the same box an option row draws: `--radius-element`
  // corners and, at md, a 6/8 padding pair that lands it on the option row's
  // 32px height. Focus rings THIS, not the full-width row.
  field: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    width: '100%',
    paddingBlock: spacingVars['--spacing-1-5'],
    paddingInline: spacingVars['--spacing-2'],
    borderRadius: radiusVars['--radius-element'],
    transitionProperty: 'box-shadow',
    transitionDuration: {
      default: durationVars['--duration-fast'],
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  // The focus ring, applied only while focus was taken by keyboard (see
  // `isKeyboardFocus`). `:has(input:focus-visible)` stays the CSS condition —
  // the browser's heuristic still decides, this only narrows it — and rings
  // the field rather than the bare <input> so the magnifier and the clear
  // button sit inside it, and so tabbing ONTO the clear button does not
  // re-ring the field.
  //
  // Inset, not the shared 3px-offset outline: the field is inset 4-5px from
  // the panel edge, so an outline at that offset would land on the panel's own
  // border and the divider. Measured, not guessed.
  fieldKeyboardFocus: {
    boxShadow: {
      default: 'none',
      ':has(input:focus-visible)': `inset 0 0 0 2px ${colorVars['--color-accent']}`,
    },
  },
  // The icon span needs explicit flex centering to avoid a line-height offset.
  icon: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  input: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    padding: 0,
    margin: 0,
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    color: colorVars['--color-text-primary'],
    fontFamily: typographyVars['--font-family-body'],
    // Matches the option rows below it, so the query reads as the first line of
    // the list. The floor keeps iOS from zooming on focus — keyed to iOS
    // alone, since only iOS WebKit implements -webkit-touch-callout.
    fontSize: {
      default: typeScaleVars['--text-label-size'],
      '@media (pointer: coarse)': {
        '@supports (-webkit-touch-callout: none)': `max(1rem, ${typeScaleVars['--text-label-size']})`,
      },
    },
    lineHeight: typeScaleVars['--text-label-leading'],
    // The field draws the focus ring (see `field`), so the bare input must not
    // draw a second one inside it.
    outline: 'none',
    '::placeholder': {
      color: colorVars['--color-text-secondary'],
    },
  },
});

export interface PanelSearchInputProps extends Omit<
  BaseProps<HTMLInputElement>,
  'onChange'
> {
  /** Ref forwarded to the input element (for focus management). */
  ref?: Ref<HTMLInputElement>;

  /**
   * Accessible name for the input. Rendered as `aria-label`: the panel has no
   * visible label for the field, and a placeholder is not a reliable name.
   */
  label: string;

  /** Accessible name for the clear (✕) button, e.g. `Clear Search options`. */
  clearLabel: string;

  /** Placeholder text shown while the query is empty. */
  placeholder?: string;

  /** The current query. */
  value: string;

  /** Called with the next query on every keystroke and on clear. */
  onValueChange: (value: string) => void;

  /** Key handler for the input itself. */
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;

  /** Focus handler for the input; runs after the ring's own bookkeeping. */
  onFocus?: React.FocusEventHandler<HTMLInputElement>;

  /** Blur handler for the input; runs after the ring's own bookkeeping. */
  onBlur?: React.FocusEventHandler<HTMLInputElement>;

  /**
   * Key handler for the row. Events from the input are handled by `onKeyDown`;
   * this one exists for keys pressed on the clear button, which has no other
   * handler of its own.
   */
  onContainerKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;

  /**
   * Styles for the field box itself (the rounded row that draws the focus
   * ring), as opposed to `xstyle`, which lands on the outer gutter. A panel
   * whose rows are taller than a dropdown's — a touch sheet — uses it to grow
   * the field to the same height as its rows.
   */
  fieldXstyle?: StyleXStyles;
}

/**
 * Search row for the top of a dropdown panel: magnifier, borderless input, and
 * a clear button once a query is typed, in a rounded box shaped like the
 * option rows beneath it.
 *
 * `className`/`style`/`xstyle` apply to the outer row (use them to match the
 * option list's inline padding); every other prop (`role`, `aria-*`, `id`, …)
 * passes through to the `<input>`, so the caller owns the combobox wiring.
 */
export function PanelSearchInput({
  ref,
  label,
  clearLabel,
  placeholder,
  value,
  onValueChange,
  onKeyDown,
  onFocus,
  onBlur,
  onContainerKeyDown,
  fieldXstyle,
  xstyle,
  className,
  style,
  ...props
}: PanelSearchInputProps) {
  // `:focus-visible` matches a text input focused by POINTER as well (CSS
  // Selectors 4, verified in Chromium), so it cannot express "keyboard focus"
  // by itself. Gate it on how the user last interacted; the CSS condition
  // stays `:focus-visible`, this only narrows it.
  const [isKeyboardFocus, setIsKeyboardFocus] = useState(false);

  useInteractionModalityTracking();

  const handleFocus = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      setIsKeyboardFocus(getInteractionModality() === 'keyboard');
      onFocus?.(e);
    },
    [onFocus],
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      setIsKeyboardFocus(false);
      onBlur?.(e);
    },
    [onBlur],
  );

  const handleClear = useCallback(
    (e?: React.MouseEvent<HTMLButtonElement>) => {
      onValueChange('');
      // Clearing puts the caret back where the user was typing, matching
      // TextInput's built-in clear, and it does so inside the tap: iOS raises
      // the software keyboard only for a focus made while the browser is
      // still dispatching the person's tap, and a UIKit search field's clear
      // button makes the field first responder, keyboard and all (measured on
      // iOS 26.2). A frame later the focus came with no keyboard. When the
      // input already has focus, the clear button's pressed state never takes
      // it, so this is a no-op and the keyboard stays where it is.
      // `preventScroll` keeps a pointer tap from scrolling the page.
      if (typeof ref === 'object' && ref?.current) {
        ref.current.focus(
          e == null || e.detail === 0 ? undefined : {preventScroll: true},
        );
      }
    },
    [onValueChange, ref],
  );

  return (
    <div
      onKeyDown={onContainerKeyDown}
      {...mergeProps(stylex.props(styles.wrapper, xstyle), className, style)}>
      <div
        data-keyboard-focus={isKeyboardFocus ? 'true' : undefined}
        {...stylex.props(
          styles.field,
          isKeyboardFocus && styles.fieldKeyboardFocus,
          fieldXstyle,
        )}>
        <Icon icon="search" size="sm" color="secondary" xstyle={styles.icon} />
        <input
          ref={ref}
          type="text"
          aria-label={label}
          placeholder={placeholder}
          value={value}
          onChange={e => onValueChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...stylex.props(styles.input)}
          {...props}
        />
        {value !== '' && (
          <InputClearButton label={clearLabel} onClick={handleClear} />
        )}
      </div>
    </div>
  );
}

PanelSearchInput.displayName = 'PanelSearchInput';
