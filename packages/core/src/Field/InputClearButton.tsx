// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file InputClearButton.tsx
 * @input Uses React, Button, Icon, and the i18n translator
 * @output Exports the public InputClearButton and an internal popup-aware variant.
 *   Both show the localized generic "Clear" tooltip and keep the caller's
 *   contextual label as the accessible name.
 * @position Shared primitive. Every input that renders a clear affordance —
 *   TextInput, NumberInput, TimeInput, DateInput, DateTimeInput,
 *   DateRangeInput, Selector, MultiSelector, Typeahead, Tokenizer, FileInput —
 *   routes it through here, so the glyph is themed in one place via the
 *   `astryx-input-clear-icon` target and the button wrapper is themed via the
 *   `astryx-input-clear-button` target.
 */

import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Button, ButtonTooltipInNameContext} from '../Button/Button';
import {BUTTON_HIT_AREA, ButtonHitAreaContext} from '../Button/buttonHitArea';
import {clampedHitInsets, type HitInsets, type HitRect} from '../utils/hitArea';
import type {TouchHitAreaOptions} from '../utils/touchHitArea';
import {Icon} from '../Icon/Icon';
import {pickDataAttributes, themeProps} from '../utils/themeProps';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/Field/InputClearButton.generated';

registerEnglishFallback(english);

// WebKit moves a tap toward a clickable element near it. The field's other
// parts, such as the chevron, are not clickable themselves. So a band that
// comes near one takes a tap on it. Toward a part, the band reaches at most
// this far, in px.
const PART_REACH = 2;

/**
 * How far the clear button's band grows on each side. It grows toward the
 * minimum target and stops at half the gap to each of the field's other parts
 * (the chevron, the status icon, the spinner). A tap on a part is the
 * field's. No hit-area neighbour stops the band there, because the parts are
 * not interactive. Toward a part beside it, the band also stops at
 * `PART_REACH`.
 */
function clearButtonGrowth(
  target: HitRect,
  toLayout: (rect: HitRect) => HitRect,
  element: HTMLElement,
): HitInsets {
  const parts: HitRect[] = [];
  for (const part of element.parentElement?.children ?? []) {
    const box = part.getBoundingClientRect();
    if (part !== element && box.width > 0 && box.height > 0) {
      parts.push(
        toLayout({
          left: box.left,
          top: box.top,
          right: box.right,
          bottom: box.bottom,
        }),
      );
    }
  }
  const insets = {...clampedHitInsets(target, parts)};
  for (const rect of parts) {
    if (rect.top < target.bottom && target.top < rect.bottom) {
      if (rect.left >= target.right) {
        insets.right = Math.min(insets.right, PART_REACH);
      } else if (rect.right <= target.left) {
        insets.left = Math.min(insets.left, PART_REACH);
      }
    }
  }
  return insets;
}

const CLEAR_BUTTON_HIT_AREA: TouchHitAreaOptions = {
  ...BUTTON_HIT_AREA,
  growth: clearButtonGrowth,
};

// The glyph button is 20 px square. Under a coarse pointer, Button's shared
// touch band grows its target. Under a fine pointer its own `::after`, Button's
// decoration slot, grows it to the 24 px minimum (WCAG 2.2 SC 2.5.8). The
// growth goes only into space no other control takes: up and down into the
// field's padding, and toward the field's end. It never reaches toward the
// text, so a click at the end of the text still places the caret. The
// `::after` has a hole over the button's own box, so a pointer there reaches
// the glyph and the glyph's hover style applies. StyleX reads these at build
// time.
const FINE_POINTER = '@media (pointer: fine)';
const BLOCK_GROWTH = 'calc((24px - 20px) / 2)';
const END_GROWTH = 'calc(24px - 20px)';
const HOLE_LTR = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, 0 ${BLOCK_GROWTH}, calc(100% - ${END_GROWTH}) ${BLOCK_GROWTH}, calc(100% - ${END_GROWTH}) calc(100% - ${BLOCK_GROWTH}), 0 calc(100% - ${BLOCK_GROWTH}), 0 ${BLOCK_GROWTH})`;
const HOLE_RTL = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${END_GROWTH} ${BLOCK_GROWTH}, 100% ${BLOCK_GROWTH}, 100% calc(100% - ${BLOCK_GROWTH}), ${END_GROWTH} calc(100% - ${BLOCK_GROWTH}), ${END_GROWTH} ${BLOCK_GROWTH})`;

const styles = stylex.create({
  button: {
    height: '20px',
    flexShrink: 0,
    // A pseudo-element takes no media condition here, so the button holds
    // the conditions and its `::after` reads them.
    '--_input-clear-target': {default: null, [FINE_POINTER]: '""'},
    '--_input-clear-target-hole': {default: HOLE_LTR, ':dir(rtl)': HOLE_RTL},
    '::after': {
      content: 'var(--_input-clear-target)',
      position: 'absolute',
      insetBlock: `calc(${BLOCK_GROWTH} * -1)`,
      insetInlineStart: 0,
      insetInlineEnd: `calc(${END_GROWTH} * -1)`,
      clipPath: 'var(--_input-clear-target-hole)',
    },
  },
});

export interface InputClearButtonProps {
  /**
   * Contextual accessible name for the button, such as "Clear Search". The
   * visible tooltip is always the localized generic "Clear".
   */
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  xstyle?: stylex.StyleXStyles;
  /** Extra class names merged onto the clear glyph beside its canonical target. */
  iconClassName?: string;
}

interface InternalInputClearButtonProps extends InputClearButtonProps {
  onPointerDown: React.PointerEventHandler<HTMLElement>;
  onClickCapture: React.MouseEventHandler<HTMLElement>;
}

type InputClearButtonRenderProps = InputClearButtonProps &
  Partial<
    Pick<InternalInputClearButtonProps, 'onPointerDown' | 'onClickCapture'>
  > & {tooltip: string};

function renderInputClearButton({
  label,
  tooltip,
  onClick,
  onPointerDown,
  onClickCapture,
  xstyle,
  iconClassName,
  ...rest
}: InputClearButtonRenderProps): ReactNode {
  const {className: iconTargetClassName} = themeProps('input-clear-icon');
  const {className: buttonTargetClassName} = themeProps('input-clear-button');
  return (
    <ButtonHitAreaContext value={CLEAR_BUTTON_HIT_AREA}>
      <ButtonTooltipInNameContext value>
        <Button
          {...pickDataAttributes(rest)}
          variant="ghost"
          size="sm"
          label={label}
          // The field's label already sits beside the glyph, so the tooltip names
          // only the action; repeating a long label reads as awkward copy. The
          // contextual label stays the accessible name, which still contains
          // the visible word (WCAG 2.5.3, label in name), so the tooltip adds no
          // description.
          tooltip={tooltip}
          className={buttonTargetClassName}
          icon={
            <Icon
              icon="close"
              size="sm"
              color="secondary"
              className={
                iconClassName != null
                  ? `${iconTargetClassName} ${iconClassName}`
                  : iconTargetClassName
              }
            />
          }
          onPointerDown={e => {
            // WebKit drops the click of a touch whose pointerdown is cancelled.
            // For touch, the mousedown handler below keeps focus in the field.
            if (e.pointerType !== 'touch') {
              e.preventDefault();
            }
            onPointerDown?.(e);
          }}
          onMouseDown={e => e.preventDefault()}
          onClick={onClick}
          onClickCapture={onClickCapture}
          isIconOnly
          xstyle={[styles.button, xstyle]}
        />
      </ButtonTooltipInNameContext>
    </ButtonHitAreaContext>
  );
}

export function InputClearButton(props: InputClearButtonProps): ReactNode {
  const t = useComponentTranslator();
  return renderInputClearButton({
    ...props,
    tooltip: t('@astryx.inputClearButton.tooltip'),
  });
}

/**
 * Internal variant for a clear button inside a layer trigger. It takes the
 * keep-open props, so a press on it does not dismiss the open layer.
 */
export function InternalInputClearButton(
  props: InternalInputClearButtonProps,
): ReactNode {
  const t = useComponentTranslator();
  return renderInputClearButton({
    ...props,
    tooltip: t('@astryx.inputClearButton.tooltip'),
  });
}

InputClearButton.displayName = 'InputClearButton';
