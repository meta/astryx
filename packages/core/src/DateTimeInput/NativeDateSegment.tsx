// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file NativeDateSegment.tsx
 * @input Uses React, Icon, nativeDateSegments, and DateTimeInput's date state
 * @output Exports NativeDateSegment — the OS-picker date half of DateTimeInput
 * @position Internal DateTimeInput surface selected by `nativePicker`
 *
 * Hands date picking to the platform through `<input type="date">`. Its
 * sibling NativeTimeSegment hands time picking to `<input type="time">`, so
 * both halves of DateTimeInput follow the same `nativePicker` choice.
 *
 * The input is deliberately uncontrolled and observed through native event
 * listeners. On iOS, writing its value while the picker sheet is open can
 * detach the sheet, and React's synthetic change event does not reliably see
 * picker edits. External values therefore reconcile only while unfocused.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/DateTimeInput/DateTimeInput.tsx (surface selection)
 * - /packages/core/src/DateTimeInput/NativePickerSegments.test.tsx (tests)
 * - /packages/core/src/DateTimeInput/DateTimeInput.doc.mjs (prop docs)
 */

import {useCallback, useEffect, useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {
  FieldInputBaseProps,
  FieldPartStyleProps,
} from '../Field/fieldParts';
import {hasEditableDateSegments} from '../DateInput/nativeDateSegments';
import {useMediaQuery} from '../hooks/useMediaQuery';
import {useMergedRefs} from '../hooks/useMergedRefs';
import {Icon} from '../Icon';
import {useLocale, useTranslator} from '../i18n';
import {VisuallyHidden} from '../VisuallyHidden';
import {
  focusOutlineStyles,
  formatSharedDate,
  parseDateInput,
  plainDateFromISO,
  plainDateToISO,
  themeProps,
  type ISODateString,
} from '../utils';
import {chainEventHandlers} from '../utils/chainEventHandlers';
import type {InputStatusType} from '../Field';
import {nativePickerSegmentStyles as styles} from './nativePickerSegmentStyles';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type NativeDateSegmentProps = {
  id: string;
  inputRef: React.Ref<HTMLInputElement>;
  value?: ISODateString;
  onChange: (value: ISODateString | undefined) => void;
  placeholder: string;
  min?: ISODateString;
  max?: ISODateString;
  isDateDisabled: (date: ReturnType<typeof plainDateFromISO>) => boolean;
  isEffectivelyDisabled: boolean;
  /** While disabled, stay focusable: aria-disabled and readOnly, not `disabled`. */
  isFocusableDisabled: boolean;
  isEffectivelyRequired: boolean;
  isBusy: boolean;
  statusType?: InputStatusType;
  ariaDescribedBy?: string;
  /**
   * The caller's base props (data-*, aria-*, DOM handlers, …) for the native
   * input, the field's semantic control (family:input-fields FR10). Focus and
   * blur handlers run after the segment's own.
   */
  controlProps?: Omit<
    FieldInputBaseProps<HTMLInputElement>,
    keyof FieldPartStyleProps | 'onChange' | 'defaultValue'
  >;
};

/** The native date half rendered inside DateTimeInput's date wrapper. */
export function NativeDateSegment({
  id,
  inputRef,
  value,
  onChange,
  placeholder,
  min,
  max,
  isDateDisabled,
  isEffectivelyDisabled,
  isFocusableDisabled,
  isEffectivelyRequired,
  isBusy,
  statusType,
  ariaDescribedBy,
  controlProps,
}: NativeDateSegmentProps) {
  const {
    onFocus: onFocusProp,
    onBlur: onBlurProp,
    ...inputProps
  } = controlProps ?? {};
  const t = useTranslator();
  const locale = useLocale();
  const isTouchPointer = useMediaQuery('(pointer: coarse)');
  const internalInputRef = useRef<HTMLInputElement | null>(null);
  const mergedInputRef = useMergedRefs(inputRef, internalInputRef);

  const [rejectedValue, setRejectedValue] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isSegmentEditable, setIsSegmentEditable] = useState(false);
  const valueAtFocusRef = useRef<string | null>(null);
  const lastCommitRef = useRef<string | null>(null);

  const prevValueRef = useRef(value);
  if (value !== prevValueRef.current) {
    prevValueRef.current = value;
    // Keep the accepted DOM value cached while a native picker is open. An
    // optimistic rollback changes the prop but leaves the focused control alone;
    // clearing this cache would replay that rejected edit on blur.
    if (!isFocused) {
      lastCommitRef.current = null;
    }
    if (rejectedValue !== null) {
      setRejectedValue(null);
    }
  }

  const nativeValue = value && ISO_DATE.test(value) ? value : '';
  const isInputValid = rejectedValue === null;
  const overlayText = nativeValue
    ? formatSharedDate(plainDateFromISO(nativeValue), 'date_long', locale)
    : placeholder;
  const showsOverlay = !!overlayText && !(isFocused && isSegmentEditable);

  const commitValue = useCallback(
    (newValue: string) => {
      if (isEffectivelyDisabled) {
        return;
      }
      if (lastCommitRef.current === newValue) {
        return;
      }

      if (!newValue) {
        lastCommitRef.current = newValue;
        setRejectedValue(null);
        if (value !== undefined) {
          onChange(undefined);
        }
        return;
      }

      const parsed = parseDateInput(newValue, locale);
      if (!parsed) {
        return;
      }
      if (isDateDisabled(parsed)) {
        setRejectedValue(newValue);
        return;
      }

      setRejectedValue(null);
      lastCommitRef.current = newValue;
      const parsedISO = plainDateToISO(parsed);
      if (parsedISO !== value) {
        onChange(parsedISO);
      }
    },
    [isDateDisabled, isEffectivelyDisabled, locale, onChange, value],
  );

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      commitValue(event.target.value);
    },
    [commitValue],
  );

  // React's synthetic change system does not reliably observe iOS picker edits.
  const commitRef = useRef(commitValue);
  useEffect(() => {
    commitRef.current = commitValue;
  });
  useEffect(() => {
    const input = internalInputRef.current;
    if (!input) {
      return;
    }
    const handleNative = () => commitRef.current(input.value);
    input.addEventListener('input', handleNative);
    input.addEventListener('change', handleNative);
    return () => {
      input.removeEventListener('input', handleNative);
      input.removeEventListener('change', handleNative);
    };
  }, []);

  // React touches defaultValue after mount when the prop changes, so capture it
  // once. The effect below owns every later write and skips focused controls.
  const initialValueRef = useRef<string | null>(null);
  if (initialValueRef.current === null) {
    initialValueRef.current = nativeValue;
  }

  useEffect(() => {
    if (isFocused) {
      return;
    }
    const input = internalInputRef.current;
    if (input && input.value !== nativeValue) {
      input.value = nativeValue;
    }
  }, [isFocused, nativeValue]);

  const handleFocus = useCallback(() => {
    valueAtFocusRef.current = nativeValue;
    setIsSegmentEditable(hasEditableDateSegments(isTouchPointer));
    setIsFocused(true);
  }, [isTouchPointer, nativeValue]);

  const handleBlur = useCallback(() => {
    const domValue = internalInputRef.current?.value;
    const valueChangedWhileFocused =
      valueAtFocusRef.current !== null &&
      valueAtFocusRef.current !== nativeValue;
    const wasRejected = rejectedValue !== null;
    valueAtFocusRef.current = null;
    setIsFocused(false);
    setRejectedValue(null);
    if (
      !valueChangedWhileFocused &&
      !wasRejected &&
      domValue !== undefined &&
      domValue !== nativeValue
    ) {
      commitValue(domValue);
    }
    lastCommitRef.current = null;
  }, [commitValue, nativeValue, rejectedValue]);

  const openPicker = useCallback(() => {
    if (isEffectivelyDisabled) {
      return;
    }
    const input = internalInputRef.current;
    if (!input) {
      return;
    }
    input.focus();
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
      } catch {
        // Focus is the fallback when showPicker needs user activation or the
        // browser does not expose it for date controls.
      }
    }
  }, [isEffectivelyDisabled]);

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
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
          {...themeProps('date-time-input-toggle-icon', {state: 'collapsed'})}
        />
      </button>
      <span {...stylex.props(styles.slot)}>
        <input
          {...inputProps}
          ref={mergedInputRef}
          id={id}
          type="date"
          // UNCONTROLLED on purpose; see initialValueRef and the sync effect.
          defaultValue={initialValueRef.current ?? ''}
          onChange={handleChange}
          onFocus={chainEventHandlers(handleFocus, onFocusProp)}
          onBlur={chainEventHandlers(handleBlur, onBlurProp)}
          min={min}
          max={max}
          disabled={isEffectivelyDisabled && !isFocusableDisabled}
          aria-disabled={
            isEffectivelyDisabled && isFocusableDisabled ? 'true' : undefined
          }
          readOnly={(isEffectivelyDisabled && isFocusableDisabled) || undefined}
          aria-describedby={ariaDescribedBy}
          aria-required={isEffectivelyRequired ? 'true' : undefined}
          aria-invalid={
            statusType === 'error' || !isInputValid ? 'true' : undefined
          }
          aria-busy={isBusy || undefined}
          {...stylex.props(
            styles.input,
            showsOverlay && styles.inputTextHidden,
            isEffectivelyDisabled && styles.inputDisabled,
            !isInputValid && styles.inputInvalid,
          )}
        />
        {showsOverlay && (
          <span
            aria-hidden="true"
            {...stylex.props(
              styles.overlay,
              nativeValue ? styles.overlayValue : styles.overlayPlaceholder,
              isEffectivelyDisabled && styles.inputDisabled,
              !isInputValid && !!nativeValue && styles.inputInvalid,
            )}>
            {overlayText}
          </span>
        )}
      </span>
      <VisuallyHidden as="div" role="alert" aria-live="assertive">
        {!isInputValid ? t('@astryx.dateInput.invalidDate') : ''}
      </VisuallyHidden>
    </>
  );
}

NativeDateSegment.displayName = 'NativeDateSegment';
