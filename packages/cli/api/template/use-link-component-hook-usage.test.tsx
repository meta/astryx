// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useLinkComponent example's Article cards render their title link with
 * the component the hook resolves: the example's router link inside its
 * LinkProvider, a native anchor for as="a", and a native anchor outside any
 * provider.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import UseLinkComponentHookUsage from '../../assets/templates/blocks/components/Link/useLinkComponentHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

function link(title: string): HTMLAnchorElement {
  const anchor = Array.from(container.querySelectorAll('a')).find(
    candidate => candidate.textContent === title,
  );
  if (anchor == null) {
    throw new Error(`no link titled "${title}"`);
  }
  return anchor;
}

function location(): string {
  return (
    Array.from(container.querySelectorAll('span'))
      .find(span => span.textContent?.startsWith('Router location: '))
      ?.textContent?.slice('Router location: '.length) ?? ''
  );
}

/** Clicks the link and reports whether the browser would follow it. */
function click(anchor: HTMLAnchorElement): boolean {
  const event = new MouseEvent('click', {bubbles: true, cancelable: true});
  act(() => {
    anchor.dispatchEvent(event);
  });
  return !event.defaultPrevented;
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseLinkComponentHookUsage />);
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe('useLinkComponent example', () => {
  it("renders the provider's router link, which navigates without a page load", () => {
    expect(location()).toBe('/');
    const anchor = link('Getting started');
    expect(anchor.getAttribute('href')).toBe('/articles/getting-started');
    expect(click(anchor)).toBe(false);
    expect(location()).toBe('/articles/getting-started');
  });

  it('renders a native anchor for as="a", even inside the provider', () => {
    const anchor = link('Style guide (PDF)');
    expect(anchor.getAttribute('href')).toBe('#style-guide');
    expect(click(anchor)).toBe(true);
    expect(location()).toBe('/');
  });

  it('falls back to a native anchor outside the provider', () => {
    const anchor = link('Release notes');
    expect(anchor.getAttribute('href')).toBe('#release-notes');
    expect(click(anchor)).toBe(true);
    expect(location()).toBe('/');
  });
});
