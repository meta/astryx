// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file accessibleName.ts
 * @input A rendered element
 * @output The name an assistive technology reads for it, as far as the DOM
 *   gives it: `aria-labelledby` targets, `aria-label`, its own labels, an
 *   input button's value, its visible text (`aria-hidden` left out, an inner
 *   image's alt, `aria-label` or svg title counted), then `title`
 * @position Internal utility, not exported from the package: DropdownMenu
 *   names a menu after a custom trigger, and SideNav finds a re-rendered
 *   header or footer control again by name (`component:SideNav` AR3)
 */

/** Text an assistive technology reads from `element`, `aria-hidden` left out. */
function visibleText(element: Element): string {
  const copy = element.cloneNode(true) as Element;
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
 * labels this way.
 */
export function readAccessibleName(
  element: HTMLElement | null,
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
      .map(visibleText)
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
  const labelText = labels.map(visibleText).join(' ').trim();
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
  const text = visibleText(element);
  if (text !== '') {
    return text;
  }
  return element.getAttribute('title')?.trim() || undefined;
}
