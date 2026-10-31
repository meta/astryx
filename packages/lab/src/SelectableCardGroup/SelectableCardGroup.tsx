// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SelectableCardGroup.tsx
 * @input Uses core SelectableCard (its checkbox or radio input), Field (the
 *   group label and description), useId, StyleX and the spacing tokens
 * @output Exports SelectableCardGroup, SelectableCardGroupItem and their props
 * @position Lab: a set of selectable cards with the semantics of its selection
 *
 * A single-choice set is a radio group: role="radiogroup", named by its label,
 * holding cards whose inputs are native radios sharing one name. The browser
 * then makes the set one tab stop, moves and selects with the arrow keys, and
 * speaks the position ("2 of 3"). A multiple-choice set is a named group of
 * checkboxes, each its own tab stop. The cards keep SelectableCard's look,
 * press and selection mark.
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
  /** Called with the new list of chosen values, in card order of choice. */
  onChange: (value: string[]) => void;
}

// It composes Field: root styling goes to the Field box through `container*`
// (input-fields FR10), not onto the group.
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
     * The native inputs' shared `name`, which groups the radios, as
     * `htmlName` on RadioList. Defaults to a generated one.
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
  'isSelected' | 'onChange' | 'inputType' | 'htmlName'
> {
  /** The value this card stands for in the group's `value`. */
  value: string;
}

// =============================================================================
// Context
// =============================================================================

interface GroupContextValue {
  inputType: 'checkbox' | 'radio';
  name: string;
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
  const name = htmlName ?? generatedName;
  // An untyped caller's root styling never reaches the group element.
  const {
    xstyle: _xstyle,
    className: _className,
    style: _style,
    ...groupProps
  } = rest as typeof rest & {
    xstyle?: unknown;
    className?: unknown;
    style?: unknown;
  };
  const isMultiple = props.selectionMode === 'multiple';

  const context = useMemo<GroupContextValue>(() => {
    if (props.selectionMode === 'multiple') {
      const {value, onChange} = props;
      return {
        inputType: 'checkbox',
        name,
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
    return {
      inputType: 'radio',
      name,
      isDisabled,
      isSelected: v => value === v,
      change: (v, isSelected) => {
        if (isSelected) {
          onChange(v);
        }
      },
    };
  }, [props.selectionMode, props.value, props.onChange, name, isDisabled]);

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
      xstyle={containerXstyle}
      className={containerClassName}
      style={containerStyle}>
      <div
        {...groupProps}
        ref={ref}
        role={isMultiple ? 'group' : 'radiogroup'}
        aria-labelledby={labelID}
        aria-describedby={description ? descriptionID : undefined}
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
  if (group == null) {
    throw new Error(
      'SelectableCardGroupItem must be rendered inside a SelectableCardGroup.',
    );
  }
  return (
    <SelectableCard
      {...props}
      inputType={group.inputType}
      htmlName={group.name}
      isSelected={group.isSelected(value)}
      isDisabled={group.isDisabled || isDisabled}
      onChange={isSelected => group.change(value, isSelected)}
    />
  );
}

SelectableCardGroupItem.displayName = 'SelectableCardGroupItem';
