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
import {Icon} from '../Icon/Icon';
import {touchHitAreaStyles} from '../internal/touchHitArea.stylex';
import {themeProps} from '../utils/themeProps';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/Field/InputClearButton.generated';

registerEnglishFallback(english);

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
      // StyleX's xstyle type has no custom properties under a condition.
      xstyle={
        [
          styles.button,
          touchHitAreaStyles.besideParts,
          xstyle,
        ] as stylex.StyleXStyles
      }
    />
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
