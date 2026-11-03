// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TabBarMoreList.tsx
 * @input React, core's List and Icon, core i18n, and TabBar.tsx's tab
 *   reading (`overflowItems`)
 * @output Exports TabBarMoreList: the More tab's screen, a list of the tabs
 *   past the fourth (UIKit's `UIMoreListController`)
 * @position Lab component beside TabBar (packages/lab/src/TabBar)
 *
 * SYNC: When modified, update TabBar.doc.mjs, TabBar.test.tsx and
 * __tests__/TabBar.interaction.browser.spec.ts.
 */

import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '@astryxdesign/core';
import {useTranslator} from '@astryxdesign/core/i18n';
import {Icon} from '@astryxdesign/core/Icon';
import {List, ListItem} from '@astryxdesign/core/List';
import {
  colorVars,
  fontWeightVars,
  radiusVars,
  typographyVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {rtlStyles} from '@astryxdesign/core/utils';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';
import {badgedName, hasBadge, overflowItems} from './TabBar';

const styles = stylex.create({
  // A tab's badge, beside the row's chevron, as iOS's More list shows it.
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    minWidth: 20,
    height: 20,
    paddingInline: 6,
    marginInlineEnd: 8,
    borderRadius: radiusVars['--radius-full'],
    whiteSpace: 'nowrap',
    fontFamily: typographyVars['--font-family-body'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    fontSize: 13,
    fontVariantNumeric: 'tabular-nums',
    backgroundColor: colorVars['--color-error'],
    color: colorVars['--color-on-error'],
  },
});

export interface TabBarMoreListProps extends Omit<
  BaseProps<HTMLElement>,
  'onChange'
> {
  /** The same `TabBarItem` elements given to TabBar. */
  children: ReactNode;
  /** The selected tab's value: its row reads as selected. */
  value?: string;
  /** Called with a row's value when it is chosen. */
  onChoose: (value: string) => void;
}

/**
 * The More tab's screen: a list of the tabs past the fourth.
 *
 * @example
 * ```
 * {tab === 'more' ? (
 *   <TabBarMoreList onChoose={setTab}>{tabs}</TabBarMoreList>
 * ) : null}
 * <TabBar value={tab} onChange={setTab}>{tabs}</TabBar>
 * ```
 */
/*
 * WHAT IT DRAWS
 *
 * With more than five tabs, TabBar shows the first four and a More tab. This is
 * what More shows: one row per remaining tab, its icon, its label and a
 * disclosure chevron (mirrored right to left), in order. Choosing a row hands
 * its value to the app, which shows that section inside More's own navigation
 * stack (back to "More"). TabBar keeps More selected meanwhile, as iOS does.
 * The app passes the same TabBarItem children it gives TabBar, so the two agree
 * on which tabs overflow.
 *
 * Not here: iOS's Edit, which rearranges the tabs by dragging them onto the
 * bar.
 */
export function TabBarMoreList({
  children,
  value,
  onChoose,
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
                <span aria-hidden {...stylex.props(styles.badge)}>
                  {item.badge}
                </span>
              ) : null}
              {/* Right to left it points left, as Core's disclosure rows' do. */}
              <Icon icon="chevronRight" xstyle={rtlStyles.mirror} />
            </>
          }
          isSelected={item.value === value}
          isDisabled={item.isDisabled}
          onClick={() => onChoose(item.value)}
        />
      ))}
    </List>
  );
}
