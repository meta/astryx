// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TabBarMoreList.tsx
 * @input React, core's List, Icon and Badge, core i18n, and TabBar.tsx's
 *   tab reading (`overflowItems`)
 * @output Exports TabBarMoreList: the More tab's screen, a list of the tabs
 *   past the fourth (UIKit's `UIMoreListController`)
 * @position Lab component: the screen of TabBar's More tab (../TabBar)
 *
 * SYNC: When modified, update TabBarMoreList.doc.mjs,
 * ../TabBar/TabBar.test.tsx and
 * ../TabBar/__tests__/TabBar.interaction.browser.spec.ts.
 */

import type {ReactNode} from 'react';
import type {BaseProps} from '@astryxdesign/core';
import {Badge} from '@astryxdesign/core/Badge';
import {useTranslator} from '@astryxdesign/core/i18n';
import {Icon} from '@astryxdesign/core/Icon';
import {List, ListItem} from '@astryxdesign/core/List';
import {rtlStyles} from '@astryxdesign/core/utils';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';
import {
  badgedName,
  hasBadge,
  isDisabledItem,
  overflowItems,
} from '../TabBar/TabBar';

export interface TabBarMoreListProps extends Omit<
  BaseProps<HTMLElement>,
  'onChange'
> {
  /** The same `TabBarItem` elements given to TabBar. */
  children: ReactNode;
  /** The selected tab's value: its row reads as selected. */
  value?: string;
  /** Called with a row's value when it is chosen. */
  onChange: (value: string) => void;
}

/**
 * The More tab's screen: a list of the tabs past the fourth.
 *
 * @example
 * ```
 * {tab === 'more' ? (
 *   <TabBarMoreList onChange={setTab}>{tabs}</TabBarMoreList>
 * ) : null}
 * <TabBar value={tab} onChange={setTab}>{tabs}</TabBar>
 * ```
 */
// The app passes TabBar's own children, so both agree on which tabs overflow.
export function TabBarMoreList({
  children,
  value,
  onChange,
  ...props
}: TabBarMoreListProps) {
  const t = useTranslator();
  return (
    <List aria-label={t('@astryx.tabBar.more')} hasDividers {...props}>
      {overflowItems(children).map(item => (
        <ListItem
          key={item.value}
          label={
            badgedName(item, t) == null ? (
              item.label
            ) : (
              // The row's name is one message with both, as the tab's is.
              <>
                <span aria-hidden>{item.label}</span>
                <VisuallyHidden>{badgedName(item, t)}</VisuallyHidden>
              </>
            )
          }
          startContent={item.icon}
          endContent={
            <>
              {hasBadge(item.badge) ? (
                <Badge variant="error" label={item.badge} aria-hidden />
              ) : null}
              {/* Right to left it points left, as Core's disclosure rows' do. */}
              <Icon icon="chevronRight" xstyle={rtlStyles.mirror} />
            </>
          }
          isSelected={item.value === value}
          isDisabled={isDisabledItem(item)}
          onClick={() => onChange(item.value)}
        />
      ))}
    </List>
  );
}
