// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file NativeDateField.tsx
 * @input Uses React, Field, Icon, InputClearButton, Spinner, useCalendarConstraints, hasEditableDateSegments
 * @output Exports NativeDateField — the OS-picker touch surface
 * @position One of DateInput's three surfaces. `DateInput` picks the pointer
 *   field on a mouse and, on touch, either `TouchDateField` (the default) or
 *   this one when the consumer opts in with `nativePicker`.
 *
 * Hands date picking to the platform: a real `<input type="date">`, whose
 * picker the OS draws — the iOS wheel, the Android calendar dialog. The field
 * itself still looks like every other Astryx input, and DateInput paints its
 * text so `format` and `placeholder` keep applying.
 *
 * Everything unusual in here was measured on a real iOS device; the comments
 * say which behaviour forced which decision, because none of them are
 * reproducible in a desktop browser.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/DateInput/DateInput.tsx (the `nativePicker` prop)
 * - /packages/core/src/DateInput/DateInput.doc.mjs (prop table)
 * - /packages/core/src/DateInput/nativeDateSegments.ts (the engine probe)
 * - /packages/core/src/DateInput/NativeDateField.test.tsx (tests)
 */

import {
  useCallback,
  useEffect,
  useId,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {useCalendarConstraints} from '../Calendar';
import type {DateInputProps} from './DateInput';
import {hasEditableDateSegments} from './nativeDateSegments';
import {
  Field,
  InputClearButton,
  inputStatusBorderStyles,
  inputStatusFocusWithinStyles,
  inputStatusHoverShadowStyles,
  inputWrapperStyles,
} from '../Field';
import {useInputStatusIcon, useMergedRefs} from '../hooks';
import {useMediaQuery} from '../hooks/useMediaQuery';
import {useBusyAnnouncement} from '../hooks/useBusyAnnouncement';
import {useResolvedRequired} from '../hooks/useResolvedRequired';
import {Icon} from '../Icon';
import {useLocale, useTranslator} from '../i18n';
import {useInputGroup} from '../InputGroup';
import {useFieldInputStyling} from '../Field/fieldParts';
import {joinAriaIDs} from '../utils/inputAria';
import {groupStyles, inputGroupItemProps} from '../InputGroup/groupStyles';
import {useSize} from '../SizeContext';
import {Spinner} from '../Spinner';
import {
  colorVars,
  radiusVars,
  sizeVars,
  spacingVars,
  typeScaleVars,
  typographyVars,
} from '../theme/tokens.stylex';
import {useTooltip} from '../Tooltip';
import {VisuallyHidden} from '../VisuallyHidden';
import {
  focusOutlineStyles,
  formatSharedDate,
  getInputARIA,
  mergeProps,
  parseDateInput,
  plainDateFromISO,
  plainDateToISO,
  themeProps,
  type ISODateString,
} from '../utils';
import {chainEventHandlers} from '../utils/chainEventHandlers';

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
    // Below 16px iOS zooms the page when the field takes focus. Only iOS
    // WebKit implements -webkit-touch-callout, so the coarse-pointer floor is
    // keyed to iOS alone.
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
    // A date control's intrinsic height comes from its inner edit fields, not
    // from `line-height`, so it renders ~2px taller than a text input and its
    // value sits off the shared baseline inside the same flex row. One line
    // box is exactly what the text field occupies. The calc fallback mirrors
    // the iOS-only floor above; browsers with `1lh` track it for free.
    height: {
      default: stylex.firstThatWorks(
        '1lh',
        `calc(${typeScaleVars['--text-body-size']} * ${typeScaleVars['--text-body-leading']})`,
      ),
      '@media (pointer: coarse)': {
        '@supports (-webkit-touch-callout: none)': stylex.firstThatWorks(
          '1lh',
          `calc(max(1rem, ${typeScaleVars['--text-body-size']}) * ${typeScaleVars['--text-body-leading']})`,
        ),
      },
    },
    // iOS gives date controls their own button-like chrome, with inner
    // spacing and a centred value that no reset of ours can reach.
    WebkitAppearance: 'none',
    appearance: 'none',
    // Chromium paints a second calendar glyph inside the field; this surface
    // already ships a toggle button, so drop the duplicate.
    '::-webkit-calendar-picker-indicator': {
      display: 'none',
    },
    '::-webkit-date-and-time-value': {
      textAlign: 'start',
      marginBlock: 0,
      marginInline: 0,
      paddingBlock: 0,
      paddingInline: 0,
      lineHeight: 'inherit',
      minHeight: 0,
    },
    '::-webkit-datetime-edit': {
      paddingBlock: 0,
      paddingInline: 0,
      lineHeight: 'inherit',
    },
  },
  inputDisabled: {
    cursor: 'default',
  },
  inputInvalid: {
    color: colorVars['--color-text-secondary'],
  },
  // Hides whatever the engine paints inside the control so this field's own
  // text can take that space. WebKit renders the value into a single
  // `::-webkit-date-and-time-value` run which the UA stylesheet gives no
  // colour of its own (the iOS UA colour sits on the INPUT), so it inherits
  // this; Chromium's `::-webkit-datetime-edit` fields inherit it too.
  // `-webkit-text-fill-color` is what actually wins inside a WebKit date
  // control.
  inputTextHidden: {
    color: 'transparent',
    WebkitTextFillColor: 'transparent',
  },
  // Positioning context for the overlay, standing in for the input's own box
  // in the field's flex row.
  slot: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  // This field's own text, laid over the control. Decorative: the input still
  // holds the value and keeps its label, description, and status wiring, so
  // announcing this too would just double-speak.
  overlay: {
    position: 'absolute',
    insetInlineStart: 0,
    // Both insets, so the overlay is bounded by the slot rather than
    // shrink-to-fit. Without the end inset a long formatted date paints past
    // the slot and over whatever follows it in the field — measured running
    // 24px across the clear button.
    insetInlineEnd: 0,
    insetBlock: 0,
    // A BLOCK box, not a flex one: `text-overflow` only applies to a block
    // container, so on a flex container a too-long date hard-clips mid-glyph
    // instead of ellipsising (measured identical to `text-overflow: clip` in
    // both WebKit and Chromium). Centring then comes from the line box, so
    // the overlay carries the same font size and leading as the input it
    // covers — one line of that leading fills its height exactly, which puts
    // the glyphs on the input's own baseline.
    display: 'block',
    // ...with the input's own iOS floor, so the two baselines stay shared.
    fontSize: {
      default: typeScaleVars['--text-body-size'],
      '@media (pointer: coarse)': {
        '@supports (-webkit-touch-callout: none)': `max(1rem, ${typeScaleVars['--text-body-size']})`,
      },
    },
    lineHeight: typeScaleVars['--text-body-leading'],
    // A tap has to reach the control underneath — that is what raises the
    // picker.
    pointerEvents: 'none',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  overlayValue: {
    color: colorVars['--color-text-primary'],
  },
  overlayPlaceholder: {
    color: colorVars['--color-text-secondary'],
  },
});

const sizeStyles = stylex.create({
  sm: {height: sizeVars['--size-element-sm'], minWidth: 180},
  md: {height: sizeVars['--size-element-md'], minWidth: 180},
  lg: {height: sizeVars['--size-element-lg'], minWidth: 180},
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The OS-picker surface. Takes `DateInput`'s props verbatim; see
 * {@link DateInput} for when it is chosen over the other two.
 */
export function NativeDateField({
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
  // The OS draws the picker, so neither reaches it: both describe a calendar
  // grid it does not have. Accepted (the prop types are shared) and ignored.
  numberOfMonths: _numberOfMonths,
  weekStartsOn: _weekStartsOn,
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
    onFocus: onFocusProp,
    onBlur: onBlurProp,
    ...controlProps
  } = rest;
  const t = useTranslator();
  const locale = useLocale();
  const isEffectivelyRequired = useResolvedRequired({isRequired, isOptional});
  const placeholder =
    placeholderFromProps ?? t('@astryx.dateInput.placeholder');
  const size = useSize(sizeProp, 'md');
  // Only breaks a tie the engine probe cannot: see ./nativeDateSegments.
  const isTouchPointer = useMediaQuery('(pointer: coarse)');

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
  // The busy Spinner is decorative; this control announces its busy start
  // (spec:AST-086 FR8).
  useBusyAnnouncement(isBusy, t('@astryx.spinner.loading'), inputRef);
  // Keep the OS picker mounted and focusable while its own Action is pending.
  // Native TimeInput follows the same pattern: commit guards block duplicates,
  // while aria-busy and the Spinner communicate the save without detaching the
  // platform picker from its input.
  const isEffectivelyDisabled = isDisabled || isLoading;

  // Same contract as the other two surfaces: a disabled field never renders
  // native `disabled` (spec:AST-085 FR1); the input stays focusable via
  // aria-disabled and readOnly. The disabled-reason tooltip's listeners
  // attach to the wrapper.
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

  // A date the picker produced that `dateConstraints` refuses, held so the
  // refusal can be announced instead of looking like a dead tap.
  const [rejectedValue, setRejectedValue] = useState<string | null>(null);
  // Whether the control has focus — which, on a touch device, means its
  // picker is open.
  const [isFocused, setIsFocused] = useState(false);
  // Whether the engine draws this control as editable segments rather than a
  // picker-only run. Latched on focus rather than read during render: the
  // probe touches the DOM, and unfocused the answer changes nothing.
  const [isSegmentEditable, setIsSegmentEditable] = useState(false);
  // The raw value the control last reported and we acted on, so the same edit
  // arriving through both commit paths only fires one change.
  const lastCommitRef = useRef<string | null>(null);

  const prevValueRef = useRef(value);
  if (value !== prevValueRef.current) {
    prevValueRef.current = value;
    lastCommitRef.current = null;
    if (rejectedValue !== null) {
      setRejectedValue(null);
    }
  }

  // The control's own value is always ISO — the only form it accepts, and
  // what the picker reads and writes. `format` rides on the overlay instead.
  const nativeValue =
    optimisticValue && ISO_DATE.test(optimisticValue) ? optimisticValue : '';
  const isInputValid = rejectedValue === null;

  const formatValue = useCallback(
    (iso: ISODateString): string =>
      typeof format === 'function'
        ? format(iso)
        : formatSharedDate(plainDateFromISO(iso), format, locale),
    [format, locale],
  );

  // This field paints the closed control's text itself, which is what keeps
  // `format` and `placeholder` applying: a picker-only control has no
  // segments to edit, so our text holds even while the picker is open, and
  // tracks it live. An editable control is the opposite case — its text IS
  // the edit surface, and it reports no `value` until every segment is
  // filled, so the overlay has nothing to paint mid-edit — so step aside for
  // as long as it has focus. See ./nativeDateSegments.
  const overlayText = nativeValue ? formatValue(nativeValue) : placeholder;
  const showsOverlay = !!overlayText && !(isFocused && isSegmentEditable);

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

  const commitValue = useCallback(
    (newValue: string) => {
      if (isEffectivelyDisabled || isBusy) {
        return;
      }
      // The same edit can arrive twice — React's synthetic change and the
      // native listener below both report it — so act on a raw value once.
      if (lastCommitRef.current === newValue) {
        return;
      }
      lastCommitRef.current = newValue;

      if (!newValue) {
        setRejectedValue(null);
        if (value !== undefined) {
          fireChange(undefined);
        }
        return;
      }

      const parsed = parseDateInput(newValue, locale);
      if (!parsed) {
        return;
      }
      if (isDateDisabled(parsed)) {
        // iOS does not enforce min/max in its picker — those attributes are
        // constraint-validation flags, not clamps, and the sheet lets the
        // user land on any date. Refuse it here and let the sync effect snap
        // the control back; the live region below announces the refusal.
        setRejectedValue(newValue);
        return;
      }

      setRejectedValue(null);
      const parsedISO = plainDateToISO(parsed);
      if (parsedISO !== value) {
        fireChange(parsedISO);
      }
    },
    [value, fireChange, isDateDisabled, isEffectivelyDisabled, isBusy, locale],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      commitValue(e.target.value);
    },
    [commitValue],
  );

  // React's synthetic change system does not reliably observe the iOS
  // picker's edits. Measured on an iPhone: picking a date fired a native
  // `input` event carrying the new date while React's `onChange` never ran —
  // so React re-rendered and wrote its own stale value straight back over the
  // picker's, and the user's pick (and their Reset) silently reverted. A
  // native listener reads what the control actually holds, whatever React's
  // synthetic layer made of it.
  const commitRef = useRef(commitValue);
  useEffect(() => {
    commitRef.current = commitValue;
  });
  useEffect(() => {
    const input = inputRef.current;
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

  // The value the control mounts with. Deliberately captured once: React
  // writes to the element whenever a `value` OR `defaultValue` prop changes,
  // and on iOS ANY write while the picker sheet is open detaches the sheet
  // from the field — the wheel and Reset keep moving the sheet's own
  // highlight, but nothing they do reaches the input and no event fires, so
  // the user's pick appears to do nothing. Holding this constant means React
  // touches the element exactly once, at mount; the effect below owns every
  // later update and only writes while the field is unfocused.
  const initialValueRef = useRef<string | null>(null);
  if (initialValueRef.current === null) {
    initialValueRef.current = nativeValue;
  }

  // Push an externally-changed value in — but never while the control has
  // focus, for the reason above. Blur flips `isFocused`, so this doubles as
  // the reconcile once the picker closes. (Self-heals a stale
  // `initialValueRef` too, on the commit right after a remount.)
  useEffect(() => {
    if (isFocused) {
      return;
    }
    const input = inputRef.current;
    if (input && input.value !== nativeValue) {
      input.value = nativeValue;
    }
  }, [isFocused, nativeValue]);

  const handleFocus = useCallback(() => {
    setIsSegmentEditable(hasEditableDateSegments(isTouchPointer));
    setIsFocused(true);
  }, [isTouchPointer]);

  const handleBlur = useCallback(() => {
    const domValue = inputRef.current?.value;
    setIsFocused(false);
    // A refused date is reverted by the sync effect the moment focus leaves,
    // so the field is once again showing a date that IS valid. Keeping the
    // rejection past that point would mark good data invalid, with no way
    // back except changing the field again. The live region announced the
    // refusal while it happened; that is the feedback.
    setRejectedValue(null);
    if (domValue !== undefined && domValue !== nativeValue) {
      commitValue(domValue);
    }
  }, [commitValue, nativeValue]);

  // Focusing a date control is what raises the OS picker, so the usual
  // focus-restore after a clear would pop the picker the tap just dismissed —
  // and on iOS that reads as the clear having done nothing.
  const handleClear = useCallback(() => {
    fireChange(undefined);
  }, [fireChange]);

  const openPicker = useCallback(() => {
    if (isEffectivelyDisabled) {
      return;
    }
    const input = inputRef.current;
    if (!input) {
      return;
    }
    // Focus first: on touch browsers focusing the control is itself what
    // raises the picker, and iOS implements no `showPicker()` for type=date
    // (WebKit bug 261703), so focus is the whole mechanism there.
    input.focus();
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
      } catch {
        // showPicker throws without transient user activation and inside a
        // cross-origin iframe. The focus above is the fallback.
      }
    }
  }, [isEffectivelyDisabled]);

  const inputWrapper = (
    <div
      ref={el => {
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
          {...themeProps('date-input-toggle-icon', {state: 'collapsed'})}
        />
      </button>
      <span {...stylex.props(styles.slot)}>
        <input
          {...controlProps}
          onClick={isEffectivelyDisabled ? undefined : controlProps.onClick}
          ref={mergedInputRef}
          id={id}
          type="date"
          // UNCONTROLLED on purpose, with a value React never rewrites after
          // mount — see `initialValueRef` and the sync effect above.
          defaultValue={initialValueRef.current ?? ''}
          onChange={handleChange}
          onFocus={chainEventHandlers(handleFocus, onFocusProp)}
          onBlur={chainEventHandlers(handleBlur, onBlurProp)}
          min={min}
          max={max}
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
      {/*
          Live region announcing a refused date. The value snaps back on its
          own, so without this a screen-reader user would get no feedback that
          their pick was rejected (WCAG 3.3.1).
        */}
      <VisuallyHidden as="div" role="alert" aria-live="assertive">
        {!isInputValid ? t('@astryx.dateInput.invalidDate') : ''}
      </VisuallyHidden>
      {hasClear && value !== undefined && !isEffectivelyDisabled && !isBusy && (
        <InputClearButton
          label={t('@astryx.dateInput.clear', {label})}
          onClick={handleClear}
        />
      )}
      {isBusy && <Spinner size="sm" aria-hidden="true" />}
      {statusIcon}
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

NativeDateField.displayName = 'NativeDateField';
