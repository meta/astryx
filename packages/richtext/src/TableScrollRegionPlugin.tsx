// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TableScrollRegionPlugin.tsx
 * @input Lexical's TableNode mutations, the scroll wrapper that TablePlugin's
 *   horizontal-scroll mode renders around each table, and core's translator
 *   for the region's name.
 * @output TableScrollRegionPlugin: gives each table's scroll wrapper the
 *   semantics of core Table's scroll region.
 * @position Internal to @astryxdesign/richtext; rendered by RichTextView only.
 *   The editor needs none of this: its caret scrolls a wide table, and a tab
 *   stop inside the editable surface would break Escape-then-Tab.
 */

import {useEffect} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {TableNode} from '@lexical/table';
import {useTranslator} from '@astryxdesign/core/i18n';

interface TrackedRegion {
  readonly wrapper: HTMLElement;
  readonly observer: ResizeObserver | null;
}

/** A tab stop only while the table is wider than its wrapper. */
function syncTabStop(wrapper: HTMLElement): void {
  if (wrapper.scrollWidth > wrapper.clientWidth) {
    wrapper.tabIndex = 0;
  } else {
    wrapper.removeAttribute('tabindex');
  }
}

/**
 * A read-only view has no caret, so nothing inside a wide table can scroll it
 * from the keyboard. Like core Table's scroll region, each table's wrapper is
 * a group named "Table" that takes a tab stop only while the table overflows
 * it; a table that fits adds no stop. The tab stop is explicit, so browsers
 * that do not make scroll containers focusable on their own still reach it.
 */
export function TableScrollRegionPlugin(): null {
  const [editor] = useLexicalComposerContext();
  const t = useTranslator();
  const label = t('@astryx.table.label');

  useEffect(() => {
    const regions = new Map<string, TrackedRegion>();

    const release = (key: string) => {
      regions.get(key)?.observer?.disconnect();
      regions.delete(key);
    };

    const track = (key: string) => {
      // With horizontal scroll active, a table node's DOM is its wrapper.
      const wrapper = editor.getElementByKey(key);
      if (!(wrapper instanceof HTMLDivElement)) {
        release(key);
        return;
      }
      if (regions.get(key)?.wrapper === wrapper) {
        syncTabStop(wrapper);
        return;
      }
      release(key);
      wrapper.setAttribute('role', 'group');
      wrapper.setAttribute('aria-label', label);
      let observer: ResizeObserver | null = null;
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => syncTabStop(wrapper));
        // The wrapper resizes with its container, the table with its content.
        observer.observe(wrapper);
        const table = wrapper.querySelector(':scope > table');
        if (table != null) {
          observer.observe(table);
        }
      }
      regions.set(key, {wrapper, observer});
      syncTabStop(wrapper);
    };

    const unregister = editor.registerMutationListener(
      TableNode,
      mutations => {
        for (const [key, mutation] of mutations) {
          if (mutation === 'destroyed') {
            release(key);
          } else {
            track(key);
          }
        }
      },
      {skipInitialization: false},
    );

    return () => {
      unregister();
      for (const key of [...regions.keys()]) {
        release(key);
      }
    };
  }, [editor, label]);

  return null;
}
