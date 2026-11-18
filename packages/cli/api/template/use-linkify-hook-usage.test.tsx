// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useLinkify example turns plain-text comments into mixed text and links:
 * the URL and the email each become a Link, the #123/#456 references become
 * tracker links via the custom pattern, and the comment without matches
 * renders no link at all.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseLinkifyHookUsage from '../../assets/templates/blocks/components/Link/useLinkifyHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
});

describe('useLinkifyHookUsage example', () => {
  it('links URLs, emails and issue references in plain comments', () => {
    root = createRoot(container);
    act(() => root!.render(<UseLinkifyHookUsage />));

    const links = Array.from(
      container.querySelectorAll('a'),
    ) as Array<HTMLAnchorElement>;
    const hrefs = links.map(link => link.getAttribute('href') ?? '');

    // Built-in URL detection, external.
    expect(hrefs).toContain('https://example.com/spec');
    // Built-in email detection, mailto.
    expect(hrefs).toContain('mailto:support@example.com');
    // Custom issue pattern: capture group mapped onto the tracker scheme.
    expect(hrefs).toContain('https://example.com/issues/123');
    expect(hrefs).toContain('https://example.com/issues/456');

    // Exactly the four detected links, nothing more: the plain comment adds none.
    expect(links).toHaveLength(4);
  });
});
