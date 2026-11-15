// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tooltip.ssr.test.tsx
 * @input Tooltip server markup and React hydration
 * @output Proves a closed Tooltip with block content inside a paragraph
 *   hydrates without a recoverable error or a console error, and that its
 *   trigger names a hidden description only once the client renders it
 *   (component:Tooltip FR2, PR2)
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
  it('names no description in server markup, so no reference dangles', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(tree);
    const trigger = container.querySelector('[tabindex="0"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.hasAttribute('aria-describedby')).toBe(false);
    expect(container.querySelector('[role="tooltip"]')).toBeNull();
    // The block content stays out of the paragraph, so the browser's parser
    // keeps the server markup as React rendered it.
    expect(container.querySelector('p div')).toBeNull();
  });

  it('hydrates block content inside a paragraph without a mismatch, then describes the trigger', async () => {
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

    const trigger = container.querySelector('[tabindex="0"]') as HTMLElement;
    const id = trigger.getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    const description = document.getElementById(id as string);
    expect(description).toHaveTextContent(
      'Renews on the 1st.Cancel any time before then.',
    );
    expect(container.contains(description)).toBe(false);
    act(() => {
      root.unmount();
    });
  });
});
