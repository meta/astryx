// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file NativeTimeSegment.tsx
 * @input Uses React, native picker segment styles, and shared time utilities
 * @output Exports NativeTimeSegment — the shared OS-picker time control
 * @position Internal native control used by DateTimeInput and TimeInput
 *
 * Hands time picking to the platform through `<input type="time">`. The input
 * is deliberately uncontrolled and observed through native event listeners,
 * matching NativeDateSegment's iOS-safe value ownership: external values only
 * reconcile while the picker is unfocused, and native edits do not depend on
 * React's synthetic change event.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/DateTimeInput/DateTimeInput.tsx (DateTimeInput integration)
 * - /packages/core/src/TimeInput/TimeInput.tsx (TimeInput integration)
 * - /packages/core/src/DateTimeInput/NativePickerSegments.test.tsx (DateTimeInput tests)
 * - /packages/core/src/TimeInput/NativeTimeInput.test.tsx (TimeInput tests)
 * - /packages/core/src/DateTimeInput/DateTimeInput.doc.mjs (DateTimeInput prop docs)
 * - /packages/core/src/TimeInput/TimeInput.doc.mjs (TimeInput prop docs)
 */

import {useCallback, useEffect, useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {
  FieldInputBaseProps,
  FieldPartStyleProps,
} from '../Field/fieldParts';
import {hasEditableDateSegments} from '../DateInput/nativeDateSegments';
import type {InputStatusType} from '../Field';
import {useMediaQuery} from '../hooks/useMediaQuery';
import {useMergedRefs} from '../hooks/useMergedRefs';
import {Icon} from '../Icon';
import {useLocale, useTranslator} from '../i18n';
import {formatLocaleTime} from '../utils/timeFormat';
import type {ThemeProps} from '../utils/themeProps';
import {VisuallyHidden} from '../VisuallyHidden';
import {
  focusOutlineStyles,
  formatISOTime,
  isTimeInRange,
  parseISOTime,
  type ISOTimeString,
} from '../utils';
import {chainEventHandlers} from '../utils/chainEventHandlers';
import {nativePickerSegmentStyles as styles} from './nativePickerSegmentStyles';

const FRACTIONAL_SECONDS = /\.\d+$/;

function normalizeNativeTime(
  value: string | undefined,
): ISOTimeString | undefined {
  if (!value) {
    return undefined;
  }
  const withoutFraction = value.replace(
    FRACTIONAL_SECONDS,
    '',
  ) as ISOTimeString;
  const parsed = parseISOTime(withoutFraction);
  return parsed ? formatISOTime(parsed, false) : undefined;
}

export type NativeTimeSegmentProps = {
  id: string;
  inputRef: React.Ref<HTMLInputElement>;
  value?: ISOTimeString;
  onChange: (value: ISOTimeString | undefined) => void;
  placeholder: string;
  inputLabel?: string;
  openPickerLabel: string;
  ariaLabelledBy?: string;
  iconThemeProps?: ThemeProps;
  hasAutoFocus?: boolean;
  min?: ISOTimeString;
  max?: ISOTimeString;
  hourFormat: '12h' | '24h';
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

/** The shared native time control rendered inside Astryx field chrome. */
export function NativeTimeSegment({
  id,
  inputRef,
  value,
  onChange,
  placeholder,
  inputLabel,
  openPickerLabel,
  ariaLabelledBy,
  iconThemeProps,
  hasAutoFocus = false,
  min,
  max,
  hourFormat,
  isEffectivelyDisabled,
  isFocusableDisabled,
  isEffectivelyRequired,
  isBusy,
  statusType,
  ariaDescribedBy,
  controlProps,
}: NativeTimeSegmentProps) {
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
    // Preserve the accepted DOM value while the OS wheel is open so an
    // optimistic rollback cannot replay that edit when the field blurs.
    if (!isFocused) {
      lastCommitRef.current = null;
    }
    if (rejectedValue !== null) {
      setRejectedValue(null);
    }
  }

  const nativeValue = normalizeNativeTime(value) ?? '';
  const isInputValid = rejectedValue === null;
  const overlayText = nativeValue
    ? formatLocaleTime(nativeValue, locale, hourFormat, false)
    : placeholder;
  const showsOverlay = !!overlayText && !(isFocused && isSegmentEditable);

  const commitValue = useCallback(
    (newValue: string) => {
      if (isEffectivelyDisabled || lastCommitRef.current === newValue) {
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

      const normalized = normalizeNativeTime(newValue);
      if (!normalized) {
        return;
      }
      if (!isTimeInRange(normalized, min, max)) {
        setRejectedValue(newValue);
        return;
      }

      setRejectedValue(null);
      lastCommitRef.current = newValue;
      if (normalized !== value) {
        onChange(normalized);
      }
    },
    [isEffectivelyDisabled, max, min, onChange, value],
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

  // React touches defaultValue after mount when the prop changes. Capture it
  // once, then reconcile through the unfocused-only effect below.
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
    // The engine probe classifies whether WebKit/Blink exposes editable native
    // segments. Date and time controls share that engine-level behavior.
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
        // Focus raises the iOS picker and is the fallback when showPicker needs
        // user activation or is unavailable.
      }
    }
  }, [isEffectivelyDisabled]);

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        aria-disabled={isEffectivelyDisabled || undefined}
        aria-label={openPickerLabel}
        tabIndex={-1}
        {...stylex.props(
          focusOutlineStyles.focusVisible,
          styles.iconButton,
          isEffectivelyDisabled && styles.iconButtonDisabled,
        )}>
        <Icon icon="clock" size="sm" color="secondary" {...iconThemeProps} />
      </button>
      <span {...stylex.props(styles.slot)}>
        <input
          {...inputProps}
          ref={mergedInputRef}
          id={id}
          type="time"
          // UNCONTROLLED on purpose; see initialValueRef and the sync effect.
          defaultValue={initialValueRef.current ?? ''}
          onChange={handleChange}
          onFocus={chainEventHandlers(handleFocus, onFocusProp)}
          onBlur={chainEventHandlers(handleBlur, onBlurProp)}
          min={min}
          max={max}
          step={60}
          disabled={isEffectivelyDisabled && !isFocusableDisabled}
          aria-disabled={
            isEffectivelyDisabled && isFocusableDisabled ? 'true' : undefined
          }
          readOnly={(isEffectivelyDisabled && isFocusableDisabled) || undefined}
          // The segment's own label applies only when nothing else names it;
          // otherwise a caller aria-label from the spread above stays.
          aria-label={
            !ariaLabelledBy && inputLabel
              ? inputLabel
              : inputProps['aria-label']
          }
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          autoFocus={hasAutoFocus}
          data-autofocus={hasAutoFocus || undefined}
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
        {!isInputValid ? t('@astryx.timeInput.invalidTime') : ''}
      </VisuallyHidden>
    </>
  );
}

NativeTimeSegment.displayName = 'NativeTimeSegment';
