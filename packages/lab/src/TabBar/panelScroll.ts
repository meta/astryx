// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file panelScroll.ts
 * @input A tab's panel id, the document the bar lives in, and Core's scroll
 *   test from its internal touch entry
 * @output scrollPanelToTop, which brings the tab's own scroll area to its top,
 *   and panelScrollArea, which finds that area
 * @position Internal to the lab TabBar (TabBar.tsx): the selected tab chosen
 *   again
 */

import {measureLogicalScrollAxis} from '@astryxdesign/core/internal/touch';

/**
 * The vertical axis as Core's logical scroll test reads it: in a horizontal
 * mapping, the block axis is the vertical one.
 */
const VERTICAL = {
  inline: 'x',
  block: 'y',
  inlineReversed: false,
  blockReversed: false,
} as const;

/**
 * The tab's own scroll area: the panel itself when it scrolls vertically.
 * Otherwise it is the first element inside the panel that does. Core's test
 * decides, so a row that overflows by a pixel or less, or only sideways, is
 * never taken.
 */
export function panelScrollArea(panel: HTMLElement): HTMLElement | null {
  const walker = panel.ownerDocument.createTreeWalker(
    panel,
    NodeFilter.SHOW_ELEMENT,
  );
  for (let node: Node | null = panel; node != null; node = walker.nextNode()) {
    const element = node as HTMLElement;
    if (measureLogicalScrollAxis(element, 'block', VERTICAL)?.isScrollable) {
      return element;
    }
  }
  return null;
}

/**
 * Brings the scroll area of the panel `panelId` names back to its top, as iOS
 * does when the selected tab is chosen again. No other scroller moves. The
 * area glides there, and under Reduce Motion it jumps.
 */
export function scrollPanelToTop(
  document: Document,
  panelId: string | undefined,
): void {
  const panel = panelId == null ? null : document.getElementById(panelId);
  const area = panel == null ? null : panelScrollArea(panel);
  if (area == null || area.scrollTop === 0) {
    return;
  }
  const isReduced =
    document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')
      .matches ?? false;
  area.scrollTo({top: 0, behavior: isReduced ? 'instant' : 'smooth'});
}
