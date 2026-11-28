// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TableSelectionToolbar.tsx
 * @input Uses Toolbar, Button, and selection state from useTableSelectionState
 * @output Exports TableSelectionToolbar and its props
 * @position Product-composed selection UI; never injected by the Table plugin
 */

import {useRef, type ReactNode} from 'react';
import {Button} from '../Button';
import {Toolbar} from '../Toolbar';
import type {ToolbarProps} from '../Toolbar';
import type {TableSelectionState} from './plugins/selection/useTableSelectionState';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/Table/TableSelectionToolbar.generated';
import {devPropError} from '../utils/devWarning';
import {useAnnounce} from '../hooks/useAnnounce';
import {useAnnounceRenderedText} from '../hooks/useAnnounceRenderedText';

// Bundlers replace this value at build time. The declaration lets a product
// without Node's types type-check this file.
declare const process: {readonly env: {readonly NODE_ENV?: string}};

registerEnglishFallback(english);

export interface TableSelectionToolbarProps extends Omit<
  ToolbarProps,
  'endContent' | 'label'
> {
  /** Shared state returned by useTableSelectionState. */
  selection: TableSelectionState;
  /** Accessible name for the toolbar. @default 'Bulk actions' */
  label?: string;
  /** Override the visible selected-count content. */
  renderSelectionLabel?: (selectedCount: number) => ReactNode;
  /** Visible label for the command that clears the complete selection. @default 'Unselect All' */
  clearLabel?: string;
}

/**
 * Selection-aware action surface that remains outside the Table plugin.
 *
 * The caller owns action content and placement. This component owns only the
 * shared Toolbar presentation, selected count, and complete clear command.
 */
export function TableSelectionToolbar({
  selection,
  label: labelFromProps,
  renderSelectionLabel,
  clearLabel: clearLabelFromProps,
  size = 'sm',
  variant = 'muted',
  ...toolbarProps
}: TableSelectionToolbarProps): ReactNode {
  if (process.env.NODE_ENV !== 'production' && selection == null) {
    throw devPropError(
      'TableSelectionToolbar',
      'selection',
      'is required: the state from useTableSelectionState(), for example selection={selection}.',
    );
  }
  const t = useComponentTranslator();
  const label = labelFromProps ?? t('@astryx.table.selection.bulkActionsLabel');
  const clearLabel =
    clearLabelFromProps ?? t('@astryx.table.selection.clearAll');
  // The count is one current state: a burst of selection changes speaks only
  // the latest count.
  const announceCount = useAnnounce({hasReplace: true});
  const countRef = useRef<HTMLSpanElement>(null);
  useAnnounceRenderedText(countRef, selection.hasSelection, '', {
    skipFirstRender: true,
    announce: announceCount,
  });

  if (!selection.hasSelection) {
    return null;
  }

  const selectionLabel =
    renderSelectionLabel == null
      ? t('@astryx.table.selection.selectedCount', {
          count: selection.selectedCount,
        })
      : renderSelectionLabel(selection.selectedCount);

  return (
    <Toolbar
      {...toolbarProps}
      label={label}
      size={size}
      variant={variant}
      endContent={
        <>
          <span ref={countRef}>{selectionLabel}</span>
          <Button
            label={clearLabel}
            variant="ghost"
            onClick={selection.clearSelection}
          />
        </>
      }
    />
  );
}

TableSelectionToolbar.displayName = 'TableSelectionToolbar';
