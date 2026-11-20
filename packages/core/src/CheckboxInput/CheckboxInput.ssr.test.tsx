// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CheckboxInput.ssr.test.tsx
 * @input CheckboxInput server markup and React hydration
 * @output Proves a disabled checkbox's reason describes it in the server
 *   markup, before the tooltip has mounted or shown, and that hydration adds
 *   no mismatch (`spec:AST-013` FR9; `component:CheckboxInput` FR4, FR6)
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
  it("names the disabled reason in the input's aria-describedby", () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(tree);
    const input = container.querySelector('input[type="checkbox"]');
    const ids = input?.getAttribute('aria-describedby')?.split(' ') ?? [];
    const described = ids.map(
      id => container.querySelector(`[id="${id}"]`)?.textContent,
    );
    expect(described).toContain(REASON);
  });

  it('hydrates with no mismatch', async () => {
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
  });
});
