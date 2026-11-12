// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useEntryAnimation example lets a user choose an animation preset and
 * dynamically mount or dismiss a validation notice that spreads the returned
 * StyleX entry style alongside component styles.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseEntryAnimationHookUsage from '../../assets/templates/blocks/components/Hooks/useEntryAnimationHookUsage';

// The node project does not compile StyleX. The mock captures stylex.props()
// arguments so the test can verify entryStyle is composed after initial paint.
const propsCalls = vi.hoisted(() => [] as unknown[][]);
vi.mock('@stylexjs/stylex', async importOriginal => ({
  ...(await importOriginal<object>()),
  create: <T,>(styles: T) => styles,
  keyframes: () => 'entry-keyframe',
  props: (...styles: unknown[]) => {
    propsCalls.push(styles);
    return {};
  },
}));

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

function renderExample(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseEntryAnimationHookUsage />);
  });
}

function findButton(label: string): HTMLButtonElement {
  const button = Array.from(
    container.querySelectorAll<HTMLButtonElement>('button'),
  ).find(item => item.textContent === label);
  if (!button) {
    throw new Error(`Expected button "${label}"`);
  }
  return button;
}

beforeEach(() => {
  propsCalls.length = 0;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
});

describe('useEntryAnimationHookUsage example', () => {
  it('mounts and dismisses the validation notice cleanly', () => {
    renderExample();

    expect(container.querySelector('[data-testid="entry-notice"]')).toBeNull();

    act(() => {
      findButton('Show notice').click();
    });

    const notice = container.querySelector<HTMLElement>(
      '[data-testid="entry-notice"]',
    );
    expect(notice).not.toBeNull();
    expect(notice?.textContent).toContain(
      'Mounted dynamically with the "slideDown" preset.',
    );

    act(() => {
      findButton('Dismiss notice').click();
    });

    expect(container.querySelector('[data-testid="entry-notice"]')).toBeNull();
  });

  it('switches animation preset and composes a non-null entryStyle after initial paint', async () => {
    renderExample();

    // Allow initial requestAnimationFrame paint gate in useEntryAnimation to settle.
    await act(async () => {
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => resolve()),
      );
    });

    act(() => {
      findButton('fadeIn').click();
    });
    expect(container.querySelector('[data-testid="entry-notice"]')).toBeNull();

    propsCalls.length = 0;
    act(() => {
      findButton('Show notice').click();
    });

    const notice = container.querySelector<HTMLElement>(
      '[data-testid="entry-notice"]',
    );
    expect(notice).not.toBeNull();
    expect(notice?.textContent).toContain(
      'Mounted dynamically with the "fadeIn" preset.',
    );
    const noticePropsCall = propsCalls.find(
      args => args.length === 2 && args[1] !== null && args[1] !== undefined,
    );
    expect(noticePropsCall).toBeDefined();
  });
});
