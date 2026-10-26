// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TouchTimeField.tsx
 * @input Uses React, Field, BottomSheet, Wheel, DateInput touch geometry
 *   tokens, and shared time utilities
 * @output Exports TouchTimeField — the bottom-sheet surface behind TimeInput
 * @position Internal component; consumed by TimeInput.tsx for `presentation`
 *   sheet surfaces (`spec:AST-043` DEC-3: the time half of DateTimeInput's sheet)
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/TimeInput/TimeInput.tsx
 * - /packages/core/src/TimeInput/TimeInput.doc.mjs
 * - /packages/core/src/DateTimeInput/TouchDateTimeField.tsx (wheel behavior)
 */

import {
  useCallback,
  useId,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {BottomSheet} from '../BottomSheet';
import {Button} from '../Button';
import {
  Field,
  InputClearButton,
  inputWrapperStyles,
  inputStatusBorderStyles,
  inputStatusHoverShadowStyles,
  inputStatusFocusWithinStyles,
} from '../Field';
import {useInputGroup} from '../InputGroup/InputGroupContext';
import {useFieldInputStyling} from '../Field/fieldParts';
import {joinAriaIDs} from '../utils/inputAria';
import {groupStyles, inputGroupItemProps} from '../InputGroup/groupStyles';
import {useInputStatusIcon} from '../hooks/useInputStatusIcon';
import {useBusyAnnouncement} from '../hooks/useBusyAnnouncement';
import {useMergedRefs} from '../hooks/useMergedRefs';
import {useResolvedRequired} from '../hooks/useResolvedRequired';
import {Icon} from '../Icon';
import {useTranslator} from '../i18n';
import {colorVars, sizeVars, spacingVars} from '../theme/tokens.stylex';
import {useSize} from '../SizeContext/SizeContext';
import {Spinner} from '../Spinner';
import {useTooltip} from '../Tooltip';
import {Wheel, type WheelOption} from '../DateInput/Wheel';
import {dateInputTouchGeometry} from '../DateInput/tokens.stylex';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import {themeProps} from '../utils/themeProps';
import {
  clampTime,
  formatDisplayTime12h,
  formatDisplayTime24h,
  formatISOTime,
  getInputARIA,
  isTimeInRange,
  mergeProps,
  parseISOTime,
  type ISOTimeString,
} from '../utils';
import {chainEventHandlers} from '../utils/chainEventHandlers';
import type {TimeInputProps} from './TimeInput';

const sizeStyles = stylex.create({
  sm: {height: sizeVars['--size-element-sm'], minWidth: 120},
  md: {height: sizeVars['--size-element-md'], minWidth: 120},
  lg: {height: sizeVars['--size-element-lg'], minWidth: 120},
});

const styles = stylex.create({
  // Same as TimeInput's: the focus ring for a focused disabled field.
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
    flexShrink: 0,
  },
  input: {
    display: 'block',
    flex: 1,
    minWidth: 0,
    borderWidth: 0,
    borderStyle: 'none',
    padding: 0,
    backgroundColor: 'transparent',
    outline: 'none',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  // Sheet chrome mirrors TouchDateTimeField: `touchSheetBody` insets (the
  // BottomSheet handle floats over the panel, so the wrapper supplies the top
  // clearance and the side/bottom insets) flattened with `touchPanel`'s column
  // layout, which is the wheels' direct parent there and spaces the footer.
  sheetBody: {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    inlineSize: '100%',
    minInlineSize: 0,
    gap: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-4'],
    paddingBlockStart: spacingVars['--spacing-6'],
    paddingBlockEnd: spacingVars['--spacing-4'],
  },
  wheels: {
    display: 'flex',
    inlineSize: '100%',
    minInlineSize: 0,
    blockSize: dateInputTouchGeometry.paneBlockSize,
    gap: spacingVars['--spacing-2'],
  },
  footer: {
    display: 'flex',
    marginBlockStart: 'auto',
    paddingBlockStart: spacingVars['--spacing-1'],
  },
});

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

function timeToSeconds(time: ISOTimeString | undefined): number | null {
  if (time == null) {
    return null;
  }
  const parsed = parseISOTime(time);
  return parsed == null
    ? null
    : parsed.hour * 3600 + parsed.minute * 60 + parsed.second;
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

/**
 * The Astryx bottom-sheet time surface: a read-only closed field that opens
 * hour/minute(/second/meridiem) wheels in a BottomSheet. Wheels commit live,
 * clamped to `min`/`max`; the footer Save button only closes the sheet.
 */
export function TouchTimeField({
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
  hourFormat = '12h',
  // Typed-field only: the wheels step by their own options and the sheet
  // opens on tap, so neither reaches this surface.
  increment: _increment,
  hasAutoFocus: _hasAutoFocus,
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
  ...restProps
}: TimeInputProps) {
  const {rest, container} = useFieldInputStyling('TimeInput', restProps, {
    containerXstyle,
    containerClassName,
    containerStyle,
  });
  const {
    id: idProp,
    'aria-describedby': ariaDescribedByProp,
    'aria-labelledby': ariaLabelledByProp,
    onClick: onClickProp,
    ...controlProps
  } = rest;
  const t = useTranslator();
  const isEffectivelyRequired = useResolvedRequired({isRequired, isOptional});
  const placeholder =
    placeholderFromProps ?? t('@astryx.timeInput.placeholder');
  const size = useSize(sizeProp, 'md');
  const generatedID = useId();
  const id = idProp ?? generatedID;
  const fieldLabelID = useId();
  const inputLabelID = useId();
  const descriptionID = useId();
  const statusMessageID = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const mergedInputRef = useMergedRefs(ref, inputRef);
  const inputGroup = useInputGroup();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [, startTransition] = useTransition();
  const [optimisticValue, setOptimisticValue] = useOptimistic(value);
  const isBusy = isLoading || optimisticValue !== value;
  const sheetBodyRef = useRef<HTMLDivElement | null>(null);
  // The busy Spinner is decorative; this control announces its busy start
  // (spec:AST-086 FR8). A change made in the open modal sheet starts it while
  // the sheet is open, so it is announced from inside the sheet.
  useBusyAnnouncement(
    isBusy,
    t('@astryx.spinner.loading'),
    isSheetOpen ? sheetBodyRef : inputRef,
  );
  const isEffectivelyDisabled = isDisabled || isLoading;

  const showsDisabledMessage = isDisabled && !!disabledMessage;
  const disabledMessageTooltip = useTooltip({
    placement: 'above',
    focusTrigger: 'always',
    isEnabled: showsDisabledMessage,
  });
  const {statusIcon, describedBy: statusTooltipDescribedBy} =
    useInputStatusIcon({status, statusVariant, isInGroup: !!inputGroup});
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

  const fireChange = useCallback(
    (newValue: ISOTimeString | undefined) => {
      if (isEffectivelyDisabled) {
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
    [changeAction, isEffectivelyDisabled, onChange, setOptimisticValue],
  );

  const formatDisplayTime =
    hourFormat === '12h' ? formatDisplayTime12h : formatDisplayTime24h;
  const displayValue = optimisticValue
    ? formatDisplayTime(optimisticValue, hasSeconds)
    : '';

  const fallbackTime = useMemo(() => {
    const now = new Date();
    return formatISOTime(
      {
        hour: now.getHours(),
        minute: now.getMinutes(),
        second: now.getSeconds(),
      },
      hasSeconds,
    );
  }, [hasSeconds]);
  const parsedWheelTime = useMemo(
    () =>
      parseISOTime(optimisticValue ?? fallbackTime) ?? {
        hour: 0,
        minute: 0,
        second: 0,
      },
    [fallbackTime, optimisticValue],
  );

  const composeWheelTime = useCallback(
    (patch: {
      hour24?: number;
      hour12?: number;
      minute?: number;
      second?: number;
      meridiem?: number;
    }): ISOTimeString => {
      const meridiem = patch.meridiem ?? (parsedWheelTime.hour < 12 ? 0 : 1);
      let hour = parsedWheelTime.hour;
      if (patch.hour24 !== undefined) {
        hour = patch.hour24;
      } else if (patch.hour12 !== undefined) {
        hour = hour24From12(patch.hour12, meridiem);
      } else if (patch.meridiem !== undefined) {
        hour = hour24From12(hour12From24(hour), patch.meridiem);
      }
      return formatISOTime(
        {
          hour,
          minute: patch.minute ?? parsedWheelTime.minute,
          second: hasSeconds ? (patch.second ?? parsedWheelTime.second) : 0,
        },
        hasSeconds,
      );
    },
    [hasSeconds, parsedWheelTime],
  );

  const commitWheelTime = useCallback(
    (rawTime: ISOTimeString) => {
      const next = clampTime(rawTime, min, max, hasSeconds);
      if (next !== optimisticValue && isTimeInRange(next, min, max)) {
        fireChange(next);
      }
    },
    [fireChange, hasSeconds, max, min, optimisticValue],
  );

  const hourOptions: WheelOption[] = useMemo(() => {
    if (hourFormat === '24h') {
      return Array.from({length: 24}, (_, hour) => ({
        value: hour,
        label: twoDigits(hour),
        isDisabled: !rangeOverlaps(hour * 3600, hour * 3600 + 3599, min, max),
      }));
    }
    const meridiem = parsedWheelTime.hour < 12 ? 0 : 1;
    return Array.from({length: 12}, (_, index) => {
      const hour = index + 1;
      const hour24 = hour24From12(hour, meridiem);
      return {
        value: hour,
        label: String(hour),
        isDisabled: !rangeOverlaps(
          hour24 * 3600,
          hour24 * 3600 + 3599,
          min,
          max,
        ),
      };
    });
  }, [hourFormat, max, min, parsedWheelTime.hour]);

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
            min,
            max,
          ),
        };
      }),
    [hasSeconds, max, min, parsedWheelTime.hour],
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
          min,
          max,
        ),
      })),
    [max, min, parsedWheelTime.hour, parsedWheelTime.minute],
  );

  const meridiemOptions: WheelOption[] = useMemo(
    () => [
      {
        value: 0,
        label: t('@astryx.dateTimeInput.meridiemAM'),
        isDisabled: !rangeOverlaps(0, 11 * 3600 + 3599, min, max),
      },
      {
        value: 1,
        label: t('@astryx.dateTimeInput.meridiemPM'),
        isDisabled: !rangeOverlaps(12 * 3600, 23 * 3600 + 3599, min, max),
      },
    ],
    [max, min, t],
  );

  const openSheet = useCallback(() => {
    if (!isEffectivelyDisabled) {
      setIsSheetOpen(true);
    }
  }, [isEffectivelyDisabled]);

  const inputWrapper = (
    <div
      ref={el => {
        disabledMessageTooltip.ref(el);
      }}
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
      <button
        type="button"
        onClick={openSheet}
        aria-disabled={isEffectivelyDisabled || undefined}
        aria-label={t('@astryx.timeInput.openPicker', {label})}
        tabIndex={-1}
        {...stylex.props(focusOutlineStyles.focusVisible, styles.iconButton)}>
        <Icon icon="clock" size="sm" color="secondary" />
      </button>
      <input
        {...controlProps}
        ref={mergedInputRef}
        id={id}
        type="text"
        role="combobox"
        value={displayValue}
        readOnly
        inputMode="none"
        onChange={() => {}}
        onClick={
          isEffectivelyDisabled
            ? undefined
            : chainEventHandlers(openSheet, onClickProp)
        }
        // Enter would submit a surrounding form while disabled (FR2).
        onKeyDown={chainEventHandlers((e: KeyboardEvent<HTMLInputElement>) => {
          if (isEffectivelyDisabled && e.key === 'Enter') {
            e.preventDefault();
          }
        }, controlProps.onKeyDown)}
        placeholder={placeholder}
        aria-disabled={isEffectivelyDisabled ? 'true' : undefined}
        aria-describedby={ariaDescribedBy}
        aria-required={isEffectivelyRequired ? 'true' : undefined}
        aria-invalid={status?.type === 'error' ? 'true' : undefined}
        aria-busy={isBusy || undefined}
        aria-expanded={isSheetOpen}
        aria-haspopup="dialog"
        aria-autocomplete="none"
        autoComplete="off"
        aria-labelledby={
          ariaLabelledByProp != null
            ? joinAriaIDs(ariaLabelledBy ?? fieldLabelID, ariaLabelledByProp)
            : ariaLabelledBy
        }
        {...stylex.props(styles.input)}
      />
      {isBusy && <Spinner size="sm" aria-hidden="true" />}
      {hasClear && optimisticValue && !isEffectivelyDisabled && (
        <InputClearButton
          label={t('@astryx.timeInput.clearLabel', {label})}
          onClick={() => fireChange(undefined)}
        />
      )}
      {statusIcon}
      <BottomSheet
        isOpen={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        label={label}
        height="hug"
        // sheetBody owns the inset, including the band under the grab handle.
        padding={0}>
        <div ref={sheetBodyRef} {...stylex.props(styles.sheetBody)}>
          <div {...stylex.props(styles.wheels)}>
            <Wheel
              label={t('@astryx.dateTimeInput.hourWheel')}
              options={hourOptions}
              value={
                hourFormat === '24h'
                  ? parsedWheelTime.hour
                  : hour12From24(parsedWheelTime.hour)
              }
              isActive={isSheetOpen}
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
              isActive={isSheetOpen}
              onChange={minute => commitWheelTime(composeWheelTime({minute}))}
            />
            {hasSeconds && (
              <Wheel
                label={t('@astryx.dateTimeInput.secondWheel')}
                options={secondOptions}
                value={parsedWheelTime.second}
                isActive={isSheetOpen}
                onChange={second => commitWheelTime(composeWheelTime({second}))}
              />
            )}
            {hourFormat === '12h' && (
              <Wheel
                label={t('@astryx.dateTimeInput.meridiemWheel')}
                options={meridiemOptions}
                value={parsedWheelTime.hour < 12 ? 0 : 1}
                isActive={isSheetOpen}
                onChange={meridiem =>
                  commitWheelTime(composeWheelTime({meridiem}))
                }
              />
            )}
          </div>
          <div {...stylex.props(styles.footer)}>
            <Button
              variant="primary"
              size="md"
              width="100%"
              label={t('@astryx.dateInput.savePicking')}
              onClick={() => setIsSheetOpen(false)}
            />
          </div>
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

TouchTimeField.displayName = 'TouchTimeField';
