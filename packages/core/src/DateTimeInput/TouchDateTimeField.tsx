// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TouchDateTimeField.tsx
 * @input Uses React, Field, BottomSheet, SegmentedControl, DateInput month picker primitives, Wheel, StyleX intrinsic flex layout
 * @output Exports TouchDateTimeField — the coarse-pointer surface behind DateTimeInput
 * @position Internal component; consumed by DateTimeInput.tsx
 *
 * The touch half of `DateTimeInput`, holding `DateTimeInput`'s whole prop
 * contract so the desktop and touch surfaces are interchangeable. The desktop
 * only props `timeIncrement` and `timeOptionInterval` remain accepted but are
 * intentionally ignored here: time is selected with wheels instead of a typed
 * field or preset list.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/DateTimeInput/DateTimeInput.tsx
 * - /packages/core/src/DateTimeInput/DateTimeInput.doc.mjs
 * - /packages/core/src/DateTimeInput/DateTimeInputTouch.test.tsx
 * - /apps/storybook/stories/DateTimeInput.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/DateTimeInput/
 */

import {
  use,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {BottomSheet} from '../BottomSheet';
import {Button} from '../Button';
import {useCalendarConstraints, type ISODateString} from '../Calendar';
import {
  Field,
  InputClearButton,
  inputWrapperStyles,
  inputStatusBorderStyles,
  inputStatusHoverShadowStyles,
  inputStatusFocusWithinStyles,
} from '../Field';
import {useInputStatusIcon, useMergedRefs} from '../hooks';
import {useResolvedRequired} from '../hooks/useResolvedRequired';
import {useBusyAnnouncement} from '../hooks/useBusyAnnouncement';
import {Icon} from '../Icon';
import {IconButton} from '../IconButton';
import {useTranslator, InternationalizationContext} from '../i18n';
import {SegmentedControl, SegmentedControlItem} from '../SegmentedControl';
import {useSize} from '../SizeContext/SizeContext';
import {Spinner} from '../Spinner';
import {useTooltip} from '../Tooltip';
import {useFieldInputStyling} from '../Field/fieldParts';
import {
  colorVars,
  fontWeightVars,
  radiusVars,
  sizeVars,
  spacingVars,
  typeScaleVars,
  typographyVars,
} from '../theme/tokens.stylex';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import {rtlStyles} from '../utils/rtlStyles';
import {themeProps} from '../utils/themeProps';
import {normalizeDayOfWeek} from '../utils/dateTypes';
import {formatLocaleTime} from '../utils/timeFormat';
import {
  formatISOTime,
  isImeKeyEvent,
  isRenderable,
  isTimeInRange,
  clampTime,
  mergeProps,
  parseISOTime,
  type ISOTimeString,
} from '../utils';
import {chainEventHandlers} from '../utils/chainEventHandlers';
import {joinAriaIDs} from '../utils/inputAria';
import {
  DATE_FORMAT_LONG,
  DATE_FORMAT_MONTH_YEAR,
  DATE_FORMAT_WEEKDAY_ONLY,
  plainDateFormat,
  plainDateFromISO,
  plainDateToday,
  type PlainDate,
} from '../utils/plainDate';
import {
  MonthScroller,
  type MonthScrollerHandle,
} from '../DateInput/MonthScroller';
import {MonthYearWheels} from '../DateInput/MonthYearWheels';
import {Wheel, type WheelOption} from '../DateInput/Wheel';
import {
  dateInputTouchGeometry,
  dateInputTouchSizes,
} from '../DateInput/tokens.stylex';
import {
  DEFAULT_MONTH_REACH,
  clampIndex,
  fromMonthIndex,
  monthIndexOf,
} from '../DateInput/monthGeometry';
import type {DateTimeInputProps, ISODateTimeString} from './DateTimeInput';

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

function getDefaultTime(hasSeconds: boolean): ISOTimeString {
  const now = new Date();
  return formatISOTime(
    {hour: now.getHours(), minute: now.getMinutes(), second: now.getSeconds()},
    hasSeconds,
  );
}

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

const HORIZONTAL_SEGMENT_BASIS = 196;

const styles = stylex.create({
  // Same as DateTimeInput's: the focus ring for a focused disabled field.
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
  touchRow: {
    display: 'flex',
    flexWrap: 'wrap',
    inlineSize: '100%',
    minInlineSize: 0,
    gap: spacingVars['--spacing-2'],
  },
  touchDateWrapper: {
    flex: 1,
    flexBasis: HORIZONTAL_SEGMENT_BASIS,
    minInlineSize: 0,
  },
  touchTimeWrapper: {
    flex: 1,
    flexBasis: HORIZONTAL_SEGMENT_BASIS,
    minInlineSize: 0,
  },
  touchInput: {
    caretColor: 'transparent',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    userSelect: 'none',
  },
  touchSheetBody: {
    boxSizing: 'border-box',
    inlineSize: '100%',
    minInlineSize: 0,
    paddingInline: spacingVars['--spacing-4'],
    paddingBlockStart: spacingVars['--spacing-6'],
    paddingBlockEnd: spacingVars['--spacing-4'],
  },
  touchSurface: {
    display: 'flex',
    flexDirection: 'column',
    inlineSize: '100%',
    minInlineSize: 0,
    gap: spacingVars['--spacing-3'],
  },
  touchPanelStack: {
    display: 'grid',
    inlineSize: '100%',
    minInlineSize: 0,
  },
  touchPanel: {
    gridArea: '1 / 1',
    display: 'flex',
    inlineSize: '100%',
    minInlineSize: 0,
    flexDirection: 'column',
    gap: spacingVars['--spacing-2'],
  },
  touchPanelHidden: {
    visibility: 'hidden',
    opacity: 0,
    pointerEvents: 'none',
  },
  touchHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    blockSize: sizeVars['--size-element-lg'],
  },
  touchTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    minInlineSize: 0,
    paddingInline: spacingVars['--spacing-2'],
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radiusVars['--radius-element'],
    backgroundColor: 'transparent',
    color: colorVars['--color-text-primary'],
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-large-size'],
    fontWeight: fontWeightVars['--font-weight-semibold'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  touchTitleText: {
    minInlineSize: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  touchHeaderActions: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-0-5'],
    marginInlineStart: 'auto',
  },
  touchHeaderActionsHidden: {
    visibility: 'hidden',
    opacity: 0,
    pointerEvents: 'none',
  },
  touchArrow: {
    minBlockSize: {
      default: null,
      '@media (pointer: coarse)': dateInputTouchSizes.daySize,
    },
    minInlineSize: {
      default: null,
      '@media (pointer: coarse)': dateInputTouchSizes.daySize,
    },
  },
  touchArrowUnavailable: {
    visibility: 'hidden',
  },
  touchArrowIcon: {
    display: 'inline-flex',
  },
  touchResetButton: {
    minBlockSize: {
      default: null,
      '@media (pointer: coarse)': dateInputTouchSizes.daySize,
    },
  },
  touchDateSurfaceStack: {
    display: 'grid',
    inlineSize: '100%',
    minInlineSize: 0,
  },
  touchDateSurface: {
    gridArea: '1 / 1',
    display: 'flex',
    inlineSize: '100%',
    minInlineSize: 0,
    flexDirection: 'column',
    gap: spacingVars['--spacing-2'],
  },
  touchDateSurfaceHidden: {
    visibility: 'hidden',
    opacity: 0,
    pointerEvents: 'none',
  },
  touchWeekdays: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    blockSize: sizeVars['--size-element-sm'],
    alignItems: 'center',
  },
  touchWeekday: {
    textAlign: 'center',
    fontSize: typeScaleVars['--text-supporting-size'],
    fontWeight: fontWeightVars['--font-weight-normal'],
    color: colorVars['--color-text-secondary'],
  },
  touchWheelSpacer: {
    blockSize: sizeVars['--size-element-sm'],
  },
  touchTimeWheels: {
    display: 'flex',
    inlineSize: '100%',
    minInlineSize: 0,
    blockSize: dateInputTouchGeometry.paneBlockSize,
    gap: spacingVars['--spacing-2'],
  },
  touchFooter: {
    display: 'flex',
    marginBlockStart: 'auto',
    paddingBlockStart: spacingVars['--spacing-1'],
  },
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseValidISODate(date: ISODateString | undefined): PlainDate | null {
  if (date == null || !ISO_DATE.test(date)) {
    return null;
  }
  try {
    return plainDateFromISO(date);
  } catch {
    return null;
  }
}

function normalizeISOTime(
  time: ISOTimeString | undefined,
  hasSeconds: boolean,
): ISOTimeString | undefined {
  if (time === undefined) {
    return undefined;
  }
  const parsed = parseISOTime(time);
  return parsed ? formatISOTime(parsed, hasSeconds) : undefined;
}

function timeToSeconds(time: ISOTimeString | undefined): number | null {
  if (time === undefined) {
    return null;
  }
  const parsed = parseISOTime(time);
  return parsed == null
    ? null
    : parsed.hour * 3600 + parsed.minute * 60 + parsed.second;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

function hour12From24(hour: number): number {
  return hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
}

function hour24From12(hour: number, meridiem: number): number {
  if (meridiem === 0) {
    return hour === 12 ? 0 : hour;
  }
  return hour === 12 ? 12 : hour + 12;
}

function rangeOverlaps(
  startSecond: number,
  endSecond: number,
  min: ISOTimeString | undefined,
  max: ISOTimeString | undefined,
): boolean {
  const minSecond = timeToSeconds(min);
  const maxSecond = timeToSeconds(max);
  return (
    (minSecond == null || endSecond >= minSecond) &&
    (maxSecond == null || startSecond <= maxSecond)
  );
}

type TouchDateTimePanel = 'date' | 'time';

export function TouchDateTimeField({
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
  // Desktop-only: mobile uses wheels instead of typed arrow stepping or a preset list.
  timeIncrement: _timeIncrement,
  timeOptionInterval: _timeOptionInterval,
  hasClear = false,
  placeholder: placeholderFromProps,
  timePlaceholder: timePlaceholderFromProps,
  timeLabel,
  size: sizeProp,
  status,
  labelTooltip,
  // Desktop-only: the touch Date panel shows one swipe-paged month at a time.
  numberOfMonths: _numberOfMonths,
  weekStartsOn: weekStartsOnProp = 0,
  width,
  containerXstyle,
  containerClassName,
  containerStyle,
  controlXstyle,
  controlClassName,
  controlStyle,
  ref,
  ...restProps
}: DateTimeInputProps) {
  const {rest, container} = useFieldInputStyling('DateTimeInput', restProps, {
    containerXstyle,
    containerClassName,
    containerStyle,
  });
  const {
    id: idProp,
    'aria-describedby': ariaDescribedByProp,
    'aria-labelledby': ariaLabelledByProp,
    onClick: onClickProp,
    onKeyDown: onKeyDownProp,
    ...controlProps
  } = rest;
  const t = useTranslator();
  const isEffectivelyRequired = useResolvedRequired({isRequired, isOptional});
  const {locale} = use(InternationalizationContext);
  const placeholder =
    placeholderFromProps ?? t('@astryx.dateTimeInput.placeholder');
  const timePlaceholder =
    timePlaceholderFromProps ?? t('@astryx.dateTimeInput.timePlaceholder');
  const resolvedTimeLabel =
    timeLabel ?? t('@astryx.dateTimeInput.timeSuffix', {label});
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
  const timeInputRef = useRef<HTMLInputElement | null>(null);
  const timeSegmentRef = useRef<HTMLButtonElement | null>(null);
  const mergedDateInputRef = useMergedRefs(ref, dateInputRef);
  const scrollerHandleRef = useRef<MonthScrollerHandle | null>(null);

  const [, startTransition] = useTransition();
  const [optimisticValue, setOptimisticValue] = useOptimistic(value);
  const isPendingChange = optimisticValue !== value;
  const isBusy = isLoading || isPendingChange;
  const isEffectivelyDisabled = isDisabled || isLoading;

  const showsDisabledMessage = isDisabled && !!disabledMessage;
  const disabledMessageTooltip = useTooltip({
    placement: 'above',
    focusTrigger: 'always',
    isEnabled: showsDisabledMessage,
  });

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

  const minParts = useMemo(() => splitDateTime(min), [min]);
  const maxParts = useMemo(() => splitDateTime(max), [max]);
  const valueParts = useMemo(
    () => splitDateTime(optimisticValue),
    [optimisticValue],
  );
  const calendarMin = minParts.date;
  const calendarMax = maxParts.date;
  const {isDateDisabled} = useCalendarConstraints({
    min: calendarMin,
    max: calendarMax,
    dateConstraints,
  });

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const sheetBodyRef = useRef<HTMLDivElement | null>(null);
  // The busy Spinner is decorative; this control announces its busy start
  // (spec:AST-086 FR8). A change made in the open modal sheet starts it while
  // the sheet is open, so it is announced from inside the sheet.
  useBusyAnnouncement(
    isBusy,
    t('@astryx.spinner.loading'),
    isSheetOpen ? sheetBodyRef : dateInputRef,
  );
  const [activePanel, setActivePanel] = useState<TouchDateTimePanel>('date');
  const [isWheelOpen, setIsWheelOpen] = useState(false);
  const [draftTime, setDraftTime] = useState<ISOTimeString | undefined>(() =>
    normalizeISOTime(splitDateTime(value).time, hasSeconds),
  );

  const today = useMemo(() => plainDateToday(), []);
  const selectedDate = useMemo(
    () => parseValidISODate(valueParts.date),
    [valueParts.date],
  );
  const fallbackTime = useMemo(() => getDefaultTime(hasSeconds), [hasSeconds]);
  const normalizedValueTime = normalizeISOTime(valueParts.time, hasSeconds);
  const timeForWheels = normalizedValueTime ?? draftTime ?? fallbackTime;
  const parsedWheelTime = useMemo(
    () =>
      parseISOTime(timeForWheels) ?? {
        hour: 0,
        minute: 0,
        second: 0,
      },
    [timeForWheels],
  );
  const weekStartsOn = normalizeDayOfWeek(weekStartsOnProp);

  // The draft follows the controlled time, and an external clear resets it.
  // Adjusted during render when the value changes, so no commit paints the
  // previous draft.
  const [draftSource, setDraftSource] = useState({
    time: normalizedValueTime,
    value: optimisticValue,
  });
  // Object.is, matching the dependency comparison of the effect this replaces.
  if (
    !Object.is(draftSource.time, normalizedValueTime) ||
    !Object.is(draftSource.value, optimisticValue)
  ) {
    setDraftSource({time: normalizedValueTime, value: optimisticValue});
    if (normalizedValueTime !== undefined) {
      setDraftTime(normalizedValueTime);
    } else if (optimisticValue === undefined) {
      setDraftTime(undefined);
    }
  }

  const [anchorMonthIndex] = useState(() =>
    monthIndexOf(selectedDate ?? plainDateToday()),
  );
  const minMonthIndex =
    calendarMin != null
      ? monthIndexOf(plainDateFromISO(calendarMin))
      : anchorMonthIndex - DEFAULT_MONTH_REACH;
  const maxMonthIndex =
    calendarMax != null
      ? monthIndexOf(plainDateFromISO(calendarMax))
      : anchorMonthIndex + DEFAULT_MONTH_REACH;
  const [monthIndex, setMonthIndex] = useState(() =>
    clampIndex(anchorMonthIndex, minMonthIndex, maxMonthIndex),
  );
  // min/max can narrow underneath the mounted sheet. Keep the visible month in
  // range during render, so no commit shows an out-of-range month; the month
  // scroller is keyed on the range and remounts at the clamped month.
  const clampedMonthIndex = clampIndex(
    monthIndex,
    minMonthIndex,
    maxMonthIndex,
  );
  // Object.is, matching the dependency comparison of the effect this replaces
  // (a NaN index would otherwise never compare equal and re-render forever).
  if (!Object.is(clampedMonthIndex, monthIndex)) {
    setMonthIndex(clampedMonthIndex);
  }
  const {year, month} = fromMonthIndex(monthIndex);
  const canStepBack = monthIndex > minMonthIndex;
  const canStepForward = monthIndex < maxMonthIndex;

  const dayNames = useMemo(
    () =>
      Array.from({length: 7}, (_, offset) =>
        plainDateFormat(
          {year: 1970, month: 1, day: 4 + ((weekStartsOn + offset) % 7)},
          DATE_FORMAT_WEEKDAY_ONLY,
          locale,
        ),
      ),
    [weekStartsOn, locale],
  );
  const monthYearLabel = plainDateFormat(
    {year, month, day: 1},
    DATE_FORMAT_MONTH_YEAR,
    locale,
  );

  const dateDisplayValue = useMemo(() => {
    if (selectedDate == null) {
      return '';
    }
    return plainDateFormat(selectedDate, DATE_FORMAT_LONG, locale);
  }, [selectedDate, locale]);

  const timeDisplayValue = useMemo(() => {
    const displayTime = normalizedValueTime ?? draftTime;
    return displayTime
      ? formatLocaleTime(displayTime, locale, hourFormat, hasSeconds)
      : '';
  }, [draftTime, normalizedValueTime, locale, hourFormat, hasSeconds]);

  const timeBoundsForDate = useCallback(
    (date: ISODateString | undefined) => ({
      min:
        date != null && minParts.date === date && minParts.time
          ? minParts.time
          : undefined,
      max:
        date != null && maxParts.date === date && maxParts.time
          ? maxParts.time
          : undefined,
    }),
    [minParts.date, minParts.time, maxParts.date, maxParts.time],
  );

  const clampTimeForDate = useCallback(
    (date: ISODateString | undefined, time: ISOTimeString): ISOTimeString => {
      const bounds = timeBoundsForDate(date);
      return clampTime(time, bounds.min, bounds.max, hasSeconds);
    },
    [hasSeconds, timeBoundsForDate],
  );

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

  const openSheet = useCallback(
    (panel: TouchDateTimePanel) => {
      if (!isEffectivelyDisabled) {
        setIsWheelOpen(false);
        setActivePanel(panel);
        setIsSheetOpen(true);
      }
    },
    [isEffectivelyDisabled],
  );

  const closeSheet = useCallback(() => {
    if (selectedDate == null) {
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- The shared close path is also used by the disabled/loading effect.
      setDraftTime(undefined);
    }
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- The shared close path is also used by the disabled/loading effect.
    setIsSheetOpen(false);
  }, [selectedDate]);

  const handleSheetOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setIsSheetOpen(true);
      } else {
        closeSheet();
      }
    },
    [closeSheet],
  );

  useEffect(() => {
    if (isEffectivelyDisabled && isSheetOpen) {
      closeSheet();
    }
  }, [closeSheet, isEffectivelyDisabled, isSheetOpen]);

  const stepMonth = useCallback(
    (delta: number) => {
      const target = clampIndex(
        monthIndex + delta,
        minMonthIndex,
        maxMonthIndex,
      );
      if (target === monthIndex) {
        return;
      }
      setMonthIndex(target);
      scrollerHandleRef.current?.scrollToMonth(target, 'smooth');
    },
    [monthIndex, minMonthIndex, maxMonthIndex],
  );

  const handleResetInSheet = useCallback(() => {
    fireChange(undefined);
    setDraftTime(undefined);
    const currentMonth = monthIndexOf(today);
    if (currentMonth < minMonthIndex || currentMonth > maxMonthIndex) {
      return;
    }
    setMonthIndex(currentMonth);
    scrollerHandleRef.current?.scrollToMonth(currentMonth, 'smooth');
  }, [fireChange, today, minMonthIndex, maxMonthIndex]);

  const handleDateSelect = useCallback(
    (nextDate: ISODateString) => {
      const nextTime = clampTimeForDate(nextDate, timeForWheels);
      setDraftTime(nextTime);
      const combined = combineDateTime(nextDate, nextTime);
      if (combined && combined !== optimisticValue) {
        fireChange(combined);
      }
    },
    [clampTimeForDate, fireChange, optimisticValue, timeForWheels],
  );

  const commitWheelTime = useCallback(
    (rawTime: ISOTimeString) => {
      const nextTime = clampTimeForDate(valueParts.date, rawTime);
      setDraftTime(nextTime);
      if (valueParts.date != null) {
        const combined = combineDateTime(valueParts.date, nextTime);
        if (combined && combined !== optimisticValue) {
          fireChange(combined);
        }
      }
    },
    [clampTimeForDate, fireChange, optimisticValue, valueParts.date],
  );

  const composeWheelTime = useCallback(
    ({
      hour24,
      hour12,
      minute,
      second,
      meridiem,
    }: {
      hour24?: number;
      hour12?: number;
      minute?: number;
      second?: number;
      meridiem?: number;
    }): ISOTimeString => {
      const currentMeridiem = parsedWheelTime.hour < 12 ? 0 : 1;
      let hour = parsedWheelTime.hour;
      if (hourFormat === '24h') {
        hour = hour24 ?? hour;
      } else {
        hour = hour24From12(
          hour12 ?? hour12From24(hour),
          meridiem ?? currentMeridiem,
        );
      }
      return formatISOTime(
        {
          hour,
          minute: minute ?? parsedWheelTime.minute,
          second: hasSeconds ? (second ?? parsedWheelTime.second) : 0,
        },
        hasSeconds,
      );
    },
    [hasSeconds, hourFormat, parsedWheelTime],
  );

  const timeBounds = timeBoundsForDate(valueParts.date);
  const hourOptions: WheelOption[] = useMemo(() => {
    if (hourFormat === '24h') {
      return Array.from({length: 24}, (_, hour) => ({
        value: hour,
        label: twoDigits(hour),
        isDisabled: !rangeOverlaps(
          hour * 3600,
          hour * 3600 + 3599,
          timeBounds.min,
          timeBounds.max,
        ),
      }));
    }
    const meridiem = parsedWheelTime.hour < 12 ? 0 : 1;
    // In 12-hour mode the hour column is interpreted inside the active AM/PM
    // half, so disabled rows describe reachability within that half only.
    return Array.from({length: 12}, (_, index) => {
      const hour = index + 1;
      const hour24 = hour24From12(hour, meridiem);
      return {
        value: hour,
        label: String(hour),
        isDisabled: !rangeOverlaps(
          hour24 * 3600,
          hour24 * 3600 + 3599,
          timeBounds.min,
          timeBounds.max,
        ),
      };
    });
  }, [hourFormat, parsedWheelTime.hour, timeBounds.min, timeBounds.max]);

  const minuteOptions: WheelOption[] = useMemo(
    () =>
      Array.from({length: 60}, (_, minute) => {
        const start = parsedWheelTime.hour * 3600 + minute * 60;
        return {
          value: minute,
          label: twoDigits(minute),
          isDisabled: !rangeOverlaps(
            start,
            start + (hasSeconds ? 59 : 0),
            timeBounds.min,
            timeBounds.max,
          ),
        };
      }),
    [hasSeconds, parsedWheelTime.hour, timeBounds.min, timeBounds.max],
  );

  const secondOptions: WheelOption[] = useMemo(
    () =>
      Array.from({length: 60}, (_, second) => ({
        value: second,
        label: twoDigits(second),
        isDisabled: !isTimeInRange(
          formatISOTime(
            {
              hour: parsedWheelTime.hour,
              minute: parsedWheelTime.minute,
              second,
            },
            true,
          ),
          timeBounds.min,
          timeBounds.max,
        ),
      })),
    [
      parsedWheelTime.hour,
      parsedWheelTime.minute,
      timeBounds.min,
      timeBounds.max,
    ],
  );

  const meridiemOptions: WheelOption[] = useMemo(
    () => [
      {
        value: 0,
        label: t('@astryx.dateTimeInput.meridiemAM'),
        isDisabled: !rangeOverlaps(
          0,
          11 * 3600 + 3599,
          timeBounds.min,
          timeBounds.max,
        ),
      },
      {
        value: 1,
        label: t('@astryx.dateTimeInput.meridiemPM'),
        isDisabled: !rangeOverlaps(
          12 * 3600,
          23 * 3600 + 3599,
          timeBounds.min,
          timeBounds.max,
        ),
      },
    ],
    [t, timeBounds.min, timeBounds.max],
  );

  const handleVisibleMonthChange = useCallback(
    (next: number) => {
      if (activePanel === 'date' && !isWheelOpen) {
        setMonthIndex(next);
      }
    },
    [activePanel, isWheelOpen],
  );

  const monthIndexRef = useRef(monthIndex);
  monthIndexRef.current = monthIndex;
  useEffect(() => {
    if (activePanel === 'date' && !isWheelOpen) {
      scrollerHandleRef.current?.scrollToMonth(monthIndexRef.current, 'auto');
    }
  }, [activePanel, isWheelOpen]);

  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent, panel: TouchDateTimePanel) => {
      if (isImeKeyEvent(event.nativeEvent)) {
        return;
      }
      if (
        event.key === 'ArrowDown' ||
        event.key === 'Enter' ||
        event.key === ' ' ||
        event.key === 'Spacebar'
      ) {
        event.preventDefault();
        openSheet(panel);
      }
    },
    [openSheet],
  );

  const clearFocusTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (clearFocusTimerRef.current != null) {
        clearTimeout(clearFocusTimerRef.current);
      }
    },
    [],
  );

  const timeSegmentFocusTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timeSegmentFocusTimerRef.current != null) {
        clearTimeout(timeSegmentFocusTimerRef.current);
      }
    },
    [],
  );

  const handleClear = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      fireChange(undefined);
      setDraftTime(undefined);
      setIsSheetOpen(false);
      const field = dateInputRef.current;
      if (field == null) {
        return;
      }
      clearFocusTimerRef.current = window.setTimeout(() => {
        clearFocusTimerRef.current = null;
        field.focus({preventScroll: true});
      }, 0);
    },
    [fireChange],
  );

  const surface = (
    <div {...stylex.props(styles.touchSurface)}>
      <SegmentedControl
        value={activePanel}
        onChange={nextPanel => {
          setActivePanel(nextPanel as TouchDateTimePanel);
          setIsWheelOpen(false);
        }}
        label={t('@astryx.dateTimeInput.pickerMode')}
        layout="fill">
        <SegmentedControlItem
          value="date"
          label={t('@astryx.dateTimeInput.dateTab')}
        />
        <SegmentedControlItem
          ref={timeSegmentRef}
          value="time"
          label={t('@astryx.dateTimeInput.timeTab')}
        />
      </SegmentedControl>

      <div {...stylex.props(styles.touchPanelStack)}>
        <div
          data-panel="date"
          aria-hidden={activePanel !== 'date' ? 'true' : undefined}
          inert={activePanel !== 'date' ? true : undefined}
          {...stylex.props(
            styles.touchPanel,
            activePanel !== 'date' && styles.touchPanelHidden,
          )}>
          <div {...stylex.props(styles.touchHeader)}>
            <button
              type="button"
              onClick={() => setIsWheelOpen(open => !open)}
              aria-expanded={isWheelOpen}
              aria-label={t('@astryx.dateInput.chooseMonthYear', {
                monthYear: monthYearLabel,
              })}
              {...stylex.props(
                styles.touchTitle,
                focusOutlineStyles.focusVisible,
              )}>
              <span {...stylex.props(styles.touchTitleText)}>
                {monthYearLabel}
              </span>
              <Icon icon="chevronDown" size="sm" color="secondary" />
            </button>
            <span
              inert={isWheelOpen ? true : undefined}
              {...stylex.props(
                styles.touchHeaderActions,
                isWheelOpen && styles.touchHeaderActionsHidden,
              )}>
              <IconButton
                variant="ghost"
                size="sm"
                xstyle={[
                  styles.touchArrow,
                  !canStepBack && styles.touchArrowUnavailable,
                ]}
                isDisabled={!canStepBack}
                onClick={() => stepMonth(-1)}
                label={t('@astryx.calendar.previousMonth')}
                icon={
                  <span
                    {...stylex.props(styles.touchArrowIcon, rtlStyles.mirror)}>
                    <Icon icon="chevronLeft" size="sm" color="inherit" />
                  </span>
                }
              />
              <IconButton
                variant="ghost"
                size="sm"
                xstyle={[
                  styles.touchArrow,
                  !canStepForward && styles.touchArrowUnavailable,
                ]}
                isDisabled={!canStepForward}
                onClick={() => stepMonth(1)}
                label={t('@astryx.calendar.nextMonth')}
                icon={
                  <span
                    {...stylex.props(styles.touchArrowIcon, rtlStyles.mirror)}>
                    <Icon icon="chevronRight" size="sm" color="inherit" />
                  </span>
                }
              />
              <Button
                variant="ghost"
                size="sm"
                xstyle={styles.touchResetButton}
                label={t('@astryx.dateInput.resetPicking')}
                onClick={handleResetInSheet}
              />
            </span>
          </div>

          <div {...stylex.props(styles.touchDateSurfaceStack)}>
            <div
              data-date-surface="calendar"
              aria-hidden={isWheelOpen ? 'true' : undefined}
              inert={isWheelOpen ? true : undefined}
              {...stylex.props(
                styles.touchDateSurface,
                isWheelOpen && styles.touchDateSurfaceHidden,
              )}>
              <div aria-hidden="true" {...stylex.props(styles.touchWeekdays)}>
                {dayNames.map(name => (
                  <div key={name} {...stylex.props(styles.touchWeekday)}>
                    {name}
                  </div>
                ))}
              </div>
              <MonthScroller
                key={`${minMonthIndex}:${maxMonthIndex}`}
                handleRef={scrollerHandleRef}
                minMonthIndex={minMonthIndex}
                maxMonthIndex={maxMonthIndex}
                initialMonthIndex={monthIndex}
                onVisibleMonthChange={handleVisibleMonthChange}
                selectedDate={selectedDate}
                today={today}
                isDateDisabled={isDateDisabled}
                weekStartsOn={weekStartsOn}
                onSelect={handleDateSelect}
              />
              <div {...stylex.props(styles.touchFooter)}>
                <Button
                  variant="primary"
                  size="md"
                  width="100%"
                  label={t('@astryx.dateTimeInput.saveDatePicking')}
                  isDisabled={selectedDate == null}
                  onClick={() => {
                    setIsWheelOpen(false);
                    setActivePanel('time');
                    if (timeSegmentFocusTimerRef.current != null) {
                      clearTimeout(timeSegmentFocusTimerRef.current);
                    }
                    timeSegmentFocusTimerRef.current = window.setTimeout(() => {
                      timeSegmentFocusTimerRef.current = null;
                      timeSegmentRef.current?.focus({preventScroll: true});
                    }, 0);
                  }}
                />
              </div>
            </div>

            <div
              data-date-surface="wheels"
              aria-hidden={!isWheelOpen ? 'true' : undefined}
              inert={!isWheelOpen ? true : undefined}
              {...stylex.props(
                styles.touchDateSurface,
                !isWheelOpen && styles.touchDateSurfaceHidden,
              )}>
              <div
                aria-hidden="true"
                {...stylex.props(styles.touchWheelSpacer)}
              />
              <MonthYearWheels
                monthIndex={monthIndex}
                minMonthIndex={minMonthIndex}
                maxMonthIndex={maxMonthIndex}
                onChange={next => {
                  setMonthIndex(next);
                  scrollerHandleRef.current?.scrollToMonth(next, 'auto');
                }}
                monthLabel={t('@astryx.dateInput.monthWheel')}
                yearLabel={t('@astryx.dateInput.yearWheel')}
                isActive={activePanel === 'date' && isWheelOpen}
              />
              <div {...stylex.props(styles.touchFooter)}>
                <Button
                  variant="secondary"
                  size="md"
                  width="100%"
                  label={t('@astryx.dateInput.doneChoosingMonth')}
                  onClick={() => setIsWheelOpen(false)}
                />
              </div>
            </div>
          </div>
        </div>

        <div
          data-panel="time"
          role="group"
          aria-label={resolvedTimeLabel}
          aria-hidden={activePanel !== 'time' ? 'true' : undefined}
          inert={activePanel !== 'time' ? true : undefined}
          {...stylex.props(
            styles.touchPanel,
            activePanel !== 'time' && styles.touchPanelHidden,
          )}>
          <div {...stylex.props(styles.touchTimeWheels)}>
            <Wheel
              label={t('@astryx.dateTimeInput.hourWheel')}
              options={hourOptions}
              value={
                hourFormat === '24h'
                  ? parsedWheelTime.hour
                  : hour12From24(parsedWheelTime.hour)
              }
              isActive={activePanel === 'time'}
              onChange={hour =>
                commitWheelTime(
                  hourFormat === '24h'
                    ? composeWheelTime({hour24: hour})
                    : composeWheelTime({hour12: hour}),
                )
              }
            />
            <Wheel
              label={t('@astryx.dateTimeInput.minuteWheel')}
              options={minuteOptions}
              value={parsedWheelTime.minute}
              isActive={activePanel === 'time'}
              onChange={minute => commitWheelTime(composeWheelTime({minute}))}
            />
            {hasSeconds && (
              <Wheel
                label={t('@astryx.dateTimeInput.secondWheel')}
                options={secondOptions}
                value={parsedWheelTime.second}
                isActive={activePanel === 'time'}
                onChange={second => commitWheelTime(composeWheelTime({second}))}
              />
            )}
            {hourFormat === '12h' && (
              <Wheel
                label={t('@astryx.dateTimeInput.meridiemWheel')}
                options={meridiemOptions}
                value={parsedWheelTime.hour < 12 ? 0 : 1}
                isActive={activePanel === 'time'}
                onChange={meridiem =>
                  commitWheelTime(composeWheelTime({meridiem}))
                }
              />
            )}
          </div>
          <div {...stylex.props(styles.touchFooter)}>
            <Button
              variant="primary"
              size="md"
              width="100%"
              label={t('@astryx.dateInput.savePicking')}
              onClick={closeSheet}
            />
          </div>
        </div>
      </div>
    </div>
  );

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
        ref={el => {
          disabledMessageTooltip.ref(el);
        }}
        {...mergeProps(
          themeProps('date-time-input', {
            size,
            status: status?.type ?? null,
            disabled: isDisabled ? 'disabled' : null,
          }),
          stylex.props(styles.touchRow, controlXstyle),
          controlClassName,
          controlStyle,
        )}>
        <div
          onClick={event => {
            if (event.target === event.currentTarget) {
              openSheet('date');
            }
          }}
          {...mergeProps(
            themeProps('date-time-input-date-segment', {
              size,
              status: status?.type ?? null,
            }),
            stylex.props(
              inputWrapperStyles.base,
              sizeStyles[size],
              styles.touchDateWrapper,
              isEffectivelyDisabled && inputWrapperStyles.disabled,
              isEffectivelyDisabled && styles.disabledFocusRing,
              status && inputStatusBorderStyles[status.type],
              status &&
                !isEffectivelyDisabled &&
                inputStatusHoverShadowStyles[status.type],
              status && inputStatusFocusWithinStyles[status.type],
            ),
          )}>
          <button
            type="button"
            onClick={() => openSheet('date')}
            aria-disabled={isEffectivelyDisabled || undefined}
            aria-label={t('@astryx.dateInput.openCalendar')}
            tabIndex={-1}
            {...stylex.props(
              focusOutlineStyles.focusVisible,
              styles.iconButton,
              isEffectivelyDisabled && styles.iconButtonDisabled,
            )}>
            <Icon
              icon="calendar"
              size="sm"
              color="secondary"
              {...themeProps('date-time-input-toggle-icon', {
                state: isSheetOpen ? 'expanded' : 'collapsed',
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
            readOnly
            inputMode="none"
            onChange={() => {}}
            onClick={
              isEffectivelyDisabled
                ? undefined
                : chainEventHandlers(() => openSheet('date'), onClickProp)
            }
            onKeyDown={chainEventHandlers(
              (event: React.KeyboardEvent<HTMLInputElement>) =>
                handleInputKeyDown(event, 'date'),
              onKeyDownProp,
            )}
            aria-labelledby={controlLabelledBy}
            placeholder={placeholder}
            aria-disabled={isEffectivelyDisabled ? 'true' : undefined}
            aria-describedby={ariaDescribedBy}
            aria-required={isEffectivelyRequired ? 'true' : undefined}
            aria-invalid={status?.type === 'error' ? 'true' : undefined}
            aria-busy={isBusy || undefined}
            aria-expanded={isSheetOpen && activePanel === 'date'}
            aria-haspopup="dialog"
            aria-autocomplete="none"
            autoComplete="off"
            {...stylex.props(
              styles.input,
              styles.touchInput,
              isEffectivelyDisabled && styles.inputDisabled,
            )}
          />
          {hasClear && value !== undefined && !isEffectivelyDisabled && (
            <InputClearButton
              label={t('@astryx.dateInput.clear', {label})}
              onClick={handleClear}
            />
          )}
          {isBusy && <Spinner size="sm" aria-hidden="true" />}
          {isRenderable(statusIcon) && statusIcon}
        </div>

        <div
          onClick={event => {
            if (event.target === event.currentTarget) {
              openSheet('time');
            }
          }}
          {...mergeProps(
            themeProps('date-time-input-time-segment', {
              size,
              status: status?.type ?? null,
            }),
            stylex.props(
              inputWrapperStyles.base,
              sizeStyles[size],
              styles.touchTimeWrapper,
              isEffectivelyDisabled && inputWrapperStyles.disabled,
              isEffectivelyDisabled && styles.disabledFocusRing,
              status && inputStatusBorderStyles[status.type],
              status &&
                !isEffectivelyDisabled &&
                inputStatusHoverShadowStyles[status.type],
              status && inputStatusFocusWithinStyles[status.type],
            ),
          )}>
          <button
            type="button"
            onClick={() => openSheet('time')}
            aria-disabled={isEffectivelyDisabled || undefined}
            aria-label={t('@astryx.dateTimeInput.openTimePicker', {
              label: resolvedTimeLabel,
            })}
            tabIndex={-1}
            {...stylex.props(
              focusOutlineStyles.focusVisible,
              styles.iconButton,
              isEffectivelyDisabled && styles.iconButtonDisabled,
            )}>
            <Icon
              icon="clock"
              size="sm"
              color="secondary"
              {...themeProps('date-time-input-clock-icon')}
            />
          </button>
          <input
            ref={timeInputRef}
            id={timeInputId}
            type="text"
            role="combobox"
            value={timeDisplayValue}
            readOnly
            inputMode="none"
            onChange={() => {}}
            onClick={() => openSheet('time')}
            onKeyDown={event => handleInputKeyDown(event, 'time')}
            placeholder={timePlaceholder}
            aria-disabled={isEffectivelyDisabled ? 'true' : undefined}
            aria-label={resolvedTimeLabel}
            aria-describedby={ariaDescribedBy}
            aria-required={isEffectivelyRequired ? 'true' : undefined}
            aria-invalid={status?.type === 'error' ? 'true' : undefined}
            aria-busy={isBusy || undefined}
            aria-expanded={isSheetOpen && activePanel === 'time'}
            aria-haspopup="dialog"
            aria-autocomplete="none"
            autoComplete="off"
            {...stylex.props(
              styles.input,
              styles.touchInput,
              isEffectivelyDisabled && styles.inputDisabled,
            )}
          />
        </div>
        <BottomSheet
          isOpen={isSheetOpen}
          onOpenChange={handleSheetOpenChange}
          label={t('@astryx.dateTimeInput.dialogLabel')}
          height="hug"
          // touchSheetBody owns the inset, including the band under the grab
          // handle.
          padding={0}>
          <div ref={sheetBodyRef} {...stylex.props(styles.touchSheetBody)}>
            {surface}
          </div>
        </BottomSheet>
        {showsDisabledMessage &&
          disabledMessageTooltip.renderTooltip(disabledMessage)}
      </div>
    </Field>
  );
}

TouchDateTimeField.displayName = 'TouchDateTimeField';
