// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ContextMenuTrigger.tsx
 * @input React, StyleX, mergeProps
 * @output ContextMenuTrigger, the right-click target and its 1px cursor anchor
 * @position ContextMenu renders it around its children; Table cells render it
 * before their lazily loaded menu arrives. It imports no menu code.
 */

import type {ComponentPropsWithoutRef, ReactNode, Ref} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {StyleXStyles} from '../theme/types';
import {mergeProps} from '../utils/mergeProps';

const styles = stylex.create({
  // The trigger suppresses the iOS long-press callout and text selection, so
  // a long press opens the menu. `position: relative` makes it the containing
  // block of the cursor anchor, so the anchor scrolls with the trigger.
  trigger: {
    position: 'relative',
    WebkitTouchCallout: 'none',
    WebkitUserSelect: 'none',
    userSelect: 'none',
  },
  // The menu anchors to this 1px box at the cursor point. So it follows
  // the content on scroll and flips at viewport edges.
  // It owns a box because WebKit counts an empty anchor box as clipped, and
  // the default `position-visibility: anchors-visible` then hides the menu.
  cursorAnchor: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    pointerEvents: 'none',
  },
});

const ORIGIN = {x: 0, y: 0};

type TriggerDOMProps = Omit<
  ComponentPropsWithoutRef<'div'>,
  'children' | 'className' | 'style'
>;

export interface ContextMenuTriggerProps extends TriggerDOMProps {
  /** `div` is a block; `span` keeps an inline reference in the text flow. */
  as?: 'div' | 'span';
  ref?: Ref<HTMLElement>;
  anchorRef?: Ref<HTMLSpanElement>;
  /** The cursor anchor's offset inside the trigger. */
  anchorPoint?: {x: number; y: number};
  xstyle?: StyleXStyles | StyleXStyles[];
  children: ReactNode;
}

export function ContextMenuTrigger({
  as = 'div',
  ref,
  anchorRef,
  anchorPoint = ORIGIN,
  xstyle,
  children,
  ...domProps
}: ContextMenuTriggerProps): ReactNode {
  const Element = as === 'div' ? 'div' : 'span';
  return (
    <Element
      ref={ref as Ref<HTMLDivElement & HTMLSpanElement>}
      {...domProps}
      {...stylex.props(
        styles.trigger,
        ...(xstyle ? (Array.isArray(xstyle) ? xstyle : [xstyle]) : []),
      )}>
      {children}
      <span
        ref={anchorRef}
        aria-hidden="true"
        {...mergeProps(stylex.props(styles.cursorAnchor), {
          style: {left: `${anchorPoint.x}px`, top: `${anchorPoint.y}px`},
        })}
      />
    </Element>
  );
}
