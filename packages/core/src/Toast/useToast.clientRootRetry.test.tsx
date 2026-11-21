// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useToast.clientRootRetry.test.tsx
 * @input useToast with no LayerProvider, where the first load of
 *   react-dom/client fails and the next one succeeds
 * @output Proves that a failed load of the fallback viewport does not turn
 *   fallback toasts off: it reports the failure, and the next toast loads the
 *   viewport again and shows
 * @position Unit test for useToast.tsx's deferred fallback viewport
 */

import {act, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {useToast} from './useToast';

const loads = vi.hoisted(() => ({count: 0}));

vi.mock('react-dom/client', async importOriginal => {
  loads.count += 1;
  if (loads.count === 1) {
    throw new Error('react-dom/client did not load');
  }
  return importOriginal();
});

function ShowButtons() {
  const toast = useToast();
  return (
    <>
      <button type="button" onClick={() => toast({body: 'First toast'})}>
        First
      </button>
      <button type="button" onClick={() => toast({body: 'Second toast'})}>
        Second
      </button>
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useToast fallback viewport load', () => {
  it('reports a failed load, and the next toast loads the viewport again', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<ShowButtons />);

    await act(async () => {
      screen.getByRole('button', {name: 'First'}).click();
    });
    await vi.waitFor(() =>
      expect(
        consoleError.mock.calls.some(call =>
          String(call[0]).includes('did not load'),
        ),
      ).toBe(true),
    );
    expect(document.querySelector('[data-astryx-toast-fallback]')).toBeNull();
    expect(screen.queryByText('First toast')).toBeNull();

    await act(async () => {
      screen.getByRole('button', {name: 'Second'}).click();
    });
    expect(await screen.findByText('Second toast')).toBeInTheDocument();
    expect(loads.count).toBe(2);
  });
});
