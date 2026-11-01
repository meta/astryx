// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file CheckboxList.tsx
 * @input Uses React, useId, useOptimistic, useTransition, Field, List, CheckboxListContext, FormLayoutContext
 * @output Exports CheckboxList component, CheckboxListProps
 * @position Core implementation; consumed by index.ts, tested by CheckboxList.test.tsx
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/CheckboxList/CheckboxList.doc.mjs
 * - /packages/core/src/CheckboxList/CheckboxList.test.tsx
 * - /packages/core/src/CheckboxList/index.ts
 * - /apps/storybook/stories/CheckboxList.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/CheckboxList/ (showcase blocks)
 */

import {
  use,
  useCallback,
  useId,
  useMemo,
  useOptimistic,
  useTransition,
  type ReactNode,
} from 'react';
import {
  type FieldInputBaseProps,
  useFieldInputStyling,
} from '../Field/fieldParts';
import {useMergedRefs} from '../hooks/useMergedRefs';
import type {SizeValue} from '../utils/types';
import {Field} from '../Field/Field';
import {FormLayoutContext} from '../FormLayout/FormLayoutContext';
import type {InputStatus} from '../Field/types';
import {List} from '../List/List';
import type {ListDensity} from '../List/ListContext';
import {useTooltip} from '../Tooltip';
import * as stylex from '@stylexjs/stylex';
import {mergeProps} from '../utils';
import {themeProps} from '../utils/themeProps';
import {joinAriaIDs} from '../utils/inputAria';
import {
  CheckboxListContext,
  type CheckboxListContextValue,
} from './CheckboxListContext';

const EMPTY_ARRAY: string[] = [];

export interface CheckboxListProps extends Omit<
  FieldInputBaseProps<HTMLDivElement>,
  'onChange'
> {
  /** Ref forwarded to the `role="group"` element. */
  ref?: React.Ref<HTMLDivElement>;
  /**
   * Label text for the checkbox group (always rendered for accessibility).
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
   * Whether the group is optional. Shows the optional indicator after the
   * group label, unless a surrounding `FormLayout` already makes fields
   * optional by default.
   * @default false
   */
  isOptional?: boolean;
  /**
   * Status indicator for the checkbox group.
   * When set with a message, displays a colored message box below the group.
   */
  status?: InputStatus;
  /**
   * The currently selected values (collection mode).
   */
  value?: string[];
  /**
   * Callback fired when the selected values change (collection mode).
   */
  onChange?: (values: string[]) => void;
  /**
   * Async action on change. Fires after onChange.
   * While the returned promise is pending, the toggled item shows a spinner
   * inside its checkbox and is marked `aria-busy`, and re-toggling it is
   * blocked. Other items remain interactive.
   */
  changeAction?: (values: string[]) => void | Promise<void>;
  /**
   * Spacing density for list items.
   * @default 'balanced'
   */
  density?: ListDensity;
  /**
   * Whether to show dividers between list items.
   * @default false
   */
  hasDividers?: boolean;
  /**
   * Whether all checkbox items are disabled.
   * @default false
   */
  isDisabled?: boolean;
  /**
   * Explains why the checkbox group is disabled. Applies to the whole-group
   * disabled state (`isDisabled`), not individual items. When set together with
   * `isDisabled`, the group shows a tooltip with this text on hover and keyboard
   * focus, and its checkboxes stay focusable (via `aria-disabled`) so the reason
   * is discoverable by keyboard and assistive technology. Toggling stays
   * blocked.
   *
   * Use this instead of wrapping a disabled group in `Tooltip` — disabled
   * controls don't emit the pointer events an external tooltip needs.
   */
  disabledMessage?: string;
  /**
   * Whether all checkbox items are read-only.
   * Displays the current state at full opacity but prevents interaction.
   * Unlike `isDisabled`, read-only checkboxes are not visually dimmed.
   * @default false
   */
  isReadOnly?: boolean;
  /**
   * Width of the field. Numbers are treated as pixels, strings are used as-is
   * (e.g. `'100%'`). Sizes the whole field (label, control, and status) so they
   * stay aligned, unlike setting width via `xstyle`/`className`/`style`.
   */
  width?: SizeValue;
  /**
   * Checkbox list items to render.
   */
  children: ReactNode;
}

/**
 * A checkbox group component for multi-value selection.
 *
 * Composes Field (for label, description, status) and List
 * (for density, dividers) with a context provider for collection mode.
 *
 * @example
 * ```
 * <CheckboxList
 *   label="Notifications"
 *   value={selected}
 *   onChange={setSelected}>
 *   <CheckboxListItem label="Email" value="email" />
 *   <CheckboxListItem label="SMS" value="sms" />
 *   <CheckboxListItem label="Push" value="push" />
 * </CheckboxList>
 * ```
 */
export function CheckboxList({
  label,
  isLabelHidden = false,
  description,
  isOptional = false,
  status,
  value,
  onChange,
  changeAction,
  density = 'balanced',
  hasDividers = false,
  isDisabled = false,
  disabledMessage,
  isReadOnly = false,
  children,
  ref,
  width,
  containerXstyle,
  containerClassName,
  containerStyle,
  controlXstyle,
  controlClassName,
  controlStyle,
  'aria-labelledby': ariaLabelledByProp,
  'aria-describedby': ariaDescribedByProp,
  ...restProps
}: CheckboxListProps) {
  const {rest, container} = useFieldInputStyling('CheckboxList', restProps, {
    containerXstyle,
    containerClassName,
    containerStyle,
  });
  const formLayout = use(FormLayoutContext);
  // The items' checkboxes resolve `aria-required` from the form default; an
  // optional group must not mark them required.
  const itemFormLayout = useMemo(
    () => ({...formLayout, defaultOptionality: undefined}),
    [formLayout],
  );
  const inputID = useId();
  const labelID = useId();
  const descriptionID = useId();
  const statusMessageID = useId();

  const [, startTransition] = useTransition();
  const isCollectionMode = value !== undefined;
  const effectiveValue = value ?? EMPTY_ARRAY;
  const [optimisticValue, setOptimisticValue] = useOptimistic(effectiveValue);
  // Values whose `changeAction` is pending. React settles concurrent
  // transitions together, so each toggled value stays listed until they all
  // finish, then reverts to empty without manual cleanup.
  const [loadingValues, addLoadingValue] = useOptimistic<
    ReadonlyArray<string>,
    string
  >(EMPTY_ARRAY, (pending, toggled) =>
    pending.includes(toggled) ? pending : [...pending, toggled],
  );

  // Disabled-reason tooltip. Applies to the whole-group disabled state. Disabled
  // controls swallow pointer events, so the tooltip listeners attach to the
  // group container and the checkboxes stay perceivable via aria-disabled
  // instead of the disabled attribute. Toggling is blocked in the item. The
  // reason describes the group and each checkbox (see
  // CheckboxListContextValue.disabledMessageID).
  const showsDisabledMessage = isDisabled && !!disabledMessage;
  const disabledMessageTooltip = useTooltip({
    placement: 'above',
    // The group container is not naturally focusable; focusin bubbles up from
    // the checkboxes, so always attach focus listeners.
    focusTrigger: 'always',
    isEnabled: showsDisabledMessage,
  });

  const handleChange = useCallback(
    (newValues: string[], toggledValue?: string) => {
      onChange?.(newValues);
      if (changeAction) {
        startTransition(async () => {
          setOptimisticValue(newValues);
          if (toggledValue !== undefined) {
            addLoadingValue(toggledValue);
          }
          await changeAction(newValues);
        });
      }
    },
    [
      onChange,
      changeAction,
      startTransition,
      setOptimisticValue,
      addLoadingValue,
    ],
  );

  const contextValue = useMemo<CheckboxListContextValue>(
    () => ({
      value: isCollectionMode ? optimisticValue : undefined,
      onChange: isCollectionMode ? handleChange : undefined,
      isDisabled,
      hasDisabledMessage: showsDisabledMessage,
      disabledMessageID: showsDisabledMessage
        ? disabledMessageTooltip.describedBy
        : undefined,
      isReadOnly,
      loadingValues,
    }),
    [
      isCollectionMode,
      optimisticValue,
      handleChange,
      isDisabled,
      showsDisabledMessage,
      disabledMessageTooltip.describedBy,
      isReadOnly,
      loadingValues,
    ],
  );

  return (
    <Field
      label={label}
      isLabelHidden={isLabelHidden}
      description={description}
      inputID={inputID}
      labelID={labelID}
      isGroupLabel
      isOptional={isOptional}
      descriptionID={description ? descriptionID : undefined}
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
      statusVariant="detached"
      width={width}
      xstyle={container.xstyle}
      {...mergeProps(themeProps('checkbox-list'), {
        className: container.className,
        style: container.style,
      })}>
      <CheckboxListContext value={contextValue}>
        <div
          {...rest}
          // The disabled-message tooltip anchors here; its handlers are gated
          // internally by isEnabled, so attaching unconditionally is safe.
          ref={useMergedRefs(ref, disabledMessageTooltip.ref)}
          {...mergeProps(
            stylex.props(controlXstyle),
            controlClassName,
            controlStyle,
          )}
          role="group"
          // A caller aria-labelledby names the group together with its label.
          aria-labelledby={joinAriaIDs(labelID, ariaLabelledByProp)}
          aria-describedby={
            [
              ariaDescribedByProp,
              description ? descriptionID : null,
              status?.message ? statusMessageID : null,
              showsDisabledMessage ? disabledMessageTooltip.describedBy : null,
            ]
              .filter(Boolean)
              .join(' ') || undefined
          }>
          <List density={density} hasDividers={hasDividers}>
            {/* Always mounted, so toggling isOptional keeps the rows. */}
            <FormLayoutContext value={isOptional ? itemFormLayout : formLayout}>
              {children}
            </FormLayoutContext>
          </List>
        </div>
      </CheckboxListContext>
      {showsDisabledMessage &&
        disabledMessageTooltip.renderTooltip(disabledMessage)}
    </Field>
  );
}

CheckboxList.displayName = 'CheckboxList';
