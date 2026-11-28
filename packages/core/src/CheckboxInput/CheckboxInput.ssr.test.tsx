// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CheckboxInput.ssr.test.tsx
 * @input CheckboxInput server markup and React hydration
 * @output Proves a disabled checkbox's server markup names no missing
 *   description, that hydration adds no mismatch, and that the reason
 *   describes the input once the tooltip has loaded (`spec:AST-013` FR9;
 *   `component:CheckboxInput` FR4, FR6; `component:Tooltip` FR2)
 * @position SSR acceptance test for CheckboxInput
 */

import {act} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {CheckboxInput} from './CheckboxInput';

const REASON = 'Terms are managed by your administrator';

const tree = (
  <CheckboxInput
    label="Accept terms"
    value={false}
    onChange={() => {}}
    isDisabled
    disabledMessage={REASON}
  />
);

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('CheckboxInput server markup', () => {
  it('names no missing description in server markup: the tooltip loads on the client', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(tree);
    const input = container.querySelector('input[type="checkbox"]');
    const ids = input?.getAttribute('aria-describedby')?.split(' ') ?? [];
    for (const id of ids) {
      expect(container.querySelector(`[id="${id}"]`)).not.toBeNull();
    }
    expect(container.textContent).not.toContain(REASON);
  });

  it('hydrates with no mismatch, then the reason describes the input once the tooltip has loaded', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(tree);
    document.body.append(container);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onRecoverableError = vi.fn();
    await act(async () => {
      hydrateRoot(container, tree, {onRecoverableError});
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    // The test setup has loaded the tooltip, as a page has after first paint.
    expect(
      container.querySelector('input[type="checkbox"]'),
    ).toHaveAccessibleDescription(REASON);
  });
});
