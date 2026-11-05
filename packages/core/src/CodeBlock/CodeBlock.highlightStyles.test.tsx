// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CodeBlock.highlightStyles.test.tsx
 * @input Uses vitest, @testing-library/react, CodeBlock, a mocked CSS Custom Highlight API
 * @output Tests that the ::highlight() rules exist before a commit's layout effects run
 * @position Performance regression evidence. Rules inserted after layout
 *   effects make the browser restyle the whole document a second time once
 *   any layout effect has read style, so their insertion point is pinned here.
 */

import {useLayoutEffect} from 'react';
import {cleanup, render} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

class MockHighlight extends Set<Range> {}
const realCss = globalThis.CSS;

const STYLE_SELECTOR = 'style[data-astryx-highlight-styles]';

beforeEach(() => {
  // A fresh module instance, so the once-per-document insertion flag starts
  // unset in every test.
  vi.resetModules();
  document.head.querySelectorAll(STYLE_SELECTOR).forEach(el => el.remove());
  const highlights = new Map<string, MockHighlight>();
  globalThis.CSS = {
    escape: realCss.escape,
    highlights: {
      get: (name: string) => highlights.get(name),
      set: (name: string, h: MockHighlight) => highlights.set(name, h),
    } as unknown as HighlightRegistry,
  } as typeof CSS;
  vi.stubGlobal('Highlight', MockHighlight);
});

afterEach(() => {
  cleanup();
  globalThis.CSS = realCss;
  vi.unstubAllGlobals();
});

describe('CodeBlock ::highlight() rules', () => {
  it('are in the document before layout effects in the same commit run', async () => {
    const {CodeBlock} = await import('./CodeBlock');
    const seen: boolean[] = [];
    function LayoutReader() {
      useLayoutEffect(() => {
        seen.push(document.head.querySelector(STYLE_SELECTOR) != null);
      }, []);
      return null;
    }
    render(
      <>
        <CodeBlock code="const a = 1;" language="ts" highlightMode="ranges" />
        <LayoutReader />
      </>,
    );
    expect(seen).toEqual([true]);
  });

  it('are inserted once for many code blocks', async () => {
    const {CodeBlock} = await import('./CodeBlock');
    render(
      <>
        {Array.from({length: 20}, (_, i) => (
          <CodeBlock
            key={i}
            code={`const v${i} = ${i};`}
            language="ts"
            highlightMode="ranges"
          />
        ))}
      </>,
    );
    expect(document.head.querySelectorAll(STYLE_SELECTOR)).toHaveLength(1);
  });

  it('are not inserted by range highlighting without the Highlight API', async () => {
    vi.stubGlobal('Highlight', undefined);
    const {CodeBlock} = await import('./CodeBlock');
    render(
      <CodeBlock code="const a = 1;" language="ts" highlightMode="ranges" />,
    );
    expect(document.head.querySelector(STYLE_SELECTOR)).toBeNull();
  });
});
