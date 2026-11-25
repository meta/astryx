// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SelectableCardGroup.tsx
 * @input Uses SelectableCardGroupContext (read by each SelectableCard with a
 *   `value`), Field (the group label and description), useFieldInputStyling,
 *   useId, StyleX and the spacing tokens
 * @output Exports SelectableCardGroup and its props
 * @position A set of selectable cards with the semantics of its selection
 *
 * SYNC: When modified, update these files to stay in sync:
 * - ./SelectableCardGroup.doc.mjs (props, usage)
 * - ./index.ts (exports)
 * - /apps/storybook/stories/SelectableCardGroup.stories.tsx (stories)
 * - /packages/cli/assets/templates/blocks/components/SelectableCardGroup/ (blocks)
 */

import {useId, useMemo, type ReactNode, type Ref} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '../BaseProps';
import {Field} from '../Field/Field';
import {
  useFieldInputStyling,
  type FieldPartStyleProps,
} from '../Field/fieldParts';
import {
  SelectableCardGroupContext,
  type SelectableCardGroupMembership,
} from '../SelectableCard/selectableCardGroupContext';
import {spacingVars} from '../theme/tokens.stylex';
import {joinAriaIDs} from '../utils/inputAria';
import {mergeProps} from '../utils/mergeProps';
import {themeProps} from '../utils/themeProps';

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
  type?: 'single';
  /** The chosen card's value, or `null` while none is chosen. */
  value: string | null;
  /** Called with the value of the card the user chose. */
  onChange: (value: string) => void;
}

/** Any number of chosen values. */
interface MultipleSelection {
  type: 'multiple';
  /** The chosen cards' values. */
  value: ReadonlyArray<string>;
  /** Called with the new list of chosen values. The newest choice is last. */
  onChange: (value: string[]) => void;
}

// It composes Field, so it takes no root styling: `container*` styles the
// Field box and `control*` the group element (the input-fields family).
export type SelectableCardGroupProps = Omit<
  BaseProps,
  'onChange' | 'xstyle' | 'className' | 'style'
> &
  FieldPartStyleProps &
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
    /**
     * The cards: SelectableCards, each with a `value` in place of
     * `isSelected` and `onChange`.
     */
    children: ReactNode;
  };

// =============================================================================
// Component
// =============================================================================

/**
 * A set of selectable cards with the semantics of its selection: one choice
 * is a radio group (one tab stop, arrow keys, "2 of 3" spoken), several are a
 * group of checkboxes.
 *
 * @example
 * ```
 * <SelectableCardGroup label="Plan" value={plan} onChange={setPlan}>
 *   <SelectableCard value="basic" label="Basic">Basic</SelectableCard>
 *   <SelectableCard value="pro" label="Pro">Pro</SelectableCard>
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
    controlXstyle,
    controlClassName,
    controlStyle,
    type: _type,
    value: _value,
    onChange: _onChange,
    ...rest
  } = props;
  const {type, value, onChange} = props;
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
  } = groupProps;
  const labelledBy = joinAriaIDs(labelID, callerLabelledBy);
  const describedBy = joinAriaIDs(
    description ? descriptionID : undefined,
    callerDescribedBy,
  );
  const isMultiple = type === 'multiple';

  const membership = useMemo<SelectableCardGroupMembership>(() => {
    if (type === 'multiple') {
      return {
        inputType: 'checkbox',
        inputName: submitName,
        submitName,
        isDisabled,
        isSelected: v => value.includes(v),
        onMemberChange: (v, isSelected) =>
          onChange(
            isSelected
              ? [...value.filter(x => x !== v), v]
              : value.filter(x => x !== v),
          ),
      };
    }
    // The radios leave the form, so a page-unique name keeps each group
    // apart, even from another form's group with the same `htmlName`.
    return {
      inputType: 'radio',
      inputName: generatedName,
      submitName,
      isDisabled,
      isSelected: v => value === v,
      onMemberChange: (v, isSelected) => {
        if (isSelected) {
          onChange(v);
        }
      },
    };
  }, [type, value, onChange, generatedName, submitName, isDisabled]);

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
            type: isMultiple ? 'multiple' : 'single',
          }),
          stylex.props(
            styles.group,
            orientation === 'vertical' && styles.vertical,
            controlXstyle,
          ),
          controlClassName,
          controlStyle,
        )}>
        <SelectableCardGroupContext value={membership}>
          {children}
        </SelectableCardGroupContext>
      </div>
    </Field>
  );
}

SelectableCardGroup.displayName = 'SelectableCardGroup';
