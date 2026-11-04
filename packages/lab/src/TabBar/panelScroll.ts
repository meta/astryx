// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file panelScroll.ts
 * @input A tab's panel id and the document the bar lives in
 * @output scrollPanelToTop, which brings the tab's own scroll area to its top,
 *   and panelScrollArea, which finds that area
 * @position Internal to the lab TabBar (TabBar.tsx): the selected tab chosen
 *   again
 */

/**
 * The tab's own scroll area: the panel itself when it scrolls vertically.
 * Otherwise it is the first element inside the panel that does. A row that
 * scrolls only sideways computes `overflow-y: auto` too, so the content must
 * also be taller than the element.
 */
export function panelScrollArea(panel: HTMLElement): HTMLElement | null {
  const view = panel.ownerDocument.defaultView;
  if (view == null) {
    return null;
  }
  const walker = panel.ownerDocument.createTreeWalker(
    panel,
    NodeFilter.SHOW_ELEMENT,
  );
  for (let node: Node | null = panel; node != null; node = walker.nextNode()) {
    const element = node as HTMLElement;
    const {overflowY} = view.getComputedStyle(element);
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      element.scrollHeight > element.clientHeight
    ) {
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
