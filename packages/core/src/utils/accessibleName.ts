// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file accessibleName.ts
 * @input A rendered element
 * @output The name an assistive technology reads for it, as far as the DOM
 *   gives it: `aria-labelledby` targets, `aria-label`, its own labels, an
 *   input button's value, its visible text (`aria-hidden` left out, an inner
 *   image's alt, `aria-label` or svg title counted), then `title`
 * @position Internal utility, not exported from the package: DropdownMenu
 *   names a menu after a custom trigger, SideNav finds a re-rendered header
 *   or footer control again by name (`component:SideNav` AR3), and
 *   reorderable attach names each item without its handle
 */

/** Where `node` sits under `root`: each ancestor's child index, root first. */
function pathTo(root: Element, node: Element): number[] | null {
  const path: number[] = [];
  let current: Element | null = node;
  while (current != null && current !== root) {
    const parent: Element | null = current.parentElement;
    if (parent == null) {
      return null;
    }
    path.unshift(Array.prototype.indexOf.call(parent.children, current));
    current = parent;
  }
  return current === root ? path : null;
}

/**
 * Text an assistive technology reads from `element`, `aria-hidden` left out,
 * and `exclude`'s subtree left out when it is inside `element`.
 */
function visibleText(element: Element, exclude?: Element | null): string {
  const copy = element.cloneNode(true) as Element;
  const path = exclude == null ? null : pathTo(element, exclude);
  if (path != null && path.length > 0) {
    let excluded: Element | undefined = copy;
    for (const index of path) {
      excluded = excluded?.children[index];
    }
    excluded?.remove();
  }
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) {
    hidden.remove();
  }
  // An icon-only control is named by its image's alt, an inner aria-label, or
  // an svg title rather than by text, so those count as its contents too.
  for (const named of copy.querySelectorAll('img[alt], [aria-label]')) {
    const name =
      named.getAttribute(named.tagName === 'IMG' ? 'alt' : 'aria-label') ?? '';
    named.replaceWith(copy.ownerDocument.createTextNode(` ${name} `));
  }
  for (const svg of copy.querySelectorAll('svg')) {
    const title = svg.querySelector('title')?.textContent ?? '';
    svg.replaceWith(copy.ownerDocument.createTextNode(` ${title} `));
  }
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * The accessible name of `element`: its own `aria-labelledby` targets, its
 * `aria-label`, its labels, an input button's value, its text, or its
 * `title`, in that order. A custom DropdownMenu trigger names the menu it
 * labels this way. `exclude`'s subtree is left out of the text, so a row is
 * named without the control inside it.
 */
export function readAccessibleName(
  element: HTMLElement | null,
  {exclude}: {exclude?: Element | null} = {},
): string | undefined {
  if (element == null) {
    return undefined;
  }
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy != null && labelledBy.trim() !== '') {
    const text = labelledBy
      .split(/\s+/)
      .map(id => element.ownerDocument.getElementById(id))
      .filter((node): node is HTMLElement => node != null)
      .map(node => visibleText(node))
      .join(' ')
      .trim();
    if (text !== '') {
      return text;
    }
  }
  const label = element.getAttribute('aria-label')?.trim();
  if (label) {
    return label;
  }
  // A form control is named by its own <label>s; an input button by its value.
  const labels =
    'labels' in element
      ? Array.from((element as HTMLInputElement).labels ?? [])
      : [];
  const labelText = labels
    .map(node => visibleText(node))
    .join(' ')
    .trim();
  if (labelText !== '') {
    return labelText;
  }
  if (
    element instanceof HTMLInputElement &&
    ['button', 'submit', 'reset'].includes(element.getAttribute('type') ?? '')
  ) {
    const value = element.value.trim();
    if (value !== '') {
      return value;
    }
  }
  const text = visibleText(element, exclude);
  if (text !== '') {
    return text;
  }
  return element.getAttribute('title')?.trim() || undefined;
}
