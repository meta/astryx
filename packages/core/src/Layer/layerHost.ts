// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerHost.ts
 * @input Uses the layer's intended inline parent element
 * @output Exports resolveLayerPortalTarget, the corrective portal target
 * @position Layer utility; used by useLayer to place the popover in the DOM
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Layer/layerHost.test.ts
 */

/**
 * Ancestors a layer must not be hosted inside.
 *
 * Two overlapping reasons, both verified in Chrome:
 *
 * 1. The HTML parser owns server markup. `<p>` and the heading-ish elements
 *    take phrasing content only, so a block element inside one makes the
 *    parser close the paragraph and reparent the rest — the layer's content
 *    ends up in the page instead of the popover. A nested `<a>` triggers the
 *    same tearing through the adoption agency algorithm.
 * 2. Interactive ancestors capture the layer's own interactions. A card
 *    hosted inside an `<a>` or `<button>` puts its links and buttons inside
 *    that control: clicking one navigates the wrapping link, and every
 *    focusable in the card joins the control's own tab stop.
 *
 * Inline formatting elements are on the list for a third, milder reason: a
 * layer hosted in one inherits its typography (font-size, text-align), so a
 * card in a 13px centered paragraph renders 13px and centered.
 */
const UNSAFE_HOSTS = new Set([
  // Phrasing-content-only containers
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'dt',
  'pre',
  'legend',
  'data',
  'dfn',
  'meter',
  'output',
  'progress',
  'option',
  'optgroup',
  // Structural containers whose direct children are restricted. An inert
  // <template> marker is valid script-supporting content in these positions,
  // but the eventual div/span layer is not.
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'colgroup',
  'ul',
  'ol',
  'menu',
  'dl',
  'select',
  'datalist',
  'picture',
  'hgroup',
  'ruby',
  'rt',
  'rp',
  // Interactive containers
  'a',
  'button',
  'label',
  'summary',
  // Inline formatting context
  'span',
  'em',
  'strong',
  'b',
  'i',
  'u',
  's',
  'small',
  'mark',
  'code',
  'kbd',
  'samp',
  'var',
  'sub',
  'sup',
  'abbr',
  'cite',
  'q',
  'time',
  'bdi',
  'bdo',
  'ins',
  'del',
]);

/**
 * Return the corrective portal target for a layer's intended inline parent.
 *
 * A null result means the inline parent and all of its ancestors are safe, so
 * the layer should stay at its JSX position. Otherwise the result is the
 * nearest element outside every unsafe ancestor around that position.
 *
 * Walking up from the actual render position (rather than the trigger, or
 * portaling to `document.body`) keeps the two things a layer inherits there:
 *
 * - **Theme.** Theme scopes live on DOM ancestors. Staying as close as
 *   possible to the intended render position preserves their component rules
 *   and custom properties; `document.body` may sit outside a nested scope.
 * - **Tab order.** Sequential focus follows DOM order, so a host near the
 *   trigger keeps the layer's focusables next to it. (`show()` also passes
 *   the trigger as the popover's invoker `source`, which pins focus order to
 *   the invoker in browsers that support it.)
 *
 * The outermost unsafe ancestor matters up to the nearest native dialog. A safe
 * div may itself sit inside an anchor; stopping at that div would still put the
 * layer's buttons inside the link. A dialog is the opposite boundary: portaling
 * beyond it removes the layer from the browser's modal top layer and makes the
 * layer inert. Walking the chain within that boundary keeps the target outside
 * every relevant unsafe ancestor and inside its nearest dialog.
 */
export function resolveLayerPortalTarget(
  inlineParent: HTMLElement | null,
): HTMLElement | null {
  if (!inlineParent) {
    return null;
  }

  let outermostUnsafe: HTMLElement | null = null;
  let node: HTMLElement | null = inlineParent;
  while (node) {
    const tagName = node.tagName.toLowerCase();
    if (tagName === 'dialog') {
      break;
    }
    if (UNSAFE_HOSTS.has(tagName)) {
      outermostUnsafe = node;
    }
    node = node.parentElement;
  }

  return outermostUnsafe?.parentElement ?? null;
}
