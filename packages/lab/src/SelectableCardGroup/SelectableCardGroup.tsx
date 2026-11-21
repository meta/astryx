// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SelectableCardGroup.tsx
 * @input Uses core SelectableCard (its input set through Core's internal
 *   SelectableCardInputContext), Field (the group label and description),
 *   useFieldInputStyling, useId, StyleX and the spacing tokens
 * @output Exports SelectableCardGroup, SelectableCardGroupItem and their props
 * @position Lab: a set of selectable cards with the semantics of its selection
 *
 * SYNC: When modified, update these files to stay in sync:
 * - ./SelectableCardGroup.doc.mjs (props, usage)
 * - ./index.ts (exports)
 * - /apps/storybook/stories/SelectableCardGroup.stories.tsx (stories)
 */

import {
  createContext,
  useContext,
  useId,
  useMemo,
  type ReactNode,
  type Ref,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '@astryxdesign/core';
import {Field, type FieldContainerStyleProps} from '@astryxdesign/core/Field';
import {
  SelectableCard,
  type SelectableCardProps,
} from '@astryxdesign/core/SelectableCard';
import {
  SelectableCardInputContext,
  joinAriaIDs,
  useFieldInputStyling,
  type SelectableCardInput,
} from '@astryxdesign/core/internal/selectable-card';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';
import {mergeProps, themeProps} from '@astryxdesign/core/utils';

const styles = stylex.create({
  group: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacingVars['--spacing-3'],
  },
  vertical: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
  },
});

// =============================================================================
// Props
// =============================================================================

/** One chosen value, or none yet. */
interface SingleSelection {
  /**
   * `single` (the default): a radio group, one value. `multiple`: a group of
   * checkboxes, any number of values.
   */
  selectionMode?: 'single';
  /** The chosen card's value, or `null` while none is chosen. */
  value: string | null;
  /** Called with the value of the card the user chose. */
  onChange: (value: string) => void;
}

/** Any number of chosen values. */
interface MultipleSelection {
  selectionMode: 'multiple';
  /** The chosen cards' values. */
  value: ReadonlyArray<string>;
  /** Called with the new list of chosen values. The newest choice is last. */
  onChange: (value: string[]) => void;
}

// It composes Field: root styling goes to the Field box through `container*`
// (the input-fields family), not onto the group.
export type SelectableCardGroupProps = Omit<
  BaseProps,
  'onChange' | 'xstyle' | 'className' | 'style'
> &
  FieldContainerStyleProps &
  (SingleSelection | MultipleSelection) & {
    /** Ref forwarded to the group element (role radiogroup or group). */
    ref?: Ref<HTMLDivElement>;
    /** The group's visible label and accessible name. */
    label: string;
    /** Hides the label visually; it still names the group. */
    isLabelHidden?: boolean;
    /** Helper text under the label, linked to the group. */
    description?: string;
    /**
     * The name the group's value is submitted under. The radios group by a
     * generated name. Defaults to a generated one.
     */
    htmlName?: string;
    /** Disables every card; they stay focusable and announce disabled. */
    isDisabled?: boolean;
    /**
     * `horizontal` (the default) wraps cards in rows; `vertical` stacks them.
     */
    orientation?: 'horizontal' | 'vertical';
    /** The SelectableCardGroupItem cards. */
    children: ReactNode;
  };

export interface SelectableCardGroupItemProps extends Omit<
  SelectableCardProps,
  'isSelected' | 'onChange'
> {
  /** The value this card stands for in the group's `value`. */
  value: string;
}

// =============================================================================
// Context
// =============================================================================

interface GroupContextValue {
  inputType: 'checkbox' | 'radio';
  groupName: string;
  submitName: string;
  isDisabled: boolean;
  isSelected: (value: string) => boolean;
  change: (value: string, isSelected: boolean) => void;
}

const SelectableCardGroupContext = createContext<GroupContextValue | null>(
  null,
);

// =============================================================================
// Components
// =============================================================================

/**
 * A set of selectable cards with the semantics of its selection: one choice
 * is a radio group (one tab stop, arrow keys, "2 of 3" spoken), several are a
 * group of checkboxes.
 *
 * @example
 * ```
 * <SelectableCardGroup label="Plan" value={plan} onChange={setPlan}>
 *   <SelectableCardGroupItem value="basic" label="Basic">Basic</SelectableCardGroupItem>
 *   <SelectableCardGroupItem value="pro" label="Pro">Pro</SelectableCardGroupItem>
 * </SelectableCardGroup>
 * ```
 */
export function SelectableCardGroup(props: SelectableCardGroupProps) {
  const {
    ref,
    label,
    isLabelHidden,
    description,
    htmlName,
    isDisabled = false,
    orientation = 'horizontal',
    children,
    containerXstyle,
    containerClassName,
    containerStyle,
    selectionMode: _selectionMode,
    value: _value,
    onChange: _onChange,
    ...rest
  } = props;
  const labelID = useId();
  const inputID = useId();
  const descriptionID = useId();
  const generatedName = useId();
  const submitName = htmlName ?? generatedName;
  const {rest: groupProps, container} = useFieldInputStyling(
    'SelectableCardGroup',
    rest,
    {containerXstyle, containerClassName, containerStyle},
  );
  const {
    'aria-labelledby': callerLabelledBy,
    'aria-describedby': callerDescribedBy,
    ...otherGroupProps
  } = groupProps as typeof groupProps & {
    'aria-labelledby'?: string;
    'aria-describedby'?: string;
  };
  const labelledBy = joinAriaIDs(labelID, callerLabelledBy);
  const describedBy = joinAriaIDs(
    description ? descriptionID : undefined,
    callerDescribedBy,
  );
  const isMultiple = props.selectionMode === 'multiple';

  const context = useMemo<GroupContextValue>(() => {
    if (props.selectionMode === 'multiple') {
      const {value, onChange} = props;
      return {
        inputType: 'checkbox',
        groupName: submitName,
        submitName,
        isDisabled,
        isSelected: v => value.includes(v),
        change: (v, isSelected) =>
          onChange(
            isSelected
              ? [...value.filter(x => x !== v), v]
              : value.filter(x => x !== v),
          ),
      };
    }
    const {value, onChange} = props;
    // The radios leave the form, so a page-unique name keeps each group
    // apart, even from another form's group with the same `htmlName`.
    return {
      inputType: 'radio',
      groupName: generatedName,
      submitName,
      isDisabled,
      isSelected: v => value === v,
      change: (v, isSelected) => {
        if (isSelected) {
          onChange(v);
        }
      },
    };
  }, [
    props.selectionMode,
    props.value,
    props.onChange,
    generatedName,
    submitName,
    isDisabled,
  ]);

  return (
    <Field
      label={label}
      isLabelHidden={isLabelHidden}
      description={description}
      inputID={inputID}
      labelID={labelID}
      isGroupLabel
      descriptionID={description ? descriptionID : undefined}
      isDisabled={isDisabled}
      {...container}>
      <div
        {...otherGroupProps}
        ref={ref}
        role={isMultiple ? 'group' : 'radiogroup'}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-disabled={isDisabled || undefined}
        {...mergeProps(
          themeProps('selectable-card-group', {
            orientation,
            selectionMode: isMultiple ? 'multiple' : 'single',
          }),
          stylex.props(
            styles.group,
            orientation === 'vertical' && styles.vertical,
          ),
        )}>
        <SelectableCardGroupContext.Provider value={context}>
          {children}
        </SelectableCardGroupContext.Provider>
      </div>
    </Field>
  );
}

SelectableCardGroup.displayName = 'SelectableCardGroup';

/**
 * One card of a SelectableCardGroup: a SelectableCard whose input, name and
 * selection come from the group.
 */
export function SelectableCardGroupItem({
  value,
  isDisabled,
  ...props
}: SelectableCardGroupItemProps) {
  const group = useContext(SelectableCardGroupContext);
  const input = useMemo<SelectableCardInput | null>(
    () =>
      group == null
        ? null
        : {
            type: group.inputType,
            name: group.groupName,
            value,
          },
    [group, value],
  );
  if (group == null) {
    throw new Error(
      'SelectableCardGroupItem must be rendered inside a SelectableCardGroup.',
    );
  }
  const isSelected = group.isSelected(value);
  const isCardDisabled = group.isDisabled || isDisabled === true;
  return (
    <SelectableCardInputContext value={input}>
      <SelectableCard
        {...props}
        isSelected={isSelected}
        isDisabled={isCardDisabled}
        onChange={nextSelected => group.change(value, nextSelected)}
      />
      {/* The radio cards stay out of the form, so the chosen, enabled card
          submits the group's value here. */}
      {group.inputType === 'radio' && isSelected && !isCardDisabled ? (
        <input type="hidden" name={group.submitName} value={value} />
      ) : null}
    </SelectableCardInputContext>
  );
}

SelectableCardGroupItem.displayName = 'SelectableCardGroupItem';
