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
import {Button} from '../Button/Button';
import {BUTTON_HIT_AREA, ButtonHitAreaContext} from '../Button/buttonHitArea';
import {MIN_TOUCH_TARGET, type HitInsets, type HitRect} from '../utils/hitArea';
import type {TouchHitAreaOptions} from '../utils/touchHitArea';
import {Icon} from '../Icon/Icon';
import {themeProps} from '../utils/themeProps';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/Field/InputClearButton.generated';

registerEnglishFallback(english);

/**
 * How far the clear button's band grows on each side: toward the minimum
 * target, and at most half the gap to the field's next part on that side. A
 * tap on a part, such as the chevron, the status icon or the spinner, is the
 * field's, and no hit-area neighbour stops the band there, because those
 * parts are not interactive themselves.
 */
function clearButtonGrowth(
  target: HitRect,
  toLayout: (rect: HitRect) => HitRect,
  element: HTMLElement,
): HitInsets {
  const x = Math.max(0, (MIN_TOUCH_TARGET - (target.right - target.left)) / 2);
  const y = Math.max(0, (MIN_TOUCH_TARGET - (target.bottom - target.top)) / 2);
  const insets = {top: y, right: x, bottom: y, left: x};
  for (const part of element.parentElement?.children ?? []) {
    if (part === element) {
      continue;
    }
    const box = part.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) {
      continue;
    }
    const rect = toLayout({
      left: box.left,
      top: box.top,
      right: box.right,
      bottom: box.bottom,
    });
    if (rect.top < target.bottom && target.top < rect.bottom) {
      if (rect.left >= target.right) {
        insets.right = Math.min(insets.right, (rect.left - target.right) / 2);
      } else if (rect.right <= target.left) {
        insets.left = Math.min(insets.left, (target.left - rect.right) / 2);
      }
    }
    if (rect.left < target.right && target.left < rect.right) {
      if (rect.top >= target.bottom) {
        insets.bottom = Math.min(insets.bottom, (rect.top - target.bottom) / 2);
      } else if (rect.bottom <= target.top) {
        insets.top = Math.min(insets.top, (target.top - rect.bottom) / 2);
      }
    }
  }
  return insets;
}

const CLEAR_BUTTON_HIT_AREA: TouchHitAreaOptions = {
  ...BUTTON_HIT_AREA,
  growth: clearButtonGrowth,
};

const styles = stylex.create({
  button: {
    height: '20px',
    flexShrink: 0,
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
}: InputClearButtonRenderProps): ReactNode {
  const {className: iconTargetClassName} = themeProps('input-clear-icon');
  const {className: buttonTargetClassName} = themeProps('input-clear-button');
  return (
    <ButtonHitAreaContext value={CLEAR_BUTTON_HIT_AREA}>
      <Button
        variant="ghost"
        size="sm"
        label={label}
        // The field's label already sits beside the glyph, so the tooltip names
        // only the action; repeating a long label reads as awkward copy. The
        // contextual label stays the accessible name, which still contains
        // the visible word (WCAG 2.5.3, label in name).
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

/** Internal variant used while popup-aware clear behavior is rolled out. */
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
