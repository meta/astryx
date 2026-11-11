// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useOutlineFromDOM.ts
 * @input Uses React, DOM heading queries, MutationObserver
 * @output Exports useOutlineFromDOM hook
 * @position Hook utility; consumed by applications and Outline examples
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Outline/Outline.doc.mjs
 * - /packages/core/src/Outline/index.ts
 */

import {useEffect, useState} from 'react';
import type {OutlineItem} from './types';

function collectOutlineItems(container: HTMLElement | null): OutlineItem[] {
  if (container == null) {
    return [];
  }

  return Array.from(container.querySelectorAll('h1,h2,h3,h4,h5,h6'))
    .map(heading => {
      const level = Number(heading.tagName.slice(1));
      const label = heading.textContent?.trim() ?? '';
      return {
        id: heading.id,
        label,
        level,
      };
    })
    .filter(item => item.id !== '' && item.label !== '');
}

/** Build outline items from h1-h6 elements inside a DOM container. */
export function useOutlineFromDOM(
  containerRef: React.RefObject<HTMLElement | null>,
): OutlineItem[] {
  const [items, setItems] = useState<OutlineItem[]>(() =>
    collectOutlineItems(containerRef.current),
  );

  // Syncs the outline items with the container's DOM through a
  // MutationObserver.
  useEffect(() => {
    const container = containerRef.current;
    setItems(collectOutlineItems(container));

    if (container == null || typeof MutationObserver === 'undefined') {
      return;
    }

    const observer = new MutationObserver(() => {
      setItems(collectOutlineItems(container));
    });
    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['id'],
    });

    return () => {
      observer.disconnect();
    };
  }, [containerRef]);

  return items;
}
