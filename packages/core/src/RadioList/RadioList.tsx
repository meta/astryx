// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file RadioList.tsx
 * @input Uses React useId, useCallback, useRef, layer-scoped context, ReactNode, Field, InputStatus
 * @output Exports RadioList component, RadioListProps, RadioListContext
 * @position Core implementation; consumed by index.ts, tested by RadioList.test.tsx
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/RadioList/RadioList.doc.mjs
 * - /packages/core/src/RadioList/RadioList.test.tsx
 * - /packages/core/src/RadioList/index.ts
 * - /apps/storybook/stories/RadioList.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/RadioList/ (showcase blocks)
 */

import {RadioListReasonContext} from './RadioListReasonContext';
import {createLayerScopedContext as createContext} from '../Layer/layerScopedContext';
import React, {
  useCallback,
  useId,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {spacingVars} from '../theme/tokens.stylex';
import {Field} from '../Field/Field';
import type {InputStatus} from '../Field/types';
import {useTooltip} from '../Tooltip';
import {useResolvedRequired} from '../hooks/useResolvedRequired';
import {composeEventHandlers, mergeProps} from '../utils';
import {joinAriaIDs} from '../utils/inputAria';
import {
  type FieldInputBaseProps,
  useFieldInputStyling,
} from '../Field/fieldParts';
import type {SizeValue} from '../utils/types';
import {themeProps} from '../utils/themeProps';

/**
 * Size of the radio controls, matching CheckboxInput sizes.
 */
export type RadioListSize = 'sm' | 'md';

export interface RadioListContextValue {
  name: string;
  value: string;
  onChange: (value: string) => void;
  isDisabled: boolean;
  /**
   * True when the whole group is disabled *and* a `disabledMessage` is set. In
   * that mode radios stay focusable via `aria-disabled` (instead of the native
   * `disabled` attribute) so the disabled-reason tooltip is keyboard- and
   * AT-discoverable; selection is still blocked in the item's onChange guard.
   */
  hasDisabledMessage: boolean;
  isRequired: boolean;
  size: RadioListSize;
  status?: InputStatus;
}

export const RadioListContext = createContext<RadioListContextValue | null>(
  null,
);
RadioListContext.displayName = 'RadioListContext';

const styles = stylex.create({
  radiogroup: {
    display: 'flex',
  },
  vertical: {
    flexDirection: 'column',
    gap: spacingVars['--spacing-2'],
  },
  horizontal: {
    flexDirection: 'row',
    gap: spacingVars['--spacing-5'],
  },
});

export interface RadioListProps extends Omit<
  FieldInputBaseProps<HTMLDivElement>,
  'onChange'
> {
  /** Ref forwarded to the `role="radiogroup"` element. */
  ref?: React.Ref<HTMLDivElement>;
  /**
   * Label text for the radio group (always rendered for accessibility).
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
   * The currently selected value.
   */
  value: string;
  /**
   * Callback fired when the selected value changes.
   */
  onChange: (value: string) => void;
  /**
   * Layout direction of the radio items.
   * @default "vertical"
   */
  orientation?: 'vertical' | 'horizontal';
  /**
   * Whether all radio items are disabled.
   * @default false
   */
  isDisabled?: boolean;

  /**
   * The HTML name attribute shared by the radio inputs in the group.
   * Useful for form submissions; when omitted, a unique internal name is
   * generated so the group still roves correctly.
   */
  htmlName?: string;
  /**
   * Explains why the radio group is disabled. Applies to the whole-group
   * disabled state (`isDisabled`), not individual items. When set together with
   * `isDisabled`, the group shows a tooltip with this text on hover and keyboard
   * focus, and its radios stay focusable (via `aria-disabled`) so the reason is
   * discoverable by keyboard and assistive technology. Selection stays blocked.
   *
   * Use this instead of wrapping a disabled group in `Tooltip` — disabled
   * controls don't emit the pointer events an external tooltip needs.
   */
  disabledMessage?: string;
  /**
   * Whether the radio group is required.
   * @default false
   */
  isRequired?: boolean;
  /**
   * Whether the field is optional. Mutually exclusive with isRequired.
   * @default false
   */
  isOptional?: boolean;
  /**
   * Status indicator for the radio group.
   * When set with a message, displays a colored message box below the group.
   */
  status?: InputStatus;
  /**
   * The size of the radio controls.
   * - 'sm': Compact size (20px radio)
   * - 'md': Default size (24px radio)
   * @default 'md'
   */
  size?: RadioListSize;
  /**
   * Width of the field. Numbers are treated as pixels, strings are used as-is
   * (e.g. `'100%'`). Sizes the whole field (label, control, and status) so they
   * stay aligned, unlike setting width via `xstyle`/`className`/`style`.
   */
  width?: SizeValue;
  /**
   * Tooltip text to display in an info icon at the end of the label.
   */
  labelTooltip?: string;
  /**
   * Test ID for the outer container.
   */
  'data-testid'?: string;
  /**
   * Radio list items to render.
   */
  children: ReactNode;
}

/**
 * A radio group component for single-value selection.
 *
 * @example
 * ```
 * <RadioList
 *   label="Notification preference"
 *   value={selected}
 *   onChange={setSelected}>
 *   <RadioListItem label="Email" value="email" />
 *   <RadioListItem label="SMS" value="sms" />
 *   <RadioListItem label="Push" value="push" />
 * </RadioList>
 * ```
 */
export function RadioList({
  ref,
  label,
  isLabelHidden = false,
  description,
  value,
  onChange,
  orientation = 'vertical',
  isDisabled = false,
  disabledMessage,
  isRequired = false,
  isOptional = false,
  size = 'md',
  status,
  labelTooltip,
  width,
  containerXstyle,
  containerClassName,
  containerStyle,
  controlXstyle,
  controlClassName,
  controlStyle,
  htmlName,
  children,
  onFocus,
  'aria-labelledby': ariaLabelledByProp,
  'aria-describedby': ariaDescribedByProp,
  ...restProps
}: RadioListProps) {
  const {rest, container} = useFieldInputStyling('RadioList', restProps, {
    containerXstyle,
    containerClassName,
    containerStyle,
  });
  const autoName = useId();
  const name = htmlName ?? autoName;
  const inputID = useId();
  const labelID = useId();
  const descriptionID = useId();
  const statusMessageID = useId();

  const groupRef = useRef<HTMLDivElement>(null);

  // The radiogroup exposes the *effective* required state so a form-wide
  // `defaultOptionality="required"` is announced even when the group carries no
  // visible indicator. Individual radios keep their native `required` bound to
  // the explicit `isRequired` (via context), so a layout default never switches
  // on browser validation for the group.
  const isEffectivelyRequired = useResolvedRequired({isRequired, isOptional});

  // Disabled-reason tooltip. Applies to the whole-group disabled state. Disabled
  // controls swallow pointer events, so the tooltip listeners attach to the
  // radiogroup container and the radios stay perceivable via aria-disabled
  // instead of the disabled attribute. Selection is blocked in the item's
  // onChange guard. The reason describes the radiogroup and each radio (see
  // RadioListReasonContext).
  const showsDisabledMessage = isDisabled && !!disabledMessage;
  const disabledMessageTooltip = useTooltip({
    placement: 'above',
    // The radiogroup container is not naturally focusable; focusin bubbles up
    // from the radios, so always attach focus listeners.
    focusTrigger: 'always',
    isEnabled: showsDisabledMessage,
  });

  const contextValue = useMemo<RadioListContextValue>(
    () => ({
      name,
      value,
      onChange,
      isDisabled,
      hasDisabledMessage: showsDisabledMessage,
      isRequired,
      size,
      status,
    }),
    [
      name,
      value,
      onChange,
      isDisabled,
      showsDisabledMessage,
      isRequired,
      size,
      status,
    ],
  );

  /**
   * Make the tab stop deterministic when a radio group has no selected value.
   *
   * Native `<input type="radio">` groups (same `name`) implement roving
   * tabindex for free: when a value is selected, that radio is the single tab
   * stop and receives focus, so no correction is needed there. But the ARIA
   * radio-group pattern (APG) also requires a deterministic tab stop when the
   * group has *no* selection — and browsers disagree here. Chrome, when
   * Shift+Tab moves focus backward into an unselected group, lands on the
   * *last* radio; forward Tab lands on the *first*. To keep the entry point
   * predictable we redirect focus:
   *   - forward entry  → first enabled radio (APG default)
   *   - backward entry → last enabled radio (matches Chrome's backward tab)
   *
   * The redirect only runs when focus arrives from *outside* the group's own
   * radios (guarded via `relatedTarget` containment). Moving between radios
   * inside the group — arrow keys, clicks, programmatic focus of a sibling —
   * is never hijacked.
   */
  const handleFocus = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      // Only correct the no-selection case; a selected value already provides
      // a deterministic native tab stop.
      if (value !== '') {
        return;
      }

      const group = groupRef.current;
      if (!group) {
        return;
      }

      // Ignore focus moving *within* the group. `relatedTarget` is the element
      // losing focus; if it was inside the group, this is intra-group movement
      // (arrow keys, clicking a sibling) and must not be hijacked. Some browsers
      // report a null `relatedTarget`; fall back to checking whether the group
      // already contained the active element before this focus landed.
      const relatedTarget = e.relatedTarget as Node | null;
      if (relatedTarget) {
        if (group.contains(relatedTarget)) {
          return;
        }
      } else if (
        document.activeElement &&
        document.activeElement !== e.target &&
        group.contains(document.activeElement)
      ) {
        return;
      }

      const radios = Array.from(
        group.querySelectorAll<HTMLInputElement>(
          'input[type="radio"]:not([disabled])',
        ),
      );
      if (radios.length === 0) {
        return;
      }

      const target = e.target as HTMLElement;
      const targetIndex = radios.findIndex(radio => radio === target);
      // Only correct when the focus target is one of our enabled radios (not a
      // nested control such as end-content).
      if (targetIndex === -1) {
        return;
      }

      // Infer tab direction from which end the browser chose. On a backward
      // (Shift+Tab) entry into an unselected group, browsers focus the *last*
      // radio; keep it as the deterministic backward tab stop. Any other entry
      // (forward Tab, or a browser that lands mid-group) is normalized to the
      // *first* enabled radio, the APG default.
      const isBackwardEntry = targetIndex === radios.length - 1;
      const intended = isBackwardEntry ? radios[radios.length - 1] : radios[0];

      if (target !== intended) {
        intended.focus();
      }
    },
    [value],
  );

  return (
    <Field
      {...container}
      label={label}
      isLabelHidden={isLabelHidden}
      description={description}
      inputID={inputID}
      labelID={labelID}
      isGroupLabel
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
        {...rest}
        ref={el => {
          groupRef.current = el;
          if (typeof ref === 'function') {
            ref(el);
          } else if (ref) {
            ref.current = el;
          }
          // Anchor + hover/focus listeners for the disabled-message tooltip.
          // Handlers are gated internally by isEnabled, so attaching
          // unconditionally is safe.
          disabledMessageTooltip.ref(el);
        }}
        role="radiogroup"
        // A caller aria-labelledby names the group together with its label.
        aria-labelledby={joinAriaIDs(labelID, ariaLabelledByProp)}
        onFocus={composeEventHandlers(handleFocus, onFocus)}
        aria-describedby={
          [
            ariaDescribedByProp,
            description ? descriptionID : null,
            status?.message ? statusMessageID : null,
            showsDisabledMessage ? disabledMessageTooltip.describedBy : null,
          ]
            .filter(Boolean)
            .join(' ') || undefined
        }
        aria-invalid={status?.type === 'error' ? true : undefined}
        aria-required={isEffectivelyRequired || undefined}
        {...mergeProps(
          themeProps('radio-list', {orientation, size}),
          stylex.props(
            styles.radiogroup,
            orientation === 'vertical' ? styles.vertical : styles.horizontal,
            controlXstyle,
          ),
          controlClassName,
          controlStyle,
        )}>
        <RadioListContext value={contextValue}>
          <RadioListReasonContext
            value={
              showsDisabledMessage
                ? disabledMessageTooltip.describedBy
                : undefined
            }>
            {children}
          </RadioListReasonContext>
        </RadioListContext>
      </div>
      {showsDisabledMessage &&
        disabledMessageTooltip.renderTooltip(disabledMessage)}
    </Field>
  );
}

RadioList.displayName = 'RadioList';
