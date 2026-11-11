// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TouchDateTimeField.tsx
 * @input Uses React, Field, BottomSheet, SegmentedControl, DateInput month picker primitives, the resolved calendar, Wheel and the pickers' touch layer (TimeWheels), the touch presentation, StyleX intrinsic flex layout
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
import {inputDisabledFocusStyles} from '../Field/inputDisabledFocus';
import type {StyleXStyles} from '@stylexjs/stylex';
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
import {useToday} from '../hooks/useToday';
import {useBusyAnnouncement} from '../hooks/useBusyAnnouncement';
import {Icon} from '../Icon';
import {IconButton} from '../IconButton';
import {SegmentedControl, SegmentedControlItem} from '../SegmentedControl';
import {useSize} from '../SizeContext/SizeContext';
import {Spinner} from '../Spinner';
import {useTooltip} from '../Tooltip';
import {useFieldInputStyling} from '../Field/fieldParts';
import {
  colorVars,
  durationVars,
  easeVars,
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
import {getWeekdayHeaders} from '../Calendar/getWeekdayHeaderNames';
import {
  formatISOTime,
  isImeKeyEvent,
  isRenderable,
  clampTime,
  mergeProps,
  parseISOTime,
  type ISOTimeString,
} from '../utils';
import {chainEventHandlers} from '../utils/chainEventHandlers';
import {joinAriaIDs} from '../utils/inputAria';
import {
  plainDateFromISO,
  plainDateIsEqual,
  plainDateToISO,
  plainDateToday,
  type PlainDate,
} from '../utils/plainDate';
import {
  calendarDayOfMonth,
  formatCalendarMonthLabel,
} from '../utils/calendarSystem';
import {formatCalendarDateText} from '../utils/calendarDateParser';
import {useCalendarSystem} from '../i18n/useCalendarSystem';
import {
  MonthScroller,
  type MonthScrollerHandle,
} from '../DateInput/MonthScroller';
import {MonthYearWheels} from '../DateInput/MonthYearWheels';
import {Wheel, type WheelOption} from '../DateInput/Wheel';
import {MonthPager, TimeWheels} from '../DateInput/datePickerTouch';
import {
  hour12From24,
  hour24From12,
  hourRowsInHalf,
  meridiemRows,
  minuteRows,
  secondRows,
  wheelBounds,
} from '../TimeInput/timeWheelRules';
import {useMonthYearToggle} from '../DateInput/useMonthYearToggle';
import {reducedMotionFadeConsts} from '../motion/reducedMotion.stylex';
import {useTouchPresentation} from '../utils/touchPresentation';
import {
  dateInputTouchGeometry,
  dateInputTouchSizes,
} from '../DateInput/tokens.stylex';
import {
  DEFAULT_MONTH_REACH,
  clampIndex,
  createMonthModel,
  dateInMonth,
} from '../DateInput/monthGeometry';
import type {DateTimeInputProps, ISODateTimeString} from './DateTimeInput';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import {InternationalizationContext} from '../i18n/InternationalizationContext';
import english from '../i18n/generated-english/DateTimeInput/TouchDateTimeField.generated';

// The month math needs a date before today is known (server render,
// hydration). The sheet's content, which shows the month, waits for today.
const UNKNOWN_TODAY_STAND_IN = plainDateFromISO('1970-01-01');

registerEnglishFallback(english);

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

/**
 * The month/year toggle under a finger, as in DateInput: the theme duration
 * token nearest UIDatePicker's measured 0.25 s in the Storybook theme. A part
 * that arrives eases on the entrance curve, and the hidden styles carry the
 * exit curve. The chevron's turn takes the move curve.
 */
const TOGGLE_DURATION = durationVars['--duration-medium-min'];
const TOGGLE_ENTRANCE = easeVars['--ease-entrance'];
const TOGGLE_EXIT = easeVars['--ease-exit'];
const TOGGLE_TURN = easeVars['--ease-move'];

const styles = stylex.create({
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
    // The sheet keeps the band under its grab bar.
    paddingBlockStart: 0,
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
    // Under a finger the month/year toggle cross-fades on its tokens
    // (TOGGLE_DURATION). With a mouse the swap stays instant. Under Reduced
    // Motion a touch screen gets the policy's cross-fade and a mouse the
    // instant swap.
    transitionProperty: {
      default: 'none',
      '@media (pointer: coarse)': 'opacity, visibility',
      '@media (prefers-reduced-motion: reduce) and (not (pointer: coarse))':
        'none',
    },
    transitionDuration: {
      default: null,
      '@media (pointer: coarse)': TOGGLE_DURATION,
      '@media (prefers-reduced-motion: reduce) and (pointer: coarse)':
        reducedMotionFadeConsts.duration,
      '@media (prefers-reduced-motion: reduce) and (not (pointer: coarse))':
        '0s',
    },
    transitionTimingFunction: {
      default: 'linear',
      '@media (pointer: coarse)': TOGGLE_ENTRANCE,
      '@media (prefers-reduced-motion: reduce) and (pointer: coarse)':
        reducedMotionFadeConsts.easing,
    },
  },
  // No `pointerEvents` in these two: it is inherited, so flipping it in the
  // toggle's commit would restyle the calendar before the fade's first frame.
  // `inert` and `visibility` cover it.
  touchHeaderActionsHidden: {
    visibility: 'hidden',
    opacity: 0,
    transitionTimingFunction: {
      default: 'linear',
      '@media (pointer: coarse)': TOGGLE_EXIT,
      '@media (prefers-reduced-motion: reduce) and (pointer: coarse)':
        reducedMotionFadeConsts.easing,
    },
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
    position: 'relative',
  },
  /**
   * While the month/year toggle cross-fades, a shield over both surfaces
   * takes touches, as a UIKit view animation ignores them. `inert` swaps only
   * at the fade's end (useMonthYearToggle). A pseudo-element, so showing it
   * restyles nothing inside the surfaces.
   */
  touchDateSurfaceStackFading: {
    '::after': {
      content: '""',
      position: 'absolute',
      inset: 0,
      zIndex: 3,
    },
  },
  touchDateSurface: {
    gridArea: '1 / 1',
    display: 'flex',
    inlineSize: '100%',
    minInlineSize: 0,
    flexDirection: 'column',
    gap: spacingVars['--spacing-2'],
    // Under a finger the month/year toggle cross-fades on its tokens
    // (TOGGLE_DURATION). With a mouse the swap stays instant. Under Reduced
    // Motion a touch screen gets the policy's cross-fade and a mouse the
    // instant swap.
    transitionProperty: {
      default: 'none',
      '@media (pointer: coarse)': 'opacity, visibility',
      '@media (prefers-reduced-motion: reduce) and (not (pointer: coarse))':
        'none',
    },
    transitionDuration: {
      default: null,
      '@media (pointer: coarse)': TOGGLE_DURATION,
      '@media (prefers-reduced-motion: reduce) and (pointer: coarse)':
        reducedMotionFadeConsts.duration,
      '@media (prefers-reduced-motion: reduce) and (not (pointer: coarse))':
        '0s',
    },
    transitionTimingFunction: {
      default: 'linear',
      '@media (pointer: coarse)': TOGGLE_ENTRANCE,
      '@media (prefers-reduced-motion: reduce) and (pointer: coarse)':
        reducedMotionFadeConsts.easing,
    },
  },
  touchDateSurfaceHidden: {
    visibility: 'hidden',
    opacity: 0,
    transitionTimingFunction: {
      default: 'linear',
      '@media (pointer: coarse)': TOGGLE_EXIT,
      '@media (prefers-reduced-motion: reduce) and (pointer: coarse)':
        reducedMotionFadeConsts.easing,
    },
  },
  /**
   * The wheels cover the calendar with an opaque plate in the sheet's color,
   * so only they fade and the calendar beneath stays drawn. `isolation` keeps
   * the calendar's text from painting through the plate at full opacity,
   * where no stacking context forms.
   */
  touchWheelsSurface: {
    backgroundColor: colorVars['--color-background-surface'],
    isolation: 'isolate',
  },
  // The calendar never fades: the wheels' plate covers it. With a mouse it
  // takes `hidden` when the wheels show.
  touchCalendarSurfaceHidden: {
    visibility: 'hidden',
  },
  // Under a finger, UIDatePicker's chevron: it points along the reading
  // direction for the calendar and turns down on the toggle's clock. With a
  // mouse it points down and stays. Under Reduced Motion it does not turn.
  // The turn lands mid-dip on a touch screen (useMonthYearToggle). A test
  // holds the quarter turn to the UIKit table.
  touchTitleChevron: {
    display: 'inline-flex',
    flexShrink: 0,
    transform: {
      default: 'none',
      '@media (pointer: coarse)': {
        default: 'rotate(-90deg)',
        // Mirrored under RTL, so it points along the reading direction; the
        // same function list in both states keeps the turn a turn.
        ':is([dir="rtl"] *)': 'scaleX(-1) rotate(-90deg)',
      },
    },
    transitionProperty: {
      default: 'none',
      '@media (pointer: coarse)': 'transform',
    },
    transitionDuration: {
      default: null,
      '@media (pointer: coarse)': TOGGLE_DURATION,
      '@media (prefers-reduced-motion: reduce) and (pointer: coarse)': '0s',
      '@media (prefers-reduced-motion: reduce) and (not (pointer: coarse))':
        '0s',
    },
    transitionTimingFunction: {
      default: 'ease',
      '@media (pointer: coarse)': TOGGLE_TURN,
    },
  },
  touchTitleChevronOpen: {
    transform: {
      default: 'none',
      '@media (pointer: coarse)': {
        default: 'rotate(0deg)',
        ':is([dir="rtl"] *)': 'scaleX(-1) rotate(0deg)',
      },
    },
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
  calendar: calendarProp,
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
  const t = useComponentTranslator();
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
  // The surfaces swap `inert` when the toggle's fade ends (useMonthYearToggle),
  // since flipping it restyles a surface's subtree. `aria-hidden` follows the
  // toggle at once, and a shield takes touches while the fade runs.
  const calendarSurfaceRef = useRef<HTMLDivElement | null>(null);
  const wheelsSurfaceRef = useRef<HTMLDivElement | null>(null);
  const {isTouch} = useTouchPresentation();
  const {isCalendarInert, isWheelsInert, isFading, titleRef, toggle} =
    useMonthYearToggle({
      isWheelOpen,
      setIsWheelOpen,
      isTouch,
      calendarRef: calendarSurfaceRef,
      wheelsRef: wheelsSurfaceRef,
    });
  // The header's arrows and Reset leave with the toggle and arrive with the
  // fade's end. They sit outside the surfaces' shield, so they go inert at
  // once.
  const isCalendarActionsInert = isWheelOpen || isCalendarInert;
  const MonthGrid = isTouch ? MonthPager : MonthScroller;
  const [draftTime, setDraftTime] = useState<ISOTimeString | undefined>(() =>
    normalizeISOTime(splitDateTime(value).time, hasSeconds),
  );

  // Unknown on the server and while hydrating. The sheet's content waits for
  // it, so hydration matches the server markup.
  const today = useToday();
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
  const calendar = useCalendarSystem(calendarProp, 'DateTimeInput');
  const monthModel = useMemo(() => createMonthModel(calendar), [calendar]);

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

  // Indexes belong to the calendar, so DateTimeInput remounts this surface
  // when the calendar changes.
  // Without a value, the sheet opens on today's month. A hydrated sheet stores
  // that month in the first render that knows today. Then a later render after
  // a month-end midnight does not move an open sheet.
  const [anchoredMonthIndex, setAnchoredMonthIndex] = useState<number | null>(
    () => {
      const opening = selectedDate ?? today;
      return opening == null ? null : monthModel.indexOf(opening);
    },
  );
  if (anchoredMonthIndex == null && today != null) {
    setAnchoredMonthIndex(monthModel.indexOf(today));
  }
  const anchorMonthIndex =
    anchoredMonthIndex ?? monthModel.indexOf(today ?? UNKNOWN_TODAY_STAND_IN);
  const minMonthIndex =
    calendarMin != null
      ? monthModel.indexOf(plainDateFromISO(calendarMin))
      : anchorMonthIndex - DEFAULT_MONTH_REACH;
  const maxMonthIndex =
    calendarMax != null
      ? monthModel.indexOf(plainDateFromISO(calendarMax))
      : anchorMonthIndex + DEFAULT_MONTH_REACH;
  // Set once the person moves the month; until then the opening month.
  const [chosenMonthIndex, setMonthIndex] = useState<number | null>(() =>
    anchoredMonthIndex == null
      ? null
      : clampIndex(anchoredMonthIndex, minMonthIndex, maxMonthIndex),
  );
  // min/max can narrow underneath the mounted sheet. Keep the visible month in
  // range during render, so no commit shows an out-of-range month; the month
  // scroller is keyed on the range and remounts at the clamped month.
  const clampedChosenMonthIndex =
    chosenMonthIndex == null
      ? null
      : clampIndex(chosenMonthIndex, minMonthIndex, maxMonthIndex);
  // Object.is, matching the dependency comparison of the effect this replaces
  // (a NaN index would otherwise never compare equal and re-render forever).
  if (!Object.is(clampedChosenMonthIndex, chosenMonthIndex)) {
    setMonthIndex(clampedChosenMonthIndex);
  }
  const monthIndex =
    clampedChosenMonthIndex ??
    clampIndex(anchorMonthIndex, minMonthIndex, maxMonthIndex);
  const canStepBack = monthIndex > minMonthIndex;
  const canStepForward = monthIndex < maxMonthIndex;

  const weekdayHeaders = useMemo(
    () => getWeekdayHeaders(locale, weekStartsOn),
    [locale, weekStartsOn],
  );
  // The day the picker keeps: the selected date's day of its month. A month
  // with an era change takes its heading era from this day.
  const keptDay =
    selectedDate == null ? 1 : calendarDayOfMonth(calendar, selectedDate);
  const monthYearLabel = formatCalendarMonthLabel(
    calendar,
    monthModel.monthAt(monthIndex),
    locale,
    keptDay,
  );

  const dateDisplayValue = useMemo(() => {
    if (selectedDate == null) {
      return '';
    }
    return formatCalendarDateText(selectedDate, 'date_long', locale, calendar);
  }, [calendar, selectedDate, locale]);

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
    const currentMonth = monthModel.indexOf(plainDateToday());
    if (currentMonth < minMonthIndex || currentMonth > maxMonthIndex) {
      return;
    }
    setMonthIndex(currentMonth);
    scrollerHandleRef.current?.scrollToMonth(currentMonth, 'smooth');
  }, [fireChange, monthModel, minMonthIndex, maxMonthIndex]);

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

  // UIDatePicker moves a chosen date with these wheels
  // (`datePicker.calendar.monthYearWheels.changesDate`).
  const handleWheelChange = useCallback(
    (next: number) => {
      setMonthIndex(next);
      scrollerHandleRef.current?.scrollToMonth(next, 'auto');
      if (!isTouch || selectedDate == null) {
        return;
      }
      const moved = dateInMonth(
        monthModel,
        selectedDate,
        next,
        parseValidISODate(calendarMin),
        parseValidISODate(calendarMax),
      );
      if (!plainDateIsEqual(moved, selectedDate) && !isDateDisabled(moved)) {
        handleDateSelect(plainDateToISO(moved));
      }
    },
    [
      isTouch,
      selectedDate,
      monthModel,
      calendarMin,
      calendarMax,
      isDateDisabled,
      handleDateSelect,
    ],
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
  const bounds = useMemo(
    () => wheelBounds(timeBounds.min, timeBounds.max),
    [timeBounds.min, timeBounds.max],
  );
  const hourOptions: WheelOption[] = useMemo(
    () => hourRowsInHalf(parsedWheelTime.hour, hourFormat, bounds),
    [bounds, hourFormat, parsedWheelTime.hour],
  );
  const minuteOptions: WheelOption[] = useMemo(
    () => minuteRows(parsedWheelTime.hour, hasSeconds, bounds),
    [bounds, hasSeconds, parsedWheelTime.hour],
  );
  const secondOptions: WheelOption[] = useMemo(
    () => secondRows(parsedWheelTime.hour, parsedWheelTime.minute, bounds),
    [bounds, parsedWheelTime.hour, parsedWheelTime.minute],
  );
  const meridiemOptions: WheelOption[] = useMemo(
    () =>
      meridiemRows(
        {
          am: t('@astryx.dateTimeInput.meridiemAM'),
          pm: t('@astryx.dateTimeInput.meridiemPM'),
        },
        bounds,
      ),
    [bounds, t],
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
              ref={titleRef}
              type="button"
              onClick={() => toggle(!isWheelOpen)}
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
              <Icon
                icon="chevronDown"
                size="sm"
                color="secondary"
                // StyleX's types do not model the touch key's nested RTL
                // condition, so the styles are cast; they compile as written.
                xstyle={
                  [
                    styles.touchTitleChevron,
                    isWheelOpen && styles.touchTitleChevronOpen,
                  ] as StyleXStyles
                }
              />
            </button>
            <span
              inert={isCalendarActionsInert ? true : undefined}
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

          <div
            {...stylex.props(
              styles.touchDateSurfaceStack,
              isFading && styles.touchDateSurfaceStackFading,
            )}>
            <div
              ref={calendarSurfaceRef}
              data-date-surface="calendar"
              aria-hidden={isWheelOpen ? 'true' : undefined}
              inert={isCalendarInert ? true : undefined}
              {...stylex.props(
                styles.touchDateSurface,
                // Under a finger the calendar stays drawn beneath the opaque
                // wheels, and `aria-hidden` and `inert` keep it out of reach.
                // Flipping the inherited `visibility` would restyle it in the
                // toggle's commit.
                isWheelOpen && !isTouch && styles.touchCalendarSurfaceHidden,
              )}>
              <div aria-hidden="true" {...stylex.props(styles.touchWeekdays)}>
                {weekdayHeaders.map(({dayOfWeek, name}) => (
                  <div key={dayOfWeek} {...stylex.props(styles.touchWeekday)}>
                    {name}
                  </div>
                ))}
              </div>
              <MonthGrid
                key={`${minMonthIndex}:${maxMonthIndex}`}
                handleRef={scrollerHandleRef}
                monthModel={monthModel}
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
              ref={wheelsSurfaceRef}
              data-date-surface="wheels"
              aria-hidden={!isWheelOpen ? 'true' : undefined}
              inert={isWheelsInert ? true : undefined}
              {...stylex.props(
                styles.touchDateSurface,
                styles.touchWheelsSurface,
                !isWheelOpen && styles.touchDateSurfaceHidden,
              )}>
              <div
                aria-hidden="true"
                {...stylex.props(styles.touchWheelSpacer)}
              />
              <MonthYearWheels
                monthModel={monthModel}
                monthIndex={monthIndex}
                keptDay={keptDay}
                minMonthIndex={minMonthIndex}
                maxMonthIndex={maxMonthIndex}
                onChange={handleWheelChange}
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
                  onClick={() => toggle(false)}
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
            {isTouch ? (
              <TimeWheels
                time={parsedWheelTime}
                hourFormat={hourFormat}
                hasSeconds={hasSeconds}
                min={timeBounds.min}
                max={timeBounds.max}
                isActive={activePanel === 'time'}
                onCommit={time =>
                  commitWheelTime(formatISOTime(time, hasSeconds))
                }
              />
            ) : (
              <>
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
                  onChange={minute =>
                    commitWheelTime(composeWheelTime({minute}))
                  }
                />
                {hasSeconds && (
                  <Wheel
                    label={t('@astryx.dateTimeInput.secondWheel')}
                    options={secondOptions}
                    value={parsedWheelTime.second}
                    isActive={activePanel === 'time'}
                    onChange={second =>
                      commitWheelTime(composeWheelTime({second}))
                    }
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
              </>
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
              inputWrapperStyles.textField,
              sizeStyles[size],
              styles.touchDateWrapper,
              isEffectivelyDisabled && inputWrapperStyles.disabled,
              isEffectivelyDisabled && inputDisabledFocusStyles.withinRing,
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
              inputWrapperStyles.textField,
              sizeStyles[size],
              styles.touchTimeWrapper,
              isEffectivelyDisabled && inputWrapperStyles.disabled,
              isEffectivelyDisabled && inputDisabledFocusStyles.withinRing,
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
          // touchSheetBody owns the inset; the sheet keeps the band under its
          // grab bar.
          padding={0}>
          <div ref={sheetBodyRef} {...stylex.props(styles.touchSheetBody)}>
            {today != null && surface}
          </div>
        </BottomSheet>
        {showsDisabledMessage &&
          disabledMessageTooltip.renderTooltip(disabledMessage)}
      </div>
    </Field>
  );
}

TouchDateTimeField.displayName = 'TouchDateTimeField';
