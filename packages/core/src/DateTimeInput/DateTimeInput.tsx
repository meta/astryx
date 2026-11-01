// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file DateTimeInput.tsx
 * @input Uses React, Field, Calendar, NativeDateSegment, NativeTimeSegment, TouchDateTimeField, usePopover, useAnnounce, time parsing utilities, StyleX intrinsic flex layout
 * @output Exports DateTimeInput component, DateTimeInputProps, and native picker type; cleared values keep the pointer Calendar controlled-empty
 * @position Core implementation; consumed by index.ts, tested by DateTimeInput.test.tsx
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/DateTimeInput/NativeDateSegment.tsx (native date surface)
 * - /packages/core/src/DateTimeInput/NativeTimeSegment.tsx (native time surface)
 * - /packages/core/src/DateTimeInput/NativePickerSegments.test.tsx (native surface tests)
 * - /packages/core/src/DateTimeInput/DateTimeInput.doc.mjs (props table, features, implementation notes)
 * - /packages/core/src/DateTimeInput/DateTimeInput.test.tsx (desktop tests for new/changed behavior)
 * - /packages/core/src/DateTimeInput/DateTimeInputTouch.test.tsx (touch-surface tests)
 * - /packages/core/src/DateTimeInput/index.ts (exports if types change)
 * - /apps/storybook/stories/DateTimeInput.stories.tsx (storybook stories)
 * - /packages/cli/assets/templates/blocks/components/DateTimeInput/ (showcase blocks)
 */

import {
  useId,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  useOptimistic,
  useTransition,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  sizeVars,
  radiusVars,
  spacingVars,
  typographyVars,
  typeScaleVars,
  fontWeightVars,
} from '../theme/tokens.stylex';
import {
  Field,
  InputClearButton,
  type InputStatus,
  inputWrapperStyles,
  inputStatusBorderStyles,
  inputStatusHoverShadowStyles,
  inputStatusFocusWithinStyles,
} from '../Field';
import {Icon} from '../Icon';
import {VisuallyHidden} from '../VisuallyHidden';
import {Spinner} from '../Spinner';
import {
  Calendar,
  type ISODateString,
  type CalendarHandle,
  type DayOfWeek,
  type DayOfWeekName,
} from '../Calendar';
import {useCalendarConstraints} from '../Calendar/hooks';
import {usePopover} from '../Popover';
import {useTooltip} from '../Tooltip';
import {useInputContainer} from '../hooks/useInputContainer';
import {useBusyAnnouncement} from '../hooks/useBusyAnnouncement';
import {useInputStatusIcon} from '../hooks/useInputStatusIcon';
import {
  type ISOTimeString,
  parseDateInput,
  parseISOTime,
  formatISOTime,
  isTimeInRange,
  adjustTime,
  isImeKeyEvent,
  mergeProps,
  isFocusDetached,
} from '../utils';
import {chainEventHandlers} from '../utils/chainEventHandlers';
import {joinAriaIDs} from '../utils/inputAria';
import {
  plainDateFromISO,
  plainDateToISO,
  plainDateFormat,
  DATE_FORMAT_LONG,
} from '../utils/plainDate';

import {
  useFieldInputStyling,
  type FieldInputBaseProps,
} from '../Field/fieldParts';
import type {SizeValue} from '../utils/types';
import {useAnnounce} from '../hooks/useAnnounce';
import {useMediaQuery} from '../hooks/useMediaQuery';
import {useResolvedRequired} from '../hooks/useResolvedRequired';
import {useSize} from '../SizeContext/SizeContext';
import {themeProps} from '../utils/themeProps';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import {useLocale, useTranslator} from '../i18n';
import {
  formatLocaleTime,
  parseLocaleTime,
  resolveHourFormat,
} from '../utils/timeFormat';

import {useMergedRefs} from '../hooks/useMergedRefs';
import {useHighlightedOptionScroll} from '../hooks/useHighlightedOptionScroll';
import {NativeDateSegment} from './NativeDateSegment';
import {NativeTimeSegment} from './NativeTimeSegment';
import {TouchDateTimeField} from './TouchDateTimeField';
import {
  effectivePickerPresentation,
  resolvePickerPresentation,
  type PickerPresentation,
} from '../utils/inputPresentation';
import {useDevWarning} from '../hooks/useDevWarning';
export type ISODateTimeString = string & {
  readonly __brand: 'ISODateTimeString';
};

/** @deprecated Use {@link DateTimeInputPresentation} via the `presentation` prop. */
export type DateTimeInputNativePicker = 'touch' | 'always' | 'never';

/** Which surfaces collect the date and time (`spec:AST-043` FR1; no `text-input` — TimeInput-only). */
export type DateTimeInputPresentation = PickerPresentation;

export type DateTimeInputHourFormat = '12h' | '24h';

export type DateTimeInputSize = 'sm' | 'md' | 'lg';

/** Supported minute increments for arrow-key stepping of the time field. */
export type DateTimeInputTimeIncrement = 1 | 5 | 10 | 15 | 30;

/**
 * Supported minute cadences for the preset-time dropdown. Every value divides
 * an hour evenly, so each option lands on a round clock time.
 */
export type DateTimeInputTimeOptionInterval = 5 | 10 | 15 | 30 | 60;

export type {
  InputStatus as DateTimeInputStatus,
  InputStatusType as DateTimeInputStatusType,
} from '../Field';

// Two 196px segments plus the 8px gap fit at exactly 400px. Below that,
// flex wrapping moves each growing segment onto its own full-width row.
const HORIZONTAL_SEGMENT_BASIS = 196;

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
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacingVars['--spacing-2'],
  },
  nativeRow: {
    // Match DateInput's closed-field floor. Without one, WebKit reports almost
    // no intrinsic width for appearance:none temporal inputs with overlays.
    minInlineSize: 180,
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
  dateWrapper: {
    flex: 1,
    flexBasis: HORIZONTAL_SEGMENT_BASIS,
    minWidth: 0,
  },
  timeWrapper: {
    flex: 1,
    flexBasis: HORIZONTAL_SEGMENT_BASIS,
    minWidth: 0,
  },
  // Preset-time list. Paddings and states mirror BaseTypeahead's dropdown and
  // Selector's options so every list in the system reads the same.
  timeListbox: {
    boxSizing: 'border-box',
    maxHeight: 300,
    overflowY: 'auto',
    padding: spacingVars['--spacing-1'],
    minWidth: 'anchor-size(width)',
  },
  timeOption: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    paddingBlock: spacingVars['--spacing-1-5'],
    paddingInline: spacingVars['--spacing-2'],
    borderRadius: radiusVars['--radius-element'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    textAlign: 'start',
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-body-size'],
    lineHeight: typeScaleVars['--text-body-leading'],
    color: colorVars['--color-text-primary'],
    backgroundColor: 'transparent',
  },
  timeOptionHighlighted: {
    backgroundColor: colorVars['--color-overlay-hover'],
  },
  timeOptionSelected: {
    fontWeight: fontWeightVars['--font-weight-medium'],
  },
});

/**
 * Size-specific padding for the preset-time options, so an `sm` field gets a
 * compact list. Matches DropdownMenuItem / Selector / BaseTypeahead.
 */
const timeOptionSizeStyles = stylex.create({
  sm: {
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-2'],
  },
  md: {
    paddingBlock: spacingVars['--spacing-1-5'],
  },
  lg: {
    paddingBlock: spacingVars['--spacing-2'],
  },
});

const TOUCH_POINTER_QUERY = '(pointer: coarse)';

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

export interface DateTimeInputProps extends Omit<
  FieldInputBaseProps<HTMLInputElement>,
  'onChange' | 'defaultValue'
> {
  /** Ref forwarded to the date input element */
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
   * keyboard focus, and the date and time fields are described by it, so the
   * reason is discoverable by keyboard and assistive technology. Typing and
   * calendar activation stay blocked.
   *
   * Use this instead of wrapping a disabled input in `Tooltip`, so the
   * reason is tied to the field.
   *
   * @example
   * ```
   * <DateTimeInput
   *   label="Meeting time"
   *   value={dateTime}
   *   onChange={setDateTime}
   *   isDisabled
   *   disabledMessage="You need the Editor role to change this"
   * />
   * ```
   */
  disabledMessage?: string;

  /**
   * The selected datetime in ISO 8601 format ("YYYY-MM-DDTHH:MM" or "YYYY-MM-DDTHH:MM:SS").
   */
  value?: ISODateTimeString;

  /**
   * Callback fired when the datetime changes.
   * Called with undefined when input is cleared.
   */
  onChange: (value: ISODateTimeString | undefined) => void;

  /**
   * Async action on change. Fires after onChange.
   */
  changeAction?: (value: ISODateTimeString | undefined) => void | Promise<void>;

  /**
   * Whether the input is in a loading state.
   * @default false
   */
  isLoading?: boolean;

  /**
   * Minimum selectable datetime in ISO format.
   * Constrains both date and time selection.
   */
  min?: ISODateTimeString;

  /**
   * Maximum selectable datetime in ISO format.
   * Constrains both date and time selection.
   */
  max?: ISODateTimeString;

  /**
   * Custom date constraint functions.
   * Date is disabled in the calendar if ANY function returns false.
   */
  dateConstraints?: ReadonlyArray<(date: Date) => boolean>;

  /**
   * Whether to include seconds in the time portion.
   * @default false
   */
  hasSeconds?: boolean;

  /**
   * Hour display format: '12h' with the locale's day period, or '24h'.
   * When unset, follows the `InternationalizationProvider` locale's hour
   * cycle (`en-US` 12-hour, `en-GB` 24-hour); a per-user preference rides on
   * the locale tag (`en-US-u-hc-h23`).
   * @default the locale's hour cycle
   */
  hourFormat?: DateTimeInputHourFormat;

  /**
   * Minute step for the time field. Astryx's typed field uses it for arrow-key
   * stepping. The default value permits the native time picker; a non-default
   * value retains the Astryx time field because iOS does not apply native
   * `step` as picker cadence. Ignored by the Astryx touch sheet.
   * @default 1
   */
  timeIncrement?: DateTimeInputTimeIncrement;

  /**
   * Minute cadence for a dropdown of preset times on the desktop time field. Set
   * it to turn the time field into a combobox listing every valid time at that
   * cadence (`60` gives the 12 AM - 11 PM list, `15` a quarter-hour list).
   *
   * Omitted, the desktop time field stays a plain text input: typed entry and
   * arrow-key stepping only, with no combobox semantics added to the
   * accessibility tree. Typed entry keeps working when the dropdown is on — the
   * list is a shortcut, not a restriction, so a time between two options can
   * still be typed.
   *
   * Setting this prop retains Astryx's typed/combobox time field even when
   * `nativePicker` otherwise selects native controls, because the OS picker has
   * no equivalent preset list. The Astryx touch sheet uses wheels instead.
   * Independent of `timeIncrement`, which governs arrow-key stepping.
   */
  timeOptionInterval?: DateTimeInputTimeOptionInterval;

  /**
   * Whether to show a clear button when a value is set.
   * @default false
   */
  hasClear?: boolean;

  /**
   * Placeholder text shown in the date portion when no date is selected.
   * @default "Select a date"
   */
  placeholder?: string;

  /**
   * Placeholder text shown in the time portion when no time is selected.
   * On touch, this appears in the closed time segment before a time is chosen.
   * @default "Select a time"
   */
  timePlaceholder?: string;

  /**
   * Accessible label for the time portion of the field. Defaults to
   * `"{label} time"` so it is tied to the field's own label and localizable,
   * rather than a hardcoded English "Time".
   */
  timeLabel?: string;

  /**
   * The size of the inputs.
   * @default 'md'
   */
  size?: DateTimeInputSize;

  /**
   * Status indicator for the input.
   */
  status?: InputStatus;

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
   * Number of months to display in the desktop calendar popover. Ignored on the
   * mobile touch sheet, whose Date panel always shows one swipe-paged month at a
   * time.
   * @default 1
   */
  numberOfMonths?: 1 | 2;

  /**
   * First day of week in the calendar. Accepts a number
   * (0 = Sunday … 6 = Saturday) or a three-letter day name ('sun'–'sat',
   * case-insensitive).
   * @default 0
   */
  weekStartsOn?: DayOfWeek | DayOfWeekName;

  /**
   * When date and time picking are handed to the browser/OS instead of Astryx's
   * calendar and time surfaces.
   *
   * - `'touch'` (default): native date and time inputs on a coarse primary
   *   pointer; Astryx's typed fields and popovers otherwise
   * - `'always'`: native date and time inputs wherever the browser supports them
   * - `'never'`: Astryx's own surfaces everywhere — typed fields on a fine
   *   pointer and the coordinated Date/Time bottom sheet on a coarse pointer
   *
   * Native pickers cannot express `numberOfMonths`, `weekStartsOn`,
   * `dateConstraints`, or `timeOptionInterval`. Calendar-only options are
   * ignored in native mode and constraints are enforced on commit. The native
   * time control is used for the default minute-precision contract; requesting
   * `hasSeconds`, a non-default `timeIncrement`, or `timeOptionInterval` keeps
   * Astryx's time field because iOS cannot represent those behaviors faithfully.
   * `min` / `max` are forwarded to each native control as hints and enforced in
   * JavaScript. `hourFormat` formats the closed value; the OS picker follows the
   * user's locale.
   *
   * @default 'touch'
   * @deprecated Use `presentation` (`spec:AST-043` FR3):
   * `'touch'` → `'adaptive-native'`, `'always'` → `'native'`,
   * `'never'` → `'adaptive-bottom-sheet'`. Still works exactly as released;
   * `presentation` wins when both are set.
   */
  nativePicker?: DateTimeInputNativePicker;

  /**
   * Which surfaces collect the date and time (`spec:AST-043` FR1). Every
   * value opens pickers; the typed-fields-only `'text-input'` belongs to
   * `TimeInput`.
   *
   * - `'popover'`: Astryx's typed fields + popovers on every pointer
   * - `'bottom-sheet'`: Astryx's bottom-sheet date/time wheels on every pointer
   * - `'native'`: browser/OS date and time pickers on every pointer, with no
   *   Astryx fallback (FR2)
   * - `'adaptive-bottom-sheet'`: popovers on a fine pointer, bottom sheet on
   *   a coarse pointer
   * - `'adaptive-native'` (default): popovers on a fine pointer, browser/OS
   *   pickers on a coarse pointer, keeping the released per-segment Astryx
   *   fallbacks (seconds, non-default `timeIncrement`, `timeOptionInterval`)
   *   where a native control cannot express the value (FR2)
   *
   * @default 'adaptive-native'
   */
  presentation?: DateTimeInputPresentation;
}

function splitDateTime(dt: ISODateTimeString | undefined): {
  date: ISODateString | undefined;
  time: ISOTimeString | undefined;
} {
  if (!dt) {
    return {date: undefined, time: undefined};
  }
  const tIndex = dt.indexOf('T');
  if (tIndex === -1) {
    return {date: dt as unknown as ISODateString, time: undefined};
  }
  return {
    date: dt.slice(0, tIndex) as ISODateString,
    time: dt.slice(tIndex + 1) as ISOTimeString,
  };
}

function combineDateTime(
  date: ISODateString | undefined,
  time: ISOTimeString | undefined,
): ISODateTimeString | undefined {
  if (!date || !time) {
    return undefined;
  }
  return `${date}T${time}` as ISODateTimeString;
}

const MINUTES_PER_DAY = 24 * 60;

function getDefaultTime(hasSeconds: boolean): ISOTimeString {
  const now = new Date();
  return formatISOTime(
    {hour: now.getHours(), minute: now.getMinutes(), second: now.getSeconds()},
    hasSeconds,
  );
}

/**
 * A combined date and time picker with side-by-side date input and
 * time input under a single label. The date input opens a calendar
 * popover; the time input supports typed entry and arrow-key adjustment.
 *
 * @example
 * ```
 * <DateTimeInput
 *   label="Meeting time"
 *   value={dateTime}
 *   onChange={setDateTime}
 * />
 * ```
 */
function PointerDateTimeField({
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
  hasSeconds = false,
  hourFormat = '12h',
  timeIncrement = 1,
  timeOptionInterval,
  hasClear = false,
  placeholder: placeholderFromProps,
  timePlaceholder: timePlaceholderFromProps,
  timeLabel,
  size: sizeProp,
  status,
  labelTooltip,
  numberOfMonths = 1,
  weekStartsOn,
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
}: DateTimeInputProps & {
  nativeMode?: 'off' | 'adaptive' | 'forced' | 'legacy';
}) {
  const {rest, container} = useFieldInputStyling('DateTimeInput', restProps, {
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
  const usesNativePicker = nativeMode !== 'off';
  // `forced` (`presentation="native"`, FR2): no Astryx fallback. `adaptive`
  // (`adaptive-native` coarse) and `legacy` (deprecated `always`):
  // iOS's native time picker has no seconds wheel, treats step as validation
  // rather than picker cadence, and cannot express our preset-time list, so
  // those keep the Astryx time field — exactly as released.
  const usesNativeTimePicker =
    nativeMode === 'forced' ||
    ((nativeMode === 'adaptive' || nativeMode === 'legacy') &&
      !hasSeconds &&
      timeIncrement === 1 &&
      timeOptionInterval === undefined);
  const isEffectivelyRequired = useResolvedRequired({isRequired, isOptional});
  // Speaks arrow-key stepping results through the persistent live regions:
  // stepping programmatically rewrites a plain textbox's value, which screen
  // readers do not announce on their own (WCAG 4.1.2).
  const announce = useAnnounce();
  const placeholder =
    placeholderFromProps ?? t('@astryx.dateTimeInput.placeholder');
  const timePlaceholder =
    timePlaceholderFromProps ?? t('@astryx.dateTimeInput.timePlaceholder');
  const size = useSize(sizeProp, 'md');
  const generatedID = useId();
  const dateInputId = idProp ?? generatedID;
  const fieldLabelID = useId();
  // A caller aria-labelledby names the date input together with the field's
  // own label.
  const controlLabelledBy =
    ariaLabelledByProp != null
      ? joinAriaIDs(fieldLabelID, ariaLabelledByProp)
      : undefined;
  const timeInputId = useId();
  const descriptionID = useId();
  const statusMessageID = useId();
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const mergedDateInputRef = useMergedRefs(ref, dateInputRef);
  const timeInputRef = useRef<HTMLInputElement | null>(null);
  const timeContainerRef = useRef<HTMLDivElement | null>(null);
  const calendarRef = useRef<CalendarHandle | null>(null);
  const lastFiredDateRef = useRef<ISODateString | undefined>(undefined);

  const [, startTransition] = useTransition();
  const [optimisticValue, setOptimisticValue] = useOptimistic(value);
  const isPendingChange = optimisticValue !== value;
  const isBusy = isLoading || isPendingChange;
  // The busy Spinner is decorative; this control announces its busy start
  // (spec:AST-086 FR8).
  useBusyAnnouncement(isBusy, t('@astryx.spinner.loading'), dateInputRef);
  // A native wheel emits several edits while it remains open. Disabling the
  // control after the first optimistic edit detaches the iOS picker, so pending
  // changeAction work stays interactive just like TouchDateTimeField. Explicit
  // loading still disables every surface.
  const isEffectivelyDisabled =
    isDisabled || isLoading || (!usesNativePicker && isPendingChange);

  // Disabled-reason tooltip. Disabled controls swallow pointer events, so the
  // tooltip listeners attach to the outer row container (which already exists)
  // and both the date and time inputs stay perceivable via aria-disabled
  // instead of the disabled attribute. Typing is blocked with readOnly and the
  // value mutation guards; calendar activation is blocked by the
  // isEffectivelyDisabled guards. Only the persistent isDisabled state (not the
  // transient busy state) surfaces a reason.
  const showsDisabledMessage = isDisabled && !!disabledMessage;
  const disabledMessageTooltip = useTooltip({
    placement: 'above',
    // The container div is not naturally focusable; focusin bubbles up from
    // the inputs, so always attach focus listeners.
    focusTrigger: 'always',
    isEnabled: showsDisabledMessage,
  });

  // DateTimeInput fixes its status presentation to the detached message box,
  // so the shared helper suppresses the on-field icon (the message box carries
  // its own leading glyph). Routed through the helper for consistency with the
  // rest of the bordered input family.
  const {statusIcon, describedBy: statusTooltipDescribedBy} =
    useInputStatusIcon({
      status,
      statusVariant: 'detached',
    });

  const ariaDescribedBy =
    [
      description ? descriptionID : null,
      status?.message ? statusMessageID : null,
      statusTooltipDescribedBy,
      showsDisabledMessage ? disabledMessageTooltip.describedBy : null,
      ariaDescribedByProp,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

  // Split min/max and current value
  const minParts = useMemo(() => splitDateTime(min), [min]);
  const maxParts = useMemo(() => splitDateTime(max), [max]);
  const valueParts = useMemo(
    () => splitDateTime(optimisticValue),
    [optimisticValue],
  );

  // Date constraints from min/max
  const calendarMin = minParts.date;
  const calendarMax = maxParts.date;
  const {isDateDisabled} = useCalendarConstraints({
    min: calendarMin,
    max: calendarMax,
    dateConstraints,
  });

  // Time constraints change depending on selected date
  const timeMin = useMemo(() => {
    if (!minParts.date || !minParts.time || !valueParts.date) {
      return undefined;
    }
    return valueParts.date === minParts.date ? minParts.time : undefined;
  }, [minParts.date, minParts.time, valueParts.date]);

  const timeMax = useMemo(() => {
    if (!maxParts.date || !maxParts.time || !valueParts.date) {
      return undefined;
    }
    return valueParts.date === maxParts.date ? maxParts.time : undefined;
  }, [maxParts.date, maxParts.time, valueParts.date]);

  // --- Date input state ---
  const [datePendingInput, setDatePendingInput] = useState<string | null>(null);

  const prevDateRef = useRef(valueParts.date);
  if (valueParts.date !== prevDateRef.current) {
    prevDateRef.current = valueParts.date;
    if (valueParts.date !== lastFiredDateRef.current) {
      lastFiredDateRef.current = undefined;
      if (datePendingInput !== null) {
        setDatePendingInput(null);
      }
    }
  }

  const dateDisplayValue =
    datePendingInput !== null
      ? datePendingInput
      : valueParts.date && /^\d{4}-\d{2}-\d{2}$/.test(valueParts.date)
        ? plainDateFormat(
            plainDateFromISO(valueParts.date),
            DATE_FORMAT_LONG,
            locale,
          )
        : '';

  const isDateInputValid =
    datePendingInput === null || !datePendingInput.trim()
      ? true
      : parseDateInput(datePendingInput, locale) !== null;

  // --- Time input state ---
  const [timePendingInput, setTimePendingInput] = useState<string | null>(null);
  const [isTimeFocused, setIsTimeFocused] = useState(false);
  // Native date and time are separate OS pickers. Hold a time chosen before the
  // date exists, then combine it when the date picker commits.
  const [nativeTimeDraft, setNativeTimeDraft] = useState<
    ISOTimeString | undefined
  >(undefined);
  const previousNativeValueRef = useRef(optimisticValue);
  if (optimisticValue !== previousNativeValueRef.current) {
    previousNativeValueRef.current = optimisticValue;
    if (nativeTimeDraft !== undefined) {
      setNativeTimeDraft(undefined);
    }
  }
  const nativeTimeValue = nativeTimeDraft ?? valueParts.time;

  const formatDisplayTime = useCallback(
    (time: ISOTimeString, includeSeconds: boolean) =>
      formatLocaleTime(time, locale, hourFormat, includeSeconds),
    [locale, hourFormat],
  );

  const timeDisplayValue = useMemo(() => {
    if (timePendingInput !== null) {
      return timePendingInput;
    }
    return valueParts.time
      ? formatDisplayTime(valueParts.time, hasSeconds)
      : '';
  }, [timePendingInput, valueParts.time, formatDisplayTime, hasSeconds]);

  const isTimeInputValid = useMemo(() => {
    if (timePendingInput === null || !timePendingInput.trim()) {
      return true;
    }
    const parsed = parseLocaleTime(timePendingInput, locale, hasSeconds);
    if (!parsed) {
      return false;
    }
    return isTimeInRange(parsed, timeMin, timeMax);
  }, [timePendingInput, locale, hasSeconds, timeMin, timeMax]);

  const resolvedTimePlaceholder = useMemo(() => {
    if (isTimeFocused && !timeDisplayValue) {
      return hourFormat === '12h'
        ? t('@astryx.dateTimeInput.timeHint12h')
        : t('@astryx.dateTimeInput.timeHint24h');
    }
    return timePlaceholder;
  }, [isTimeFocused, timeDisplayValue, hourFormat, timePlaceholder, t]);

  // The time field's own accessible name. The option list is named from this
  // rather than from `label`, so a consumer-supplied timeLabel renames both
  // together instead of leaving the list announcing the old name.
  const resolvedTimeLabel =
    timeLabel ?? t('@astryx.dateTimeInput.timeSuffix', {label});

  // --- Preset time options (#2727) ---
  // Opt-in: without timeOptionInterval the time field keeps exactly the
  // semantics it shipped with — a plain text input, no combobox role, no
  // second listbox in the accessibility tree.
  const hasTimeOptions =
    !usesNativeTimePicker && timeOptionInterval !== undefined;

  const timeOptions = useMemo(() => {
    if (!hasTimeOptions || timeOptionInterval === undefined) {
      return [];
    }
    const options: {time: ISOTimeString; label: string}[] = [];
    for (
      let minutes = 0;
      minutes < MINUTES_PER_DAY;
      minutes += timeOptionInterval
    ) {
      const time = formatISOTime(
        {
          hour: Math.floor(minutes / 60),
          minute: minutes % 60,
          second: 0,
        },
        hasSeconds,
      );
      // The same bound the typed path enforces, so the list can never offer a
      // time that typing the identical string would reject.
      if (!isTimeInRange(time, timeMin, timeMax)) {
        continue;
      }
      options.push({time, label: formatDisplayTime(time, hasSeconds)});
    }
    return options;
  }, [
    hasTimeOptions,
    timeOptionInterval,
    hasSeconds,
    timeMin,
    timeMax,
    formatDisplayTime,
  ]);

  // --- Unified change handler ---
  const fireChange = useCallback(
    (newValue: ISODateTimeString | undefined) => {
      if (isEffectivelyDisabled) {
        return;
      }
      onChange(newValue);
      if (changeAction) {
        startTransition(async () => {
          setOptimisticValue(newValue);
          await changeAction(newValue);
        });
      }
    },
    [
      isEffectivelyDisabled,
      onChange,
      changeAction,
      startTransition,
      setOptimisticValue,
    ],
  );

  // --- Popover ---
  const popover = usePopover({
    dialogLabel: t('@astryx.dateTimeInput.dialogLabel'),
    closeButtonLabel: t('@astryx.dateInput.closeCalendar'),
    // Return focus to the date input when the calendar closes — but only when
    // the dismiss left focus detached (Escape, or a click on non-focusable
    // empty space), which the focus trap can't restore on its own. A native
    // popover="auto" light-dismiss fires synchronously with the pointer event
    // that moved focus, so if the user clicked another control — the time
    // input, the clear button, another field, anywhere — focus has already
    // landed there; reclaiming it would fight their click.
    onHide: () => {
      if (isFocusDetached()) {
        dateInputRef.current?.focus();
      }
    },
  });

  const handleCalendarToggle = useCallback(() => {
    if (!isEffectivelyDisabled) {
      if (popover.isOpen) {
        popover.hide();
      } else {
        popover.show();
      }
    }
  }, [isEffectivelyDisabled, popover]);

  const handleDateInputClick = useCallback(() => {
    if (!isEffectivelyDisabled && !popover.isOpen) {
      popover.show({skipAutoFocus: true});
    }
  }, [isEffectivelyDisabled, popover]);

  // --- Date handlers ---
  const handleDateChange = useCallback(
    (newDate: ISODateString, source: 'calendar' | 'input') => {
      const currentTime =
        valueParts.time ?? nativeTimeDraft ?? getDefaultTime(hasSeconds);

      let effectiveTime = currentTime;
      if (minParts.date && newDate === minParts.date && minParts.time) {
        if (!isTimeInRange(effectiveTime, minParts.time, undefined)) {
          effectiveTime = minParts.time;
        }
      }
      if (maxParts.date && newDate === maxParts.date && maxParts.time) {
        if (!isTimeInRange(effectiveTime, undefined, maxParts.time)) {
          effectiveTime = maxParts.time;
        }
      }

      const combined = combineDateTime(newDate, effectiveTime);
      if (combined) {
        fireChange(combined);
      }
      if (source === 'calendar') {
        setDatePendingInput(null);
        popover.hide();
      }
    },
    [
      valueParts.time,
      nativeTimeDraft,
      hasSeconds,
      minParts,
      maxParts,
      fireChange,
      popover,
    ],
  );

  const handleNativeDateChange = useCallback(
    (newDate: ISODateString | undefined) => {
      if (newDate === undefined) {
        fireChange(undefined);
        return;
      }
      handleDateChange(newDate, 'input');
    },
    [fireChange, handleDateChange],
  );

  const handleNativeTimeChange = useCallback(
    (newTime: ISOTimeString | undefined) => {
      if (newTime === undefined) {
        setNativeTimeDraft(undefined);
        if (optimisticValue !== undefined) {
          fireChange(undefined);
        }
        return;
      }
      if (valueParts.date) {
        const combined = combineDateTime(valueParts.date, newTime);
        if (combined) {
          fireChange(combined);
        }
        return;
      }
      // A datetime cannot be emitted until its date exists, but the OS time
      // picker is independently reachable. Preserve this draft for the date
      // commit instead of making the user's first choice disappear.
      setNativeTimeDraft(newTime);
    },
    [fireChange, optimisticValue, valueParts.date],
  );

  const handleDateInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // The input is never natively disabled (AST-085 FR1), so
      // guard value mutation explicitly (readOnly also blocks typing).
      if (isEffectivelyDisabled) {
        return;
      }
      const text = e.target.value;
      setDatePendingInput(text);

      const parsed = parseDateInput(text, locale);
      if (
        parsed &&
        plainDateToISO(parsed) !== valueParts.date &&
        !isDateDisabled(parsed)
      ) {
        const parsedISO = plainDateToISO(parsed);
        lastFiredDateRef.current = parsedISO;
        handleDateChange(parsedISO, 'input');
        calendarRef.current?.navigateTo(parsedISO);
      }
    },
    [
      valueParts.date,
      isDateDisabled,
      handleDateChange,
      isEffectivelyDisabled,
      locale,
    ],
  );

  const commitDatePendingInput = useCallback(() => {
    if (datePendingInput === null) {
      return;
    }

    if (!datePendingInput.trim()) {
      if (value !== undefined) {
        fireChange(undefined);
      }
      setDatePendingInput(null);
      return;
    }

    const parsed = parseDateInput(datePendingInput, locale);
    if (parsed && !isDateDisabled(parsed)) {
      const parsedISO = plainDateToISO(parsed);
      if (parsedISO !== valueParts.date) {
        handleDateChange(parsedISO, 'input');
      }
    }
    setDatePendingInput(null);
  }, [
    datePendingInput,
    value,
    valueParts.date,
    fireChange,
    isDateDisabled,
    handleDateChange,
    locale,
  ]);

  const handleDateBlur = useCallback(() => {
    commitDatePendingInput();
  }, [commitDatePendingInput]);

  const handleDateKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Guard the composing keydown (fires before compositionend): an IME uses
      // Enter to commit the candidate and Escape to cancel it, so without this
      // a CJK user committing a syllable with Enter would commit the pending
      // date instead. See utils/ime.ts.
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
        commitDatePendingInput();
      }
    },
    [popover, commitDatePendingInput, isEffectivelyDisabled],
  );

  // --- Time-option popover (#2727) ---
  const timeListboxId = useId();
  const [highlightedTimeIndex, setHighlightedTimeIndex] = useState(-1);

  // With popover="auto", showing the popover between pointerdown and
  // pointerup/click lets the browser's light-dismiss treat that same click as
  // "outside" and close it again. Defer the show past the click, as
  // BaseTypeahead does for the same reason.
  const timePointerActiveRef = useRef(false);

  // Whether the highlight is still the one typing derived, or the user has
  // since moved it themselves. Enter honours typed text only in the former
  // case — otherwise the field would commit something other than the option
  // it is showing as active.
  const timeHighlightFollowsTypingRef = useRef(true);

  const markTimePointerActive = useCallback(() => {
    timePointerActiveRef.current = true;
    document.addEventListener(
      'click',
      () => {
        timePointerActiveRef.current = false;
      },
      {once: true},
    );
  }, []);

  const timePopover = usePopover({
    hasLightDismiss: true,
    hasCloseButton: false,
    hasAutoFocus: false,
    // The popup's own role="listbox" carries the semantics; the input keeps
    // DOM focus, so announcing a dialog here would misrepresent it.
    role: 'none',
    onHide: () => setHighlightedTimeIndex(-1),
  });

  // Anchor the list to the time wrapper, not the date input the field's own
  // trigger ref points at.
  useEffect(() => {
    if (!hasTimeOptions) {
      return;
    }
    const el = timeContainerRef.current;
    if (el) {
      timePopover.triggerRef(el);
    }
    return () => {
      timePopover.triggerRef(null);
    };
  }, [timePopover, hasTimeOptions]);

  const timeOptionId = useCallback(
    (index: number) => `${timeListboxId}-option-${index}`,
    [timeListboxId],
  );

  // A field can go disabled or busy while its list is open — a changeAction
  // starting elsewhere in the form is enough. Leave it up and the dropdown
  // hangs over a control that no longer accepts input.
  // The same applies to a list that empties after it opened, which a narrowing
  // min/max window does. An open-but-empty list gates the keyboard switch off,
  // so the arrows quietly fall back to stepping the value instead.
  useEffect(() => {
    if (
      timePopover.isOpen &&
      (isEffectivelyDisabled || timeOptions.length === 0)
    ) {
      timePopover.hide();
    }
  }, [isEffectivelyDisabled, timeOptions.length, timePopover]);

  // The option list can shrink under an open popover — min/max tighten when
  // the date moves onto a boundary day, or the cadence prop changes. A stale
  // index past the new end shows no highlight at all and makes the arrow keys
  // look dead until the user walks it back into range.
  // Clamped as it is read rather than synced through an effect: no extra
  // render, and the index can never point past the end even for the paint
  // where the list shrank.
  const activeTimeIndex =
    highlightedTimeIndex > timeOptions.length - 1
      ? timeOptions.length - 1
      : highlightedTimeIndex;

  // Keep the active option visible; hover highlights never scroll (#6077).
  // Both sides live in useHighlightedOptionScroll.
  const highlightTimeOnHover = useHighlightedOptionScroll({
    isOpen: timePopover.isOpen,
    highlightedIndex: activeTimeIndex,
    setHighlightedIndex: setHighlightedTimeIndex,
    getOptionId: timeOptionId,
    itemCount: timeOptions.length,
  });

  /**
   * The selected time in the same shape the options carry. splitDateTime slices
   * whatever follows the `T`, so a caller passing `14:00:00` with hasSeconds
   * off leaves `"14:00:00"` against options of `"14:00"` — comparing raw would
   * mark nothing selected, silently.
   */
  const selectedOptionTime = useMemo(() => {
    if (!valueParts.time) {
      return undefined;
    }
    const parsed = parseISOTime(valueParts.time);
    return parsed ? formatISOTime(parsed, hasSeconds) : undefined;
  }, [valueParts.time, hasSeconds]);

  /**
   * Index of the option at or immediately before `time`, so opening on a value
   * that is not itself an option (13:07 in a 15-minute list) still lands the
   * highlight somewhere sensible instead of nowhere.
   */
  const closestOptionIndex = useCallback(
    (time: ISOTimeString | undefined) => {
      if (timeOptions.length === 0) {
        return -1;
      }
      // No time yet — the state a field lands in once a date is picked. The
      // list still opens on the first option, per the APG listbox pattern;
      // leaving it inactive made ArrowUp and Enter do nothing at all.
      if (!time) {
        return 0;
      }
      let candidate = -1;
      for (let i = 0; i < timeOptions.length; i++) {
        if (timeOptions[i].time <= time) {
          candidate = i;
        } else {
          break;
        }
      }
      // A value below every option (min pushes the list past it) still gets the
      // first option rather than an empty highlight.
      return candidate === -1 ? 0 : candidate;
    },
    [timeOptions],
  );

  const showTimeOptions = useCallback(() => {
    if (
      !hasTimeOptions ||
      isEffectivelyDisabled ||
      timePopover.isOpen ||
      // A min/max window narrower than the cadence survives no option at all.
      // Opening on that would show an empty panel with nothing to pick.
      timeOptions.length === 0
    ) {
      return;
    }
    setHighlightedTimeIndex(closestOptionIndex(selectedOptionTime));
    // useInputContainer routes wrapper clicks through input.click() once the
    // input advertises a popup, and a programmatic click does not focus. The
    // input must hold DOM focus or aria-activedescendant announces nothing.
    timeInputRef.current?.focus();
    if (timePointerActiveRef.current) {
      document.addEventListener(
        'click',
        () =>
          requestAnimationFrame(() => timePopover.show({skipAutoFocus: true})),
        {once: true},
      );
    } else {
      timePopover.show({skipAutoFocus: true});
    }
  }, [
    hasTimeOptions,
    isEffectivelyDisabled,
    timePopover,
    timeOptions.length,
    closestOptionIndex,
    selectedOptionTime,
  ]);

  /**
   * The single commit path for a time chosen from the list. Deliberately the
   * same shape as the typed path: same range check, same date requirement, so
   * picking 9:00 AM and typing "9:00 AM" are indistinguishable downstream.
   */
  const commitTimeOption = useCallback(
    (time: ISOTimeString) => {
      if (isEffectivelyDisabled || !isTimeInRange(time, timeMin, timeMax)) {
        return;
      }
      setTimePendingInput(null);
      // Compared against the normalised time, the same one the selected marker
      // uses. Comparing the raw value instead made clicking the option that
      // renders as selected emit a change, whenever the value carried seconds
      // the field does not display.
      if (time !== selectedOptionTime && valueParts.date) {
        const combined = combineDateTime(valueParts.date, time);
        if (combined) {
          fireChange(combined);
        }
      }
      timePopover.hide();
      timeInputRef.current?.focus();
    },
    [
      isEffectivelyDisabled,
      timeMin,
      timeMax,
      selectedOptionTime,
      valueParts.date,
      fireChange,
      timePopover,
    ],
  );

  // --- Time handlers ---
  const handleTimeInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // The input is never natively disabled (AST-085 FR1), so
      // guard value mutation explicitly (readOnly also blocks typing).
      if (isEffectivelyDisabled) {
        return;
      }
      const text = e.target.value;
      setTimePendingInput(text);

      const parsed = parseLocaleTime(text, locale, hasSeconds);

      // Typing narrows nothing — free-form entry is the contract, and a time
      // between two options must stay reachable. The list instead follows the
      // typed value so Enter lands somewhere the user expects.
      if (timePopover.isOpen && parsed) {
        timeHighlightFollowsTypingRef.current = true;
        setHighlightedTimeIndex(closestOptionIndex(parsed));
      }

      if (
        parsed &&
        isTimeInRange(parsed, timeMin, timeMax) &&
        parsed !== valueParts.time
      ) {
        if (valueParts.date) {
          const combined = combineDateTime(valueParts.date, parsed);
          if (combined) {
            fireChange(combined);
          }
        }
      }
    },
    [
      locale,
      hasSeconds,
      timeMin,
      timeMax,
      valueParts.time,
      valueParts.date,
      fireChange,
      isEffectivelyDisabled,
      timePopover.isOpen,
      closestOptionIndex,
    ],
  );

  const handleTimeFocus = useCallback(() => {
    // A disabled/busy input stays focusable (via aria-disabled) so its reason
    // is discoverable, but it must not present editing affordances — keep the
    // static placeholder rather than swapping in the format hint.
    if (isEffectivelyDisabled) {
      return;
    }
    setIsTimeFocused(true);
  }, [isEffectivelyDisabled]);

  const handleTimeBlur = useCallback(
    (e: FocusEvent<HTMLInputElement>) => {
      setIsTimeFocused(false);

      // Native light dismiss only fires on outside clicks and Escape, so a focus
      // move that is neither — Tab handled elsewhere, or a programmatic focus —
      // would strand the listbox open in the top layer. Focus landing inside the
      // field or the popup itself is not a leave. Mirrors BaseTypeahead.
      if (timePopover.isOpen) {
        const next = e.relatedTarget as Node | null;
        const popoverEl = next ? document.getElementById(timePopover.id) : null;
        if (
          !next ||
          !(
            timeContainerRef.current?.contains(next) ||
            popoverEl?.contains(next)
          )
        ) {
          timePopover.hide();
        }
      }

      if (timePendingInput === null) {
        return;
      }

      if (!timePendingInput.trim()) {
        // Empty time: revert display to previous value (don't emit partial datetime)
        setTimePendingInput(null);
        return;
      }

      const parsed = parseLocaleTime(timePendingInput, locale, hasSeconds);
      if (parsed && isTimeInRange(parsed, timeMin, timeMax)) {
        if (parsed !== valueParts.time && valueParts.date) {
          const combined = combineDateTime(valueParts.date, parsed);
          if (combined) {
            fireChange(combined);
          }
        }
      }
      setTimePendingInput(null);
    },
    [
      timePendingInput,
      locale,
      hasSeconds,
      timeMin,
      timeMax,
      valueParts,
      fireChange,
      timePopover,
    ],
  );

  const handleTimeKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      // ArrowUp/ArrowDown step the time and preventDefault; an IME candidate
      // window uses those same arrows to navigate candidates, so guard the
      // composing keydown (fires before compositionend) to avoid stealing them
      // mid-composition. See utils/ime.ts.
      // A disabled or busy field steps nothing, so it announces nothing (FR2).
      if (isImeKeyEvent(e.nativeEvent) || isEffectivelyDisabled) {
        return;
      }

      // The dropdown claims the arrow keys only while it is open. Closed, they
      // keep stepping the value by timeIncrement exactly as they always have —
      // that behaviour is documented and tested, so the list borrows Alt+Arrow
      // Down (the APG "open without moving" binding) to open instead.
      if (hasTimeOptions && !isEffectivelyDisabled) {
        if (e.key === 'Escape' && timePopover.isOpen) {
          e.preventDefault();
          timePopover.hide();
          return;
        }

        if (e.key === 'ArrowDown' && e.altKey) {
          e.preventDefault();
          // A keyboard open is never mid-click, so clear the deferral flag. A
          // press that ended without a click would otherwise leave it set and
          // hold every later open hostage to the next click anywhere.
          timePointerActiveRef.current = false;
          showTimeOptions();
          return;
        }

        if (timePopover.isOpen && timeOptions.length > 0) {
          switch (e.key) {
            case 'ArrowDown':
              e.preventDefault();
              timeHighlightFollowsTypingRef.current = false;
              setHighlightedTimeIndex(
                activeTimeIndex < timeOptions.length - 1
                  ? activeTimeIndex + 1
                  : activeTimeIndex,
              );
              return;
            case 'ArrowUp':
              e.preventDefault();
              timeHighlightFollowsTypingRef.current = false;
              setHighlightedTimeIndex(
                activeTimeIndex > 0 ? activeTimeIndex - 1 : activeTimeIndex,
              );
              return;
            case 'Home':
              e.preventDefault();
              timeHighlightFollowsTypingRef.current = false;
              setHighlightedTimeIndex(0);
              return;
            case 'End':
              e.preventDefault();
              timeHighlightFollowsTypingRef.current = false;
              setHighlightedTimeIndex(timeOptions.length - 1);
              return;
            case 'Enter': {
              e.preventDefault();
              // Typed text wins over the highlight. The highlight only tracks
              // the option at or before what was typed, so committing it here
              // would round 1:07 PM down to 1:00 PM and discard the entry.
              const typed =
                timeHighlightFollowsTypingRef.current &&
                timePendingInput !== null
                  ? parseLocaleTime(timePendingInput, locale, hasSeconds)
                  : null;
              const option = timeOptions[activeTimeIndex];
              if (typed) {
                commitTimeOption(typed);
              } else if (option) {
                commitTimeOption(option.time);
              }
              return;
            }
            case 'Tab':
              // Let focus leave; blur commits any typed text as usual.
              timePopover.hide();
              return;
            default:
              break;
          }
        }
      }

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();

        let currentTime = valueParts.time;
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

        const delta = e.key === 'ArrowUp' ? timeIncrement : -timeIncrement;
        const newTime = adjustTime(currentTime, delta, hasSeconds);

        if (isTimeInRange(newTime, timeMin, timeMax) && valueParts.date) {
          const combined = combineDateTime(valueParts.date, newTime);
          if (combined) {
            fireChange(combined);
            // Screen readers do not announce the programmatic value rewrite,
            // so speak the new time explicitly (WCAG 4.1.2).
            announce(formatDisplayTime(newTime, hasSeconds));
          }
        }
      }
    },
    [
      valueParts,
      locale,
      hasSeconds,
      timeIncrement,
      timeMin,
      timeMax,
      fireChange,
      announce,
      formatDisplayTime,
      hasTimeOptions,
      isEffectivelyDisabled,
      timePopover,
      timeOptions,
      activeTimeIndex,
      timePendingInput,
      showTimeOptions,
      commitTimeOption,
    ],
  );

  // --- Clear ---
  const handleClear = useCallback(
    (e?: React.MouseEvent<HTMLButtonElement>) => {
      setNativeTimeDraft(undefined);
      fireChange(undefined);
      if (!usesNativePicker) {
        if (!e || e.detail === 0) {
          dateInputRef.current?.focus();
        } else {
          // Defer focus restoration past the button's unmount task so iOS Safari
          // and touch browsers don't jump the page scroll to 0 on tap.
          requestAnimationFrame(() => {
            dateInputRef.current?.focus({preventScroll: true});
          });
        }
      }
    },
    [fireChange, usesNativePicker],
  );

  // Focus time input when clicking wrapper padding/icon
  const {onClick: handleTimeWrapperClick, onMouseUp: handleTimeWrapperMouseUp} =
    useInputContainer({
      containerRef: timeContainerRef,
      inputRef: timeInputRef,
      disabled: isEffectivelyDisabled,
    });

  return (
    <Field
      {...container}
      label={label}
      isLabelHidden={isLabelHidden}
      description={description}
      inputID={dateInputId}
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
      labelTooltip={labelTooltip}
      statusVariant="detached"
      width={width}>
      <div
        ref={disabledMessageTooltip.ref}
        {...mergeProps(
          themeProps('date-time-input', {
            size,
            status: status?.type ?? null,
            disabled: isDisabled ? 'disabled' : null,
          }),
          stylex.props(
            styles.row,
            usesNativePicker && styles.nativeRow,
            controlXstyle,
          ),
          controlClassName,
          controlStyle,
        )}>
        {/* Date input */}
        <div
          ref={usesNativePicker ? undefined : popover.triggerRef}
          {...mergeProps(
            themeProps('date-time-input-date-segment', {
              size,
              status: status?.type ?? null,
            }),
            stylex.props(
              inputWrapperStyles.base,
              sizeStyles[size],
              styles.dateWrapper,
              isEffectivelyDisabled && inputWrapperStyles.disabled,
              isEffectivelyDisabled && styles.disabledFocusRing,
              status && inputStatusBorderStyles[status.type],
              status &&
                !isEffectivelyDisabled &&
                inputStatusHoverShadowStyles[status.type],
              status && inputStatusFocusWithinStyles[status.type],
            ),
          )}>
          {usesNativePicker ? (
            <NativeDateSegment
              id={dateInputId}
              inputRef={mergedDateInputRef}
              value={valueParts.date}
              onChange={handleNativeDateChange}
              placeholder={placeholder}
              min={calendarMin}
              max={calendarMax}
              isDateDisabled={isDateDisabled}
              isEffectivelyDisabled={isEffectivelyDisabled}
              isFocusableDisabled
              isEffectivelyRequired={isEffectivelyRequired}
              isBusy={isBusy}
              statusType={status?.type}
              ariaDescribedBy={ariaDescribedBy}
              controlProps={{
                ...controlProps,
                'aria-labelledby': controlLabelledBy,
                onBlur: onBlurProp,
                onClick: isEffectivelyDisabled ? undefined : onClickProp,
                onKeyDown: onKeyDownProp,
              }}
            />
          ) : (
            <>
              <button
                type="button"
                onClick={handleCalendarToggle}
                aria-disabled={isEffectivelyDisabled || undefined}
                // A tab stop while disabled too, so it carries the reason (FR5).
                aria-describedby={
                  showsDisabledMessage
                    ? disabledMessageTooltip.describedBy
                    : undefined
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
                  // Stable theme target on the calendar toggle glyph, so a theme
                  // can restyle just this icon (color, size, hover) — and each
                  // open/closed state — via `defineTheme`, mirroring
                  // `date-input-toggle-icon`. Same-element rules in
                  // @layer astryx-theme win over the icon's own base color/size,
                  // which a segment-level target could not reach.
                  {...themeProps('date-time-input-toggle-icon', {
                    state: popover.isOpen ? 'expanded' : 'collapsed',
                  })}
                />
              </button>
              <input
                {...controlProps}
                ref={mergedDateInputRef}
                id={dateInputId}
                type="text"
                role="combobox"
                value={dateDisplayValue}
                onChange={handleDateInputChange}
                onBlur={chainEventHandlers(handleDateBlur, onBlurProp)}
                onClick={
                  isEffectivelyDisabled
                    ? undefined
                    : chainEventHandlers(handleDateInputClick, onClickProp)
                }
                onKeyDown={chainEventHandlers(handleDateKeyDown, onKeyDownProp)}
                aria-labelledby={controlLabelledBy}
                placeholder={placeholder}
                aria-disabled={isEffectivelyDisabled ? 'true' : undefined}
                readOnly={isEffectivelyDisabled || undefined}
                aria-describedby={ariaDescribedBy}
                aria-required={isEffectivelyRequired ? 'true' : undefined}
                aria-invalid={
                  status?.type === 'error' || !isDateInputValid
                    ? 'true'
                    : undefined
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
                  !isDateInputValid && styles.inputInvalid,
                )}
              />
              {/*
            Live region announcing invalid typed date input to assistive
            technology. The value silently reverts on blur, so without this a
            screen-reader user would get no feedback that their entry was
            rejected (WCAG 3.3.1).
          */}
              <VisuallyHidden as="div" role="alert" aria-live="assertive">
                {!isDateInputValid ? t('@astryx.dateInput.invalidDate') : ''}
              </VisuallyHidden>
            </>
          )}
          {hasClear && value !== undefined && !isEffectivelyDisabled && (
            <InputClearButton
              label={t('@astryx.dateInput.clear', {label})}
              onClick={handleClear}
            />
          )}
          {isBusy && <Spinner size="sm" aria-hidden="true" />}
          {statusIcon}
        </div>

        {/* Time input */}
        <div
          ref={timeContainerRef}
          onClick={usesNativeTimePicker ? undefined : handleTimeWrapperClick}
          onMouseUp={
            usesNativeTimePicker ? undefined : handleTimeWrapperMouseUp
          }
          // On the wrapper, not just the input: clicking the clock icon or the
          // padding is routed to the input as a synthetic click, which would
          // otherwise open the list mid-gesture and let light dismiss eat it.
          onPointerDown={hasTimeOptions ? markTimePointerActive : undefined}
          {...mergeProps(
            themeProps('date-time-input-time-segment', {
              size,
              status: status?.type ?? null,
            }),
            stylex.props(
              inputWrapperStyles.base,
              sizeStyles[size],
              styles.timeWrapper,
              isEffectivelyDisabled && inputWrapperStyles.disabled,
              isEffectivelyDisabled && styles.disabledFocusRing,
              status && inputStatusBorderStyles[status.type],
              status &&
                !isEffectivelyDisabled &&
                inputStatusHoverShadowStyles[status.type],
              status && inputStatusFocusWithinStyles[status.type],
            ),
          )}>
          {usesNativeTimePicker ? (
            <NativeTimeSegment
              id={timeInputId}
              inputRef={timeInputRef}
              value={nativeTimeValue}
              onChange={handleNativeTimeChange}
              placeholder={timePlaceholder}
              inputLabel={resolvedTimeLabel}
              openPickerLabel={t('@astryx.dateTimeInput.openTimePicker', {
                label: resolvedTimeLabel,
              })}
              iconThemeProps={themeProps('date-time-input-clock-icon')}
              min={timeMin}
              max={timeMax}
              hourFormat={hourFormat}
              isEffectivelyDisabled={isEffectivelyDisabled}
              isFocusableDisabled
              isEffectivelyRequired={isEffectivelyRequired}
              isBusy={isBusy}
              statusType={status?.type}
              ariaDescribedBy={ariaDescribedBy}
            />
          ) : (
            <>
              <div {...stylex.props(styles.icon)}>
                <Icon
                  icon="clock"
                  size="sm"
                  color="secondary"
                  // Stable theme target on the leading clock glyph, so a theme can
                  // restyle just this icon (color, size) via `defineTheme`. The
                  // time segment has no toggle button — the clock is a static
                  // leading affordance — so this carries no interactive state.
                  {...themeProps('date-time-input-clock-icon')}
                />
              </div>
              <input
                ref={timeInputRef}
                id={timeInputId}
                type="text"
                value={timeDisplayValue}
                onChange={handleTimeInputChange}
                onFocus={handleTimeFocus}
                onBlur={handleTimeBlur}
                onKeyDown={handleTimeKeyDown}
                onClick={hasTimeOptions ? showTimeOptions : undefined}
                onPointerDown={
                  hasTimeOptions ? markTimePointerActive : undefined
                }
                placeholder={resolvedTimePlaceholder}
                // Combobox semantics appear only with the dropdown opted in, so a
                // field without it keeps a single combobox on the date half.
                role={hasTimeOptions ? 'combobox' : undefined}
                aria-expanded={hasTimeOptions ? timePopover.isOpen : undefined}
                aria-controls={
                  hasTimeOptions && timePopover.isOpen
                    ? timeListboxId
                    : undefined
                }
                aria-autocomplete={hasTimeOptions ? 'list' : undefined}
                aria-activedescendant={
                  hasTimeOptions &&
                  timePopover.isOpen &&
                  activeTimeIndex >= 0 &&
                  activeTimeIndex < timeOptions.length
                    ? timeOptionId(activeTimeIndex)
                    : undefined
                }
                aria-disabled={isEffectivelyDisabled ? 'true' : undefined}
                readOnly={isEffectivelyDisabled || undefined}
                aria-label={resolvedTimeLabel}
                aria-describedby={ariaDescribedBy}
                aria-required={isEffectivelyRequired ? 'true' : undefined}
                aria-invalid={
                  status?.type === 'error' || !isTimeInputValid
                    ? 'true'
                    : undefined
                }
                aria-busy={isBusy || undefined}
                {...stylex.props(
                  styles.input,
                  isEffectivelyDisabled && styles.inputDisabled,
                  !isTimeInputValid && styles.inputInvalid,
                )}
              />
              {/*
                Live region announcing invalid typed time input to assistive
                technology (WCAG 3.3.1).
              */}
              <VisuallyHidden as="div" role="alert" aria-live="assertive">
                {!isTimeInputValid ? t('@astryx.timeInput.invalidTime') : ''}
              </VisuallyHidden>
            </>
          )}
        </div>
      </div>

      {!usesNativePicker &&
        popover.render(
          // Mounted only while open, like the time list below; the calendar
          // opens on the current value.
          !popover.isOpen ? null : (
            <Calendar
              handleRef={calendarRef}
              mode="single"
              value={valueParts.date ?? null}
              onChange={(d: ISODateString) => handleDateChange(d, 'calendar')}
              min={calendarMin}
              max={calendarMax}
              dateConstraints={dateConstraints}
              numberOfMonths={numberOfMonths}
              weekStartsOn={weekStartsOn}
            />
          ),
          {placement: 'below', alignment: 'start'},
        )}

      {hasTimeOptions &&
        timePopover.render(
          // The layer renders its children open or closed, so mount the list
          // only while it is open — a 5-minute cadence is 288 nodes that would
          // otherwise sit in the DOM of every opted-in field for its lifetime.
          !timePopover.isOpen ? null : (
            <div
              id={timeListboxId}
              role="listbox"
              aria-label={t('@astryx.dateTimeInput.timeOptionsLabel', {
                label: resolvedTimeLabel,
              })}
              {...mergeProps(
                themeProps('date-time-input-time-listbox'),
                stylex.props(styles.timeListbox),
              )}>
              {timeOptions.map((option, index) => {
                const isSelected = option.time === selectedOptionTime;
                return (
                  <div
                    key={option.time}
                    id={timeOptionId(index)}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={-1}
                    // Pointer-down commit: the input must not lose focus to the
                    // option, or blur would fire its own commit first.
                    onPointerDown={e => e.preventDefault()}
                    onClick={() => commitTimeOption(option.time)}
                    onMouseEnter={() => highlightTimeOnHover(index)}
                    {...mergeProps(
                      themeProps('date-time-input-time-option'),
                      stylex.props(
                        styles.timeOption,
                        timeOptionSizeStyles[size],
                        index === activeTimeIndex &&
                          styles.timeOptionHighlighted,
                        isSelected && styles.timeOptionSelected,
                      ),
                    )}>
                    {option.label}
                  </div>
                );
              })}
            </div>
          ),
          {placement: 'below', alignment: 'start'},
        )}

      {showsDisabledMessage &&
        disabledMessageTooltip.renderTooltip(disabledMessage)}
    </Field>
  );
}

PointerDateTimeField.displayName = 'PointerDateTimeField';

/**
 * A combined date and time picker whose `presentation` prop chooses both
 * surfaces (`spec:AST-043`). Native modes use OS-owned date and time controls
 * in Astryx field chrome; the deprecated `nativePicker` maps to the same
 * surfaces (FR3).
 *
 * Base props (`ref`, `id`, `data-*`, `aria-*`, DOM event handlers) go to the date input.
 * A DOM handler runs after the component's own handler for the same event
 * and still receives events the component handled, even ones it called
 * `preventDefault` on, so it cannot cancel built-in behavior.
 */
export function DateTimeInput(props: DateTimeInputProps) {
  const isTouch = useMediaQuery(TOUCH_POINTER_QUERY);
  useDevWarning(
    'DateTimeInput',
    '`nativePicker` is deprecated; use `presentation` instead (`touch` → `adaptive-native`, `always` → `native`, `never` → `adaptive-bottom-sheet`). `presentation` wins when both are set.',
    props.nativePicker !== undefined,
  );
  const effective = effectivePickerPresentation(
    props.presentation,
    props.nativePicker,
  );
  const locale = useLocale();
  const {
    presentation: _presentation,
    nativePicker: _nativePicker,
    ...surfaceProps
  } = props;
  // Every surface gets the resolved hour format, so typed text, the native
  // field's resting text, preset times, and the sheet wheels agree.
  const rest = {
    ...surfaceProps,
    hourFormat: resolveHourFormat(locale, props.hourFormat),
  };
  if (effective === 'native') {
    return (
      <PointerDateTimeField
        {...rest}
        nativeMode={
          props.presentation === undefined && props.nativePicker === 'always'
            ? 'legacy'
            : 'forced'
        }
      />
    );
  }
  switch (resolvePickerPresentation(effective, isTouch)) {
    case 'native':
      // Only `adaptive-native` on a coarse pointer resolves here (FR2).
      return <PointerDateTimeField {...rest} nativeMode="adaptive" />;
    case 'sheet':
      return <TouchDateTimeField {...rest} />;
    case 'desktop':
      return <PointerDateTimeField {...rest} />;
  }
}

DateTimeInput.displayName = 'DateTimeInput';
