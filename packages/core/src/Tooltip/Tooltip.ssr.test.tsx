// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tooltip.ssr.test.tsx
 * @input Tooltip server markup and React hydration
 * @output Proves a closed Tooltip with block content inside a paragraph
 *   hydrates without a recoverable error or a console error, and that its
 *   trigger names its visually hidden description in server markup
 *   (component:Tooltip AR1, PR2)
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
  it('names its hidden description in server markup, after the trigger', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(tree);
    const trigger = container.querySelector('[tabindex="0"]');
    expect(trigger).not.toBeNull();
    const id = trigger?.getAttribute('aria-describedby') ?? '';
    expect(id).not.toBe('');
    const description = container.querySelector(`[id="${id}"]`);
    expect(description).toHaveTextContent(
      'Renews on the 1st. Cancel any time before then.',
    );
    expect(trigger?.contains(description)).toBe(false);
    expect(container.querySelector('[role="tooltip"]')).toBeNull();
    // The description holds the content's text, not its blocks, so the
    // browser's parser keeps the server markup as React rendered it.
    expect(container.querySelector('p div')).toBeNull();
  });

  it('hydrates block content inside a paragraph without a mismatch, and keeps the description', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(tree);
    document.body.appendChild(container);
    const serverId = container
      .querySelector('[tabindex="0"]')
      ?.getAttribute('aria-describedby');
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

    const trigger = container.querySelector('[tabindex="0"]') as HTMLElement;
    expect(trigger.getAttribute('aria-describedby')).toBe(serverId);
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
    // The server copy is empty, so no block breaks the paragraph.
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
