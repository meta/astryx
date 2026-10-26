// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file DateInput.tsx
 * @input Uses React, useId, useState, useCallback, useRef, Field, Icon, Calendar, usePopover, InputGroupContext
 * @output Exports DateInput component, DateInputProps
 * @position Core implementation; consumed by index.ts, tested by DateInput.test.tsx
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/DateInput/DateInput.doc.mjs (props table, features, implementation notes)
 * - /packages/core/src/DateInput/DateInput.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/DateInput/index.ts (exports if types change)
 * - /apps/storybook/stories/DateInput.stories.tsx (storybook stories)
 * - /packages/cli/assets/templates/blocks/components/DateInput/ (showcase blocks)
 */

import {
  use,
  useId,
  useState,
  useCallback,
  useRef,
  useOptimistic,
  useTransition,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  sizeVars,
  radiusVars,
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
import {VisuallyHidden} from '../VisuallyHidden';
import {useInputGroup} from '../InputGroup/InputGroupContext';
import {InputGroupInternalContext} from '../InputGroup/InputGroupInternalContext';
import {groupStyles, inputGroupItemProps} from '../InputGroup/groupStyles';
import {useSize} from '../SizeContext/SizeContext';
import {Spinner} from '../Spinner';
import {
  Calendar,
  type ISODateString,
  type CalendarHandle,
  type DayOfWeek,
  type DayOfWeekName,
} from '../Calendar';
import {useCalendarConstraints} from '../Calendar/hooks';
import {useInputStatusIcon} from '../hooks/useInputStatusIcon';
import {useBusyAnnouncement} from '../hooks/useBusyAnnouncement';
import {useMediaQuery} from '../hooks/useMediaQuery';
import {useResolvedRequired} from '../hooks/useResolvedRequired';
import {usePopover} from '../Popover';
import {NativeDateField} from './NativeDateField';
import {TouchDateField} from './TouchDateField';
import {useTooltip} from '../Tooltip';
import {getInputARIA, isImeKeyEvent, parseDateInput} from '../utils';
import {chainEventHandlers} from '../utils/chainEventHandlers';
import {
  plainDateFromISO,
  plainDateToISO,
  formatSharedDate,
} from '../utils/plainDate';
import type {TimestampFormat} from '../Timestamp';
import {
  effectivePickerPresentation,
  resolvePickerPresentation,
  type PickerPresentation,
} from '../utils/inputPresentation';
import {useDevWarning} from '../hooks/useDevWarning';

const styles = stylex.create({
  // While disabled or busy the field takes no hover ring, but the focus ring
  // returns while this field's own input holds focus (spec:AST-085 FR6).
  // Defaults repeat the shared border and shadow.
  disabledFocusRing: {
    borderColor: {
      default: colorVars['--color-border-emphasized'],
      ':has(input:focus)': colorVars['--color-accent'],
    },
    boxShadow: {
      default: 'none',
      ':has(input:focus)': `inset 0px 0px 0px 2px ${colorVars['--color-accent-muted']}`,
    },
  },
  iconButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    margin: 0,
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    borderRadius: radiusVars['--radius-element'],
  },
  iconButtonDisabled: {
    cursor: 'default',
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
    minWidth: 180,
  },
  md: {
    height: sizeVars['--size-element-md'],
    minWidth: 180,
  },
  lg: {
    height: sizeVars['--size-element-lg'],
    minWidth: 180,
  },
});

export type DateInputSize = keyof typeof sizeStyles;

/**
 * Named display formats for a committed date value. These are the date-only
 * members of Timestamp's `format` vocabulary — reused verbatim (via
 * `Extract`) so the same literal renders the same date shape in both
 * `Timestamp` and `DateInput`:
 * - `'date'`: locale short-month date, e.g. "Mar 21, 2026"
 * - `'date_long'`: locale long-month date, e.g. "March 21, 2026" (the default)
 * - `'date_weekday'`: short weekday + date, e.g. "Wed, Mar 21, 2026"
 * - `'system_date'`: ISO 8601 calendar date, e.g. "2026-03-21"
 *
 * Because `DateInputFormat` is `Extract`ed from `TimestampFormat`, the two
 * types stay in compile-time lockstep: renaming or removing one of these
 * members from `TimestampFormat` breaks this type at build time.
 */
/**
 * When DateInput hands date picking to the browser/OS instead of its own
 * surfaces.
 *
 * - `'touch'`: native on touch devices (coarse pointer), Astryx's calendar
 *   popover on mouse-driven ones
 * - `'always'`: native wherever the browser supports `<input type="date">`
 * - `'never'`: Astryx's own pickers everywhere
 */
/** @deprecated Use {@link DateInputPresentation} via the `presentation` prop. */
export type DateInputNativePicker = 'touch' | 'always' | 'never';

/** Which surface collects the date (`spec:AST-043` FR1; no `text-input` — TimeInput-only). */
export type DateInputPresentation = PickerPresentation;

export type DateInputFormat = Extract<
  TimestampFormat,
  'date' | 'date_long' | 'date_weekday' | 'system_date'
>;

// Re-export shared types for convenience

export type {
  InputStatus as DateInputStatus,
  InputStatusType as DateInputStatusType,
} from '../Field';
import {mergeProps, isFocusDetached} from '../utils';
import {joinAriaIDs} from '../utils/inputAria';
import {
  useFieldInputStyling,
  type FieldInputBaseProps,
} from '../Field/fieldParts';
import type {SizeValue} from '../utils/types';
import {themeProps} from '../utils/themeProps';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import {useLocale, useTranslator} from '../i18n';

import {useMergedRefs} from '../hooks/useMergedRefs';
export interface DateInputProps extends Omit<
  FieldInputBaseProps<HTMLInputElement>,
  'onChange' | 'defaultValue'
> {
  /** Ref forwarded to the date input (the field's semantic control) */
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
   * `isDisabled`, the field shows a tooltip with this text on hover and
   * keyboard focus, and the field's focusable controls are described by it,
   * so the reason is discoverable by keyboard and assistive technology.
   * Typing and calendar activation stay blocked.
   *
   * Use this instead of wrapping a disabled input in `Tooltip`, so the
   * reason is tied to the field.
   *
   * @example
   * ```
   * <DateInput
   *   label="Event date"
   *   value={date}
   *   onChange={setDate}
   *   isDisabled
   *   disabledMessage="You need the Editor role to change this"
   * />
   * ```
   */
  disabledMessage?: string;

  /**
   * The selected date in ISO format (YYYY-MM-DD).
   */
  value?: ISODateString;

  /**
   * Callback fired when the date changes.
   * Called with undefined when input is cleared.
   */
  onChange?: (value: ISODateString | undefined) => void;

  /**
   * Async action on change. Fires after onChange.
   */
  changeAction?: (value: ISODateString | undefined) => void | Promise<void>;

  /**
   * Whether the input is in a loading state. The field stays focusable and
   * exposes `aria-busy` with a Spinner; typing, picking, and clearing are
   * blocked until loading ends.
   * @default false
   */
  isLoading?: boolean;

  /**
   * Minimum selectable date in ISO format.
   */
  min?: ISODateString;

  /**
   * Maximum selectable date in ISO format.
   */
  max?: ISODateString;

  /**
   * Custom date constraint functions. Date is disabled if ANY function returns false.
   */
  dateConstraints?: ReadonlyArray<(date: Date) => boolean>;

  /**
   * Placeholder text shown when no date is selected.
   * @default "Select a date"
   */
  placeholder?: string;

  /**
   * The size of the input. The field height follows the theme's element-size
   * token for the chosen size (`--size-element-sm`, `--size-element-md`, or
   * `--size-element-lg`).
   * @default 'md'
   */
  size?: DateInputSize;

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

  /**
   * Whether to show a clear button when a date is set.
   * When clicked, resets the value to undefined and returns focus to the input.
   * @default false
   */
  hasClear?: boolean;

  /**
   * Number of months to display in the calendar popover.
   * @default 1
   */
  numberOfMonths?: 1 | 2;

  /**
   * First day of week in the calendar popover. Accepts a number
   * (0 = Sunday … 6 = Saturday) or a three-letter day name ('sun'–'sat',
   * case-insensitive).
   * @default 0
   */
  weekStartsOn?: DayOfWeek | DayOfWeekName;

  /**
   * How the committed date value is displayed in the text field. Accepts a
   * named format reused from `Timestamp`'s `format` vocabulary (so the same
   * literal renders the same date shape in both components) or a function that
   * maps the ISO value to a custom display string.
   *
   * - `'date_long'` (default): long-month date, e.g. "March 21, 2026"
   * - `'date'`: short-month date, e.g. "Mar 21, 2026"
   * - `'date_weekday'`: short weekday + date, e.g. "Wed, Mar 21, 2026"
   * - `'system_date'`: ISO 8601 calendar date, e.g. "2026-03-21"
   * - `(value: ISODateString) => string`: fully custom display string
   *
   * Formatting applies only to the committed value — never to text the user is
   * actively typing. A custom function's output that `parseDateInput` cannot
   * read back can't be re-committed after an edit; external `value` changes
   * always recompute the display from the ISO value.
   *
   * @default 'date_long'
   * @example
   * ```
   * <DateInput label="Ship date" value={date} onChange={setDate} format="date" />
   * <DateInput
   *   label="Ship date"
   *   value={date}
   *   onChange={setDate}
   *   format={iso => new Date(iso + 'T00:00').toDateString()}
   * />
   * ```
   */
  format?: DateInputFormat | ((value: ISODateString) => string);

  /**
   * When date picking is handed to the browser/OS instead of Astryx's own
   * surfaces: the field becomes an `<input type="date">` and the platform
   * draws the picker — the iOS wheel, the Android calendar dialog — with the
   * OS's own hit areas, momentum scrolling, locale and accessibility
   * settings.
   *
   * - `'touch'` (default): native on touch devices (coarse pointer), the text
   *   field and calendar popover on mouse-driven ones
   * - `'always'`: native wherever the browser supports `<input type="date">`
   * - `'never'`: Astryx's own pickers everywhere — the touch picker on a
   *   finger, the calendar popover on a mouse
   *
   * `format` and `placeholder` still apply in native mode: DateInput paints
   * the closed field's text itself, over the control. `numberOfMonths` and
   * `weekStartsOn` do not — they describe a calendar grid the native picker
   * does not have — so a field that needs either should pass `'never'`.
   *
   * `min` and `max` are forwarded, but note that a native picker may not
   * *show* them: on iOS they are constraint-validation flags rather than
   * clamps, so an out-of-range date can be selected and is refused on commit
   * (announced to assistive technology) rather than being greyed out in the
   * picker. `dateConstraints` is enforced the same way, on commit, and is
   * reason enough to prefer `'never'` on a field that uses it.
   *
   * @default 'touch'
   * @deprecated Use `presentation` (`spec:AST-043` FR3):
   * `'touch'` → `'adaptive-native'`, `'always'` → `'native'`,
   * `'never'` → `'adaptive-bottom-sheet'`. Still works exactly as released;
   * `presentation` wins when both are set.
   */
  nativePicker?: DateInputNativePicker;

  /**
   * Which surface collects the date (`spec:AST-043` FR1). Every value opens
   * a picker; the typed-field-only `'text-input'` belongs to `TimeInput`.
   *
   * - `'popover'`: Astryx's typed field + calendar popover on every pointer
   * - `'bottom-sheet'`: Astryx's bottom-sheet calendar on every pointer
   * - `'native'`: the browser/OS picker on every pointer, with no Astryx
   *   fallback (FR2)
   * - `'adaptive-bottom-sheet'`: popover on a fine pointer, bottom sheet on
   *   a coarse pointer
   * - `'adaptive-native'` (default): popover on a fine pointer, browser/OS
   *   picker on a coarse pointer, keeping the released Astryx fallbacks
   *   where a native control cannot express the value (FR2)
   *
   * @default 'adaptive-native'
   */
  presentation?: DateInputPresentation;
}

/**
 * The pointer that decides which surface a `DateInput` renders.
 *
 * `pointer: coarse` is the *primary* pointing device, which is what makes it
 * the whole test. A touchscreen laptop reports `fine` (its trackpad) with
 * `any-pointer: coarse` alongside, so it keeps the typable field — right,
 * because its keyboard is there. A tablet reports `coarse` and gets the
 * picker, at any width. There is deliberately no width bound: it would only
 * re-exclude the tablets, since a narrowed desktop window is still a mouse.
 *
 * Deliberately NOT exported. It was, briefly, on the theory that an app might
 * want to ask the same question and lay out to match — but nothing asked, and
 * six other core components (CheckboxInput, ChatComposerInput, ...) just
 * write `@media (pointer: coarse)` inline rather than sharing a constant. An
 * export is additive later and awkward to withdraw, so it waits for a real
 * caller.
 */
const TOUCH_POINTER_QUERY = '(pointer: coarse)';

/**
 * The pointer-driven field: a text input you can type into, with a calendar
 * in a popover beside it. `DateInput` renders this whenever the primary
 * pointer is not a finger — see {@link TOUCH_POINTER_QUERY}.
 */
function PointerDateField({
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
  dateConstraints,
  placeholder: placeholderFromProps,
  size: sizeProp,
  status,
  statusVariant = 'attached',
  labelTooltip,
  hasClear = false,
  numberOfMonths = 1,
  weekStartsOn,
  format = 'date_long',
  width,
  containerXstyle,
  containerClassName,
  containerStyle,
  controlXstyle,
  controlClassName,
  controlStyle,
  ref,
  ...restProps
}: DateInputProps) {
  const {rest, container} = useFieldInputStyling('DateInput', restProps, {
    containerXstyle,
    containerClassName,
    containerStyle,
  });
  const {
    id: idProp,
    'aria-describedby': ariaDescribedByProp,
    'aria-labelledby': ariaLabelledByProp,
    onBlur: onBlurProp,
    onClick: onClickProp,
    onKeyDown: onKeyDownProp,
    ...controlProps
  } = rest;
  const t = useTranslator();
  const locale = useLocale();
  const isEffectivelyRequired = useResolvedRequired({isRequired, isOptional});
  const placeholder =
    placeholderFromProps ?? t('@astryx.dateInput.placeholder');
  const size = useSize(sizeProp, 'md');
  const generatedID = useId();
  const id = idProp ?? generatedID;
  const fieldLabelID = useId();
  const inputLabelID = useId();
  const descriptionID = useId();
  const statusMessageID = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const calendarRef = useRef<CalendarHandle | null>(null);
  const lastFiredValueRef = useRef<ISODateString | undefined>(undefined);
  const inputGroup = useInputGroup();

  const [, startTransition] = useTransition();
  const [optimisticValue, setOptimisticValue] = useOptimistic(value);
  const isBusy = isLoading || optimisticValue !== value;
  // The busy Spinner is decorative; this control announces its busy start
  // (spec:AST-086 FR8).
  useBusyAnnouncement(isBusy, t('@astryx.spinner.loading'), inputRef);
  const isEffectivelyDisabled = isDisabled || isBusy;

  // A disabled or busy field never renders native `disabled` (spec:AST-085
  // FR1): the input and calendar button stay focusable via aria-disabled.
  // Typing is blocked with readOnly and value mutation guards; calendar
  // activation is blocked by the isEffectivelyDisabled guards. The
  // disabled-reason tooltip's listeners attach to the input container. Only
  // the persistent isDisabled state (not the transient busy state) surfaces a
  // reason.
  const showsDisabledMessage = isDisabled && !!disabledMessage;
  const disabledMessageTooltip = useTooltip({
    placement: 'above',
    // The container div is not naturally focusable; focusin bubbles up from
    // the input, so always attach focus listeners.
    focusTrigger: 'always',
    isEnabled: showsDisabledMessage,
  });

  // Constraint checking for text input validation (reuses calendar logic)
  const {isDateDisabled} = useCalendarConstraints({min, max, dateConstraints});

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

  // Pending input while user is typing (null = show formatted value)
  const [pendingInput, setPendingInput] = useState<string | null>(null);

  // Clear pending input when value changes externally (computed during render
  // via prev-value ref instead of useEffect to avoid an extra render cycle)
  const prevValueRef = useRef(value);
  if (value !== prevValueRef.current) {
    prevValueRef.current = value;
    if (value !== lastFiredValueRef.current) {
      lastFiredValueRef.current = undefined;
      if (pendingInput !== null) {
        setPendingInput(null);
      }
    }
  }

  // Format a committed ISO value for display. The default `date_long` renders
  // the long-month shape (byte-identical to the historical hardcoded
  // DATE_FORMAT_LONG rendering, so still non-breaking); a function is called
  // with the ISO value; every other named member reuses Timestamp's shared
  // date mapping. Applies ONLY to the committed value, never to in-progress
  // typed input.
  const formatCommittedValue = useCallback(
    (iso: ISODateString): string =>
      typeof format === 'function'
        ? format(iso)
        : formatSharedDate(plainDateFromISO(iso), format, locale),
    [format, locale],
  );

  // Display value: pending input if typing, otherwise formatted value
  const displayValue =
    pendingInput !== null
      ? pendingInput
      : optimisticValue && /^\d{4}-\d{2}-\d{2}$/.test(optimisticValue)
        ? formatCommittedValue(optimisticValue)
        : '';

  // Check if current input is valid (for styling purposes)
  const isInputValid =
    pendingInput === null || !pendingInput.trim()
      ? true
      : parseDateInput(pendingInput, locale) !== null;

  const popover = usePopover({
    dialogLabel: t('@astryx.dateInput.dialogLabel'),
    closeButtonLabel: t('@astryx.dateInput.closeCalendar'),
    // Return focus to the input when the calendar closes — but only when the
    // dismiss left focus detached (Escape, or a click on non-focusable empty
    // space), which the focus trap can't restore on its own. A native
    // popover="auto" light-dismiss fires synchronously with the pointer event
    // that moved focus, so if the user clicked another control — the clear
    // button, another field, anywhere — focus has already landed there;
    // reclaiming it would fight their click.
    onHide: () => {
      if (isFocusDetached()) {
        inputRef.current?.focus();
      }
    },
  });

  // Handle toggling the popover from button click (focus calendar)
  const handleToggle = useCallback(() => {
    if (!isEffectivelyDisabled) {
      if (popover.isOpen) {
        popover.hide();
      } else {
        popover.show();
      }
    }
  }, [isEffectivelyDisabled, popover]);

  // Handle opening the popover from input click (keep focus in input)
  const handleInputClick = useCallback(() => {
    if (!isEffectivelyDisabled && !popover.isOpen) {
      popover.show({skipAutoFocus: true});
    }
  }, [isEffectivelyDisabled, popover]);

  // Unified change handler that fires both onChange and changeAction
  const fireChange = useCallback(
    (newValue: ISODateString | undefined) => {
      if (isBusy) {
        return;
      }
      onChange?.(newValue);
      if (changeAction) {
        startTransition(async () => {
          setOptimisticValue(newValue);
          await changeAction(newValue);
        });
      }
    },
    [isBusy, onChange, changeAction, startTransition, setOptimisticValue],
  );

  // Handle clear button click
  const handleClear = useCallback(
    (e?: React.MouseEvent<HTMLButtonElement>) => {
      fireChange(undefined);
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
    [fireChange],
  );

  // Handle date selection from calendar
  const handleDateSelect = useCallback(
    (selectedDate: ISODateString) => {
      fireChange(selectedDate);
      setPendingInput(null);
      popover.hide();
    },
    [fireChange, popover],
  );

  // Handle input text change - update immediately if valid and allowed
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // The input is never natively disabled (spec:AST-085 FR1), so guard
      // value mutation explicitly (readOnly also blocks typing).
      if (isEffectivelyDisabled) {
        return;
      }
      const newValue = e.target.value;
      setPendingInput(newValue);

      // If the input is valid and passes constraints, update immediately
      const parsed = parseDateInput(newValue, locale);
      if (
        parsed &&
        plainDateToISO(parsed) !== value &&
        !isDateDisabled(parsed)
      ) {
        const parsedISO = plainDateToISO(parsed);
        lastFiredValueRef.current = parsedISO;
        fireChange(parsedISO);
        // Navigate calendar to show the parsed date's month
        calendarRef.current?.navigateTo(parsedISO);
      }
    },
    [value, fireChange, isDateDisabled, isEffectivelyDisabled, locale],
  );

  // Commit pending input (shared by blur and Enter key)
  const commitPendingInput = useCallback(() => {
    if (pendingInput === null) {
      return;
    }
    // Disabled or busy: keep the value, drop the draft (spec:AST-085 FR2).
    if (isEffectivelyDisabled) {
      setPendingInput(null);
      return;
    }

    if (!pendingInput.trim()) {
      if (value !== undefined) {
        fireChange(undefined);
      }
      setPendingInput(null);
      return;
    }

    const parsed = parseDateInput(pendingInput, locale);
    if (parsed && !isDateDisabled(parsed)) {
      const parsedISO = plainDateToISO(parsed);
      if (parsedISO !== value) {
        fireChange(parsedISO);
      }
    }
    setPendingInput(null);
  }, [
    pendingInput,
    isEffectivelyDisabled,
    value,
    fireChange,
    isDateDisabled,
    locale,
  ]);

  // Handle blur - validate, check constraints, and clear pending input
  const handleBlur = useCallback(() => {
    commitPendingInput();
  }, [commitPendingInput]);

  // Handle keyboard events on input
  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // An in-progress IME composition uses Enter to commit the candidate and
      // Escape to cancel it; that composing keydown fires before
      // compositionend, so without this guard a Korean/Japanese/Chinese user
      // committing a syllable with Enter would instead commit the pending date
      // (or Escape would close the calendar mid-composition). See utils/ime.ts.
      if (isImeKeyEvent(e.nativeEvent)) {
        return;
      }
      if (e.key === 'Escape' && popover.isOpen) {
        e.preventDefault();
        popover.hide();
      } else if (
        (e.key === 'ArrowDown' || (e.altKey && e.key === 'ArrowDown')) &&
        !popover.isOpen
      ) {
        // APG combobox: ArrowDown (and Alt+ArrowDown) opens the calendar
        // popover from the keyboard, keeping focus in the input (forms-13).
        e.preventDefault();
        if (!isEffectivelyDisabled) {
          popover.show({skipAutoFocus: true});
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        commitPendingInput();
      }
    },
    [popover, commitPendingInput, isEffectivelyDisabled],
  );

  const inputWrapper = (
    <div
      ref={el => {
        popover.triggerRef(el);
        // Anchor + hover/focus listeners for the disabled-message tooltip.
        // Handlers are gated internally by isEnabled, and anchor names
        // compose, so attaching unconditionally is safe.
        disabledMessageTooltip.ref(el);
      }}
      {...(inputGroup ? inputGroupItemProps : undefined)}
      {...mergeProps(
        themeProps('date-input', {
          size,
          status: status?.type ?? null,
          disabled: isDisabled ? 'disabled' : null,
        }),
        stylex.props(
          inputWrapperStyles.base,
          sizeStyles[size],
          // Disabled paint belongs to the disabled state only; a busy field
          // keeps its ordinary paint and shows the Spinner (spec:AST-085
          // FR6, family:buttons FR4).
          isDisabled && inputWrapperStyles.disabled,
          isEffectivelyDisabled && styles.disabledFocusRing,
          status && inputStatusBorderStyles[status.type],
          status &&
            !isEffectivelyDisabled &&
            inputStatusHoverShadowStyles[status.type],
          status && inputStatusFocusWithinStyles[status.type],
          inputGroup && groupStyles.inGroup,
          controlXstyle,
        ),
        controlClassName,
        controlStyle,
      )}>
      {inputGroup && <VisuallyHidden id={inputLabelID}>{label}</VisuallyHidden>}
      <button
        type="button"
        onClick={handleToggle}
        aria-disabled={isEffectivelyDisabled || undefined}
        // A tab stop while disabled too, so it carries the reason (FR5).
        aria-describedby={
          showsDisabledMessage ? disabledMessageTooltip.describedBy : undefined
        }
        aria-label={
          popover.isOpen
            ? t('@astryx.dateInput.toggleCalendarClose')
            : t('@astryx.dateInput.openCalendar')
        }
        {...stylex.props(
          focusOutlineStyles.focusVisible,
          styles.iconButton,
          isEffectivelyDisabled && styles.iconButtonDisabled,
        )}>
        <Icon
          icon="calendar"
          size="sm"
          color="secondary"
          // Stable theme target on the toggle glyph itself, so a theme can
          // restyle just this icon (color, size, hover) — and each open/closed
          // state — via `defineTheme`. Same-element rules in @layer astryx-theme
          // win over the icon's own base color/size, which a button-level target
          // could not reach. Reflects the popover's open/closed state as a
          // `data-state` attribute.
          {...themeProps('date-input-toggle-icon', {
            state: popover.isOpen ? 'expanded' : 'collapsed',
          })}
        />
      </button>
      <input
        {...controlProps}
        ref={useMergedRefs(ref, inputRef)}
        id={id}
        type="text"
        role="combobox"
        value={displayValue}
        onChange={handleInputChange}
        onBlur={chainEventHandlers(handleBlur, onBlurProp)}
        onClick={
          isEffectivelyDisabled
            ? undefined
            : chainEventHandlers(handleInputClick, onClickProp)
        }
        onKeyDown={chainEventHandlers(handleInputKeyDown, onKeyDownProp)}
        placeholder={placeholder}
        aria-disabled={isEffectivelyDisabled ? 'true' : undefined}
        readOnly={isEffectivelyDisabled || undefined}
        aria-labelledby={
          ariaLabelledByProp != null
            ? joinAriaIDs(ariaLabelledBy ?? fieldLabelID, ariaLabelledByProp)
            : ariaLabelledBy
        }
        aria-describedby={ariaDescribedBy}
        aria-required={isEffectivelyRequired ? 'true' : undefined}
        aria-invalid={
          status?.type === 'error' || !isInputValid ? 'true' : undefined
        }
        aria-busy={isBusy || undefined}
        aria-expanded={popover.isOpen}
        aria-haspopup="dialog"
        aria-controls={popover.isOpen ? popover.id : undefined}
        aria-autocomplete="none"
        autoComplete="off"
        {...stylex.props(
          styles.input,
          isEffectivelyDisabled && styles.inputDisabled,
          !isInputValid && styles.inputInvalid,
        )}
      />
      {/*
          Live region announcing invalid typed input to assistive technology.
          The value silently reverts on blur, so without this a screen-reader
          user would get no feedback that their entry was rejected (WCAG 3.3.1).
        */}
      <VisuallyHidden as="div" role="alert" aria-live="assertive">
        {!isInputValid ? t('@astryx.dateInput.invalidDate') : ''}
      </VisuallyHidden>
      {hasClear && value !== undefined && !isEffectivelyDisabled && (
        <InputClearButton
          label={t('@astryx.dateInput.clear', {label})}
          onClick={handleClear}
        />
      )}
      {isBusy && <Spinner size="sm" aria-hidden="true" />}
      {statusIcon}
      {popover.render(
        <Calendar
          handleRef={calendarRef}
          mode="single"
          value={optimisticValue ?? null}
          onChange={handleDateSelect}
          min={min}
          max={max}
          dateConstraints={dateConstraints}
          numberOfMonths={numberOfMonths}
          weekStartsOn={weekStartsOn}
        />,
        {placement: 'below', alignment: 'start'},
      )}
      {showsDisabledMessage &&
        disabledMessageTooltip.renderTooltip(disabledMessage)}
    </div>
  );

  if (inputGroup) {
    return inputWrapper;
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
    </Field>
  );
}

PointerDateField.displayName = 'PointerDateField';

/**
 * A date picker that fits the pointer it is being used with.
 *
 * With a mouse or trackpad this is a text input you can type into, with a
 * calendar in a popover — unchanged, and still the surface every existing
 * consumer gets. With a finger it is a picker built for one: a bottom sheet
 * holding one month per screen, swiped sideways, with month and year wheels
 * behind the header title for the far jumps swiping is bad at.
 *
 * The props are identical either way — this is one component with two
 * surfaces, not two components — so nothing at the call site changes, and a
 * date typed on a laptop and a date thumbed on a phone are the same value.
 *
 * ## Why a runtime switch and not CSS
 *
 * The two surfaces are structurally different — a popover anchored to a text
 * field versus a full-width sheet holding a scroller — so "render both, hide
 * one" would double the DOM, double the tab stops, and mount two calendars.
 * The condition is not layout either: it is *which interaction is faster*,
 * and that depends on the pointer, which CSS cannot hand to JS.
 *
 * They are two components rather than one with a branch inside because the
 * hook lists differ; keeping them separate is what lets each own its own.
 *
 * ## Hydration
 *
 * `useMediaQuery` reports false during SSR, so server HTML is always the
 * pointer field and the swap happens after hydration. That is deliberately
 * unobservable: both surfaces render the SAME closed field — a bordered input
 * with a calendar icon and the formatted date — and differ only in what
 * opens. Nothing moves; the field just starts opening a sheet.
 *
 * Base props (`ref`, `id`, `data-*`, `aria-*`, DOM event handlers) go to the date input.
 * A DOM handler runs after the component's own handler for the same event
 * and still receives events the component handled, even ones it called
 * `preventDefault` on, so it cannot cancel built-in behavior.
 *
 * @example
 * ```
 * <DateInput
 *   label="Event date"
 *   value={date}
 *   onChange={setDate}
 * />
 * ```
 */
export function DateInput(props: DateInputProps) {
  const inputGroupState = use(InputGroupInternalContext);
  const isDisabled = props.isDisabled || inputGroupState.isDisabled;
  const isTouch = useMediaQuery(TOUCH_POINTER_QUERY);
  useDevWarning(
    'DateInput',
    '`nativePicker` is deprecated; use `presentation` instead (`touch` → `adaptive-native`, `always` → `native`, `never` → `adaptive-bottom-sheet`). `presentation` wins when both are set.',
    props.nativePicker !== undefined,
  );
  const surface = resolvePickerPresentation(
    effectivePickerPresentation(props.presentation, props.nativePicker),
    isTouch,
  );
  const {
    presentation: _presentation,
    nativePicker: _nativePicker,
    ...rest
  } = props;
  switch (surface) {
    case 'native':
      return <NativeDateField {...rest} isDisabled={isDisabled} />;
    case 'sheet':
      return <TouchDateField {...rest} isDisabled={isDisabled} />;
    case 'desktop':
      return <PointerDateField {...rest} isDisabled={isDisabled} />;
  }
}

DateInput.displayName = 'DateInput';
