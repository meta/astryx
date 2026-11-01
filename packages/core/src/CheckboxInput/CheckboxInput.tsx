// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file CheckboxInput.tsx
 * @input Uses React, useId, ChangeEvent, FieldLabel, FieldStatus, IconType, InputStatus, useTooltip
 * @output Exports CheckboxInput component, CheckboxInputProps
 * @position Core implementation; consumed by index.ts, tested by CheckboxInput.test.tsx
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/CheckboxInput/CheckboxInput.doc.mjs (props table, features, implementation notes)
 * - /packages/core/src/CheckboxInput/CheckboxInput.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/CheckboxInput/index.ts (exports if types change)
 * - /apps/storybook/stories/CheckboxInput.stories.tsx (storybook stories)
 * - /packages/cli/assets/templates/blocks/components/CheckboxInput/ (showcase blocks)
 */

import {
  useId,
  useCallback,
  useOptimistic,
  useRef,
  useTransition,
  type ChangeEvent,
  type FocusEvent,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  radiusVars,
  typographyVars,
  typeScaleVars,
  fontWeightVars,
} from '../theme/tokens.stylex';
import type {BaseProps} from '../BaseProps';
import type {SizeValue} from '../utils/types';
import {FieldLabel} from '../Field/FieldLabel';
import {FieldStatus} from '../FieldStatus/FieldStatus';
import type {IconType} from '../Icon';
import type {InputStatus} from '../Field/types';
import {Spinner} from '../Spinner/Spinner';
import {useTooltip} from '../Tooltip/useTooltip';
import {mergeProps} from '../utils/mergeProps';
import {rtlStyles} from '../utils/rtlStyles';
import {indicatorScope} from '../Indicator/indicator.markers.stylex';
import {interactionOverlayStyles} from '../utils/interactionOverlay.stylex';
import {useTranslator} from '../i18n/useTranslator';
import {useIndicatorFocusRing} from '../hooks/useIndicatorFocusRing';
import {useBusyAnnouncement} from '../hooks/useBusyAnnouncement';
import {usePressFeedback} from '../hooks/usePressFeedback';
import {useResolvedRequired} from '../hooks/useResolvedRequired';
import {useIndicator} from '../Indicator/useIndicator';
import {themeProps} from '../utils/themeProps';

import {useMergedRefs} from '../hooks/useMergedRefs';

// The touch press's paint, declared by the shared overlay styles on the
// element the controller writes to (`pressedAlpha`) at the press's strength,
// 1 while on and 1 → 0 over the release, and inherited resolved by the layer
// that paints it. See interactionOverlay.stylex.ts.
const pressedOverlayImage = 'var(--_press-paint-image)';

const styles = stylex.create({
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
  },
  containerLabelHidden: {
    gap: 0,
  },
  checkboxWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    isolation: 'isolate',
  },
  // The owner paints this layer over the resolved indicator, so a theme
  // replacement cannot accidentally drop the component's pressed contract.
  // Two pointers, two press models (see interactionOverlay.stylex.ts): a
  // mouse keeps `:active`; under a coarse pointer that arm is dropped and the
  // touch press controller writes `data-astryx-press` on the row, which this layer
  // reads off the same scope marker as the hover tint.
  indicatorPressOverlay: {
    '::after': {
      content: '""',
      position: 'absolute',
      inset: 0,
      borderRadius: radiusVars['--radius-inner'],
      pointerEvents: 'none',
      backgroundColor: {
        default: 'transparent',
        [stylex.when.ancestor(':active', indicatorScope)]: {
          default: colorVars['--color-overlay-pressed'],
          '@media (pointer: coarse)': 'transparent',
        },
      },
      // The touch press, as an image layer over the colour: an image change is
      // discrete, so no transition can delay the onset, and the strength the
      // row's `pressedAlpha` arms own (1 while on, 1 → 0 over the release) is
      // what moves. Coarse pointers only, like the drop above.
      backgroundImage: {
        default: null,
        [stylex.when.ancestor('[data-astryx-press="on"]', indicatorScope)]: {
          default: null,
          '@media (pointer: coarse)': pressedOverlayImage,
        },
        [stylex.when.ancestor('[data-astryx-press="fading"]', indicatorScope)]:
          {
            default: null,
            '@media (pointer: coarse)': pressedOverlayImage,
          },
      },
    },
  },
  // Holds only the indicator, so the focus ring has one unambiguous target.
  // `display: contents` adds no box of its own — the indicator keeps whatever
  // layout relationship it already had with the wrapper.
  indicatorSlot: {
    display: 'contents',
  },
  input: {
    position: 'absolute',
    top: '50%',
    margin: 0,
    padding: 0,
    opacity: 0,
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    zIndex: 1,
  },
  inputCoarse: {
    '@media (pointer: coarse)': {
      minInlineSize: 24,
      minBlockSize: 24,
    },
  },
  inputDisabled: {
    cursor: 'default',
  },
  labelWrapper: {
    display: 'flex',
    flexDirection: 'column',
  },
  description: {
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    fontWeight: fontWeightVars['--font-weight-normal'],
    color: colorVars['--color-text-secondary'],
  },
});

const wrapperSizeStyles = stylex.create({
  sm: {
    width: 20,
    height: 20,
  },
  md: {
    width: 24,
    height: 24,
  },
});

export type CheckboxInputSize = keyof typeof wrapperSizeStyles;

export interface CheckboxInputProps extends Omit<BaseProps, 'onChange'> {
  /** Ref forwarded to the underlying `<input>` element */
  ref?: React.Ref<HTMLInputElement>;
  /**
   * Label text for the checkbox (always rendered for accessibility).
   */
  label: string;
  /**
   * Whether to visually hide the label (still accessible to screen readers).
   * @default false
   */
  isLabelHidden?: boolean;
  /**
   * Description text displayed below the label.
   */
  description?: string;
  /**
   * Callback fired when the checkbox state changes.
   */
  onChange?: (checked: boolean, e: ChangeEvent<HTMLInputElement>) => void;
  /**
   * Async action on change. Fires after onChange if not prevented.
   */
  changeAction?: (
    checked: boolean,
    e: ChangeEvent<HTMLInputElement>,
  ) => void | Promise<void>;
  /**
   * Whether the checkbox is in a loading state.
   * @default false
   */
  isLoading?: boolean;
  /**
   * Whether the checkbox is checked, unchecked, or indeterminate.
   */
  value: boolean | 'indeterminate';
  /**
   * Whether the checkbox is disabled.
   * @default false
   */
  isDisabled?: boolean;

  /**
   * The HTML name attribute for the underlying checkbox input.
   * Useful for form submissions.
   */
  htmlName?: string;
  /**
   * Explains why the checkbox is disabled. When set together with
   * `isDisabled`, the checkbox shows a tooltip with this text on hover and
   * keyboard focus, and the control stays focusable (via `aria-disabled`) so
   * the reason is discoverable by keyboard and assistive technology.
   * Activation stays blocked.
   *
   * Use this instead of wrapping a disabled checkbox in `Tooltip` — disabled
   * controls don't emit the pointer events an external tooltip needs.
   *
   * @example
   * ```
   * <CheckboxInput
   *   label="Accept terms"
   *   value={accepted}
   *   isDisabled
   *   disabledMessage="Terms are managed by your administrator"
   * />
   * ```
   */
  disabledMessage?: string;
  /**
   * Whether the checkbox is read-only.
   * Displays the current state at full opacity but prevents interaction.
   * Unlike `isDisabled`, read-only checkboxes are not visually dimmed.
   * @default false
   */
  isReadOnly?: boolean;
  /**
   * Whether the field is optional. Mutually exclusive with isRequired.
   * @default false
   */
  isOptional?: boolean;
  /**
   * Whether the checkbox is required. Mutually exclusive with isOptional.
   * @default false
   */
  isRequired?: boolean;
  /**
   * Width of the field. Numbers are treated as pixels, strings are used as-is
   * (e.g. `'100%'`). Sizes the whole field (label, control, and status) so they
   * stay aligned, unlike setting width via `xstyle`/`className`/`style`.
   */
  width?: SizeValue;
  /**
   * The size of the checkbox.
   * - 'sm': Compact size (28px row height)
   * - 'md': Default size (36px row height)
   * @default 'md'
   */
  size?: CheckboxInputSize;
  /**
   * Callback fired when the checkbox receives focus.
   */
  onFocus?: (e: FocusEvent<HTMLInputElement>) => void;
  /**
   * Callback fired when the checkbox loses focus.
   */
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
  /**
   * Icon to display before the label text.
   */
  labelIcon?: ReactNode | IconType;
  /**
   * Status indicator for the checkbox.
   * When set with a message, displays a colored message box below the checkbox.
   */
  status?: InputStatus;
}

// Dynamic field width (number -> px, string used as-is).
const dynamicWidthStyles = stylex.create({
  width: (width: SizeValue | null) => ({width}),
});

/**
 * A checkbox input component for toggling boolean values.
 *
 * @example
 * ```
 * <CheckboxInput
 *   label="Accept terms"
 *   value={accepted}
 *   onChange={setAccepted}
 * />
 * <CheckboxInput
 *   label="Subscribe"
 *   description="Receive weekly updates"
 *   value={subscribed}
 *   onChange={setSubscribed}
 * />
 * ```
 */
export function CheckboxInput({
  id: idProp,
  label,
  isLabelHidden = false,
  description,
  onChange,
  changeAction,
  isLoading = false,
  value,
  isDisabled = false,
  htmlName,
  disabledMessage,
  isReadOnly = false,
  isOptional = false,
  isRequired = false,
  size = 'md',
  onFocus,
  onBlur,
  labelIcon,
  status,
  width,
  xstyle,
  className,
  style,
  ref,
  'aria-describedby': ariaDescribedByProp,
  ...rest
}: CheckboxInputProps) {
  // The row is the pressable: the overlay's pressed arm reads the row's
  // scope marker, the way the indicator's hover tint does.
  const pressable = usePressFeedback();
  const generatedId = useId();
  const id = idProp || generatedId;
  const descriptionID = useId();
  const statusMessageID = useId();
  // Announce the effective required state (form default included) while the
  // native `required` stays bound to the explicit `isRequired` so a layout
  // default never switches on browser validation.
  const isEffectivelyRequired = useResolvedRequired({isRequired, isOptional});

  const [, startTransition] = useTransition();
  const [optimisticValue, setOptimisticValue] = useOptimistic(value);
  const isBusy = isLoading || optimisticValue !== value;

  // A disabled checkbox stays focusable via aria-disabled instead of the
  // native disabled attribute (spec:AST-085 FR1). Value mutation is blocked by
  // the click and onChange guards on the input.
  const showsDisabledMessage = isDisabled && !!disabledMessage;
  const disabledMessageTooltip = useTooltip({
    placement: 'above',
    // The container row is not naturally focusable; focusin bubbles up from the
    // native checkbox, so always attach focus listeners.
    focusTrigger: 'always',
    isEnabled: showsDisabledMessage,
  });

  // The checkbox visual is an indicator: a theme can restyle it through the
  // canonical `checkbox-indicator` target or replace the component outright.
  const CheckboxControl = useIndicator('checkbox');
  // The ring is drawn on the indicator itself: the native input is
  // `opacity: 0`, and only the indicator's own element can shape the outline
  // to match it. See useIndicatorFocusRing.
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const t = useTranslator();
  // The busy Spinner sits in the decorative, aria-hidden indicator, so this
  // control announces its busy start itself (spec:AST-086 FR8).
  useBusyAnnouncement(isBusy, t('@astryx.spinner.loading'), indicatorRef);
  const {focusProps} = useIndicatorFocusRing(indicatorRef);

  const isIndeterminate = optimisticValue === 'indeterminate';
  const isChecked = optimisticValue === true;

  // Sync the native indeterminate DOM property (can't be set via JSX
  // attribute). On a native checkbox this is the authoritative way to expose
  // the mixed state — a separate aria-checked="mixed" would be redundant and
  // can desync from / override the native state (forms-16), so it is omitted.
  const indeterminateRef = useCallback(
    (el: HTMLInputElement | null) => {
      if (el) {
        el.indeterminate = isIndeterminate;
      }
    },
    [isIndeterminate],
  );

  // Build aria-describedby from description and status message
  // Only include descriptionID when the element actually renders.
  // FieldLabel renders the description (with descriptionID) even when the
  // label is visually hidden — it's sr-only, so keep it linked.
  // A consumer's own `aria-describedby` (CheckboxListItem points the control
  // at its visible row description) comes first, then the input's own ids —
  // the explicit attribute below would otherwise replace it via `...rest`.
  const describedByParts: string[] = [];
  if (ariaDescribedByProp) {
    describedByParts.push(ariaDescribedByProp);
  }
  if (description) {
    describedByParts.push(descriptionID);
  }
  if (status?.message) {
    describedByParts.push(statusMessageID);
  }
  if (showsDisabledMessage) {
    describedByParts.push(disabledMessageTooltip.describedBy);
  }
  const ariaDescribedBy =
    describedByParts.length > 0 ? describedByParts.join(' ') : undefined;

  return (
    <div
      {...mergeProps(
        themeProps('checkbox-input', {size}),
        stylex.props(width != null && dynamicWidthStyles.width(width), xstyle),
        className,
        style,
      )}>
      <div
        ref={el => {
          // Interaction (hover/focus) listeners for the disabled-message
          // tooltip attach to the whole row for a larger trigger target;
          // positioning anchors on the checkbox itself (below) so the tooltip
          // appears next to the control, not the far edge of the row.
          // Handlers are gated internally by isEnabled, so attaching
          // unconditionally is safe.
          disabledMessageTooltip.interactionRef(el);
        }}
        {...(isDisabled ? undefined : pressable)}
        {...stylex.props(
          styles.container,
          isLabelHidden && styles.containerLabelHidden,
          // Hover and focus reach the checkbox visual through this ancestor
          // marker rather than props, so the whole row drives it.
          !isDisabled && indicatorScope,
          // The touch press's strength and release live on the row the
          // controller writes to; the layer over the checkbox box inherits
          // and paints it.
          !isDisabled && interactionOverlayStyles.pressedAlpha,
        )}>
        <div
          {...stylex.props(
            styles.checkboxWrapper,
            wrapperSizeStyles[size],
            !isDisabled && styles.indicatorPressOverlay,
          )}
          {...focusProps}>
          <input
            {...rest}
            ref={useMergedRefs(
              ref,
              indeterminateRef,
              disabledMessageTooltip.positionRef,
            )}
            id={id}
            type="checkbox"
            // Withhold the name while disabled: the input stays focusable (not
            // natively disabled), and a disabled control must not submit.
            name={isDisabled ? undefined : htmlName}
            checked={isChecked}
            aria-disabled={isDisabled ? 'true' : undefined}
            // Detached from its form while disabled, so it neither submits nor
            // blocks submission through `required` (spec:AST-085 FR3).
            form={isDisabled ? '' : undefined}
            // Native `disabled` suppressed onClick (FR2); preventDefault here
            // would desync React's controlled checked state.
            onClick={isDisabled ? undefined : rest.onClick}
            readOnly={isReadOnly}
            required={isRequired}
            aria-required={isEffectivelyRequired ? 'true' : undefined}
            onChange={e => {
              if (isDisabled || isBusy || isReadOnly) {
                // Activation clears the native mixed state; React restores
                // only `checked`, so restore `indeterminate` too.
                e.target.indeterminate = isIndeterminate;
                return;
              }
              const checked = e.target.checked;
              onChange?.(checked, e);
              if (changeAction && !e.defaultPrevented) {
                startTransition(async () => {
                  setOptimisticValue(checked);
                  await changeAction(checked, e);
                });
              }
            }}
            onFocus={onFocus}
            onBlur={onBlur}
            aria-readonly={isReadOnly || undefined}
            aria-describedby={ariaDescribedBy}
            aria-invalid={status?.type === 'error' ? true : undefined}
            aria-busy={isBusy || undefined}
            {...stylex.props(
              styles.input,
              rtlStyles.centerInline('-50%'),
              styles.inputCoarse,
              wrapperSizeStyles[size],
              isDisabled && styles.inputDisabled,
            )}
          />
          {/*
           * A container holding ONLY the indicator, so the focus ring has an
           * unambiguous target whatever a theme renders. `display: contents`
           * keeps it out of layout entirely.
           */}
          <span ref={indicatorRef} {...stylex.props(styles.indicatorSlot)}>
            <CheckboxControl
              state={
                isIndeterminate
                  ? 'indeterminate'
                  : isChecked
                    ? 'checked'
                    : 'unchecked'
              }
              size={size}
              isDisabled={isDisabled}>
              {isBusy ? <Spinner size="sm" shade="inherit" /> : null}
            </CheckboxControl>
          </span>
        </div>
        <div {...stylex.props(styles.labelWrapper)}>
          <FieldLabel
            // A checkbox's label shares a row with its control, unlike a form
            // field's label above its input. Naming the label rather than the
            // arrangement means a theme asks for the thing it wants, and the
            // component that actually knows what this is says so.
            {...themeProps('checkbox-label')}
            label={label}
            inputID={id}
            isLabelHidden={isLabelHidden}
            isDisabled={isDisabled}
            isOptional={isOptional}
            isRequired={isRequired}
            labelIcon={labelIcon}
            description={description}
            descriptionID={descriptionID}
          />
        </div>
      </div>
      {status?.message && (
        <FieldStatus
          type={status.type}
          message={status.message}
          id={statusMessageID}
          variant="detached"
        />
      )}
      {showsDisabledMessage &&
        disabledMessageTooltip.renderTooltip(disabledMessage)}
    </div>
  );
}

CheckboxInput.displayName = 'CheckboxInput';
