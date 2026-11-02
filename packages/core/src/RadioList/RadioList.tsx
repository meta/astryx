// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file RadioList.tsx
 * @input Uses React useId, useCallback, useRef, layer-scoped context, ReactNode, Field, InputStatus, useInternalListFocus
 * @output Exports RadioList component, RadioListProps, RadioListContext, and the internal RadioListFormContext
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
import {useInternalListFocus} from '../hooks/useListFocus';
import {useMergedRefs} from '../hooks/useMergedRefs';

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
   * True when the whole group is disabled *and* a `disabledMessage` is set, so
   * the group shows its disabled-reason tooltip. Every disabled radio stays
   * focusable with `aria-disabled`, with or without a reason.
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

/**
 * Internal: how the group's radios take part in their form. Not exported from
 * the package.
 */
export interface RadioListFormContextValue {
  /**
   * Every radio leaves the form: the whole group is disabled, so nothing
   * submits and a required group does not block the submit (spec:AST-085
   * FR3). Detaching all of them, never one, keeps the radios one native group
   * with one Tab stop.
   */
  detachesFromForm: boolean;
  /**
   * The `name` the radios render. Detached radios have no form owner, so they
   * take a name unique to this group: one shared with a detached group in
   * another form would merge the two native groups. A detached radio submits
   * nothing, so the form field name does not matter for it.
   */
  radioName: string;
}

export const RadioListFormContext =
  createContext<RadioListFormContextValue | null>(null);
RadioListFormContext.displayName = 'RadioListFormContext';

/** Whether a radio refuses selection: `aria-disabled` or native `disabled`. */
function isUnavailable(radio: HTMLInputElement): boolean {
  return radio.disabled || radio.getAttribute('aria-disabled') === 'true';
}

/** The group's own radios (not those of a group nested inside an option). */
function radiosOf(group: HTMLElement, name: string): HTMLInputElement[] {
  return Array.from(
    group.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
  ).filter(radio => radio.name === name);
}

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
   * Whether all radio items are disabled. Disabled radios stay focusable
   * with `aria-disabled`, refuse selection, and submit no value.
   * @default false
   */
  isDisabled?: boolean;

  /**
   * The HTML name attribute shared by the radio inputs in the group.
   * Useful for form submissions; when omitted, a unique internal name is
   * generated so the group still roves correctly. A disabled group submits
   * nothing, so its radios use the internal name, which keeps it apart from a
   * disabled group with the same `htmlName` in another form.
   */
  htmlName?: string;
  /**
   * Explains why the radio group is disabled. Applies to the whole-group
   * disabled state (`isDisabled`), not individual items. When set together with
   * `isDisabled`, the group shows a tooltip with this text on hover and keyboard
   * focus. Disabled radios stay focusable (via `aria-disabled`) with or without
   * a reason, so the reason is discoverable by keyboard. Selection stays
   * blocked.
   *
   * Use this instead of wrapping a disabled group in `Tooltip`: the reason
   * also describes each radio, so a screen reader announces it when a radio
   * takes focus.
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
  onKeyDown,
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

  // Disabled-reason tooltip. Applies to the whole-group disabled state. The
  // tooltip listeners attach to the radiogroup container; the radios stay
  // focusable via aria-disabled, as every disabled radio does, and selection
  // is blocked in the item's onChange guard. The reason describes the
  // radiogroup and each radio (see RadioListReasonContext).
  const showsDisabledMessage = isDisabled && !!disabledMessage;
  const disabledMessageTooltip = useTooltip({
    placement: 'above',
    // The radiogroup container is not naturally focusable; focusin bubbles up
    // from the radios, so always attach focus listeners.
    focusTrigger: 'always',
    isEnabled: showsDisabledMessage,
  });

  const radioName = isDisabled ? autoName : name;
  const formContextValue = useMemo<RadioListFormContextValue>(
    () => ({detachesFromForm: isDisabled, radioName}),
    [isDisabled, radioName],
  );

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

      const radios = radiosOf(group, radioName);
      // Only correct the no-selection case: a checked radio already is the
      // native tab stop. A value that matches no option checks none.
      if (radios.some(radio => radio.checked)) {
        return;
      }
      const target = e.target as HTMLElement;
      const targetIndex = radios.findIndex(radio => radio === target);
      // Only correct when the focus target is one of the group's radios (not a
      // nested control such as end-content).
      if (targetIndex === -1) {
        return;
      }
      // The entry lands on an option that can be chosen. Only a wholly
      // disabled group enters on a disabled radio, keeping its enabled focus
      // order (spec:AST-085 FR1).
      const available = radios.filter(radio => !isUnavailable(radio));
      const stops = available.length > 0 ? available : radios;

      // Infer tab direction from which end the browser chose. On a backward
      // (Shift+Tab) entry into an unselected group, browsers focus the *last*
      // radio; keep the last available one as the deterministic backward tab
      // stop. Any other entry (forward Tab, or a browser that lands
      // mid-group) is normalized to the *first* available radio, the APG
      // default.
      const isBackwardEntry = targetIndex === radios.length - 1;
      const intended = isBackwardEntry ? stops[stops.length - 1] : stops[0];

      if (target !== intended) {
        intended.focus();
      }
    },
    [radioName],
  );

  /**
   * Arrow keys skip individually disabled options. The browser's radio group
   * would move onto an `aria-disabled` radio, so in a group with any disabled
   * radio every arrow move goes through the shared list focus, as
   * SegmentedControl's does: focus goes to the next available radio in the
   * same direction (the inline-end arrow forward, mirrored in right-to-left),
   * wrapping as the native group does, or stays put when there is none, and
   * the radio it lands on is selected. Owning every move, not only the ones
   * that would land on a disabled radio, keeps one direction rule in every
   * engine (WebKit does not mirror horizontal arrows in right-to-left). A
   * group with no disabled radio keeps the browser's own arrow keys.
   */
  const {listRef, handleKeyDown: handleListKeyDown} =
    useInternalListFocus<HTMLDivElement>({
      itemSelector: `input[type="radio"][name="${radioName.replace(/["\\]/g, '\\$&')}"]`,
      orientation: 'both',
      hasHomeEnd: false,
      wrap: true,
    });
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const group = groupRef.current;
      const target = e.target;
      if (
        group == null ||
        e.defaultPrevented ||
        !(target instanceof HTMLInputElement) ||
        target.type !== 'radio' ||
        target.name !== radioName ||
        !radiosOf(group, radioName).some(isUnavailable)
      ) {
        return;
      }
      handleListKeyDown(e);
      const focused = group.ownerDocument.activeElement;
      if (
        focused !== target &&
        focused instanceof HTMLInputElement &&
        focused.type === 'radio'
      ) {
        focused.click();
      }
    },
    [handleListKeyDown, radioName],
  );

  const groupRefs = useMergedRefs(
    ref,
    groupRef,
    listRef,
    disabledMessageTooltip.ref,
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
        // The disabled-message tooltip's anchor and hover/focus listeners are
        // gated internally by isEnabled, so attaching unconditionally is safe.
        ref={groupRefs}
        role="radiogroup"
        // A caller aria-labelledby names the group together with its label.
        aria-labelledby={joinAriaIDs(labelID, ariaLabelledByProp)}
        onFocus={composeEventHandlers(handleFocus, onFocus)}
        // The caller's handler runs first and can opt out of the skipping
        // with preventDefault.
        onKeyDown={composeEventHandlers(onKeyDown, handleKeyDown)}
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
          <RadioListFormContext value={formContextValue}>
            <RadioListReasonContext
              value={
                showsDisabledMessage
                  ? disabledMessageTooltip.describedBy
                  : undefined
              }>
              {children}
            </RadioListReasonContext>
          </RadioListFormContext>
        </RadioListContext>
      </div>
      {showsDisabledMessage &&
        disabledMessageTooltip.renderTooltip(disabledMessage)}
    </Field>
  );
}

RadioList.displayName = 'RadioList';
