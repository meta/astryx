// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file topNavDrawerItems.ts
 * @input A top nav slot's React node
 * @output Whether that top nav has items of its own for the phone drawer
 * @position Internal to AppShell and TopNav. AppShell reads it to tell an
 *   empty drawer without importing TopNav, so a page with AppShell alone
 *   loads no TopNav code.
 */

import {isValidElement, type ReactNode} from 'react';
import {isRenderable} from '../utils/isRenderable';

interface TopNavSlotProps {
  startContent?: ReactNode;
  children?: ReactNode;
  centerContent?: ReactNode;
}

// TopNav adds itself when its module loads, so a TopNav element can only
// exist once its type is here.
const topNavTypes = new WeakSet<object>();

/** Records `type` as the TopNav component. Called once, by TopNav's module. */
export function markTopNavType(type: object): void {
  topNavTypes.add(type);
}

/**
 * Whether a top nav element has items of its own to put in the phone drawer,
 * read from its props during render. A slot that is not a TopNav element
 * counts as having items.
 */
export function topNavHasDrawerItems(topNav: ReactNode): boolean {
  if (
    !isValidElement<TopNavSlotProps>(topNav) ||
    typeof topNav.type === 'string' ||
    !topNavTypes.has(topNav.type)
  ) {
    return true;
  }
  const {startContent, children, centerContent} = topNav.props;
  return isRenderable(startContent ?? children) || isRenderable(centerContent);
}
