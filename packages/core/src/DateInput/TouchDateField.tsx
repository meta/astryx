// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TouchDateField.tsx
 * @input Uses React, Field, BottomSheet, Button, Icon, Calendar hooks, MonthScroller, MonthYearWheels
 * @output Exports TouchDateField — the touch surface behind DateInput
 * @position Internal component; consumed by DateInput.tsx
 *
 * The touch half of `DateInput`, holding `DateInput`'s whole prop
 * contract so the two are interchangeable. Everything field-shaped —
 * `Field` wrapper, status treatment, optimistic `changeAction`, the
 * disabled-reason tooltip, `InputGroup` membership — behaves exactly as it
 * does on the desktop control; only the picker differs.
 *
 * ## The closed field is deliberately the same control
 *
 * It is a real `<input>`, not a button: same element, same `role="combobox"`,
 * same border, same clear button, so `ref` (typed `Ref<HTMLInputElement>` by
 * `DateInputProps`) is honestly a reference to an input, the label's `for`
 * names it natively, and the switch between surfaces moves nothing on screen.
 *
 * It just cannot be typed into: `readOnly` blocks entry, and `inputMode="none"`
 * stops the virtual keyboard from opening over the sheet. Text entry is the
 * one part of the desktop control that has no place here — the keyboard it
 * summons would cover the picker it is meant to fill in.
 *
 * ## Three ideas in the picker
 *
 * 1. One month per screen. Every pane is exactly the height of the scrollport
 *    and snaps to its start, so the picker is a fixed height and there is no
 *    resting position showing half of two months. See MonthScroller.
 * 2. Swiping is the month control, and the arrows are the backup. A flick
 *    reaches a neighbouring month in the direction you already think of it;
 *    the pair of arrows in the header's trailing corner is there for a
 *    deliberate single step, and for anyone not swiping at all.
 * 3. The title is the escape hatch. Tap it and the same box becomes a month
 *    wheel and a year wheel — a flick each to reach 2019 instead of forty.
 *
 * Reset is chrome, so it sits in the header beside the arrows rather than in
 * the footer: the footer is where the task ends, and an undo of equal weight
 * beside Save is a mis-tap that throws away the date just chosen.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/DateInput/DateInput.tsx
 * - /packages/core/src/DateInput/DateInput.doc.mjs
 * - /packages/core/src/DateInput/DateInputTouch.test.tsx
 */

import {
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
import {useCalendarConstraints} from '../Calendar';
import type {DateInputProps} from './DateInput';
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
import {useLocale, useTranslator} from '../i18n';
import {useInputGroup} from '../InputGroup';
import {useFieldInputStyling} from '../Field/fieldParts';
import {joinAriaIDs} from '../utils/inputAria';
import {groupStyles, inputGroupItemProps} from '../InputGroup/groupStyles';
import {useSize} from '../SizeContext';
import {Spinner} from '../Spinner';
import {
  colorVars,
  spacingVars,
  radiusVars,
  sizeVars,
  borderVars,
  fontWeightVars,
  typeScaleVars,
  typographyVars,
  durationVars,
  easeVars,
} from '../theme/tokens.stylex';
import {useTooltip} from '../Tooltip';
import {VisuallyHidden} from '../VisuallyHidden';
import {
  focusOutlineStyles,
  getInputARIA,
  isImeKeyEvent,
  mergeProps,
  rtlStyles,
  themeProps,
  formatSharedDate,
  plainDateFromISO,
  plainDateToday,
  plainDateFormat,
  DATE_FORMAT_MONTH_YEAR,
  DATE_FORMAT_WEEKDAY_ONLY,
  type ISODateString,
} from '../utils';
import {chainEventHandlers} from '../utils/chainEventHandlers';
import {interactionOverlayStyles} from '../utils/interactionOverlay.stylex';
import {usePressFeedback} from '../hooks/usePressFeedback';
import {normalizeDayOfWeek} from '../utils/dateTypes';
import {MonthScroller, type MonthScrollerHandle} from './MonthScroller';
import {MonthYearWheels} from './MonthYearWheels';
import {
  DEFAULT_MONTH_REACH,
  clampIndex,
  fromMonthIndex,
  monthIndexOf,
} from './monthGeometry';
import {dateInputTouchSizes, dateInputTouchGeometry} from './tokens.stylex';

/**
 * The comfortable minimum tap target on both iOS and Android, honoured by
 * every target inside the sheet.
 */
const TOUCH_TARGET = dateInputTouchSizes.daySize;

/**
 * The whole surface swap, in one leg.
 *
 * It used to be two: the outgoing surface faded out, then the incoming one
 * faded in, 110ms each. The sequencing existed for one reason — the wheels'
 * panel was transparent, so overlapping the two put the wheels' translucent
 * selection band over the calendar grid and tinted a band-shaped strip of it,
 * which read as "the grey area animates differently from the content".
 *
 * Giving the wheels an opaque background removes the reason. Nothing shows
 * through them, so they can simply fade in ON TOP of a calendar that does not
 * move at all — no empty middle, no outgoing animation, and one duration
 * instead of a wait plus a fade.
 *
 * `--duration-fast` rather than a literal now that this is a whole duration
 * and not half of one.
 */
const SWAP_DURATION = durationVars['--duration-fast'];

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

const styles = stylex.create({
  // Same as DateInput's: no hover ring while disabled or busy, and the
  // focus ring while the field's input holds focus.
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
  // ---- the closed field ----
  wrapper: {
    gap: spacingVars['--spacing-2'],
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
    // Below 16px iOS zooms the page on focus. The field is focusable even
    // though it is not typable, so it needs the same floor DateInput has —
    // keyed to iOS alone, since only iOS WebKit implements
    // -webkit-touch-callout.
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
    // It opens a picker; it does not take text. The caret would say otherwise.
    caretColor: 'transparent',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    userSelect: 'none',
    '::placeholder': {
      color: colorVars['--color-text-secondary'],
    },
  },
  inputDisabled: {
    cursor: 'default',
  },

  // ---- the picker surface ----
  surface: {
    display: 'flex',
    flexDirection: 'column',
    inlineSize: '100%',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingVars['--spacing-2'],
    blockSize: sizeVars['--size-element-lg'],
    // No inline padding of its own: the content box owns the inset, and any
    // extra here would push the arrows off the line the day grid sits on.
  },
  /**
   * Both arrows together, at the trailing corner. `IconButton` draws each
   * one — a hand-rolled button had the glyph off-centre, and matching
   * Button's optical centring by hand is exactly the sort of thing a shared
   * component is for.
   */
  monthArrows: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-0-5'],
    // The pair is the trailing item; the title takes the space before it.
    marginInlineStart: 'auto',
    // The plate starts below the header, so these two are the one part of the
    // calendar the layer above cannot cover. They fade on its timing instead,
    // both directions, so the change reads as one motion rather than chrome
    // blinking out a beat before the grid is covered.
    transitionProperty: 'opacity, visibility',
    transitionDuration: SWAP_DURATION,
    transitionTimingFunction: 'linear',
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '0.01s',
    },
  },
  /**
   * Hidden while the wheels are up: they step the calendar, and the calendar
   * is not on screen. Hidden rather than unmounted because they are the
   * tallest thing in the header — dropping them would shorten it by 8px and
   * shift the whole sheet just as the panels cross-fade.
   *
   * `visibility: hidden` also takes them out of the tab order and the
   * accessibility tree, so there is nothing to reach that cannot be seen.
   */
  /**
   * An arrow with nowhere to go. Hidden, not unmounted, and not merely
   * disabled — it keeps its 44px so the remaining arrow does not slide
   * sideways as the range's edge is reached, and `visibility: hidden` takes
   * it out of the tab order and the accessibility tree so nothing invisible
   * is reachable.
   */
  monthArrowUnavailable: {
    visibility: 'hidden',
  },
  monthArrowsHidden: {
    visibility: 'hidden',
    opacity: 0,
    pointerEvents: 'none',
  },
  /**
   * `Button`'s own sizes top out at 36px, which is fine for a mouse and short
   * of the 44px every other target in this sheet honours. Floor it on a
   * coarse pointer, the same way the day cells do.
   */
  monthArrow: {
    minBlockSize: {default: null, '@media (pointer: coarse)': TOUCH_TARGET},
    minInlineSize: {default: null, '@media (pointer: coarse)': TOUCH_TARGET},
  },
  /**
   * The wrapper the RTL mirror rides on has to be a flex box. A bare inline
   * span puts the glyph on the text baseline, which lifts it a few px off the
   * button's optical centre — the whole reason these are `IconButton`s now.
   * Core's Calendar carries the identical `navIcon` rule.
   */
  monthArrowIcon: {
    display: 'inline-flex',
  },
  /**
   * Reset, past the arrows. It fades on their timing for their reason: the
   * plate starts below the header, so the two of them are what the layer
   * above cannot cover, and they have to leave together.
   */
  headerReset: {
    display: 'flex',
    alignItems: 'center',
    transitionProperty: 'opacity, visibility',
    transitionDuration: SWAP_DURATION,
    transitionTimingFunction: 'linear',
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '0.01s',
    },
  },
  headerResetHidden: {
    visibility: 'hidden',
    opacity: 0,
    pointerEvents: 'none',
  },
  /**
   * The same 44px floor the arrows take. `Button`'s `sm` is 32px, which is
   * fine beside a mouse and short of what every other target in this sheet
   * honours.
   */
  resetButton: {
    minBlockSize: {default: null, '@media (pointer: coarse)': TOUCH_TARGET},
  },
  /**
   * The month and year, and the toggle into the wheels. Leading, so it reads
   * first and sits on the same line as the day grid below it.
   */
  title: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    blockSize: '100%',
    paddingInline: spacingVars['--spacing-2'],
    // Pulls the text back onto the grid's line: the button's own padding
    // would otherwise inset the label past it.
    marginInlineStart: `calc(-1 * ${spacingVars['--spacing-2']})`,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radiusVars['--radius-element'],
    backgroundColor: 'transparent',
    color: colorVars['--color-text-primary'],
    fontSize: typeScaleVars['--text-large-size'],
    fontWeight: fontWeightVars['--font-weight-semibold'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    whiteSpace: 'nowrap',
    // The header now ends with Reset, so the title is the part that gives:
    // it ellipses rather than pushing the corner off a narrow screen.
    minInlineSize: 0,
    overflow: 'hidden',
  },
  titleText: {
    minInlineSize: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  titleChevron: {
    display: 'inline-flex',
    flexShrink: 0,
    // The one part of the swap that keeps `--ease-standard`, because it is
    // the one part that travels: a rotation has a distance to cover, and
    // fast-out-slow-in is what that curve is for. Same duration as the
    // surface it announces, so the two land together.
    transitionProperty: 'transform',
    transitionDuration: SWAP_DURATION,
    transitionTimingFunction: easeVars['--ease-standard'],
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '0.01s',
    },
  },
  titleChevronOpen: {
    transform: 'rotate(180deg)',
  },
  weekdays: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    blockSize: sizeVars['--size-element-sm'],
    alignItems: 'center',
    // Same as the arrows: above the plate's reach, so it fades on the layer's
    // timing rather than clearing on its own.
    transitionProperty: 'opacity, visibility',
    transitionDuration: SWAP_DURATION,
    transitionTimingFunction: 'linear',
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '0.01s',
    },
  },
  weekdaysHidden: {
    // Hidden, not unmounted: the row still owes the surface its height, or
    // opening the wheels would make the picker shorter.
    visibility: 'hidden',
    opacity: 0,
  },
  weekday: {
    textAlign: 'center',
    fontSize: typeScaleVars['--text-supporting-size'],
    fontWeight: fontWeightVars['--font-weight-normal'],
    color: colorVars['--color-text-secondary'],
  },
  body: {
    display: 'grid',
    blockSize: dateInputTouchGeometry.paneBlockSize,
    position: 'relative',
  },
  /**
   * The two panels share one grid cell, and the wheels are the one on top.
   */
  panel: {
    gridArea: '1 / 1',
    minWidth: 0,
  },
  /**
   * The layer underneath — the calendar, and the calendar's footer actions.
   *
   * It has no opacity and never fades. `visibility` is the only thing that
   * moves, and giving it the layer's own duration is what times it: CSS
   * interpolates `visibility` discretely, holding `visible` for the whole
   * transition whenever either end is `visible` and taking the final value
   * only at the finish. So it disappears exactly when the cover completes,
   * and on the way back it is there from the first frame, revealed as the
   * layer above fades off it. Nothing about it is ever seen changing.
   *
   * It is not merely decorative to hide it: `inert` keeps it off the tab
   * order, but a layer that is only COVERED is still `visible` to a screen
   * reader, so the two footer actions would both be announced.
   *
   * `visibility` (not `display`) also keeps the month scroller laid out while
   * the wheels are up, so its scroll offset survives the round trip and the
   * wheels can steer it before it is shown again.
   */
  panelBeneath: {
    transitionProperty: 'visibility',
    transitionDuration: SWAP_DURATION,
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '0.01s',
    },
  },
  panelBeneathHidden: {
    visibility: 'hidden',
    pointerEvents: 'none',
  },
  /**
   * The month and year, as one layer that fades in and out on top.
   *
   * The calendar underneath does not fade with it — this layer is opaque, so
   * covering it is enough, and animating it too would be animating the date
   * picker rather than the thing arriving over it.
   *
   * Three properties carry the whole design:
   *
   * `backgroundColor` is what makes the fade uniform. Without it the wheels
   * are a translucent selection band and some text, each compositing against
   * a live calendar grid on its own terms — so the band area faded unlike the
   * rest and read as "the grey area animates differently from the content".
   * With the plate inside the fading group, the group renders opaque first
   * and the fade applies to the finished image, so every pixel of it crosses
   * at the same rate.
   *
   * `isolation` is what makes the plate actually cover. Backgrounds and text
   * paint in separate phases, so without a stacking context a later sibling's
   * background lands UNDER an earlier sibling's text — the plate went in
   * opaque and the calendar's day numbers showed straight through it. Easy to
   * lose, because any opacity below 1 makes a stacking context anyway: the
   * cover only breaks at the two ends of the fade, where opacity is exactly
   * 1, which is to say whenever anyone is actually looking.
   *
   * `visibility` rides along with `opacity`, on the same rule as the layer
   * beneath: it stays `visible` for the whole transition, so fading out is
   * seen rather than cut on the first frame, and the layer still leaves the
   * a11y tree and the hit testing at the end of it.
   *
   * Easing is `linear`, not `--ease-standard`. That token is
   * `cubic-bezier(0.24, 1, 0.4, 1)`, which is right for something travelling
   * a distance and wrong for a fade: measured, it put the opacity at 50% in
   * 91ms and 95% in 241ms of a 410ms transition, so the fade was over long
   * before the duration was, and lengthening the duration bought an
   * imperceptible tail rather than a slower fade. A fade has no distance to
   * cover, so its progress should be its progress.
   */
  panelOverlay: {
    backgroundColor: colorVars['--color-background-surface'],
    isolation: 'isolate',
    transitionProperty: 'opacity, visibility',
    transitionDuration: SWAP_DURATION,
    transitionTimingFunction: 'linear',
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '0.01s',
    },
  },
  panelOverlayHidden: {
    visibility: 'hidden',
    opacity: 0,
    pointerEvents: 'none',
  },
  footer: {
    paddingBlockStart: spacingVars['--spacing-2'],
    // Same reason as the header: the content box owns the inline inset, so
    // Done's edge lines up with the grid's rather than sitting 4px inside it.
    // One grid cell, so the two actions stack and the row is as tall as one
    // button whichever is showing.
    display: 'grid',
    gridTemplateColumns: '1fr',
  },
  /**
   * One footer action. Both occupy the same cell, and the wheels' one is a
   * layer over the calendar's, exactly as the panels above are. The row
   * never changes height either way.
   */
  footerAction: {
    gridArea: '1 / 1',
    // One button per surface, filling the row: Save on the calendar, Done on
    // the wheels.
    display: 'flex',
  },
  sheetBody: {
    // One inset on every edge. The block-start is the exception and has to
    // be: the sheet's grab handle floats out of flow, costing no layout
    // height of its own, so the content wrapper owes it the 24px it occupies
    // — which reads as the same inset, because the handle sits in it.
    paddingInline: spacingVars['--spacing-4'],
    paddingBlockStart: spacingVars['--spacing-6'],
    paddingBlockEnd: spacingVars['--spacing-4'],
  },
  divider: {
    blockSize: borderVars['--border-width'],
    backgroundColor: colorVars['--color-border'],
    marginBlockStart: spacingVars['--spacing-1'],
  },
});

/**
 * The touch surface. Takes `DateInput`'s props verbatim; see
 * {@link DateInput} for when it is chosen over the desktop control.
 */
export function TouchDateField({
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
  // Desktop-only: the scroller is a single continuously paged column, so a
  // second month would be the month already one flick away. Accepted (the
  // prop types are shared) and ignored.
  numberOfMonths: _numberOfMonths,
  weekStartsOn: weekStartsOnProp = 0,
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
    onClick: onClickProp,
    onKeyDown: onKeyDownProp,
    ...controlProps
  } = rest;
  const pressable = usePressFeedback();
  const t = useTranslator();
  const locale = useLocale();
  const isEffectivelyRequired = useResolvedRequired({isRequired, isOptional});
  const placeholder =
    placeholderFromProps ?? t('@astryx.dateInput.placeholder');
  const size = useSize(sizeProp, 'md');
  const weekStartsOn = normalizeDayOfWeek(weekStartsOnProp);

  const generatedID = useId();
  const id = idProp ?? generatedID;
  const fieldLabelID = useId();
  const inputLabelID = useId();
  const descriptionID = useId();
  const statusMessageID = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const mergedInputRef = useMergedRefs(ref, inputRef);
  const inputGroup = useInputGroup();

  const [, startTransition] = useTransition();
  const [optimisticValue, setOptimisticValue] = useOptimistic(value);
  const isBusy = isLoading || optimisticValue !== value;
  const isEffectivelyDisabled = isDisabled || isBusy;

  // Same contract as DateInput: a disabled or busy field never renders native
  // `disabled` (spec:AST-085 FR1); the input stays focusable via
  // aria-disabled. The disabled-reason tooltip's listeners attach to the
  // wrapper. Only the persistent disabled state surfaces a reason, never the
  // transient busy one.
  const showsDisabledMessage = isDisabled && !!disabledMessage;
  const disabledMessageTooltip = useTooltip({
    placement: 'above',
    focusTrigger: 'always',
    isEnabled: showsDisabledMessage,
  });

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
      statusTooltipDescribedBy,
      showsDisabledMessage ? disabledMessageTooltip.describedBy : null,
      ariaDescribedByProp,
    ],
    inputGroup,
  );

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const sheetBodyRef = useRef<HTMLDivElement | null>(null);
  // The busy Spinner is decorative; this control announces its busy start
  // (spec:AST-086 FR8). A date picked under a pending changeAction starts it
  // while the modal sheet is open, so it is announced from inside the sheet.
  useBusyAnnouncement(
    isBusy,
    t('@astryx.spinner.loading'),
    isSheetOpen ? sheetBodyRef : inputRef,
  );
  const [isWheelOpen, setIsWheelOpen] = useState(false);
  const scrollerHandleRef = useRef<MonthScrollerHandle | null>(null);
  // Pending focus handoff from the clear button; see handleClear.
  const clearFocusTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (clearFocusTimerRef.current != null) {
        clearTimeout(clearFocusTimerRef.current);
      }
    },
    [],
  );

  const today = useMemo(() => plainDateToday(), []);
  const selectedDate = useMemo(
    () =>
      optimisticValue != null && /^\d{4}-\d{2}-\d{2}$/.test(optimisticValue)
        ? plainDateFromISO(optimisticValue)
        : null,
    [optimisticValue],
  );

  // The reachable range. Explicit bounds win; otherwise the scroller reaches a
  // century in each direction from wherever it opened. Anchored once, in a
  // state initializer: recomputing it as the selection moves would shift every
  // pane's scroll offset under the user mid-gesture.
  const [anchorMonthIndex] = useState(() =>
    monthIndexOf(
      value != null && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? plainDateFromISO(value)
        : plainDateToday(),
    ),
  );
  const minMonthIndex =
    min != null
      ? monthIndexOf(plainDateFromISO(min))
      : anchorMonthIndex - DEFAULT_MONTH_REACH;
  const maxMonthIndex =
    max != null
      ? monthIndexOf(plainDateFromISO(max))
      : anchorMonthIndex + DEFAULT_MONTH_REACH;

  const [monthIndex, setMonthIndex] = useState(() =>
    clampIndex(anchorMonthIndex, minMonthIndex, maxMonthIndex),
  );

  const {year, month} = fromMonthIndex(monthIndex);

  /**
   * Three-letter weekday names — "Sun", not Calendar's "Su".
   *
   * The sheet is full width and the columns are ~51px, so there is room for
   * the form people actually read, and a picker operated by thumb should not
   * make anyone decode "Tu" against "Th".
   *
   * This is CLDR's `abbreviated` width, which `Intl` produces natively — no
   * truncation, so the 28 non-English locales stay correct rather than being
   * sliced to three characters. (Verified against the CLDR tables for all 30
   * locales in the catalog.) Calendar's 2-letter row is CLDR's *short* width,
   * which `Intl` cannot express, which is exactly why that surface needs a
   * generated table and this one does not.
   *
   * Built here rather than taken from `useCalendarDays`, which supplies the
   * short form for Calendar's own header. The rotation matches: day 4 of
   * January 1970 was a Sunday, so offsetting from it by `weekStartsOn` walks
   * the week in the same order the panes lay out their columns.
   */
  const dayNames = useMemo(
    () =>
      Array.from({length: 7}, (_, offset) =>
        plainDateFormat(
          {year: 1970, month: 1, day: 4 + ((weekStartsOn + offset) % 7)},
          DATE_FORMAT_WEEKDAY_ONLY,
          locale,
        ),
      ),
    [locale, weekStartsOn],
  );
  const monthYearLabel = plainDateFormat(
    {year, month, day: 1},
    DATE_FORMAT_MONTH_YEAR,
    locale,
  );

  // Formats the committed value only. A function format is called with the ISO
  // value; a named one reuses Timestamp's shared date mapping, so the same
  // literal renders the same shape here and on the desktop control.
  const displayValue =
    optimisticValue != null && /^\d{4}-\d{2}-\d{2}$/.test(optimisticValue)
      ? typeof format === 'function'
        ? format(optimisticValue)
        : formatSharedDate(plainDateFromISO(optimisticValue), format, locale)
      : '';

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

  const openSheet = useCallback(() => {
    if (!isEffectivelyDisabled) {
      // Always onto the calendar, whatever was showing last time. The wheels
      // are a detour taken to reach a far month, not a mode to be left in:
      // reopening into them would answer a question the user has not asked
      // yet, and hide the dates they came back for behind another tap.
      setIsWheelOpen(false);
      setIsSheetOpen(true);
    }
  }, [isEffectivelyDisabled]);

  const handleClear = useCallback(() => {
    fireChange(undefined);
    // Focus goes back to the field on the NEXT task, not synchronously.
    //
    // Clearing unmounts this button (it only renders while there is a value),
    // and focusing another element in the same task as that unmount makes iOS
    // Safari scroll the whole document to the top — the user is thrown from
    // wherever the field sat to the start of the page. Measured on the iOS 26
    // simulator against the live docsite, field at scrollY 2055: synchronous
    // focus lands at 0, deferred focus stays at 2055.
    //
    // `preventScroll` alone does NOT fix it (verified: still 0) — this is not
    // the browser's ordinary scroll-the-focused-element-into-view step, so the
    // deferral is the load-bearing half. It is kept because the reveal scroll
    // is real too, and unwanted for the same reason: the field the user just
    // tapped is already on screen (+12px on a plain page without it).
    //
    // Skipping the focus entirely would also stop the scroll, but then focus
    // dies with the unmounting button and lands on <body>.
    const field = inputRef.current;
    if (field == null) {
      return;
    }
    clearFocusTimerRef.current = window.setTimeout(() => {
      clearFocusTimerRef.current = null;
      field.focus({preventScroll: true});
    }, 0);
  }, [fireChange]);

  /**
   * Put the picker back to how it opens: no date, current month.
   *
   * Two things, because clearing a date and then being left staring at the
   * month of the date you just cleared is a half-finished action — the
   * calendar should look the way it does before anything is chosen.
   *
   * "If possible" is load-bearing: a range can exclude the current month
   * entirely (a booking window starting next quarter), and there is no
   * honest place to go in that case. `clampIndex` would silently land on the
   * nearest edge, which is a different month presented as if it were today's,
   * so the move is skipped instead and the calendar stays where it is. The
   * value is still cleared either way — that half never depends on the range.
   */
  const handleResetInSheet = useCallback(() => {
    fireChange(undefined);
    const currentMonth = monthIndexOf(today);
    if (currentMonth < minMonthIndex || currentMonth > maxMonthIndex) {
      return;
    }
    if (currentMonth === monthIndex) {
      return;
    }
    setMonthIndex(currentMonth);
    scrollerHandleRef.current?.scrollToMonth(currentMonth, 'smooth');
  }, [fireChange, today, monthIndex, minMonthIndex, maxMonthIndex]);

  // Selection commits on the tap and leaves the sheet up, so a mistake can be
  // corrected in place and a nearby date reconsidered without reopening.
  // Dismissal is the footer's Done (and the handle, the scrim, Escape) — none
  // of which commit anything, because this already has.
  const handleSelect = useCallback(
    (next: ISODateString) => {
      fireChange(next);
    },
    [fireChange],
  );

  // Whether there is anywhere to step. An arrow with nowhere to go is hidden
  // rather than disabled: a disabled control still says "this is a thing you
  // could do", and at the end of a range it is not — the range is the whole
  // truth, and there is no state the user can reach where it becomes
  // available. A greyed chevron sitting there permanently reads as broken.
  const canStepBack = monthIndex > minMonthIndex;
  const canStepForward = monthIndex < maxMonthIndex;

  // One month either way, clamped to the reachable range. Goes through the
  // same scrollToMonth the swipe settles on, so the arrows and the gesture
  // cannot disagree about where a month rests.
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

  // A wheel commit steers the scroller immediately, even though it is behind
  // the wheels: it keeps its layout box while hidden, so by the time the
  // wheels close it is already resting on the new month.
  const handleWheelChange = useCallback((next: number) => {
    setMonthIndex(next);
    scrollerHandleRef.current?.scrollToMonth(next, 'auto');
  }, []);

  /**
   * The calendar reports the month it has scrolled to — but only while it is
   * the surface being scrolled.
   *
   * While the wheels are up the wheels are the source of truth, and the
   * calendar is being STEERED by them: a wheel commit calls `scrollToMonth`
   * above, the calendar scrolls, and it would report that month straight back
   * here. That closes a cycle — wheel commits, calendar echoes, the echo moves
   * the wheel's selected row, the wheel is repositioned onto it, and the
   * resulting scroll reads as another commit.
   *
   * Whether that cycle converges depends on how precisely a browser reports
   * "scrolling stopped", which is not something to rely on. With `scrollend`
   * (Chrome) it settles at once; on iOS below Safari 26 there is no
   * `scrollend` and momentum runs on for a second or more after the finger
   * lifts, so each lap committed the next month along and the value climbed
   * on its own. Ignoring the echo removes the cycle instead of damping it.
   */
  const handleVisibleMonthChange = useCallback(
    (next: number) => {
      if (isWheelOpen) {
        return;
      }
      setMonthIndex(next);
    },
    [isWheelOpen],
  );

  /**
   * Put the calendar back where it belongs when the wheels close.
   *
   * The wheels steer it while it is hidden, and a hidden scroller is not a
   * reliable place to leave a scroll position: `visibility: hidden` keeps the
   * layout box, but iOS re-snaps the scroller when it becomes visible again,
   * and it does not necessarily re-snap to the pane we put it on. That fires
   * a scroll at the exact moment reports start being trusted again — which is
   * why the month drifted on the way back to the dates.
   *
   * Re-asserting is cheap when nothing moved (the scroller is already there,
   * so nothing scrolls) and exactly right when something did. `scrollToMonth`
   * marks the target as steered, so this correction does not report itself
   * back either.
   */
  // Read through a ref so this effect depends on the surface change alone.
  // Listing `monthIndex` would re-run it on every month the user swipes to,
  // yanking the scroller back mid-gesture.
  const monthIndexRef = useRef(monthIndex);
  monthIndexRef.current = monthIndex;
  useEffect(() => {
    if (isWheelOpen) {
      return;
    }
    scrollerHandleRef.current?.scrollToMonth(monthIndexRef.current, 'auto');
  }, [isWheelOpen]);

  // APG combobox keys. The field takes no text, so every printable key is
  // free — but only the documented openers are wired, so a stray keystroke
  // does not pop a sheet.
  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // Same guard core's pointer surface carries. This field is readOnly and
      // takes no composition of its own, but an IME sitting over it still
      // sends its committing Enter here first — and opening a date sheet on
      // the keystroke that finishes a Korean syllable is the same wrong
      // answer. See utils/ime.ts.
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
        openSheet();
      }
    },
    [openSheet],
  );

  const surface = (
    <div {...stylex.props(styles.surface)}>
      <div {...stylex.props(styles.header)}>
        <button
          type="button"
          onClick={() => setIsWheelOpen(open => !open)}
          aria-expanded={isWheelOpen}
          // One string, not a template: the comma and the word order are
          // the translator's to choose, not English's.
          aria-label={t('@astryx.dateInput.chooseMonthYear', {
            monthYear: monthYearLabel,
          })}
          // A `data-` hook rather than a theme target. `themeProps` would
          // publish `astryx-date-input-touch-title` as a themeable selector,
          // and this is internal structure of the sheet — the field and its
          // toggle icon are the documented targets, and nothing has asked to
          // restyle the header button. Adding a target later is additive;
          // withdrawing one is not.
          data-title="month-year"
          {...pressable}
          {...stylex.props(
            styles.title,
            interactionOverlayStyles.backgroundColor,
            focusOutlineStyles.focusVisible,
          )}>
          <span {...stylex.props(styles.titleText)}>{monthYearLabel}</span>
          <Icon
            icon="chevronDown"
            size="sm"
            color="secondary"
            // The transform rides on the Icon itself, not a wrapper span, so
            // the element a theme can target is the element that moves.
            xstyle={[
              styles.titleChevron,
              isWheelOpen && styles.titleChevronOpen,
            ]}
          />
        </button>
        {/* Both arrows at the trailing corner, as a pair — and only while the
            calendar is the surface they step. `IconButton` gives them
            Button's optical centring, focus ring, disabled treatment and hit
            area; the hand-rolled version had the glyph off-centre.

            Mirrored under RTL by the shared helper: "previous" is the earlier
            month, which sits on the right when the inline axis runs that way,
            and the panes mirror with it. */}
        <span
          data-arrows="months"
          // `inert` as well as the hidden styling: the fade keeps them
          // `visible` until it finishes, and a control that is on its way out
          // should not answer a click or a Tab in the meantime.
          inert={isWheelOpen ? true : undefined}
          {...stylex.props(
            styles.monthArrows,
            isWheelOpen && styles.monthArrowsHidden,
          )}>
          <IconButton
            variant="ghost"
            size="sm"
            xstyle={[
              styles.monthArrow,
              !canStepBack && styles.monthArrowUnavailable,
            ]}
            isDisabled={!canStepBack}
            onClick={() => stepMonth(-1)}
            label={t('@astryx.calendar.previousMonth')}
            icon={
              <span {...stylex.props(styles.monthArrowIcon, rtlStyles.mirror)}>
                <Icon icon="chevronLeft" size="sm" color="inherit" />
              </span>
            }
          />
          <IconButton
            variant="ghost"
            size="sm"
            xstyle={[
              styles.monthArrow,
              !canStepForward && styles.monthArrowUnavailable,
            ]}
            isDisabled={!canStepForward}
            onClick={() => stepMonth(1)}
            label={t('@astryx.calendar.nextMonth')}
            icon={
              <span {...stylex.props(styles.monthArrowIcon, rtlStyles.mirror)}>
                <Icon icon="chevronRight" size="sm" color="inherit" />
              </span>
            }
          />
        </span>
        {/* Reset, past the arrows, and gone with them on the wheels: the
            wheels choose a month, and there is no date there to put back.
            Hidden rather than unmounted, for the arrows' reason — the corner
            keeps its size, so the header cannot change height mid-swap. */}
        <span
          data-action="reset"
          inert={isWheelOpen ? true : undefined}
          {...stylex.props(
            styles.headerReset,
            isWheelOpen && styles.headerResetHidden,
          )}>
          <Button
            // ghost: a filled button up here would outrank the Save that
            // finishes the task.
            variant="ghost"
            size="sm"
            xstyle={styles.resetButton}
            label={t('@astryx.dateInput.resetPicking')}
            onClick={handleResetInSheet}
          />
        </span>
      </div>

      {/* Decorative: each day carries its weekday in its accessible name, so
          this row is not a header row for assistive technology — and it must
          live outside the scroller, or it would scroll away with the month. */}
      <div
        aria-hidden="true"
        {...stylex.props(
          styles.weekdays,
          isWheelOpen && styles.weekdaysHidden,
        )}>
        {dayNames.map(name => (
          <div key={name} {...stylex.props(styles.weekday)}>
            {name}
          </div>
        ))}
      </div>

      <div {...stylex.props(styles.body)}>
        <div
          data-panel="calendar"
          // `inert` as well as the hidden styling: the panel keeps its layout
          // box (so the scroller holds its position and the wheels can steer
          // it), which means without this it would still be tabbable behind
          // the layer on top.
          inert={isWheelOpen ? true : undefined}
          {...stylex.props(
            styles.panel,
            styles.panelBeneath,
            isWheelOpen && styles.panelBeneathHidden,
          )}>
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
            onSelect={handleSelect}
          />
        </div>
        <div
          data-panel="wheels"
          inert={isWheelOpen ? undefined : true}
          {...stylex.props(
            styles.panel,
            styles.panelOverlay,
            !isWheelOpen && styles.panelOverlayHidden,
          )}>
          <MonthYearWheels
            monthIndex={monthIndex}
            minMonthIndex={minMonthIndex}
            maxMonthIndex={maxMonthIndex}
            onChange={handleWheelChange}
            monthLabel={t('@astryx.dateInput.monthWheel')}
            yearLabel={t('@astryx.dateInput.yearWheel')}
            isActive={isWheelOpen}
          />
        </div>
      </div>

      {/* Done does NOT commit: a tap on a day has already fired onChange by
          the time it is reachable. It is a close button, exactly equivalent
          to the grab handle, the scrim and Escape — which is why it is safe
          for those to remain, and why there is no Cancel to pair it with.

          It sits alone. A "Today" button was here and only moved the calendar
          to the current month WITHOUT selecting it, which read as broken: the
          one thing a button called Today should obviously do is the thing it
          did not. Navigating and selecting are two different intents and it
          conflated them, so it is gone until it can be one or the other on
          purpose. Reaching today by scrolling still works. */}
      {/* No `inert` here: the two cells below take turns, so the footer as a
          whole is always live. It carried one while the footer was hidden
          entirely on the wheels, and leaving it behind made the wheels' own
          Done button unreachable — an inert ancestor disables everything
          inside it. */}
      <div {...stylex.props(styles.footer)}>
        {/* Both actions share one grid cell, the same way the panels above
            them do, and follow the same base/overlay rule — so the footer
            never changes height and the two never read as superimposed. Each
            belongs to a surface: Save finishes on the calendar, Done finishes
            the detour through the wheels. */}
        <div
          inert={isWheelOpen ? true : undefined}
          {...stylex.props(
            styles.footerAction,
            styles.panelBeneath,
            isWheelOpen && styles.panelBeneathHidden,
          )}>
          <Button
            variant="primary"
            // md, not sm: it is the action a thumb reaches for, so it gets
            // the comfortable size rather than the compact one the header's
            // ghost buttons use.
            size="md"
            width="100%"
            label={t('@astryx.dateInput.savePicking')}
            onClick={() => setIsSheetOpen(false)}
          />
        </div>
        <div
          inert={isWheelOpen ? undefined : true}
          {...stylex.props(
            styles.footerAction,
            styles.panelOverlay,
            !isWheelOpen && styles.panelOverlayHidden,
          )}>
          <Button
            // secondary, not primary: this one does not finish the task, it
            // finishes a step. Giving both surfaces a primary button would
            // say the wheels are somewhere you can complete from.
            variant="secondary"
            size="md"
            width="100%"
            label={t('@astryx.dateInput.doneChoosingMonth')}
            onClick={() => setIsWheelOpen(false)}
          />
        </div>
      </div>
    </div>
  );

  const inputWrapper = (
    <div
      ref={el => {
        // Anchor + hover/focus listeners for the disabled-message tooltip.
        // Gated internally by isEnabled, so attaching unconditionally is safe.
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
          styles.wrapper,
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
        onClick={openSheet}
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
          {...themeProps('date-input-toggle-icon', {
            state: isSheetOpen ? 'expanded' : 'collapsed',
          })}
        />
      </button>
      <input
        {...controlProps}
        ref={mergedInputRef}
        id={id}
        type="text"
        role="combobox"
        value={displayValue}
        // No typing on this surface: the picker is the input method, and the
        // virtual keyboard would cover the sheet it is meant to fill in.
        // readOnly blocks entry; inputMode="none" is what actually keeps the
        // keyboard down when the field takes focus.
        readOnly
        inputMode="none"
        onChange={() => {}}
        onClick={
          isEffectivelyDisabled
            ? undefined
            : chainEventHandlers(openSheet, onClickProp)
        }
        onKeyDown={chainEventHandlers(handleInputKeyDown, onKeyDownProp)}
        placeholder={placeholder}
        aria-disabled={isEffectivelyDisabled ? 'true' : undefined}
        aria-labelledby={
          ariaLabelledByProp != null
            ? joinAriaIDs(ariaLabelledBy ?? fieldLabelID, ariaLabelledByProp)
            : ariaLabelledBy
        }
        aria-describedby={ariaDescribedBy}
        aria-required={isEffectivelyRequired ? 'true' : undefined}
        aria-invalid={status?.type === 'error' ? 'true' : undefined}
        aria-busy={isBusy || undefined}
        aria-expanded={isSheetOpen}
        aria-haspopup="dialog"
        aria-autocomplete="none"
        autoComplete="off"
        {...stylex.props(
          styles.input,
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
      {statusIcon}
      <BottomSheet
        isOpen={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        label={t('@astryx.dateInput.dialogLabel')}
        // The picker is a fixed height by construction, so the sheet should be
        // exactly as tall as it is rather than claiming a viewport budget.
        height="hug"
        // sheetBody owns the inset, including the band under the grab handle.
        padding={0}>
        <div ref={sheetBodyRef} {...stylex.props(styles.sheetBody)}>
          {surface}
        </div>
      </BottomSheet>
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

TouchDateField.displayName = 'TouchDateField';
