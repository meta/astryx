// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MenuBottomSheetActionList.tsx
 * @input Uses menu data entries and callbacks for selection and drill-in
 * @output Internal touch-friendly action list with row-aligned section headings
 * @position Shared implementation for menu bottom-sheet presentations
 */

import React, {useRef, type ReactElement} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Divider} from '../Divider';
import {Heading} from '../Heading';
import {Icon, renderIconSlot} from '../Icon';
import {List, ListItem} from '../List';
import {useMenuPress} from '../hooks/useMenuPress';
import {colorVars, spacingVars} from '../theme/tokens.stylex';
import {rtlStyles} from '../utils';
import {getInteractionModality} from '../utils/interactionModality';
import type {DropdownMenuItemData, DropdownMenuOption} from './DropdownMenu';
import {isModifiedClick} from './menuItemRoles';

/** The action rows: ListItem renders its action as a button (or a link). */
const SHEET_ROW_SELECTOR = 'button:not(:disabled), a[href]';

const styles = stylex.create({
  // The row under a held finger is the highlight; the browser's held-press
  // callout and text selection must not compete with it.
  list: {
    WebkitTouchCallout: 'none',
    userSelect: 'none',
  },
  destructiveAction: {
    '--_item-label-color': colorVars['--color-text-error'],
    '--_item-description-color': colorVars['--color-text-error'],
    color: colorVars['--color-text-error'],
  },
  structuralItem: {
    listStyleType: 'none',
  },
  divider: {
    marginBlock: spacingVars['--spacing-1'],
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-1'],
  },
  sectionHeading: {
    paddingInline: spacingVars['--spacing-3'],
  },
});

function getItemKey(item: DropdownMenuItemData, index: number): string {
  return `item-${item.id ?? index}`;
}

export function MenuBottomSheetActionList({
  items,
  onSelect,
  onOpenSubmenu,
}: {
  items: DropdownMenuOption[];
  onSelect: (item: DropdownMenuItemData, event: React.MouseEvent) => void;
  onOpenSubmenu: (item: DropdownMenuItemData) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  // The press model: the row under a finger's RELEASE acts, and the
  // highlight (focus) follows the finger across the rows. The sheet is modal,
  // so a release outside it is the scrim's, not a dismissal of ours.
  const menuPress = useMenuPress({
    menuRef: listRef,
    itemSelector: SHEET_ROW_SELECTOR,
  });

  const renderItem = (
    item: DropdownMenuItemData,
    index: number,
  ): ReactElement => {
    const isSubmenu = item.items != null && item.items.length > 0;
    const isDestructive = item.variant === 'destructive';
    const isLink = !isSubmenu && item.href != null;

    const handleActivate = (event: React.MouseEvent) => {
      if (isLink && item.isDisabled) {
        // A disabled link row goes nowhere.
        event.preventDefault();
        return;
      }
      if (getInteractionModality() === 'pointer') {
        (event.currentTarget as HTMLElement).blur();
      }
      if (isSubmenu) {
        onOpenSubmenu(item);
      } else if (isLink && isModifiedClick(event)) {
        // A modified click on a link row is the browser's (a new tab); the
        // row's handler stays out of it, the sheet still closes.
        onSelect({...item, onClick: undefined}, event);
      } else {
        onSelect(item, event);
      }
    };

    return (
      <ListItem
        key={getItemKey(item, index)}
        label={item.label}
        description={item.description}
        startContent={
          item.icon
            ? renderIconSlot(item.icon, {
                size: 'sm',
                color: isDestructive ? 'error' : 'secondary',
              })
            : undefined
        }
        endContent={
          isSubmenu ? (
            <Icon
              icon="chevronRight"
              size="sm"
              color="secondary"
              xstyle={rtlStyles.mirror}
            />
          ) : (
            item.endContent
          )
        }
        isDisabled={item.isDisabled}
        // A row with an address is a real link in the sheet too: the
        // ListItem renders its anchor, and the row's select handler rides the
        // capture phase — ListItem leaves a click on its inner anchor to the
        // anchor, so `onClick` alone would never run for a link row.
        href={isLink ? item.href : undefined}
        target={isLink ? item.target : undefined}
        rel={isLink ? item.rel : undefined}
        onClick={isLink ? undefined : handleActivate}
        onClickCapture={isLink ? handleActivate : undefined}
        xstyle={isDestructive && styles.destructiveAction}
      />
    );
  };

  return (
    <List
      ref={listRef}
      density="spacious"
      xstyle={styles.list}
      {...menuPress.menuProps}>
      {items.map((option, index) => {
        if ('type' in option && option.type === 'divider') {
          return (
            <li
              // eslint-disable-next-line @eslint-react/no-array-index-key
              key={`divider-${index}`}
              role="presentation"
              {...stylex.props(styles.structuralItem)}>
              <Divider xstyle={styles.divider} />
            </li>
          );
        }

        if ('type' in option && option.type === 'section') {
          return (
            <li
              key={`section-${option.id ?? index}`}
              {...stylex.props(styles.structuralItem)}>
              <div
                role="group"
                aria-label={option.title}
                {...stylex.props(styles.section)}>
                {option.title && (
                  <Heading level={4} xstyle={styles.sectionHeading}>
                    {option.title}
                  </Heading>
                )}
                <List density="spacious">{option.items.map(renderItem)}</List>
              </div>
            </li>
          );
        }

        return renderItem(option, index);
      })}
    </List>
  );
}

MenuBottomSheetActionList.displayName = 'MenuBottomSheetActionList';
