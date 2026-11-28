// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tooltip.ssr.test.tsx
 * @input Tooltip server markup and React hydration
 * @output Proves a closed Tooltip with block content inside a paragraph
 *   hydrates without a recoverable error or a console error, that its server
 *   markup carries no description reference, copy or layer, and that the
 *   trigger names its hidden description once the tooltip has loaded
 *   (component:Tooltip FR2, AR1, PR2)
 * @position SSR acceptance test for Tooltip
 */

import {act} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {Tooltip} from './Tooltip';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

/** Tooltip content that a component renders, with a block inside. */
function Reactions() {
  return (
    <div>
      <strong>Ada</strong> and <strong>Grace</strong> reacted
    </div>
  );
}

const componentTree = (
  <p>
    Thanks! <Tooltip content={<Reactions />}>Reactions</Tooltip>
  </p>
);

const tree = (
  <p>
    Your plan renews monthly.{' '}
    <Tooltip
      content={
        <div>
          <strong>Renews on the 1st.</strong>
          <div>Cancel any time before then.</div>
        </div>
      }>
      Details
    </Tooltip>
  </p>
);

describe('Tooltip server render', () => {
  it('carries no description reference, copy or layer in server markup: the tooltip loads on the client', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(tree);
    const trigger = container.querySelector('[tabindex="0"]');
    expect(trigger).not.toBeNull();
    expect(trigger).not.toHaveAttribute('aria-describedby');
    expect(container.querySelector('[id$="-description"]')).toBeNull();
    expect(container.querySelector('[role="tooltip"]')).toBeNull();
    // No block from the content breaks the paragraph.
    expect(container.querySelector('p div')).toBeNull();
  });

  it('hydrates block content inside a paragraph without a mismatch, then names the hidden copy once the tooltip has loaded', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(tree);
    document.body.appendChild(container);
    const logged = vi.spyOn(console, 'error');
    const recoverableErrors: unknown[] = [];
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, tree, {
        onRecoverableError: error => recoverableErrors.push(error),
      });
    });
    expect(recoverableErrors).toEqual([]);
    expect(logged).not.toHaveBeenCalled();

    // The test setup has loaded the tooltip, as a page has after first paint.
    const trigger = container.querySelector('[tabindex="0"]') as HTMLElement;
    const id = trigger.getAttribute('aria-describedby') ?? '';
    expect(container.querySelector(`[id="${id}"]`)).toHaveAttribute('hidden');
    expect(trigger).toHaveAccessibleDescription(
      'Renews on the 1st. Cancel any time before then.',
    );
    act(() => {
      root.unmount();
    });
  });

  it('hydrates component content inside a paragraph without a mismatch, then describes the trigger with its text', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(componentTree);
    // The server markup has no copy, so no block breaks the paragraph.
    expect(container.querySelector('p div')).toBeNull();
    document.body.appendChild(container);
    const logged = vi.spyOn(console, 'error');
    const recoverableErrors: unknown[] = [];
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, componentTree, {
        onRecoverableError: error => recoverableErrors.push(error),
      });
    });
    expect(recoverableErrors).toEqual([]);
    expect(logged).not.toHaveBeenCalled();
    const trigger = container.querySelector('[tabindex="0"]') as HTMLElement;
    expect(trigger).toHaveAccessibleDescription('Ada and Grace reacted');
    act(() => {
      root.unmount();
    });
  });
});
