// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TypeaheadItem.tsx
 * @input Uses React, StyleX, SearchableItem
 * @output Exports TypeaheadItem component for rendering dropdown items
 * @position Presentational component; used as default renderItem in BaseTypeahead
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Typeahead/index.ts
 * - /packages/cli/assets/templates/blocks/components/Typeahead/ (showcase blocks)
 */

import React, {type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  fontWeightVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import type {SearchableItem} from './types';
import type {BaseProps} from '../BaseProps';
import {mergeProps} from '../utils';
import {themeProps} from '../utils/themeProps';

// =============================================================================
// Types
// =============================================================================

export interface TypeaheadItemProps<
  T extends SearchableItem = SearchableItem,
> extends BaseProps<HTMLDivElement> {
  ref?: React.Ref<HTMLDivElement>;
  /**
   * The search result item.
   */
  item: T;

  /**
   * Icon or avatar to display before the label.
   */
  icon?: ReactNode;

  /**
   * Description text displayed below the label.
   */
  description?: string;

  /**
   * Whether this item is disabled.
   * @default false
   */
  isDisabled?: boolean;

  /**
   * This prop has no effect. Set `item.auxiliaryData.group` on search-source
   * items to group results in Typeahead or BaseTypeahead.
   */
  group?: string;
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    minHeight: 0,
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: typeScaleVars['--text-label-size'],
    lineHeight: typeScaleVars['--text-label-leading'],
    fontWeight: fontWeightVars['--font-weight-normal'],
    color: colorVars['--color-text-primary'],
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  description: {
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: colorVars['--color-text-secondary'],
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  disabled: {
    opacity: 0.5,
  },
});

// =============================================================================
// Component
// =============================================================================

/**
 * Default item component for typeahead dropdown results.
 *
 * Renders a label with optional icon and description.
 * Exported for use in custom `renderItem` implementations.
 *
 * @example
 * ```
 * <Typeahead searchSource={source} value={v} onChange={setV} label="Search" />
 * <Typeahead
 *   searchSource={source}
 *   value={v}
 *   onChange={setV}
 *   label="Search"
 *   renderItem={(item) => (
 *     <TypeaheadItem
 *       item={item}
 *       icon={<Avatar src={item.auxiliaryData.avatar} size="sm" />}
 *       description={item.auxiliaryData.role}
 *     />
 *   )}
 * />
 * ```
 */
export function TypeaheadItem<T extends SearchableItem>({
  ref,
  item,
  icon,
  description,
  isDisabled = false,
  group: _group,
  xstyle,
  className,
  style,
  ...rest
}: TypeaheadItemProps<T>) {
  // If item has a pre-rendered element, use it
  if (item.element) {
    return <>{item.element}</>;
  }

  return (
    <div
      ref={ref}
      {...mergeProps(
        themeProps('typeahead-item'),
        stylex.props(styles.container, isDisabled && styles.disabled, xstyle),
        className,
        style,
      )}
      {...rest}>
      {icon}
      <div {...stylex.props(styles.content)}>
        <span {...stylex.props(styles.label)}>{item.label}</span>
        {description && (
          <span {...stylex.props(styles.description)}>{description}</span>
        )}
      </div>
    </div>
  );
}

TypeaheadItem.displayName = 'TypeaheadItem';
