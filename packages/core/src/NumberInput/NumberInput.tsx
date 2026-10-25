// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file NumberInput.tsx
 * @input Uses React, useId, useState, useMemo, useCallback, Field, Icon, InputGroupContext
 * @output Exports NumberInput component, NumberInputProps
 * @position Core implementation; consumed by index.ts, tested by NumberInput.test.tsx
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/NumberInput/numberParser.ts (locale-aware parsing)
 * - /packages/core/src/NumberInput/numberInputCommit.ts (draft commit policy)
 * - /packages/core/src/NumberInput/NumberInput.doc.mjs (props table, features, implementation notes)
 * - /packages/core/src/NumberInput/NumberInput.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/NumberInput/index.ts (exports if types change)
 * - /apps/storybook/stories/NumberInput.stories.tsx (storybook stories)
 * - /packages/cli/assets/templates/blocks/components/NumberInput/ (showcase blocks)
 */

import {
  useId,
  useState,
  useMemo,
  useCallback,
  useRef,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  sizeVars,
  spacingVars,
  typographyVars,
  typeScaleVars,
  borderVars,
} from '../theme/tokens.stylex';
import {
  Field,
  InputClearButton,
  type InputStatus,
  inputWrapperStyles,
  inputStatusBorderStyles,
  inputStatusHoverShadowStyles,
  inputStatusFocusWithinStyles,
  type FieldStatusVariant,
} from '../Field';
import {Icon, renderIconSlot, type IconType} from '../Icon';
import {VisuallyHidden} from '../VisuallyHidden';
import {useTooltip} from '../Tooltip';
import {getInputARIA} from '../utils';
import {interactionOverlayStyles} from '../utils/interactionOverlay.stylex';
import {usePressFeedback} from '../hooks/usePressFeedback';
import {inputDisabledFocusStyles} from '../Field/inputDisabledFocus';
import {useSize} from '../SizeContext/SizeContext';
import {useInputContainer} from '../hooks/useInputContainer';
import {useInputStatusIcon} from '../hooks/useInputStatusIcon';
import {useResolvedRequired} from '../hooks/useResolvedRequired';
import {useInputGroup} from '../InputGroup/InputGroupContext';

// Public padding tokens for the `number-input` theme target. A theme writes an
// ordinary `padding` (in ANY spelling — the shorthand, `paddingBlock`, or a
// single `paddingBlockStart`) and the pipeline's `container` expansion parses
// it and emits these normalized per-side tokens; the wrapper and the stepper
// column both read them, so the column tracks whatever the theme sets instead
// of assuming the default. Routing through the shared expansion rather than a
// hand-rolled property→var mapping is what makes every spelling work: a
// mapping only fires for the exact property name it names.
//
// Read order per level: `var(--astryx-…, <next level>)`, terminating at the
// shared field defaults (NOT the container default --spacing-4, which is a
// layout metric and would resize every themed field). Built as chained const
// strings — no function calls — so StyleX can statically analyze them; same
// shape as the card/section/dialog chains in Layout/container.stylex.ts.
const FIELD_PAD_BLOCK = spacingVars['--spacing-1'];
const FIELD_PAD_INLINE = spacingVars['--spacing-2'];
const padBlockAll = `var(--astryx-number-input-padding, ${FIELD_PAD_BLOCK})`;
const padInlineAll = `var(--astryx-number-input-padding, ${FIELD_PAD_INLINE})`;
const padInline = `var(--astryx-number-input-padding-inline, ${padInlineAll})`;
const padInlineStart = `var(--astryx-number-input-padding-inline-start, ${padInline})`;
const padInlineEnd = `var(--astryx-number-input-padding-inline-end, ${padInline})`;
const padBlockStart = `var(--astryx-number-input-padding-block-start, ${padBlockAll})`;
const padBlockEnd = `var(--astryx-number-input-padding-block-end, ${padBlockAll})`;

const styles = stylex.create({
  wrapper: {
    zIndex: 1,
    // Applied per side rather than through the shared field base's
    // `paddingBlock`/`paddingInline` shorthands, because the stepper column
    // has to cancel the block padding edge by edge — an asymmetric
    // `paddingBlock: 4px 12px` needs two different negative margins.
    paddingBlockStart: padBlockStart,
    paddingBlockEnd: padBlockEnd,
    paddingInlineStart: padInlineStart,
    paddingInlineEnd: padInlineEnd,
  },
  wrapperWithNumberSteppers: {
    paddingInlineEnd: 0,
  },
  input: {
    display: 'block',
    flex: 1,
    minWidth: 0,
    borderWidth: 0,
    borderStyle: 'none',
    padding: 0,
    fontFamily: typographyVars['--font-family-body'],
    // The 16px floor is iOS-only: iOS Safari zooms the page when a focused
    // control sits under 16px, and only iOS WebKit implements
    // -webkit-touch-callout to key the coarse-pointer floor to it.
    fontSize: {
      default: typeScaleVars['--text-body-size'],
      '@media (pointer: coarse)': {
        '@supports (-webkit-touch-callout: none)': `max(1rem, ${typeScaleVars['--text-body-size']})`,
      },
    },
    lineHeight: typeScaleVars['--text-body-leading'],
    color: colorVars['--color-text-primary'],
    backgroundColor: 'transparent',
    outline: 'none',
    '::placeholder': {
      color: colorVars['--color-text-secondary'],
    },
  },
  inputDisabled: {
    cursor: 'default',
  },
  inputInvalid: {
    color: colorVars['--color-text-secondary'],
  },
  units: {
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-body-size'],
    lineHeight: typeScaleVars['--text-body-leading'],
    color: colorVars['--color-text-secondary'],
    flexShrink: 0,
  },
  numberSteppers: {
    alignSelf: 'stretch',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    width: spacingVars['--spacing-4'],
    // Cancel the wrapper's block padding edge by edge so the column spans the
    // field's full height. Reading the same tokens the wrapper applies is what
    // keeps it flush under a themed padding — including an asymmetric one,
    // where a single `marginBlock` would be wrong at one end.
    marginBlockStart: `calc(-1 * ${padBlockStart})`,
    marginBlockEnd: `calc(-1 * ${padBlockEnd})`,
    borderInlineStartWidth: borderVars['--border-width'],
    borderInlineStartStyle: 'solid',
    borderInlineStartColor: colorVars['--color-border-emphasized'],
    overflow: 'hidden',
    borderStartEndRadius: 'var(--_field-radius)',
    borderEndEndRadius: 'var(--_field-radius)',
  },
  numberStepperButton: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    minHeight: 0,
    padding: 0,
    margin: 0,
    borderWidth: 0,
    borderStyle: 'none',
    color: colorVars['--color-icon-secondary'],
    backgroundColor: colorVars['--color-background-surface'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    outline: 'none',
  },
  numberStepperButtonDisabled: {
    color: colorVars['--color-icon-disabled'],
    cursor: 'default',
    backgroundImage: 'none',
  },
  decrementButton: {
    borderBlockStartWidth: borderVars['--border-width'],
    borderBlockStartStyle: 'solid',
    borderBlockStartColor: colorVars['--color-border-emphasized'],
  },
  incrementIcon: {
    transform: 'rotate(180deg)',
  },
});

const sizeStyles = stylex.create({
  sm: {
    height: sizeVars['--size-element-sm'],
  },
  md: {
    height: sizeVars['--size-element-md'],
  },
  lg: {
    height: sizeVars['--size-element-lg'],
  },
});

export type NumberInputSize = keyof typeof sizeStyles;

import {groupStyles} from '../InputGroup/groupStyles';

// Re-export shared types for convenience

export type {
  InputStatus as NumberInputStatus,
  InputStatusType as NumberInputStatusType,
} from '../Field';
import {isImeKeyEvent, mergeProps, mergeRefs} from '../utils';
import type {BaseProps} from '../BaseProps';
import {
  type FieldInputBaseProps,
  useFieldInputStyling,
} from '../Field/fieldParts';
import type {SizeValue} from '../utils/types';
import {themeProps} from '../utils/themeProps';
import {useTranslator, useLocale} from '../i18n';
import {formatEditableNumber} from './numberParser';
import {parseNumberInput, resolveNumberInputCommit} from './numberInputCommit';

interface NumberInputPropsBase extends Omit<
  FieldInputBaseProps,
  'onChange' | 'defaultValue'
> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLInputElement>;
  /**
   * Label text for the input (always rendered for accessibility).
   */
  label: string;
  /**
   * Whether to visually hide the label (still accessible to screen readers).
   * @default false
   */
  isLabelHidden?: boolean;
  /**
   * Description text displayed between the label and input.
   */
  description?: string;
  /**
   * Whether the field is optional. Mutually exclusive with isRequired.
   * @default false
   */
  isOptional?: boolean;
  /**
   * Whether the field is required. Mutually exclusive with isOptional.
   * @default false
   */
  isRequired?: boolean;
  /**
   * Whether the input is disabled.
   * @default false
   */
  isDisabled?: boolean;
  /**
   * Whether the input is read-only.
   * The value is shown at full opacity and still submits with the form, but
   * cannot be edited. Unlike `isDisabled`, a read-only input is not dimmed and
   * keeps its form value — use it for a value the user should see and send
   * but not change. Stepping is off in every form while read-only: arrow keys,
   * the wheel, and the number steppers. `isDisabled` takes precedence when both
   * are set.
   * @default false
   */
  isReadOnly?: boolean;
  /**
   * Explains why the input is disabled. When set together with `isDisabled`,
   * the input shows a tooltip with this text on hover and keyboard focus, and
   * stays focusable (via `aria-disabled`) so the reason is discoverable by
   * keyboard and assistive technology. The field cannot be edited (it becomes
   * read-only) while disabled.
   *
   * Use this instead of wrapping a disabled input in `Tooltip`, so the reason
   * is attached to the field itself.
   *
   * @example
   * ```
   * <NumberInput
   *   label="Quantity"
   *   value={quantity}
   *   isDisabled
   *   disabledMessage="Editing is locked while the order is processing"
   * />
   * ```
   */
  disabledMessage?: string;
  /**
   * Icon to display at the start of the input.
   * Accepts a ReactNode (e.g. `<Icon icon={SearchIcon} />`) or an SVG icon component directly.
   */
  startIcon?: ReactNode | IconType;
  /**
   * Icon to display before the label text.
   */
  labelIcon?: ReactNode | IconType;
  /**
   * Status indicator for the input.
   * When set, displays a colored border and status icon.
   * If message is provided, displays a floating message box below the input.
   */
  status?: InputStatus;
  /**
   * How the status message is placed relative to the input.
   * - 'attached': message overlaps directly below the input (bordered treatment)
   * - 'detached': message floats below as a separate element with spacing
   * - 'tooltip': no message box; the status icon becomes a focusable info-tip button that reveals the message on hover, keyboard focus, or tap
   * @default 'attached'
   */
  statusVariant?: FieldStatusVariant;
  /**
   * The size of the input.
   * - 'sm': Compact size (28px height)
   * - 'md': Default size (32px height)
   * - 'lg': Large size (36px height)
   * @default 'md'
   */
  size?: NumberInputSize;
  // onChange and hasClear defined in discriminated union below
  /**
   * The current value of the input.
   * Use null or undefined to represent an empty/unset value.
   */
  value: number | null | undefined;
  /**
   * Placeholder text shown when the input is empty.
   */
  placeholder?: string;
  /**
   * Width of the field. Numbers are treated as pixels, strings are used as-is
   * (e.g. `'100%'`). Sizes the whole field (label, control, and status) so they
   * stay aligned, unlike setting width via `controlXstyle`/`controlClassName`/`controlStyle`.
   */
  width?: SizeValue;
  /**
   * Tooltip text to display in an info icon at the end of the label.
   */
  labelTooltip?: string;
  /**
   * Whether to automatically focus the input on mount.
   * @default false
   */
  hasAutoFocus?: boolean;
  /**
   * The HTML name attribute for the input.
   * Useful for form submissions.
   */
  htmlName?: string;
  /**
   * The HTML autocomplete attribute for the input.
   */
  autoComplete?: string;
  /**
   * The minimum value allowed.
   * A smaller entry commits at this value on blur or Enter.
   */
  min?: number | null;
  /**
   * The maximum value allowed.
   * A larger entry commits at this value on blur or Enter.
   */
  max?: number | null;
  /**
   * The step increment for the input.
   * @default 1
   */
  step?: number | null;
  /**
   * Formats the committed value while the input is not being edited.
   * The raw numeric value is shown on focus so it remains editable.
   */
  formatValue?: (value: number) => string;
  /**
   * Whether scrolling the wheel over a focused input steps the value.
   * @default true
   */
  isWheelEnabled?: boolean;
  /**
   * Whether to show increment and decrement buttons at the end of the input.
   * @default false
   */
  hasNumberSteppers?: boolean;
  /**
   * Units text to display at the end of the input (e.g., "%" or "GB").
   */
  units?: string | null;
  /**
   * Whether to only allow integer values (no floating point).
   * @default false
   */
  isIntegerOnly?: boolean;
  /**
   * Callback fired when the input receives focus.
   */
  onFocus?: (e: FocusEvent<HTMLInputElement>) => void;
  /**
   * Callback fired when the input loses focus.
   */
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
  /**
   * Callback fired when the user presses the Enter key.
   */
  onEnter?: () => void;
  /**
   * Callback fired on keydown events on the input.
   */
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * Without `hasClear`, onChange only receives valid numbers.
 * With `hasClear`, onChange also receives `null` when the user clears the input.
 */
type NumberInputPropsNonClearable = NumberInputPropsBase & {
  hasClear?: false;
  onChange: (value: number) => void;
};

type NumberInputPropsClearable = NumberInputPropsBase & {
  /**
   * Whether to show a clear button when a value is set.
   * When clicked, resets the value to null and returns focus to the input.
   *
   * When enabled, the `onChange` callback type widens to also accept `null`,
   * signaling that the user cleared the input.
   */
  hasClear: true;
  onChange: (value: number | null) => void;
};

export type NumberInputProps =
  NumberInputPropsNonClearable | NumberInputPropsClearable;

type StepDirection = -1 | 1;

function getDecimalPlaces(value: number): number {
  const [coefficient, exponentText] = String(value).toLowerCase().split('e');
  const fractionLength = coefficient.split('.')[1]?.length ?? 0;
  const exponent = exponentText == null ? 0 : Number(exponentText);
  return Math.max(0, fractionLength - exponent);
}

function getEffectiveStep(
  step: number | null | undefined,
  isIntegerOnly: boolean,
): number {
  if (
    step == null ||
    !Number.isFinite(step) ||
    step <= 0 ||
    (isIntegerOnly && !Number.isInteger(step))
  ) {
    return 1;
  }
  return step;
}

function getSteppedValue({
  currentValue,
  direction,
  min,
  max,
  step,
  isIntegerOnly,
}: {
  currentValue: number | null;
  direction: StepDirection;
  min?: number | null;
  max?: number | null;
  step?: number | null;
  isIntegerOnly: boolean;
}): number | null {
  const effectiveStep = getEffectiveStep(step, isIntegerOnly);
  const stepBase =
    min != null && (!isIntegerOnly || Number.isInteger(min)) ? min : 0;

  let nextValue: number;
  if (currentValue == null) {
    nextValue = direction === 1 ? (min ?? 0) : (max ?? 0);
    if (isIntegerOnly) {
      nextValue =
        direction === 1 ? Math.ceil(nextValue) : Math.floor(nextValue);
    }
  } else {
    const stepPosition = (currentValue - stepBase) / effectiveStep;
    const tolerance = Number.EPSILON * Math.max(1, Math.abs(stepPosition)) * 4;
    const nextStepPosition =
      direction === 1
        ? Math.floor(stepPosition + tolerance) + 1
        : Math.ceil(stepPosition - tolerance) - 1;
    nextValue = stepBase + nextStepPosition * effectiveStep;
  }

  const precision = Math.min(
    12,
    Math.max(getDecimalPlaces(effectiveStep), getDecimalPlaces(stepBase)),
  );
  nextValue = Number(nextValue.toFixed(precision));

  // Clamp after rounding so a bound with finer precision than the step cannot
  // be rounded back out of its own range.
  if (min != null) {
    nextValue = Math.max(min, nextValue);
  }
  if (max != null) {
    nextValue = Math.min(max, nextValue);
  }

  if (!Number.isFinite(nextValue)) {
    return currentValue;
  }
  if (isIntegerOnly && !Number.isInteger(nextValue)) {
    return currentValue;
  }
  return Object.is(nextValue, -0) ? 0 : nextValue;
}

/**
 * A number input component for collecting numeric user input.
 * Commits text edits on blur or Enter and only calls onChange when the whole
 * draft passes validation.
 *
 * @example
 * ```
 * <NumberInput label="Quantity" value={quantity} onChange={setQuantity} />
 * <NumberInput label="Price" value={price} onChange={setPrice} min={0} step={0.01} />
 * ```
 */
export function NumberInput({
  label,
  isLabelHidden = false,
  description,
  isOptional = false,
  isRequired = false,
  isDisabled = false,
  isReadOnly = false,
  disabledMessage,
  startIcon,
  labelIcon,
  status,
  statusVariant = 'attached',
  size: sizeProp,
  onChange,
  value,
  placeholder,
  labelTooltip,
  hasAutoFocus = false,
  htmlName,
  autoComplete,
  min,
  max,
  step,
  formatValue,
  isWheelEnabled = true,
  hasNumberSteppers = false,
  units,
  isIntegerOnly = false,
  onFocus,
  onBlur,
  hasClear,
  onEnter,
  onKeyDown,
  width,
  containerXstyle,
  containerClassName,
  containerStyle,
  controlXstyle,
  controlClassName,
  controlStyle,
  ref,
  id: idProp,
  'aria-describedby': ariaDescribedByProp,
  ...restProps
}: NumberInputProps) {
  const {rest, container} = useFieldInputStyling('NumberInput', restProps, {
    containerXstyle,
    containerClassName,
    containerStyle,
  });
  const pressable = usePressFeedback();
  const t = useTranslator();
  const locale = useLocale();
  const isEffectivelyRequired = useResolvedRequired({isRequired, isOptional});
  const size = useSize(sizeProp, 'md');
  const generatedID = useId();
  const id = idProp ?? generatedID;
  const inputLabelID = useId();
  const descriptionID = useId();
  const statusMessageID = useId();
  const unitsID = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputGroup = useInputGroup();

  // Pending input while user is typing (null = show formatted value)
  const [pendingInput, setPendingInput] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Disabled-reason tooltip. The tooltip listeners attach to the input container (which already exists) and
  // the input stays perceivable via aria-disabled instead of the native
  // disabled attribute. The field is made read-only so it can't be typed into,
  // and value mutation is blocked by the isDisabled guard in the handlers.
  const showsDisabledMessage = isDisabled && !!disabledMessage;
  // A disabled field keeps its tab stop but, like a natively disabled one,
  // runs no caller event handler other than focus and blur (`spec:AST-085` FR2).
  const fieldProps = isDisabled
    ? Object.fromEntries(
        Object.entries(rest).filter(
          ([key]) => !/^on[A-Z]/.test(key) || /^on(Focus|Blur)/.test(key),
        ),
      )
    : rest;
  const disabledMessageTooltip = useTooltip({
    placement: 'above',
    // The container div is not naturally focusable; focusin bubbles up from
    // the input, so always attach focus listeners.
    focusTrigger: 'always',
    isEnabled: showsDisabledMessage,
  });

  const {statusIcon, describedBy: statusTooltipDescribedBy} =
    useInputStatusIcon({
      status,
      statusVariant,
      isInGroup: !!inputGroup,
    });

  const {ariaLabelledBy, ariaDescribedBy} = getInputARIA(
    inputLabelID,
    [
      description ? descriptionID : null,
      // The status message element is rendered by Field, which is skipped
      // inside an InputGroup — only reference it when it actually exists.
      !inputGroup && statusVariant !== 'tooltip' && status?.message
        ? statusMessageID
        : null,
      // The tooltip variant renders no message box; describe the input by the
      // tooltip's content instead so the status is still announced.
      statusTooltipDescribedBy,
      units ? unitsID : null,
      showsDisabledMessage ? disabledMessageTooltip.describedBy : null,
    ],
    inputGroup,
  );

  const parseInput = useCallback(
    (text: string) => parseNumberInput(text, {min, max, isIntegerOnly, locale}),
    [isIntegerOnly, locale, max, min],
  );

  const formattedValue = useMemo(() => {
    if (value == null) {
      return '';
    }
    return formatValue?.(value) ?? String(value);
  }, [formatValue, value]);

  // Preserve pending text while editing. Otherwise show the formatted value
  // at rest and the raw numeric value while focused so it remains editable.
  const displayValue = useMemo(() => {
    if (pendingInput !== null) {
      return pendingInput;
    }
    if (value == null) {
      return '';
    }
    return isFocused ? formatEditableNumber(value, locale) : formattedValue;
  }, [formattedValue, isFocused, locale, pendingInput, value]);

  // Check if current pending input is valid (for styling purposes)
  const isInputValid = useMemo(() => {
    if (pendingInput === null || !pendingInput.trim()) {
      return true;
    }
    return parseInput(pendingInput) !== null;
  }, [pendingInput, parseInput]);

  // Keep the whole text edit as a draft until an explicit commit boundary.
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // Value can't change while showing a disabled message (the field is
      // read-only and non-native-disabled), but guard the handler too so the
      // pending value never changes.
      if (isDisabled || isReadOnly) {
        return;
      }
      setPendingInput(e.target.value);
    },
    [isDisabled, isReadOnly],
  );

  // Handle focus
  const handleFocus = useCallback(
    (e: FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      onFocus?.(e);
    },
    [onFocus],
  );

  const commitPendingInput = useCallback(
    (trigger: 'blur' | 'Enter') => {
      if (pendingInput === null) {
        return;
      }
      if (isDisabled) {
        // A field disabled mid-entry commits nothing; its draft is dropped, as
        // a natively disabled field's was (spec:AST-085 FR2).
        setPendingInput(null);
        return;
      }

      const decision = resolveNumberInputCommit(pendingInput, {
        min,
        max,
        isIntegerOnly,
        locale,
        hasClear: !!hasClear,
      });
      if (
        trigger === 'blur' ||
        (decision.type === 'commit' && decision.didClamp)
      ) {
        setPendingInput(null);
      }

      if (decision.type === 'clear') {
        if (hasClear && value != null) {
          onChange(null);
        }
      } else if (decision.type === 'commit' && decision.value !== value) {
        onChange(decision.value);
      }
    },
    [
      hasClear,
      isDisabled,
      isIntegerOnly,
      locale,
      max,
      min,
      onChange,
      pendingInput,
      value,
    ],
  );

  // Blur ends the edit and displays the resulting committed value.
  const handleBlur = useCallback(
    (e: FocusEvent<HTMLInputElement>) => {
      commitPendingInput('blur');
      setIsFocused(false);
      onBlur?.(e);
    },
    [commitPendingInput, onBlur],
  );

  const valueForStepping = useMemo(() => {
    if (pendingInput === null) {
      return value ?? null;
    }
    if (pendingInput.trim() === '') {
      return null;
    }
    return parseInput(pendingInput) ?? value ?? null;
  }, [parseInput, pendingInput, value]);

  const getNextValue = useCallback(
    (direction: StepDirection) =>
      getSteppedValue({
        currentValue: valueForStepping,
        direction,
        min,
        max,
        step,
        isIntegerOnly,
      }),
    [isIntegerOnly, max, min, step, valueForStepping],
  );

  const stepValue = useCallback(
    (direction: StepDirection) => {
      // A read-only field is not steppable by any route: keyboard, wheel, or
      // the stepper buttons all land here.
      if (isDisabled || isReadOnly) {
        return;
      }
      const nextValue = getNextValue(direction);
      if (nextValue == null) {
        return;
      }
      setPendingInput(null);
      if (nextValue !== value) {
        onChange(nextValue);
      }
    },
    [getNextValue, isDisabled, isReadOnly, onChange, value],
  );

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (isDisabled) {
        // A read-only field still submits its form on Enter.
        if (e.key === 'Enter') {
          e.preventDefault();
        }
        return;
      }
      // The field is type="text" for formatted display, so an IME can compose
      // into it: Enter commits the candidate and the arrows walk the candidate
      // window. The composing keydown fires before compositionend, so without
      // this guard those keystrokes would commit or step the value instead.
      // See utils/ime.ts.
      if (isImeKeyEvent(e.nativeEvent)) {
        return;
      }
      const hasModifier = e.altKey || e.ctrlKey || e.metaKey || e.shiftKey;
      if (!hasModifier && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        onKeyDown?.(e);
        if (e.defaultPrevented) {
          return;
        }
        e.preventDefault();
        stepValue(e.key === 'ArrowUp' ? 1 : -1);
        return;
      }
      if (e.key === 'Enter') {
        commitPendingInput('Enter');
        onEnter?.();
      }
      onKeyDown?.(e);
    },
    [commitPendingInput, isDisabled, onEnter, onKeyDown, stepValue],
  );

  // React's delegated wheel listener can be passive, so use a native,
  // explicitly non-passive listener to prevent page scrolling only when this
  // focused input is intentionally consuming the gesture to step its value.
  const wheelListenerRef = useCallback(
    (input: HTMLInputElement | null) => {
      if (input == null || !isWheelEnabled) {
        return;
      }

      const handleWheel = (event: WheelEvent) => {
        // Bail before preventDefault so a read-only input never swallows the
        // page scroll it cannot act on.
        if (
          document.activeElement !== input ||
          isDisabled ||
          isReadOnly ||
          event.deltaY === 0 ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey
        ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        stepValue(event.deltaY < 0 ? 1 : -1);
      };

      input.addEventListener('wheel', handleWheel, {passive: false});
      return () => input.removeEventListener('wheel', handleWheel);
    },
    [isDisabled, isReadOnly, isWheelEnabled, stepValue],
  );

  const mergedInputRef = useMemo(
    () => mergeRefs(ref, inputRef, wheelListenerRef),
    [ref, wheelListenerRef],
  );

  const canIncrement = getNextValue(1) !== valueForStepping;
  const canDecrement = getNextValue(-1) !== valueForStepping;

  // Handle clear button click
  const handleClear = useCallback(
    (e?: React.MouseEvent<HTMLButtonElement>) => {
      if (hasClear) {
        onChange(null);
      }
      setPendingInput(null);
      if (!e || e.detail === 0) {
        inputRef.current?.focus();
      } else {
        // Focus inside the tap: iOS Safari brings up its keyboard only for a
        // focus made while handling the touch, so a field the tap reaches
        // unfocused gets its keyboard, as UIKit's clear button makes the
        // field first responder. `preventScroll` keeps a scrolled page where
        // it is.
        inputRef.current?.focus({preventScroll: true});
      }
    },
    [hasClear, onChange],
  );

  // Focus input when clicking anywhere on the wrapper (icons, padding, etc.)
  const {onClick: handleWrapperClick, onMouseUp: handleWrapperMouseUp} =
    useInputContainer({
      containerRef,
      inputRef,
      disabled: isDisabled,
    });

  const inputWrapper = (
    <div
      ref={el => {
        containerRef.current = el;
        // Anchor + hover/focus listeners for the disabled-message tooltip.
        // Handlers are gated internally by isEnabled, and anchor names
        // compose, so attaching unconditionally is safe.
        disabledMessageTooltip.ref(el);
      }}
      onClick={handleWrapperClick}
      onMouseUp={handleWrapperMouseUp}
      {...mergeProps(
        themeProps('number-input', {
          size,
          status: status?.type ?? null,
          disabled: isDisabled ? 'disabled' : null,
          readonly: isReadOnly ? 'readonly' : null,
        }),
        stylex.props(
          inputWrapperStyles.base,
          styles.wrapper,
          hasNumberSteppers && styles.wrapperWithNumberSteppers,
          sizeStyles[size],
          isDisabled && inputWrapperStyles.disabled,
          isDisabled && inputDisabledFocusStyles.ring,
          status && inputStatusBorderStyles[status.type],
          status && !isDisabled && inputStatusHoverShadowStyles[status.type],
          status && inputStatusFocusWithinStyles[status.type],
          inputGroup && groupStyles.inGroup,
          controlXstyle,
        ),
        controlClassName,
        controlStyle,
      )}>
      {startIcon && renderIconSlot(startIcon, {size: 'sm', color: 'secondary'})}
      {inputGroup && <VisuallyHidden id={inputLabelID}>{label}</VisuallyHidden>}
      <input
        {...fieldProps}
        ref={mergedInputRef}
        id={id}
        name={isDisabled || formatValue ? undefined : htmlName}
        type="text"
        inputMode={isIntegerOnly ? 'numeric' : 'decimal'}
        role="spinbutton"
        autoComplete={autoComplete}
        value={displayValue}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        // A disabled input keeps its place in the tab order (spec:AST-085):
        // aria-disabled instead of the native attribute, with readOnly + the
        // handler guards keeping the value from changing.
        aria-disabled={isDisabled ? 'true' : undefined}
        readOnly={isReadOnly || isDisabled || undefined}
        autoFocus={hasAutoFocus}
        data-autofocus={hasAutoFocus || undefined}
        aria-valuemin={min ?? undefined}
        aria-valuemax={max ?? undefined}
        // The ARIA value and hidden form input expose the committed value;
        // pendingInput is still an uncommitted edit and may be invalid.
        aria-valuenow={value ?? undefined}
        aria-valuetext={
          value == null || !formatValue ? undefined : formattedValue
        }
        aria-describedby={
          [ariaDescribedByProp, ariaDescribedBy].filter(Boolean).join(' ') ||
          undefined
        }
        aria-required={isEffectivelyRequired ? 'true' : undefined}
        aria-invalid={
          status?.type === 'error' || !isInputValid ? 'true' : undefined
        }
        aria-labelledby={ariaLabelledBy}
        {...stylex.props(
          styles.input,
          isDisabled && styles.inputDisabled,
          !isInputValid && styles.inputInvalid,
        )}
      />
      {formatValue && htmlName && !isDisabled && (
        <input
          type="hidden"
          name={htmlName}
          value={value == null ? '' : String(value)}
        />
      )}
      {units && (
        <span id={unitsID} {...stylex.props(styles.units)}>
          {units}
        </span>
      )}
      {/*
        Live region announcing invalid typed input to assistive technology.
        The value silently reverts on blur, so without this a screen-reader
        user would get no feedback that their entry was rejected (WCAG 3.3.1).
      */}
      <VisuallyHidden as="div" role="alert" aria-live="assertive">
        {!isInputValid ? t('@astryx.numberInput.invalidNumber') : ''}
      </VisuallyHidden>
      {hasClear && value != null && !isDisabled && !isReadOnly && (
        <InputClearButton
          label={t('@astryx.numberInput.clearLabel', {label})}
          onClick={handleClear}
        />
      )}
      {statusIcon}
      {hasNumberSteppers && (
        <div {...stylex.props(styles.numberSteppers)}>
          <button
            type="button"
            tabIndex={-1}
            {...pressable}
            aria-disabled={
              isDisabled || isReadOnly || !canIncrement || undefined
            }
            aria-label={t('@astryx.numberInput.incrementLabel', {label})}
            onPointerDown={event => event.preventDefault()}
            onClick={() => {
              // An aria-disabled stepper does nothing, as a natively disabled
              // one did (spec:AST-085 FR2).
              if (isDisabled || isReadOnly || !canIncrement) {
                return;
              }
              inputRef.current?.focus();
              stepValue(1);
            }}
            {...stylex.props(
              styles.numberStepperButton,
              interactionOverlayStyles.backgroundImage,
              (isDisabled || isReadOnly || !canIncrement) &&
                styles.numberStepperButtonDisabled,
            )}>
            <Icon
              icon="numberInput:stepperDown"
              size="xsm"
              color="inherit"
              xstyle={styles.incrementIcon}
            />
          </button>
          <button
            type="button"
            tabIndex={-1}
            {...pressable}
            aria-disabled={
              isDisabled || isReadOnly || !canDecrement || undefined
            }
            aria-label={t('@astryx.numberInput.decrementLabel', {label})}
            onPointerDown={event => event.preventDefault()}
            onClick={() => {
              // An aria-disabled stepper does nothing, as a natively disabled
              // one did (spec:AST-085 FR2).
              if (isDisabled || isReadOnly || !canDecrement) {
                return;
              }
              inputRef.current?.focus();
              stepValue(-1);
            }}
            {...stylex.props(
              styles.numberStepperButton,
              interactionOverlayStyles.backgroundImage,
              styles.decrementButton,
              (isDisabled || isReadOnly || !canDecrement) &&
                styles.numberStepperButtonDisabled,
            )}>
            <Icon icon="numberInput:stepperDown" size="xsm" color="inherit" />
          </button>
        </div>
      )}
    </div>
  );

  if (inputGroup) {
    return (
      <>
        {inputWrapper}
        {showsDisabledMessage &&
          disabledMessageTooltip.renderTooltip(disabledMessage)}
      </>
    );
  }

  return (
    <Field
      {...container}
      label={label}
      isLabelHidden={isLabelHidden}
      description={description}
      inputID={id}
      descriptionID={description ? descriptionID : undefined}
      isOptional={isOptional}
      isRequired={isRequired}
      isDisabled={isDisabled}
      labelIcon={labelIcon}
      status={
        status
          ? {
              type: status.type,
              message: status.message,
              messageID: status.message ? statusMessageID : undefined,
            }
          : undefined
      }
      statusVariant={statusVariant}
      labelTooltip={labelTooltip}
      width={width}>
      {inputWrapper}
      {showsDisabledMessage &&
        disabledMessageTooltip.renderTooltip(disabledMessage)}
    </Field>
  );
}

NumberInput.displayName = 'NumberInput';
