// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ToggleButtonGroup.tsx
 * @input Layer-scoped React context, ToggleButton children
 * @output Exports ToggleButtonGroup component and types
 * @position Groups toggle buttons for single or multi-select behavior
 *
 * Uses a discriminated union on `type` to enforce type-safe value/onChange:
 * - type='single' → value: string | null, onChange: (v: string | null) => void
 * - type='multiple' → value: string[], onChange: (v: string[]) => void
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/ToggleButton/index.ts
 * - /apps/storybook/stories/ToggleButton.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/ToggleButton/ (showcase blocks)
 */

import {useCallback, use, useMemo, type ReactNode} from 'react';
import {createLayerScopedContext as createContext} from '../Layer/layerScopedContext';
import * as stylex from '@stylexjs/stylex';
import {spacingVars} from '../theme/tokens.stylex';
import type {ButtonSize} from '../Button';
import type {BaseProps} from '../BaseProps';
import {mergeProps} from '../utils';
import type {StyleXStyles} from '@stylexjs/stylex';
import {themeProps} from '../utils/themeProps';

// =============================================================================
// Context
// =============================================================================

interface ToggleButtonGroupContextValue {
  /** Currently selected value(s). */
  selectedValues: Set<string>;
  /** Toggle a value on/off. */
  toggle: (value: string) => void;
  /** Group size default — individual buttons can override. */
  size?: ButtonSize;
  /** Group disabled state. */
  isDisabled?: boolean;
}

const ToggleButtonGroupContext =
  createContext<ToggleButtonGroupContextValue | null>(null);
ToggleButtonGroupContext.displayName = 'ToggleButtonGroupContext';

/**
 * Hook for ToggleButton to read group context.
 * Returns null when used outside a group.
 */
export function useToggleButtonGroup(): ToggleButtonGroupContextValue | null {
  return use(ToggleButtonGroupContext);
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  group: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
  },
  vertical: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
});

// =============================================================================
// Props — Discriminated Union
// =============================================================================

/**
 * Host props reach the group element (`architecture:public-component-api`
 * INV5): `className`, `style`, `id`, `aria-*`, `data-*` and handlers. The group
 * keeps its own `role`, `aria-label` and theme target.
 */
interface ToggleButtonGroupBaseProps extends Omit<
  BaseProps<HTMLDivElement>,
  'onChange' | 'defaultValue' | 'role' | 'aria-label'
> {
  /** Toggle button children. */
  children: ReactNode;

  /**
   * Accessible label for the group (used as aria-label).
   */
  label: string;

  /**
   * Orientation of the button group.
   * @default 'horizontal'
   */
  orientation?: 'horizontal' | 'vertical';

  /**
   * Default size for buttons in the group.
   * Individual buttons can override this with their own `size` prop.
   * @default 'md'
   */
  size?: ButtonSize;

  /**
   * Whether all buttons in the group are disabled.
   * @default false
   */
  isDisabled?: boolean;

  /**
   * StyleX styles for layout customization (margins, positioning, sizing).
   * Must be a `stylex.create()` value — not an inline style object.
   *
   * @example
   * ```
   * const styles = stylex.create({ wrapper: { marginTop: 8 } });
   * <ToggleButtonGroup xstyle={styles.wrapper} />
   * ```
   */
  xstyle?: StyleXStyles;

  /** Test ID for testing frameworks. */
  'data-testid'?: string;
}

/**
 * Single-select group props.
 * Only one button can be active at a time. Clicking the active
 * button deselects it (value becomes null).
 */
export interface ToggleButtonGroupSingleProps extends ToggleButtonGroupBaseProps {
  /**
   * Single selection mode (default).
   * @default 'single'
   */
  type?: 'single';

  /** Currently selected value, or null if none selected. */
  value: string | null;

  /** Called when selection changes. */
  onChange: (value: string | null) => void;
}

/**
 * Multi-select group props.
 * Multiple buttons can be active simultaneously.
 */
export interface ToggleButtonGroupMultipleProps extends ToggleButtonGroupBaseProps {
  /** Multiple selection mode. */
  type: 'multiple';

  /** Currently selected values. */
  value: string[];

  /** Called when selection changes. */
  onChange: (value: string[]) => void;
}

/** Discriminated union of single and multiple group props. */
export type ToggleButtonGroupProps =
  ToggleButtonGroupSingleProps | ToggleButtonGroupMultipleProps;

// =============================================================================
// Component
// =============================================================================

/**
 * Groups toggle buttons for exclusive (single) or multi-select behavior.
 *
 * Uses a discriminated union on `type` for type-safe value/onChange:
 * - `'single'` (default): `value: string | null`, click active deselects
 * - `'multiple'`: `value: string[]`, toggles individual items
 *
 * @example
 * ```
 * const [view, setView] = useState<string | null>('grid');
 * <ToggleButtonGroup value={view} onChange={setView} label="View mode">
 *   <ToggleButton value="list" label="List" icon={<ListIcon />} />
 *   <ToggleButton value="grid" label="Grid" icon={<GridIcon />} />
 * </ToggleButtonGroup>
 * ```
 */
export function ToggleButtonGroup(props: ToggleButtonGroupProps): ReactNode {
  const {
    children,
    label,
    orientation = 'horizontal',
    size,
    isDisabled = false,
    xstyle,
    className,
    style,
    'data-testid': testId,
    // Read through `props` below, where the union narrows them by `type`.
    type: _type,
    value: _value,
    onChange: _onChange,
    ...hostProps
  } = props;

  const isMultiple = props.type === 'multiple';

  const selectedValues = useMemo(() => {
    if (isMultiple) {
      return new Set(props.value);
    }
    const singleValue = props.value;
    return singleValue != null ? new Set([singleValue]) : new Set<string>();
  }, [isMultiple, props.value]);

  const toggle = useCallback(
    (itemValue: string) => {
      if (isMultiple) {
        const current = props.value;
        const onChange = props.onChange;
        if (current.includes(itemValue)) {
          onChange(current.filter(v => v !== itemValue));
        } else {
          onChange([...current, itemValue]);
        }
      } else {
        const current = props.value;
        const onChange = props.onChange;
        // Allow deselection: clicking active → null
        onChange(current === itemValue ? null : itemValue);
      }
    },
    [isMultiple, props.value, props.onChange],
  );

  const contextValue = useMemo(
    () => ({selectedValues, toggle, size, isDisabled}),
    [selectedValues, toggle, size, isDisabled],
  );

  return (
    <ToggleButtonGroupContext value={contextValue}>
      <div
        {...hostProps}
        role="group"
        aria-label={label}
        data-testid={testId}
        {...mergeProps(
          themeProps('toggle-button-group'),
          stylex.props(
            styles.group,
            orientation === 'vertical' && styles.vertical,
            xstyle,
          ),
          className,
          style,
        )}>
        {children}
      </div>
    </ToggleButtonGroupContext>
  );
}

ToggleButtonGroup.displayName = 'ToggleButtonGroup';
