// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TextArea.tsx
 * @input Uses React, useId, ChangeEvent, ClipboardEvent, FocusEvent, Field, Icon, Spinner
 * @output Exports TextArea component, TextAreaProps, TextAreaStatus, TextAreaStatusType
 * @position Core implementation; consumed by index.ts, tested by TextArea.test.tsx
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/TextArea/TextArea.doc.mjs (props table, features, implementation notes)
 * - /packages/core/src/TextArea/TextArea.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/TextArea/index.ts (exports if types change)
 * - /apps/storybook/stories/TextArea.stories.tsx (storybook stories)
 * - /packages/cli/assets/templates/blocks/components/TextArea/ (showcase blocks)
 */

import {
  useId,
  useOptimistic,
  useTransition,
  useRef,
  useCallback,
  useMemo,
  type ChangeEvent,
  type ClipboardEvent,
  type FocusEvent,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  typographyVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import {
  Field,
  inputWrapperStyles,
  inputStatusBorderStyles,
  inputStatusHoverShadowStyles,
  inputStatusFocusWithinStyles,
  type FieldStatusVariant,
} from '../Field';
import {Icon, renderIconSlot, type IconType} from '../Icon';
import {Spinner} from '../Spinner';
import {useTooltip} from '../Tooltip';
import {mergeProps} from '../utils';
import type {BaseProps} from '../BaseProps';
import {
  type FieldInputBaseProps,
  useFieldInputStyling,
} from '../Field/fieldParts';
import {inputDisabledFocusStyles} from '../Field/inputDisabledFocus';
import type {SizeValue} from '../utils/types';
import {useInputContainer} from '../hooks/useInputContainer';
import {useInputStatusIcon} from '../hooks/useInputStatusIcon';
import {useAnnounce} from '../hooks/useAnnounce';
import {useResolvedRequired} from '../hooks/useResolvedRequired';
import {useSize} from '../SizeContext/SizeContext';
import {themeProps} from '../utils/themeProps';
import {characterCount} from '../utils/characters';
import {useTranslator} from '../i18n';

import {useMergedRefs} from '../hooks/useMergedRefs';
import {useBusyAnnouncement} from '../hooks/useBusyAnnouncement';
const COUNTER_WARNING_THRESHOLD = 0.8;

const styles = stylex.create({
  // The wrapper is a bare positioning context. The <textarea> spans the full
  // container and carries its own internal padding; icons, status/spinner, and
  // the character counter are absolutely-positioned overlays anchored to the
  // container corners. This keeps the native resize grip in the true
  // bottom-right corner and lets the scrollbar represent the full input area.
  wrapper: {
    zIndex: 1,
    display: 'block',
    // Zero the shared wrapper inset with matching longhands, not the `padding`
    // shorthand: StyleX ranks longhands above shorthands regardless of merge
    // order, so a `padding: 0` shorthand loses to the base's
    // paddingBlock/paddingInline. The wrapper would keep a duplicate inset that
    // the <textarea>'s own padding then doubles — insetting the text and
    // pushing the native resize grip in from the corner.
    paddingBlock: 0,
    paddingInline: 0,
    // Internal inline padding for the textarea's text. Defined on the wrapper
    // so the counter (a sibling overlay) inherits the same value and stays
    // aligned with the text edge. Kept as an internal var so it can later be
    // driven by a theme "padding" translation without touching either child.
    '--_textarea-inline-padding': spacingVars['--spacing-2'],
  },
  textarea: {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    minWidth: 0,
    borderWidth: 0,
    borderStyle: 'none',
    // Base internal padding; overlays get their own reserved space below.
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: 'var(--_textarea-inline-padding)',
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
    resize: 'vertical',
  },
  textareaDisabled: {
    cursor: 'default',
  },
  // Reserve start padding so text clears the start icon.
  // inline inset + 16px icon (sm) + 8px gap
  textareaWithStartIcon: {
    paddingInlineStart: `calc(var(--_textarea-inline-padding) + ${spacingVars['--spacing-6']})`,
  },
  // Reserve end padding so text clears the status icon / spinner overlay.
  // inline inset + 20px icon (md) + 4px gap
  textareaWithStatus: {
    paddingInlineEnd: `calc(var(--_textarea-inline-padding) + ${spacingVars['--spacing-6']})`,
  },
  // Reserve wider end padding when the spinner AND status icon both show.
  // inline inset + 16px spinner + 8px gap + 20px icon + 4px gap
  textareaWithBusyStatus: {
    paddingInlineEnd: `calc(var(--_textarea-inline-padding) + ${spacingVars['--spacing-12']})`,
  },
  // Reserve bottom padding so text clears the character counter overlay.
  textareaWithCounter: {
    paddingBottom: spacingVars['--spacing-7'],
  },
  startIcon: {
    position: 'absolute',
    top: spacingVars['--spacing-2'],
    insetInlineStart: 'var(--_textarea-inline-padding)',
    pointerEvents: 'none',
    display: 'flex',
  },
  endSlot: {
    position: 'absolute',
    top: spacingVars['--spacing-2'],
    insetInlineEnd: 'var(--_textarea-inline-padding)',
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
  },
  // Character counter lives inside the input container, anchored bottom-right
  // underneath the textarea, aligned to the same inline inset as the text.
  counter: {
    position: 'absolute',
    bottom: spacingVars['--spacing-1'],
    insetInlineEnd: 'var(--_textarea-inline-padding)',
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: colorVars['--color-text-secondary'],
  },
  counterError: {
    color: colorVars['--color-text-error'],
  },
});

const textareaSizeStyles = stylex.create({
  sm: {},
  md: {},
  lg: {
    paddingBlock: spacingVars['--spacing-2'],
  },
});

export type TextAreaStatusType = 'warning' | 'error' | 'success';

export type TextAreaSize = 'sm' | 'md' | 'lg';

export interface TextAreaStatus {
  /**
   * The type of status to display.
   */
  type: TextAreaStatusType;
  /**
   * Optional message to display below the textarea.
   */
  message?: string;
}

export interface TextAreaProps extends Omit<
  FieldInputBaseProps,
  'onChange' | 'defaultValue'
> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLTextAreaElement>;
  /**
   * Label text for the textarea (always rendered for accessibility).
   */
  label: string;
  /**
   * Whether to visually hide the label (still accessible to screen readers).
   * @default false
   */
  isLabelHidden?: boolean;
  /**
   * Description text displayed between the label and textarea.
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
   * Callback fired when the textarea value changes.
   */
  onChange?: (value: string, e: ChangeEvent<HTMLTextAreaElement>) => void;
  /** Async action on change. Fires after onChange if not prevented. */
  changeAction?: (
    value: string,
    e: ChangeEvent<HTMLTextAreaElement>,
  ) => void | Promise<void>;
  /** Whether the input is in a loading state. @default false */
  isLoading?: boolean;
  /**
   * The current value of the textarea.
   */
  value: string;
  /**
   * Placeholder text shown when the textarea is empty.
   */
  placeholder?: string;
  /**
   * The number of visible text rows.
   * @default 3
   */
  rows?: number;
  /**
   * Whether the textarea is disabled. A disabled textarea is dimmed, cannot be
   * edited, and is left out of form submission, but it stays in the tab order
   * (`aria-disabled`, not the native attribute).
   * @default false
   */
  isDisabled?: boolean;
  /**
   * Whether the textarea is read-only.
   * The value is shown at full opacity and still submits with the form, but
   * cannot be edited. Unlike `isDisabled`, a read-only textarea is not dimmed
   * and keeps its form value — use it for a value the user should see and
   * send but not change. `isDisabled` takes precedence when both are set.
   * @default false
   */
  isReadOnly?: boolean;
  /**
   * Explains why the textarea is disabled. When set together with
   * `isDisabled`, the textarea shows a tooltip with this text on hover and
   * keyboard focus, and stays focusable (via `aria-disabled`) so the reason is
   * discoverable by keyboard and assistive technology. The field cannot be
   * edited (it becomes read-only) while disabled.
   *
   * Use this instead of wrapping a disabled textarea in `Tooltip`, so the
   * reason is attached to the field itself.
   *
   * @example
   * ```
   * <TextArea
   *   label="Notes"
   *   value={notes}
   *   isDisabled
   *   disabledMessage="Notes are locked after submission"
   * />
   * ```
   */
  disabledMessage?: string;
  /**
   * Status indicator for the textarea.
   * When set, displays a colored border and status icon.
   * If message is provided, displays a floating message box below the textarea.
   */
  status?: TextAreaStatus;
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
   * stay aligned, unlike setting width via `controlXstyle`/`controlClassName`/`controlStyle`.
   */
  width?: SizeValue;
  /**
   * Tooltip text to display in an info icon at the end of the label.
   */
  labelTooltip?: string;
  /**
   * Icon to display at the start of the textarea.
   * Accepts a ReactNode (e.g. `<Icon icon={SearchIcon} />`) or an SVG icon component directly.
   */
  startIcon?: ReactNode | IconType;
  /**
   * Whether to enable browser spell checking.
   * @default true
   */
  hasSpellCheck?: boolean;
  /**
   * Callback fired when content is pasted into the textarea.
   */
  onPaste?: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  /**
   * Maximum number of characters allowed, counted as user-perceived
   * characters — an emoji or flag sequence counts as one. When set,
   * displays a character counter below the textarea.
   * Does not enforce the limit natively — the counter shows error styling
   * when exceeded, and the consumer can validate via onChange. Validate with
   * `characterCount` (exported from this package) rather than `value.length`
   * so enforcement matches the displayed count.
   */
  maxLength?: number;
  /**
   * Whether to automatically focus the textarea on mount.
   * @default false
   */
  hasAutoFocus?: boolean;
  /**
   * The size of the textarea, affecting internal padding.
   * Height is controlled by `rows`, not size.
   * @default 'md'
   */
  size?: TextAreaSize;
  /**
   * The HTML name attribute for the textarea.
   * Useful for form submissions.
   */
  htmlName?: string;
  /**
   * Callback fired when the textarea receives focus.
   */
  onFocus?: (e: FocusEvent<HTMLTextAreaElement>) => void;
  /**
   * Callback fired when the textarea loses focus.
   */
  onBlur?: (e: FocusEvent<HTMLTextAreaElement>) => void;
  /**
   * The native `autocomplete` attribute, forwarded to the textarea unchanged.
   * The value stays React-controlled regardless — this only hints the
   * browser/password manager's suggestion behavior (e.g. `'off'` for a
   * session-scoped field that must not reuse a prior value).
   */
  autoComplete?: React.TextareaHTMLAttributes<HTMLTextAreaElement>['autoComplete'];
}

/**
 * A multi-line text input component for collecting longer user input.
 *
 * @example
 * ```
 * <TextArea label="Description" value={description} onChange={setDescription} />
 * <TextArea label="Notes" rows={5} value={notes} onChange={setNotes} />
 * ```
 */
export function TextArea({
  label,
  isLabelHidden = false,
  description,
  isOptional = false,
  isRequired = false,
  onChange,
  changeAction,
  isLoading = false,
  value,
  placeholder,
  rows = 3,
  isDisabled = false,
  isReadOnly = false,
  disabledMessage,
  status,
  statusVariant = 'attached',
  labelTooltip,
  startIcon,
  hasSpellCheck = true,
  onPaste,
  maxLength,
  hasAutoFocus = false,
  size: sizeProp,
  htmlName,
  onFocus,
  onBlur,
  width,
  containerXstyle,
  containerClassName,
  containerStyle,
  controlXstyle,
  controlClassName,
  controlStyle,
  ref,
  id: idProp,
  'aria-describedby': ariaDescribedByProp,
  ...restProps
}: TextAreaProps) {
  const {rest, container} = useFieldInputStyling('TextArea', restProps, {
    containerXstyle,
    containerClassName,
    containerStyle,
  });
  const size = useSize(sizeProp, 'md');
  const t = useTranslator();
  const isEffectivelyRequired = useResolvedRequired({isRequired, isOptional});
  const announce = useAnnounce();
  const generatedID = useId();
  const id = idProp ?? generatedID;
  const descriptionID = useId();
  const statusMessageID = useId();
  const counterID = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Tracks the counter "zone" last announced (under / near / over) so we only
  // announce on a zone change, not on every keystroke.
  const counterZoneRef = useRef<'under' | 'near' | 'over' | null>(null);

  const [, startTransition] = useTransition();
  const [optimisticValue, setOptimisticValue] = useOptimistic(value);
  const isBusy = isLoading || optimisticValue !== value;
  // The busy Spinner is decorative; this control announces its busy start
  // (spec:AST-086 FR8).
  useBusyAnnouncement(isBusy, t('@astryx.spinner.loading'), containerRef);

  // Disabled-reason tooltip. The tooltip listeners attach to the textarea container (which already exists)
  // and the textarea stays perceivable via aria-disabled instead of the native
  // disabled attribute. The field is made read-only so it can't be typed into,
  // and value mutation is blocked by the isDisabled guard in handleChange.
  const showsDisabledMessage = isDisabled && !!disabledMessage;
  // A disabled field keeps its tab stop but, like a natively disabled one,
  // runs no caller event handler other than focus and blur (`spec:AST-085` FR2).
  const fieldProps = isDisabled
    ? Object.fromEntries(
        Object.entries(rest).filter(
          ([key]) => !/^on[A-Z]/.test(key) || /^on(Focus|Blur)/.test(key),
        ),
      )
    : rest;
  const disabledMessageTooltip = useTooltip({
    placement: 'above',
    // The container div is not naturally focusable; focusin bubbles up from
    // the textarea, so always attach focus listeners.
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
      maxLength != null ? counterID : null,
      showsDisabledMessage ? disabledMessageTooltip.describedBy : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

  // Announce the character-count status through the shared live region, but
  // only when the value crosses into a new zone (near the limit / over the
  // limit) so we don't speak on every keystroke. Over-limit is assertive (an
  // error the user should hear immediately); nearing the limit is polite.
  const announceCounter = useCallback(
    (length: number) => {
      if (maxLength == null) {
        return;
      }
      const zone: 'under' | 'near' | 'over' =
        length > maxLength
          ? 'over'
          : length >= maxLength * COUNTER_WARNING_THRESHOLD
            ? 'near'
            : 'under';
      if (zone === counterZoneRef.current) {
        return;
      }
      counterZoneRef.current = zone;
      if (zone === 'over') {
        announce(
          t('@astryx.textArea.charactersOverLimit', {
            count: length - maxLength,
          }),
          'assertive',
        );
      } else if (zone === 'near') {
        announce(
          t('@astryx.textArea.charactersRemaining', {
            count: maxLength - length,
          }),
        );
      }
    },
    [announce, t, maxLength],
  );

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    // Value can't change while showing a disabled message (the field is
    // read-only and non-native-disabled), but guard the handler too so the
    // optimistic value and callbacks never fire.
    if (isDisabled || isReadOnly) {
      return;
    }
    const newValue = e.target.value;
    // Guarded here, not just inside announceCounter, so textareas without a
    // maxLength never pay for segmenting the whole value on each keystroke.
    if (maxLength != null) {
      announceCounter(characterCount(newValue));
    }
    onChange?.(newValue, e);
    if (changeAction && !e.defaultPrevented) {
      startTransition(async () => {
        setOptimisticValue(newValue);
        await changeAction(newValue, e);
      });
    }
  };

  // Counter semantics count user-perceived characters, so an emoji or flag
  // sequence counts as one character, not its code units.
  // Only measured when a counter exists — segmentation is O(value length),
  // and memoized so re-renders that keep the same value skip it entirely.
  const valueLength = useMemo(
    () => (maxLength != null ? characterCount(optimisticValue) : 0),
    [maxLength, optimisticValue],
  );

  const effectivelyDisabled = isDisabled || isBusy;

  // Focus textarea when clicking anywhere on the wrapper (icons, padding, etc.)
  const {onClick: handleWrapperClick, onMouseUp: handleWrapperMouseUp} =
    useInputContainer({
      containerRef,
      inputRef: textareaRef,
      disabled: effectivelyDisabled,
    });

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
      <div
        ref={el => {
          containerRef.current = el;
          // Anchor + hover/focus listeners for the disabled-message tooltip.
          // Handlers are gated internally by isEnabled, and anchor names
          // compose, so attaching unconditionally is safe.
          disabledMessageTooltip.ref(el);
        }}
        onClick={handleWrapperClick}
        onMouseUp={handleWrapperMouseUp}
        {...mergeProps(
          themeProps('text-area', {
            size,
            status: status?.type ?? null,
            disabled: isDisabled ? 'disabled' : null,
            readonly: isReadOnly ? 'readonly' : null,
          }),
          stylex.props(
            inputWrapperStyles.base,
            styles.wrapper,
            isDisabled && inputWrapperStyles.disabled,
            isDisabled && inputDisabledFocusStyles.ring,
            status && inputStatusBorderStyles[status.type],
            status && !isDisabled && inputStatusHoverShadowStyles[status.type],
            status && inputStatusFocusWithinStyles[status.type],
            controlXstyle,
          ),
          controlClassName,
          controlStyle,
        )}>
        {startIcon && (
          <span {...stylex.props(styles.startIcon)}>
            {renderIconSlot(startIcon, {size: 'sm', color: 'secondary'})}
          </span>
        )}
        <textarea
          {...fieldProps}
          ref={useMergedRefs(ref, textareaRef)}
          id={id}
          name={isDisabled ? undefined : htmlName}
          value={optimisticValue}
          onChange={handleChange}
          onPaste={isDisabled ? undefined : onPaste}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          rows={rows}
          // A disabled textarea keeps its place in the tab order
          // (spec:AST-085): aria-disabled instead of the native attribute,
          // with readOnly + the handleChange guard keeping the value from
          // changing.
          aria-disabled={isDisabled ? 'true' : undefined}
          readOnly={isReadOnly || isDisabled || undefined}
          spellCheck={hasSpellCheck}
          autoFocus={hasAutoFocus}
          data-autofocus={hasAutoFocus || undefined}
          aria-describedby={
            [ariaDescribedByProp, ariaDescribedBy].filter(Boolean).join(' ') ||
            undefined
          }
          aria-required={isEffectivelyRequired ? 'true' : undefined}
          aria-invalid={
            status?.type === 'error' ||
            (maxLength != null && valueLength > maxLength)
              ? 'true'
              : undefined
          }
          aria-busy={isBusy || undefined}
          {...mergeProps(
            themeProps('text-area-control'),
            stylex.props(
              styles.textarea,
              textareaSizeStyles[size],
              isDisabled && styles.textareaDisabled,
              Boolean(startIcon) && styles.textareaWithStartIcon,
              // Reserve trailing space only when the end slot actually renders
              // something (spinner or on-field status icon). The `detached`
              // status variant suppresses the on-field icon — its glyph lives
              // in the message box below — so reserving here would inset the
              // text for an icon that never appears.
              (isBusy || statusIcon != null) && styles.textareaWithStatus,
              isBusy && statusIcon != null && styles.textareaWithBusyStatus,
              maxLength != null && styles.textareaWithCounter,
            ),
          )}
        />
        {(isBusy || statusIcon) && (
          <span {...stylex.props(styles.endSlot)}>
            {isBusy && <Spinner size="sm" aria-hidden="true" />}
            {statusIcon}
          </span>
        )}
        {maxLength != null && (
          <div
            id={counterID}
            {...mergeProps(
              themeProps('text-area-counter'),
              stylex.props(
                styles.counter,
                valueLength > maxLength && styles.counterError,
              ),
            )}>
            {valueLength > maxLength && (
              // Non-color cue so the over-limit state isn't conveyed by the red
              // color alone (WCAG 1.4.1). Decorative — the count text and the
              // live-region announcement carry the meaning.
              <Icon icon="warning" size="sm" />
            )}
            {valueLength}/{maxLength}
          </div>
        )}
      </div>
      {showsDisabledMessage &&
        disabledMessageTooltip.renderTooltip(disabledMessage)}
    </Field>
  );
}

TextArea.displayName = 'TextArea';
