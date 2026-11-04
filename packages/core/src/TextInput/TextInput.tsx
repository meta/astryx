// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TextInput.tsx
 * @input Uses React, useId, ChangeEvent, Field, Icon, InputGroupContext
 * @output Exports TextInput component, TextInputProps
 * @position Core implementation; consumed by index.ts, tested by TextInput.test.tsx
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/TextInput/TextInput.doc.mjs (props table, features, implementation notes)
 * - /packages/core/src/TextInput/TextInput.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/TextInput/index.ts (exports if types change)
 * - /apps/storybook/stories/TextInput.stories.tsx (storybook stories)
 * - /packages/cli/assets/templates/blocks/components/TextInput/ (showcase blocks)
 */

import {
  useId,
  useOptimistic,
  useTransition,
  useCallback,
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  sizeVars,
  typographyVars,
  typeScaleVars,
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
import {renderIconSlot, type IconType} from '../Icon';
import {Spinner} from '../Spinner';
import {useTooltip} from '../Tooltip';
import {VisuallyHidden} from '../VisuallyHidden';
import {getInputARIA, isImeKeyEvent} from '../utils';

const styles = stylex.create({
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

export type TextInputSize = keyof typeof sizeStyles;

import {groupStyles} from '../InputGroup/groupStyles';

// Re-export shared types for convenience

export type {
  InputStatus as TextInputStatus,
  InputStatusType as TextInputStatusType,
} from '../Field';
import {mergeProps} from '../utils';
import {useSize} from '../SizeContext/SizeContext';
import {useInputContainer} from '../hooks/useInputContainer';
import {useInputStatusIcon} from '../hooks/useInputStatusIcon';
import {useResolvedRequired} from '../hooks/useResolvedRequired';
import {useInputGroup} from '../InputGroup/InputGroupContext';
import type {BaseProps} from '../BaseProps';
import {
  type FieldInputBaseProps,
  useFieldInputStyling,
} from '../Field/fieldParts';
import type {SizeValue} from '../utils/types';
import {themeProps} from '../utils/themeProps';
import {useTranslator} from '../i18n';

import {useMergedRefs} from '../hooks/useMergedRefs';
export type TextInputType = 'text' | 'password' | 'email';

export interface TextInputProps extends Omit<
  FieldInputBaseProps,
  'onChange' | 'defaultValue'
> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLInputElement>;
  /**
   * Ref to the visual control box: the element that paints the field border
   * and background and holds the icons and end controls — the same element
   * `controlXstyle` targets. `ref` points at the native `<input>`, which sits
   * inside that box, inset by the border, the inline padding and any start
   * icon; anchor a popover or measure the field through this ref instead, so
   * the overlay lines up with the box a person sees.
   *
   * @example
   * ```
   * const [query, setQuery] = useState('');
   * const [isOpen, setIsOpen] = useState(false);
   *
   * <Popover
   *   isOpen={isOpen}
   *   onOpenChange={setIsOpen}
   *   role="none"
   *   hasAutoFocus={false}
   *   content={<Results />}>
   *   {({ref}) => (
   *     <TextInput
   *       label="Search"
   *       value={query}
   *       onChange={value => {
   *         setQuery(value);
   *         setIsOpen(value !== '');
   *       }}
   *       controlRef={ref}
   *     />
   *   )}
   * </Popover>
   * ```
   */
  controlRef?: React.Ref<HTMLDivElement>;
  /**
   * The HTML input type.
   * @default 'text'
   */
  type?: TextInputType;
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
   * stays in the tab order — use it for a value the user should see and send
   * but not change. `isDisabled` takes precedence when both are set.
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
   * Use this instead of wrapping a disabled input in `Tooltip` — disabled
   * controls don't emit the pointer events an external tooltip needs.
   *
   * @example
   * ```
   * <TextInput
   *   label="Owner"
   *   value={owner}
   *   isDisabled
   *   disabledMessage="You need the Editor role to change this"
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
   * - 'sm': Compact size (18px height)
   * - 'md': Default size (26px height)
   * @default 'md'
   */
  size?: TextInputSize;
  /**
   * Callback fired when the input value changes.
   */
  onChange?: (value: string, e: ChangeEvent<HTMLInputElement>) => void;
  /** Async action on change. Fires after onChange if not prevented. */
  changeAction?: (
    value: string,
    e: ChangeEvent<HTMLInputElement>,
  ) => void | Promise<void>;
  /** Whether the input is in a loading state. @default false */
  isLoading?: boolean;
  /**
   * The current value of the input.
   */
  value: string;
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
   * Whether to show a clear button when a value is set.
   * When clicked, resets the value to an empty string and returns focus to the input.
   * @default false
   */
  hasClear?: boolean;
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
   * Callback fired when the user presses the Enter key.
   */
  onEnter?: () => void;
  /**
   * Callback fired on keydown events on the input.
   */
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  /**
   * The native `autocomplete` attribute, forwarded to the input unchanged.
   * The value stays React-controlled regardless — this only hints the
   * browser/password manager's suggestion behavior (e.g. `'off'` for a
   * session-scoped field that must not reuse a prior value).
   */
  autoComplete?: React.InputHTMLAttributes<HTMLInputElement>['autoComplete'];
}

/**
 * A text input component for collecting user input.
 *
 * @example
 * ```
 * <TextInput label="Name" value={name} onChange={setName} />
 * <TextInput label="Search" isLabelHidden value={query} onChange={setQuery} />
 * ```
 */
export function TextInput({
  type = 'text',
  label,
  isLabelHidden = false,
  description,
  isOptional = false,
  isRequired = false,
  isDisabled = false,
  isReadOnly = false,
  disabledMessage,
  startIcon,
  status,
  statusVariant = 'attached',
  size: sizeProp,
  onChange,
  changeAction,
  isLoading = false,
  value,
  placeholder,
  labelTooltip,
  hasClear = false,
  hasAutoFocus = false,
  htmlName,
  onEnter,
  onKeyDown,
  width,
  containerXstyle,
  containerClassName,
  containerStyle,
  controlXstyle,
  controlClassName,
  controlStyle,
  controlRef,
  ref,
  id: idProp,
  'aria-describedby': ariaDescribedByProp,
  ...restProps
}: TextInputProps) {
  const {rest, container} = useFieldInputStyling('TextInput', restProps, {
    containerXstyle,
    containerClassName,
    containerStyle,
  });
  const t = useTranslator();
  const isEffectivelyRequired = useResolvedRequired({isRequired, isOptional});
  const size = useSize(sizeProp, 'md');

  const generatedID = useId();
  const id = idProp ?? generatedID;
  const inputLabelID = useId();
  const descriptionID = useId();
  const statusMessageID = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputGroup = useInputGroup();

  const [, startTransition] = useTransition();
  const [optimisticValue, setOptimisticValue] = useOptimistic(value);
  const isBusy = isLoading || optimisticValue !== value;

  // Disabled-reason tooltip. Disabled controls swallow pointer events, so the
  // tooltip listeners attach to the input container (which already exists) and
  // the input stays perceivable via aria-disabled instead of the native
  // disabled attribute. The field is made read-only so it can't be typed into,
  // and value mutation is blocked by the isDisabled guard in handleChange.
  const showsDisabledMessage = isDisabled && !!disabledMessage;
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
      showsDisabledMessage ? disabledMessageTooltip.describedBy : null,
    ],
    inputGroup,
  );

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    // Value can't change while showing a disabled message (the field is
    // read-only and non-native-disabled), but guard the handler too so the
    // optimistic value and callbacks never fire.
    if (isDisabled || isReadOnly) {
      return;
    }
    const newValue = e.target.value;
    onChange?.(newValue, e);
    if (changeAction && !e.defaultPrevented) {
      startTransition(async () => {
        setOptimisticValue(newValue);
        await changeAction(newValue, e);
      });
    }
  };

  // Handle clear button click
  const handleClear = useCallback(
    (e?: React.MouseEvent<HTMLButtonElement>) => {
      onChange?.('', null as unknown as ChangeEvent<HTMLInputElement>);
      if (!e || e.detail === 0) {
        inputRef.current?.focus();
      } else {
        // Defer focus restoration past the button's unmount task so iOS Safari
        // and touch browsers don't jump the page scroll to 0 on tap.
        requestAnimationFrame(() => {
          inputRef.current?.focus({preventScroll: true});
        });
      }
    },
    [onChange],
  );

  // Focus input when clicking anywhere on the wrapper (icons, padding, etc.)
  const {onClick: handleWrapperClick, onMouseUp: handleWrapperMouseUp} =
    useInputContainer({
      containerRef,
      inputRef,
      disabled: isDisabled,
    });

  const setControlRef = useMergedRefs<HTMLDivElement>(
    containerRef,
    controlRef,
    // Anchor + hover/focus listeners for the disabled-message tooltip.
    // Handlers are gated internally by isEnabled, and anchor names
    // compose, so attaching unconditionally is safe.
    disabledMessageTooltip.ref,
  );

  const inputWrapper = (
    <div
      ref={setControlRef}
      onClick={handleWrapperClick}
      onMouseUp={handleWrapperMouseUp}
      {...mergeProps(
        themeProps('text-input', {
          size,
          status: status?.type ?? null,
          disabled: isDisabled ? 'disabled' : null,
          readonly: isReadOnly ? 'readonly' : null,
        }),
        stylex.props(
          inputWrapperStyles.base,
          sizeStyles[size],
          isDisabled && inputWrapperStyles.disabled,
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
        {...rest}
        ref={useMergedRefs(ref, inputRef)}
        id={id}
        name={isDisabled ? undefined : htmlName}
        type={type}
        value={optimisticValue}
        onChange={handleChange}
        onKeyDown={
          onEnter || onKeyDown
            ? e => {
                // The composing keydown fires before compositionend, so without
                // this guard pressing Enter to commit a Japanese/Chinese/Korean
                // IME conversion would trigger onEnter (submit/save actions)
                // before the user intends to submit. onKeyDown still receives
                // the raw event. See utils/ime.ts (#6082).
                if (e.key === 'Enter' && !isImeKeyEvent(e.nativeEvent)) {
                  onEnter?.();
                }
                onKeyDown?.(e);
              }
            : undefined
        }
        placeholder={placeholder}
        // With a disabledMessage the input keeps focusability via aria-disabled
        // so the reason is focus-discoverable; readOnly + the handleChange guard
        // keep the value from changing.
        disabled={isDisabled && !showsDisabledMessage}
        aria-disabled={showsDisabledMessage ? 'true' : undefined}
        readOnly={isReadOnly || showsDisabledMessage || undefined}
        autoFocus={hasAutoFocus}
        data-autofocus={hasAutoFocus || undefined}
        aria-describedby={
          [ariaDescribedByProp, ariaDescribedBy].filter(Boolean).join(' ') ||
          undefined
        }
        aria-required={isEffectivelyRequired ? 'true' : undefined}
        aria-invalid={status?.type === 'error' ? 'true' : undefined}
        aria-busy={isBusy || undefined}
        aria-labelledby={ariaLabelledBy}
        {...stylex.props(styles.input, isDisabled && styles.inputDisabled)}
      />
      {hasClear && value !== '' && !isDisabled && !isReadOnly && (
        <InputClearButton
          label={t('@astryx.textInput.clearLabel', {label})}
          onClick={handleClear}
        />
      )}
      {isBusy && <Spinner size="sm" />}
      {statusIcon}
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

TextInput.displayName = 'TextInput';
