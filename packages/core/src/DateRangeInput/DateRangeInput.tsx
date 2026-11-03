// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file DateRangeInput.tsx
 * @input Uses React, Field, Calendar (range mode), VisuallyHidden, usePopover
 * @output Exports DateRangeInput component, DateRangeInputProps
 * @position Core implementation; consumed by index.ts, tested by DateRangeInput.test.tsx
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/DateRangeInput/DateRangeInput.doc.mjs (props table, features, implementation notes)
 * - /packages/core/src/DateRangeInput/DateRangeInput.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/DateRangeInput/index.ts (exports if types change)
 * - /apps/storybook/stories/DateRangeInput.stories.tsx (storybook stories)
 * - /packages/cli/assets/templates/blocks/components/DateRangeInput/ (showcase blocks)
 */

import {
  useId,
  useCallback,
  useMemo,
  useOptimistic,
  useRef,
  useTransition,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {inputDisabledFocusStyles} from '../Field/inputDisabledFocus';
import {
  plainDateFromISO,
  plainDateToday,
  plainDateFormat,
  plainDateDiffDays,
  DATE_FORMAT_SHORT,
  DATE_FORMAT_SHORT_WITH_YEAR,
} from '../utils/plainDate';
import {
  colorVars,
  sizeVars,
  radiusVars,
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
} from '../Field';
import {Icon} from '../Icon';
import {Spinner} from '../Spinner';
import {VisuallyHidden} from '../VisuallyHidden';
import {
  Calendar,
  type ISODateString,
  type DateRange,
  type DayOfWeek,
  type DayOfWeekName,
} from '../Calendar';
import {useCalendarConstraints} from '../Calendar/hooks';
import {usePopover} from '../Popover';
import {useTooltip} from '../Tooltip';
import {mergeProps} from '../utils';
import {chainEventHandlers} from '../utils/chainEventHandlers';
import {joinAriaIDs} from '../utils/inputAria';
import {
  useFieldInputStyling,
  type FieldInputBaseProps,
} from '../Field/fieldParts';
import type {SizeValue} from '../utils/types';
import {useSize} from '../SizeContext/SizeContext';
import {useInputStatusIcon} from '../hooks/useInputStatusIcon';
import {useBusyAnnouncement} from '../hooks/useBusyAnnouncement';
import {useMergedRefs} from '../hooks/useMergedRefs';
import {useResolvedRequired} from '../hooks/useResolvedRequired';
import {themeProps} from '../utils/themeProps';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import {useLocale} from '../i18n';
import type {Locale} from '../i18n/types';
import type {FieldStatusPlacement} from '../Field/fieldStatusPlacement';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/DateRangeInput/DateRangeInput.generated';
import {layerViewportInset} from '../Layer/layerViewportInset.stylex';

registerEnglishFallback(english);

export type {DateRange} from '../Calendar';

export interface DateRangePreset {
  label: string;
  getRange: () => DateRange;
}

export type DateRangeInputSize = 'sm' | 'md' | 'lg';

export type {
  InputStatus as DateRangeInputStatus,
  InputStatusType as DateRangeInputStatusType,
} from '../Field';

const styles = stylex.create({
  trigger: {
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
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    textAlign: 'start',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  triggerPlaceholder: {
    color: colorVars['--color-text-secondary'],
  },
  triggerDisabled: {
    cursor: 'default',
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
  // The popover content scrolls inside the layer's block cap, so a stacked
  // calendar stays reachable on a short screen.
  popoverScroll: {
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    maxBlockSize: stylex.firstThatWorks(
      `calc(${layerViewportInset.maxBlockSize})`,
      `calc(${layerViewportInset.maxBlockSizeFallback})`,
    ),
  },
  // When the presets and a one-month calendar do not fit side by side, the
  // row wraps and the presets stack above the calendar, in DOM order. The
  // preset group draws a divider on its inline end and its block end. A
  // negative margin moves each divider 1 border width past the group's margin
  // box, and this row clips at its edges. Thus only the divider between the
  // two parts shows: the inline-end one side by side, the block-end one when
  // stacked. The row clips, not the scroller, so the overhang is never
  // scrollable overflow.
  popoverLayout: {
    display: 'flex',
    flexWrap: 'wrap',
    overflow: 'clip',
  },
  presetSidebar: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-1'],
    padding: spacingVars['--spacing-3'],
    borderInlineEndWidth: borderVars['--border-width'],
    borderInlineEndStyle: 'solid',
    borderInlineEndColor: colorVars['--color-border-emphasized'],
    borderBlockEndWidth: borderVars['--border-width'],
    borderBlockEndStyle: 'solid',
    borderBlockEndColor: colorVars['--color-border-emphasized'],
    marginInlineEnd: `calc(-1 * ${borderVars['--border-width']})`,
    marginBlockEnd: `calc(-1 * ${borderVars['--border-width']})`,
    // Alone on its line, the group fills the line, so its inline-end divider
    // reaches the clipped edge.
    flexGrow: 1,
    minWidth: 140,
  },
  calendarPane: {
    // Gives back the border width the preset group's margin takes, so the
    // calendar keeps its side-by-side position.
    marginInlineStart: borderVars['--border-width'],
    // The row wraps on the calendar's one-month width, and the calendar then
    // takes the free space, so its months sit in a row where they fit. The
    // large factor keeps the preset group at its own width beside it.
    flexBasis: 'min-content',
    flexGrow: 1_000_000,
  },
  presetButton: {
    display: 'block',
    width: '100%',
    padding: `${spacingVars['--spacing-1']} ${spacingVars['--spacing-2']}`,
    margin: 0,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radiusVars['--radius-element'],
    backgroundColor: {
      default: 'transparent',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': colorVars['--color-overlay-hover'],
      },
    },
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-label-size'],
    lineHeight: typeScaleVars['--text-label-leading'],
    color: colorVars['--color-text-primary'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    textAlign: 'start',
  },
  presetButtonActive: {
    backgroundColor: colorVars['--color-accent-muted'],
    color: colorVars['--color-accent'],
  },
  presetButtonDisabled: {
    color: colorVars['--color-text-disabled'],
    cursor: 'default',
    backgroundColor: 'transparent',
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

function formatRangeDisplay(range: DateRange | null, locale: Locale): string {
  if (!range) {
    return '';
  }
  const start = plainDateFromISO(range.start);
  const end = plainDateFromISO(range.end);
  const currentYear = plainDateToday().year;
  const sameYear = start.year === end.year && start.year === currentYear;

  const fmt = sameYear ? DATE_FORMAT_SHORT : DATE_FORMAT_SHORT_WITH_YEAR;
  return `${plainDateFormat(start, fmt, locale)} – ${plainDateFormat(end, fmt, locale)}`;
}

function isRangeEqual(a: DateRange | null, b: DateRange | null): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return a.start === b.start && a.end === b.end;
}

// A preset that would land outside the span bounds is disabled rather than
// allowed to override them: the cap is authoritative, so an out-of-window
// preset stays visible (discoverable) but non-committable, mirroring how the
// calendar disables out-of-window days. Spans count both endpoints.
function isRangeWithinSpan(
  range: DateRange,
  maxRangeSpan: number | undefined,
  minRangeSpan: number | undefined,
): boolean {
  if (maxRangeSpan == null && minRangeSpan == null) {
    return true;
  }
  const span =
    Math.abs(
      plainDateDiffDays(
        plainDateFromISO(range.start),
        plainDateFromISO(range.end),
      ),
    ) + 1;
  if (maxRangeSpan != null && span > maxRangeSpan) {
    return false;
  }
  if (minRangeSpan != null && span < minRangeSpan) {
    return false;
  }
  return true;
}

export interface DateRangeInputProps extends Omit<
  FieldInputBaseProps<HTMLButtonElement>,
  'onChange' | 'defaultValue'
> {
  /** Ref forwarded to the trigger button */
  ref?: React.Ref<HTMLButtonElement>;

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
   * keyboard focus, and the trigger is described by it, so the reason is
   * discoverable by keyboard and assistive technology. Activation stays
   * blocked.
   *
   * Use this instead of wrapping a disabled input in `Tooltip`, so the
   * reason is tied to the field.
   *
   * @example
   * ```
   * <DateRangeInput
   *   label="Reporting period"
   *   value={range}
   *   onChange={setRange}
   *   isDisabled
   *   disabledMessage="You need the Editor role to change this"
   * />
   * ```
   */
  disabledMessage?: string;

  /**
   * The selected date range, or null if no range is selected.
   */
  value: DateRange | null;

  /**
   * Callback fired when the date range changes.
   * Called with null when the range is cleared.
   */
  onChange: (value: DateRange | null) => void;

  /**
   * Async action on change. Fires after onChange.
   */
  changeAction?: (value: DateRange | null) => void | Promise<void>;

  /**
   * Whether the input is in a loading state.
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
   * Custom date constraint functions.
   * A date is disabled if ANY function returns false.
   */
  dateConstraints?: ReadonlyArray<(date: Date) => boolean>;

  /**
   * Maximum number of days the selected range may span, counting both
   * endpoints — `maxRangeSpan={7}` allows a 7-day window (start + 6 days).
   * Once a start date is picked, days beyond this distance from it are
   * disabled, so the user can't stretch the range past the cap. Use for
   * rolling windows like "at most a week from the chosen day"; for fixed
   * calendar bounds use `min`/`max`.
   *
   * This constrains selection only — it never rewrites a `value` that is
   * already wider than the cap. Surface such a value with `status` if you
   * need to flag it. A `preset` whose range violates the cap is disabled
   * (shown but not committable) rather than allowed to override it.
   */
  maxRangeSpan?: number;

  /**
   * Minimum number of days the selected range must span, counting both
   * endpoints — `minRangeSpan={2}` forbids a single-day range. Once a start
   * date is picked, days closer than this to it are disabled — except the
   * start itself, which stays selectable. Clicking the start again commits a
   * one-day range when the minimum allows it; otherwise it cancels the
   * in-progress selection so the start can be moved. Defaults to 1 (a
   * same-day start and end is allowed).
   */
  minRangeSpan?: number;

  /**
   * Preset date ranges shown as quick-select options beside the calendar.
   * A preset is disabled when either endpoint violates `min`, `max`, or
   * `dateConstraints`, or when its span violates `minRangeSpan` or
   * `maxRangeSpan`.
   */
  presets?: ReadonlyArray<DateRangePreset>;

  /**
   * Whether to show a clear button when a range is selected.
   * @default true
   */
  hasClear?: boolean;

  /**
   * Placeholder text shown when no range is selected.
   * @default "Select date range"
   */
  placeholder?: string;

  /**
   * The size of the trigger.
   * @default 'md'
   */
  size?: DateRangeInputSize;

  /**
   * Status indicator for the input.
   */
  status?: InputStatus;
  /**
   * How the status message is placed relative to the input.
   * - 'attached': message overlaps directly below the input (bordered treatment)
   * - 'detached': message floats below as a separate element with spacing
   * - 'tooltip': no message box; the status icon becomes a focusable info-tip button that reveals the message on hover, keyboard focus, or tap
   * @default 'attached'
   */
  statusVariant?: FieldStatusPlacement;

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
   * Number of months to display in the calendar.
   * @default 2
   */
  numberOfMonths?: 1 | 2;

  /**
   * First day of week in the calendar. Accepts a number
   * (0 = Sunday … 6 = Saturday) or a three-letter day name ('sun'–'sat',
   * case-insensitive).
   * @default 0
   */
  weekStartsOn?: DayOfWeek | DayOfWeekName;
}

/**
 * A date range picker with a button trigger that opens a popover
 * containing a dual-month calendar and optional preset ranges.
 *
 * Base props (`ref`, `id`, `data-*`, `aria-*`, DOM event handlers) go to the range trigger.
 * A DOM handler runs after the component's own handler for the same event
 * and still receives events the component handled, even ones it called
 * `preventDefault` on, so it cannot cancel built-in behavior.
 *
 * @example
 * ```
 * <DateRangeInput
 *   label="Date range"
 *   value={range}
 *   onChange={setRange}
 *   presets={[
 *     { label: "Last 7 days", getRange: () => ({start: "...", end: "..."}) },
 *   ]}
 * />
 * ```
 */
export function DateRangeInput({
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
  maxRangeSpan,
  minRangeSpan,
  presets,
  hasClear = true,
  placeholder: placeholderFromProps,
  size: sizeProp,
  status,
  statusVariant = 'attached',
  labelTooltip,
  numberOfMonths = 2,
  weekStartsOn,
  width,
  containerXstyle,
  containerClassName,
  containerStyle,
  controlXstyle,
  controlClassName,
  controlStyle,
  ref,
  ...restProps
}: DateRangeInputProps) {
  const {rest, container} = useFieldInputStyling('DateRangeInput', restProps, {
    containerXstyle,
    containerClassName,
    containerStyle,
  });
  const {
    id: idProp,
    'aria-describedby': ariaDescribedByProp,
    'aria-label': ariaLabelProp,
    'aria-labelledby': ariaLabelledByProp,
    onClick: onClickProp,
    ...controlProps
  } = rest;
  const t = useComponentTranslator();
  const locale = useLocale();
  const isEffectivelyRequired = useResolvedRequired({isRequired, isOptional});
  const placeholder =
    placeholderFromProps ?? t('@astryx.dateRangeInput.placeholder');
  const size = useSize(sizeProp, 'md');
  const generatedID = useId();
  const id = idProp ?? generatedID;
  const triggerNameID = useId();
  const descriptionID = useId();
  const statusMessageID = useId();
  const requiredID = useId();

  const [, startTransition] = useTransition();
  const [optimisticValue, setOptimisticValue] = useOptimistic(value);
  const isBusy = isLoading || optimisticValue !== value;
  const isEffectivelyDisabled = isDisabled || isBusy;

  // A disabled or busy field never renders native `disabled` (spec:AST-085
  // FR1): its buttons stay focusable via aria-disabled, and activation is
  // blocked by the isEffectivelyDisabled guard in handleToggle. The
  // disabled-reason tooltip's listeners attach to the trigger container. Only
  // the persistent isDisabled state (not the transient busy state) surfaces a
  // reason.
  const showsDisabledMessage = isDisabled && !!disabledMessage;
  const disabledMessageTooltip = useTooltip({
    placement: 'above',
    // The container div is not naturally focusable; focusin bubbles up from
    // the trigger button, so always attach focus listeners.
    focusTrigger: 'always',
    isEnabled: showsDisabledMessage,
  });

  const {statusIcon, describedBy: statusTooltipDescribedBy} =
    useInputStatusIcon({
      status,
      statusVariant,
    });

  const ariaDescribedBy =
    [
      description ? descriptionID : null,
      statusVariant !== 'tooltip' && status?.message ? statusMessageID : null,
      // The tooltip variant renders no message box; describe the input by the
      // tooltip's content instead so the status is still announced.
      statusTooltipDescribedBy,
      // A button cannot carry aria-required. Mirror the input-family pattern
      // by describing it with localized, visually hidden required text.
      isEffectivelyRequired ? requiredID : null,
      showsDisabledMessage ? disabledMessageTooltip.describedBy : null,
      ariaDescribedByProp,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

  const displayValue = useMemo(
    () => formatRangeDisplay(optimisticValue, locale),
    [optimisticValue, locale],
  );

  const popover = usePopover({
    dialogLabel: t('@astryx.dateRangeInput.dialogLabel'),
    closeButtonLabel: t('@astryx.dateInput.closeCalendar'),
  });
  const {isDateDisabled} = useCalendarConstraints({
    min,
    max,
    dateConstraints,
  });

  const fireChange = useCallback(
    (newValue: DateRange | null) => {
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

  const handleToggle = useCallback(() => {
    if (!isEffectivelyDisabled) {
      if (popover.isOpen) {
        popover.hide();
      } else {
        popover.show();
      }
    }
  }, [isEffectivelyDisabled, popover]);

  const handleRangeSelect = useCallback(
    (range: DateRange) => {
      if (isDisabled) {
        return;
      }
      fireChange(range);
      popover.hide();
    },
    [isDisabled, fireChange, popover],
  );

  const triggerRef = useRef<HTMLButtonElement>(null);
  // The busy Spinner is decorative; this control announces its busy start
  // (spec:AST-086 FR8).
  useBusyAnnouncement(isBusy, t('@astryx.spinner.loading'), triggerRef);
  const triggerButtonRef = useMergedRefs<HTMLButtonElement>(triggerRef, ref);

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      fireChange(null);
      // A keyboard activation (detail 0) leaves focus on the clear button,
      // which unmounts once the range is null and would drop focus to <body>;
      // hand it to the trigger. A pointer press never focuses the button, so
      // there is no focus to repair.
      if (e.detail === 0) {
        triggerRef.current?.focus();
      }
    },
    [fireChange],
  );

  const triggerAriaLabel = optimisticValue
    ? `${label}: ${displayValue}`
    : `${label}: ${placeholder}`;

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
      isDisabled={isEffectivelyDisabled}
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
      <div
        ref={el => {
          popover.triggerRef(el);
          // Anchor + hover/focus listeners for the disabled-message tooltip.
          // Handlers are gated internally by isEnabled, and anchor names
          // compose, so attaching unconditionally is safe.
          disabledMessageTooltip.ref(el);
        }}
        {...mergeProps(
          themeProps('date-range-input', {
            size,
            status: status?.type ?? null,
            disabled: isDisabled ? 'disabled' : null,
          }),
          stylex.props(
            inputWrapperStyles.base,
            sizeStyles[size],
            isEffectivelyDisabled && inputWrapperStyles.disabled,
            isEffectivelyDisabled && inputDisabledFocusStyles.withinRing,
            status && inputStatusBorderStyles[status.type],
            status &&
              !isEffectivelyDisabled &&
              inputStatusHoverShadowStyles[status.type],
            status && inputStatusFocusWithinStyles[status.type],
            controlXstyle,
          ),
          controlClassName,
          controlStyle,
        )}>
        <button
          type="button"
          onClick={handleToggle}
          aria-disabled={isEffectivelyDisabled || undefined}
          aria-label={
            popover.isOpen
              ? t('@astryx.dateInput.toggleCalendarClose')
              : t('@astryx.dateInput.openCalendar')
          }
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
            {...themeProps('date-range-input-toggle-icon', {
              state: popover.isOpen ? 'expanded' : 'collapsed',
            })}
          />
        </button>
        <button
          {...controlProps}
          ref={triggerButtonRef}
          id={id}
          type="button"
          // The browser still dispatches a click on an aria-disabled button,
          // so a caller's onClick is skipped too (spec:AST-085 FR2).
          onClick={
            isEffectivelyDisabled
              ? undefined
              : chainEventHandlers(handleToggle, onClickProp)
          }
          aria-disabled={isEffectivelyDisabled ? 'true' : undefined}
          // A caller aria-label replaces the trigger's name; a caller
          // aria-labelledby is read after it (label and selected range).
          aria-label={ariaLabelProp ?? triggerAriaLabel}
          aria-labelledby={
            ariaLabelledByProp != null
              ? joinAriaIDs(triggerNameID, ariaLabelledByProp)
              : undefined
          }
          aria-describedby={ariaDescribedBy}
          aria-invalid={status?.type === 'error' ? 'true' : undefined}
          aria-busy={isBusy || undefined}
          aria-expanded={popover.isOpen}
          aria-haspopup="dialog"
          aria-controls={popover.isOpen ? popover.id : undefined}
          {...stylex.props(
            styles.trigger,
            !displayValue && styles.triggerPlaceholder,
            isEffectivelyDisabled && styles.triggerDisabled,
          )}>
          {displayValue || placeholder}
        </button>
        {hasClear && value !== null && !isEffectivelyDisabled && (
          <InputClearButton
            label={t('@astryx.dateInput.clear', {label})}
            onClick={handleClear}
          />
        )}
        {ariaLabelledByProp != null && (
          <VisuallyHidden id={triggerNameID}>
            {ariaLabelProp ?? triggerAriaLabel}
          </VisuallyHidden>
        )}
        {isBusy && <Spinner size="sm" aria-hidden="true" />}
        {statusIcon}
      </div>
      {isEffectivelyRequired && (
        <VisuallyHidden id={requiredID}>
          {t('@astryx.field.required')}
        </VisuallyHidden>
      )}
      {popover.render(
        <div {...stylex.props(styles.popoverScroll)}>
          <div {...stylex.props(styles.popoverLayout)}>
            {presets && presets.length > 0 && (
              <div
                role="group"
                aria-label={t('@astryx.dateRangeInput.presetDateRanges')}
                {...mergeProps(
                  themeProps('date-range-input-presets'),
                  stylex.props(styles.presetSidebar),
                )}>
                {presets.map(preset => {
                  const presetRange = preset.getRange();
                  const isActive = isRangeEqual(value, presetRange);
                  const isPresetDisabled =
                    isDisabled ||
                    !isRangeWithinSpan(
                      presetRange,
                      maxRangeSpan,
                      minRangeSpan,
                    ) ||
                    isDateDisabled(plainDateFromISO(presetRange.start)) ||
                    isDateDisabled(plainDateFromISO(presetRange.end));
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      // These presets are independent action buttons navigated by
                      // Tab, not a single-tab-stop listbox — so they are a labeled
                      // group of buttons, and the currently-applied preset is
                      // marked with aria-current (not aria-selected, a listbox
                      // concept that contradicted the Tab interaction) (forms-5).
                      aria-current={isActive ? 'true' : undefined}
                      // Focusable while disabled (AR3, spec:AST-085 FR1).
                      aria-disabled={isPresetDisabled || undefined}
                      aria-describedby={
                        showsDisabledMessage
                          ? disabledMessageTooltip.describedBy
                          : undefined
                      }
                      onClick={() => {
                        if (!isPresetDisabled) {
                          handleRangeSelect(presetRange);
                        }
                      }}
                      {...mergeProps(
                        themeProps('date-range-input-preset', {
                          selected: isActive ? 'selected' : null,
                          disabled: isPresetDisabled ? 'disabled' : null,
                        }),
                        stylex.props(
                          focusOutlineStyles.focusVisible,
                          styles.presetButton,
                          isActive && styles.presetButtonActive,
                          isPresetDisabled && styles.presetButtonDisabled,
                        ),
                      )}>
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            )}
            {/* The layer renders its children open or closed, so mount the
              calendar only while it is open. */}
            {popover.isOpen && (
              <Calendar
                mode="range"
                value={optimisticValue}
                onChange={handleRangeSelect}
                min={min}
                max={max}
                dateConstraints={dateConstraints}
                maxRangeSpan={maxRangeSpan}
                minRangeSpan={minRangeSpan}
                numberOfMonths={numberOfMonths}
                weekStartsOn={weekStartsOn}
                xstyle={presets && presets.length > 0 && styles.calendarPane}
              />
            )}
          </div>
        </div>,
        {placement: 'below', alignment: 'start'},
      )}

      {showsDisabledMessage &&
        disabledMessageTooltip.renderTooltip(disabledMessage)}
    </Field>
  );
}

DateRangeInput.displayName = 'DateRangeInput';
