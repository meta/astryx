// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useInteractiveRole example renders one Tile component four ways and the
 * hook alone decides the element: href → an anchor, onClick → a button, no
 * props inside Popover → a button through the trigger context, and no props
 * anywhere → inert content with no interactive element.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseInteractiveRoleHookUsage from '../../assets/templates/blocks/components/Hooks/useInteractiveRoleHookUsage';

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

describe('useInteractiveRoleHookUsage example', () => {
  it('resolves the element from the inputs: link, button, context button, inert', () => {
    root = createRoot(container);
    act(() => root!.render(<UseInteractiveRoleHookUsage />));

    const anchors = Array.from(container.querySelectorAll('a'));
    const buttons = Array.from(container.querySelectorAll('button'));

    // href → an anchor to the docs URL.
    expect(
      anchors.some(a => a.getAttribute('href') === 'https://example.com/docs'),
    ).toBe(true);

    // onClick → a real button; Popover context → a real button. Exactly two.
    const tileButtons = buttons.filter(b =>
      ['Renders as a button', 'Trigger via context'].includes(
        b.textContent ?? '',
      ),
    );
    expect(tileButtons).toHaveLength(2);

    // The plain tile renders no interactive element around its card.
    const plain = Array.from(container.querySelectorAll('*')).find(
      el => el.textContent === 'Plain content',
    );
    expect(plain).toBeDefined();
    expect(plain!.closest('a, button')).toBeNull();
  });
});
