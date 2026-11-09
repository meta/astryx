// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContextMenu.triggerProps.test.tsx
 * @input vitest, @testing-library/react, ContextMenu
 * @output A guard that the trigger element receives only DOM props: React
 *   warns about nothing, and no hook-internal function lands on it.
 * @position Testing; validates ContextMenu.tsx. Its own file on purpose: React
 *   warns about an unknown DOM prop once per module, so this case must be the
 *   first ContextMenu render of its file to see the warning at all.
 */
import {describe, expect, it, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import {ContextMenu} from './ContextMenu';

describe('ContextMenu trigger element', () => {
  it('receives only DOM props: no React warning, no long-press API on it', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    try {
      render(
        <>
          <ContextMenu items={[{label: 'Cut'}]} data-testid="block">
            <div>Right-click me</div>
          </ContextMenu>
          <p>
            Filed under{' '}
            <ContextMenu
              items={[{label: 'Copy'}]}
              triggerAs="span"
              data-testid="inline">
              a reference
            </ContextMenu>
          </p>
        </>,
      );
      const messages = consoleError.mock.calls.map(args =>
        args.map(String).join(' '),
      );
      expect(messages).toEqual([]);
      for (const trigger of [
        screen.getByTestId('block'),
        screen.getByTestId('inline'),
      ]) {
        for (const name of ['start', 'moveto', 'cancel']) {
          expect(trigger).not.toHaveAttribute(name);
        }
      }
    } finally {
      consoleError.mockRestore();
    }
  });
});
