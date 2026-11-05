// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTableRowStatus.tsx
 * @input React, StyleX, Icon, i18n, dev warnings, VisuallyHidden, Table types
 * @output Exports useTableRowStatus hook + config type
 * @position Row-status plugin; consumed by Table via plugins prop
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Table/index.ts (exports)
 * - /packages/core/src/Table/useTableRowStatus.doc.mjs
 * - /packages/core/src/Table/plugins/rowStatus/useTableRowStatus.test.tsx
 * - /apps/storybook/stories/TableRowStatus.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/Table/TableRowStatusTable.tsx
 */

import {useMemo} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Icon, type IconColor, type IconName} from '../../../Icon';
import {Tooltip} from '../../../Tooltip';
import {warnOnce} from '../../../utils/devWarning';
import {VisuallyHidden} from '../../../VisuallyHidden';
import type {TableRowStatus, TableSemanticRowStatus} from '../../index';
import type {TableColumn, TablePlugin} from '../../types';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../../../i18n/useComponentTranslator';
import english from '../../../i18n/generated-english/Table/plugins/rowStatus/useTableRowStatus.generated';

registerEnglishFallback(english);

/**
 * Named colors supported by the custom row-status marker. These resolve to the
 * design system's icon color tokens; raw CSS colors remain an escape hatch.
 */
export type TableRowStatusColor =
  | 'accent'
  | 'success'
  | 'error'
  | 'warning'
  | 'red'
  | 'orange'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'gray';

type TableRowSemanticStatus = TableSemanticRowStatus['status'];

const NAMED_COLORS: Record<TableRowStatusColor, string> = {
  accent: 'var(--color-icon-accent)',
  success: 'var(--color-icon-green)',
  error: 'var(--color-icon-red)',
  warning: 'var(--color-icon-orange)',
  red: 'var(--color-icon-red)',
  orange: 'var(--color-icon-orange)',
  green: 'var(--color-icon-green)',
  yellow: 'var(--color-icon-yellow)',
  blue: 'var(--color-icon-blue)',
  gray: 'var(--color-icon-gray)',
};

/** Preserve the released Icon color mapping for named custom-marker colors. */
const ICON_COLOR_BY_NAMED_COLOR: Record<TableRowStatusColor, IconColor> = {
  accent: 'accent',
  success: 'success',
  error: 'error',
  warning: 'warning',
  red: 'red',
  orange: 'warning',
  green: 'green',
  yellow: 'warning',
  blue: 'blue',
  gray: 'gray',
};

/** Configuration for {@link useTableRowStatus}. */
export interface UseTableRowStatusConfig<T extends Record<string, unknown>> {
  /**
   * Derive the status indicator for a row. Return `null` for no indicator.
   * Memoize with `useCallback` for a stable plugin identity across renders.
   *
   * @example
   * ```
   * getStatus: row =>
   *   row.hasError ? {status: 'error', label: 'Error'} : null
   * ```
   */
  getStatus: (
    item: T,
  ) => (TableRowStatus & {status?: never}) | TableSemanticRowStatus | null;
}

type TableRowStatusResult = Exclude<
  ReturnType<UseTableRowStatusConfig<Record<string, unknown>>['getStatus']>,
  null
>;

// The status column holds a small centered dot or icon. A fixed narrow width
// keeps every row's indicator aligned in one gutter.
const STATUS_COLUMN_WIDTH = {type: 'pixel' as const, value: 28};

/** Resolve a named color to a token, or pass a raw CSS color through. */
function resolveColor(color: string): string {
  return (NAMED_COLORS as Record<string, string>)[color] ?? color;
}

function isTableRowSemanticStatus(
  value: unknown,
): value is TableRowSemanticStatus {
  return value === 'success' || value === 'warning' || value === 'error';
}

type ResolvedTableRowStatus =
  | {variant: 'dot'; color: string}
  | {variant: 'icon'; icon: IconName; iconColor: IconColor}
  | {variant: 'icon'; icon: IconName; customColor: string};

function resolveTableRowStatus(
  value: TableRowStatusResult,
): ResolvedTableRowStatus | null {
  const untypedValue = value as {
    status?: unknown;
    color?: unknown;
    icon?: unknown;
  };

  if (isTableRowSemanticStatus(untypedValue.status)) {
    if (
      process.env.NODE_ENV !== 'production' &&
      (Object.prototype.hasOwnProperty.call(untypedValue, 'color') ||
        Object.prototype.hasOwnProperty.call(untypedValue, 'icon'))
    ) {
      warnOnce(
        'useTableRowStatus:semantic-custom-conflict',
        'useTableRowStatus',
        'status cannot be combined with color or icon. The semantic status takes precedence and the custom marker fields are ignored.',
      );
    }

    return {
      variant: 'icon',
      icon: untypedValue.status,
      iconColor: untypedValue.status,
    };
  }

  if (typeof untypedValue.color !== 'string') {
    return null;
  }

  if (typeof untypedValue.icon === 'string') {
    const namedIconColor = (
      ICON_COLOR_BY_NAMED_COLOR as Record<string, IconColor | undefined>
    )[untypedValue.color];
    return namedIconColor == null
      ? {
          variant: 'icon',
          icon: untypedValue.icon as IconName,
          customColor: untypedValue.color,
        }
      : {
          variant: 'icon',
          icon: untypedValue.icon as IconName,
          iconColor: namedIconColor,
        };
  }

  return {variant: 'dot', color: resolveColor(untypedValue.color)};
}

const styles = stylex.create({
  wrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customIcon: (color: string) => ({color}),
  dot: (color: string) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: color,
    flexShrink: 0,
  }),
});

/**
 * Returns a {@link TablePlugin} that prepends a narrow column signaling per-row
 * status. A semantic `status` resolves a themed glyph and tone; a custom
 * `color` renders the stable dot unless the caller also provides an `icon`.
 *
 * @example
 * ```
 * const rowStatus = useTableRowStatus<Row>({
 *   getStatus: row =>
 *     row.state === 'error'
 *       ? {status: 'error', label: 'Error'}
 *       : {color: 'blue', icon: 'info', label: 'Informational'},
 * });
 * <Table data={data} columns={columns} idKey="id" plugins={{rowStatus}} />;
 * ```
 */
export function useTableRowStatus<T extends Record<string, unknown>>(
  config: UseTableRowStatusConfig<T>,
): TablePlugin<T> {
  const t = useComponentTranslator();
  const {getStatus} = config;

  return useMemo((): TablePlugin<T> => {
    const statusColumn: TableColumn<T> = {
      key: '__rowStatus',
      // The gutter stays visually blank, but the th needs a discernible
      // name for assistive technology (axe: empty-table-header).
      header: (
        <VisuallyHidden>
          {t('@astryx.table.rowStatus.columnHeader')}
        </VisuallyHidden>
      ),
      width: STATUS_COLUMN_WIDTH,
      resizable: false,
      renderCell: (item: T) => {
        const status = getStatus(item);
        if (!status) {
          return null;
        }

        const resolvedStatus = resolveTableRowStatus(status);
        if (!resolvedStatus) {
          return null;
        }

        const signifier =
          resolvedStatus.variant === 'dot' ? (
            <span {...stylex.props(styles.dot(resolvedStatus.color))} />
          ) : (
            <Icon
              icon={resolvedStatus.icon}
              size="xsm"
              color={
                'iconColor' in resolvedStatus
                  ? resolvedStatus.iconColor
                  : 'inherit'
              }
            />
          );

        return (
          <Tooltip content={status.label}>
            <span
              {...stylex.props(
                styles.wrap,
                resolvedStatus.variant === 'icon' &&
                  'customColor' in resolvedStatus &&
                  styles.customIcon(resolvedStatus.customColor),
              )}
              role="img"
              aria-label={status.label}>
              {signifier}
            </span>
          </Tooltip>
        );
      },
    };

    return {
      transformColumns(columns) {
        return [statusColumn, ...columns];
      },
    };
  }, [getStatus, t]);
}
