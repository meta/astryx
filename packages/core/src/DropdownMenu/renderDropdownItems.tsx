// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file renderDropdownItems.tsx
 * @output Converts data-driven menu items into DropdownMenuItem components
 * @position Utility; used by DropdownMenu to unify data-driven and compound paths
 */

import type {ReactElement, ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {DropdownMenuItem} from './DropdownMenuItem';
import {DropdownMenuDivider} from './DropdownMenuDivider';
import {DropdownMenuSubMenu} from './DropdownMenuSubMenu';
import {
  spacingVars,
  typographyVars,
  typeScaleVars,
  colorVars,
} from '../theme/tokens.stylex';
import {mergeProps, themeProps} from '../utils';
import type {
  DropdownMenuItemData,
  DropdownMenuOption,
  DropdownMenuSection,
} from './DropdownMenu';

const styles = stylex.create({
  sectionHeading: {
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-2'],
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: colorVars['--color-text-secondary'],
    userSelect: 'none',
  },
});

function getItemKey(item: DropdownMenuItemData, index: number): string {
  return `item-${item.id ?? index}`;
}

function getSectionKey(section: DropdownMenuSection, index: number): string {
  return `section-${section.id ?? index}`;
}

/**
 * Renders one leaf row as a `DropdownMenuItem`.
 *
 * Keyed by `item.id` when the caller supplies one, else by position. NOT by
 * label: an item that reports its own result (a copy row swapping to "Copied")
 * would change key mid-interaction, remounting the row and dropping keyboard
 * focus. Position is the safe default because a menu's rows are usually fixed;
 * a menu whose items reorder or filter needs `id` for the same reason.
 *
 * `items` selects the submenu shape rather than being an item prop, and `id` is
 * identity for React rather than something `DropdownMenuItem` renders, so both
 * are stripped. Every remaining field of `DropdownMenuItemData` is a
 * `DropdownMenuItem` prop by construction (the type is `Pick`ed from
 * `DropdownMenuItemProps`), so the data path forwards them wholesale and can't
 * silently drop a field the data API advertises.
 */
function renderLeafItem(
  item: DropdownMenuItemData,
  index: number,
): ReactElement {
  const {items: _submenuItems, id: _id, ...itemProps} = item;
  return <DropdownMenuItem key={getItemKey(item, index)} {...itemProps} />;
}

/**
 * A data item that declares nested `items` becomes a submenu (data-mode
 * parity with the compound DropdownMenuSubMenu API), at the top level and
 * inside a section alike; otherwise it's a leaf. renderDropdownItems owns the
 * recursion and hands the rendered children to DropdownMenuSubMenu, so
 * DropdownMenuSubMenu never imports this module back (no import cycle).
 */
function renderItem(item: DropdownMenuItemData, index: number): ReactElement {
  if (item.items && item.items.length > 0) {
    return (
      <DropdownMenuSubMenu
        key={getItemKey(item, index)}
        icon={item.icon}
        label={item.label}
        isDisabled={item.isDisabled}>
        {renderDropdownItems(item.items)}
      </DropdownMenuSubMenu>
    );
  }
  return renderLeafItem(item, index);
}

/**
 * Converts data-driven items into DropdownMenuItem components,
 * so both modes share the same rendering and keyboard navigation path.
 */
export function renderDropdownItems(items: DropdownMenuOption[]): ReactNode {
  const elements: ReactNode[] = [];

  for (let i = 0; i < items.length; i++) {
    const option = items[i];

    if ('type' in option && option.type === 'divider') {
      elements.push(<DropdownMenuDivider key={`divider-${i}`} />);
    } else if ('type' in option && option.type === 'section') {
      elements.push(
        <div
          key={getSectionKey(option, i)}
          role="group"
          aria-label={option.title}>
          {option.title && (
            <div
              aria-hidden="true"
              {...mergeProps(
                themeProps('dropdown-menu-section-heading'),
                stylex.props(styles.sectionHeading),
              )}>
              {option.title}
            </div>
          )}
          {option.items.map(renderItem)}
        </div>,
      );
    } else if (!('type' in option)) {
      elements.push(renderItem(option, i));
    }
  }

  return elements;
}
