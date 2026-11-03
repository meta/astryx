// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useMenuOverflow.ts
 * @input Menu element ref, rendered content, open state, and optionally the
 *   overflow its owner expects from the content alone
 * @output Returns whether the open menu overflows its block-size constraint
 * @position Shared responsive helper for DropdownMenu and DropdownMenuSubMenu
 */

import {
  useCallback,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';

/**
 * Detect block-axis overflow without making a fitting menu a scroll container.
 *
 * `expectedOverflow` is the answer the owner can give before any measure (a
 * long option list cannot fit). Until a measure of the same `content` says
 * otherwise, it is the result, so the first open already renders the right
 * class: a class that flips after the open measure restyles the whole list
 * a second time. A measure still runs on every open and corrects a wrong
 * guess.
 */
export function useMenuOverflow(
  menuRef: RefObject<HTMLElement | null>,
  content: ReactNode,
  isOpen: boolean,
  expectedOverflow?: boolean,
): boolean {
  // The content each measure stands for, kept only for an owner that gives
  // an expected answer (a caller whose content is a new element on every
  // render compares nothing); set before the measuring effects run.
  const contentRef = useRef<ReactNode>(null);
  useIsomorphicLayoutEffect(() => {
    contentRef.current = expectedOverflow === undefined ? null : content;
  });
  const [measured, setMeasured] = useState<{
    content: ReactNode;
    hasOverflow: boolean;
  } | null>(null);

  const measureOverflow = useCallback(() => {
    const menu = menuRef.current;
    if (!menu) {
      return;
    }
    const hasOverflow = menu.scrollHeight > menu.clientHeight + 1;
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- DOM overflow measurement controls whether this menu becomes a scroll container
    setMeasured(current =>
      current != null &&
      current.hasOverflow === hasOverflow &&
      Object.is(current.content, contentRef.current)
        ? current
        : {content: contentRef.current, hasOverflow},
    );
  }, [menuRef]);

  useIsomorphicLayoutEffect(() => {
    if (!isOpen) {
      return;
    }
    const menu = menuRef.current;
    if (!menu) {
      return;
    }
    measureOverflow();
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measureOverflow);
    const mutationObserver =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(measureOverflow);
    resizeObserver?.observe(menu);
    mutationObserver?.observe(menu, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    menu.addEventListener('load', measureOverflow, true);
    window.addEventListener('resize', measureOverflow);
    window.visualViewport?.addEventListener('resize', measureOverflow);
    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      menu.removeEventListener('load', measureOverflow, true);
      window.removeEventListener('resize', measureOverflow);
      window.visualViewport?.removeEventListener('resize', measureOverflow);
    };
  }, [isOpen, measureOverflow, menuRef]);

  useIsomorphicLayoutEffect(() => {
    if (isOpen) {
      measureOverflow();
    }
  }, [content, isOpen, measureOverflow]);

  if (expectedOverflow === undefined) {
    return measured?.hasOverflow ?? false;
  }
  return measured != null && Object.is(measured.content, content)
    ? measured.hasOverflow
    : expectedOverflow;
}
