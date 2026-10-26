// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TimeInput.tsx
 * @input Uses React, Field, NativeTimeSegment, InputGroupContext, pointer media queries, and shared time utilities
 * @output Exports TimeInput, TimeInputProps, and TimeInputNativePicker
 * @position Core implementation; consumed by index.ts, tested by TimeInput.test.tsx
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/TimeInput/TimeInput.doc.mjs (props table, features, implementation notes)
 * - /packages/core/src/TimeInput/TimeInput.test.tsx (typed-field tests)
 * - /packages/core/src/TimeInput/NativeTimeInput.test.tsx (native-picker tests)
 * - /packages/core/src/TimeInput/index.ts (exports if types change)
 * - /apps/storybook/stories/TimeInput.stories.tsx (storybook stories)
 * - /packages/cli/assets/templates/blocks/components/TimeInput/ (showcase blocks)
 */

import {
  use,
  useId,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  useOptimistic,
  useTransition,
  type KeyboardEvent,
  type FocusEvent,
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
import {Icon} from '../Icon';
import {Spinner} from '../Spinner';
import {VisuallyHidden} from '../VisuallyHidden';
import {
  type ISOTimeString,
  parseTimeInput,
  formatDisplayTime12h,
  formatDisplayTime24h,
  formatISOTime,
  adjustTime,
  isImeKeyEvent,
  isTimeInRange,
  mergeProps,
  getInputARIA,
} from '../utils';
import {chainEventHandlers} from '../utils/chainEventHandlers';
import {joinAriaIDs} from '../utils/inputAria';
import {
  useFieldInputStyling,
  type FieldInputBaseProps,
} from '../Field/fieldParts';
import type {SizeValue} from '../utils/types';
import {useSize} from '../SizeContext/SizeContext';
import {useAnnounce} from '../hooks/useAnnounce';
import {useBusyAnnouncement} from '../hooks/useBusyAnnouncement';
import {useInputContainer} from '../hooks/useInputContainer';
import {useMediaQuery} from '../hooks/useMediaQuery';
import {useInputStatusIcon} from '../hooks/useInputStatusIcon';
import {useResolvedRequired} from '../hooks/useResolvedRequired';
import {useInputGroup} from '../InputGroup/InputGroupContext';
import {InputGroupInternalContext} from '../InputGroup/InputGroupInternalContext';
import {groupStyles, inputGroupItemProps} from '../InputGroup/groupStyles';
import {useTooltip} from '../Tooltip';
import {themeProps} from '../utils/themeProps';
import {useTranslator} from '../i18n';

import {useMergedRefs} from '../hooks/useMergedRefs';
import {NativeTimeSegment} from '../DateTimeInput/NativeTimeSegment';
import {TouchTimeField} from './TouchTimeField';
import {
  effectiveInputPresentation,
  resolveInputPresentation,
  type InputPresentation,
} from '../utils/inputPresentation';
import {useDevWarning} from '../hooks/useDevWarning';

const TOUCH_POINTER_QUERY = '(pointer: coarse)';

const styles = stylex.create({
  // The shared disabled style drops the focus ring; restore it while a
  // control inside the field holds focus (spec:AST-085 FR6). Defaults repeat it.
  disabledFocusRing: {
    borderColor: {
      default: colorVars['--color-border-emphasized'],
      ':focus-within': colorVars['--color-accent'],
    },
    boxShadow: {
      default: 'none',
      ':focus-within': `inset 0px 0px 0px 2px ${colorVars['--color-accent-muted']}`,
    },
  },
  icon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
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
});

const sizeStyles = stylex.create({
  sm: {
    height: sizeVars['--size-element-sm'],
    minWidth: 120,
  },
  md: {
    height: sizeVars['--size-element-md'],
    minWidth: 120,
  },
  lg: {
    height: sizeVars['--size-element-lg'],
    minWidth: 120,
  },
});

export type TimeInputSize = keyof typeof sizeStyles;

export type TimeInputHourFormat = '12h' | '24h';

/** @deprecated Use {@link TimeInputPresentation} via the `presentation` prop. */
export type TimeInputNativePicker = 'touch' | 'always' | 'never';

/** Which surface TimeInput uses for time selection (`spec:AST-043` FR1). */
export type TimeInputPresentation = InputPresentation;

// Re-export shared types for convenience

export type {
  InputStatus as TimeInputStatus,
  InputStatusType as TimeInputStatusType,
} from '../Field';

export interface TimeInputProps extends Omit<
  FieldInputBaseProps<HTMLInputElement>,
  'onChange' | 'defaultValue'
> {
  /** Ref forwarded to the time input (the field's semantic control) */
  ref?: React.Ref<HTMLInputElement>;
  /**
   * Label text for the input (required for accessibility).
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
   * Explains why the input is disabled. When set together with
   * `isDisabled`, the input shows a tooltip with this text on hover and
   * keyboard focus, and the input is described by it, so the reason is
   * discoverable by keyboard and assistive technology. Typing and arrow-key
   * adjustment stay blocked.
   *
   * Use this instead of wrapping a disabled input in `Tooltip`, so the
   * reason is tied to the field.
   *
   * @example
   * ```
   * <TimeInput
   *   label="Start time"
   *   value={time}
   *   onChange={setTime}
   *   isDisabled
   *   disabledMessage="You need the Editor role to change this"
   * />
   * ```
   */
  disabledMessage?: string;

  /**
   * The selected time in ISO format (HH:MM or HH:MM:SS).
   */
  value?: ISOTimeString;

  /**
   * Callback fired when the time changes.
   * Called with undefined when input is cleared.
   */
  onChange?: (value: ISOTimeString | undefined) => void;

  /**
   * Async action on change. Fires after onChange.
   */
  changeAction?: (value: ISOTimeString | undefined) => void | Promise<void>;

  /**
   * Whether the input is in a loading state.
   * @default false
   */
  isLoading?: boolean;

  /**
   * Minimum selectable time in ISO format.
   */
  min?: ISOTimeString;

  /**
   * Maximum selectable time in ISO format.
   */
  max?: ISOTimeString;

  /**
   * Whether to include seconds in the time input.
   * @default false
   */
  hasSeconds?: boolean;

  /**
   * Whether to show a clear button when a value is set.
   * @default false
   */
  hasClear?: boolean;

  /**
   * Whether to automatically focus the input on mount.
   * @default false
   */
  hasAutoFocus?: boolean;

  /**
   * Hour format for display.
   * - '12h': Display as 12-hour with AM/PM (e.g., "2:30 PM")
   * - '24h': Display as 24-hour (e.g., "14:30")
   * @default '12h'
   */
  hourFormat?: TimeInputHourFormat;

  /**
   * Increment in minutes when using arrow keys. Steps are whole minutes: a
   * fractional value leaves the time unchanged.
   * @default 1
   */
  increment?: number;

  /**
   * Which time-selection surface to use.
   *
   * - `'touch'`: browser/OS picker on coarse pointers, Astryx's typed field on
   *   fine pointers
   * - `'always'`: browser/OS picker wherever `<input type="time">` is supported
   * - `'never'`: Astryx's typed field everywhere
   *
   * Native time pickers cannot preserve seconds or Astryx's arrow-key cadence,
   * so `hasSeconds` or `increment !== 1` keeps the typed field.
   * @default 'touch'
   * @deprecated Use `presentation` (`spec:AST-043` FR3):
   * `'touch'` → `'adaptive-native'`, `'always'` → `'native'`,
   * `'never'` → `'text-input'`. Still works exactly as released;
   * `presentation` wins when both are set.
   */
  nativePicker?: TimeInputNativePicker;

  /**
   * Which surface selects the time (`spec:AST-043` FR1).
   *
   * - `'text-input'`: Astryx's typed field only (today's `nativePicker="never"`)
   * - `'popover'`: no distinct popover exists for TimeInput; resolves to the
   *   typed field (FR1 surface table)
   * - `'bottom-sheet'`: Astryx's bottom-sheet time wheels on every pointer
   * - `'native'`: the browser/OS `<input type="time">` on every pointer, with
   *   no Astryx fallback (FR2)
   * - `'adaptive-bottom-sheet'`: typed field on a fine pointer, bottom sheet
   *   on a coarse pointer
   * - `'adaptive-native'` (default): typed field on a fine pointer, browser/OS
   *   picker on a coarse pointer, keeping the released Astryx fallback
   *   (`hasSeconds` or `increment !== 1`) where native cannot express it (FR2)
   *
   * @default 'adaptive-native'
   */
  presentation?: TimeInputPresentation;

  /**
   * Placeholder text shown when no time is selected.
   * @default "Select a time"
   */
  placeholder?: string;

  /**
   * The size of the input.
   * - 'sm': Compact size (18px height)
   * - 'md': Default size (26px height)
   * @default 'md'
   */
  size?: TimeInputSize;

  /**
   * Status indicator for the input.
   * When set, displays a colored border and status icon.
   * If message is provided, displays below the input.
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
   * Width of the field. Numbers are treated as pixels, strings are used as-is
   * (e.g. `'100%'`). Sizes the whole field (label, control, and status) so they
   * stay aligned, unlike setting width via `containerXstyle` or `controlXstyle`.
   */
  width?: SizeValue;
  /**
   * Tooltip text to display in an info icon at the end of the label.
   */
  labelTooltip?: string;
}

/**
 * A time input component with text input and keyboard navigation.
 *
 * @example
 * ```
 * <TimeInput
 *   label="Start time"
 *   value={time}
 *   onChange={setTime}
 *   hourFormat="12h"
 *   hasClear
 * />
 * ```
 */
function TimeField({
  label,
  isLabelHidden = false,
  description,
  isOptional = false,
  isRequired = false,
  isDisabled = false,
  disabledMessage,
  value,
  onChange,
  changeAction,
  isLoading = false,
  min,
  max,
  hasSeconds = false,
  hasClear = false,
  hasAutoFocus = false,
  hourFormat = '12h',
  increment = 1,
  placeholder: placeholderFromProps,
  size: sizeProp,
  status,
  statusVariant = 'attached',
  labelTooltip,
  width,
  containerXstyle,
  containerClassName,
  containerStyle,
  controlXstyle,
  controlClassName,
  controlStyle,
  ref,
  nativeMode = 'off',
  ...restProps
}: TimeInputProps & {nativeMode?: 'off' | 'adaptive' | 'forced' | 'legacy'}) {
  const {rest, container} = useFieldInputStyling('TimeInput', restProps, {
    containerXstyle,
    containerClassName,
    containerStyle,
  });
  const {
    id: idProp,
    'aria-describedby': ariaDescribedByProp,
    'aria-labelledby': ariaLabelledByProp,
    onFocus: onFocusProp,
    onBlur: onBlurProp,
    onKeyDown: onKeyDownProp,
    ...controlProps
  } = rest;
  const t = useTranslator();
  const isEffectivelyRequired = useResolvedRequired({isRequired, isOptional});
  const placeholder =
    placeholderFromProps ?? t('@astryx.timeInput.placeholder');
  const size = useSize(sizeProp, 'md');
  // `forced` (explicit `presentation="native"`, FR2): always native, no
  // fallback. `adaptive` (`adaptive-native` coarse) and `legacy` (deprecated
  // `nativePicker="always"`): iOS has no seconds wheel and treats step as
  // validation rather than wheel cadence, so those keep the typed field —
  // `legacy` on every pointer, exactly as released.
  const usesNativeTimePicker =
    nativeMode === 'forced' ||
    ((nativeMode === 'adaptive' || nativeMode === 'legacy') &&
      !hasSeconds &&
      increment === 1);

  const generatedID = useId();
  const id = idProp ?? generatedID;
  const fieldLabelID = useId();
  const inputLabelID = useId();
  const descriptionID = useId();
  const statusMessageID = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const mergedInputRef = useMergedRefs(ref, inputRef);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputGroup = useInputGroup();

  const [, startTransition] = useTransition();
  const [optimisticValue, setOptimisticValue] = useOptimistic(value);
  const isBusy = isLoading || optimisticValue !== value;
  // The busy Spinner is decorative; this control announces its busy start
  // (spec:AST-086 FR8).
  useBusyAnnouncement(isBusy, t('@astryx.spinner.loading'), containerRef);

  // In grouped mode the status message renders as a visually-hidden node that
  // exists only for aria-describedby. Announce it through the persistent
  // useAnnounce live regions instead of role/aria-live on that node — a live
  // region mounted together with its content is not reliably announced.
  // Ungrouped mode delegates to Field -> FieldStatus, which announces itself.
  const announce = useAnnounce();
  useEffect(() => {
    if (inputGroup && status?.message) {
      announce(
        status.message,
        status.type === 'error' ? 'assertive' : 'polite',
      );
    }
  }, [announce, inputGroup, status?.message, status?.type]);

  // A disabled field never renders native `disabled` (spec:AST-085 FR1): the
  // input stays focusable via aria-disabled, and readOnly plus the value
  // mutation guards block typing. The disabled-reason tooltip's listeners
  // attach to the input container.
  const showsDisabledMessage = isDisabled && !!disabledMessage;
  const disabledMessageTooltip = useTooltip({
    placement: 'above',
    // The container div is not naturally focusable; focusin bubbles up from
    // the input, so always attach focus listeners.
    focusTrigger: 'always',
    isEnabled: showsDisabledMessage,
  });

  // Status icon mapping
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
      statusVariant !== 'tooltip' && status?.message ? statusMessageID : null,
      // The tooltip variant renders no message box; describe the input by the
      // tooltip's content instead so the status is still announced.
      statusTooltipDescribedBy,
      showsDisabledMessage ? disabledMessageTooltip.describedBy : null,
      ariaDescribedByProp,
    ],
    inputGroup,
  );
  // A caller aria-labelledby names the control together with the field's own
  // label (the Field label standalone, the group and input labels in a group).
  const controlLabelledBy =
    ariaLabelledByProp != null
      ? joinAriaIDs(ariaLabelledBy ?? fieldLabelID, ariaLabelledByProp)
      : ariaLabelledBy;

  // Pending input while user is typing (null = show formatted value)
  const [pendingInput, setPendingInput] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Format function based on hourFormat
  const formatDisplayTime =
    hourFormat === '12h' ? formatDisplayTime12h : formatDisplayTime24h;

  // Unified change handler that fires both onChange and changeAction
  const fireChange = useCallback(
    (newValue: ISOTimeString | undefined) => {
      onChange?.(newValue);
      if (changeAction) {
        startTransition(async () => {
          setOptimisticValue(newValue);
          await changeAction(newValue);
        });
      }
    },
    [onChange, changeAction, startTransition, setOptimisticValue],
  );

  // Display value: pending input if typing, otherwise formatted value
  const displayValue = useMemo(() => {
    if (pendingInput !== null) {
      return pendingInput;
    }
    return optimisticValue
      ? formatDisplayTime(optimisticValue, hasSeconds)
      : '';
  }, [pendingInput, optimisticValue, formatDisplayTime, hasSeconds]);

  // Check if current input is valid (for styling purposes)
  const isInputValid = useMemo(() => {
    // Only check pending input for validity styling
    if (pendingInput === null || !pendingInput.trim()) {
      return true;
    }
    const parsed = parseTimeInput(pendingInput, hasSeconds);
    if (!parsed) {
      return false;
    }
    // Also check min/max range
    return isTimeInRange(parsed, min, max);
  }, [pendingInput, hasSeconds, min, max]);

  // Placeholder that shows format hint when focused and empty
  const displayPlaceholder = useMemo(() => {
    if (isFocused && !displayValue) {
      return hourFormat === '12h' ? 'e.g., 2:30 PM' : 'e.g., 14:30';
    }
    return placeholder;
  }, [isFocused, displayValue, hourFormat, placeholder]);

  // Handle input text change - update immediately if valid
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // The input is never natively disabled (spec:AST-085 FR1), so guard
      // value mutation explicitly (readOnly also blocks typing).
      if (isDisabled) {
        return;
      }
      const newValue = e.target.value;
      setPendingInput(newValue);

      // If the input is valid, update immediately (don't wait for blur)
      const parsed = parseTimeInput(newValue, hasSeconds);
      if (parsed && isTimeInRange(parsed, min, max) && parsed !== value) {
        fireChange(parsed);
      }
    },
    [hasSeconds, min, max, value, fireChange, isDisabled],
  );

  // Handle focus
  const handleFocus = useCallback(() => {
    // A disabled input stays focusable (via aria-disabled) so its reason is
    // discoverable, but it must not present editing affordances — keep the
    // static placeholder rather than swapping in the format hint.
    if (isDisabled) {
      return;
    }
    setIsFocused(true);
  }, [isDisabled]);

  // Handle blur - validate and clear pending input
  const handleBlur = useCallback(
    (_e: FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);

      if (pendingInput === null) {
        return;
      }
      // Disabled: keep the value, drop the draft (spec:AST-085 FR2).
      if (isDisabled) {
        setPendingInput(null);
        return;
      }

      if (!pendingInput.trim()) {
        // Empty input clears the value
        if (value !== undefined) {
          fireChange(undefined);
        }
        setPendingInput(null);
        return;
      }

      const parsed = parseTimeInput(pendingInput, hasSeconds);
      if (parsed && isTimeInRange(parsed, min, max)) {
        // Valid time - update if different
        if (parsed !== value) {
          fireChange(parsed);
        }
      }
      // Clear pending input - display will revert to formatted value
      setPendingInput(null);
    },
    [pendingInput, isDisabled, value, fireChange, hasSeconds, min, max],
  );

  // Handle keyboard navigation on input
  // Enter in a focused disabled field would submit a surrounding form (FR2).
  const preventDisabledEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (isDisabled && e.key === 'Enter') {
      e.preventDefault();
    }
  };

  const handleInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      // ArrowUp/ArrowDown step the time and preventDefault; an IME candidate
      // window uses those same arrows to navigate candidates, so guard the
      // composing keydown (fires before compositionend) to avoid stealing them
      // mid-composition. See utils/ime.ts.
      if (isImeKeyEvent(e.nativeEvent)) {
        return;
      }
      // Arrow-key adjustment mutates the value; block it while disabled.
      if (isDisabled) {
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();

        // Get current time or default to now
        let currentTime = value;
        if (!currentTime) {
          const now = new Date();
          currentTime = formatISOTime(
            {
              hour: now.getHours(),
              minute: now.getMinutes(),
              second: now.getSeconds(),
            },
            hasSeconds,
          );
        }

        const delta = e.key === 'ArrowUp' ? increment : -increment;
        const newTime = adjustTime(currentTime, delta, hasSeconds);

        // Check if within range
        if (isTimeInRange(newTime, min, max)) {
          fireChange(newTime);
          // Stepping programmatically rewrites a plain textbox's value, and
          // screen readers do not announce programmatic textbox changes — the
          // new value must be spoken explicitly or stepping is silent
          // (WCAG 4.1.2).
          announce(formatDisplayTime(newTime, hasSeconds));
        }
      }
    },
    [
      value,
      hasSeconds,
      increment,
      min,
      max,
      fireChange,
      isDisabled,
      announce,
      formatDisplayTime,
    ],
  );

  // Handle clear button click
  const handleClear = useCallback(
    (e?: React.MouseEvent<HTMLButtonElement>) => {
      fireChange(undefined);
      // Focusing a native time control reopens the OS picker on iOS.
      if (!usesNativeTimePicker) {
        if (!e || e.detail === 0) {
          inputRef.current?.focus();
        } else {
          // Defer focus restoration past the button's unmount task so iOS Safari
          // and touch browsers don't jump the page scroll to 0 on tap.
          requestAnimationFrame(() => {
            inputRef.current?.focus({preventScroll: true});
          });
        }
      }
    },
    [fireChange, usesNativeTimePicker],
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
        // Handlers are gated internally by isEnabled, so attaching
        // unconditionally is safe.
        disabledMessageTooltip.ref(el);
      }}
      onClick={usesNativeTimePicker ? undefined : handleWrapperClick}
      onMouseUp={usesNativeTimePicker ? undefined : handleWrapperMouseUp}
      {...(inputGroup ? inputGroupItemProps : undefined)}
      {...mergeProps(
        themeProps('time-input', {
          size,
          status: status?.type ?? null,
          disabled: isDisabled ? 'disabled' : null,
        }),
        stylex.props(
          inputWrapperStyles.base,
          sizeStyles[size],
          isDisabled && inputWrapperStyles.disabled,
          isDisabled && styles.disabledFocusRing,
          status && inputStatusBorderStyles[status.type],
          status && !isDisabled && inputStatusHoverShadowStyles[status.type],
          status && inputStatusFocusWithinStyles[status.type],
          inputGroup && groupStyles.inGroup,
          controlXstyle,
        ),
        controlClassName,
        controlStyle,
      )}>
      {inputGroup && <VisuallyHidden id={inputLabelID}>{label}</VisuallyHidden>}
      {inputGroup && description && (
        <VisuallyHidden as="div" id={descriptionID}>
          {description}
        </VisuallyHidden>
      )}
      {inputGroup && status?.message && (
        <VisuallyHidden as="div" id={statusMessageID}>
          {status.message}
        </VisuallyHidden>
      )}
      {usesNativeTimePicker ? (
        <NativeTimeSegment
          id={id}
          inputRef={mergedInputRef}
          value={optimisticValue}
          onChange={fireChange}
          placeholder={placeholder}
          openPickerLabel={t('@astryx.timeInput.openPicker', {label})}
          ariaLabelledBy={controlLabelledBy}
          hasAutoFocus={hasAutoFocus}
          min={min}
          max={max}
          hourFormat={hourFormat}
          isEffectivelyDisabled={isDisabled}
          isFocusableDisabled
          isEffectivelyRequired={isEffectivelyRequired}
          isBusy={isBusy}
          statusType={status?.type}
          ariaDescribedBy={ariaDescribedBy}
          controlProps={{
            ...controlProps,
            onFocus: onFocusProp,
            onBlur: onBlurProp,
            onKeyDown: chainEventHandlers(preventDisabledEnter, onKeyDownProp),
            onClick: isDisabled ? undefined : controlProps.onClick,
          }}
        />
      ) : (
        <>
          <div {...stylex.props(styles.icon)}>
            <Icon icon="clock" size="sm" color="secondary" />
          </div>
          <input
            {...controlProps}
            ref={mergedInputRef}
            id={id}
            type="text"
            value={displayValue}
            onChange={handleInputChange}
            onFocus={chainEventHandlers(handleFocus, onFocusProp)}
            onBlur={chainEventHandlers(handleBlur, onBlurProp)}
            onKeyDown={chainEventHandlers(
              preventDisabledEnter,
              handleInputKeyDown,
              onKeyDownProp,
            )}
            placeholder={displayPlaceholder}
            aria-disabled={isDisabled ? 'true' : undefined}
            readOnly={isDisabled || undefined}
            // The browser still dispatches a click on an aria-disabled input,
            // so a caller's onClick is skipped too (spec:AST-085 FR2).
            onClick={isDisabled ? undefined : controlProps.onClick}
            autoFocus={hasAutoFocus}
            data-autofocus={hasAutoFocus || undefined}
            aria-describedby={ariaDescribedBy}
            aria-required={isEffectivelyRequired ? 'true' : undefined}
            aria-invalid={
              status?.type === 'error' || !isInputValid ? 'true' : undefined
            }
            aria-busy={isBusy || undefined}
            aria-labelledby={controlLabelledBy}
            {...stylex.props(
              styles.input,
              isDisabled && styles.inputDisabled,
              !isInputValid && styles.inputInvalid,
            )}
          />
          {/*
              Live region announcing invalid typed input to assistive technology.
              The value silently reverts on blur, so without this a screen-reader
              user would get no feedback that their entry was rejected (WCAG 3.3.1).
            */}
          <VisuallyHidden as="div" role="alert" aria-live="assertive">
            {!isInputValid ? t('@astryx.timeInput.invalidTime') : ''}
          </VisuallyHidden>
        </>
      )}
      {isBusy && <Spinner size="sm" aria-hidden="true" />}
      {hasClear && optimisticValue && !isDisabled && (
        <InputClearButton
          label={t('@astryx.timeInput.clearLabel', {label})}
          onClick={handleClear}
        />
      )}
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
      labelID={ariaLabelledByProp != null ? fieldLabelID : undefined}
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

TimeField.displayName = 'TimeField';

/**
 * A time input whose `presentation` prop chooses the selection surface
 * (`spec:AST-043`); the deprecated `nativePicker` maps to the same surfaces
 * (FR3).
 *
 * Base props (`ref`, `id`, `data-*`, `aria-*`, DOM event handlers) go to the time input.
 * A DOM handler runs after the component's own handler for the same event
 * and still receives events the component handled, even ones it called
 * `preventDefault` on, so it cannot cancel built-in behavior.
 */
export function TimeInput(props: TimeInputProps) {
  const inputGroupState = use(InputGroupInternalContext);
  const isDisabled = props.isDisabled || inputGroupState.isDisabled;
  const isTouch = useMediaQuery(TOUCH_POINTER_QUERY);
  useDevWarning(
    'TimeInput',
    '`nativePicker` is deprecated; use `presentation` instead (`touch` → `adaptive-native`, `always` → `native`, `never` → `text-input`). `presentation` wins when both are set.',
    props.nativePicker !== undefined,
  );
  const effective = effectiveInputPresentation(
    props.presentation,
    props.nativePicker,
    'time',
  );
  const {
    presentation: _presentation,
    nativePicker: _nativePicker,
    ...rest
  } = props;
  if (effective === 'native') {
    // Deprecated `always` keeps released fallbacks (FR2 legacy); only an
    // explicit `presentation="native"` is forced.
    return (
      <TimeField
        {...rest}
        isDisabled={isDisabled}
        nativeMode={
          props.presentation === undefined && props.nativePicker === 'always'
            ? 'legacy'
            : 'forced'
        }
      />
    );
  }
  switch (resolveInputPresentation(effective, isTouch)) {
    case 'native':
      // Only `adaptive-native` on a coarse pointer resolves here (FR2).
      return (
        <TimeField {...rest} isDisabled={isDisabled} nativeMode="adaptive" />
      );
    case 'sheet':
      return <TouchTimeField {...rest} isDisabled={isDisabled} />;
    case 'text-input':
    case 'desktop':
      return <TimeField {...rest} isDisabled={isDisabled} />;
  }
}

TimeInput.displayName = 'TimeInput';
