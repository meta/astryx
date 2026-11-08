// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Button.a11y.harnesses.tsx
 * @input Uses SideNavCollapseButton
 * @output The small consumer-side wiring some binding states need in order to
 *   be rendered at all.
 * @position Kept beside the state table rather than inside it, so a row stays a
 *   description of a state rather than a place stateful wiring accumulates.
 *
 * Carries the client directive because it holds state, like any component that
 * does — the repository's `check:use-client` gate applies to every file under
 * core's source, test infrastructure included.
 */

import {useState, type ReactNode} from 'react';
import {SideNavCollapseButton} from '../../SideNav/SideNavCollapseButton';

/**
 * The collapse control is controlled, so rendering one means owning its state.
 * This is the consumer's own wiring, and it is what the component is designed
 * to be given — a binding that pinned `isCollapsed` would be testing a control
 * nobody ships.
 */
export function CollapseHarness({
  label,
  onActivate,
}: {
  label?: string;
  onActivate: () => void;
}): ReactNode {
  const [isCollapsed, setIsCollapsed] = useState(false);
  return (
    <SideNavCollapseButton
      label={label}
      collapsible={{
        isCollapsed,
        onCollapsedChange: next => {
          setIsCollapsed(next);
          onActivate();
        },
      }}
    />
  );
}
